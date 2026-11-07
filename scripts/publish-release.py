# -*- coding: utf-8 -*-
"""
发布 Release 并上传安装包，上传后回查确认成功。

用法：
    python scripts/publish-release.py

依赖：仓库根目录 .env 中的 GITHUB_TOKEN（需要 repo 权限）。
说明：本机 TLS 拦截代理会让 Python urllib 直连 api.github.com 报 SSL EOF，
      所有 HTTP 调用统一走系统 curl（与 push-api.py 一致），响应体写临时文件再解析。
"""
import io
import json
import os
import re
import subprocess
import sys
import tempfile

# 强制 UTF-8 输出：Windows 下 Python 默认 stdout 为 cp1252，含中文的打印会抛
# UnicodeEncodeError；仅影响日志编码，不改变产物。
for _s in (sys.stdout, sys.stderr):
    if _s is not None and hasattr(_s, 'reconfigure'):
        try:
            _s.reconfigure(encoding='utf-8')
        except Exception:
            pass

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
REPO = 'byazlle/human-design-tool'


def _read_version() -> str:
    with open(os.path.join(ROOT, 'package.json'), encoding='utf-8') as fh:
        return json.load(fh)['version']


VERSION = _read_version()
TAG = f'v{VERSION}'
TITLE = f'v{VERSION} · 人类图排盘（桌面 + 安卓）'
BRANCH = 'main'

ARTIFACTS = [
    (f'release/desktop/HumanDesign-Setup-{VERSION}.exe', 'application/octet-stream'),
    (f'release/android/HumanDesign-{VERSION}.apk', 'application/vnd.android.package-archive'),
]

BODY = f"""## v{VERSION} 本次更新

**AI 解读**

- 三档解读：精简 / 详细 / 完整；提示词版本升 `3.0`，解除单点解读强制精简，主动取消不再误报超时。
- 「完整」档多轮编排：单人整盘走 8 大维度 + 逐闸门 + 逐通道 + 融合；合盘与双盘对比走关系场专用清单
  （合盘五维度 + 四类连接动力学 + 逐共享闸门 + 逐合并通道），按规范 §3.8 不输出类型 / 权威 / 轮回交叉。
- 串行 / 并发可切，并发失败自动转串行，单项失败重试 1 次后跳过，全程可取消；面板显示进度、ETA、
  模块化分项（每条通道独立展开收起）与失败清单，绝不伪造内容。
- AI 超时上限 600 → **3600 秒**。

**报告导出**

- 一键导出 **MD / Word / HTML / PDF**；桌面端原生另存为 + `printToPDF`，浏览器 / 安卓退化为下载或打印。
- Word 用 `docx@9` 动态加载（不进主 bundle），PDF 走 Chromium 系统字体避免中文乱码。

**界面与设置**

- 自定义页面布局：7 模块拖拽 / 改尺寸 / 8px 吸附 / 缩放 / 锁定 / 显隐 / 重置，手机端固定退化为单列流。
- 设置页去重、按来源动态返回、档案画布碰撞排布；清理版式二、Tauri 残留与无用依赖，
  凯龙回归盘 / 双盘对比 / 多盘 / 合盘均保留。
- 人体图三处图形收尾（小三角旋转、通道平行、悬挂段 1/4）；17 / 11 闸门方向与 43-23 严格平行。
- 盘序偏移 `MANDALA_OFFSET = 29.875`、Gate 41 起于 `302.000°` 保持不变。

## 产物

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `HumanDesign-Setup-{VERSION}.exe` | NSIS 安装包，可选安装目录、创建快捷方式、自带卸载 |
| Android | `HumanDesign-{VERSION}.apk` | minSdk 24 / targetSdk 34，自签名（v2 + v3 校验通过） |

## 验证

- `npx vue-tsc --noEmit` 无错；`npm test` **14 文件 / 138 项全绿**（含关系场完整版编排、报告四格式导出、
  提示词逐字一致性、几何与星历对照回归）；`npm run build` 通过。
- 桌面端与手机端各做一次目检；无 AI 配置时面板只提示去设置，不生成任何伪造解读内容。
- AI 接口地址 / Key 由用户自行在设置页配置；真实端点联调与安装包实机目检未在本轮执行。
"""


def token() -> str:
    """读取 .env 中的 GitHub Token（兼容历史全角冒号 / 裸 ghp_ 行）。"""
    with io.open(os.path.join(ROOT, '.env'), encoding='utf-8') as fh:
        text = fh.read()
    m = re.search(r'(ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})', text)
    if m:
        return m.group(1)
    raise SystemExit('未找到 GitHub Token（.env 中需含 GITHUB_TOKEN=... 或 ghp_ 开头的密钥）')


TOKEN = token()


