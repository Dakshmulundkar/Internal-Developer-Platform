"""Search router — full-text search across all entities using PostgreSQL FTS."""

import logging

from fastapi import APIRouter, Depends, Query

from database import supabase
from dependencies import get_current_user, get_user_project_ids

logger = logging.getLogger(__name__)
router = APIRouter()


def _user_project_ids(user_id: str) -> list[str]:
    return get_user_project_ids(user_id)


@router.get("")
async def search(
    q: str = Query(..., min_length=1),
    type: str = Query("all", description="Filter: all, incident, deployment, project"),
    project_id: str = Query(None),
    limit: int = Query(20, ge=1, le=100),
    current_user=Depends(get_current_user),
):
    """Full-text search across incidents, deployments, and projects."""
    user_id = str(current_user.id)
    project_ids = _user_project_ids(user_id)
    if not project_ids:
        return {"results": [], "total": 0}

    results = []
    seen_ids: set[str] = set()

    def _ts_query(text: str) -> str:
        """Convert user input to a PostgreSQL tsquery-compatible string."""
        words = text.strip().split()
        return " & ".join(f"{w}:*" for w in words if w)

    tsq = _ts_query(q)
    if not tsq:
        return {"results": [], "total": 0}

    # Search incidents
    if type in ("all", "incident"):
        try:
            inc_res = supabase.table("incidents").select("id,title,description,status,severity,project_id,created_at") \
                .in_("project_id", project_ids) \
                .text_search("search_vector", tsq) \
                .limit(limit).execute()
            for r in (inc_res.data or []):
                if r["id"] not in seen_ids:
                    seen_ids.add(r["id"])
                    results.append({"type": "incident", **r})
        except Exception as exc:
            logger.debug("Incident search failed (fts may not be available): %s", exc)
            # Fallback: LIKE search
            try:
                like_res = supabase.table("incidents").select("id,title,description,status,severity,project_id,created_at") \
                    .in_("project_id", project_ids) \
                    .or_(f"title.ilike.%{q}%,description.ilike.%{q}%") \
                    .limit(limit).execute()
                for r in (like_res.data or []):
                    if r["id"] not in seen_ids:
                        seen_ids.add(r["id"])
                        results.append({"type": "incident", **r})
            except Exception:
                pass

    # Search deployments
    if type in ("all", "deployment"):
        try:
            dep_res = supabase.table("deployments").select("id,version,status,commit_message,project_id,created_at") \
                .in_("project_id", project_ids) \
                .text_search("search_vector", tsq) \
                .limit(limit).execute()
            for r in (dep_res.data or []):
                if r["id"] not in seen_ids:
                    seen_ids.add(r["id"])
                    results.append({"type": "deployment", **r})
        except Exception as exc:
            logger.debug("Deployment search failed (fts may not be available): %s", exc)
            try:
                like_res = supabase.table("deployments").select("id,version,status,commit_message,project_id,created_at") \
                    .in_("project_id", project_ids) \
                    .or_(f"commit_message.ilike.%{q}%,version.ilike.%{q}%") \
                    .limit(limit).execute()
                for r in (like_res.data or []):
                    if r["id"] not in seen_ids:
                        seen_ids.add(r["id"])
                        results.append({"type": "deployment", **r})
            except Exception:
                pass

    # Search projects
    if type in ("all", "project"):
        try:
            proj_res = supabase.table("projects").select("id,name,description,status,created_at") \
                .in_("id", project_ids) \
                .text_search("search_vector", tsq) \
                .limit(limit).execute()
            for r in (proj_res.data or []):
                if r["id"] not in seen_ids:
                    seen_ids.add(r["id"])
                    results.append({"type": "project", **r})
        except Exception as exc:
            logger.debug("Project search failed (fts may not be available): %s", exc)
            try:
                like_res = supabase.table("projects").select("id,name,description,status,created_at") \
                    .in_("id", project_ids) \
                    .or_(f"name.ilike.%{q}%,description.ilike.%{q}%") \
                    .limit(limit).execute()
                for r in (like_res.data or []):
                    if r["id"] not in seen_ids:
                        seen_ids.add(r["id"])
                        results.append({"type": "project", **r})
            except Exception:
                pass

    # Sort by relevance (newest first)
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    return {"results": results[:limit], "total": len(results)}