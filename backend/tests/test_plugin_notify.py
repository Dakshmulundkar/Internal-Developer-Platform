"""Batch 4 outbound-send tests — fixtures only, nothing is really posted."""

import asyncio

from services.notify_fanout import SEND_CAPABLE, targets_for_project
from services.plugins.base import PluginCtx
from services.plugins.collab_adapters import SlackAdapter, TeamsAdapter
from services.plugins.rest_adapters import DiscordAdapter, JiraAdapter, LinearAdapter


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
        self.posts: list = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, *args, **kwargs):
        return self._resp

    async def post(self, url, **kwargs):
        self.posts.append((url, kwargs))
        return self._resp


def patch_clients(monkeypatch, resp: FakeResp):
    import services.plugins.rest_adapters as ra

    monkeypatch.setattr(ra.httpx, "AsyncClient", lambda *a, **k: FakeClient(resp))
    monkeypatch.setattr(ra, "_assert_safe_target", lambda url: None)


def run(coro):
    return asyncio.run(coro)


def test_slack_send_ok(monkeypatch):
    patch_clients(monkeypatch, FakeResp(200, {"ok": True}))
    ctx = PluginCtx(plugin_id="plugin-slack", token="xoxb-k", config={"channel": "#inc"})
    result = run(SlackAdapter().send(ctx, "Title", "Body"))
    assert result.success is True


def test_slack_send_needs_channel():
    ctx = PluginCtx(plugin_id="plugin-slack", token="xoxb-k", config={})
    result = run(SlackAdapter().send(ctx, "T", "B"))
    assert result.success is False and "channel" in result.message.lower()


def test_slack_send_error_reported(monkeypatch):
    patch_clients(monkeypatch, FakeResp(200, {"ok": False, "error": "channel_not_found"}))
    ctx = PluginCtx(plugin_id="plugin-slack", token="xoxb-k", config={"channel": "#nope"})
    result = run(SlackAdapter().send(ctx, "T", "B"))
    assert result.success is False and "channel_not_found" in result.message


def test_discord_send_ok(monkeypatch):
    patch_clients(monkeypatch, FakeResp(204, {}))
    ctx = PluginCtx(plugin_id="plugin-discord",
                    config={"webhook_url": "https://discord.com/api/webhooks/1/abc"})
    assert run(DiscordAdapter().send(ctx, "T", "B")).success is True


def test_teams_send_ok(monkeypatch):
    patch_clients(monkeypatch, FakeResp(201, {"id": "m1"}))
    ctx = PluginCtx(plugin_id="plugin-msteams", token="k",
                    config={"team_id": "t1", "channel_id": "c1"})
    assert run(TeamsAdapter().send(ctx, "T", "B")).success is True


def test_teams_send_needs_ids():
    ctx = PluginCtx(plugin_id="plugin-msteams", token="k", config={})
    assert run(TeamsAdapter().send(ctx, "T", "B")).success is False


def test_jira_create_ok(monkeypatch):
    patch_clients(monkeypatch, FakeResp(201, {"key": "OPS-42"}))
    ctx = PluginCtx(plugin_id="plugin-jira", token="tok", base_url="https://acme.atlassian.net",
                    config={"email": "a@b.c", "project_key": "OPS"})
    result = run(JiraAdapter().send(ctx, "Incident", "Details"))
    assert result.success is True and "OPS-42" in result.message


def test_jira_needs_project_key():
    ctx = PluginCtx(plugin_id="plugin-jira", token="tok", base_url="https://acme.atlassian.net",
                    config={"email": "a@b.c"})
    assert run(JiraAdapter().send(ctx, "T", "B")).success is False


def test_linear_create_ok(monkeypatch):
    patch_clients(monkeypatch, FakeResp(200, {"data": {"issueCreate": {"issue": {"id": "i1", "title": "T"}}}}))
    ctx = PluginCtx(plugin_id="plugin-linear", token="k", config={"team_id": "team-1"})
    assert run(LinearAdapter().send(ctx, "T", "B")).success is True


def test_default_send_unsupported():
    from services.plugins.rest_adapters import UptimeRobotAdapter

    ctx = PluginCtx(plugin_id="plugin-uptimerobot", token="k")
    result = run(UptimeRobotAdapter().send(ctx, "T", "B"))
    assert result.success is False


def _inst(pid, status="connected", enabled=None):
    return {"id": f"inst-{pid}", "plugin_id": pid, "status": status,
            "enabled_for_projects": enabled if enabled is not None else []}


def test_targets_scoped_to_project():
    installs = [
        _inst("plugin-slack", enabled=["p1"]),
        _inst("plugin-discord", enabled=["p2"]),
        _inst("plugin-jira"),  # empty scope = all projects
        _inst("plugin-grafana", enabled=["p1"]),  # not send-capable
        _inst("plugin-slack", status="error", enabled=["p1"]),  # wrong status
    ]
    targets = targets_for_project("p1", installs)
    assert [t["plugin_id"] for t in targets] == ["plugin-slack", "plugin-jira"]


def test_targets_empty_project_matches_scoped():
    installs = [_inst("plugin-slack", enabled=["p1"])]
    assert targets_for_project(None, installs) == installs


def test_send_capable_set():
    assert SEND_CAPABLE == ("plugin-slack", "plugin-msteams", "plugin-discord", "plugin-jira", "plugin-linear")
