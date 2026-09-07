"""Background task that syncs monitoring plugins using per-user credentials stored in Supabase."""

import logging

from database import supabase
from services import grafana_service, sentry_service, newrelic_service
from services.incident_service import create_from_alert

logger = logging.getLogger(__name__)


async def sync_all_plugins() -> None:
    """
    Fetch all connected plugin installations from Supabase.
    Each row stores the user's own API credentials — no server-level env vars needed.
    """
    res = supabase.table("plugin_installations").select("*").eq("status", "connected").execute()
    if not res.data:
        return

    for plugin in res.data:
        pid = plugin.get("plugin_id", "")
        alerts: list = []

        try:
            if "grafana" in pid:
                base_url = plugin.get("base_url") or ""
                api_key = plugin.get("api_key_encrypted") or ""
                if not base_url or not api_key:
                    logger.debug("Grafana plugin %s missing base_url or api_key, skipping", plugin.get("id"))
                    continue
                alerts = await grafana_service.fetch_alerts(base_url, api_key)

            elif "sentry" in pid:
                # User stores org + projects in config_data JSONB when they configure the plugin
                # projects can be a comma-separated string or a list
                config = plugin.get("config_data") or {}
                org = config.get("org") or ""
                token = plugin.get("api_key_encrypted") or ""

                # Support both single project (legacy) and multiple projects
                raw_projects = config.get("projects") or config.get("project") or ""
                if isinstance(raw_projects, list):
                    project_list = [p.strip() for p in raw_projects if p.strip()]
                else:
                    project_list = [p.strip() for p in str(raw_projects).split(",") if p.strip()]

                if not org or not project_list or not token:
                    logger.debug("Sentry plugin %s missing org/projects/token, skipping", plugin.get("id"))
                    continue

                # Fetch from all configured Sentry projects and merge
                alerts = await sentry_service.fetch_issues_multi(org, project_list, token)

            elif "newrelic" in pid:
                # Replaces Datadog — user stores New Relic API key in plugin config
                api_key = plugin.get("api_key_encrypted") or ""
                config = plugin.get("config_data") or {}
                account_id = config.get("account_id") or ""
                if not api_key:
                    logger.debug("New Relic plugin %s missing api_key, skipping", plugin.get("id"))
                    continue
                alerts = await newrelic_service.fetch_violations(api_key, account_id)

            # Legacy fallback: keep datadog key working if someone has old data
            elif "datadog" in pid:
                logger.info("Datadog plugin detected — please migrate to New Relic in the Integrations UI")
                continue

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

        for alert in alerts:
            try:
                alert["project_id"] = alert.get("project_id") or fallback_project_id
                supabase.table("monitoring_alerts").upsert(alert).execute()

                # Auto-create incident for critical firing alerts with no existing open incident
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
                        .execute()
                    )
                    if not existing.data:
                        await create_from_alert(alert)
            except Exception as exc:
                logger.warning("Alert upsert failed: %s", exc)

        # Update last_sync_at
        try:
            from datetime import datetime, timezone
            supabase.table("plugin_installations").update({
                "last_sync_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", plugin["id"]).execute()
        except Exception:
            pass
