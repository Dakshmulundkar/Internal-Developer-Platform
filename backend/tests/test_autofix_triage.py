"""triage ticket tests — incidents table is faked, no Supabase.

Run from backend/: venv\\Scripts\\python.exe -m pytest tests\\ -q
"""

import asyncio

import services.autofix.triage as triage_mod
from services.autofix.triage import _severity_for, create_triage_ticket


def run(coro):
    return asyncio.run(coro)


class _FakeQuery:
    def __init__(self, db):
        self._db = db

    def insert(self, row):
        row = dict(row)
        row.setdefault("id", "ticket-1")
        self._db.append(row)
        self._rows = [row]
        return self

    def execute(self):
        self.data = list(self._rows)
        return self


class _FakeSupabase:
    def __init__(self):
        self.rows = []

    def table(self, name):
        assert name == "incidents"
        return _FakeQuery(self.rows)


def test_severity_mapping():
    assert _severity_for(25) == "critical"
    assert _severity_for(15) == "high"
    assert _severity_for(5) == "medium"
    assert _severity_for(1) == "medium"


def test_ticket_row_uses_autofix_source(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr(triage_mod, "supabase", fake, raising=False)

    async def _noop(*a, **k):
        return None

    monkeypatch.setattr(triage_mod.audit_service, "log", _noop, raising=False)

    ticket = run(
        create_triage_ticket(
            "user-1", "u@example.com", "p1", "octo/demo", "eslint",
            "src/a.js", 12, "unused variables", "12 errors",
        )
    )
    assert ticket["id"] == "ticket-1"
    assert "src/a.js" in ticket["title"]
    row = fake.rows[0]
    assert row["source"] == "autofix"
    assert row["project_id"] == "p1"
    assert row["severity"] == "high"
    assert row["security_metadata"]["tool"] == "eslint"
