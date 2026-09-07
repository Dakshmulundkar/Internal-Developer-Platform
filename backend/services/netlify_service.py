"""Netlify deployment sync service."""

import logging
from typing import List

import httpx

logger = logging.getLogger(__name__)

_STATUS_MAP: dict = {
    "ready": "success",
    "error": "failed",
    "building": "queued",
    "processing": "queued",
    "new": "queued",
}


async def fetch_deployments(site_id: str, api_token: str) -> List[dict]:
    """Fetch recent deploys for a Netlify site and map them to the internal schema."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"https://api.netlify.com/api/v1/sites/{site_id}/deploys",
            headers={"Authorization": f"Bearer {api_token}"},
        )
        resp.raise_for_status()
        data = resp.json()

    results: List[dict] = []
    for d in data:
        results.append({
            "version": d.get("id"),
            "status": _STATUS_MAP.get(d.get("state", ""), "queued"),
            "commit_hash": d.get("commit_ref"),
            "commit_message": d.get("title"),
            "branch": d.get("branch"),
            "author": d.get("committer"),
            "provider": "netlify",
            "url": d.get("deploy_ssl_url") or d.get("url"),
            "error_message": d.get("error_message"),
            "external_event_id": d.get("id"),
        })
    return results
