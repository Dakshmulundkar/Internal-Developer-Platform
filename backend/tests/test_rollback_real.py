"""Task 56 rollback honesty tests — no provider calls, no DB."""

import asyncio

import pytest

from services.rollback_service import RollbackError, execute_rollback


class FakeTable:
    def __init__(self, rows=None):
        self._rows = rows or []
        self._single = False
        self.inserted: list = []

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def in_(self, *a, **k):
        return self

    def single(self):
        self._single = True
        return self

    def limit(self, *a, **k):
        return self

    def insert(self, row):
        self.inserted.append(row)
        return self

    def execute(self):
        if self.inserted:
            return type("R", (), {"data": [{**self.inserted[-1], "id": "rb-1"}]})()
        data = self._rows[0] if (self._single and self._rows) else self._rows
        return type("R", (), {"data": data})()


def _project():
    return {"id": "11111111-1111-1111-1111-111111111111", "owner_id": "u1",
            "provider": "vercel", "vercel_project_id": "prj_1", "name": "Web"}


def _deployment():
    return {"id": "22222222-2222-2222-2222-222222222222", "project_id": _project()["id"],
            "version": "v1", "status": "ready", "external_event_id": "d-ext-1"}


def run(coro):
    return asyncio.run(coro)


def _no_network_client():
    class GuardedClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, *a, **k):
            raise AssertionError("network access forbidden in this test")

        async def post(self, *a, **k):
            raise AssertionError("network access forbidden in this test")

    return GuardedClient


def _tables(monkeypatch, ops=()):
    import services.rollback_service as rs

    def table(name):
        if name == "projects":
            t = FakeTable([_project()])
            return t
        if name == "deployments":
            return FakeTable([_deployment()])
        if name == "rollback_operations":
            return FakeTable(list(ops))
        if name == "plugin_installations":
            return FakeTable([])
        return FakeTable([])

    monkeypatch.setattr(rs.supabase, "table", table)


def test_no_token_fails_closed(monkeypatch):
    import services.rollback_service as rs

    _tables(monkeypatch)
    with pytest.raises(RollbackError, match="No .* API token"):
        run(rs.execute_rollback(_project()["id"], _deployment()["id"], "u1"))


def test_idempotency_second_rollback_rejected(monkeypatch):
    import httpx
    import services.rollback_service as rs

    _tables(monkeypatch, ops=[{"id": "rb-0", "status": "in_progress"}])
    # Token present so it gets past the token gate to the idempotency gate.
    monkeypatch.setattr(rs, "_resolve_provider_token", lambda provider, uid: "tok")
    # Belt-and-suspenders: no test may touch the network.
    monkeypatch.setattr(httpx, "AsyncClient", _no_network_client())
    with pytest.raises(RollbackError, match="already in progress"):
        run(rs.execute_rollback(_project()["id"], _deployment()["id"], "u1"))


def test_provider_api_error_creates_no_row(monkeypatch):
    import services.rollback_service as rs

    inserted: list = []

    def table(name):
        if name == "projects":
            return FakeTable([_project()])
        if name == "deployments":
            return FakeTable([_deployment()])
        if name == "rollback_operations":
            t = FakeTable([])
            orig_insert = t.insert

            def spy(row):
                inserted.append(row)
                return orig_insert(row)

            t.insert = spy
            return t
        return FakeTable([])

    monkeypatch.setattr(rs.supabase, "table", table)
    monkeypatch.setattr(rs, "_resolve_provider_token", lambda provider, uid: "tok")

    class FakeResp:
        status_code = 403
        text = "forbidden"

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            return FakeResp()

    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: FakeClient())
    with pytest.raises(RollbackError, match="Vercel API error"):
        run(rs.execute_rollback(_project()["id"], _deployment()["id"], "u1"))
    assert inserted == []
