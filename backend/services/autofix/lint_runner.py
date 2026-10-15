"""Safe lint auto-fix for Repo Auto-Fix (Task 78).

Never raises: every tool either returns what it fixed or explains why it
was skipped. Designed for throwaway clones — `--fix` runs only where the
repo already has the tool configured and pinned.
"""

import json
import logging
import os
import subprocess
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

NPM_TIMEOUT = 300
ESLINT_TIMEOUT = 120
RUFF_TIMEOUT = 60
# Bounds for the per-file breakdown (keeps scan responses small).
MAX_FILES_PER_TOOL = 20
MAX_MESSAGES_PER_FILE = 10


def _changed_files(path: Path) -> list:
    """Files modified in the working tree (i.e. what --fix changed)."""
    try:
        proc = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(path),
            capture_output=True,
            text=True,
            timeout=30,
            shell=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    files = []
    for line in (proc.stdout or "").splitlines():
        parts = line.strip().split(maxsplit=1)
        if len(parts) == 2 and parts[0] in ("M", " M", "AM", "MM"):
            files.append(parts[1].strip('"'))
    return sorted(files)


def _minimal_env() -> dict:
    keep = ("PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "HOME", "LANG",
            "npm_config_cache")
    return {k: v for k, v in os.environ.items() if k in keep}


def _rel(path: Path, file_path: str) -> str:
    try:
        return str(Path(file_path).resolve().relative_to(path.resolve()))
    except (OSError, ValueError):
        return Path(file_path).name


def _eslint_file_breakdown(path: Path, results: list) -> list:
    """Per-file error detail, bounded: [{file, errors, fixable, messages}]."""
    files = []
    for result in results or []:
        errors = int(result.get("errorCount", 0) or 0)
        if errors <= 0:
            continue
        messages = []
        for msg in (result.get("messages") or [])[:MAX_MESSAGES_PER_FILE]:
            if int(msg.get("severity", 2) or 2) != 2:
                continue
            messages.append(
                {
                    "rule": msg.get("ruleId") or "unknown",
                    "message": str(msg.get("message") or "")[:200],
                    "line": msg.get("line"),
                }
            )
        if not messages:
            continue
        files.append(
            {
                "file": _rel(path, result.get("filePath", "")),
                "errors": errors,
                "fixable": int(result.get("fixableErrorCount", 0) or 0),
                "messages": messages,
            }
        )
        if len(files) >= MAX_FILES_PER_TOOL:
            break
    return files


def _ruff_file_breakdown(path: Path, diagnostics: list) -> list:
    """Group ruff's flat diagnostics per file, bounded like eslint."""
    by_file: dict = {}
    for diag in diagnostics or []:
        name = _rel(path, diag.get("filename", ""))
        bucket = by_file.setdefault(name, {"file": name, "errors": 0,
                                           "fixable": 0, "messages": []})
        bucket["errors"] += 1
        if len(bucket["messages"]) < MAX_MESSAGES_PER_FILE:
            loc = diag.get("location") or {}
            bucket["messages"].append(
                {
                    "rule": diag.get("code") or "unknown",
                    "message": str(diag.get("message") or "")[:200],
                    "line": loc.get("row"),
                }
            )
    return list(by_file.values())[:MAX_FILES_PER_TOOL]


def lint_file_errors(path: Path, rel_file: str, tool: str) -> tuple:
    """Re-lint a single file. Returns (error_count, messages). Never raises."""
    target = str((path / rel_file).resolve())
    try:
        if tool == "eslint":
            proc = subprocess.run(
                ["npx", "eslint", target, "-f", "json"],
                cwd=str(path), capture_output=True, text=True,
                timeout=ESLINT_TIMEOUT, shell=False, env=_minimal_env(),
            )
            results = json.loads(proc.stdout or "[]")
            breakdown = _eslint_file_breakdown(path, results)
            total = sum(f["errors"] for f in breakdown)
            return total, breakdown
        if tool == "ruff":
            proc = subprocess.run(
                [sys.executable, "-m", "ruff", "check", "--output-format", "json", target],
                cwd=str(path), capture_output=True, text=True,
                timeout=RUFF_TIMEOUT, shell=False,
            )
            breakdown = _ruff_file_breakdown(path, json.loads(proc.stdout or "[]"))
            total = sum(f["errors"] for f in breakdown)
            return total, breakdown
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError, TypeError):
        pass
    return -1, []


