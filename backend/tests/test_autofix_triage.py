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


# ── Real-time + up-to-date version ──────────────────────────────────────────

SHA_A = "aaa1111aaa1111aaa1111aaa1111aaa1111aaa1"
SHA_B = "bbb2222bbb2222bbb2222bbb2222bbb2222bbb2"


class _RichTable:
    """select/insert/update fake with eq-filters and op recording."""

    def __init__(self, db):
        self._db = db
        self._op = None
        self._payload = None
        self._filters = {}

    def select(self, *a, **k):
        self._op = "select"
        return self

    def insert(self, row):
        self._op = "insert"
        row = dict(row)
        row.setdefault("id", f"t-{len(self._db['incidents']) + 1}")
        row.setdefault("status", "open")
        self._db["incidents"].append(row)
        self._db["calls"].append(("insert", dict(row)))
        self._rows = [row]
        return self

    def update(self, patch):
        self._op = "update"
        self._payload = dict(patch)
        self._db["calls"].append(("update", dict(patch)))
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def execute(self):
        if self._op == "update":
            rows = [r for r in self._db["incidents"]
                    if all(r.get(k) == v for k, v in self._filters.items())]
            for r in rows:
                r.update(self._payload)
            self.data = rows
            return self
        rows = [r for r in self._db["incidents"]
                if all(r.get(k) == v for k, v in self._filters.items())]
        self.data = rows
        return self


class _RichDB:
    def __init__(self, incidents=None):
        self.store = {"incidents": incidents or [], "calls": []}

    def table(self, name):
        assert name == "incidents"
        return _RichTable(self.store)


def _open_ticket(sha=SHA_A):
    return {"id": "t-old", "project_id": "p1", "source": "autofix",
            "status": "open", "title": "Auto-Fix: 12 eslint errors in src/a.js (octo/demo)",
            "description": "old", "severity": "high",
            "security_metadata": {"repo": "octo/demo", "file": "src/a.js",
                                  "tool": "eslint", "error_count": 12,
                                  "commit_sha": sha, "branch": "main"}}


def _wire_rich(monkeypatch, incidents=None):
    import services.websocket_service as ws

    db = _RichDB(incidents)
    monkeypatch.setattr(triage_mod, "supabase", db, raising=False)

    async def _noop(*a, **k):
        return None

    monkeypatch.setattr(triage_mod.audit_service, "log", _noop, raising=False)
    calls = []
    monkeypatch.setattr(ws, "broadcast_to_project", _recorder(calls), raising=False)
    return db, calls


def _recorder(calls):
    async def _record(project_id, event_type, data):
        calls.append((project_id, event_type, data))
    return _record


def _create(**over):
    kw = dict(user_id="user-1", user_name="u@example.com", project_id="p1",
              repo="octo/demo", tool="eslint", rel_file="src/a.js",
              error_count=12, cause="unused variables", reason_large="12 errors")
    kw.update(over)
    return run(create_triage_ticket(**kw))


def test_triage_broadcasts_created_live(monkeypatch):
    db, calls = _wire_rich(monkeypatch)

    ticket = _create()

    assert ticket["id"]
    assert calls and calls[0][0] == "p1" and calls[0][1] == "incident.created"
    assert calls[0][2]["id"] == ticket["id"]


def test_triage_stamps_scanned_version(monkeypatch):
    db, calls = _wire_rich(monkeypatch)

    _create(commit_sha=SHA_A, branch="main")

    meta = db.store["incidents"][0]["security_metadata"]
    assert meta["commit_sha"] == SHA_A and meta["branch"] == "main"
    assert SHA_A[:7] in db.store["incidents"][0]["description"]


def test_triage_dedupes_same_version(monkeypatch):
    db, calls = _wire_rich(monkeypatch, [_open_ticket(sha=SHA_A)])

    ticket = _create(commit_sha=SHA_A, branch="main")

    assert ticket["id"] == "t-old"  # no duplicate row
    assert len(db.store["incidents"]) == 1
    assert [c for c in db.store["calls"] if c[0] == "insert"] == []
    assert [c for c in db.store["calls"] if c[0] == "update"] == []
    assert calls == []  # nothing changed → nothing to broadcast


def test_triage_refreshes_ticket_on_new_version(monkeypatch):
    db, calls = _wire_rich(monkeypatch, [_open_ticket(sha=SHA_A)])

    ticket = _create(commit_sha=SHA_B, branch="main", error_count=14,
                     reason_large="14 errors")

    assert ticket["id"] == "t-old"
    assert len(db.store["incidents"]) == 1  # updated, not duplicated
    row = db.store["incidents"][0]
    assert row["security_metadata"]["commit_sha"] == SHA_B
    assert "14 eslint errors" in row["title"]
    assert calls and calls[0][1] == "incident.changed"
    assert calls[0][2]["id"] == "t-old"


def test_triage_survives_broadcast_failure(monkeypatch):
    import services.websocket_service as ws

    db = _RichDB()
    monkeypatch.setattr(triage_mod, "supabase", db, raising=False)

    async def _noop(*a, **k):
        return None

    monkeypatch.setattr(triage_mod.audit_service, "log", _noop, raising=False)

    async def _boom(*a, **k):
        raise RuntimeError("ws down")

    monkeypatch.setattr(ws, "broadcast_to_project", _boom, raising=False)

    ticket = _create()

    assert ticket["id"]  # ticket still created despite broadcast outage
