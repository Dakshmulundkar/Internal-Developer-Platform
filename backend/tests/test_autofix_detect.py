"""Stack detection + Dockerfile generation tests (fixture dirs, no network).

Run from backend/: venv\\Scripts\\python.exe -m pytest tests\\ -q
"""

import json

from services.autofix.detect import detect_stack, generate_dockerfiles


def _vite_dir(path):
    (path / "package.json").write_text(
        json.dumps({"dependencies": {"react": "^18"}, "devDependencies": {"vite": "^5"}}),
        encoding="utf-8",
    )
    (path / "package-lock.json").write_text("{}", encoding="utf-8")
    return path


def _fastapi_dir(path):
    (path / "pyproject.toml").write_text(
        '[project]\nname="x"\ndependencies=["fastapi", "uvicorn"]\n',
        encoding="utf-8",
    )
    return path


def test_detect_frontend(tmp_path):
    assert detect_stack(_vite_dir(tmp_path)) == "frontend"


def test_detect_backend(tmp_path):
    assert detect_stack(_fastapi_dir(tmp_path)) == "backend"


def test_detect_fullstack(tmp_path):
    _vite_dir(tmp_path)
    _fastapi_dir(tmp_path)
    assert detect_stack(tmp_path) == "fullstack"


def test_detect_unknown(tmp_path):
    (tmp_path / "notes.txt").write_text("hello", encoding="utf-8")
    assert detect_stack(tmp_path) == "unknown"


def test_generate_frontend_writes_dockerfile_and_ignore(tmp_path):
    _vite_dir(tmp_path)
    written = generate_dockerfiles(tmp_path)
    assert "Dockerfile" in written
    assert ".dockerignore" in written
    assert (tmp_path / "Dockerfile").read_text(encoding="utf-8").startswith("#")


def test_generate_never_overwrites(tmp_path):
    _fastapi_dir(tmp_path)
    (tmp_path / "Dockerfile").write_text("HANDMADE", encoding="utf-8")
    written = generate_dockerfiles(tmp_path)
    assert "Dockerfile" not in written
    assert (tmp_path / "Dockerfile").read_text(encoding="utf-8") == "HANDMADE"


def test_generate_fullstack_writes_two_files(tmp_path):
    _vite_dir(tmp_path)
    _fastapi_dir(tmp_path)
    written = generate_dockerfiles(tmp_path)
    assert "Dockerfile.frontend" in written
    assert "Dockerfile.backend" in written
    assert not (tmp_path / "Dockerfile").exists()


def test_generate_unknown_writes_nothing(tmp_path):
    assert generate_dockerfiles(tmp_path) == []
