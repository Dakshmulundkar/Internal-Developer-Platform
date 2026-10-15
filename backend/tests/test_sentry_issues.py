"""Task 59 — Sentry issues endpoint. No live Sentry calls."""

import asyncio
from types import SimpleNamespace


class FakeTable:
    def __init__(self, rows=None):
        self._rows = rows or []

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def execute(self):
        return type("R", (), {"data": self._rows})()


def run(coro):
    return asyncio.run(coro)


def test_sentry_issues_merged_across_projects(monkeypatch):
    import routers.monitoring as mon
    import services.sentry_service as svc

    installs = [{
        "plugin_id": "plugin-sentry", "status": "connected",
        "api_key_encrypted": "plain-token",
        "config_data": {"org": "acme", "projects": "web, api"},
    }]
    monkeypatch.setattr(mon.supabase, "table",
                        lambda name: FakeTable(installs) if name == "plugin_installations" else FakeTable([]))

    async def fake_details(org, project, token):
        assert org == "acme" and token == "plain-token"
        return [{"id": f"{project}-1", "title": f"Boom in {project}", "culprit": "app.py",
                 "level": "error", "status": "unresolved", "count": 5,
                 "firstSeen": "2026-01-01", "lastSeen": "2026-01-02", "release": "v1",
                 "sentry_project": project}]

    monkeypatch.setattr(svc, "fetch_issue_details", fake_details)
    out = run(mon.list_sentry_issues(SimpleNamespace(id="u1")))
    assert len(out) == 2
    assert out[0]["title"] == "Boom in web"
    assert out[0]["sentry_project"] == "web"


def test_sentry_issues_no_installation_empty(monkeypatch):
    import routers.monitoring as mon

    monkeypatch.setattr(mon.supabase, "table", lambda name: FakeTable([]))
    assert run(mon.list_sentry_issues(SimpleNamespace(id="u1"))) == []


def test_sentry_issues_bad_install_skipped_not_blank(monkeypatch):
    import routers.monitoring as mon
    import services.sentry_service as svc

    installs = [
        {"plugin_id": "plugin-sentry", "status": "connected",
         "api_key_encrypted": "good", "config_data": {"org": "acme", "projects": "web"}},
        {"plugin_id": "plugin-sentry", "status": "connected",
         "api_key_encrypted": "bad", "config_data": {"org": "acme", "projects": "nope"}},
        {"plugin_id": "plugin-sentry", "status": "disconnected",
         "api_key_encrypted": "zzz", "config_data": {"org": "acme", "projects": "skip"}},
    ]
    monkeypatch.setattr(mon.supabase, "table",
                        lambda name: FakeTable(installs) if name == "plugin_installations" else FakeTable([]))

    async def fake_details(org, project, token):
        if project == "nope":
            raise RuntimeError("401")
        return [{"id": "1", "title": "T", "culprit": "", "level": "error",
                 "status": "unresolved", "count": 1, "firstSeen": "", "lastSeen": "", "release": ""}]

    monkeypatch.setattr(svc, "fetch_issue_details", fake_details)
    out = run(mon.list_sentry_issues(SimpleNamespace(id="u1")))
    assert len(out) == 1 and out[0]["id"] == "1"


def test_fetch_issue_details_mapping(monkeypatch):
    import httpx
    import services.sentry_service as svc

    class FakeResp:
        status_code = 200

        def json(self):
            return [{"id": 9, "title": "NullRef", "culprit": "x.py",
                     "level": "fatal", "status": "unresolved",
                     "release": {"version": "v3"}}]

        def raise_for_status(self):
            pass

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, *args, **kwargs):
            return FakeResp()

    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: FakeClient())
    rows = run(svc.fetch_issue_details("acme", "web", "tok"))
    assert rows[0]["level"] == "fatal" and rows[0]["release"] == "v3"
    assert rows[0]["status"] == "unresolved"
