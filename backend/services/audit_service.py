"""Audit log helper."""

import logging

from database import supabase

logger = logging.getLogger(__name__)


async def log(
    user_id: str,
    user_name: str,
    action: str,
    details: str,
    project_id: str = None,
) -> None:
    """Insert a row into the audit_logs table.  Failures are non-fatal."""
    try:
        row = {
            "user_id": user_id,
            "user_name": user_name,
            "action": action,
            "details": details,
        }
        if project_id:
            row["project_id"] = project_id
        supabase.table("audit_logs").insert(row).execute()
    except Exception as exc:
        logger.warning("audit_service.log failed: %s", exc)