def _has_eslint(path: Path) -> bool:
    if not (path / "package.json").is_file():
        return False
    if not any((path / lock).exists() for lock in
               ("package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml")):
        return False
    try:
        deps = json.loads((path / "package.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    all_deps = {**(deps.get("dependencies") or {}),
                **(deps.get("devDependencies") or {})}
    return "eslint" in all_deps


def _eslint_entry(path: Path) -> dict:
    entry = {"tool": "eslint", "fixed_files": [], "remaining_errors": 0,
             "skipped_reason": None, "files": []}
    if not _has_eslint(path):
        entry["skipped_reason"] = "no eslint setup found (package.json + lockfile required)"
        return entry
    env = _minimal_env()
    try:
        proc = subprocess.run(
            ["npm", "ci", "--no-audit", "--no-fund"],
            cwd=str(path), capture_output=True, text=True,
            timeout=NPM_TIMEOUT, shell=False, env=env,
        )
        if proc.returncode != 0:
            entry["skipped_reason"] = "npm ci failed — dependencies could not be installed"
            return entry
        subprocess.run(
            ["npx", "eslint", ".", "--fix"],
            cwd=str(path), capture_output=True, text=True,
            timeout=ESLINT_TIMEOUT, shell=False, env=env,
        )
        entry["fixed_files"] = _changed_files(path)
        recount = subprocess.run(
            ["npx", "eslint", ".", "-f", "json"],
            cwd=str(path), capture_output=True, text=True,
            timeout=ESLINT_TIMEOUT, shell=False, env=env,
        )
        try:
            results = json.loads(recount.stdout or "[]")
            entry["remaining_errors"] = sum(r.get("errorCount", 0) for r in results)
            entry["files"] = _eslint_file_breakdown(path, results)
        except (json.JSONDecodeError, AttributeError, TypeError):
            entry["remaining_errors"] = 0
            entry["files"] = []
    except FileNotFoundError:
        entry["skipped_reason"] = "npm not available on the server"
    except subprocess.TimeoutExpired:
        entry["skipped_reason"] = "eslint run timed out"
    except OSError as exc:
        entry["skipped_reason"] = f"eslint could not run: {exc.strerror or exc}"
    return entry


def _has_ruff_config(path: Path) -> bool:
    if (path / ".ruff.toml").is_file() or (path / "ruff.toml").is_file():
        return True
    pyproject = path / "pyproject.toml"
    if not pyproject.is_file():
        return False
    try:
        return "[tool.ruff]" in pyproject.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False


def _ruff_entry(path: Path) -> dict:
    entry = {"tool": "ruff", "fixed_files": [], "remaining_errors": 0,
             "skipped_reason": None, "files": []}
    if not _has_ruff_config(path):
        entry["skipped_reason"] = "no ruff config found"
        return entry
    try:
        import ruff  # noqa: F401 — only a presence check; we shell out below
    except ImportError:
        entry["skipped_reason"] = "ruff not installed"
        return entry
    try:
        subprocess.run(
            [sys.executable, "-m", "ruff", "check", "--fix", "."],
            cwd=str(path), capture_output=True, text=True,
            timeout=RUFF_TIMEOUT, shell=False,
        )
        entry["fixed_files"] = _changed_files(path)
        recount = subprocess.run(
            [sys.executable, "-m", "ruff", "check", "--output-format", "json", "."],
            cwd=str(path), capture_output=True, text=True,
            timeout=RUFF_TIMEOUT, shell=False,
        )
        try:
            entry["remaining_errors"] = len(json.loads(recount.stdout or "[]"))
            entry["files"] = _ruff_file_breakdown(
                path, json.loads(recount.stdout or "[]"))
        except (json.JSONDecodeError, TypeError):
            entry["remaining_errors"] = 0
            entry["files"] = []
    except subprocess.TimeoutExpired:
        entry["skipped_reason"] = "ruff run timed out"
    except OSError as exc:
        entry["skipped_reason"] = f"ruff could not run: {exc.strerror or exc}"
    return entry


def run_lint_fixes(path: Path) -> list:
    """Run configured linters' --fix; never raises, always reports."""
    return [_eslint_entry(path), _ruff_entry(path)]
