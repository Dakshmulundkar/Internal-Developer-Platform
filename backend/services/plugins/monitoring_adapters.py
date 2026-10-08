"""Batch 2 adapters — monitoring depth + code-quality/security findings.

All fetch() methods return monitoring_alerts-shaped rows (routed as alerts by
the sync loop). Vendors without a queryable "current state" map to honest
approximations documented per adapter.
"""

import logging

from .rest_adapters import RestAdapter, _bearer
from .base import PluginCtx, TestResult

logger = logging.getLogger(__name__)


class PrometheusAdapter(RestAdapter):
    plugin_ids = ("plugin-prometheus",)

    def _base(self, ctx: PluginCtx) -> str:
        return (ctx.base_url or "").rstrip("/")

    async def test(self, ctx: PluginCtx) -> TestResult:
        base = self._base(ctx)
        if not base:
            return TestResult(False, "Prometheus needs its server URL in Base URL (e.g. http://prometheus:9090).")
        try:
            resp = await self._get(f"{base}/api/v1/alerts", headers=_bearer(ctx.token) if ctx.token and "••••" not in ctx.token else {})
            if resp.status_code == 200:
                return TestResult(True, f"Prometheus reachable at {base}.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Prometheus rejected the credentials (HTTP 401/403).")
            return TestResult(False, f"Prometheus API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Prometheus at {base}: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        base = self._base(ctx)
        if not base:
            return []
        try:
            resp = await self._get(f"{base}/api/v1/alerts", headers=_bearer(ctx.token) if ctx.token and "••••" not in ctx.token else {})
            resp.raise_for_status()
            alerts = resp.json().get("data", {}).get("alerts", [])
        except Exception as exc:
            logger.warning("Prometheus fetch failed: %s", exc)
            return []
        rows = []
        for alert in alerts:
            labels = alert.get("labels", {}) or {}
            annotations = alert.get("annotations", {}) or {}
            summary = annotations.get("summary") or annotations.get("description") or ""
            rows.append({
                "source": "prometheus",
                "title": labels.get("alertname", "Prometheus Alert"),
                "description": str(summary)[:200],
                "severity": "high" if labels.get("severity") in ("critical", "page") else "medium",
                "status": "firing" if alert.get("state") != "pending" else "pending",
                "labels": {"alertname": labels.get("alertname", ""), "instance": labels.get("instance", "")},
            })
        return rows


class ElasticAdapter(RestAdapter):
    plugin_ids = ("plugin-elastic",)

    def _auth(self, ctx: PluginCtx) -> dict:
        token = ctx.token or ""
        if token.startswith("ApiKey ") or token.startswith("Bearer "):
            return {"Authorization": token}
        return {"Authorization": f"Bearer {token}"}

    async def test(self, ctx: PluginCtx) -> TestResult:
        base = (ctx.base_url or "").rstrip("/")
        if not base:
            return TestResult(False, "Elastic needs the Kibana host in Base URL (e.g. https://kibana:5601).")
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Elastic API key provided.")
        try:
            resp = await self._get(f"{base}/api/status", headers=self._auth(ctx))
            if resp.status_code == 200:
                return TestResult(True, f"Elastic/Kibana reachable at {base}.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Elastic rejected the API key (HTTP 401/403).")
            return TestResult(False, f"Elastic returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Elastic at {base}: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        base = (ctx.base_url or "").rstrip("/")
        if not base or not ctx.token or "••••" in ctx.token:
            return []
        try:
            resp = await self._get(f"{base}/api/alerting/rule/_find", headers=self._auth(ctx),
                                   params={"per_page": "50"})
            resp.raise_for_status()
            rules = resp.json().get("data", [])
        except Exception as exc:
            logger.warning("Elastic fetch failed: %s", exc)
            return []
        rows = []
        for rule in rules:
            exec_status = ((rule.get("execution_status") or {}).get("status") or "").lower()
            rows.append({
                "source": "elastic",
                "title": rule.get("name", "Elastic Rule"),
                "description": f"rule type: {rule.get('rule_type_id', '')}",
                "severity": "high" if exec_status == "error" else "low",
                "status": "firing" if exec_status == "error" else "resolved",
                "labels": {"rule_id": str(rule.get("id", ""))},
            })
        return rows


class DynatraceAdapter(RestAdapter):
    plugin_ids = ("plugin-dynatrace",)

    def _base(self, ctx: PluginCtx) -> str:
        return (ctx.base_url or "").rstrip("/")

    async def test(self, ctx: PluginCtx) -> TestResult:
        base = self._base(ctx)
        if not base:
            return TestResult(False, "Dynatrace needs the environment URL in Base URL (e.g. https://abc12345.live.dynatrace.com).")
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Dynatrace API token provided (needs problems:read).")
        try:
            resp = await self._get(f"{base}/api/v2/problems",
                                   headers={"Authorization": f"Api-Token {ctx.token}"},
                                   params={"pageSize": "1"})
            if resp.status_code == 200:
                return TestResult(True, "Dynatrace token validated.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Dynatrace rejected the token (HTTP 401/403). Check problems:read scope.")
            return TestResult(False, f"Dynatrace API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Dynatrace at {base}: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        base = self._base(ctx)
        if not base or not ctx.token or "••••" in ctx.token:
            return []
        try:
            resp = await self._get(f"{base}/api/v2/problems",
                                   headers={"Authorization": f"Api-Token {ctx.token}"},
                                   params={"problemSelector": 'status("OPEN")', "pageSize": "50"})
            resp.raise_for_status()
            problems = resp.json().get("problems", [])
        except Exception as exc:
            logger.warning("Dynatrace fetch failed: %s", exc)
            return []
        sev = {"AVAILABILITY": "critical", "ERROR": "high", "PERFORMANCE": "medium", "RESOURCE": "medium"}
        rows = []
        for prob in problems:
            rows.append({
                "source": "dynatrace",
                "title": prob.get("displayId", "Dynatrace Problem"),
                "description": prob.get("title", ""),
                "severity": sev.get(str(prob.get("severityLevel", "")).upper(), "medium"),
                "status": "firing",
                "labels": {"problem_id": str(prob.get("problemId", ""))},
            })
        return rows


class HoneycombAdapter(RestAdapter):
    plugin_ids = ("plugin-honeycomb",)

    def _auth(self, ctx: PluginCtx) -> dict:
        return {"X-Honeycomb-Team": ctx.token}

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Honeycomb API key provided.")
        try:
            resp = await self._get("https://api.honeycomb.io/1/auth", headers=self._auth(ctx))
            if resp.status_code == 200:
                return TestResult(True, "Honeycomb API key validated.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Honeycomb rejected the API key (HTTP 401/403).")
            return TestResult(False, f"Honeycomb API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Honeycomb API: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        # Honeycomb exposes no "current trigger state" endpoint; armed triggers
        # register as pending rows (never auto-create incidents) and real firings
        # arrive via the trigger.fired webhook.
        dataset = str(ctx.config.get("dataset") or "").strip()
        if not ctx.token or "••••" in ctx.token or not dataset:
            return []
        try:
            resp = await self._get(f"https://api.honeycomb.io/1/triggers/{dataset}", headers=self._auth(ctx))
            resp.raise_for_status()
            triggers = resp.json()
            if isinstance(triggers, dict):
                triggers = triggers.get("triggers", [])
        except Exception as exc:
            logger.warning("Honeycomb fetch failed: %s", exc)
            return []
        rows = []
        for trig in triggers if isinstance(triggers, list) else []:
            if trig.get("disabled"):
                continue
            rows.append({
                "source": "honeycomb",
                "title": f"[armed] {trig.get('name', 'Honeycomb Trigger')}",
                "description": f"dataset: {dataset} · threshold: {trig.get('threshold', '?')}",
                "severity": "medium",
                "status": "pending",
                "labels": {"trigger_id": str(trig.get("id", ""))},
            })
        return rows


class StatuspageAdapter(RestAdapter):
    plugin_ids = ("plugin-statuspage",)

    def _page(self, ctx: PluginCtx) -> str:
        return str(ctx.config.get("page_id") or "").strip()

    async def test(self, ctx: PluginCtx) -> TestResult:
        page_id = self._page(ctx)
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Statuspage API key provided.")
        if not page_id:
            return TestResult(False, "Statuspage needs the Page ID (Statuspage → Manage → Page ID).")
        try:
            resp = await self._get(f"https://api.statuspage.io/v1/pages/{page_id}",
                                   headers={"Authorization": f"OAuth {ctx.token}"})
            if resp.status_code == 200:
                return TestResult(True, f"Statuspage '{resp.json().get('name', page_id)}' verified.")
            if resp.status_code in (401, 403, 404):
                return TestResult(False, "Statuspage rejected the key or page ID (HTTP 401/403/404).")
            return TestResult(False, f"Statuspage API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Statuspage API: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        page_id = self._page(ctx)
        if not ctx.token or "••••" in ctx.token or not page_id:
            return []
        headers = {"Authorization": f"OAuth {ctx.token}"}
        rows = []
        try:
            comp = await self._get(f"https://api.statuspage.io/v1/pages/{page_id}/components", headers=headers)
            comp.raise_for_status()
            for c in comp.json():
                if str(c.get("status", "operational")).lower() != "operational":
                    rows.append({
                        "source": "statuspage",
                        "title": f"Component degraded: {c.get('name', '')}",
                        "description": f"status: {c.get('status', '')}",
                        "severity": "critical" if "major" in str(c.get("status", "")) else "high",
                        "status": "firing",
                        "labels": {"component_id": str(c.get("id", ""))},
                    })
            inc = await self._get(f"https://api.statuspage.io/v1/pages/{page_id}/incidents/unresolved",
                                  headers=headers)
            inc.raise_for_status()
            for i in inc.json():
                rows.append({
                    "source": "statuspage",
                    "title": i.get("name", "Statuspage Incident"),
                    "description": f"status: {i.get('status', '')} · impact: {i.get('impact', '')}",
                    "severity": "critical" if str(i.get("impact", "")) in ("critical", "major") else "high",
                    "status": "firing",
                    "labels": {"incident_id": str(i.get("id", ""))},
                })
        except Exception as exc:
            logger.warning("Statuspage fetch failed: %s", exc)
        return rows


class VictorOpsAdapter(RestAdapter):
    plugin_ids = ("plugin-victorops",)

    def _auth(self, ctx: PluginCtx) -> tuple[dict, str]:
        api_id = str(ctx.config.get("api_id") or "").strip()
        return ({"X-VO-Api-Id": api_id, "X-VO-Api-Key": ctx.token}, api_id)

    async def test(self, ctx: PluginCtx) -> TestResult:
        headers, api_id = self._auth(ctx)
        if not ctx.token or "••••" in ctx.token or not api_id:
            return TestResult(False, "Splunk On-Call needs an API ID plus API key (Integrations → API).")
        try:
            resp = await self._get("https://api.victorops.com/api-public/v1/user", headers=headers)
            if resp.status_code == 200:
                return TestResult(True, "Splunk On-Call credentials validated.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Splunk On-Call rejected the credentials (HTTP 401/403).")
            return TestResult(False, f"Splunk On-Call returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Splunk On-Call: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        headers, api_id = self._auth(ctx)
        if not ctx.token or "••••" in ctx.token or not api_id:
            return []
        try:
            resp = await self._get("https://api.victorops.com/api-public/v1/incidents", headers=headers)
            resp.raise_for_status()
            incidents = resp.json().get("incidents", [])
        except Exception as exc:
            logger.warning("Splunk On-Call fetch failed: %s", exc)
            return []
        rows = []
        for inc in incidents:
            state = str(inc.get("currentPhase", "")).lower()
            if state == "resolved":
                continue
            rows.append({
                "source": "victorops",
                "title": inc.get("entityDisplayName", "On-Call Incident"),
                "description": f"phase: {inc.get('currentPhase', '')} · service: {inc.get('service', '')}",
                "severity": "critical" if state == "triggered" else "high",
                "status": "firing",
                "labels": {"incident_number": str(inc.get("incidentNumber", ""))},
            })
        return rows


class SonarQubeAdapter(RestAdapter):
    plugin_ids = ("plugin-sonarqube",)

    def _base(self, ctx: PluginCtx) -> str:
        return (ctx.base_url or "").rstrip("/")

    def _auth(self, ctx: PluginCtx) -> tuple:
        import base64

        return (base64.b64encode(f"{ctx.token}:".encode()).decode(),)

    async def test(self, ctx: PluginCtx) -> TestResult:
        base = self._base(ctx)
        if not base:
            return TestResult(False, "SonarQube needs its server URL in Base URL.")
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No SonarQube token provided (User → Security → Tokens).")
        (basic,) = self._auth(ctx)
        try:
            resp = await self._get(f"{base}/api/authentication/validate",
                                   headers={"Authorization": f"Basic {basic}"})
            if resp.status_code == 200 and resp.json().get("valid"):
                return TestResult(True, "SonarQube token validated.")
            return TestResult(False, "SonarQube rejected the token.")
        except Exception as exc:
            return TestResult(False, f"Could not reach SonarQube at {base}: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        from urllib.parse import quote

        base = self._base(ctx)
        project_key = str(ctx.config.get("project_key") or "").strip()
        if not base or not ctx.token or "••••" in ctx.token or not project_key:
            return []
        (basic,) = self._auth(ctx)
        headers = {"Authorization": f"Basic {basic}"}
        try:
            resp = await self._get(
                f"{base}/api/qualitygates/project_status?projectKey={quote(project_key)}", headers=headers)
            resp.raise_for_status()
            gate = resp.json().get("projectStatus", {})
            status = str(gate.get("status", "OK")).upper()
            if status == "OK":
                return []
            conditions = [c for c in gate.get("conditions", []) if c.get("status") != "OK"]
            detail = "; ".join(f"{c.get('metricKey')}: {c.get('actualValue')}" for c in conditions[:5])
            return [{
                "source": "sonarqube",
                "title": f"Quality gate {status} — {project_key}",
                "description": detail[:300],
                "severity": "high" if status == "ERROR" else "medium",
                "status": "firing" if status == "ERROR" else "pending",
                "labels": {"project_key": project_key},
            }]
        except Exception as exc:
            logger.warning("SonarQube fetch failed: %s", exc)
            return []


class SnykAdapter(RestAdapter):
    plugin_ids = ("plugin-snyk",)

    def _org(self, ctx: PluginCtx) -> str:
        return str(ctx.config.get("org_id") or "").strip()

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Snyk API token provided (Account → API Token).")
        try:
            resp = await self._get("https://api.snyk.io/rest/orgs?version=2024-10-15",
                                   headers={"Authorization": f"token {ctx.token}"})
            if resp.status_code == 200:
                return TestResult(True, "Snyk token validated.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Snyk rejected the token (HTTP 401/403).")
            return TestResult(False, f"Snyk API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Snyk API: {exc}")

    async def fetch(self, ctx: PluginCtx) -> list[dict]:
        org_id = self._org(ctx)
        if not ctx.token or "••••" in ctx.token or not org_id:
            return []
        try:
            resp = await self._get(
                f"https://api.snyk.io/rest/orgs/{org_id}/issues?version=2024-10-15",
                headers={"Authorization": f"token {ctx.token}"},
                params={"severity": "high,critical", "status": "open", "limit": "50"},
            )
            resp.raise_for_status()
            issues = resp.json().get("data", [])
        except Exception as exc:
            logger.warning("Snyk fetch failed: %s", exc)
            return []
        rows = []
        for issue in issues:
            attrs = issue.get("attributes", {}) or {}
            sev = str(attrs.get("effectiveSeverityLevel", attrs.get("severity", "high"))).lower()
            rows.append({
                "source": "snyk",
                "title": attrs.get("title", "Snyk Issue"),
                "description": f"package: {attrs.get('packageName', '?')} · type: {attrs.get('issueType', '')}",
                "severity": "critical" if sev == "critical" else "high",
                "status": "firing",
                "labels": {"snyk_id": str(issue.get("id", ""))},
            })
        return rows


class NetlifyAdapter(RestAdapter):
    plugin_ids = ("plugin-netlify",)

    async def test(self, ctx: PluginCtx) -> TestResult:
        if not ctx.token or "••••" in ctx.token:
            return TestResult(False, "No Netlify personal access token provided.")
        try:
            resp = await self._get("https://api.netlify.com/api/v1/user", headers=_bearer(ctx.token))
            if resp.status_code == 200:
                login = (resp.json().get("user") or {}).get("login", "Netlify user")
                return TestResult(True, f"Netlify connected as {login}.")
            if resp.status_code in (401, 403):
                return TestResult(False, "Netlify rejected the token (HTTP 401/403).")
            return TestResult(False, f"Netlify API returned HTTP {resp.status_code}.")
        except Exception as exc:
            return TestResult(False, f"Could not reach Netlify API: {exc}")
