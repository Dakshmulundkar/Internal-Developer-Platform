"""Batch 3a CI/deploy/source adapter tests — fixture JSON, no live vendor keys."""

import asyncio

from services.plugins.base import PluginCtx
from services.plugins.cicd_adapters import (
    AirbrakeAdapter,
    ArgoCDAdapter,
    AzurePipelinesAdapter,
    AzureReposAdapter,
    HerokuAdapter,
    JenkinsAdapter,
    RaygunAdapter,
    TeamCityAdapter,
    TerraformAdapter,
    TravisCIAdapter,
)
from services.plugins.registry import get_adapter


class FakeResp:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = str(payload)[:200]

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")


class FakeClient:
    def __init__(self, resp: FakeResp):
        self._resp = resp

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, *args, **kwargs):
        return self._resp

    async def post(self, *args, **kwargs):
        return self._resp


def patch_client(monkeypatch, resp: FakeResp):
    import services.plugins.rest_adapters as ra

    monkeypatch.setattr(ra.httpx, "AsyncClient", lambda *a, **k: FakeClient(resp))
    monkeypatch.setattr(ra, "_assert_safe_target", lambda url: None)


def run(coro):
    return asyncio.run(coro)


def test_registry_covers_batch3a():
    for pid, cls in [
        ("plugin-jenkins", JenkinsAdapter),
        ("plugin-travisci", TravisCIAdapter),
        ("plugin-teamcity", TeamCityAdapter),
        ("plugin-azure-repos", AzureReposAdapter),
        ("plugin-azure-devops", AzurePipelinesAdapter),
        ("plugin-heroku", HerokuAdapter),
        ("plugin-terraform", TerraformAdapter),
        ("plugin-argocd", ArgoCDAdapter),
        ("plugin-raygun", RaygunAdapter),
        ("plugin-airbrake", AirbrakeAdapter),
    ]:
        assert isinstance(get_adapter(pid), cls), pid


def test_jenkins_builds_map(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"jobs": [
        {"name": "web", "lastBuild": {"number": 10, "result": "SUCCESS", "fullDisplayName": "web #10"}},
        {"name": "api", "lastBuild": {"number": 3, "result": "FAILURE", "fullDisplayName": "api #3"}},
        {"name": "idle", "lastBuild": None},
    ]}))
    ctx = PluginCtx(plugin_id="plugin-jenkins", token="t", base_url="https://jk:8080",
                    config={"username": "bot"})
    rows = run(JenkinsAdapter().fetch(ctx))
    assert [r["status"] for r in rows] == ["ready", "failed"]
    assert all(r["kind"] == "deploy" and r["provider"] == "jenkins" for r in rows)


def test_jenkins_needs_base_and_user():
    assert "Base URL" in run(JenkinsAdapter().test(
        PluginCtx(plugin_id="plugin-jenkins", token="t", config={"username": "b"}))).message


def test_travis_passed_maps_ready(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"builds": [
        {"number": "7", "state": "passed", "branch": {"name": "main"},
         "commit": {"sha": "abcdef1234567", "message": "fix"}, "started_at": "2026-09-01T00:00:00Z"},
    ]}))
    ctx = PluginCtx(plugin_id="plugin-travisci", token="t", project_selector="gh/acme/web")
    rows = run(TravisCIAdapter().fetch(ctx))
    assert rows[0]["status"] == "ready" and rows[0]["commit_hash"] == "abcdef1"


def test_teamcity_failure_maps_failed(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"build": [
        {"number": "99", "status": "FAILURE", "branchName": "main", "buildTypeId": "Web_Build"},
    ]}))
    ctx = PluginCtx(plugin_id="plugin-teamcity", token="t", base_url="https://tc:8111")
    rows = run(TeamCityAdapter().fetch(ctx))
    assert rows[0]["status"] == "failed" and rows[0]["provider"] == "teamcity"


def test_azure_repos_needs_org():
    ctx = PluginCtx(plugin_id="plugin-azure-repos", token="pat", config={})
    assert "organization" in run(AzureReposAdapter().test(ctx)).message


def test_azure_repos_ok(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"value": []}))
    ctx = PluginCtx(plugin_id="plugin-azure-repos", token="pat", config={"org": "acme"})
    assert run(AzureReposAdapter().test(ctx)).success is True


def test_azure_pipelines_build_maps(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"value": [
        {"id": 5, "buildNumber": "20250901.2", "result": "succeeded",
         "sourceBranch": "refs/heads/main", "sourceVersion": "aaaabbbbcccc",
         "queueTime": "2026-09-01T00:00:00Z", "definition": {"name": "web-ci"}},
    ]}))
    ctx = PluginCtx(plugin_id="plugin-azure-devops", token="pat",
                    config={"org": "acme", "project": "web"})
    rows = run(AzurePipelinesAdapter().fetch(ctx))
    assert rows[0]["status"] == "ready" and rows[0]["branch"] == "main"


