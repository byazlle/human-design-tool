"""通过 GitHub REST API 推送本地最新提交（git over HTTPS 不可用时的兜底）。

用法：python scripts/push-api.py [commit]
默认推送 HEAD；需要 .env 中的 GITHUB_TOKEN，仓库默认 byazlle/human-design-tool。
"""
import base64
import json
import os
import subprocess
import tempfile
import sys
import urllib.error
import urllib.request

# 强制 UTF-8 输出：Windows 下 Python 默认 stdout 为 cp1252，含中文的打印会抛
# UnicodeEncodeError；仅影响日志编码，不改变产物。
for _s in (sys.stdout, sys.stderr):
    if _s is not None and hasattr(_s, 'reconfigure'):
        try:
            _s.reconfigure(encoding='utf-8')
        except Exception:
            pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "byazlle/human-design-tool"
BRANCH = "main"


def token() -> str:
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("GITHUB_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("GITHUB_TOKEN not found")


TOKEN = token()


def api(path: str, method: str = "GET", payload=None):
    # 本机存在 TLS 拦截代理：系统 curl 走系统证书链可连通 api.github.com，
    # 而 Python 自带 OpenSSL 证书链会 SSL EOF。因此 HTTP 调用统一走 curl。
    # 大文件 base64 后可能超出命令行长度上限，故请求体写入临时文件用 -d @file 传。
    url = f"https://api.github.com{path}"
    cmd = [
        "curl", "-sS", "-m", "120", "--retry", "5", "--retry-delay", "2",
        "--retry-all-errors", "-f",
        "-X", method, url,
        "-H", f"Authorization: Bearer {TOKEN}",
        "-H", "Accept: application/vnd.github+json",
        "-H", "User-Agent: hd-tool-push",
    ]
    tmp = None
    if payload is not None:
        data = json.dumps(payload)
        fd, tmp = tempfile.mkstemp(prefix="hd-push-", suffix=".json")
        try:
            with os.fdopen(fd, "wb") as fh:
                fh.write(data.encode("utf-8"))
        except Exception:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)
            raise
        cmd += ["-H", "Content-Type: application/json", "-d", f"@{tmp}"]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT)
    except subprocess.CalledProcessError as e:
        raise SystemExit(
            f"curl {method} {path} failed: {(e.stdout or b'').decode('utf-8', 'replace')[:600]}"
        )
    finally:
        if tmp and os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except Exception:
                pass
    return json.loads(out.decode("utf-8"))


def git(*args: str) -> str:
    # core.quotepath=false：避免中文路径被转义成 å 导致 API 422
    return subprocess.check_output(
        ["git", "-c", "core.quotepath=false", *args], cwd=ROOT
    ).decode("utf-8").strip()


def main() -> None:
    commit = sys.argv[1] if len(sys.argv) > 1 else "HEAD"
    sha = git("rev-parse", commit)
    parent = git("rev-parse", f"{commit}~1")
    message = git("log", "-1", "--pretty=%B", commit)

    api_head = api(f"/repos/{REPO}/git/ref/heads/{BRANCH}")["object"]["sha"]
    print("local", sha[:8], "remote", api_head[:8])
    if api_head == sha:
        print("远端已是最新，跳过")
        return

    # 以远端为基底，把本地该提交相对父提交的改动写上去
    remote_tree = api(f"/repos/{REPO}/git/commits/{api_head}")["tree"]["sha"]
    # 若远端不等于本地父提交，仍以远端树为基底，尽量保持其他分支内容不丢
    changed = git("diff", "--name-status", f"{parent}", f"{sha}").splitlines()

    entries = []
    for line in changed:
        parts = line.split("\t")
        status, path = parts[0], parts[-1]
        abs_path = os.path.join(ROOT, path)
        if status.startswith("D") or not os.path.exists(abs_path):
            entries.append({"path": path, "mode": "100644", "type": "blob", "sha": None})
            continue
        with open(abs_path, "rb") as fh:
            content = fh.read()
        blob = api(
            f"/repos/{REPO}/git/blobs",
            "POST",
            {"content": base64.b64encode(content).decode(), "encoding": "base64"},
        )
        mode = "100755" if os.access(abs_path, os.X_OK) else "100644"
        entries.append({"path": path, "mode": mode, "type": "blob", "sha": blob["sha"]})

    print("files", len(entries))
    tree = api(
        f"/repos/{REPO}/git/trees",
        "POST",
        {"base_tree": remote_tree, "tree": entries},
    )
    new_commit = api(
        f"/repos/{REPO}/git/commits",
        "POST",
        {"message": message, "tree": tree["sha"], "parents": [api_head]},
    )
    api(
        f"/repos/{REPO}/git/refs/heads/{BRANCH}",
        "PATCH",
        {"sha": new_commit["sha"], "force": False},
    )
    print("pushed", new_commit["sha"][:8])


if __name__ == "__main__":
    main()
