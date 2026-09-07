"""New Relic alert sync service.

Uses the New Relic NerdGraph (GraphQL) API to fetch open alert violations
and map them to the internal monitoring_alerts schema.

Docs: https://docs.newrelic.com/docs/apis/nerdgraph/get-started/introduction-new-relic-nerdgraph/
"""

import logging
from typing import List

import httpx

logger = logging.getLogger(__name__)

_PRIORITY_SEV: dict = {
    "CRITICAL": "critical",
    "HIGH": "high",
    "MEDIUM": "medium",
    "LOW": "low",
}

_NERDGRAPH_URL = "https://api.newrelic.com/graphql"

_QUERY = """
{
  actor {
    account(id: %s) {
      alerts {
        nrqlConditionsSearch {
          nrqlConditions {
            id
            name
            enabled
          }
        }
      }
    }
  }
}
"""

# Simpler REST endpoint for alert violations (works without account ID parsing)
_VIOLATIONS_URL = "https://api.newrelic.com/v2/alerts_violations.json"


async def fetch_violations(api_key: str, account_id: str = "") -> List[dict]:
    """Fetch open alert violations from New Relic REST v2 API.

    Args:
        api_key: New Relic User API key (starts with NRAK-)
        account_id: Optional — not required for violations endpoint
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            _VIOLATIONS_URL,
            params={"only_open": "true"},
            headers={
                "X-Api-Key": api_key,
                "Accept": "application/json",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    violations = data.get("violations", [])
    results: List[dict] = []
    for v in violations:
        priority = v.get("priority", "MEDIUM").upper()
        results.append({
            "source": "newrelic",
            "title": v.get("label", "New Relic Alert"),
            "description": v.get("condition_name"),
            "severity": _PRIORITY_SEV.get(priority, "medium"),
            "status": "firing",
            "labels": {
                "newrelic_id": str(v.get("id", "")),
                "policy": v.get("policy_name", ""),
                "entity": v.get("entity", {}).get("name", ""),
                "priority": priority,
            },
        })
    return results
