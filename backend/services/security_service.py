"""Security incident business logic (Supabase-backed, RBAC at query layer).

This service centralises the security triage operations used by the
``/api/security`` router: GitHub issue body parsing, project-scoped incident
queries, resolve/ignore transitions (with an immutable audit trail) and
aggregated security metrics. Every query is scoped to the project membership
of the acting user — the same RBAC that Supabase RLS enforces at the row level.
"""

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from database import supabase
from dependencies import get_user_project_ids

logger = logging.getLogger(__name__)

_VALID_IGNORE_REASONS = {"false_positive", "acceptable_risk", "wont_fix"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SecurityTriageService:
    """Security incident operations for a single acting user (RBAC scoped)."""

    def __init__(self, user_id: str):
        self.user_id = user_id

    # ── Project access (owner + team membership) ───────────────────────────
    def _user_project_ids(self) -> List[str]:
        return get_user_project_ids(self.user_id)

    def _incident_visible(self, incident: Dict[str, Any]) -> bool:
        return str(incident.get("project_id")) in self._user_project_ids()

    # ── GitHub issue body parsing ──────────────────────────────────────────
    @staticmethod
    def parse_github_issue_body(issue: Dict[str, Any]) -> Dict[str, Any]:
        """Parse the GitHub issue body authored by the AI triage job."""
        body = issue.get("body", "") or ""

        priority_match = re.search(r"Priority:\s*([P0-3])", body)
        priority = priority_match.group(1) if priority_match else "P2"

        team_match = re.search(
            r"Assigned Team[^:]*:\s*(backend|frontend|devops|security)",
            body,
            re.IGNORECASE,
        )
        assigned_team = team_match.group(1) if team_match else "devops"

        sp_match = re.search(r"Estimated Effort[^:]*:\s*(\d+)", body)
        story_points = int(sp_match.group(1)) if sp_match else 5

        conf_match = re.search(r"AI Confidence[^:]*:\s*([\d.]+)", body)
        ai_confidence = float(conf_match.group(1)) if conf_match else 80.0

        title_match = re.search(r"^#{1,2}\s+(.+)$", body, re.MULTILINE)
        title = title_match.group(1).strip() if title_match else None

        cve_match = re.search(r"CVE[^:]*:\s*`([^`]+)`", body)
        cve_id = cve_match.group(1) if cve_match else None

        fixed_match = re.search(r"Fixed Version[^:]*:\s*([^\n]+)", body)
        fixed_version = fixed_match.group(1).strip() if fixed_match else None

        remediation_section = re.search(
            r"### .*Remediation.*?\n(.*?)(?=###|$)",
            body,
            re.DOTALL | re.IGNORECASE,
        )
        remediation_steps: List[str] = []
        if remediation_section:
            steps = re.findall(
                r"^\d+\.\s+(.+?)$", remediation_section.group(1), re.MULTILINE
            )
            remediation_steps = [s.strip() for s in steps]

        testing_section = re.search(
            r"### .*Testing.*?\n(.*?)(?=###|$)",
            body,
            re.DOTALL | re.IGNORECASE,
        )
        testing_steps: List[str] = []
        if testing_section:
            checks = re.findall(
                r"- \[ \]\s*(.+?)$", testing_section.group(1), re.MULTILINE
            )
            testing_steps = [c.strip() for c in checks]

        return {
            "title": title,
            "priority": priority,
            "severity": "MEDIUM",
            "vulnerability_type": None,
            "target": None,
            "assigned_team": assigned_team,
            "story_points": story_points,
            "ai_confidence": ai_confidence,
            "cve_id": cve_id,
            "fixed_version": fixed_version,
            "remediation_steps": remediation_steps,
            "testing_steps": testing_steps,
        }

    # ── Incident queries (project-scoped) ──────────────────────────────────
    def get_incidents_for_user(
        self,
        project_id: Optional[str] = None,
        service_id: Optional[str] = None,
        severity: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Return security incidents visible to the user + total count."""
        project_ids = self._user_project_ids()
        if not project_ids:
            return [], 0
        if project_id and project_id not in project_ids:
            return [], 0

        query = (
            supabase.table("incidents")
            .select("*", count="exact")
            .in_("project_id", project_ids)
            .eq("source", "security_triage")
            .eq("visibility_scope", "project")
        )
        if project_id:
            query = query.eq("project_id", project_id)
        if service_id:
            query = query.eq("service_id", service_id)
        if severity:
            query = query.eq("severity", severity)
        if status:
            query = query.eq("status", status)

        res = (
            query.order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        total = res.count if res.count is not None else (res.data and len(res.data)) or 0
        return list(res.data or []), total

    def get_incident_by_id(self, incident_id: str) -> Optional[Dict[str, Any]]:
        """Return a security incident if the user has access, else None."""
        try:
            res = (
                supabase.table("incidents")
                .select("*")
                .eq("id", incident_id)
                .eq("source", "security_triage")
                .single()
                .execute()
            )
        except Exception:
            return None

        incident = res.data
        if not incident or not self._incident_visible(incident):
            return None
        return incident

    # ── Resolve / ignore lifecycle ─────────────────────────────────────────
    def resolve_incident(
        self, incident_id: str, notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """Resolve a security incident with an immutable audit trail."""
        incident = self.get_incident_by_id(incident_id)
        if not incident:
            raise ValueError(f"Incident {incident_id} not found or not accessible")
        if incident.get("status") == "resolved":
            raise RuntimeError("Incident already resolved")

        now = _now_iso()
        old_state = {"status": incident.get("status")}
        new_state = {"status": "resolved", "resolved_at": now}

        res = (
            supabase.table("incidents")
            .update({"status": "resolved", "resolved_at": now, "updated_at": now})
            .eq("id", incident_id)
            .execute()
        )
        updated = res.data[0] if res.data else {**incident, **new_state}

        self._write_audit(
            incident=updated,
            action="resolved",
            old_state=old_state,
            new_state=new_state,
            notes=notes,
        )
        return updated

    def ignore_incident(
        self, incident_id: str, reason: str
    ) -> Dict[str, Any]:
        """Ignore a security incident with a validated reason."""
        if reason not in _VALID_IGNORE_REASONS:
            raise ValueError(f"Invalid reason: {reason}")

        incident = self.get_incident_by_id(incident_id)
        if not incident:
            raise ValueError(f"Incident {incident_id} not found or not accessible")
        if incident.get("status") == "ignored":
            raise RuntimeError("Incident already ignored")

        now = _now_iso()
        old_state = {"status": incident.get("status")}
        new_state = {"status": "ignored", "ignored_reason": reason}

        res = (
            supabase.table("incidents")
            .update(
                {"status": "ignored", "ignored_reason": reason, "updated_at": now}
            )
            .eq("id", incident_id)
            .execute()
        )
        updated = res.data[0] if res.data else {**incident, **new_state}

        self._write_audit(
            incident=updated,
            action="ignored",
            old_state=old_state,
            new_state=new_state,
            notes=reason,
        )
        return updated

    # ── Metrics ────────────────────────────────────────────────────────────
    def get_metrics(
        self,
        project_id: Optional[str] = None,
        service_id: Optional[str] = None,
        days: int = 30,
    ) -> Dict[str, Any]:
        """Aggregate security metrics across the user's projects."""
        project_ids = self._user_project_ids()
        if not project_ids:
            return {"period": f"last {days} days", "total": 0}

        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        query = (
            supabase.table("incidents")
            .select("*")
            .in_("project_id", project_ids)
            .eq("source", "security_triage")
            .gte("created_at", since)
        )
        if project_id and project_id in project_ids:
            query = query.eq("project_id", project_id)
        if service_id:
            query = query.eq("service_id", service_id)

        res = query.execute()
        incidents = list(res.data or [])

        by_severity: Dict[str, int] = {}
        by_team: Dict[str, int] = {}
        by_service: Dict[str, int] = {}
        by_status: Dict[str, int] = {}
        trend: Dict[str, Dict[str, int]] = {}

        for inc in incidents:
            severity = inc.get("severity") or "unknown"
            by_severity[severity] = by_severity.get(severity, 0) + 1

            status = inc.get("status") or "unknown"
            by_status[status] = by_status.get(status, 0) + 1

            meta = inc.get("security_metadata") or {}
            team = meta.get("assigned_team") or "unknown"
            by_team[team] = by_team.get(team, 0) + 1

            service = inc.get("service_id") or "unknown"
            by_service[service] = by_service.get(service, 0) + 1

            created = inc.get("created_at")
            day = created[:10] if created else _now_iso()[:10]
            bucket = trend.setdefault(day, {"critical": 0, "high": 0, "medium": 0, "low": 0, "total": 0})
            if severity in bucket:
                bucket[severity] += 1
            bucket["total"] += 1

        resolved_times: List[float] = []
        for inc in incidents:
            if inc.get("status") == "resolved" and inc.get("resolved_at") and inc.get("created_at"):
                try:
                    created = datetime.fromisoformat(inc["created_at"].replace("Z", "+00:00"))
                    resolved = datetime.fromisoformat(inc["resolved_at"].replace("Z", "+00:00"))
                    resolved_times.append((resolved - created).total_seconds() / 3600)
                except (TypeError, ValueError):
                    continue

        mttr = round(sum(resolved_times) / len(resolved_times), 1) if resolved_times else 0

        trend_list = [
            {"date": day, **counts}
            for day, counts in sorted(trend.items())
        ]

        return {
            "period": f"last {days} days",
            "total": len(incidents),
            "open": by_status.get("open", 0),
            "resolved": by_status.get("resolved", 0),
            "ignored": by_status.get("ignored", 0),
            "by_severity": by_severity,
            "by_team": by_team,
            "by_service": by_service,
            "mean_time_to_resolution_hours": mttr,
            "trend": trend_list,
        }

    # ── Internal helpers ───────────────────────────────────────────────────
    def _write_audit(
        self,
        incident: Dict[str, Any],
        action: str,
        old_state: Dict[str, Any],
        new_state: Dict[str, Any],
        notes: Optional[str] = None,
    ) -> None:
        """Append a row to security_incident_audit_logs (non-fatal on failure)."""
        try:
            supabase.table("security_incident_audit_logs").insert({
                "incident_id": str(incident.get("id")),
                "service_id": incident.get("service_id"),
                "project_id": str(incident.get("project_id")),
                "actor_id": self.user_id,
                "action": action,
                "old_state": old_state,
                "new_state": new_state,
                "notes": notes,
            }).execute()
        except Exception as exc:
            logger.warning("security audit log insert failed: %s", exc)