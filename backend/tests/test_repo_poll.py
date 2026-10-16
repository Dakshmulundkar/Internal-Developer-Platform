"""Repo-poll auto-build tests — a new commit dispatches the same flow as manual dispatch.

No network: supabase.table(), httpx, and the pipeline fetcher are faked.
"""

import asyncio
from types import SimpleNamespace

HEAD_SHA = "newsha1234567890abcdef"
HEAD = {"sha": HEAD_SHA,
        "commit": {"message": "Fix pipeline\n\nlong body", "author": {"name": "Dev"}}}
PIPELINE = {"path": "ci.yml", "job_count": 1, "step_count": 2}


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

    def select(self, *a, **k):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = dict(payload)
        self.db.calls.append(("insert", self.name, dict(payload)))
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = dict(payload)
        self.db.calls.append(("update", self.name, dict(payload)))
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def in_(self, *a, **k):
        return self

    def single(self):
        self._single = True
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        if self._op == "insert":
            row = dict(self._payload)
            row.setdefault("id", f"{self.name}-row-1")
            self.db.rows.setdefault(self.name, []).append(row)
            return R([row])
        src = self.db.rows.get(self.name, [])
        matched = [dict(r) for r in src
                   if all(r.get(k) == v for k, v in self._filters.items())]
        if self._op == "update":
            for r in matched:
                for orig in self.db.rows.get(self.name, []):
                    if orig.get("id") == r.get("id"):
                        orig.update(self._payload)
                r.update(self._payload)
            return R(matched)
        if self._single:
            return R(matched[0] if matched else None)
        return R(matched)


class FakeDB:
    def __init__(self, rows=None):
        self.rows = rows or {}
        self.calls = []

    def table(self, name):
        return FakeTable(self, name)

    def ops(self, op, table=None):
        return [c for c in self.calls if c[0] == op and (table is None or c[1] == table)]


class FakeResp:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload


class FakeClient:
    def __init__(self, handler):
        self._handler = handler

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, **kwargs):
        return self._handler(url)


def run(coro):
    return asyncio.run(coro)


def _project(**over):
    row = {"id": "p1", "owner_id": "u1", "repo_owner": "acme", "repo_name": "web",
           "branch": "main", "provider": "vercel"}
    row.update(over)
    return row


def _task(**over):
    row = {"id": "t1", "task_type": "repo_poll", "project_id": "p1", "owner_id": "u1",
           "name": "Auto-build web", "cron_expression": "*/5 * * * *",
           "task_config": {"branch": "main"}}
    row.update(over)
    return row


def _wire(monkeypatch, db, head=HEAD, pipeline=None, dry_runs=None, runs=None):
    import httpx
    import routers.deployments as rd
    import services.scheduler_service as sched
    import services.pipeline_file as pf

    async def fake_fetch(owner, repo, branch, token):
        assert (owner, repo) == ("acme", "web")
        return dict(pipeline if pipeline is not None else PIPELINE)

    async def fake_dry(deployment_id, project, user_id, pipeline, provider_name):
        (dry_runs if dry_runs is not None else []).append(deployment_id)

    def handler(url):
        if "actions/runs" in url:
            return FakeResp(200, {"total_count": len(runs or []), "workflow_runs": runs or []})
        return FakeResp(200, head)

    monkeypatch.setattr(rd.supabase, "table", db.table)
    monkeypatch.setattr(rd, "_user_project_ids", lambda uid: ["p1"])
    monkeypatch.setattr(rd, "_run_dry_build", fake_dry)
    monkeypatch.setattr(pf, "fetch_definition", fake_fetch)
    monkeypatch.setattr(httpx, "AsyncClient",
                        lambda *a, **k: FakeClient(handler))
    return sched


def _db_with_project(last_sha="oldsha0000000000000000"):
    task = _task()
    if last_sha is not None:
        task["task_config"] = {"branch": "main", "last_sha": last_sha}
    return FakeDB(rows={
        "projects": [_project()],
        "plugin_installations": [{"plugin_id": "plugin-github",
                                   "installed_by": "u1",
                                   "api_key_encrypted": "ghp-real"}],
        "deployments": [],
        "scheduled_tasks": [task],
    })


# ── repo_poll ─────────────────────────────────────────────────────────────

