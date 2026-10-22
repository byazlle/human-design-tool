# -*- coding: utf-8 -*-
"""
打包 Windows 安装包（NSIS）。

前置：前端已 `npm run build` 产出 dist。
做法：把 dist 装进预组装目录 resources/app，再让 electron-builder 走 --prepackaged
只做 NSIS 封装 —— 这样绕开本机 electron-builder 解压 Electron 时的 EPERM 重命名问题。
"""
import os
import shutil
import subprocess
import sys

# CI（Windows）默认 stdout 编码为 cp1252，无法输出中文打印，
# 会让脚本在 ensure_stage() 等含中文的 print 处抛 UnicodeEncodeError 而崩溃。
# 强制以 UTF-8 输出仅影响构建日志，不改变任何产物行为。
for _s in (sys.stdout, sys.stderr):
    if _s is not None and hasattr(_s, 'reconfigure'):
        try:
            _s.reconfigure(encoding='utf-8')
        except Exception:
            pass

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DESKTOP = os.path.join(ROOT, 'desktop')
DIST = os.path.join(ROOT, 'dist')
STAGE = os.path.join(ROOT, 'release', 'desktop', 'win-unpacked')
APP_DIR = os.path.join(STAGE, 'resources', 'app')
# 优先使用 PATH 中的 node（CI / 常规安装），回退到本机托管版本
NODE = os.path.dirname(shutil.which('node') or '')
if not NODE:
    NODE = r'C:\Users\cat\.workbuddy\binaries\node\versions\22.22.2-6'


def clean_dir(path):
    if not os.path.isdir(path):
        return
    for root, dirs, files in os.walk(path, topdown=False):
        for name in files:
            try:
                os.remove(os.path.join(root, name))
            except OSError:
                pass
        for name in dirs:
            try:
                os.rmdir(os.path.join(root, name))
            except OSError:
                pass


def ensure_stage():
    """首次构建时自举：把 electron 自带的运行时复制成 win-unpacked 目录。"""
    if os.path.isdir(os.path.join(STAGE, 'resources')):
        return
    electron_dist = os.path.join(DESKTOP, 'node_modules', 'electron', 'dist')
    if not os.path.isdir(electron_dist):
        print('缺少 electron 运行时，请先在 desktop/ 执行 npm install')
        sys.exit(1)

    os.makedirs(STAGE, exist_ok=True)
    for name in os.listdir(electron_dist):
        src = os.path.join(electron_dist, name)
        dst = os.path.join(STAGE, name)
        if os.path.isdir(src):
            shutil.copytree(src, dst, dirs_exist_ok=True)
        else:
            shutil.copy2(src, dst)

    # Electron 主程序改名为产品名
    for candidate in ('electron.exe', 'electron'):
        old = os.path.join(STAGE, candidate)
        if os.path.exists(old):
            os.rename(old, os.path.join(STAGE, 'HumanDesign.exe'))
            break
    print('已从 electron 运行时自举 win-unpacked')


def stage_app():
    if not os.path.isdir(DIST):
        print('缺少 dist，请先执行 npm run build')
        sys.exit(1)
    ensure_stage()

    os.makedirs(APP_DIR, exist_ok=True)

    # 清掉旧的静态产物，保留入口脚本
    for name in os.listdir(APP_DIR):
        if name in ('index.html', 'assets', 'favicon.ico'):
            target = os.path.join(APP_DIR, name)
            if os.path.isdir(target):
                clean_dir(target)
                try:
                    os.rmdir(target)
                except OSError:
                    pass
            else:
                os.remove(target)

    for name in os.listdir(DIST):
        src = os.path.join(DIST, name)
        dst = os.path.join(APP_DIR, name)
        if os.path.isdir(src):
            shutil.copytree(src, dst, dirs_exist_ok=True)
        else:
            shutil.copy2(src, dst)

    for f in ('main.cjs', 'preload.cjs', 'package.json'):
        shutil.copy2(os.path.join(DESKTOP, f), os.path.join(APP_DIR, f))

    count = sum(len(files) for _, _, files in os.walk(APP_DIR))
    print(f'预组装完成：{count} 个文件')


def build():
    stage_app()

    env = os.environ.copy()
    env['PATH'] = NODE + os.pathsep + env.get('PATH', '')
    env['ELECTRON_BUILDER_BINARIES_MIRROR'] = (
        'https://registry.npmmirror.com/-/binary/electron-builder-binaries/'
    )
    env['ELECTRON_MIRROR'] = 'https://registry.npmmirror.com/-/binary/electron/'

    npx = shutil.which('npx') or os.path.join(NODE, 'npx.cmd')
    cmd = [
        npx,
        'electron-builder',
        '--win', 'nsis', '--x64',
        '--prepackaged', STAGE,
        # CI 下 electron-builder 26 会隐式尝试发布（缺 GH_TOKEN 会再失败）；
        # 发布由工作流单独任务负责，这里只出安装包
        '--publish', 'never',
    ]
    print('\n$ ' + ' '.join(cmd))
    proc = subprocess.run(cmd, cwd=DESKTOP, env=env, capture_output=True,
                          text=True, encoding='utf-8', errors='replace')
    if proc.stdout:
        print(proc.stdout[-4000:])
    if proc.stderr:
        print(proc.stderr[-2000:])
    if proc.returncode != 0:
        sys.exit(proc.returncode)

    out = os.path.join(ROOT, 'release', 'desktop')
    setups = [f for f in os.listdir(out) if f.endswith('.exe')]
    for name in setups:
        size = os.path.getsize(os.path.join(out, name)) / 1048576
        print(f'产出：{name}  {size:.1f} MB')


if __name__ == '__main__':
    build()
