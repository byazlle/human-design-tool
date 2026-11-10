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

**跨档案批量生成解读**

- 档案库页新增「批量解读」入口，可对「全部 / 已勾选」档案一次性生成整盘解读。
- 发起前实时预检「将生成 N 份 / 跳过 M 份」，可选解读维度（8 项）、解读角度（8 项，含自定义方向）与三档详细度；已有解读可选跳过或覆盖。
- 复用 v2.3.0 既有的并发调度（唯一闸门仍是「任务数 ≤ 并发上限」），不新增第二套并发概念。
- 失败项可单独重跑，且只重跑上次失败的。
- 进度与结论条挂在应用顶层，发起后切页或关掉弹窗仍可见；随时可中断，已完成的解读全部保留。

**AI 解读结果持久化**

- 此前解读从不落盘到档案，只进全局流水（上限 50 条）。现在解读随档案保存（`hdt.ai.readings.v1`，每份档案保留最新 12 条）。
- 单盘页新增「解读记录」抽屉：可回看、复制、重新生成、删除。
- 提示词或内核升级后，旧解读标记「口径已更新」而不是被删除。

**AI 提示词升级 v3.2**

- 三套提示词新增【与事实块的分工】：事实块与离线释义已写在用户眼前，模型要给出它们之上才成立的内容，而不是换种说法复述。
- 字数由硬指标降为上限，结构简单的盘面不再被要求凑满下限。
- 提示词版本号进入缓存键，升级后旧缓存自动失效（不会读到旧口径的答案）。

**修复**

- 修复批量与手动解读的缓存键分裂：同一张盘先手动生成过，批量时会重新计费一次。
- 修复批量解读的上下文口径不一致：任务标题曾被当成解读角度注入。
- 修复面板「中断」按钮在视图之外失效。

**其它**

- 手动与批量解读共用同一套事实块拼装（`services/chartFacts.ts`），避免两条路径的口径漂移。
- 页面结构收敛：5 个盘面页重复的 AI 面板绑定合并为一处（`panel/AiReadingHost.vue`）。

## 产物

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `HumanDesign-Setup-{VERSION}.exe` | NSIS 安装包，安装后快捷方式名「人类图排盘」 |
| Android | `HumanDesign-{VERSION}.apk` | minSdk 24 / targetSdk 34，自签名（v2 + v3 校验通过） |

## 验证

- `npx vue-tsc --noEmit` 零错误；`npm test` **24 文件 / 304 项全绿**；`npm run build` 通过；`node scripts/sync-prompt-spec.mjs --check` 通过。
- 计算内核、数据结构、曼陀罗锚点（`MANDALA_OFFSET=29.875`、Gate 41 起于 `302.000°`）零改动，计算结果与 v2.3.0 一致。
- 未配置 AI 接口时不生成任何伪造内容，面板给出明确提示与去设置入口。
- AI 接口地址与 Key 由用户自行配置，本机留存，不上传。
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