def test_repo_poll_dispatches_on_new_commit(monkeypatch):
    db = _db_with_project(last_sha="oldsha0000000000000000")
    sched = _wire(monkeypatch, db)

    out = run(sched._run_task(_task(task_config={"branch": "main", "backfilled": True,
                                                 "last_sha": "oldsha0000000000000000"})))

    assert out["status"] == "success" and HEAD_SHA[:7] in out["detail"]
    deps = db.ops("insert", "deployments")
    assert len(deps) == 1
    row = deps[0][2]
    assert row["project_id"] == "p1"
    assert row["commit_hash"] == HEAD_SHA[:7]
    assert row["commit_message"] == "Fix pipeline"
    assert row["author"] == "Dev"
    assert row["status"] == "queued"
    # last-seen SHA advances so the same commit never fires twice
    cfg_updates = db.ops("update", "scheduled_tasks")
    assert cfg_updates and cfg_updates[0][2]["task_config"]["last_sha"] == HEAD_SHA


def test_repo_poll_seeds_silently_on_first_run(monkeypatch):
    db = _db_with_project(last_sha=None)
    sched = _wire(monkeypatch, db)

    out = run(sched._run_task(_task(task_config={"branch": "main"})))

    assert out["status"] == "success"
    assert db.ops("insert", "deployments") == []  # no backfill storm
    cfg_updates = db.ops("update", "scheduled_tasks")
    assert cfg_updates and cfg_updates[0][2]["task_config"]["last_sha"] == HEAD_SHA


def test_repo_poll_noop_when_same_sha(monkeypatch):
    db = _db_with_project(last_sha=HEAD_SHA)
    sched = _wire(monkeypatch, db)

    out = run(sched._run_task(_task(task_config={"branch": "main", "backfilled": True,
                                                 "last_sha": HEAD_SHA})))

    assert out["status"] == "success"
    assert db.ops("insert", "deployments") == []
    assert db.ops("update", "scheduled_tasks") == []


def test_repo_poll_skips_without_repo(monkeypatch):
    db = _db_with_project()
    db.rows["projects"] = [_project(repo_owner="", repo_name="")]
    sched = _wire(monkeypatch, db)

    out = run(sched._run_task(_task()))

    assert out["status"] == "skipped"
    assert db.ops("insert", "deployments") == []


def test_repo_poll_skips_missing_project(monkeypatch):
    db = _db_with_project()
    db.rows["projects"] = []
    sched = _wire(monkeypatch, db)

    out = run(sched._run_task(_task()))

    assert out["status"] == "skipped"
    assert db.ops("insert", "deployments") == []


# ── ensure helper ─────────────────────────────────────────────────────────

def test_ensure_creates_task_once(monkeypatch):
    import services.scheduler_service as sched

    db = FakeDB(rows={"projects": [_project()], "scheduled_tasks": []})
    monkeypatch.setattr(sched.supabase, "table", db.table)

    created = sched.ensure_repo_poll_task(_project())
    assert created and created["task_type"] == "repo_poll"
    assert created["project_id"] == "p1" and created["owner_id"] == "u1"
    assert created["cron_expression"] == "*/5 * * * *"
    assert db.ops("insert", "scheduled_tasks")

    db.calls.clear()
    again = sched.ensure_repo_poll_task(_project())
    assert again and db.ops("insert", "scheduled_tasks") == []


def test_ensure_ignores_project_without_repo(monkeypatch):
    import services.scheduler_service as sched

    db = FakeDB(rows={"projects": [], "scheduled_tasks": []})
    monkeypatch.setattr(sched.supabase, "table", db.table)

    assert sched.ensure_repo_poll_task(_project(repo_owner="", repo_name="")) is None
    assert db.ops("insert", "scheduled_tasks") == []


# ── scheduler wrapper: always act on the fresh DB row ────────────────────

def test_job_wrapper_uses_fresh_last_sha(monkeypatch):
    # The job captured a stale dict; the DB already advanced past that commit.
    db = _db_with_project(last_sha=HEAD_SHA)
    sched = _wire(monkeypatch, db)
    stale = _task(task_config={"branch": "main", "last_sha": "oldsha0000000000000000"})

    run(sched._job_wrapper(stale))

    assert db.ops("insert", "deployments") == []  # fresh row wins: no duplicate build


def test_job_wrapper_drops_deleted_task(monkeypatch):
    db = _db_with_project()
    db.rows["scheduled_tasks"] = []
    sched = _wire(monkeypatch, db)

    run(sched._job_wrapper(_task()))  # must not raise; orphaned job removed

    assert db.ops("insert", "deployments") == []


