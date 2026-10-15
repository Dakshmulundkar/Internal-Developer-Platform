"""Triage tickets for problems too large to auto-fix.

A "large" finding (too many errors, too big a file, unparseable code) becomes
a normal incident row — visible on the existing Incidents page, assignable and
resolvable there — instead of an automated fix. Source is always "autofix" so
these are filterable.
"""

import logging

from database import supabase
from services import audit_service

logger = logging.getLogger(__name__)


def _severity_for(error_count: int) -> str:
    if error_count > 20:
        return "critical"
    if error_count > 10:
        return "high"
    return "medium"


async def create_triage_ticket(
    user_id: str,
    user_name: str,
    project_id: str,
    repo: str,
    tool: str,
    rel_file: str,
    error_count: int,
    cause: str,
    reason_large: str,
) -> dict:
    """Insert an incident for a large finding. Returns {id, title} (empty on failure)."""
    title = f"Auto-Fix: {error_count} {tool} errors in {rel_file} ({repo})"
    description = (
        f"Repo Auto-Fix scanned {repo} and found {error_count} {tool} error(s) "
        f"in {rel_file} — too large to fix automatically ({reason_large}).\n\n"
        f"Likely cause: {cause}.\n\n"
        "Suggested action: review the file on the flagged lines and fix manually, "
        "then re-run Repo Health scan to confirm."
    )
    try:
        res = (
            supabase.table("incidents")
            .insert(
                {
                    "project_id": project_id,
                    "severity": _severity_for(error_count),
                    "title": title,
                    "description": description,
                    "source": "autofix",
                    "security_metadata": {
                        "repo": repo,
                        "file": rel_file,
                        "tool": tool,
                        "error_count": error_count,
                        "cause": cause,
                    },
                }
            )
            .execute()
        )
    except Exception as exc:
        logger.warning("triage ticket insert failed: %s", type(exc).__name__)
        return {}
    rows = getattr(res, "data", None) or []
    if not rows:
        return {}
    ticket = {"id": rows[0].get("id"), "title": title}
    await audit_service.log(
        user_id, user_name, "autofix.triage",
        f"{repo}: ticket opened for {rel_file} ({error_count} {tool} errors)",
        project_id=project_id,
    )
    return ticket
