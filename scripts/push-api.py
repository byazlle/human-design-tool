"""通过 GitHub REST API 推送本地最新提交（git over HTTPS 不可用时的兜底）。

用法：python scripts/push-api.py [commit]
默认推送 HEAD；需要 .env 中的 GITHUB_TOKEN，仓库默认 byazlle/human-design-tool。

实现要点：
- 本机存在 TLS 拦截代理：系统 curl 走系统证书链可连通 api.github.com，
  而 Python 自带 OpenSSL 证书链会 SSL EOF。因此 HTTP 调用统一走 curl。
- 以远端 main 为基底，把本地该提交相对父提交的改动写成一棵新树，
  再创建 commit 并快进 ref，绕开历史 LF/CRLF 造成的非快进分叉。
- 文本改动直接放在 tree entry 的 `content` 里（GitHub 自行落 blob），
  一次 POST 即可完成，避免上百次 blob 请求被代理截断；二进制才单独建 blob。
- 上传统一转成 LF，与 git 仓库里保存的树一致，不再制造新的行尾分叉。
"""
import base64
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

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "byazlle/human-design-tool"
BRANCH = "main"


def token() -> str:
    """读取 .env 中的 GitHub Token，兼容 GITHUB_TOKEN=... 与裸 ghp_ 前缀行。"""
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as fh:
        text = fh.read()
    m = re.search(r"(ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})", text)
    if m:
        return m.group(1)
    raise SystemExit("GitHub Token not found（.env 中需含 GITHUB_TOKEN=... 或 ghp_ 开头的密钥）")


TOKEN = token()


def api(path: str, method: str = "GET", payload=None, timeout: int = 300):
    """返回解析后的 JSON；请求体写临时文件用 --data-binary @file 传，避免命令行长度限制。"""
    url = f"https://api.github.com{path}"
    fd, out_path = tempfile.mkstemp(prefix="hd-push-", suffix=".out")
    os.close(fd)
    body_path = None
    cmd = [
        "curl", "-sS", "-m", str(timeout),
        "--retry", "5", "--retry-delay", "2", "--retry-all-errors",
        "-X", method, "-o", out_path, "-w", "%{http_code}", url,
        "-H", f"Authorization: Bearer {TOKEN}",
        "-H", "Accept: application/vnd.github+json",
        "-H", "User-Agent: hd-tool-push",
    ]
    try:
        if payload is not None:
            fd, body_path = tempfile.mkstemp(prefix="hd-push-", suffix=".json")
            with os.fdopen(fd, "wb") as fh:
                fh.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
            cmd += [
                "-H", "Content-Type: application/json",
                "--data-binary", "@" + body_path.replace("\\", "/"),
            ]
        raw_code = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True).strip()
        code = int(raw_code[-3:] or 0)
        with open(out_path, "rb") as fh:
            raw = fh.read()
        if not (200 <= code < 300) or not raw.strip():
            raise SystemExit(
                f"curl {method} {path} -> HTTP {code}: {raw.decode('utf-8', 'replace')[:800]}"
            )
        return json.loads(raw.decode("utf-8"))
    except subprocess.CalledProcessError as e:
        raise SystemExit(
            f"curl {method} {path} failed: {(e.output or '')[:600]}"
        )
    finally:
        for p in (out_path, body_path):
            if p and os.path.exists(p):
                try:
                    os.unlink(p)
                except OSError:
                    pass


def git(*args: str) -> str:
    # core.quotepath=false：避免中文路径被转义成 å 导致 API 422
    return subprocess.check_output(
        ["git", "-c", "core.quotepath=false", *args], cwd=ROOT
    ).decode("utf-8").strip()


def create_blob(raw: bytes) -> str:
    return api(
        f"/repos/{REPO}/git/blobs",
        "POST",
        {"content": base64.b64encode(raw).decode(), "encoding": "base64"},
    )["sha"]


def build_entries(changed):
    """改动列表 → GitHub tree entries；文本走 content，二进制走 blob。"""
    entries = []
    binary = []
    for line in changed:
        if not line.strip():
            continue
        parts = line.split("\t")
        status, path = parts[0], parts[-1]
        # 重命名：先删旧路径，再按新路径写入
        if status.startswith("R") and len(parts) >= 3:
            entries.append({"path": parts[1], "mode": "100644", "type": "blob", "sha": None})
        abs_path = os.path.join(ROOT, path)
        if status.startswith("D") or not os.path.exists(abs_path):
            entries.append({"path": path, "mode": "100644", "type": "blob", "sha": None})
            continue
        with open(abs_path, "rb") as fh:
            raw = fh.read()
        mode = "100755" if os.access(abs_path, os.X_OK) else "100644"
        try:
            text = raw.decode("utf-8").replace("\r\n", "\n")
            entries.append({"path": path, "mode": mode, "type": "blob", "content": text})
        except UnicodeDecodeError:
            binary.append({"path": path, "mode": mode, "raw": raw})

    for item in binary:
        print(f"二进制文件单独建 blob：{item['path']}")
        entries.append({
            "path": item["path"],
            "mode": item["mode"],
            "type": "blob",
            "sha": create_blob(item["raw"]),
        })
    return entries


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
    changed = git("diff", "--name-status", parent, sha).splitlines()
    entries = build_entries(changed)
    print("files", len(entries), "| inline content", sum(1 for e in entries if "content" in e),
          "| deletions", sum(1 for e in entries if e.get("sha", "") is None))

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
