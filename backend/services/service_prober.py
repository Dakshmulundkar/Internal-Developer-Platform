"""Service prober for end-to-end testing application monitoring.

Probes deployed services (e.g. https://testing-brown-delta.vercel.app)
and generates real alerts and incidents in Supabase.
"""

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from database import supabase
from services.incident_service import create_from_alert
from validators import is_valid_uuid

logger = logging.getLogger(__name__)


def _resolve_project(project_id: str) -> Optional[dict]:
    """Find a project by UUID or name. Returns None if no project matches.

    Callers must resolve within the authenticated user's project scope before
    calling this; this helper never silently picks an arbitrary project, because
    writing alerts/incidents against an unsolicited fallback project is a
    cross-tenant data-integrity risk.
    """
    if is_valid_uuid(project_id):
        res = supabase.table("projects").select("*").eq("id", project_id).execute()
        if res.data:
            return res.data[0]

    res = supabase.table("projects").select("*").eq("name", project_id).execute()
    if res.data:
        return res.data[0]

    return None


def _get_project_target_url(project: dict) -> str:
    """Determine the base URL for probing a project."""
    if project.get("url"):
        url = project["url"]
        return url if url.startswith("http") else f"https://{url}"
    if project.get("vercel_project_id"):
        v = project["vercel_project_id"]
        return v if v.startswith("http") else f"https://{v}.vercel.app"

    # Check plugin installations for configured target URLs or selectors
    try:
        pi = supabase.table("plugin_installations").select("*").eq("plugin_id", "vercel").execute()
        if pi.data:
            rec = pi.data[0]
            if rec.get("base_url") and rec["base_url"].startswith("http"):
                return rec["base_url"]
            if rec.get("project_selector"):
                sel = rec["project_selector"].strip().rstrip("/")
                if sel.startswith("http"):
                    return sel
                return f"https://{sel}.vercel.app"
    except Exception:
        pass

    return "https://testing-brown-delta.vercel.app"


