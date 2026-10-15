"""autofix router tests — subprocesses, clones and GitHub are mocked.

Run from backend/: venv\\Scripts\\python.exe -m pytest tests\\ -q
"""

import asyncio
import json
from contextlib import contextmanager
from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import routers.autofix as afx


def run(coro):
    return asyncio.run(coro)


def _user():
    return SimpleNamespace(id="user-1", email="u@example.com")


class FakeQuery:
    def __init__(self, db, table):
        self._db = db
        self._table = table
        self._rows = list(db.get(table, []))

    def select(self, *a):
        return self

    def eq(self, key, value):
        self._rows = [r for r in self._rows if r.get(key) == value]
        return self

    def single(self):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, n):
        self._rows = self._rows[:n]
        return self

    def gte(self, *a):
        return self

    def insert(self, row):
        self._db.setdefault(self._table, []).append(dict(row))
        self._rows = [row]
        return self

    def execute(self):
        self.data = list(self._rows)
        return self


class SingleQuery(FakeQuery):
    def execute(self):
        self.data = self._rows[0] if self._rows else None
        return self


class FakeSupabase:
    def __init__(self, projects=None, runs=None):
        self.db = {
            "projects": projects or [],
            "autofix_runs": runs or [],
        }

    def table(self, name):
        if name == "projects":
            return SingleQuery(self.db, name)
        return FakeQuery(self.db, name)


def _project_row():
    return {
        "id": "p1",
        "owner_id": "user-1",
        "repo_owner": "octo",
        "repo_name": "demo",
    }


def _wire(monkeypatch, supabase, token="TOK", login="octocat"):
    monkeypatch.setattr(afx, "supabase", supabase, raising=False)
    monkeypatch.setattr(
        afx, "get_stored_token", lambda uid: (token, login), raising=False
    )

    async def _noop_log(*a, **k):
        return None

    monkeypatch.setattr(afx.audit_service, "log", _noop_log, raising=False)


def _clone_to(path):
    @contextmanager
    def _cm(full_name, token):
        yield path

    return _cm


def _vite_fixture(tmp_path):
    (tmp_path / "package.json").write_text(
        json.dumps({"devDependencies": {"vite": "^5"}}), encoding="utf-8"
    )
    return tmp_path


def test_scan_reports_missing_dockerfile_and_lint(monkeypatch, tmp_path):
    supabase = FakeSupabase(projects=[_project_row()])
    _wire(monkeypatch, supabase)
    monkeypatch.setattr(
        afx.repo_service, "temporary_clone", _clone_to(_vite_fixture(tmp_path)),
        raising=False,
    )
    monkeypatch.setattr(
        afx.lint_runner, "run_lint_fixes",
        lambda p: [{"tool": "eslint", "fixed_files": [],
                    "remaining_errors": 3, "skipped_reason": None}],
        raising=False,
    )
    out = run(afx.scan_repo(afx.ProjectIn(project_id="p1"), _user()))
    assert out["repo"] == "octo/demo"
    assert out["stack"] == "frontend"
    assert out["apply_enabled"] is True
    assert out["apply_blocked_reason"] is None
    types = [f["type"] for f in out["findings"]]
    assert "missing_dockerfile" in types
    assert "lint" in types


def test_scan_blocked_when_nothing_fixable(monkeypatch, tmp_path):
    supabase = FakeSupabase(projects=[_project_row()])
    _wire(monkeypatch, supabase)
    (tmp_path / "Dockerfile").write_text("FROM x", encoding="utf-8")
    (tmp_path / "pyproject.toml").write_text("", encoding="utf-8")
    monkeypatch.setattr(
        afx.repo_service, "temporary_clone", _clone_to(tmp_path), raising=False
    )
    monkeypatch.setattr(
        afx.lint_runner, "run_lint_fixes",
        lambda p: [{"tool": "ruff", "fixed_files": [],
                    "remaining_errors": 0, "skipped_reason": None}],
        raising=False,
    )
    out = run(afx.scan_repo(afx.ProjectIn(project_id="p1"), _user()))
    assert out["apply_enabled"] is False
    assert out["apply_blocked_reason"] == "Nothing fixable found."


