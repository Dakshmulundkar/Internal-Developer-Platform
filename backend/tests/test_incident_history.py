"""Incident history tests — feedback rows, actor-stamped timeline, assign trail.

No network, no real DB: supabase.table() is replaced by an in-memory fake
that records every operation for assertions.
"""

import asyncio
from types import SimpleNamespace

from models.incident import FeedbackUpdate, IncidentUpdate


class R:
    def __init__(self, data):
        self.data = data


class FakeTable:
    def __init__(self, db, name):
        self.db, self.name = db, name
        self._op = None
        self._payload = None
        self._filters = {}
        self._single = False
        self._order = None

    def select(self, *a, **k):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        self.db.calls.append(("insert", self.name, dict(payload)))
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        self.db.calls.append(("update", self.name, dict(payload)))
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def in_(self, *a, **k):
        return self

    def order(self, col, desc=False):
        self._order = (col, desc)
        self.db.order_calls.append((self.name, col, desc))
        return self

    def single(self):
        self._single = True
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        if self.name in self.db.fail_tables:
            raise RuntimeError(f"relation \"{self.name}\" does not exist")

        if self._op == "insert":
            row = dict(self._payload)
            row.setdefault("id", f"{self.name}-row")
            row.setdefault("created_at", "2026-10-16T00:00:00+00:00")
            return R([row])

        src = {
            "incidents": self.db.incidents,
            "incident_comments": self.db.comments,
            "incident_timeline": self.db.timeline,
            "incident_feedback": self.db.feedback,
        }.get(self.name, [])
        rows = [dict(r) for r in src
                if all(r.get(k) == v for k, v in self._filters.items())]

        if self._op == "update":
            updated = []
            for r in rows:
                merged = {**r, **self._payload}
                updated.append(merged)
                if "id" in r:
                    for j, orig in enumerate(self.db.incidents):
                        if orig.get("id") == r["id"]:
                            self.db.incidents[j] = merged
            return R(updated)

        if self._order:
            col, desc = self._order
            rows.sort(key=lambda r: r.get(col) or "", reverse=desc)
        if self._single:
            return R(rows[0] if rows else None)
        return R(rows)


class FakeDB:
    def __init__(self, incidents=None, comments=None, timeline=None,
                 feedback=None, fail_tables=()):
        self.incidents = incidents or []
        self.comments = comments or []
        self.timeline = timeline or []
        self.feedback = feedback or []
        self.fail_tables = set(fail_tables)
        self.calls = []
        self.order_calls = []

    def table(self, name):
        return FakeTable(self, name)

    def inserts(self, table=None):
        return [c for c in self.calls if c[0] == "insert" and (table is None or c[1] == table)]

    def updates(self, table=None):
        return [c for c in self.calls if c[0] == "update" and (table is None or c[1] == table)]


def run(coro):
    return asyncio.run(coro)


def _user():
    return SimpleNamespace(id="u1", email="alice@example.com", name="Alice")


def _incident(**over):
    row = {"id": "i1", "project_id": "p1", "title": "Build failed",
           "status": "open", "assigned_to": None}
    row.update(over)
    return row


async def _noop(**kwargs):
    return None


def _wire(monkeypatch, db):
    import routers.incidents as ri
    import services.websocket_service as ws

    monkeypatch.setattr(ri.supabase, "table", db.table)
    monkeypatch.setattr(ri, "_user_project_ids", lambda uid: ["p1"])
    monkeypatch.setattr(ri.audit_service, "log", _noop, raising=True)
    monkeypatch.setattr(ri.notification_service, "create_notification", _noop, raising=True)
    monkeypatch.setattr(ws, "broadcast_incident_changed", _noop, raising=True)
    return ri


# ── GET detail: feedback history comes back newest-first ─────────────────

def test_get_incident_returns_feedback_newest_first(monkeypatch):
    db = FakeDB(
        incidents=[_incident()],
        feedback=[
            {"id": "f1", "incident_id": "i1", "user_name": "bob@x.com",
             "is_real": False, "comment": "flaky", "created_at": "2026-01-01T00:00:00+00:00"},
            {"id": "f2", "incident_id": "i1", "user_name": "alice@x.com",
             "is_real": True, "comment": "real", "created_at": "2026-01-02T00:00:00+00:00"},
        ],
    )
    ri = _wire(monkeypatch, db)

    out = run(ri.get_incident("i1", current_user=_user()))

    assert [f["id"] for f in out["feedback"]] == ["f2", "f1"]  # newest first
    assert ("incident_feedback", "created_at", True) in db.order_calls
    assert out["comments"] == [] and out["timeline"] == []


def test_get_incident_missing_feedback_table_degrades_to_empty(monkeypatch):
    db = FakeDB(incidents=[_incident()], fail_tables={"incident_feedback"})
    ri = _wire(monkeypatch, db)

    out = run(ri.get_incident("i1", current_user=_user()))

    assert out["feedback"] == []  # no crash; README tells user to run the SQL


