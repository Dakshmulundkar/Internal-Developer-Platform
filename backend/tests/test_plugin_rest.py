"""Batch 1 REST adapter tests — fixture JSON, no live vendor keys.

Run from backend/: venv\\Scripts\\python.exe -m pytest tests\\ -q
"""

import asyncio

from services.plugins.base import PluginCtx
from services.plugins.registry import get_adapter
from services.plugins.rest_adapters import (
    BitbucketAdapter,
    BugsnagAdapter,
    CircleCIAdapter,
    DiscordAdapter,
    GitLabAdapter,
    JiraAdapter,
    LinearAdapter,
    OpsGenieAdapter,
    PagerDutyAdapter,
    RailwayAdapter,
    RenderAdapter,
    RollbarAdapter,
    UptimeRobotAdapter,
)


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
    # _assert_safe_target does real DNS — bypass for fixture hosts.
    monkeypatch.setattr(ra, "_assert_safe_target", lambda url: None)


def run(coro):
    return asyncio.run(coro)


def test_registry_covers_batch1():
    for pid, cls in [
        ("plugin-uptimerobot", UptimeRobotAdapter),
        ("plugin-rollbar", RollbarAdapter),
        ("plugin-bugsnag", BugsnagAdapter),
        ("plugin-pagerduty", PagerDutyAdapter),
        ("plugin-opsgenie", OpsGenieAdapter),
        ("plugin-circleci", CircleCIAdapter),
        ("plugin-render", RenderAdapter),
        ("plugin-railway", RailwayAdapter),
        ("plugin-gitlab", GitLabAdapter),
        ("plugin-bitbucket", BitbucketAdapter),
        ("plugin-jira", JiraAdapter),
        ("plugin-linear", LinearAdapter),
        ("plugin-discord", DiscordAdapter),
    ]:
        assert isinstance(get_adapter(pid), cls), pid


def test_uptimerobot_down_maps_firing(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"stat": "ok", "monitors": [
        {"id": 1, "friendly_name": "API", "url": "https://x.com", "type": 1, "status": 9},
        {"id": 2, "friendly_name": "Site", "url": "https://y.com", "type": 1, "status": 2},
    ]}))
    rows = run(UptimeRobotAdapter().fetch(PluginCtx(plugin_id="plugin-uptimerobot", token="k")))
    assert len(rows) == 2
    down = [r for r in rows if r["status"] == "firing"]
    assert len(down) == 1 and down[0]["severity"] == "critical" and down[0]["source"] == "uptimerobot"


def test_uptimerobot_no_key():
    assert run(UptimeRobotAdapter().test(PluginCtx(plugin_id="plugin-uptimerobot"))).success is False
    assert run(UptimeRobotAdapter().fetch(PluginCtx(plugin_id="plugin-uptimerobot", token=""))) == []


def test_rollbar_active_maps(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"err": 0, "result": {"items": [
        {"id": 7, "title": "NullRef", "level": "critical", "status": "active", "environment": "prod"},
    ]}}))
    rows = run(RollbarAdapter().fetch(PluginCtx(plugin_id="plugin-rollbar", token="k")))
    assert rows[0]["severity"] == "critical" and rows[0]["status"] == "firing"


def test_bugsnag_needs_project_id():
    ctx = PluginCtx(plugin_id="plugin-bugsnag", token="k", config={})
    assert run(BugsnagAdapter().fetch(ctx)) == []


def test_bugsnag_open_maps_firing(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, [
        {"id": "a1", "exception_class": "TypeError", "message": "boom", "status": "open",
         "events_count": 5, "users_count": 2},
    ]))
    ctx = PluginCtx(plugin_id="plugin-bugsnag", token="k", config={"project_id": "p1"})
    rows = run(BugsnagAdapter().fetch(ctx))
    assert rows[0]["status"] == "firing" and "TypeError" in rows[0]["title"]


def test_pagerduty_triggered_maps(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"incidents": [
        {"id": "P1", "title": "DB down", "status": "triggered", "urgency": "high", "description": ""},
    ]}))
    rows = run(PagerDutyAdapter().fetch(PluginCtx(plugin_id="plugin-pagerduty", token="k")))
    assert rows[0]["severity"] == "critical" and rows[0]["status"] == "firing"


def test_opsgenie_p1_maps_critical(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"data": [
        {"id": "o1", "message": "CPU burn", "status": "open", "priority": "P1", "teams": "sre"},
    ]}))
    rows = run(OpsGenieAdapter().fetch(PluginCtx(plugin_id="plugin-opsgenie", token="k")))
    assert rows[0]["severity"] == "critical" and rows[0]["labels"]["opsgenie_id"] == "o1"


