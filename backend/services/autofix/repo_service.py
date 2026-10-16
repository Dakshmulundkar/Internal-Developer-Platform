"""Git plumbing for Repo Auto-Fix (Phase 8, Task 76).

Security rules enforced here:
- repository names are validated against a strict regex (no URLs, no
  traversal, no extra path segments)
- the token travels only inside the clone URL argument and is redacted from
  every error/log string before it leaves this module
- pushes are refused to any branch outside the ``aether/autofix-`` namespace
"""

import logging
import os
import re
import shutil
import subprocess
import tempfile
from contextlib import contextmanager
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

BRANCH_PREFIX = "aether/autofix-"
_FULL_NAME_RE = re.compile(r"^[\w.\-]+/[\w.\-]+$")
_CLONE_TIMEOUT = 120
_GIT_TIMEOUT = 60


class RepoAccessError(Exception):
    """User-facing repo error with a plain-language message (token-free)."""


def redact(text: str, secrets: "list[str] | None" = None) -> str:
    """Strip anything that could leak a credential from a message."""
    if text is None:
        return ""
    out = str(text)
    for secret in secrets or []:
        if secret:
            out = out.replace(secret, "***")
    # embedded-credential remote URLs: https://<cred>@github.com/...
    out = re.sub(r"https://[^\s@/]+@", "https://***@", out)
    return out


def validate_full_name(full_name: str) -> None:
    """Raise RepoAccessError unless ``full_name`` is exactly owner/repo."""
    name = (full_name or "").strip()
    if not name or not _FULL_NAME_RE.match(name):
        raise RepoAccessError(
            "Invalid repository name — use the form owner/repo."
        )
    if any(seg in (".", "..") for seg in name.split("/")):
        raise RepoAccessError(
            "Invalid repository name — use the form owner/repo."
        )


def _run_git(args: list, cwd: Path | None = None, timeout: int = _GIT_TIMEOUT):
    try:
        return subprocess.run(
            ["git", *args],
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
    except FileNotFoundError:
        raise RepoAccessError("git is not installed on the server.")
    except subprocess.TimeoutExpired:
        raise RepoAccessError("A git command timed out — try again.")


def _raise_git(proc, secrets) -> RepoAccessError:
    msg = (proc.stderr or proc.stdout or "git command failed").strip()
    return RepoAccessError(redact(msg, secrets)[:300])


@contextmanager
def temporary_clone(full_name: str, token: str):
    """Shallow-clone owner/repo into a temp dir; always deletes it after."""
    validate_full_name(full_name)
    dest = Path(tempfile.mkdtemp(prefix="autofix-"))
    remote = f"https://x-access-token:{token}@github.com/{full_name}.git"
    try:
        proc = subprocess.run(
            ["git", "clone", "--depth", "1", remote, str(dest)],
            capture_output=True,
            text=True,
            timeout=_CLONE_TIMEOUT,
            shell=False,
        )
        if proc.returncode != 0:
            raise _raise_git(proc, [token])
        yield dest
    except RepoAccessError:
        raise
    except subprocess.TimeoutExpired:
        raise RepoAccessError("Cloning the repository timed out — try again.")
    finally:
        shutil.rmtree(dest, ignore_errors=True)


def tree_size_mb(path: Path) -> float:
    total = 0
    for p in path.rglob("*"):
        try:
            if p.is_file() and not p.is_symlink():
                total += p.stat().st_size
        except OSError:
            continue
    return round(total / (1024 * 1024), 1)


def clone_head_sha(clone_path: Path) -> str:
    """Full SHA of the checked-out commit in a clone. "" when unreadable.

    Never raises: a version-stamp failure must not turn into an apply 500.
    """
    try:
        proc = _run_git(["rev-parse", "HEAD"], cwd=clone_path)
    except RepoAccessError:
        return ""
    if proc.returncode != 0:
        return ""
    return (proc.stdout or "").strip()


def push_and_open_pr(
    clone_path: Path,
    full_name: str,
    token: str,
    branch: str,
    title: str,
    body: str,
) -> str:
    """Commit all changes, push the branch, open a PR against the repo default.

    Returns the PR's html_url.
    """
    validate_full_name(full_name)
    if not branch.startswith(BRANCH_PREFIX):
        raise RepoAccessError(
            "Refusing to push to a branch outside the "
            f"`{BRANCH_PREFIX}` namespace."
        )

    secrets = [token]
    proc = _run_git(["checkout", "-b", branch], cwd=clone_path)
    if proc.returncode != 0:
        raise _raise_git(proc, secrets)
    proc = _run_git(["add", "-A"], cwd=clone_path)
    if proc.returncode != 0:
        raise _raise_git(proc, secrets)
    proc = _run_git(["commit", "-m", title], cwd=clone_path)
    if proc.returncode != 0:
        raise _raise_git(proc, secrets)

    # `origin` already embeds the token (set at clone time), so a plain push
    # suffices; no credential ever appears on a command line here.
    proc = subprocess.run(
        ["git", "push", "origin", branch],
        cwd=str(clone_path),
        capture_output=True,
        text=True,
        timeout=_GIT_TIMEOUT,
        shell=False,
        env={"PATH": os.environ.get("PATH", "")},
    )
    if proc.returncode != 0:
        raise _raise_git(proc, secrets)

    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "aether-idp",
    }
    try:
        with httpx.Client(timeout=20) as client:
            repo_resp = client.get(f"https://api.github.com/repos/{full_name}", headers=headers)
            if repo_resp.status_code != 200:
                raise RepoAccessError("Pushed, but reading the repo's default branch failed.")
            base = repo_resp.json().get("default_branch") or "main"
            pr_resp = client.post(
                f"https://api.github.com/repos/{full_name}/pulls",
                headers=headers,
                json={"title": title, "body": body, "head": branch, "base": base},
            )
            if pr_resp.status_code not in (200, 201):
                raise RepoAccessError(
                    "Pushed, but opening the pull request failed. "
                    "Open it manually from the pushed branch."
                )
            return pr_resp.json().get("html_url") or ""
    except RepoAccessError:
        raise
    except Exception as exc:
        raise RepoAccessError(redact(f"GitHub request failed: {exc}", secrets)[:300])
