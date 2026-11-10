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
- 按工作区原始字节上传：本仓库 git blob 里存的是 CRLF，转成 LF 会让上传后的
  blob sha 与本地 HEAD 永久不一致，导致每次推送都误判「内容过期」。
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


def head_blob(path: str):
    """读取 HEAD 中该文件的原始字节；不在 HEAD 时返回 None。

    必须用 HEAD 的字节而不是工作区：commit 时 git 可能做过行尾归一化，
    工作区内容与 blob 不完全相同，上传后 sha 会永久不一致、每次推送都误判「内容过期」。
    """
    try:
        return subprocess.check_output(
            ["git", "cat-file", "blob", f"HEAD:{path}"],
            cwd=ROOT,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError:
        return None


# 路径 → git index 中的 mode 缓存。曾用 os.access(path, os.X_OK) 判断，
# 但 Windows 上大量普通文本文件也会返回 True，导致远端树被写成 100755、
# 与本地 100644 的树 sha 永久不一致（表现为「88 个文件只有 mode 不同」的分叉）。
# 现在一律以 git 自身记录的 mode 为准。
_MODE_CACHE: dict = {}


def head_mode(path: str) -> str:
    """取 HEAD 树里该文件的 mode（100644 / 100755 / 120000）。缺失时按 100644。"""
    if path in _MODE_CACHE:
        return _MODE_CACHE[path]
    try:
        out = subprocess.check_output(
            ["git", "-c", "core.quotepath=false", "ls-tree", "HEAD", "--", path],
            cwd=ROOT,
            stderr=subprocess.DEVNULL,
        ).decode("utf-8")
    except subprocess.CalledProcessError:
        out = ""
    mode = "100644"
    for line in out.splitlines():
        if "\t" in line:
            candidate = line.split("\t", 1)[0].split()[0]
            if candidate in ("100644", "100755", "120000"):
                mode = candidate
                break
    _MODE_CACHE[path] = mode
    return mode


def entry_for_path(path: str):
    """单个文件 → tree entry；内容取 HEAD blob（与 git 树逐字节一致），文本内联、二进制建 blob。"""
    raw = head_blob(path)
    abs_path = os.path.join(ROOT, path)
    if raw is None:
        if not os.path.exists(abs_path):
            return {"path": path, "mode": "100644", "type": "blob", "sha": None}
        with open(abs_path, "rb") as fh:
            raw = fh.read()
    # 一律跟随 git 记录的 mode，不看工作区可执行位（见 head_mode 注释）
    mode = head_mode(path)
    try:
        text = raw.decode("utf-8")
        return {"path": path, "mode": mode, "type": "blob", "content": text}
    except UnicodeDecodeError:
        print(f"二进制文件单独建 blob：{path}")
        return {"path": path, "mode": mode, "type": "blob", "sha": create_blob(raw)}


def build_entries(changed):
    """改动列表 → GitHub tree entries；重命名先删旧路径，删除项 sha=null。"""
    entries = []
    for line in changed:
        if not line.strip():
            continue
        parts = line.split("\t")
        status, path = parts[0], parts[-1]
        # 重命名：先删旧路径，再按新路径写入
        if status.startswith("R") and len(parts) >= 3:
            entries.append({"path": parts[1], "mode": "100644", "type": "blob", "sha": None})
        entries.append(entry_for_path(path))
    return entries


def local_tree() -> dict:
    """本地 HEAD 的 {path: blob_sha}（git blob sha 与 GitHub tree 的 sha 同一算法）。"""
    out = subprocess.check_output(
        ["git", "-c", "core.quotepath=false", "ls-tree", "-r", "HEAD"], cwd=ROOT
    ).decode("utf-8")
    tree = {}
    for line in out.splitlines():
        if not line.strip():
            continue
        meta, path = line.split("\t", 1)
        tree[path] = meta.split()[2]
    return tree


def sync_tree() -> str:
    """把远端 main 的文件树与本地 HEAD 全量对齐。

    历史 API 推送只写「单次提交 diff」，早期提交新增或改过的文件从未被带到远端，
    远端因此长期保留旧内容（v2.2.0 CI 先后因缺 src/services/validate.ts 报 TS2307、
    因 src/engine/mandala.ts 仍是 29.8333 导致盘序与金标准断言失败）。
    这里按 blob sha 逐文件比对：缺失补齐、内容过期覆盖、远端多余删除。
    """
    head = api(f"/repos/{REPO}/git/ref/heads/{BRANCH}")["object"]["sha"]
    data = api(f"/repos/{REPO}/git/trees/{head}?recursive=1")
    if data.get("truncated"):
        raise SystemExit("远端 tree 过大被截断，无法做完整性校验")
    remote = {x["path"]: x["sha"] for x in data["tree"] if x["type"] == "blob"}
    local = local_tree()

    stale = [p for p, sha in local.items() if p in remote and remote[p] != sha]
    missing = [p for p in local if p not in remote]
    extra = [p for p in remote if p not in local]
    if not (stale or missing or extra):
        print(f"远端文件树与本地 HEAD 完全一致（{len(local)} 个文件）")
        return head

    print(f"需同步 {len(stale) + len(missing) + len(extra)} 个文件："
          f"内容过期 {len(stale)} / 缺失 {len(missing)} / 远端多余 {len(extra)}")
    for p in sorted(missing):
        print("  +", p)
    for p in sorted(stale):
        print("  ~", p)
    for p in sorted(extra):
        print("  -", p)

    entries = [entry_for_path(p) for p in missing + stale]
    entries += [{"path": p, "mode": "100644", "type": "blob", "sha": None} for p in extra]
    tree = api(
        f"/repos/{REPO}/git/trees",
        "POST",
        {"base_tree": data["sha"], "tree": entries},
    )
    commit = api(
        f"/repos/{REPO}/git/commits",
        "POST",
        {
            "message": "chore: 对齐远端文件树（历史 API 推送遗漏）\n\n"
                       "按 blob sha 补齐缺失、覆盖内容过期文件，修复 CI 的 TS2307 与盘序/金标准断言。",
            "tree": tree["sha"],
            "parents": [head],
        },
    )
    api(
        f"/repos/{REPO}/git/refs/heads/{BRANCH}",
        "PATCH",
        {"sha": commit["sha"], "force": False},
    )
    print("已对齐，远端 main =", commit["sha"][:8])
    return commit["sha"]


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--sync" in sys.argv:
        sync_tree()
        return

    commit = args[0] if args else "HEAD"
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
    # 推送后做一次文件树对齐，防止历史遗留的缺文件再次拖垮 CI
    sync_tree()


if __name__ == "__main__":
    main()
