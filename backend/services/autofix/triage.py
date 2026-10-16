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
    commit_sha: str = "",
    branch: str = "",
) -> dict:
    """Insert an incident for a large finding. Returns {id, title} (empty on failure).

    ``commit_sha``/``branch`` stamp the scanned version so tickets stay current:
    a re-scan of the same version reuses the open ticket, a new version refreshes
    it in place instead of duplicating. Every create/refresh is broadcast to the
    project team (best-effort) so the Incidents page updates in real time.
    """
    title = f"Auto-Fix: {error_count} {tool} errors in {rel_file} ({repo})"
    version_line = ""
    if commit_sha:
        where = f"{branch}@{(commit_sha or '')[:7]}" if branch else (commit_sha or "")[:7]
        version_line = f"\n\nScanned version: {where}."
    description = (
        f"Repo Auto-Fix scanned {repo} and found {error_count} {tool} error(s) "
        f"in {rel_file} — too large to fix automatically ({reason_large})."
        f"{version_line}\n\n"
        f"Likely cause: {cause}.\n\n"
        "Suggested action: review the file on the flagged lines and fix manually, "
        "then re-run Repo Health scan to confirm."
    )
    metadata = {
        "repo": repo,
        "file": rel_file,
        "tool": tool,
        "error_count": error_count,
        "cause": cause,
        "commit_sha": commit_sha,
        "branch": branch,
    }

    # Deduplicate against the open ticket for the same file+tool: same version
    # → reuse silently; new version → refresh the row in place. A failed lookup
    # fails open (plain insert) so triage never blocks an apply run.
    try:
        existing = (supabase.table("incidents")
                    .select("id,project_id,title,description,status,created_at,security_metadata")
                    .eq("project_id", project_id)
                    .eq("source", "autofix")
                    .eq("status", "open")
                    .execute())
        open_rows = getattr(existing, "data", None) or []
    except Exception as exc:
        logger.warning("triage dedup lookup failed: %s", type(exc).__name__)
        open_rows = []
    for row in open_rows:
        meta = row.get("security_metadata") or {}
        if meta.get("file") == rel_file and meta.get("tool") == tool:
            if commit_sha and (meta.get("commit_sha") or "") == commit_sha:
                return {"id": row.get("id"), "title": row.get("title"), "deduped": True}
            try:
                supabase.table("incidents").update({
                    "title": title,
                    "description": description,
                    "severity": _severity_for(error_count),
                    "security_metadata": metadata,
                }).eq("id", row.get("id")).execute()
            except Exception as exc:
                logger.warning("triage ticket refresh failed: %s", type(exc).__name__)
                return {}
            await _broadcast(project_id, "incident.changed", {**row, **{
                "title": title, "description": description,
                "severity": _severity_for(error_count),
                "security_metadata": metadata}})
            ticket = {"id": row.get("id"), "title": title, "deduped": True}
            try:
                await audit_service.log(
                    user_id, user_name, "autofix.triage",
                    f"{repo}: ticket refreshed for {rel_file} ({error_count} {tool} errors)",
                    project_id=project_id,
                )
            except Exception as exc:
                # Audit must never turn a successful refresh into a 500.
                logger.debug("triage audit log skipped: %s", exc)
            return ticket
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
                    "security_metadata": metadata,
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
    await _broadcast(project_id, "incident.created", {**rows[0], "security_metadata": metadata})
    try:
        await audit_service.log(
            user_id, user_name, "autofix.triage",
            f"{repo}: ticket opened for {rel_file} ({error_count} {tool} errors)",
            project_id=project_id,
        )
    except Exception as exc:
        # Audit must never turn a successful insert into a 500.
        logger.debug("triage audit log skipped: %s", exc)
    return ticket


async def _broadcast(project_id: str, event_type: str, incident: dict) -> None:
    """Push a ticket create/refresh to the project team. Never raises.

    Awaited inline like every other incident broadcast in the codebase;
    delivery failures are logged, never propagated, so triage can't break.
    """
    try:
        from services.websocket_service import broadcast_to_project

        await broadcast_to_project(project_id, event_type, incident)
    except Exception as exc:
        logger.debug("triage broadcast skipped: %s", exc)
