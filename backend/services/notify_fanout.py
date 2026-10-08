"""Outbound fan-out: deliver new incidents to connected collaboration plugins.

An installation receives the incident when it is `connected`, its plugin
supports sending, and it is scoped to the incident's project (an empty
`enabled_for_projects` list means all projects). Every send is best-effort —
one failing destination never blocks the others or incident creation.
"""

import logging

from database import supabase
from services.plugins.base import PluginCtx
from services.plugins.crypto import decrypt_key
from services.plugins.registry import get_adapter, normalize_plugin_id

logger = logging.getLogger(__name__)

SEND_CAPABLE = ("plugin-slack", "plugin-msteams", "plugin-discord", "plugin-jira", "plugin-linear")


def targets_for_project(project_id: str | None, installations: list[dict]) -> list[dict]:
    """Pure project-scoping filter (unit-tested)."""
    targets = []
    for inst in installations:
        if normalize_plugin_id(inst.get("plugin_id")) not in SEND_CAPABLE:
            continue
        if (inst.get("status") or "") != "connected":
            continue
        enabled = inst.get("enabled_for_projects") or []
        if project_id and enabled and project_id not in enabled:
            continue
        targets.append(inst)
    return targets


async def fanout_incident(incident: dict) -> dict[str, bool]:
    """Send an incident to every in-scope collaboration plugin. Returns per-plugin results."""
    project_id = incident.get("project_id")
    title = incident.get("title", "New incident")
    severity = str(incident.get("severity", "") or "").upper()
    body = f"[{severity}] {incident.get('description') or title}\nProject: {incident.get('project_id', '')}"
    results: dict[str, bool] = {}
    try:
        res = supabase.table("plugin_installations").select("*").eq("status", "connected").execute()
        installations = res.data or []
    except Exception as exc:
        logger.warning("Fan-out skipped (installations unreadable): %s", exc)
        return results
    for inst in targets_for_project(project_id, installations):
        pid = normalize_plugin_id(inst.get("plugin_id"))
        try:
            adapter = get_adapter(pid)
            ctx = PluginCtx(
                plugin_id=pid,
                token=decrypt_key(inst.get("api_key_encrypted")),
                base_url=inst.get("base_url") or "",
                project_selector=inst.get("project_selector") or "",
                config=inst.get("config_data") or {},
                installation_id=inst.get("id"),
            )
            outcome = await adapter.send(ctx, title, body)
            results[pid] = outcome.success
            if not outcome.success:
                logger.warning("Fan-out to %s failed: %s", pid, outcome.message)
        except Exception as exc:
            logger.warning("Fan-out to %s crashed: %s", pid, exc)
            results[pid] = False
    return results