# ── history backfill: every version visible ─────────────────────────────────

RUN_OK = {"id": 101, "name": "CI", "head_branch": "main",
          "head_sha": "aaa1111aaa1111aaa1111aaa1111aaa1111aaa1",
          "status": "completed", "conclusion": "success",
          "created_at": "2026-10-10T10:00:00Z",
          "html_url": "https://github.com/acme/web/actions/runs/101",
          "head_commit": {"message": "Add feature\n\nbody", "author": {"name": "Dev"}}}
RUN_FAIL = {"id": 102, "name": "CI", "head_branch": "main",
            "head_sha": "bbb2222bbb2222bbb2222bbb2222bbb2222bbb2",
            "status": "completed", "conclusion": "failure",
            "created_at": "2026-10-11T10:00:00Z",
            "html_url": "https://github.com/acme/web/actions/runs/102",
            "head_commit": {"message": "Break thing", "author": {"name": "Dev"}}}
RUN_RUNNING = {"id": 103, "name": "CI", "head_branch": "main",
               "head_sha": "ccc3333ccc3333ccc3333ccc3333ccc3333ccc3",
               "status": "in_progress", "conclusion": None,
               "created_at": "2026-10-12T10:00:00Z",
               "html_url": "https://github.com/acme/web/actions/runs/103",
               "head_commit": {"message": "WIP", "author": {"name": "Dev"}}}


def test_first_sighting_backfills_action_runs(monkeypatch):
    db = _db_with_project(last_sha=None)
    sched = _wire(monkeypatch, db, runs=[RUN_OK, RUN_FAIL, RUN_RUNNING])

    out = run(sched._run_task(_task(task_config={"branch": "main"})))

    assert out["status"] == "success"
    deps = db.ops("insert", "deployments")
    assert len(deps) == 3
    by_sha = {d[2]["commit_hash"]: d[2] for d in deps}
    assert by_sha["aaa1111"]["status"] == "ready"
    assert by_sha["bbb2222"]["status"] == "failed"
    assert by_sha["ccc3333"]["status"] == "building"
    assert by_sha["aaa1111"]["commit_message"] == "Add feature"
    assert by_sha["aaa1111"]["created_at"] == "2026-10-10T10:00:00Z"
    assert by_sha["aaa1111"]["external_event_id"] == "gha-p1-101"
    # history imported AND head tracked, each exactly once
    cfg = db.ops("update", "scheduled_tasks")[0][2]["task_config"]
    assert cfg["last_sha"] == HEAD_SHA and cfg["backfilled"] is True


def test_backfill_skips_already_imported_runs(monkeypatch):
    db = _db_with_project(last_sha=None)
    db.rows["deployments"] = [{
        "id": "d-old", "project_id": "p1", "external_event_id": "gha-p1-101",
        "commit_hash": "aaa1111", "status": "ready"}]
    sched = _wire(monkeypatch, db, runs=[RUN_OK, RUN_FAIL])

    run(sched._run_task(_task(task_config={"branch": "main"})))

    deps = db.ops("insert", "deployments")
    assert [d[2]["external_event_id"] for d in deps] == ["gha-p1-102"]


def test_existing_task_backfills_once_then_noops(monkeypatch):
    db = _db_with_project(last_sha=HEAD_SHA)
    sched = _wire(monkeypatch, db, runs=[RUN_OK])

    first = run(sched._run_task(db.rows["scheduled_tasks"][0]))
    assert first["status"] == "success"
    assert len(db.ops("insert", "deployments")) == 1

    second = run(sched._run_task(db.rows["scheduled_tasks"][0]))
    assert second["status"] == "success"
    assert len(db.ops("insert", "deployments")) == 1  # no duplicates


# ── manual dispatch still works after the shared-helper extraction ────────

def test_manual_dispatch_regression(monkeypatch):
    import routers.deployments as rd

    bg = []
    db = _db_with_project()
    _wire(monkeypatch, db)
    fake_bg = SimpleNamespace(add_task=lambda fn, *a: bg.append((fn, a)))

    out = run(rd.dispatch_build("p1", fake_bg, SimpleNamespace(id="u1")))

    assert out["id"] and out["pipeline"]["path"] == "ci.yml"
    deps = db.ops("insert", "deployments")
    assert len(deps) == 1 and deps[0][2]["commit_hash"] == HEAD_SHA[:7]
    assert bg and bg[0][0] is not None  # dry-run scheduled, not awaited