def test_scan_blocked_when_repo_too_large(monkeypatch, tmp_path):
    supabase = FakeSupabase(projects=[_project_row()])
    _wire(monkeypatch, supabase)
    monkeypatch.setattr(
        afx.repo_service, "temporary_clone", _clone_to(tmp_path), raising=False
    )
    monkeypatch.setattr(afx.repo_service, "tree_size_mb", lambda p: 250.0, raising=False)
    monkeypatch.setattr(
        afx.lint_runner, "run_lint_fixes", lambda p: [], raising=False
    )
    out = run(afx.scan_repo(afx.ProjectIn(project_id="p1"), _user()))
    assert out["apply_enabled"] is False
    assert "200 MB" in out["apply_blocked_reason"]


def test_scan_requires_connected_token(monkeypatch):
    supabase = FakeSupabase(projects=[_project_row()])
    _wire(monkeypatch, supabase, token="")
    with pytest.raises(HTTPException) as excinfo:
        run(afx.scan_repo(afx.ProjectIn(project_id="p1"), _user()))
    assert excinfo.value.status_code == 400
    assert "GitHub Auto-Fix" in excinfo.value.detail


def test_scan_never_leaks_token_in_errors(monkeypatch):
    supabase = FakeSupabase(projects=[_project_row()])
    _wire(monkeypatch, supabase, token="SECRET123")

    @contextmanager
    def _boom(full_name, token):
        raise afx.RepoAccessError(
            "fatal: https://x-access-token:SECRET123@github.com/o/r.git: SECRET123"
        )
        yield

    monkeypatch.setattr(afx.repo_service, "temporary_clone", _boom, raising=False)
    with pytest.raises(HTTPException) as excinfo:
        run(afx.scan_repo(afx.ProjectIn(project_id="p1"), _user()))
    assert "SECRET123" not in str(excinfo.value.detail)


def test_scan_rate_limit(monkeypatch):
    supabase = FakeSupabase(projects=[_project_row()])
    _wire(monkeypatch, supabase)
    afx._scan_counts["user-1"] = (date.today().isoformat(), 20)
    try:
        with pytest.raises(HTTPException) as excinfo:
            run(afx.scan_repo(afx.ProjectIn(project_id="p1"), _user()))
        assert excinfo.value.status_code == 429
    finally:
        afx._scan_counts.pop("user-1", None)


def test_apply_no_changes_records_run(monkeypatch, tmp_path):
    supabase = FakeSupabase(projects=[_project_row()])
    _wire(monkeypatch, supabase)
    (tmp_path / "Dockerfile").write_text("FROM x", encoding="utf-8")
    monkeypatch.setattr(
        afx.repo_service, "temporary_clone", _clone_to(tmp_path), raising=False
    )
    monkeypatch.setattr(
        afx.lint_runner, "run_lint_fixes", lambda p: [], raising=False
    )
    out = run(afx.apply_fixes(afx.ApplyIn(project_id="p1"), _user()))
    assert out["status"] == "no_changes"
    assert supabase.db["autofix_runs"][0]["status"] == "no_changes"


def test_apply_opens_pr_on_autofix_branch(monkeypatch, tmp_path):
    supabase = FakeSupabase(projects=[_project_row()])
    _wire(monkeypatch, supabase)
    monkeypatch.setattr(
        afx.repo_service, "temporary_clone",
        _clone_to(_vite_fixture(tmp_path)), raising=False,
    )
    monkeypatch.setattr(
        afx.lint_runner, "run_lint_fixes",
        lambda p: [{"tool": "eslint", "fixed_files": ["a.js"],
                    "remaining_errors": 0, "skipped_reason": None}],
        raising=False,
    )
    seen = {}

    def _fake_push(clone_path, full_name, token, branch, title, body):
        seen.update(branch=branch, token=token)
        assert (tmp_path / "Dockerfile").exists()  # generator ran inside the clone
        return "https://github.com/octo/demo/pull/1"

    monkeypatch.setattr(afx.repo_service, "push_and_open_pr", _fake_push, raising=False)
    out = run(afx.apply_fixes(afx.ApplyIn(project_id="p1"), _user()))
    assert out["status"] == "pr_opened"
    assert out["branch"].startswith("aether/autofix-")
    assert out["pr_url"].endswith("/pull/1")
    assert out["files"] == [".dockerignore", "Dockerfile", "a.js"]
    assert seen["token"] == "TOK"
    assert supabase.db["autofix_runs"][0]["status"] == "pr_opened"


def test_apply_daily_limit_is_429(monkeypatch):
    rows = [{"id": str(i), "user_id": "user-1", "status": "pr_opened"} for i in range(10)]
    supabase = FakeSupabase(projects=[_project_row()], runs=rows)
    _wire(monkeypatch, supabase)
    with pytest.raises(HTTPException) as excinfo:
        run(afx.apply_fixes(afx.ApplyIn(project_id="p1"), _user()))
    assert excinfo.value.status_code == 429