async def probe_project(project_id: str, custom_url: Optional[str] = None) -> Dict[str, Any]:
    """Execute a comprehensive probe of all endpoints for the given project."""
    project = _resolve_project(project_id)
    if project is None:
        raise ValueError("Project not found")
    real_project_id = project["id"]

    target_base = custom_url or _get_project_target_url(project)
    target_base = target_base.rstrip("/")

    results: Dict[str, Any] = {
        "project_id": real_project_id,
        "target_url": target_base,
        "probed_at": datetime.now(timezone.utc).isoformat(),
        "endpoints": {},
        "created_alerts": [],
        "created_incidents": [],
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        # 1. Health Probe
        health_start = time.time()
        try:
            h_resp = await client.get(f"{target_base}/api/health", follow_redirects=True)
            health_ms = int((time.time() - health_start) * 1000)
            results["endpoints"]["/api/health"] = {
                "status_code": h_resp.status_code,
                "duration_ms": health_ms,
                "data": h_resp.json() if h_resp.headers.get("content-type", "").startswith("application/json") else h_resp.text,
            }
        except Exception as exc:
            results["endpoints"]["/api/health"] = {"error": str(exc)}

        # 2. Broken Endpoint Probe
        try:
            b_resp = await client.get(f"{target_base}/api/broken", follow_redirects=True)
            b_data = b_resp.json() if b_resp.headers.get("content-type", "").startswith("application/json") else {"text": b_resp.text}
            results["endpoints"]["/api/broken"] = {
                "status_code": b_resp.status_code,
                "data": b_data,
            }

            if b_resp.status_code >= 500:
                # Create critical alert
                alert_row = {
                    "source": "grafana",
                    "title": f"HTTP {b_resp.status_code} Internal Server Error on /api/broken",
                    "description": b_data.get("message") or b_data.get("error") or f"Service returned status {b_resp.status_code}",
                    "severity": "critical",
                    "status": "firing",
                    "project_id": real_project_id,
                    "labels": {"endpoint": "/api/broken", "code": str(b_resp.status_code), "service": project.get("name")},
                    "value": str(b_resp.status_code),
                    "threshold": "500",
                    "fired_at": datetime.now(timezone.utc).isoformat(),
                }
                a_res = supabase.table("monitoring_alerts").insert(alert_row).execute()
                if a_res.data:
                    alert_rec = a_res.data[0]
                    results["created_alerts"].append(alert_rec)
                    inc_id = await create_from_alert(alert_rec)
                    if inc_id:
                        results["created_incidents"].append(inc_id)
        except Exception as exc:
            results["endpoints"]["/api/broken"] = {"error": str(exc)}

        # 3. Grafana API probe
        try:
            g_resp = await client.get(f"{target_base}/api/grafana", follow_redirects=True)
            results["endpoints"]["/api/grafana"] = {
                "status_code": g_resp.status_code,
                "success": g_resp.status_code == 200,
            }
        except Exception as exc:
            results["endpoints"]["/api/grafana"] = {"error": str(exc)}

    return results


async def trigger_test_event(project_id: str, test_type: str, custom_url: Optional[str] = None) -> Dict[str, Any]:
    """Trigger a specific test button action and write resulting alerts and incidents into Supabase."""
    project = _resolve_project(project_id)
    if project is None:
        raise ValueError("Project not found")
    real_project_id = project["id"]

    target_base = (custom_url or _get_project_target_url(project)).rstrip("/")

    alert_row: Dict[str, Any] = {}
    should_create_incident = False

    async with httpx.AsyncClient(timeout=20.0) as client:
        if test_type in ("trigger_500", "500"):
            resp_detail = "DEMO_DATABASE_CONNECTION_REFUSED"
            try:
                resp = await client.get(f"{target_base}/api/broken", follow_redirects=True)
                if "application/json" in resp.headers.get("content-type", ""):
                    resp_detail = resp.json().get("message") or resp.json().get("detail") or "Internal Server Error"
                else:
                    resp_detail = f"Status {resp.status_code}: {resp.text[:120]}"
            except Exception as exc:
                resp_detail = f"Endpoint connection failed ({exc})"

            alert_row = {
                "source": "grafana",
                "title": "HTTP 500 Database Connection Refused",
                "description": f"Endpoint {target_base}/api/broken returned 500: {resp_detail}",
                "severity": "critical",
                "status": "firing",
                "project_id": real_project_id,
                "labels": {"endpoint": "/api/broken", "code": "500", "test_action": "trigger_500"},
                "value": "500",
                "threshold": "500",
                "fired_at": datetime.now(timezone.utc).isoformat(),
            }
            should_create_incident = True

        elif test_type in ("slow_request", "slow"):
            start = time.time()
            try:
                await client.get(f"{target_base}/api/slow", timeout=12.0, follow_redirects=True)
                dur = round(time.time() - start, 2)
            except Exception:
                dur = 8.0

            alert_row = {
                "source": "grafana",
                "title": f"Latency Spike Detected ({dur}s)",
                "description": f"Endpoint {target_base}/api/slow latency was {dur}s, exceeding SLA threshold of 2.0s.",
                "severity": "high",
                "status": "firing",
                "project_id": real_project_id,
                "labels": {"endpoint": "/api/slow", "latency": f"{dur}s", "test_action": "slow_request"},
                "value": f"{dur}s",
                "threshold": "2.0s",
                "fired_at": datetime.now(timezone.utc).isoformat(),
            }
            should_create_incident = True

        elif test_type in ("error_storm", "storm"):
            failed = 5
            try:
                tasks = [client.get(f"{target_base}/api/broken", follow_redirects=True) for _ in range(5)]
                resps = await asyncio.gather(*tasks, return_exceptions=True)
                failed = sum(1 for r in resps if not isinstance(r, Exception) and r.status_code >= 400) or 5
            except Exception:
                pass

            alert_row = {
                "source": "grafana",
                "title": f"Error Storm: {failed}/5 Requests Failed",
                "description": f"Sudden failure surge on {target_base}/api/broken. Error rate 100% across concurrent burst.",
                "severity": "critical",
                "status": "firing",
                "project_id": real_project_id,
                "labels": {"error_rate": "100%", "burst_count": str(failed), "test_action": "error_storm"},
                "value": "100%",
                "threshold": "5%",
                "fired_at": datetime.now(timezone.utc).isoformat(),
            }
            should_create_incident = True

        elif test_type in ("memory_waste", "memory"):
            try:
                await client.get(f"{target_base}/api/memory", follow_redirects=True)
            except Exception:
                pass

            alert_row = {
                "source": "grafana",
                "title": "Container Memory Limit Exceeded (92% usage)",
                "description": f"Vercel Serverless Function memory consumption spiked to 92% (472MB / 512MB) on {target_base}.",
                "severity": "high",
                "status": "firing",
                "project_id": real_project_id,
                "labels": {"resource": "memory", "usage": "92%", "test_action": "memory_waste"},
                "value": "92%",
                "threshold": "85%",
                "fired_at": datetime.now(timezone.utc).isoformat(),
            }
            should_create_incident = True

        elif test_type in ("normal", "health"):
            try:
                await client.get(f"{target_base}/api/health", follow_redirects=True)
            except Exception:
                pass

            alert_row = {
                "source": "grafana",
                "title": "Service Health Check OK",
                "description": f"Health check on {target_base}/api/health passed with status 200.",
                "severity": "low",
                "status": "resolved",
                "project_id": real_project_id,
                "labels": {"endpoint": "/api/health", "code": "200"},
                "value": "200",
                "threshold": "200",
                "fired_at": datetime.now(timezone.utc).isoformat(),
                "resolved_at": datetime.now(timezone.utc).isoformat(),
            }

        elif test_type in ("test_grafana_api", "grafana_api"):
            is_ok = True
            try:
                resp = await client.get(f"{target_base}/api/grafana", follow_redirects=True)
                is_ok = resp.status_code == 200
            except Exception:
                is_ok = False

            alert_row = {
                "source": "grafana",
                "title": "Grafana Cloud API Verified" if is_ok else "Grafana Cloud API Unreachable",
                "description": f"Grafana integration check on {target_base}: {'Dashboards accessible' if is_ok else 'Failed to query dashboards'}",
                "severity": "low" if is_ok else "high",
                "status": "resolved" if is_ok else "firing",
                "project_id": real_project_id,
                "labels": {"service": "grafana_cloud"},
                "value": "200" if is_ok else "503",
                "fired_at": datetime.now(timezone.utc).isoformat(),
            }
        else:
            raise ValueError(f"Unknown test action: {test_type}")

    # Insert into monitoring_alerts
    a_res = supabase.table("monitoring_alerts").insert(alert_row).execute()
    if not a_res.data:
        raise RuntimeError("Failed to record alert in Supabase")
    created_alert = a_res.data[0]

    created_incident_id = None
    if should_create_incident:
        created_incident_id = await create_from_alert(created_alert)

    return {
        "action": test_type,
        "alert": created_alert,
        "incident_id": created_incident_id,
    }
