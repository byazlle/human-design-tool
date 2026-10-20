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

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DESKTOP = os.path.join(ROOT, 'desktop')
DIST = os.path.join(ROOT, 'dist')
STAGE = os.path.join(ROOT, 'release', 'desktop', 'win-unpacked')
APP_DIR = os.path.join(STAGE, 'resources', 'app')
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


def stage_app():
    if not os.path.isdir(DIST):
        print('缺少 dist，请先执行 npm run build')
        sys.exit(1)
    if not os.path.isdir(STAGE):
        print('缺少 Electron 运行时目录，请先运行 desktop 首次打包以生成 win-unpacked')
        sys.exit(1)

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

    for f in ('main.cjs', 'preload.cjs'):
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

    cmd = [
        os.path.join(NODE, 'npx.cmd'),
        'electron-builder',
        '--win', 'nsis', '--x64',
        '--prepackaged', STAGE,
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
