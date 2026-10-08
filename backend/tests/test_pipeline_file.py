"""Pipeline-file endpoint tests — fixture GitHub responses, no network."""

import asyncio
import base64
from types import SimpleNamespace

WORKFLOW_YML = """name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
  build:
    runs-on: ubuntu-latest
    steps:
      - run: npm run build
"""


class FakeResp:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = text or str(payload)[:200]

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


class FakeTable:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def single(self):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        data = self._rows[0] if getattr(self, "_single", False) else self._rows
        return type("R", (), {"data": data})()


def _project():
    return {"id": "p1", "owner_id": "u1", "repo_owner": "acme", "repo_name": "web",
            "branch": "main"}


def _supabase(monkeypatch, project=None, installs=None):
    import routers.projects as rp

    def table(name):
        q = FakeTable([])
        if name == "projects":
            q = FakeTable([project] if project else [])
            q._single = True
        elif name == "plugin_installations":
            q = FakeTable(installs or [])
        return q

    monkeypatch.setattr(rp.supabase, "table", table)


def _github(monkeypatch, handler):
    import httpx

    class RoutingClient(FakeClient):
        async def get(self, url, **kwargs):
            # Repo pre-check + re-fetched workflow files bypass the fixture handler.
            if "/contents" not in url and "/f/" not in url:
                return FakeResp(200, {"full_name": "acme/web", "private": False})
            return handler(url)

    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: RoutingClient(FakeResp()))


def run(coro):
    return asyncio.run(coro)


def _entry():
    return {"path": ".github/workflows/ci.yml", "sha": "abc123", "size": 100,
            "content": base64.b64encode(WORKFLOW_YML.encode()).decode(),
            "encoding": "base64"}


def test_pipeline_file_parses_jobs_and_steps(monkeypatch):
    import routers.projects as rp

    _supabase(monkeypatch, project=_project(),
              installs=[{"plugin_id": "plugin-github", "api_key_encrypted": "ghp-real"}])
    _github(monkeypatch, lambda url: FakeResp(200, _entry()))
    out = run(rp.get_pipeline_file("p1", SimpleNamespace(id="u1")))
    assert out["path"] == ".github/workflows/ci.yml"
    assert out["jobs"] == {"test": 3, "build": 1}
    assert out["job_count"] == 2 and out["step_count"] == 4
    assert "name: CI" in out["content"]


def test_pipeline_file_falls_back_to_first_workflow(monkeypatch):
    import routers.projects as rp

    def handler(url):
        if url.endswith((".yml", ".yaml")) and "deploy" not in url:
            return FakeResp(404, {"message": "Not Found"})
        if url.endswith("workflows"):
            return FakeResp(200, [{"name": "deploy.yml", "path": ".github/workflows/deploy.yml",
                                   "url": "https://api.github.com/f/deploy.yml"}])
        return FakeResp(200, _entry())

    _supabase(monkeypatch, project=_project(), installs=[])
    _github(monkeypatch, handler)
    out = run(rp.get_pipeline_file("p1", SimpleNamespace(id="u1")))
    assert out["job_count"] == 2 and out["step_count"] == 4


def test_pipeline_file_no_repo_linked(monkeypatch):
    import fastapi
    import routers.projects as rp

    _supabase(monkeypatch, project={"id": "p1", "owner_id": "u1"})
    try:
        run(rp.get_pipeline_file("p1", SimpleNamespace(id="u1")))
        assert False, "expected HTTPException"
    except fastapi.HTTPException as exc:
        assert exc.status_code == 400


def test_pipeline_file_forbidden_project(monkeypatch):
    import fastapi
    import routers.projects as rp

    _supabase(monkeypatch, project={"id": "p1", "owner_id": "other"})
    monkeypatch.setattr(rp, "get_user_project_ids", lambda uid: [])
    try:
        run(rp.get_pipeline_file("p1", SimpleNamespace(id="u1")))
        assert False, "expected HTTPException"
    except fastapi.HTTPException as exc:
        assert exc.status_code == 404


def test_normalize_repo_forms():
    from routers.projects import _normalize_repo

    assert _normalize_repo(
        "Dakshmulundkar",
        "https://github.com/Dakshmulundkar/Internal-Developer-Platform.git",
    ) == ("Dakshmulundkar", "Internal-Developer-Platform")
    assert _normalize_repo("", "acme/web") == ("acme", "web")
    assert _normalize_repo("acme", "web") == ("acme", "web")
    assert _normalize_repo("", "https://github.com/acme/web") == ("acme", "web")
    assert _normalize_repo("", "") == ("", "")


def test_pipeline_file_private_repo_without_token(monkeypatch):
    import fastapi
    import httpx
    import routers.projects as rp

    _supabase(monkeypatch, project=_project(), installs=[])
    monkeypatch.setattr(httpx, "AsyncClient",
                        lambda *a, **k: FakeClient(lambda url: FakeResp(404, {"message": "Not Found"})))
    try:
        run(rp.get_pipeline_file("p1", SimpleNamespace(id="u1")))
        assert False, "expected HTTPException"
    except fastapi.HTTPException as exc:
        assert exc.status_code == 404
        assert "Connect the GitHub plugin" in exc.detail
