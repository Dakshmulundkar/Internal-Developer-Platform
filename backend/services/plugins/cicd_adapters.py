"""Batch 3a adapters — CI/deploy + source-control depth.

Deploy-producing plugins return rows with ``"kind": "deploy"`` (deployments
table shape). Alert-producing plugins return monitoring_alerts-shaped rows.
Source-control plugins verify credentials; repo import stays a Batch 4 concern.
"""

import base64
import logging

from .rest_adapters import RestAdapter, _bearer
from .base import PluginCtx, TestResult

logger = logging.getLogger(__name__)


def _basic(user: str, secret: str) -> dict:
    raw = base64.b64encode(f"{user}:{secret}".encode()).decode()
    return {"Authorization": f"Basic {raw}"}


# ── CI deploy fetchers ────────────────────────────────────────────


class JenkinsAdapter(RestAdapter):
    plugin_ids = ("plugin-jenkins",)

    def _base(self, ctx: PluginCtx) -> str:
        return (ctx.base_url or "").rstrip("/")

    def _auth(self, ctx: PluginCtx) -> dict:
        username = str(ctx.config.get("username") or "").strip()
        if username and ctx.token and "••••" not in ctx.token:
            return _basic(username, ctx.token)
        if ctx.token and "••••" not in ctx.token:
            return _bearer(ctx.token)
        return {}

    async def test(self, ctx: PluginCtx) -> TestResult:
        base = self._base(ctx)
        if not base:
            return TestResult(False, "Jenkins needs its server URL in Base URL.")
        if not self._auth(ctx):
            return TestResult(False, "Jenkins needs a username plus API token.")
        try:
            resp = await self._get(f"{base}/api/json", headers=self._auth(ctx))
            if resp.status_code == 200:
                return TestResult(True, "Jenkins connected.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Jenkins rejected the credentials (HTTP 401/403).")
            return TestResult(False, f"Jenkins returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Jenkins at {base}: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        base = self._base(ctx)
        if not base or not self._auth(ctx):
            return []
        try:
            resp = await self._get(f"{base}/api/json", headers=self._auth(ctx), params={"tree": "jobs[name,url,lastBuild[number,result,timestamp,fullDisplayName]]"})
            resp.raise_for_status()
            jobs = resp.json().get("jobs", [])[:5]
        except Exception as exc:
            logger.warning("Jenkins fetch failed: %s", exc)
            return []
        result_map = {"SUCCESS": "ready", "FAILURE": "failed", "ABORTED": "failed", "UNSTABLE": "failed"}
        rows = []
        for job in jobs:
            build = job.get("lastBuild") or {}
            if not build:
                continue
            rows.append({
                "kind": "deploy",
                "provider": "jenkins",
                "version": f"#{build.get('number', '')}",
                "status": result_map.get(str(build.get("result", "")).upper(), "building"),
                "commit_message": f"{job.get('name', '')} {build.get('fullDisplayName', '')}".strip()[:200],
                "created_at": None,
            })
        return rows


class TravisCIAdapter(RestAdapter):
    plugin_ids = ("plugin-travisci",)
    API = "https://api.travis-ci.com"

    def _slug(self, ctx: PluginCtx) -> str:
        return (ctx.project_selector or "").strip().strip("/")

    def _headers(self, ctx: PluginCtx) -> dict:
        return {"Travis-API-Version": "3", "Accept": "application/json",
                "Authorization": f"token {ctx.token}"}

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Travis CI token provided.")
        try:
            resp = await self._get(f"{self.API}/user", headers=self._headers(ctx))
            if resp.status_code == 200:
                return TestResult(True, "Travis CI token validated.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Travis CI rejected the token (HTTP 401/403).")
            return TestResult(False, f"Travis CI returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Travis CI: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        from urllib.parse import quote

        slug = self._slug(ctx)
        if not ctx.token or "••••" in ctx.token or not slug:
            return []
        try:
            resp = await self._get(f"{self.API}/repo/{quote(slug, safe='')}/builds",
                                   headers=self._headers(ctx), params={"limit": "5"})
            resp.raise_for_status()
            builds = resp.json().get("builds", [])
        except Exception as exc:
            logger.warning("Travis CI fetch failed: %s", exc)
            return []
        state_map = {"passed": "ready", "failed": "failed", "errored": "failed", "canceled": "failed"}
        rows = []
        for b in builds:
            rows.append({
                "kind": "deploy",
                "provider": "travisci",
                "version": f"#{b.get('number', '')}",
                "status": state_map.get(str(b.get("state", "")).lower(), "building"),
                "branch": (b.get("branch") or {}).get("name", ""),
                "commit_hash": str((b.get("commit") or {}).get("sha", "") or "")[:7],
                "commit_message": str((b.get("commit") or {}).get("message", "") or "")[:200],
                "created_at": b.get("started_at"),
            })
        return rows


class TeamCityAdapter(RestAdapter):
    plugin_ids = ("plugin-teamcity",)

    def _base(self, ctx: PluginCtx) -> str:
        return (ctx.base_url or "").rstrip("/")

    async def test(self, ctx: PluginCtx) -> TestResult:
        base = self._base(ctx)
        if not base:
            return TestResult(False, "TeamCity needs its server URL in Base URL.")
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No TeamCity access token provided.")
        try:
            resp = await self._get(f"{base}/app/rest/users/current", headers=_bearer(ctx.token))
            if resp.status_code == 200:
                return TestResult(True, "TeamCity token validated.")
            if resp.status_code in (401, 403):
                return TestResult(False, "TeamCity rejected the token (HTTP 401/403).")
            return TestResult(False, f"TeamCity returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach TeamCity at {base}: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        base = self._base(ctx)
        if not base or not ctx.token or "••••" in ctx.token:
            return []
        try:
            resp = await self._get(f"{base}/app/rest/builds",
                                   headers={**_bearer(ctx.token), "Accept": "application/json"},
                                   params={"locator": "count:5", "fields": "build(id,number,status,state,branchName,finishDate,buildTypeId)"})
            resp.raise_for_status()
            builds = resp.json().get("build", [])
        except Exception as exc:
            logger.warning("TeamCity fetch failed: %s", exc)
            return []
        rows = []
        for b in builds:
            status = str(b.get("status", "")).upper()
            rows.append({
                "kind": "deploy",
                "provider": "teamcity",
                "version": f"#{b.get('number', '')}",
                "status": "ready" if status == "SUCCESS" else "failed" if status in ("FAILURE", "ERROR") else "building",
                "branch": b.get("branchName", ""),
                "commit_message": str(b.get("buildTypeId", ""))[:200],
                "created_at": None,
            })
        return rows


# ── Azure ─────────────────────────────────────────────────────────


class AzureReposAdapter(RestAdapter):
    plugin_ids = ("plugin-azure-repos",)

    def _org(self, ctx: PluginCtx) -> str:
        return str(ctx.config.get("org") or "").strip()

    async def test(self, ctx: PluginCtx) -> TestResult:
        org = self._org(ctx)
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Azure DevOps PAT provided.")
        if not org:
            return TestResult(False, "Azure needs the organization name (DevOps → Organization settings).")
        try:
            resp = await self._get(f"https://dev.azure.com/{org}/_apis/projects",
                                   headers=_basic("", ctx.token), params={"api-version": "7.0"})
            if resp.status_code == 200:
                return TestResult(True, f"Azure DevOps org '{org}' verified.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Azure rejected the PAT (HTTP 401/403). Check scopes (Code: Read).")
            return TestResult(False, f"Azure API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Azure DevOps: {exc}")


class AzurePipelinesAdapter(RestAdapter):
    plugin_ids = ("plugin-azure-devops",)

    def _org_project(self, ctx: PluginCtx) -> tuple[str, str]:
        return (str(ctx.config.get("org") or "").strip(),
                str(ctx.config.get("project") or "").strip())

    async def test(self, ctx: PluginCtx) -> TestResult:
        org, project = self._org_project(ctx)
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Azure DevOps PAT provided.")
        if not org or not project:
            return TestResult(False, "Azure Pipelines needs organization + project names.")
        try:
            resp = await self._get(f"https://dev.azure.com/{org}/{project}/_apis/build/definitions",
                                   headers=_basic("", ctx.token),
                                   params={"api-version": "7.0", "$top": "1"})
            if resp.status_code == 200:
                return TestResult(True, f"Azure Pipelines verified for {org}/{project}.")
            if resp.status_code in (401, 403, 404):
                return TestResult(False, "Azure rejected the PAT or project (HTTP 401/403/404).")
            return TestResult(False, f"Azure API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Azure DevOps: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        org, project = self._org_project(ctx)
        if not ctx.token or "••••" in ctx.token or not org or not project:
            return []
        try:
            resp = await self._get(f"https://dev.azure.com/{org}/{project}/_apis/build/builds",
                                   headers=_basic("", ctx.token),
                                   params={"api-version": "7.0", "$top": "5"})
            resp.raise_for_status()
            builds = resp.json().get("value", [])
        except Exception as exc:
            logger.warning("Azure Pipelines fetch failed: %s", exc)
            return []
        result_map = {"succeeded": "ready", "failed": "failed", "canceled": "failed"}
        rows = []
        for b in builds:
            definition = b.get("definition") or {}
            rows.append({
                "kind": "deploy",
                "provider": "azure-devops",
                "version": f"#{b.get('buildNumber', b.get('id', ''))}",
                "status": result_map.get(str(b.get("result", "")).lower(), "building"),
                "branch": str(b.get("sourceBranch", "")).replace("refs/heads/", ""),
                "commit_hash": str(b.get("sourceVersion", "") or "")[:7],
                "commit_message": str(definition.get("name", ""))[:200],
                "created_at": b.get("queueTime"),
            })
        return rows


# ── PaaS / GitOps / error tracking ────────────────────────────────


class HerokuAdapter(RestAdapter):
    plugin_ids = ("plugin-heroku",)

    def _headers(self, ctx: PluginCtx) -> dict:
        return {**_bearer(ctx.token), "Accept": "application/vnd.heroku+json;version=3"}

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Heroku API key provided.")
        try:
            resp = await self._get("https://api.heroku.com/account", headers=self._headers(ctx))
            if resp.status_code == 200:
                return TestResult(True, f"Heroku connected as {resp.json().get('email', 'account')}.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Heroku rejected the API key (HTTP 401/403).")
            return TestResult(False, f"Heroku API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Heroku API: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        app = str(ctx.config.get("app") or "").strip()
        if not ctx.token or "••••" in ctx.token or not app:
            return []
        try:
            resp = await self._get(f"https://api.heroku.com/apps/{app}/releases",
                                   headers=self._headers(ctx),
                                   params={"Range": "version ..; max=5, order=desc"})
            resp.raise_for_status()
            releases = resp.json()
        except Exception as exc:
            logger.warning("Heroku fetch failed: %s", exc)
            return []
        rows = []
        for rel in releases if isinstance(releases, list) else []:
            status = str(rel.get("status", "")).lower()
            rows.append({
                "kind": "deploy",
                "provider": "heroku",
                "version": f"v{rel.get('version', '')}",
                "status": "ready" if status == "succeeded" else "failed" if status == "failed" else "building",
                "commit_message": str(rel.get("description", ""))[:200],
                "created_at": rel.get("created_at"),
            })
        return rows


class TerraformAdapter(RestAdapter):
    plugin_ids = ("plugin-terraform",)
    API = "https://app.terraform.io/api/v2"

    def _org(self, ctx: PluginCtx) -> str:
        return str(ctx.config.get("org") or "").strip()

    async def test(self, ctx: PluginCtx) -> TestResult:
        org = self._org(ctx)
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Terraform Cloud token provided.")
        if not org:
            return TestResult(False, "Terraform Cloud needs the organization name.")
        try:
            resp = await self._get(f"{self.API}/organizations/{org}/workspaces",
                                   headers=_bearer(ctx.token), params={"page[size]": "1"})
            if resp.status_code == 200:
                return TestResult(True, f"Terraform Cloud org '{org}' verified.")
            if resp.status_code in (401, 403, 404):
                return TestResult(False, "Terraform rejected the token or org (HTTP 401/403/404).")
            return TestResult(False, f"Terraform API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Terraform Cloud: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        org = self._org(ctx)
        if not ctx.token or "••••" in ctx.token or not org:
            return []
        try:
            resp = await self._get(f"{self.API}/organizations/{org}/workspaces",
                                   headers=_bearer(ctx.token), params={"page[size]": "3"})
            resp.raise_for_status()
            workspaces = resp.json().get("data", [])
        except Exception as exc:
            logger.warning("Terraform fetch failed: %s", exc)
            return []
        status_map = {"applied": "ready", "errored": "failed", "canceled": "failed", "discarded": "failed"}
        rows = []
        for ws in workspaces:
            try:
                runs = await self._get(f"{self.API}/workspaces/{ws.get('id')}/runs",
                                       headers=_bearer(ctx.token),
                                       params={"page[size]": "3", "sort": "-created-at"})
                runs.raise_for_status()
                run_list = runs.json().get("data", [])
            except Exception:
                continue
            for run in run_list:
                rows.append({
                    "kind": "deploy",
                    "provider": "terraform",
                    "version": str(run.get("id", ""))[:12],
                    "status": status_map.get(str(run.get("attributes", {}).get("status", "")).lower(), "building"),
                    "commit_message": f"{ws.get('attributes', {}).get('name', '')} run"[:200],
                    "created_at": run.get("attributes", {}).get("created-at"),
                })
        return rows


class ArgoCDAdapter(RestAdapter):
    plugin_ids = ("plugin-argocd",)

    def _base(self, ctx: PluginCtx) -> str:
        return (ctx.base_url or "").rstrip("/")

    async def test(self, ctx: PluginCtx) -> TestResult:
        base = self._base(ctx)
        if not base:
            return TestResult(False, "ArgoCD needs its server URL in Base URL.")
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No ArgoCD API token provided (Settings → Accounts → Generate New).")
        try:
            resp = await self._get(f"{base}/api/v1/applications", headers=_bearer(ctx.token),
                                   params={"limit": "1"})
            if resp.status_code == 200:
                return TestResult(True, "ArgoCD connected.")
            if resp.status_code in (401, 403):
                return TestResult(False, "ArgoCD rejected the token (HTTP 401/403).")
            return TestResult(False, f"ArgoCD returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach ArgoCD at {base}: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        base = self._base(ctx)
        if not base or not ctx.token or "••••" in ctx.token:
            return []
        try:
            resp = await self._get(f"{base}/api/v1/applications", headers=_bearer(ctx.token))
            resp.raise_for_status()
            apps = resp.json().get("items", [])
        except Exception as exc:
            logger.warning("ArgoCD fetch failed: %s", exc)
            return []
        rows = []
        for app in apps:
            health = str((app.get("status") or {}).get("health", {}).get("status", "Unknown"))
            sync = str((app.get("status") or {}).get("sync", {}).get("status", "Unknown"))
            if health in ("Degraded", "Missing", "Unknown", "Error"):
                rows.append({
                    "source": "argocd",
                    "title": f"App unhealthy: {app.get('metadata', {}).get('name', '')}",
                    "description": f"health: {health} · sync: {sync}",
                    "severity": "critical" if health == "Degraded" else "high",
                    "status": "firing",
                    "labels": {"app": str((app.get("metadata") or {}).get("name", ""))},
                })
            elif sync == "OutOfSync":
                rows.append({
                    "source": "argocd",
                    "title": f"App out of sync: {app.get('metadata', {}).get('name', '')}",
                    "description": f"health: {health}",
                    "severity": "medium",
                    "status": "pending",
                    "labels": {"app": str((app.get("metadata") or {}).get("name", ""))},
                })
        return rows


class RaygunAdapter(RestAdapter):
    plugin_ids = ("plugin-raygun",)

    def _app(self, ctx: PluginCtx) -> str:
        return str(ctx.config.get("app_id") or "").strip()

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Raygun access token provided.")
        try:
            resp = await self._get("https://api.raygun.com/v3/applications", params={"accesstoken": ctx.token})
            if resp.status_code == 200:
                return TestResult(True, "Raygun token validated.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Raygun rejected the token (HTTP 401/403).")
            return TestResult(False, f"Raygun API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Raygun API: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        if not ctx.token or "••••" in ctx.token:
            return []
        try:
            apps = await self._get("https://api.raygun.com/v3/applications", params={"accesstoken": ctx.token})
            apps.raise_for_status()
            app_list = apps.json()
            app_id = self._app(ctx) or (app_list[0].get("id") if app_list else "")
            if not app_id:
                return []
            resp = await self._get(f"https://api.raygun.com/v3/applications/{app_id}/errors",
                                   params={"accesstoken": ctx.token, "pagesize": "20"})
            resp.raise_for_status()
            errors = resp.json()
        except Exception as exc:
            logger.warning("Raygun fetch failed: %s", exc)
            return []
        rows = []
        for err in errors if isinstance(errors, list) else []:
            if err.get("isResolved"):
                continue
            rows.append({
                "source": "raygun",
                "title": f"{err.get('exceptionClass', 'Error')}: {err.get('message', '')}"[:200],
                "description": f"users affected: {err.get('usersAffected', '?')}",
                "severity": "high",
                "status": "firing",
                "labels": {"raygun_id": str(err.get("id", ""))},
            })
        return rows


class AirbrakeAdapter(RestAdapter):
    plugin_ids = ("plugin-airbrake",)

    def _project(self, ctx: PluginCtx) -> str:
        return str(ctx.config.get("project_id") or "").strip()

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Airbrake token provided (Project → Settings → API tokens).")
        try:
            resp = await self._get("https://api.airbrake.io/api/v4/projects", headers=_bearer(ctx.token))
            if resp.status_code == 200:
                return TestResult(True, "Airbrake token validated.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Airbrake rejected the token (HTTP 401/403).")
            return TestResult(False, f"Airbrake API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Airbrake API: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        if not ctx.token or "••••" in ctx.token:
            return []
        try:
            projects = await self._get("https://api.airbrake.io/api/v4/projects", headers=_bearer(ctx.token))
            projects.raise_for_status()
            plist = projects.json().get("projects", [])
            project_id = self._project(ctx) or (plist[0].get("id") if plist else "")
            if not project_id:
                return []
            resp = await self._get(f"https://api.airbrake.io/api/v4/projects/{project_id}/notices",
                                   headers=_bearer(ctx.token),
                                   params={"limit": "20", "resolved": "false"})
            resp.raise_for_status()
            notices = resp.json().get("notices", [])
        except Exception as exc:
            logger.warning("Airbrake fetch failed: %s", exc)
            return []
        rows = []
        for note in notices:
            err = (note.get("errors") or [{}])[0]
            rows.append({
                "source": "airbrake",
                "title": f"{err.get('type', 'Error')}: {err.get('message', '')}"[:200],
                "description": f"environment: {note.get('context', {}).get('environment', '')}",
                "severity": "high",
                "status": "firing",
                "labels": {"airbrake_id": str(note.get("id", ""))},
            })
        return rows
