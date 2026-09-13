"""Aether AI Security Triage Script.

Runs in the GitHub Actions security triage workflow (per service), reads the
Trivy JSON scan output, asks the configured LLM (OpenAI-compatible) to analyse
each finding and emits a machine-readable triage report that is POSTed to the
Aether security webhook. Optionally also creates GitHub issues per vulnerability.

Standalone by design: only stdlib + optional ``requests`` + optional ``openai``.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
import urllib.request
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class AISecurityTriageService:
    """Analyse Trivy findings with an OpenAI-compatible model."""

    MODEL = os.getenv("AI_TRIAGE_MODEL", "gpt-4o-mini")

    def __init__(self) -> None:
        self.api_key = os.getenv("OPENAI_API_KEY", "")
        self.base_url = os.getenv("AI_TRIAGE_BASE_URL", "https://api.openai.com/v1")

    # ── LLM access (lazy — never required for local runs) ─────────────────
    def _llm_client(self) -> Any:
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise RuntimeError(
                "openai package is not installed; set OPENAI_API_KEY and "
                "pip install openai to enable AI analysis"
            ) from exc

        if not self.api_key:
            raise RuntimeError(
                "OPENAI_API_KEY is not set; AI analysis unavailable"
            )

        client_kwargs: Dict[str, Any] = {"api_key": self.api_key}
        if self.base_url:
            client_kwargs["base_url"] = self.base_url
        return OpenAI(**client_kwargs)

    def generate_analysis(
        self,
        vuln: Dict[str, Any],
        service_name: str,
        repository: str,
    ) -> Dict[str, Any]:
        """Analyse a single Trivy vulnerability and return a triage entry."""
        detail = {
            "vulnerability": {
                "title": vuln.get("Title") or vuln.get("ID"),
                "cve_id": vuln.get("VulnerabilityID"),
                "severity": vuln.get("Severity"),
                "package": vuln.get("PkgName"),
                "installed_version": vuln.get("InstalledVersion"),
                "fixed_version": vuln.get("FixedVersion"),
                "target": vuln.get("Target"),
                "type": vuln.get("Class"),
                "description": (vuln.get("Description") or "")[:2000],
                "cvss": (vuln.get("CVSS") or {}).get(
                    "nvd", vuln.get("CVSS") or {}
                ).get("V3Score"),
                "references": (vuln.get("References") or [])[:5],
            },
            "service": service_name,
            "repository": repository,
            "context": (
                "You are a senior security engineer triaging a Trivy SAST "
                "finding for a microservice. Output JSON only, with fields: "
                "title, description, vulnerability_type, target, priority "
                "(P0|P1|P2|P3), assigned_team (backend|frontend|devops|security), "
                "story_points (int), confidence_score (0-100), "
                "remediation_steps (list of strings), testing_steps (list of "
                "strings). Prioritise P0/P1 for critical CVEs with known "
                "exploits or violating OWASP ASVS 1.27.x."
            ),
        }

        payload = {
            "model": self.MODEL,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": "You output strict JSON only."},
                {"role": "user", "content": json.dumps(detail)},
            ],
        }

        client = self._llm_client()
        try:
            response = client.chat.completions.create(**payload)
            content = response.choices[0].message.content
        except Exception as exc:
            raise RuntimeError(f"LLM call failed: {exc}") from exc

        try:
            parsed = json.loads(content) if isinstance(content, str) else {}
        except json.JSONDecodeError as exc:
            raise RuntimeError("LLM returned non-JSON output") from exc

        parsed.setdefault("priority", "P2")
        parsed.setdefault("confidence_score", 80)
        parsed.setdefault("story_points", 5)
        parsed.setdefault("assigned_team", "devops")
        parsed.setdefault("remediation_steps", [])
        parsed.setdefault("testing_steps", [])
        parsed["github_issue_url"] = None

        return parsed

    # ── Run an analysis batch ─────────────────────────────────────────────
    def run(
        self,
        scan_path: str,
        service_name: str,
        repository: str,
        min_severity: str = "HIGH",
        score_threshold: float = 0.0,
    ) -> Dict[str, Any]:
        """Analyse ``scan_path`` Trivy JSON; return the triage report + mined fields."""
        with open(scan_path, "r", encoding="utf-8") as fh:
            scan = json.load(fh)

        results = scan.get("Results", []) if isinstance(scan, dict) else scan
        raw_vulns: List[Dict[str, Any]] = []
        for result in results:
            affected = result.get("Vulnerabilities", []) if isinstance(result, dict) else result
            raw_vulns.extend(affected or [])

        _SEVERITY_ORDER = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
        raw_vulns = [
            v for v in raw_vulns
            if _SEVERITY_ORDER.get(v.get("Severity", "").upper(), 0)
            >= _SEVERITY_ORDER.get(min_severity.upper(), 2)
        ]
        raw_vulns.sort(
            key=lambda v: _SEVERITY_ORDER.get(v.get("Severity", "").upper(), 0),
            reverse=True,
        )
        raw_vulns = raw_vulns[:25]

        analyses: List[Dict[str, Any]] = []
        for vuln in raw_vulns:
            try:
                analysis = self.generate_analysis(vuln, service_name, repository)
                if isinstance(analysis.get("confidence_score"), (int, float)):
                    if analysis["confidence_score"] < score_threshold:
                        logger.info(
                            "Skipping %s below confidence threshold",
                            vuln.get("VulnerabilityID"),
                        )
                        continue
            except RuntimeError as exc:
                logger.warning("Analysis failed for %s: %s", vuln.get("VulnerabilityID"), exc)
                analysis = self._fallback_analysis(vuln)
            analysis["github_issue_url"] = None
            analyses.append({"vulnerability": {
                "type": vuln.get("Class"),
                "target": vuln.get("Target"),
                "severity": vuln.get("Severity"),
                "cve_id": vuln.get("VulnerabilityID"),
                "package": vuln.get("PkgName"),
                "fixed_version": vuln.get("FixedVersion"),
                "installed_version": vuln.get("InstalledVersion"),
            }, "analysis": analysis})

        report: Dict[str, Any] = {
            "service": service_name,
            "repository": repository,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "scan_file": scan_path,
            "total_vulnerabilities": len(raw_vulns),
            "score_threshold": score_threshold,
            "analyses": analyses,
        }
        return report

    @staticmethod
    def _fallback_analysis(vuln: Dict[str, Any]) -> Dict[str, Any]:
        """Deterministic heuristic used when the LLM is unavailable."""
        severity = (vuln.get("Severity") or "LOW").upper()
        priority = {"CRITICAL": "P0", "HIGH": "P1"}.get(severity, "P2")
        return {
            "title": f"{vuln.get('VulnerabilityID', 'UNKNOWN')}: {vuln.get('Title', '')}",
            "description": (vuln.get("Description") or vuln.get("Title"))[:2000],
            "vulnerability_type": vuln.get("Class"),
            "target": vuln.get("Target"),
            "priority": priority,
            "assigned_team": "devops",
            "story_points": 5,
            "confidence_score": 50,
            "remediation_steps": [
                f"Upgrade {vuln.get('PkgName')} to {vuln.get('FixedVersion') or 'a patched version'}"
            ],
            "testing_steps": [
                "Re-run the trivy scan after applying the fix to confirm it no longer appears"
            ],
            "github_issue_url": None,
        }

    # ── Aether notification ───────────────────────────────────────────────
    @staticmethod
    def notify_aether(
        payload: Dict[str, Any],
        webhook_url: str,
        secret: str,
        headers: Optional[Dict[str, str]] = None,
    ) -> None:
        """POST the triage report to the Aether security webhook (HMAC-signed)."""
        if not webhook_url:
            logger.info("No Aether webhook URL configured; skipping notify")
            return

        body = json.dumps(payload).encode("utf-8")
        req_headers = {"Content-Type": "application/json"}
        if secret:
            import hashlib
            import hmac

            sig = "sha256=" + hmac.new(
                secret.encode(), body, hashlib.sha256
            ).hexdigest()
            req_headers["X-Hub-Signature-256"] = sig
        if headers:
            req_headers.update(headers)

        req = urllib.request.Request(
            webhook_url, data=body, headers=req_headers, method="POST"
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            logger.info("Aether webhook responded %s", resp.status)


def _main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Aether AI security triage")
    parser.add_argument("--scan-file", required=True, help="Path to trivy JSON output")
    parser.add_argument("--service-name", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--aether-webhook", default=os.getenv("AETHER_WEBHOOK_URL", ""))
    parser.add_argument("--aether-secret", default=os.getenv("GITHUB_WEBHOOK_SECRET", ""))
    parser.add_argument("--min-severity", default="HIGH")
    parser.add_argument("--score-threshold", type=float, default=0.0)
    parser.add_argument("--report-output", help="Write triage report JSON to this path")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    service = AISecurityTriageService()
    report = service.run(
        scan_path=args.scan_file,
        service_name=args.service_name,
        repository=args.repository,
        min_severity=args.min_severity,
        score_threshold=args.score_threshold,
    )

    if args.report_output:
        with open(args.report_output, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)
        logger.info("Report written to %s", args.report_output)

    service.notify_aether(
        payload=report,
        webhook_url=args.aether_webhook,
        secret=args.aether_secret,
    )
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())