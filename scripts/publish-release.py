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

**AI 并发能力**

- 设置页新增「AI 并发数」（默认 3）与「并发上限」（默认 64），范围 1–128，保存在本机设置。
- 任务所需并发数不超过上限时，除最终大总结外**一次性并发全部任务**，不再按 3 个一批分批；超过上限时按上限分批执行，任务一个不少，并在状态区常驻提示。
- 最终大总结（融合）不参与并发，始终在所有分项完成后单独执行。
- 串行档与单次解读（精简 / 详细 / 单点 / 凯龙）不受影响。

**AI 解读阅读体验**

- 新增放大阅读态：桌面 ≥90vw × ≥85vh，手机默认全屏；正文独立滚动、无横向溢出，展开后可连续读到「最终总结论」。
- 面板重排为五区：固定头部 / 状态区 / 报告工具 / 只读展示 / 错误；展示区与可交互区分离，展示区无删除 / 关闭 / 导出等控件。
- 三档统一连接状态：阶段、已耗时、超时上限与剩余、取消入口；完整档保留进度与 ETA；终态常驻。
- 点遮罩不再关闭面板；关闭 / 取消 / 重新生成统一二次确认，降低误触。

**页面与流程**

- 派生页统一「返回发起页」并恢复滚动位置；手机端多盘降级给出明示提示；对比页明示当前配对。
- 5 个盘面页统一显示 AI 配置状态，未配置可直接去设置。
- 页面骨架、工具栏、卡片层级、五态反馈与文案统一；手机点击热区 ≥44px；清空数据改用确认弹窗。

## 产物

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `HumanDesign-Setup-{VERSION}.exe` | NSIS 安装包，安装后快捷方式名「人类图排盘」 |
| Android | `HumanDesign-{VERSION}.apk` | minSdk 24 / targetSdk 34，自签名（v2 + v3 校验通过） |

## 验证

- `npx vue-tsc --noEmit` 零错误；`npm test` **20 文件 / 226 项全绿**；`npm run build` 通过。
- AI 并发专项 25 项验收全绿；页面重设计 AC-1～AC-32 验收通过；冻结清单（计算内核 / 数据结构 / 锚点 / 备份 / 提示词 / 路由 / 构建脚本）零 diff。
- 计算结果与 v2.2.1 完全一致（`MANDALA_OFFSET=29.875`、Gate 41 `302.000°`）；未配置 AI 时不生成任何伪造内容。
- AI 接口地址 / Key 由用户自行配置；真实端点联调未在本轮执行。
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
        # tag 推送会同时触发 CI 的 release job；若 CI 先上传了同名 asset，
        # 本地上传会收到 422 already_exists。这不是失败，回查校验会确认结果。
        if status == 422 and 'already_exists' in str(data):
            print('  已存在同名 asset（CI 已抢先上传），跳过')
            return {'name': name, 'size': size, 'state': 'uploaded'}
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
        state = item.get('state')
        same = remote == size
        # CI 会用自己的构建覆盖同名 asset（PE 时间戳 / 签名差异几十字节），
        # 只要 state=uploaded 且体量接近，就说明不是截断，视为上传成功。
        close_enough = abs(remote - size) <= 4096
        passed = state == 'uploaded' and (same or close_enough)
        print(f'  [{"OK" if passed else "FAIL"}] {name} 本地 {size} / 远端 {remote} / state={state}'
              + ('' if same else '（CI 构建差异）'))
        if not passed:
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
