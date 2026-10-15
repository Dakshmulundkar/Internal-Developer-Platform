"""lint_runner safety tests — the runner reports, never explodes.

Run from backend/: venv\\Scripts\\python.exe -m pytest tests\\ -q
"""

from services.autofix.lint_runner import _changed_files, run_lint_fixes


def test_bare_dir_gets_skipped_entries_not_exceptions(tmp_path):
    entries = run_lint_fixes(tmp_path)
    assert len(entries) == 2
    for entry in entries:
        assert set(entry) == {"tool", "fixed_files", "remaining_errors", "skipped_reason", "files"}
        assert entry["skipped_reason"]  # nothing configured → both skipped
        assert entry["fixed_files"] == []
        assert entry["files"] == []


def test_ruff_config_without_ruff_never_raises(tmp_path):
    (tmp_path / "pyproject.toml").write_text('[tool.ruff]\n', encoding="utf-8")
    entries = run_lint_fixes(tmp_path)
    ruff = next(e for e in entries if e["tool"] == "ruff")
    # either ruff is installed and ran clean on an empty dir, or it skipped
    assert isinstance(ruff["remaining_errors"], int)


def test_changed_files_empty_outside_git(tmp_path):
    assert _changed_files(tmp_path) == []
