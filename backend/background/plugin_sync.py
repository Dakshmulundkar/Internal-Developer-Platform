"""Background task that syncs monitoring plugins using per-user credentials stored in Supabase."""

import logging

from database import supabase
from services.incident_service import create_from_alert
from services.plugins.base import PluginCtx
from services.plugins.crypto import decrypt_key
from services.plugins.registry import get_adapter, normalize_plugin_id

logger = logging.getLogger(__name__)

# Minimum seconds between syncs per plugin. Quiet sources poll rarely;
# chatty ones (deploy webhooks already stream in) stay fresh. The scheduler
# tick may fire more often — this gate keeps the fan-out bounded.
SYNC_INTERVALS = {
    "plugin-uptimerobot": 60,
    "plugin-circleci": 120,
    "plugin-render": 120,
    "plugin-railway": 120,
    "plugin-jenkins": 300,
    "plugin-travisci": 300,
    "plugin-teamcity": 300,
    "plugin-heroku": 300,
    "plugin-terraform": 300,
}
DEFAULT_SYNC_INTERVAL = 300


def _sync_due(plugin: dict, now: float) -> bool:
    from datetime import datetime

    last = plugin.get("last_sync_at") or ""
    if not last:
        return True
    try:
        ts = datetime.fromisoformat(str(last).replace("Z", "+00:00")).timestamp()
    except Exception:
        return True
    interval = SYNC_INTERVALS.get(str(plugin.get("plugin_id") or ""), DEFAULT_SYNC_INTERVAL)
    return (now - ts) >= interval


async def sync_all_plugins() -> None:
    """
    Fetch all connected plugin installations from Supabase.
    Each row stores the user's own API credentials — no server-level env vars needed.
    Fetching is dispatched through per-plugin adapters; failures are isolated per plugin.
    """
    res = supabase.table("plugin_installations").select("*").eq("status", "connected").execute()
    if not res.data:
        return

    import time as _time

    now = _time.time()
    for plugin in res.data:
        pid = normalize_plugin_id(plugin.get("plugin_id", ""))
        if not _sync_due(plugin, now):
            continue
        alerts: list = []

        try:
            adapter = get_adapter(pid)
            ctx = PluginCtx(
                plugin_id=pid,
                token=decrypt_key(plugin.get("api_key_encrypted")),
                base_url=plugin.get("base_url") or "",
                project_selector=plugin.get("project_selector") or "",
                config=plugin.get("config_data") or {},
                installation_id=plugin.get("id"),
            )
            alerts = await adapter.fetch(ctx)
        except Exception as exc:
            logger.warning("Plugin sync failed for %s: %s", pid, exc)
            continue

        # Resolve fallback project for user if enabled_projects is empty
        fallback_project_id = None
        enabled_projects = plugin.get("enabled_for_projects") or []
        if enabled_projects:
            fallback_project_id = enabled_projects[0]
        elif plugin.get("installed_by"):
            user_projs = supabase.table("projects").select("id").eq("owner_id", plugin["installed_by"]).limit(1).execute()
            if user_projs.data:
                fallback_project_id = user_projs.data[0]["id"]

        alert_rows = [r for r in alerts if r.get("kind", "alert") == "alert"]
        deploy_rows = [r for r in alerts if r.get("kind") == "deploy"]

        for alert in alert_rows:
            try:
                alert["project_id"] = alert.get("project_id") or fallback_project_id
                if not alert.get("project_id"):
                    logger.debug("Plugin alert has no project_id, skipping")
                    continue

                # monitoring_alerts has no natural unique key, so dedupe
                # explicitly by (project_id, source, title) to avoid inserting
                # a fresh row on every sync for the same alert.
                existing_alert = (
                    supabase.table("monitoring_alerts")
                    .select("id")
                    .eq("project_id", alert["project_id"])
                    .eq("source", alert.get("source"))
                    .eq("title", alert.get("title"))
                    .execute()
                )
                if existing_alert.data:
                    supabase.table("monitoring_alerts").update(alert).eq("id", existing_alert.data[0]["id"]).execute()
                else:
                    supabase.table("monitoring_alerts").insert(alert).execute()

                # Auto-create incident for critical firing alerts with no existing
                # open incident matching the same alert (project + provider + title).
                if (
                    alert.get("severity") in ("critical", "high")
                    and alert.get("status") == "firing"
                    and alert.get("project_id")
                ):
                    existing = (
                        supabase.table("incidents")
                        .select("id")
                        .eq("project_id", alert["project_id"])
                        .eq("status", "open")
                        .eq("provider", alert.get("source"))
                        .eq("title", alert.get("title"))
                        .execute()
                    )
                    if not existing.data:
                        await create_from_alert(alert)
            except Exception as exc:
                logger.warning("Alert upsert failed: %s", exc)

        for dep in deploy_rows:
            try:
                dep = dict(dep)
                dep.pop("kind", None)
                dep["project_id"] = dep.get("project_id") or fallback_project_id
                if not dep.get("project_id") or not dep.get("version"):
                    continue
                existing_dep = (
                    supabase.table("deployments")
                    .select("id")
                    .eq("project_id", dep["project_id"])
                    .eq("version", dep["version"])
                    .execute()
                )
                if existing_dep.data:
                    supabase.table("deployments").update(dep).eq("id", existing_dep.data[0]["id"]).execute()
                else:
                    supabase.table("deployments").insert(dep).execute()
            except Exception as exc:
                logger.warning("Deploy upsert failed: %s", exc)

        # Update last_sync_at
        try:
            from datetime import datetime, timezone
            supabase.table("plugin_installations").update({
                "last_sync_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", plugin["id"]).execute()
        except Exception:
            pass