# ── POST feedback: history row + actor-stamped timeline ─────────────────

def test_submit_feedback_writes_history_row_and_actor(monkeypatch):
    db = FakeDB(incidents=[_incident()])
    ri = _wire(monkeypatch, db)

    out = run(ri.submit_feedback(
        "i1", FeedbackUpdate(is_real=False, comment="false alarm"),
        current_user=_user()))

    # history row persisted with author
    fb = db.inserts("incident_feedback")
    assert len(fb) == 1
    assert fb[0][2]["user_name"] == "alice@example.com"
    assert fb[0][2]["is_real"] is False
    assert fb[0][2]["comment"] == "false alarm"

    # legacy "latest" columns still mirrored
    upd = db.updates("incidents")
    assert upd and upd[0][2]["feedback_is_real"] is False

    # timeline names the actor
    tl = db.inserts("incident_timeline")
    assert any("Feedback by alice@example.com: false positive" == c[2]["event"] for c in tl)

    # response returns the row so the UI can render it
    assert out["is_real"] is False and out["user_name"] == "alice@example.com"


def test_submit_feedback_survives_missing_table(monkeypatch):
    db = FakeDB(incidents=[_incident()], fail_tables={"incident_feedback"})
    ri = _wire(monkeypatch, db)

    out = run(ri.submit_feedback(
        "i1", FeedbackUpdate(is_real=True), current_user=_user()))

    assert out["is_real"] is True  # graceful fallback, no exception
    assert db.updates("incidents")  # legacy columns still written


# ── Resolve / ignore / comment: actor in event text ─────────────────────

def test_resolve_stamps_actor(monkeypatch):
    db = FakeDB(incidents=[_incident()])
    ri = _wire(monkeypatch, db)

    run(ri.resolve_incident("i1", current_user=_user()))

    tl = db.inserts("incident_timeline")
    assert any(c[2]["event"] == "Incident resolved by alice@example.com" for c in tl)
    assert db.updates("incidents")[0][2]["status"] == "resolved"


def test_ignore_stamps_actor_and_reason(monkeypatch):
    db = FakeDB(incidents=[_incident()])
    ri = _wire(monkeypatch, db)

    run(ri.ignore_incident("i1", {"ignored_reason": "test deployment"},
                           current_user=_user()))

    upd = db.updates("incidents")[0][2]
    assert upd["status"] == "resolved"
    assert upd["ignored_reason"] == "test deployment"
    tl = db.inserts("incident_timeline")
    assert any(c[2]["event"] == "Ignored by alice@example.com: test deployment"
               for c in tl)


def test_comment_stamps_author(monkeypatch):
    db = FakeDB(incidents=[_incident()])
    ri = _wire(monkeypatch, db)

    from models.incident import CommentCreate
    run(ri.add_comment("i1", CommentCreate(content="looking into it"),
                       current_user=_user()))

    tl = db.inserts("incident_timeline")
    assert any(c[2]["event"] == "Comment added by alice: looking into it" for c in tl)
    assert db.inserts("incident_comments")


# ── PATCH: assign trail only when the assignee actually changed ─────────

def test_patch_assign_writes_trail_only_on_change(monkeypatch):
    db = FakeDB(incidents=[_incident()])
    ri = _wire(monkeypatch, db)

    run(ri.update_incident("i1", IncidentUpdate(assigned_to="Bob"),
                           current_user=_user()))
    tl = db.inserts("incident_timeline")
    assert any(c[2]["event"] == "Assigned to Bob by alice@example.com" for c in tl)
    assert any(c[2]["type"] == "assign" for c in tl)

    # same value again → no duplicate trail
    db.calls.clear()
    run(ri.update_incident("i1", IncidentUpdate(assigned_to="Bob"),
                           current_user=_user()))
    assert db.inserts("incident_timeline") == []


def test_patch_without_assign_writes_no_trail(monkeypatch):
    db = FakeDB(incidents=[_incident()])
    ri = _wire(monkeypatch, db)

    run(ri.update_incident("i1", IncidentUpdate(severity="critical"),
                           current_user=_user()))

    assert db.inserts("incident_timeline") == []
    assert db.updates("incidents")[0][2] == {"severity": "critical"}


def test_ignore_reason_survives_via_patched_update(monkeypatch):
    """ignored_reason must not be silently dropped when PATCHed."""
    db = FakeDB(incidents=[_incident()])
    ri = _wire(monkeypatch, db)

    run(ri.update_incident("i1", IncidentUpdate(ignored_reason="known flake"),
                           current_user=_user()))

    assert db.updates("incidents")[0][2]["ignored_reason"] == "known flake"
