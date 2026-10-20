# -*- coding: utf-8 -*-
"""
发布 Release 并上传安装包，上传后回查确认成功。

用法：
    python scripts/publish-release.py

依赖：仓库根目录 .env 中的 GITHUB_TOKEN（需要 repo 权限）。
说明：本机 schannel 的证书吊销检查会阻断 git/curl，Python 走 OpenSSL 不受影响，
      因此发布走 API 而不是 git push。
"""
import io
import json
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
REPO = 'byazlle/human-design-tool'
TAG = 'v0.2.0'
TITLE = 'v0.2.0 · 液态玻璃界面 + 完整安装包'
BRANCH = 'main'

ARTIFACTS = [
    ('release/desktop/HumanDesign-Setup-0.2.0.exe', 'application/octet-stream'),
    ('release/android/HumanDesign-0.2.0.apk', 'application/vnd.android.package-archive'),
]

BODY = """## 本次更新

**界面**
- 人体图几何重写：闸门沿九中心边界按弧长定位（最大空隙断开 + 双向 clamp 求最小位移），
  彻底修复同方位闸门叠成一团的问题；九中心纵向间距统一 40px，通道为边界到边界的短直线。
- 卡通化描边 + 整体加粗：已定义通道 7px 带白色描边、未定义 2.4px 虚线；闸门半径 14、字号提升。
- 未激活闸门改为「外部圆圈 + 内部底色」，只有真实激活才点亮（修复点击未激活闸门误亮的缺陷）。
- 液态玻璃视觉：背景光斑层 + `backdrop-filter` + 内侧高光描边，浅色/深色各一套令牌；
  新增悬浮操作坞、自绘窗口标题栏、路由过渡与弹性动效。

**内容**
- 类型解析补全为七段：能量机制 / 策略 / 签名 / 非自我主题 / 权威提示 / 常见误区 / 落地建议。
- 星体数据每行可展开「这个数据代表什么」，13 个星体各有意识面与无意识面解释。
- 完整盘常驻「已激活通道 / 闸门 / 九中心」清单，通道直接写出作用，无需点击侧栏。
- 支持勾选任意多个闸门·通道·中心，一次性发起 AI 解读；选择集相同即命中本地缓存。
- 合盘新增 爱情 / 事业 / 工作 / 朋友 / 父母 + 自定义 六个维度，各自独立提示词与缓存键。

**打包**
- 桌面端改为 Electron 壳，用自定义 `app://` 协议替代 `file://`，解决 localStorage 被禁与 ES module 被 CORS 阻断。
- 安卓端为原生 WebView 壳，用 `aapt2 → javac → d8 → zipalign → apksigner` 手工链路构建，零第三方依赖。

## 产物

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `HumanDesign-Setup-0.2.0.exe` | NSIS 安装包，可选安装目录、创建快捷方式、自带卸载 |
| Android | `HumanDesign-0.2.0.apk` | minSdk 24 / targetSdk 34，自签名（v2+v3），安装即用 |

## 验证

- 排盘内核 15 项单元测试全通过（含 26 个激活点与权威实现逐项对齐、2600 点星历交叉校验）。
- 桌面壳端到端自检 **29/29 通过**：安全 origin、localStorage 读写、示例档案、人体图点亮/外圈、
  通道与闸门清单、类型详解分节、星体含义、未激活闸门不误亮回归、批量解读、AI 未配置提示、
  深色模式、合盘三栏与维度切换、设置页、新建页。
- 安装包实测：静默安装后运行安装版程序，同一套自检同样全通过。
"""


def token():
    path = os.path.join(ROOT, '.env')
    with io.open(path, encoding='utf-8') as fh:
        for line in fh:
            if line.startswith('GITHUB_TOKEN='):
                return line.split('=', 1)[1].strip().strip('"')
    raise SystemExit('未找到 GITHUB_TOKEN')


def api(path, method='GET', data=None, headers=None):
    url = 'https://api.github.com' + path
    body = json.dumps(data).encode('utf-8') if data is not None else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header('Authorization', 'Bearer ' + token())
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'hd-tool-release')
    if body:
        req.add_header('Content-Type', 'application/json')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8') or '{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode('utf-8') or '{}')


def ensure_release():
    status, data = api(f'/repos/{REPO}/releases/tags/{TAG}')
    if status == 200:
        print(f'复用已有 Release #{data["id"]}')
        return data['id']

    status, data = api(
        f'/repos/{REPO}/releases',
        method='POST',
        data={
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
    if status != 200:
        return {}
    return {a['name']: a for a in data}


def upload(release_id, rel_path, content_type):
    name = os.path.basename(rel_path)
    full = os.path.join(ROOT, rel_path)
    if not os.path.exists(full):
        print(f'!! 缺少产物：{rel_path}')
        return None

    size = os.path.getsize(full)
    with open(full, 'rb') as fh:
        payload = fh.read()

    url = f'https://uploads.github.com/repos/{REPO}/releases/{release_id}/assets?name={name}'
    req = urllib.request.Request(url, data=payload, method='POST')
    req.add_header('Authorization', 'Bearer ' + token())
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('Content-Type', content_type)
    req.add_header('User-Agent', 'hd-tool-release')

    print(f'上传 {name}  {size / 1048576:.2f} MB ...')
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print(f'  已完成，asset id={data["id"]}')
            return data
    except urllib.error.HTTPError as e:
        print('  上传失败：', e.code, e.read().decode('utf-8')[:300])
        return None


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
    return ok, assets


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
    ok, final_assets = verify(release_id, expected)

    status, release = api(f'/repos/{REPO}/releases/tags/{TAG}')
    if status == 200:
        print(f'\nRelease: {release["html_url"]}')
        for a in release.get('assets', []):
            print(f'  - {a["name"]}  {a["size"] / 1048576:.2f} MB  {a["browser_download_url"]}')

    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
