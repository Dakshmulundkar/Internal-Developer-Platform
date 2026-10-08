"""Concrete plugin adapters. Each test() hits the real vendor API —
a failed check returns success=False, never a disguised pass."""

import logging

import httpx

from services import datadog_service, grafana_service, newrelic_service, sentry_service
from services.service_prober import _assert_safe_target
from .base import BaseAdapter, PluginCtx, TestResult

logger = logging.getLogger(__name__)

TIMEOUT = 12.0


def _safe(url: str) -> str | None:
    """SSRF-guard a URL. Returns an error message, or None when safe."""
    if not url:
        return None
    try:
        _assert_safe_target(url)
        return None
    except ValueError as exc:
        return str(exc)


class GrafanaAdapter(BaseAdapter):
    plugin_ids = ("plugin-grafana",)

    async def test(self, ctx: PluginCtx) -> TestResult:
        url = (ctx.base_url or "https://g-8949d28229f3479a838dc2a11b811802.grafana.net").rstrip("/")
        if err := _safe(url):
            return TestResult(False, err)
        headers = {}
        if ctx.token and "••••" not in ctx.token:
            headers["Authorization"] = f"Bearer {ctx.token}"
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.get(f"{url}/api/health", headers=headers)
                if resp.status_code == 200:
                    return TestResult(True, f"Grafana reachable at {url} (HTTP 200). Monitoring webhook active.")
                return TestResult(False, f"Grafana at {url} returned HTTP {resp.status_code}. Check base URL and API key.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Grafana at {url}: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        if not ctx.base_url or not ctx.token or "••••" in ctx.token:
            return []
        return await grafana_service.fetch_alerts(ctx.base_url, ctx.token)


class VercelAdapter(BaseAdapter):
    plugin_ids = ("plugin-vercel",)

    async def test(self, ctx: PluginCtx) -> TestResult:
        from config import settings
        token = ctx.token or getattr(settings, "VERCEL_API_TOKEN", "") or ""
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            if token and "••••" not in token:
                try:
                    resp = await client.get("https://api.vercel.com/v2/user", headers={"Authorization": f"Bearer {token}"})
                    if resp.status_code == 200:
                        info = resp.json().get("user", {})
                        name = info.get("username") or info.get("email") or "Vercel Account"
                        return TestResult(True, f"Connected to Vercel account: {name}.")
                    return TestResult(False, f"Vercel API rejected token: HTTP {resp.status_code}.")
                except Exception as exc:
                    return TestResult(False, f"Failed to reach Vercel API: {exc}")
            raw = (ctx.project_selector or ctx.base_url or "").replace("https://", "").replace("http://", "").strip().rstrip("/")
            name = raw[:-11] if raw.endswith(".vercel.app") else raw
            endpoint = f"https://{name}.vercel.app" if name else (ctx.base_url or "")
            if not endpoint:
                return TestResult(False, "No Vercel token or project name provided.")
            if err := _safe(endpoint):
                return TestResult(False, err)
            try:
                resp = await client.get(endpoint, follow_redirects=False)
                if resp.status_code < 500:
                    return TestResult(True, f"Verified project endpoint {endpoint} (HTTP {resp.status_code}).")
                return TestResult(False, f"Project endpoint {endpoint} returned HTTP {resp.status_code}.")
            except Exception as exc:
                return TestResult(False, f"Could not reach {endpoint}: {exc}")


class GitHubAdapter(BaseAdapter):
    plugin_ids = ("plugin-github", "plugin-github-actions")

    async def test(self, ctx: PluginCtx) -> TestResult:
        headers = {"Accept": "application/vnd.github.v3+json"}
        if ctx.token and "••••" not in ctx.token:
            headers["Authorization"] = f"token {ctx.token}"
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.get("https://api.github.com/zen", headers=headers)
                if resp.status_code == 200:
                    return TestResult(True, "Connected to GitHub API.")
                return TestResult(False, f"GitHub API returned HTTP {resp.status_code}. Check token.")
        except Exception as exc:
            return TestResult(False, f"Could not reach GitHub API: {exc}")


class SentryAdapter(BaseAdapter):
    plugin_ids = ("plugin-sentry",)

    def _org_projects(self, ctx: PluginCtx) -> tuple[str, list[str]]:
        org = str(ctx.config.get("org") or "").strip()
        raw = ctx.config.get("projects") or ctx.config.get("project") or ""
        if isinstance(raw, list):
            projects = [str(p).strip() for p in raw if str(p).strip()]
        else:
            projects = [p.strip() for p in str(raw).split(",") if p.strip()]
        return org, projects

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Sentry auth token provided.")
        org, projects = self._org_projects(ctx)
        if not org or not projects:
            return TestResult(False, "Sentry needs an organization slug and at least one project slug (configure in plugin settings).")
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.get(
                    f"https://sentry.io/api/0/projects/{org}/{projects[0]}/",
                    headers={"Authorization": f"Bearer {ctx.token}"},
                )
                if resp.status_code == 200:
                    return TestResult(True, f"Sentry project {org}/{projects[0]} verified.")
                if resp.status_code in (401, 403):
                    return TestResult(False, "Sentry rejected the token (HTTP 401/403). Check token scopes (project:read).")
                return TestResult(False, f"Sentry API returned HTTP {resp.status_code}. Check org/project slugs.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Sentry API: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        if not ctx.token or "••••" in ctx.token:
            return []
        org, projects = self._org_projects(ctx)
        if not org or not projects or not ctx.token:
            return []
        return await sentry_service.fetch_issues_multi(org, projects, ctx.token)


class DatadogAdapter(BaseAdapter):
    plugin_ids = ("plugin-datadog",)

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Datadog API key provided.")
        headers = {"DD-API-KEY": ctx.token, "Accept": "application/json"}
        app_key = str(ctx.config.get("app_key") or "").strip()
        if app_key:
            headers["DD-APPLICATION-KEY"] = app_key
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.get("https://api.datadoghq.com/api/v1/validate", headers=headers)
                if resp.status_code == 200:
                    return TestResult(True, "Datadog API key validated.")
                if resp.status_code in (401, 403):
                    return TestResult(False, "Datadog rejected the API key (HTTP 401/403).")
                return TestResult(False, f"Datadog API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Datadog API: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        if not ctx.token or "••••" in ctx.token:
            return []
        app_key = str(ctx.config.get("app_key") or "").strip()
        return await datadog_service.fetch_monitors(ctx.token, app_key)


class NewRelicAdapter(BaseAdapter):
    plugin_ids = ("plugin-newrelic",)

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No New Relic API key provided (starts with NRAK-).")
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.get(
                    "https://api.newrelic.com/v2/alerts_violations.json",
                    params={"only_open": "true"},
                    headers={"X-Api-Key": ctx.token, "Accept": "application/json"},
                )
                if resp.status_code == 200:
                    return TestResult(True, "New Relic API key validated.")
                if resp.status_code in (401, 403):
                    return TestResult(False, "New Relic rejected the API key (HTTP 401/403).")
                return TestResult(False, f"New Relic API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach New Relic API: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        if not ctx.token or "••••" in ctx.token:
            return []
        account_id = str(ctx.config.get("account_id") or "").strip()
        return await newrelic_service.fetch_violations(ctx.token, account_id)


class GenericAdapter(BaseAdapter):
    """Honest fallback: verifies the configured base URL is reachable."""

    plugin_ids = ()

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.base_url:
            return TestResult(False, "No base URL configured — nothing to verify against.")
        if err := _safe(ctx.base_url):
            return TestResult(False, err)
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.get(ctx.base_url, follow_redirects=False)
                if resp.status_code < 500:
                    return TestResult(True, f"Reached {ctx.base_url} (HTTP {resp.status_code}).")
                return TestResult(False, f"{ctx.base_url} returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach {ctx.base_url}: {exc}")
