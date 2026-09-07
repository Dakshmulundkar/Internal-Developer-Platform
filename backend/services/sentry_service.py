"""Sentry issue sync service — supports multiple project slugs."""

import logging
from typing import List

import httpx

logger = logging.getLogger(__name__)

_LEVEL_SEV: dict = {
    "fatal": "critical",
    "error": "high",
    "warning": "medium",
    "info": "low",
}


async def fetch_issues(org: str, project: str, token: str) -> List[dict]:
    """Fetch unresolved issues from a single Sentry project."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"https://sentry.io/api/0/projects/{org}/{project}/issues/?query=is:unresolved",
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        data = resp.json()

    results: List[dict] = []
    for i in data:
        results.append({
            "source": "sentry",
            "title": i.get("title", "Sentry Issue"),
            "description": i.get("culprit"),
            "severity": _LEVEL_SEV.get(i.get("level", "error"), "high"),
            "status": "firing",
            "labels": {
                "sentry_id": str(i.get("id", "")),
                "level": i.get("level"),
                "project": project,
            },
        })
    return results


async def fetch_issues_multi(org: str, projects: List[str], token: str) -> List[dict]:
    """Fetch unresolved issues from multiple Sentry projects and merge results."""
    all_results: List[dict] = []
    for project in projects:
        project = project.strip()
        if not project:
            continue
        try:
            issues = await fetch_issues(org, project, token)
            all_results.extend(issues)
        except Exception as exc:
            logger.warning("Sentry fetch failed for project %s: %s", project, exc)
    return all_results
