"""Batch 3b collaboration adapters — real token tests; sends land in Batch 4."""

import logging

from .rest_adapters import RestAdapter
from .base import PluginCtx, TestResult

logger = logging.getLogger(__name__)


class SlackAdapter(RestAdapter):
    plugin_ids = ("plugin-slack",)

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Slack token provided (paste a bot token, or use Connect with Slack).")
        try:
            resp = await self._post("https://slack.com/api/auth.test",
                                    headers={"Authorization": f"Bearer {ctx.token}"})
            data = resp.json()
            if data.get("ok"):
                return TestResult(True, f"Slack connected as {data.get('user', 'bot')} in {data.get('team', 'workspace')}.")
            return TestResult(False, f"Slack rejected the token: {data.get('error', 'unknown error')}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Slack API: {exc}")

    async def send(self, ctx: PluginCtx, title: str, body: str) -> TestResult:
        channel = str(ctx.config.get("channel") or "").strip()
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Slack token configured.")
        if not channel:
            return TestResult(False, "No Slack channel configured (plugin settings → Channel).")
        try:
            resp = await self._post("https://slack.com/api/chat.postMessage",
                                    headers={"Authorization": f"Bearer {ctx.token}"},
                                    json={"channel": channel, "text": f"*{title}*\n{body}"})
            data = resp.json()
            if data.get("ok"):
                return TestResult(True, f"Posted to {channel}.")
            return TestResult(False, f"Slack send failed: {data.get('error', 'unknown error')}.")
        except Exception as exc:
            return TestResult(False, f"Slack send failed: {exc}")


class TeamsAdapter(RestAdapter):
    plugin_ids = ("plugin-msteams",)

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Teams/Graph token provided (or use Connect with Microsoft).")
        try:
            resp = await self._get("https://graph.microsoft.com/v1.0/me",
                                   headers={"Authorization": f"Bearer {ctx.token}"})
            if resp.status_code == 200:
                return TestResult(True, f"Microsoft Graph connected as {resp.json().get('displayName', 'user')}.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Graph rejected the token (expired or missing scope). Reconnect.")
            return TestResult(False, f"Graph returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Microsoft Graph: {exc}")

    async def send(self, ctx: PluginCtx, title: str, body: str) -> TestResult:
        team_id = str(ctx.config.get("team_id") or "").strip()
        channel_id = str(ctx.config.get("channel_id") or "").strip()
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Teams/Graph token configured.")
        if not team_id or not channel_id:
            return TestResult(False, "Teams needs Team ID + Channel ID (plugin settings).")
        try:
            resp = await self._post(
                f"https://graph.microsoft.com/v1.0/teams/{team_id}/channels/{channel_id}/messages",
                headers={"Authorization": f"Bearer {ctx.token}"},
                json={"body": {"contentType": "Text", "content": f"{title}\n{body}"}})
            if resp.status_code in (200, 201):
                return TestResult(True, "Posted to Teams channel.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Graph rejected the token (expired?). Reconnect.")
            return TestResult(False, f"Graph returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Teams send failed: {exc}")