def test_heroku_release_failed_maps(monkeypatch):
    import services.plugins.rest_adapters as ra

    class SeqClient(FakeClient):
        async def get(self, *args, **kwargs):
            if "account" in args[0]:
                return FakeResp(200, {"email": "dev@co.com"})
            return FakeResp(200, [
                {"version": 12, "status": "failed", "description": "Deploy bad",
                 "created_at": "2026-09-01T00:00:00Z"},
            ])

    monkeypatch.setattr(ra, "_assert_safe_target", lambda url: None)
    monkeypatch.setattr(ra.httpx, "AsyncClient", lambda *a, **k: SeqClient(FakeResp()))
    ctx = PluginCtx(plugin_id="plugin-heroku", token="k", config={"app": "my-api"})
    assert "dev@co.com" in run(HerokuAdapter().test(ctx)).message
    rows = run(HerokuAdapter().fetch(ctx))
    assert rows[0]["status"] == "failed" and rows[0]["version"] == "v12"


def test_terraform_errored_run_maps_failed(monkeypatch):
    import services.plugins.rest_adapters as ra

    class SeqClient(FakeClient):
        async def get(self, *args, **kwargs):
            if "workspaces" in args[0] and "runs" not in args[0]:
                return FakeResp(200, {"data": [{"id": "ws-1", "attributes": {"name": "prod"}}]})
            return FakeResp(200, {"data": [
                {"id": "run-abc123", "attributes": {"status": "errored", "created-at": "2026-09-01T00:00:00Z"}},
            ]})

    monkeypatch.setattr(ra, "_assert_safe_target", lambda url: None)
    monkeypatch.setattr(ra.httpx, "AsyncClient", lambda *a, **k: SeqClient(FakeResp()))
    ctx = PluginCtx(plugin_id="plugin-terraform", token="k", config={"org": "acme"})
    rows = run(TerraformAdapter().fetch(ctx))
    assert rows[0]["status"] == "failed" and rows[0]["provider"] == "terraform"


def test_argocd_degraded_fires_outofsync_pending(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"items": [
        {"metadata": {"name": "web"}, "status": {"health": {"status": "Degraded"}, "sync": {"status": "Synced"}}},
        {"metadata": {"name": "api"}, "status": {"health": {"status": "Healthy"}, "sync": {"status": "OutOfSync"}}},
        {"metadata": {"name": "ok"}, "status": {"health": {"status": "Healthy"}, "sync": {"status": "Synced"}}},
    ]}))
    rows = run(ArgoCDAdapter().fetch(
        PluginCtx(plugin_id="plugin-argocd", token="k", base_url="https://argo:8080")))
    assert len(rows) == 2
    assert rows[0]["status"] == "firing" and rows[0]["severity"] == "critical"
    assert rows[1]["status"] == "pending"


def test_raygun_unresolved_fires(monkeypatch):
    import services.plugins.rest_adapters as ra

    class SeqClient(FakeClient):
        async def get(self, *args, **kwargs):
            if "errors" in args[0]:
                return FakeResp(200, [
                    {"id": 1, "exceptionClass": "NullRef", "message": "boom",
                     "usersAffected": 3, "isResolved": False},
                    {"id": 2, "exceptionClass": "Old", "message": "x", "isResolved": True},
                ])
            return FakeResp(200, [{"id": "app-1"}])

    monkeypatch.setattr(ra, "_assert_safe_target", lambda url: None)
    monkeypatch.setattr(ra.httpx, "AsyncClient", lambda *a, **k: SeqClient(FakeResp()))
    rows = run(RaygunAdapter().fetch(PluginCtx(plugin_id="plugin-raygun", token="k")))
    assert len(rows) == 1 and "NullRef" in rows[0]["title"]


def test_airbrake_notices_fire(monkeypatch):
    import services.plugins.rest_adapters as ra

    class SeqClient(FakeClient):
        async def get(self, *args, **kwargs):
            if "notices" in args[0]:
                return FakeResp(200, {"notices": [
                    {"id": 1, "errors": [{"type": "TypeError", "message": "bad"}],
                     "context": {"environment": "production"}},
                ]})
            return FakeResp(200, {"projects": [{"id": "p1"}]})

    monkeypatch.setattr(ra, "_assert_safe_target", lambda url: None)
    monkeypatch.setattr(ra.httpx, "AsyncClient", lambda *a, **k: SeqClient(FakeResp()))
    rows = run(AirbrakeAdapter().fetch(PluginCtx(plugin_id="plugin-airbrake", token="k")))
    assert rows[0]["status"] == "firing" and "TypeError" in rows[0]["title"]
