"""WebSocket helpers for broadcasting events to the right audience.

The main WebSocket connection registry lives in ``main.active_connections``;
this module resolves the target audience (project owner + team members) and
pushes a JSON event to every currently-connected user in that audience.
"""

import logging
from datetime import datetime, timezone

from database import supabase

logger = logging.getLogger(__name__)


async def broadcast_to_project(project_id: str, event_type: str, data: dict) -> None:
    """Push ``event_type`` to every connected user of ``project_id``.

    Audience = project owner + accepted team members (RBAC). Disconnected
    users are skipped silently (``broadcast_to_user`` no-ops when offline).
    """
    try:
        from main import broadcast_to_user
    except Exception as exc:  # pragma: no cover - import-time guard
        logger.warning("Could not import broadcast_to_user: %s", exc)
        return

    user_ids: set[str] = set()

    try:
        owner = (
            supabase.table("projects")
            .select("owner_id")
            .eq("id", project_id)
            .single()
            .execute()
        )
        if owner.data and owner.data.get("owner_id"):
            user_ids.add(str(owner.data["owner_id"]))
    except Exception as exc:
        logger.debug("broadcast_to_project: could not resolve owner: %s", exc)

    try:
        members = (
            supabase.table("team_members")
            .select("user_id")
            .eq("project_id", project_id)
            .eq("status", "accepted")
            .execute()
        )
        for member in members.data or []:
            if member.get("user_id"):
                user_ids.add(str(member["user_id"]))
    except Exception as exc:
        logger.debug("broadcast_to_project: could not resolve members: %s", exc)

    for user_id in user_ids:
        try:
            await broadcast_to_user(user_id, event_type, data)
        except Exception as exc:
            logger.debug("broadcast_to_project: failed for %s: %s", user_id, exc)


async def broadcast_incident_changed(incident: dict, actor_name: str = "") -> None:
    """Push an incident state change to every connected member of its project.

    Used by the incident resolve / ignore / update endpoints so a triage action
    (accept, fix, ignore) taken by one teammate is reflected immediately on
    everyone else's screen — no 30s poll required.
    """
    project_id = incident.get("project_id")
    if not project_id:
        return

    payload = {
        "incident": incident,
        "actor_name": actor_name or (incident.get("assigned_to") or ""),
        "changed_at": incident.get("updated_at")
        or datetime.now(timezone.utc).isoformat(),
    }
    try:
        await broadcast_to_project(str(project_id), "incident.changed", payload)
    except Exception as exc:
        logger.debug(
            "broadcast_incident_changed failed for project %s: %s", project_id, exc
        )