"""Grafana alert sync service."""

import logging
from typing import List

import httpx

logger = logging.getLogger(__name__)


async def fetch_alerts(base_url: str, api_key: str) -> List[dict]:
    """Fetch alerts from Grafana and map them to the internal monitoring_alerts schema."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{base_url.rstrip('/')}/api/alerts",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        resp.raise_for_status()
        data = resp.json()

    results: List[dict] = []
    for a in data:
        state = a.get("state", "")
        results.append({
            "source": "grafana",
            "title": a.get("name", "Grafana Alert"),
            "description": a.get("message"),
            "severity": "critical" if state == "alerting" else "low",
            "status": "firing" if state == "alerting" else "resolved",
            "labels": {"grafana_id": str(a.get("id", ""))},
        })
    return results