def test_circleci_needs_slug():
    ctx = PluginCtx(plugin_id="plugin-circleci", token="k", project_selector="")
    assert "slug" in run(CircleCIAdapter().test(ctx)).message


def test_circleci_failed_workflow_maps_failed(monkeypatch):
    import services.plugins.rest_adapters as ra

    calls = {"n": 0}

    class SeqClient(FakeClient):
        async def get(self, *args, **kwargs):
            calls["n"] += 1
            if "workflow" in args[0]:
                return FakeResp(200, {"items": [{"status": "failed"}]})
            return FakeResp(200, {"items": [
                {"id": "p1", "number": 42, "created_at": "2026-09-01T00:00:00Z",
                 "vcs": {"branch": "main", "revision": "abcdef1234567"}},
            ]})

    monkeypatch.setattr(ra, "_assert_safe_target", lambda url: None)
    monkeypatch.setattr(ra.httpx, "AsyncClient", lambda *a, **k: SeqClient(FakeResp()))
    ctx = PluginCtx(plugin_id="plugin-circleci", token="k", project_selector="gh/acme/web")
    rows = run(CircleCIAdapter().fetch(ctx))
    assert rows[0]["kind"] == "deploy" and rows[0]["status"] == "failed"
    assert rows[0]["version"] == "#42" and rows[0]["commit_hash"] == "abcdef1"


def test_render_live_maps_ready(monkeypatch):
    import services.plugins.rest_adapters as ra

    class SeqClient(FakeClient):
        async def get(self, *args, **kwargs):
            if "deploys" in args[0]:
                return FakeResp(200, {"deploys": [
                    {"deploy": {"id": "dpl_abc123", "status": "live",
                                "commit": {"id": "deadbee123", "message": "ship it", "branch": "main"},
                                "createdAt": "2026-09-01T00:00:00Z"}},
                ]})
            return FakeResp(200, [{"service": {"id": "srv_1"}}])

    monkeypatch.setattr(ra, "_assert_safe_target", lambda url: None)
    monkeypatch.setattr(ra.httpx, "AsyncClient", lambda *a, **k: SeqClient(FakeResp()))
    rows = run(RenderAdapter().fetch(PluginCtx(plugin_id="plugin-render", token="k")))
    assert rows[0]["kind"] == "deploy" and rows[0]["status"] == "ready"
    assert rows[0]["provider"] == "render"


def test_railway_failed_maps_failed(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"data": {"deployments": {"edges": [
        {"node": {"id": "dep123456789", "status": "FAILED", "createdAt": "2026-09-01T00:00:00Z",
                  "meta": {"branch": "main", "commit": "cafef00d123"}}},
    ]}}}))
    rows = run(RailwayAdapter().fetch(PluginCtx(plugin_id="plugin-railway", token="k")))
    assert rows[0]["status"] == "failed" and rows[0]["provider"] == "railway"


def test_gitlab_validates_user(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"username": "dev"}))
    ctx = PluginCtx(plugin_id="plugin-gitlab", token="glpat-x")
    assert "dev" in run(GitLabAdapter().test(ctx)).message


def test_bitbucket_needs_credentials():
    assert run(BitbucketAdapter().test(PluginCtx(plugin_id="plugin-bitbucket"))).success is False


def test_jira_needs_host_email_token():
    ctx = PluginCtx(plugin_id="plugin-jira", token="k", config={"email": "a@b.c"})
    assert run(JiraAdapter().test(ctx)).success is False


def test_linear_viewer_validates(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"data": {"viewer": {"id": "1", "displayName": "Dev"}}}))
    assert run(LinearAdapter().test(PluginCtx(plugin_id="plugin-linear", token="k"))).success is True


def test_discord_rejects_non_webhook():
    ctx = PluginCtx(plugin_id="plugin-discord", base_url="https://example.com/hook")
    assert run(DiscordAdapter().test(ctx)).success is False


def test_discord_valid_webhook_no_message_sent(monkeypatch):
    patch_client(monkeypatch, FakeResp(200, {"guild_id": "g1", "channel_id": "c1"}))
    ctx = PluginCtx(plugin_id="plugin-discord",
                    config={"webhook_url": "https://discord.com/api/webhooks/123/abc"})
    result = run(DiscordAdapter().test(ctx))
    assert result.success is True
