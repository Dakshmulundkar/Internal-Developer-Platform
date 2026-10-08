"""Batch 1 REST adapters — one small subclass per vendor.

Alert-producing plugins return monitoring_alerts-shaped rows from fetch().
Deploy-producing plugins return rows with ``"kind": "deploy"`` (deployments
table shape); the sync loop routes by kind. Anything else returns [].
"""

import logging

import httpx

from services.service_prober import _assert_safe_target
from .base import BaseAdapter, PluginCtx, TestResult

logger = logging.getLogger(__name__)

TIMEOUT = 12.0


class RestAdapter(BaseAdapter):
    """Shared HTTP helpers with SSRF guard. Subclasses implement test()/fetch()."""

    async def _get(self, url: str, headers: dict | None = None, params: dict | None = None) -> httpx.Response:
        _assert_safe_target(url)
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            return await client.get(url, headers=headers or {}, params=params or {})

    async def _post(
        self, url: str, headers: dict | None = None, data: dict | None = None, json: dict | None = None
    ) -> httpx.Response:
        _assert_safe_target(url)
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            return await client.post(url, headers=headers or {}, data=data, json=json)


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Alert fetchers ────────────────────────────────────────────────


class UptimeRobotAdapter(RestAdapter):
    plugin_ids = ("plugin-uptimerobot",)

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No UptimeRobot API key provided.")
        try:
            resp = await self._post(
                "https://api.uptimerobot.com/v2/getMonitors",
                data={"api_key": ctx.token, "format": "json"},
            )
            if resp.status_code == 200 and resp.json().get("stat") == "ok":
                return TestResult(True, "UptimeRobot API key validated.")
            return TestResult(False, "UptimeRobot rejected the API key.")
        except Exception as exc:
            return TestResult(False, f"Could not reach UptimeRobot API: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        if not ctx.token or "••••" in ctx.token:
            return []
        try:
            resp = await self._post(
                "https://api.uptimerobot.com/v2/getMonitors",
                data={"api_key": ctx.token, "format": "json", "logs": "0"},
            )
            monitors = resp.json().get("monitors", [])
        except Exception as exc:
            logger.warning("UptimeRobot fetch failed: %s", exc)
            return []
        rows = []
        for m in monitors:
            # 2 = up, 8/9 = down, else paused/unknown
            status_code = m.get("status")
            down = status_code in (8, 9)
            rows.append({
                "source": "uptimerobot",
                "title": f"{m.get('friendly_name', 'Monitor')} is {'DOWN' if down else 'UP'}",
                "description": f"{m.get('url', '')} · type {m.get('type', '')}",
                "severity": "critical" if down else "low",
                "status": "firing" if down else "resolved",
                "labels": {"monitor_id": str(m.get("id", ""))},
            })
        return rows


class RollbarAdapter(RestAdapter):
    plugin_ids = ("plugin-rollbar",)

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Rollbar access token provided.")
        try:
            resp = await self._get("https://api.rollbar.com/api/1/items/", params={"access_token": ctx.token})
            if resp.status_code == 200 and resp.json().get("err") == 0:
                return TestResult(True, "Rollbar token validated.")
            return TestResult(False, "Rollbar rejected the token.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Rollbar API: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        if not ctx.token or "••••" in ctx.token:
            return []
        try:
            resp = await self._get(
                "https://api.rollbar.com/api/1/items/",
                params={"access_token": ctx.token, "status": "active"},
            )
            items = resp.json().get("result", {}).get("items", [])
        except Exception as exc:
            logger.warning("Rollbar fetch failed: %s", exc)
            return []
        sev = {"critical": "critical", "error": "high", "warning": "medium"}
        rows = []
        for item in items:
            level = str(item.get("level", "error")).lower()
            active = item.get("status") == "active"
            rows.append({
                "source": "rollbar",
                "title": item.get("title", "Rollbar Item"),
                "description": f"{item.get('environment', '')} · {item.get('framework', '')}".strip(" ·"),
                "severity": sev.get(level, "low"),
                "status": "firing" if active else "resolved",
                "labels": {"rollbar_id": str(item.get("id", "")), "level": level},
            })
        return rows


class BugsnagAdapter(RestAdapter):
    plugin_ids = ("plugin-bugsnag",)

    def _auth(self, ctx: PluginCtx) -> dict:
        return {"Authorization": f"token {ctx.token}"}

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Bugsnag auth token provided.")
        try:
            resp = await self._get("https://api.bugsnag.com/user", headers=self._auth(ctx))
            if resp.status_code == 200:
                return TestResult(True, "Bugsnag token validated.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Bugsnag rejected the token (HTTP 401/403).")
            return TestResult(False, f"Bugsnag API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Bugsnag API: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        project_id = str(ctx.config.get("project_id") or "").strip()
        if not ctx.token or "••••" in ctx.token or not project_id:
            return []
        try:
            resp = await self._get(
                f"https://api.bugsnag.com/projects/{project_id}/errors",
                headers=self._auth(ctx),
                params={"per_page": "30"},
            )
            resp.raise_for_status()
            errors = resp.json()
        except Exception as exc:
            logger.warning("Bugsnag fetch failed: %s", exc)
            return []
        rows = []
        for err in errors if isinstance(errors, list) else []:
            open_ = err.get("status") == "open"
            rows.append({
                "source": "bugsnag",
                "title": f"{err.get('exception_class', 'Error')}: {err.get('message', '')}"[:200],
                "description": f"events: {err.get('events_count', '?')} · users: {err.get('users_count', '?')}",
                "severity": "high" if open_ else "low",
                "status": "firing" if open_ else "resolved",
                "labels": {"bugsnag_id": str(err.get("id", ""))},
            })
        return rows


class PagerDutyAdapter(RestAdapter):
    plugin_ids = ("plugin-pagerduty",)

    def _auth(self, ctx: PluginCtx) -> dict:
        return {"Authorization": f"Token token={ctx.token}", "Accept": "application/vnd.pagerduty+json;version=2"}

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No PagerDuty API token provided.")
        try:
            resp = await self._get("https://api.pagerduty.com/users/me", headers=self._auth(ctx))
            if resp.status_code == 200:
                return TestResult(True, "PagerDuty token validated.")
            if resp.status_code in (401, 403):
                return TestResult(False, "PagerDuty rejected the token (HTTP 401/403).")
            return TestResult(False, f"PagerDuty API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach PagerDuty API: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        if not ctx.token or "••••" in ctx.token:
            return []
        try:
            resp = await self._get(
                "https://api.pagerduty.com/incidents",
                headers=self._auth(ctx),
                params={"statuses[]": ["triggered", "acknowledged"], "limit": "50"},
            )
            resp.raise_for_status()
            incidents = resp.json().get("incidents", [])
        except Exception as exc:
            logger.warning("PagerDuty fetch failed: %s", exc)
            return []
        rows = []
        for inc in incidents:
            status = str(inc.get("status", "")).lower()
            urgency = str(inc.get("urgency", "low")).lower()
            rows.append({
                "source": "pagerduty",
                "title": inc.get("title", "PagerDuty Incident"),
                "description": inc.get("description") or f"urgency: {urgency}",
                "severity": "critical" if urgency == "high" else "high" if status == "triggered" else "medium",
                "status": "resolved" if status == "resolved" else "firing",
                "labels": {"pagerduty_id": str(inc.get("id", "")), "urgency": urgency},
            })
        return rows


class OpsGenieAdapter(RestAdapter):
    plugin_ids = ("plugin-opsgenie",)

    def _auth(self, ctx: PluginCtx) -> dict:
        return {"Authorization": f"GenieKey {ctx.token}"}

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No OpsGenie API key provided.")
        try:
            resp = await self._get("https://api.opsgenie.com/v2/account", headers=self._auth(ctx))
            if resp.status_code == 200:
                return TestResult(True, "OpsGenie API key validated.")
            if resp.status_code in (401, 403):
                return TestResult(False, "OpsGenie rejected the API key (HTTP 401/403).")
            return TestResult(False, f"OpsGenie API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach OpsGenie API: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        if not ctx.token or "••••" in ctx.token:
            return []
        try:
            resp = await self._get(
                "https://api.opsgenie.com/v2/alerts",
                headers=self._auth(ctx),
                params={"query": "status: open", "limit": "50"},
            )
            resp.raise_for_status()
            alerts = resp.json().get("data", [])
        except Exception as exc:
            logger.warning("OpsGenie fetch failed: %s", exc)
            return []
        sev = {"P1": "critical", "P2": "high", "P3": "medium"}
        rows = []
        for alert in alerts:
            status = str(alert.get("status", "open")).lower()
            rows.append({
                "source": "opsgenie",
                "title": alert.get("message", "OpsGenie Alert"),
                "description": f"priority: {alert.get('priority', '')} · teams: {alert.get('teams', '')}",
                "severity": sev.get(str(alert.get("priority", "")).upper(), "low"),
                "status": "resolved" if status == "closed" else "firing",
                "labels": {"opsgenie_id": str(alert.get("id", ""))},
            })
        return rows


# ── Deploy fetchers (rows routed to the deployments table) ──────────


class CircleCIAdapter(RestAdapter):
    plugin_ids = ("plugin-circleci",)

    def _slug(self, ctx: PluginCtx) -> str:
        return (ctx.project_selector or "").strip().strip("/")

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No CircleCI token provided.")
        slug = self._slug(ctx)
        if not slug:
            return TestResult(False, "CircleCI needs a project slug (e.g. gh/org/repo) in Project Selector.")
        try:
            resp = await self._get(
                f"https://circleci.com/api/v2/project/{slug}",
                headers={"Circle-Token": ctx.token},
            )
            if resp.status_code == 200:
                return TestResult(True, f"CircleCI project {slug} verified.")
            if resp.status_code in (401, 403):
                return TestResult(False, "CircleCI rejected the token (HTTP 401/403).")
            return TestResult(False, f"CircleCI API returned HTTP {resp.status_code}. Check the slug.")
        except Exception as exc:
            return TestResult(False, f"Could not reach CircleCI API: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        slug = self._slug(ctx)
        if not ctx.token or "••••" in ctx.token or not slug:
            return []
        try:
            resp = await self._get(
                f"https://circleci.com/api/v2/project/{slug}/pipeline",
                headers={"Circle-Token": ctx.token},
                params={"mine": "false"},
            )
            resp.raise_for_status()
            pipelines = resp.json().get("items", [])[:5]
        except Exception as exc:
            logger.warning("CircleCI fetch failed: %s", exc)
            return []
        rows = []
        for pipe in pipelines:
            status = "ready"
            try:
                wf = await self._get(
                    f"https://circleci.com/api/v2/pipeline/{pipe.get('id')}/workflow",
                    headers={"Circle-Token": ctx.token},
                )
                wf_statuses = [w.get("status") for w in wf.json().get("items", [])]
                if any(s == "failed" for s in wf_statuses):
                    status = "failed"
                elif any(s in ("running", "on_hold") for s in wf_statuses):
                    status = "building"
            except Exception:
                pass
            vcs = pipe.get("vcs") or {}
            rows.append({
                "kind": "deploy",
                "provider": "circleci",
                "version": f"#{pipe.get('number', '')}",
                "status": status,
                "branch": vcs.get("branch", ""),
                "commit_hash": (vcs.get("revision", "") or "")[:7],
                "created_at": pipe.get("created_at"),
            })
        return rows


class RenderAdapter(RestAdapter):
    plugin_ids = ("plugin-render",)

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Render API key provided.")
        try:
            resp = await self._get("https://api.render.com/v1/services", headers=_bearer(ctx.token))
            if resp.status_code == 200:
                return TestResult(True, "Render API key validated.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Render rejected the API key (HTTP 401/403).")
            return TestResult(False, f"Render API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Render API: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        if not ctx.token or "••••" in ctx.token:
            return []
        try:
            resp = await self._get("https://api.render.com/v1/services", headers=_bearer(ctx.token))
            resp.raise_for_status()
            services = resp.json()
            if isinstance(services, dict):
                services = services.get("services", services.get("service", []))
        except Exception as exc:
            logger.warning("Render fetch failed: %s", exc)
            return []
        status_map = {"live": "ready", "build_failed": "failed", "canceled": "failed",
                      "created": "queued", "queued": "queued", "building": "building", "updating": "building"}
        rows = []
        for entry in services if isinstance(services, list) else []:
            svc = entry.get("service", entry)
            sid = svc.get("id", "")
            try:
                dep = await self._get(
                    f"https://api.render.com/v1/services/{sid}/deploys",
                    headers=_bearer(ctx.token),
                    params={"limit": "3"},
                )
                deploys = dep.json()
                if isinstance(deploys, dict):
                    deploys = deploys.get("deploys", [])
            except Exception:
                continue
            for item in (deploys or [])[:3]:
                d = item.get("deploy", item)
                commit = d.get("commit", {}) or {}
                rows.append({
                    "kind": "deploy",
                    "provider": "render",
                    "version": str(d.get("id", ""))[:8],
                    "status": status_map.get(str(d.get("status", "")).lower(), "building"),
                    "branch": commit.get("branch", ""),
                    "commit_hash": str(commit.get("id", "") or "")[:7],
                    "commit_message": commit.get("message", ""),
                    "created_at": d.get("createdAt"),
                })
        return rows


class RailwayAdapter(RestAdapter):
    plugin_ids = ("plugin-railway",)
    GRAPHQL = "https://backboard.railway.app/graphql/v2"

    async def _query(self, ctx: PluginCtx, query: str) -> dict:
        resp = await self._post(self.GRAPHQL, headers=_bearer(ctx.token), json={"query": query})
        resp.raise_for_status()
        data = resp.json()
        if data.get("errors"):
            raise ValueError(str(data["errors"][0].get("message", "GraphQL error")))
        return data.get("data", {})

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Railway API token provided.")
        try:
            await self._query(ctx, "{ deployments(first: 1) { edges { node { id } } } }")
            return TestResult(True, "Railway API token validated.")
        except Exception as exc:
            msg = str(exc)
            if "401" in msg or "403" in msg or "UNAUTHORIZED" in msg.upper():
                return TestResult(False, "Railway rejected the API token.")
            return TestResult(False, f"Could not reach Railway API: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        if not ctx.token or "••••" in ctx.token:
            return []
        try:
            data = await self._query(
                ctx, "{ deployments(first: 10) { edges { node { id status createdAt meta { branch commit } } } } }")
            edges = data.get("deployments", {}).get("edges", [])
        except Exception as exc:
            logger.warning("Railway fetch failed: %s", exc)
            return []
        status_map = {"SUCCESS": "ready", "FAILED": "failed", "CRASHED": "failed",
                      "QUEUED": "queued", "BUILDING": "building", "DEPLOYING": "building"}
        rows = []
        for edge in edges:
            node = edge.get("node", {})
            meta = node.get("meta") or {}
            rows.append({
                "kind": "deploy",
                "provider": "railway",
                "version": str(node.get("id", ""))[:8],
                "status": status_map.get(str(node.get("status", "")).upper(), "building"),
                "branch": meta.get("branch", ""),
                "commit_hash": str(meta.get("commit", "") or "")[:7],
                "created_at": node.get("createdAt"),
            })
        return rows


# ── Verified tests (fetch lands in later batches) ───────────────────


class GitLabAdapter(RestAdapter):
    plugin_ids = ("plugin-gitlab",)

    def _host(self, ctx: PluginCtx) -> str:
        return (ctx.base_url or "https://gitlab.com").rstrip("/")

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No GitLab personal access token provided.")
        host = self._host(ctx)
        try:
            resp = await self._get(f"{host}/api/v4/user", headers={"PRIVATE-TOKEN": ctx.token})
            if resp.status_code == 200:
                username = resp.json().get("username", "GitLab user")
                return TestResult(True, f"GitLab connected as {username}.")
            if resp.status_code in (401, 403):
                return TestResult(False, "GitLab rejected the token (HTTP 401/403).")
            return TestResult(False, f"GitLab API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach GitLab at {host}: {exc}")


class BitbucketAdapter(RestAdapter):
    plugin_ids = ("plugin-bitbucket",)

    async def test(self, ctx: PluginCtx) -> TestResult:
        import base64

        username = str(ctx.config.get("username") or "").strip()
        secret = ctx.token or ""
        if secret and "••••" in secret:
            secret = ""
        headers: dict = {}
        auth = None
        if username and secret:
            basic = base64.b64encode(f"{username}:{secret}".encode()).decode()
            headers["Authorization"] = f"Basic {basic}"
        elif secret:
            headers["Authorization"] = f"Bearer {secret}"
        else:
            return TestResult(False, "Bitbucket needs a username + app password (or a token).")
        try:
            resp = await self._get("https://api.bitbucket.org/2.0/user", headers=headers)
            if resp.status_code == 200:
                name = resp.json().get("display_name", "Bitbucket user")
                return TestResult(True, f"Bitbucket connected as {name}.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Bitbucket rejected the credentials (HTTP 401/403).")
            return TestResult(False, f"Bitbucket API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Bitbucket API: {exc}")


class JiraAdapter(RestAdapter):
    plugin_ids = ("plugin-jira",)

    async def test(self, ctx: PluginCtx) -> TestResult:
        import base64

        host = (ctx.base_url or "").rstrip("/")
        email = str(ctx.config.get("email") or "").strip()
        token = ctx.token or ""
        if not host or not email or not token or "••••" in token:
            return TestResult(False, "Jira needs host URL, account email, and API token.")
        basic = base64.b64encode(f"{email}:{token}".encode()).decode()
        try:
            resp = await self._get(f"{host}/rest/api/3/myself", headers={"Authorization": f"Basic {basic}"})
            if resp.status_code == 200:
                name = resp.json().get("displayName", "Jira user")
                return TestResult(True, f"Jira connected as {name}.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Jira rejected the credentials (HTTP 401/403).")
            return TestResult(False, f"Jira API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Jira at {host}: {exc}")

    def _creds(self, ctx: PluginCtx) -> tuple[str, str, str] | None:
        import base64

        host = (ctx.base_url or "").rstrip("/")
        email = str(ctx.config.get("email") or "").strip()
        token = ctx.token or ""
        if not host or not email or not token or "••••" in token:
            return None
        basic = base64.b64encode(f"{email}:{token}".encode()).decode()
        return host, email, basic

    async def send(self, ctx: PluginCtx, title: str, body: str) -> TestResult:
        creds = self._creds(ctx)
        if not creds:
            return TestResult(False, "Jira needs host URL, account email, and API token.")
        host, _, basic = creds
        project_key = str(ctx.config.get("project_key") or "").strip()
        issue_type = str(ctx.config.get("issue_type") or "Task").strip() or "Task"
        if not project_key:
            return TestResult(False, "Jira needs a Project Key (plugin settings).")
        try:
            resp = await self._post(
                f"{host}/rest/api/3/issue",
                headers={"Authorization": f"Basic {basic}", "Content-Type": "application/json"},
                json={"fields": {
                    "project": {"key": project_key},
                    "summary": title[:255],
                    "description": {"version": 1, "type": "doc", "content": [
                        {"type": "paragraph", "content": [{"type": "text", "text": body[:2000]}]}]},
                    "issuetype": {"name": issue_type},
                }})
            if resp.status_code in (200, 201):
                return TestResult(True, f"Jira issue created: {resp.json().get('key', '')}.")
            return TestResult(False, f"Jira create failed (HTTP {resp.status_code}).")
        except Exception as exc:
            return TestResult(False, f"Jira send failed: {exc}")


class LinearAdapter(RestAdapter):
    plugin_ids = ("plugin-linear",)

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Linear API key provided.")
        try:
            resp = await self._post(
                "https://api.linear.app/graphql",
                headers={**_bearer(ctx.token), "Content-Type": "application/json"},
                json={"query": "{ viewer { id displayName } }"},
            )
            data = resp.json()
            viewer = (data.get("data") or {}).get("viewer")
            if viewer:
                return TestResult(True, f"Linear connected as {viewer.get('displayName', 'user')}.")
            if resp.status_code in (401, 403) or "authentication" in str(data).lower():
                return TestResult(False, "Linear rejected the API key.")
            return TestResult(False, "Linear API did not return a viewer. Check the key.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Linear API: {exc}")

    async def send(self, ctx: PluginCtx, title: str, body: str) -> TestResult:
        team_id = str(ctx.config.get("team_id") or "").strip()
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Linear API key configured.")
        if not team_id:
            return TestResult(False, "Linear needs a Team ID (plugin settings).")
        try:
            resp = await self._post(
                "https://api.linear.app/graphql",
                headers={**_bearer(ctx.token), "Content-Type": "application/json"},
                json={"query": "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id title } } }",
                      "variables": {"input": {"title": title[:255], "description": body[:4000], "teamId": team_id}}})
            data = resp.json()
            issue = (data.get("data") or {}).get("issueCreate", {}).get("issue")
            if issue:
                return TestResult(True, f"Linear issue created: {issue.get('title', '')}.")
            return TestResult(False, f"Linear create failed: {str(data.get('errors', ''))[:150]}.")
        except Exception as exc:
            return TestResult(False, f"Linear send failed: {exc}")


class DiscordAdapter(RestAdapter):
    plugin_ids = ("plugin-discord",)

    def _webhook(self, ctx: PluginCtx) -> str:
        return (ctx.base_url or str(ctx.config.get("webhook_url") or "")).strip()

    async def test(self, ctx: PluginCtx) -> TestResult:
        url = self._webhook(ctx)
        if not url or "discord.com/api/webhooks" not in url:
            return TestResult(False, "Discord needs a channel webhook URL (Server Settings → Integrations → Webhooks).")
        try:
            resp = await self._get(url)
            if resp.status_code == 200:
                info = resp.json()
                where = info.get("guild_id", "") or info.get("channel_id", "")
                return TestResult(True, f"Discord webhook valid{f' (guild {where})' if where else ''}. No test message sent.")
            if resp.status_code in (401, 403, 404):
                return TestResult(False, "Discord rejected the webhook URL (deleted or revoked?).")
            return TestResult(False, f"Discord returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Discord: {exc}")

    async def send(self, ctx: PluginCtx, title: str, body: str) -> TestResult:
        url = self._webhook(ctx)
        if not url or "discord.com/api/webhooks" not in url:
            return TestResult(False, "No Discord webhook URL configured.")
        try:
            resp = await self._post(url, json={
                "username": "Aether IDP",
                "content": f"**{title}**\n{body[:1800]}",
            })
            if resp.status_code in (200, 204):
                return TestResult(True, "Posted to Discord channel.")
            return TestResult(False, f"Discord send failed (HTTP {resp.status_code}).")
        except Exception as exc:
            return TestResult(False, f"Discord send failed: {exc}")
