"""Datadog monitor sync service."""

import logging
from typing import List

import httpx

logger = logging.getLogger(__name__)

_STATE_SEV: dict = {
    "Alert": "critical",
    "Warn": "medium",
    "No Data": "low",
    "OK": "low",
}


async def fetch_monitors(api_key: str, app_key: str) -> List[dict]:
    """Fetch monitors from Datadog and map them to the internal monitoring_alerts schema."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            "https://api.datadoghq.com/api/v1/monitor",
            headers={"DD-API-KEY": api_key, "DD-APPLICATION-KEY": app_key},
        )
        resp.raise_for_status()
        data = resp.json()

    results: List[dict] = []
    for m in data:
        state = m.get("overall_state", "OK")
        results.append({
            "source": "datadog",
            "title": m.get("name", "Datadog Monitor"),
            "description": m.get("message"),
            "severity": _STATE_SEV.get(state, "low"),
            "status": "firing" if state in ("Alert", "Warn") else "resolved",
            "labels": {"datadog_id": str(m.get("id", "")), "state": state},
        })
    return results