def test_runs_returns_last_five_newest_first(monkeypatch):
    supabase = FakeSupabase()
    _wire(monkeypatch, supabase)
    out = run(afx.list_runs(project_id="p1", current_user=_user()))
    assert out == {"runs": []}


def _wire_ai(monkeypatch):
    monkeypatch.setattr(afx.ai_fix.settings, "OPENAI_API_KEY", "sk-test", raising=False)


def test_scan_labels_files_ai_or_triage(monkeypatch, tmp_path):
    supabase = FakeSupabase(projects=[_project_row()])
    _wire(monkeypatch, supabase)
    _wire_ai(monkeypatch)
    (tmp_path / "package.json").write_text('{"devDependencies": {"vite": "^5"}}', encoding="utf-8")
    (tmp_path / "small.js").write_text("const x = 1;\n", encoding="utf-8")
    (tmp_path / "big.js").write_text("const y = 2;\n", encoding="utf-8")
    monkeypatch.setattr(
        afx.repo_service, "temporary_clone", _clone_to(tmp_path), raising=False
    )
    monkeypatch.setattr(
        afx.lint_runner, "run_lint_fixes",
        lambda p: [{
            "tool": "eslint", "fixed_files": [], "remaining_errors": 15,
            "skipped_reason": None,
            "files": [
                {"file": "small.js", "errors": 3, "fixable": 0,
                 "messages": [{"rule": "no-var", "message": "m", "line": 1}]},
                {"file": "big.js", "errors": 12, "fixable": 0,
                 "messages": [{"rule": "no-undef", "message": "m", "line": 1}]},
            ],
        }],
        raising=False,
    )
    out = run(afx.scan_repo(afx.ProjectIn(project_id="p1"), _user()))
    assert out["ai_available"] is True
    lint = next(f for f in out["findings"] if f["type"] == "lint")
    by_file = {d["file"]: d for d in lint["files"]}
    assert by_file["small.js"]["automation"] == "ai"
    assert by_file["big.js"]["automation"] == "triage"
    assert "unused" in by_file["small.js"]["cause"] or by_file["small.js"]["cause"]


def test_apply_ai_fix_validated_and_included(monkeypatch, tmp_path):
    supabase = FakeSupabase(projects=[_project_row()])
    _wire(monkeypatch, supabase)
    _wire_ai(monkeypatch)
    (tmp_path / "package.json").write_text('{"devDependencies": {"vite": "^5"}}', encoding="utf-8")
    (tmp_path / "a.js").write_text("var x = 1;\n", encoding="utf-8")
    monkeypatch.setattr(
        afx.repo_service, "temporary_clone", _clone_to(tmp_path), raising=False
    )
    monkeypatch.setattr(
        afx.lint_runner, "run_lint_fixes",
        lambda p: [{
            "tool": "eslint", "fixed_files": [], "remaining_errors": 2,
            "skipped_reason": None,
            "files": [{"file": "a.js", "errors": 2, "fixable": 0,
                       "messages": [{"rule": "no-var", "message": "m", "line": 1}]}],
        }],
        raising=False,
    )
    monkeypatch.setattr(
        afx.ai_fix, "fix_file", lambda *a: ("const x = 1;\n", None), raising=False
    )
    monkeypatch.setattr(
        afx.lint_runner, "lint_file_errors", lambda *a: (0, []), raising=False
    )
    pushed = {}

    def _fake_push(clone_path, full_name, token, branch, title, body):
        assert (tmp_path / "a.js").read_text(encoding="utf-8") == "const x = 1;\n"
        assert "AI-assisted" in body
        return "https://github.com/octo/demo/pull/2"

    monkeypatch.setattr(afx.repo_service, "push_and_open_pr", _fake_push, raising=False)
    out = run(afx.apply_fixes(afx.ApplyIn(project_id="p1", use_ai=True), _user()))
    assert out["status"] == "pr_opened"
    assert "a.js" in out["files"]
    assert out["ai_fixed"] == ["a.js"]


