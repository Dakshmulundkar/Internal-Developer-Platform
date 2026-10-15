"""Stack detection + Dockerfile generation for Repo Auto-Fix (Task 77).

Rules: detect first, generate only what's missing, never overwrite.
A stack we don't recognize yields no files (scan reports it, apply stops).
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).parent / "templates"

FRONTEND_MARKERS = ("vite", "react")
BACKEND_MARKERS = ("fastapi", "uvicorn")


def _package_json_deps(path: Path) -> dict:
    try:
        data = json.loads((path / "package.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    deps = {}
    for key in ("dependencies", "devDependencies"):
        section = data.get(key)
        if isinstance(section, dict):
            deps.update(section)
    return deps


def _backend_markers_present(path: Path) -> bool:
    candidates = list(path.glob("requirements*.txt")) + [
        path / "pyproject.toml",
        path / "setup.py",
        path / "app.py",
        path / "main.py",
    ]
    for candidate in candidates:
        if not candidate.is_file():
            continue
        try:
            text = candidate.read_text(encoding="utf-8", errors="ignore").lower()
        except OSError:
            continue
        if any(marker in text for marker in BACKEND_MARKERS):
            return True
    return False


def detect_stack(path: Path) -> str:
    """One of frontend | backend | fullstack | unknown."""
    frontend = any(m in _package_json_deps(path) for m in FRONTEND_MARKERS)
    backend = _backend_markers_present(path)
    if frontend and backend:
        return "fullstack"
    if frontend:
        return "frontend"
    if backend:
        return "backend"
    return "unknown"


def _write_if_missing(dest: Path, template_name: str) -> str | None:
    if dest.exists():
        return None
    try:
        dest.write_text(
            (TEMPLATES_DIR / template_name).read_text(encoding="utf-8"),
            encoding="utf-8",
        )
    except OSError as exc:
        logger.warning("Could not write %s: %s", dest, exc)
        return None
    return dest.name


def generate_dockerfiles(path: Path) -> list:
    """Write missing Dockerfiles for the detected stack.

    - frontend-only / backend-only repos → `Dockerfile` from the matching template
    - fullstack repos → `Dockerfile.frontend` + `Dockerfile.backend`
    - unknown → nothing
    Also writes a `.dockerignore` when missing. Returns written file names.
    """
    stack = detect_stack(path)
    written = []
    if stack == "frontend":
        name = _write_if_missing(path / "Dockerfile", "Dockerfile.frontend")
    elif stack == "backend":
        name = _write_if_missing(path / "Dockerfile", "Dockerfile.backend")
    elif stack == "fullstack":
        names = [
            _write_if_missing(path / "Dockerfile.frontend", "Dockerfile.frontend"),
            _write_if_missing(path / "Dockerfile.backend", "Dockerfile.backend"),
        ]
        name = None
        written.extend(n for n in names if n)
    else:
        return written
    if name:
        written.insert(0, name)
    ignore = _write_if_missing(path / ".dockerignore", "dockerignore")
    if ignore:
        written.append(ignore)
    return written
