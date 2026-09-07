"""Vercel deployment sync service."""

import logging
from typing import List

import httpx

logger = logging.getLogger(__name__)

_STATUS_MAP: dict = {
    "READY": "success",
    "ERROR": "failed",
    "CANCELED": "failed",
    "BUILDING": "queued",
    "QUEUED": "queued",
}


async def fetch_deployments(vercel_project_id: str, api_token: str) -> List[dict]:
    """Fetch recent deployments for a Vercel project and map them to the internal schema."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"https://api.vercel.com/v6/deployments?projectId={vercel_project_id}",
            headers={"Authorization": f"Bearer {api_token}"},
        )
        resp.raise_for_status()
        data = resp.json()

    results: List[dict] = []
    for d in data.get("deployments", []):
        meta = d.get("meta", {})
        results.append({
            "version": d.get("url"),
            "status": _STATUS_MAP.get(d.get("state", ""), "queued"),
            "commit_hash": meta.get("githubCommitSha"),
            "commit_message": meta.get("githubCommitMessage"),
            "branch": meta.get("githubCommitRef"),
            "author": meta.get("githubCommitAuthorName"),
            "provider": "vercel",
            "url": d.get("url"),
            "external_event_id": d.get("uid"),
        })
    return results
