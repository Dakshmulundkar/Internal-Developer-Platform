"""Dispatch endpoint + dry-run progression tests — no network, no DB."""

import asyncio
from types import SimpleNamespace


class FakeTable:
    def __init__(self, rows=None):
        self._rows = rows or []
        self._single = False
        self.inserted: list = []
        self.updated: list = []

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def single(self):
        self._single = True
        return self

    def limit(self, *a, **k):
        return self

    def insert(self, row):
        self.inserted.append(row)
        return self

    def update(self, patch):
        self.updated.append(patch)
        return self

    def execute(self):
        if self.inserted and not self._rows:
            data = [{**self.inserted[-1], "id": "d-new"}]
        elif self._single:
            data = self._rows[0] if self._rows else None
        else:
            data = self._rows
        return type("R", (), {"data": data})()


def _project():
    return {"id": "p1", "owner_id": "u1", "repo_owner": "acme", "repo_name": "web",
            "branch": "main", "provider": "vercel", "name": "Web"}


def _pipeline():
    return {"path": ".github/workflows/ci.yml", "sha": "abc", "size": 10,
            "jobs": {"test": 2}, "job_count": 1, "step_count": 2, "content": "x"}


def run(coro):
    return asyncio.run(coro)


def test_dispatch_unknown_project(monkeypatch):
    import fastapi
    import routers.deployments as rd

    monkeypatch.setattr(rd.supabase, "table", lambda name: FakeTable([]))
    try:
        run(rd.dispatch_build("nope", SimpleNamespace(), SimpleNamespace(id="u1")))
        assert False, "expected HTTPException"
    except fastapi.HTTPException as exc:
        assert exc.status_code == 404


def test_dispatch_no_repo_linked(monkeypatch):
    import fastapi
    import routers.deployments as rd

    monkeypatch.setattr(rd.supabase, "table",
                        lambda name: FakeTable([{"id": "p1", "owner_id": "u1"}]))
    try:
        run(rd.dispatch_build("p1", SimpleNamespace(), SimpleNamespace(id="u1")))
        assert False, "expected HTTPException"
    except fastapi.HTTPException as exc:
        assert exc.status_code == 400


def test_dispatch_creates_queued_run(monkeypatch):
    import routers.deployments as rd
    import services.pipeline_file as pf

    tables = {}

    def table(name):
        if name == "projects":
            return FakeTable([_project()])
        tables.setdefault(name, FakeTable([]))
        return tables[name]

    monkeypatch.setattr(rd.supabase, "table", table)
    monkeypatch.setattr(rd, "_user_project_ids", lambda uid: ["p1"])

    async def fake_fetch(*a, **k):
        return _pipeline()

    monkeypatch.setattr(pf, "fetch_definition", fake_fetch)

    ran = []

    class FakeBG:
        def add_task(self, fn, *args, **kwargs):
            ran.append((fn.__name__, args[0] if args else None))

    out = run(rd.dispatch_build("p1", FakeBG(), SimpleNamespace(id="u1")))
    assert out["pipeline"]["path"] == ".github/workflows/ci.yml"
    assert out["pipeline"]["step_count"] == 2
    inserted = tables["deployments"].inserted[0]
    assert inserted["status"] == "queued"
    assert inserted["project_id"] == "p1"
    assert ran and ran[0][0] == "_run_dry_build"


def test_dry_run_fails_at_deploy_with_logs(monkeypatch):
    import routers.deployments as rd

    updates = []
    monkeypatch.setattr(rd, "_update_deployment",
                        lambda did, patch: updates.append((did, patch)))
    monkeypatch.setattr(rd, "STEP_DELAY_S", 0)
    run(rd._run_dry_build("d1", _project(), "u1", _pipeline(), ""))
    final = updates[-1][1]
    # Not the project's fault: without a provider there is nothing to push
    # to, so the run aborts neutrally instead of failing red.
    assert final["status"] == "canceled"
    assert "no deployment provider connected" in final["error_message"].lower()
    assert [s["status"] for s in final["stages"]] == ["success", "success", "success", "pending"]
    assert any("skipped" in line for line in final["logs"])
    assert any("ci.yml" in line for line in final["logs"])


def test_dry_run_names_connected_provider(monkeypatch):
    import routers.deployments as rd

    updates = []
    monkeypatch.setattr(rd, "_update_deployment",
                        lambda did, patch: updates.append((did, patch)))
    monkeypatch.setattr(rd, "STEP_DELAY_S", 0)
    run(rd._run_dry_build("d1", _project(), "u1", _pipeline(), "Vercel"))
    assert "Vercel" in updates[-1][1]["error_message"]