def curl(url, method='GET', payload=None, extra_headers=None, binary_path=None,
         timeout=120):
    """返回 (http_code, parsed_json)。请求体走临时文件 / --data-binary，避免命令行长度限制。"""
    fd, out_path = tempfile.mkstemp(prefix='hd-rel-', suffix='.out')
    os.close(fd)
    body_path = None
    cmd = [
        'curl', '-sS', '-m', str(timeout),
        '--retry', '5', '--retry-delay', '2', '--retry-all-errors',
        '-X', method, '-o', out_path, '-w', '%{http_code}', url,
        '-H', f'Authorization: Bearer {TOKEN}',
        '-H', 'Accept: application/vnd.github+json',
        '-H', 'User-Agent: hd-tool-release',
    ]
    try:
        if payload is not None:
            fd, body_path = tempfile.mkstemp(prefix='hd-rel-', suffix='.json')
            with os.fdopen(fd, 'wb') as fh:
                fh.write(json.dumps(payload, ensure_ascii=False).encode('utf-8'))
            cmd += ['-H', 'Content-Type: application/json', '--data-binary', '@' + body_path.replace('\\', '/')]
        if binary_path is not None:
            cmd += [
                '-H', 'Content-Type: ' + (extra_headers or {}).get('Content-Type', 'application/octet-stream'),
                '-H', 'Expect:',
                '--data-binary', '@' + binary_path.replace('\\', '/'),
            ]
        for k, v in (extra_headers or {}).items():
            if k.lower() != 'content-type':
                cmd += ['-H', f'{k}: {v}']
        code = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True).strip()[-3:]
        with open(out_path, 'rb') as fh:
            raw = fh.read()
        try:
            return int(code), json.loads(raw.decode('utf-8') or '{}')
        except (ValueError, UnicodeDecodeError):
            return int(code), {'raw': raw.decode('utf-8', 'replace')[:500]}
    except subprocess.CalledProcessError as e:
        raise SystemExit(f'curl {method} {url} 失败：{(e.output or "")[:600]}')
    finally:
        for p in (out_path, body_path):
            if p and os.path.exists(p):
                try:
                    os.unlink(p)
                except OSError:
                    pass


def api(path, method='GET', payload=None):
    return curl('https://api.github.com' + path, method, payload)


def ensure_release():
    status, data = api(f'/repos/{REPO}/releases/tags/{TAG}')
    if status == 200:
        print(f'复用已有 Release #{data["id"]}')
        # 幂等：把说明同步到本版本文案
        api(f'/repos/{REPO}/releases/{data["id"]}', 'PATCH', {'name': TITLE, 'body': BODY})
        return data['id']

    status, data = api(
        f'/repos/{REPO}/releases',
        method='POST',
        payload={
            'tag_name': TAG,
            'target_commitish': BRANCH,
            'name': TITLE,
            'body': BODY,
            'draft': False,
            'prerelease': False,
        },
    )
    if status not in (200, 201):
        print('创建 Release 失败：', status, data.get('message'))
        sys.exit(1)
    print(f'已创建 Release #{data["id"]}  {data["html_url"]}')
    return data['id']


def existing_assets(release_id):
    status, data = api(f'/repos/{REPO}/releases/{release_id}/assets')
    if status != 200 or not isinstance(data, list):
        return {}
    return {a['name']: a for a in data}


def upload(release_id, rel_path, content_type):
    name = os.path.basename(rel_path)
    full = os.path.join(ROOT, rel_path)
    if not os.path.exists(full):
        print(f'!! 缺少产物：{rel_path}')
        return None

    size = os.path.getsize(full)
    url = f'https://uploads.github.com/repos/{REPO}/releases/{release_id}/assets?name={name}'
    print(f'上传 {name}  {size / 1048576:.2f} MB ...')
    status, data = curl(url, 'POST',
                        extra_headers={'Content-Type': content_type},
                        binary_path=full, timeout=900)
    if status not in (200, 201):
        print(f'  上传失败：HTTP {status} {str(data)[:300]}')
        return None
    print(f'  已完成，asset id={data.get("id")}')
    return data


def verify(release_id, expected):
    """回查远端 asset 列表，比对名称与字节数 —— 确认文件真的传上去了。"""
    assets = existing_assets(release_id)
    ok = True
    for name, size in expected.items():
        item = assets.get(name)
        if not item:
            print(f'  [FAIL] {name} 未出现在 Release 中')
            ok = False
            continue
        remote = item['size']
        match = remote == size
        state = item.get('state')
        print(f'  [{"OK" if match and state == "uploaded" else "FAIL"}] {name} '
              f'本地 {size} / 远端 {remote} / state={state}')
        if not (match and state == 'uploaded'):
            ok = False
    return ok


def main():
    release_id = ensure_release()
    assets = existing_assets(release_id)

    expected = {}
    for rel_path, ctype in ARTIFACTS:
        full = os.path.join(ROOT, rel_path)
        if not os.path.exists(full):
            print(f'跳过（不存在）：{rel_path}')
            continue
        name = os.path.basename(rel_path)
        size = os.path.getsize(full)
        expected[name] = size

        if name in assets:
            if assets[name]['size'] == size:
                print(f'已存在且大小一致，跳过上传：{name}')
                continue
            print(f'大小不一致，先删除旧 asset：{name}')
            api(f'/repos/{REPO}/releases/assets/{assets[name]["id"]}', method='DELETE')

        upload(release_id, rel_path, ctype)

    print('\n== 上传结果校验 ==')
    ok = verify(release_id, expected)

    status, release = api(f'/repos/{REPO}/releases/tags/{TAG}')
    if status == 200:
        print(f'\nRelease: {release["html_url"]}')
        for a in release.get('assets', []):
            print(f'  - {a["name"]}  {a["size"] / 1048576:.2f} MB  {a["browser_download_url"]}')

    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