def test_apply_ai_fix_reverted_when_not_improved(monkeypatch, tmp_path):
    supabase = FakeSupabase(projects=[_project_row()])
    _wire(monkeypatch, supabase)
    _wire_ai(monkeypatch)
    (tmp_path / "Dockerfile").write_text("FROM x", encoding="utf-8")
    (tmp_path / "a.js").write_text("var x = 1;\n", encoding="utf-8")
    monkeypatch.setattr(
        afx.repo_service, "temporary_clone", _clone_to(tmp_path), raising=False
    )
    monkeypatch.setattr(
        afx.lint_runner, "run_lint_fixes",
        lambda p: [{
            "tool": "eslint", "fixed_files": ["other.js"], "remaining_errors": 2,
            "skipped_reason": None,
            "files": [{"file": "a.js", "errors": 2, "fixable": 0,
                       "messages": [{"rule": "no-var", "message": "m", "line": 1}]}],
        }],
        raising=False,
    )
    monkeypatch.setattr(
        afx.ai_fix, "fix_file", lambda *a: ("worse code (((", None), raising=False
    )
    monkeypatch.setattr(
        afx.lint_runner, "lint_file_errors", lambda *a: (9, []), raising=False
    )
    monkeypatch.setattr(
        afx.repo_service, "push_and_open_pr",
        lambda *a: "https://github.com/octo/demo/pull/3", raising=False,
    )
    out = run(afx.apply_fixes(afx.ApplyIn(project_id="p1", use_ai=True), _user()))
    assert out["status"] == "pr_opened"
    assert "a.js" not in out["files"]  # reverted, not committed
    assert (tmp_path / "a.js").read_text(encoding="utf-8") == "var x = 1;\n"
    assert any("reverted" in n for n in out["ai_notes"])


def test_apply_creates_triage_tickets_for_large(monkeypatch, tmp_path):
    supabase = FakeSupabase(projects=[_project_row()])
    _wire(monkeypatch, supabase)
    (tmp_path / "Dockerfile").write_text("FROM x", encoding="utf-8")
    (tmp_path / "big.js").write_text("const y = 2;\n", encoding="utf-8")
    monkeypatch.setattr(
        afx.repo_service, "temporary_clone", _clone_to(tmp_path), raising=False
    )
    monkeypatch.setattr(
        afx.lint_runner, "run_lint_fixes",
        lambda p: [{
            "tool": "eslint", "fixed_files": [], "remaining_errors": 12,
            "skipped_reason": None,
            "files": [{"file": "big.js", "errors": 12, "fixable": 0,
                       "messages": [{"rule": "no-undef", "message": "m", "line": 1}]}],
        }],
        raising=False,
    )

    async def _fake_ticket(*a, **k):
        return {"id": "t-9", "title": "Auto-Fix: big.js"}

    monkeypatch.setattr(
        afx.triage_mod, "create_triage_ticket", _fake_ticket, raising=False
    )
    out = run(afx.apply_fixes(afx.ApplyIn(project_id="p1", use_ai=False), _user()))
    assert out["status"] == "no_changes"  # no code changed...
    assert out["tickets"] == [{"id": "t-9", "title": "Auto-Fix: big.js"}]


def test_apply_use_ai_false_skips_llm(monkeypatch, tmp_path):
    supabase = FakeSupabase(projects=[_project_row()])
    _wire(monkeypatch, supabase)
    _wire_ai(monkeypatch)
    (tmp_path / "package.json").write_text('{"devDependencies": {"vite": "^5"}}', encoding="utf-8")
    (tmp_path / "Dockerfile").write_text("FROM x", encoding="utf-8")
    (tmp_path / "a.js").write_text("var x = 1;\n", encoding="utf-8")
    monkeypatch.setattr(
        afx.repo_service, "temporary_clone", _clone_to(tmp_path), raising=False
    )
    monkeypatch.setattr(
        afx.lint_runner, "run_lint_fixes",
        lambda p: [{
            "tool": "eslint", "fixed_files": [], "remaining_errors": 2,
            "skipped_reason": None,
            "files": [{"file": "a.js", "errors": 2, "fixable": 0, "messages": []}],
        }],
        raising=False,
    )

    def _boom(*a):
        raise AssertionError("LLM must not be called when use_ai=False")

    monkeypatch.setattr(afx.ai_fix, "fix_file", _boom, raising=False)
    monkeypatch.setattr(
        afx.repo_service, "push_and_open_pr",
        lambda *a: "https://github.com/octo/demo/pull/4", raising=False,
    )
    out = run(afx.apply_fixes(afx.ApplyIn(project_id="p1", use_ai=False), _user()))
    assert out["status"] == "pr_opened"  # only the generated .dockerignore
    assert out["ai_fixed"] == []
