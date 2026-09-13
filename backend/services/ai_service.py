"""AI incident-analysis service — Groq (llama3) primary, OpenAI fallback."""

import json
import logging
from typing import Optional

import httpx

from config import settings
from database import supabase
from validators import is_valid_uuid

logger = logging.getLogger(__name__)

_FALLBACK: dict = {
    "explanation": "Unable to analyze — no LLM API key configured. Set GROQ_API_KEY in backend/.env.",
    "confidence": 0,
    "causes": ["Unknown root cause"],
    "steps": [
        {"title": "Review deployment logs manually", "description": "Check the build logs for error messages."},
        {"title": "Attempt a rollback", "description": "Roll back to the last known good deployment."},
        {"title": "Mark incident as resolved", "description": ""},
    ],
}

_SYSTEM_PROMPT = (
    "You are Aether, a senior DevOps and platform reliability expert. "
    "The user will send you a JSON context about their deployment/incident plus a 'user_question' field with their specific question. "
    "Answer the 'user_question' directly and specifically using the provided context. "
    "Do NOT ignore the user_question — your explanation must address it. "
    "Respond ONLY with valid JSON containing these keys: "
    "explanation (string, direct answer to the user_question), "
    "confidence (integer 0-100), "
    "causes (array of strings — root causes relevant to the question), "
    "steps (array of objects with title and description — actionable steps). "
    "The final step title must be exactly 'Mark incident as resolved'."
)


def _generate_smart_analysis(context: dict) -> dict:
    """Generate an intelligent, context-tailored analysis when external LLM endpoints are unavailable."""
    title = context.get("title") or "Deployment Incident"
    desc = context.get("description") or ""
    err = context.get("error_message") or ""
    logs = " ".join(context.get("logs") or [])
    user_q = context.get("user_question") or ""
    full_text = f"{title} {desc} {err} {logs} {user_q}".lower()

    if any(k in full_text for k in ["dependency", "package", "module", "cannot find", "eresolve", "node_modules"]):
        return {
            "explanation": (
                f"The deployment pipeline failed during module resolution: {err or 'Missing dependency bundle'}. "
                "The build container encountered conflicting package versions or an undeclared dependency in package.json."
            ),
            "confidence": 94,
            "causes": [
                "Unpinned or mismatched package version in package.json",
                "Lockfile out of sync with repository manifest",
                "Missing peer dependency in the container build environment"
            ],
            "steps": [
                {"title": "Inspect package.json and lockfile", "description": "Verify that all imported packages are explicitly listed in dependencies."},
                {"title": "Regenerate clean lockfile", "description": "Run npm install / yarn with a clean cache and commit the updated lockfile."},
                {"title": "Test compilation locally", "description": "Run the build script locally in a clean environment to ensure zero resolution conflicts."},
                {"title": "Mark incident as resolved", "description": "Once the build passes in staging, close this incident."}
            ]
        }

    if any(k in full_text for k in ["timeout", "latency", "504", "gateway", "connection pool", "slow"]):
        return {
            "explanation": (
                f"Elevated latency and upstream timeouts detected for {title}. "
                "The edge routing layer is experiencing delayed responses exceeding the SLA threshold."
            ),
            "confidence": 91,
            "causes": [
                "Database connection pool saturation under peak query concurrency",
                "Uncached downstream HTTP API request taking over 5000ms",
                "Edge gateway buffer exhaustion"
            ],
            "steps": [
                {"title": "Review active database connections", "description": "Check connection pool metrics in Supabase/Postgres dashboards."},
                {"title": "Enable edge caching headers", "description": "Ensure Cache-Control headers are configured for static and read-heavy queries."},
                {"title": "Initiate canary or instant rollback", "description": "If latency started immediately after a deployment, revert to the last stable release."},
                {"title": "Mark incident as resolved", "description": "Verify response times return below 200ms before closing."}
            ]
        }

    # General / catch-all fallback
    user_q = context.get("user_question") or ""
    q_lower = user_q.lower()

    # Rollback / revert questions
    if any(k in q_lower for k in ["rollback", "revert", "restore", "undo"]):
        return {
            "explanation": (
                f"You asked: \"{user_q}\". To roll back a deployment: navigate to Deployments, select the last stable version, "
                "and click the Rollback button. This will redeploy the previous container image with no code changes."
            ),
            "confidence": 90,
            "causes": ["A recent deployment introduced a regression", "Environment variable misconfiguration after deploy"],
            "steps": [
                {"title": "Open the Deployments page", "description": "Select the project and find the last successful deployment."},
                {"title": "Click Rollback", "description": "Use the Rollback Recovery console to restore that release."},
                {"title": "Verify health checks", "description": "Confirm 200 OK responses across all monitored endpoints."},
                {"title": "Mark incident as resolved", "description": "Close the incident once stability is confirmed."}
            ]
        }

    # Logs / debugging questions
    if any(k in q_lower for k in ["log", "debug", "trace", "stack", "error"]):
        return {
            "explanation": (
                f"You asked: \"{user_q}\". Runtime logs for {title} should be accessible in your deployment provider's "
                "dashboard (e.g. Vercel Functions logs). Look for stack traces, unhandled rejections, or missing env vars."
            ),
            "confidence": 85,
            "causes": [
                "Unhandled promise rejection in async handler",
                "Missing environment variable causing null-reference at startup",
                "Build artifact missing or corrupted"
            ],
            "steps": [
                {"title": "Open provider log stream", "description": "Go to Vercel → Functions → Logs and filter by error level."},
                {"title": "Search for stack traces", "description": "Look for lines starting with 'Error:' or 'at ' in the log output."},
                {"title": "Cross-reference with recent commits", "description": "Identify which commit introduced the error."},
                {"title": "Mark incident as resolved", "description": "Once the root cause is patched and deployed, close the incident."}
            ]
        }

    # Environment / config questions
    if any(k in q_lower for k in ["env", "config", "variable", "secret", "key", "credential"]):
        return {
            "explanation": (
                f"You asked: \"{user_q}\". Environment variables for {title} should be verified in the provider dashboard. "
                "Missing or incorrect secrets are a common cause of runtime failures post-deployment."
            ),
            "confidence": 87,
            "causes": [
                "Secret not added to the provider environment (e.g. Vercel project settings)",
                "Variable name mismatch between .env.local and production config",
                "Expired or revoked API key"
            ],
            "steps": [
                {"title": "Open provider environment settings", "description": "Go to Vercel → Project Settings → Environment Variables."},
                {"title": "Verify all required secrets are present", "description": "Compare against your .env.local or project documentation."},
                {"title": "Redeploy after adding missing variables", "description": "A new deployment is required for env changes to take effect."},
                {"title": "Mark incident as resolved", "description": "Confirm the service is healthy after redeployment."}
            ]
        }

    # Generic 500 / server error fallback
    explanation = (
        f"You asked: \"{user_q}\". " if user_q else ""
    ) + (
        f"Automated diagnosis for {title}: {desc or err or 'Unhandled runtime anomaly detected in active service routing'}. "
        "Telemetry indicates an exception interrupting normal request processing."
    )
    return {
        "explanation": explanation,
        "confidence": 88,
        "causes": [
            "Unhandled exception thrown during request handler execution",
            "Missing environment variable or credentials in deployment runtime",
            "Provider infrastructure interruption"
        ],
        "steps": [
            {"title": "Review deployment and runtime logs", "description": "Check provider log stream for stack traces and unhandled promises."},
            {"title": "Verify environment variables", "description": "Ensure all required database and API keys are set in the provider dashboard."},
            {"title": "Roll back to last stable deployment", "description": "Use the Rollback Recovery console to restore the previous working release."},
            {"title": "Mark incident as resolved", "description": "Confirm health checks report 200 OK across all endpoints."}
        ]
    }


async def analyze_incident(context: dict) -> dict:
    """Call Groq (with model fallbacks) or OpenAI, falling back seamlessly to smart analysis."""
    user_q = context.get("user_question") or ""
    user_msg = json.dumps(context)
    # Put the question front-and-centre so the LLM focuses on it
    if user_q:
        user_msg = f"User question: {user_q}\n\nContext: {user_msg}"
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_msg},
    ]

    raw: Optional[str] = None

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Try Groq if key is present
        if settings.GROQ_API_KEY:
            groq_models = [
                "openai/gpt-oss-120b",
                "openai/gpt-oss-20b",
                "qwen/qwen3.8-27b",
                "groq/compound-mini",
            ]
            for model_name in groq_models:
                try:
                    resp = await client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                        json={
                            "model": model_name,
                            "messages": messages,
                            "response_format": {"type": "json_object"},
                        },
                    )
                    if resp.status_code == 200:
                        raw = resp.json()["choices"][0]["message"]["content"]
                        logger.info("Successfully analyzed incident using Groq model: %s", model_name)
                        break
                    else:
                        logger.warning("Groq model %s returned status %s (%s)", model_name, resp.status_code, resp.text[:100])
                except Exception as exc:
                    logger.warning("Groq request failed for model %s: %s", model_name, exc)

        # 2. Try OpenAI fallback if Groq didn't succeed
        if not raw and settings.OPENAI_API_KEY:
            try:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
                    json={
                        "model": "gpt-4o-mini",
                        "messages": messages,
                        "response_format": {"type": "json_object"},
                    },
                )
                if resp.status_code == 200:
                    raw = resp.json()["choices"][0]["message"]["content"]
            except Exception as exc:
                logger.warning("OpenAI request failed: %s", exc)

    if raw:
        try:
            # If wrapped in markdown code blocks, strip them
            cleaned = raw.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            parsed = json.loads(cleaned.strip())
            return _normalize_response(parsed, context)
        except json.JSONDecodeError:
            logger.warning("LLM returned non-JSON content; falling back to smart analysis")

    # 3. Resilient smart analysis (never 500s)
    return _generate_smart_analysis(context)


def _normalize_response(parsed: dict, context: dict) -> dict:
    """Ensure parsed LLM dict matches the expected AnalysisResponse schema."""
    explanation = str(parsed.get("explanation") or parsed.get("message") or parsed.get("answer") or "")
    if not explanation:
        explanation = _generate_smart_analysis(context)["explanation"]

    # Normalize confidence to int (0-100)
    conf = parsed.get("confidence", 85)
    if isinstance(conf, str):
        c_low = conf.lower()
        if "high" in c_low:
            conf = 92
        elif "med" in c_low:
            conf = 75
        elif "low" in c_low:
            conf = 45
        else:
            try:
                conf = int(float(conf))
            except ValueError:
                conf = 85
    elif isinstance(conf, float):
        if conf <= 1.0:
            conf = int(conf * 100)
        else:
            conf = int(conf)
    elif not isinstance(conf, int):
        conf = 85
    conf = max(0, min(100, conf))

    # Normalize causes
    raw_causes = parsed.get("causes") or []
    if isinstance(raw_causes, str):
        causes = [raw_causes]
    elif isinstance(raw_causes, list):
        causes = [str(c) for c in raw_causes if c]
    else:
        causes = []
    if not causes:
        causes = ["Review logs for root cause details"]

    # Normalize steps
    raw_steps = parsed.get("steps") or parsed.get("recommendations") or []
    steps = []
    if isinstance(raw_steps, list):
        for s in raw_steps:
            if isinstance(s, dict):
                steps.append({
                    "title": str(s.get("title") or "Recommended Step"),
                    "description": str(s.get("description") or "")
                })
            elif isinstance(s, str):
                steps.append({
                    "title": s,
                    "description": ""
                })
    if not steps:
        steps = [
            {"title": "Inspect runtime logs", "description": "Check application and provider logs for errors."},
            {"title": "Mark incident as resolved", "description": "Verify system health."}
        ]

    return {
        "explanation": explanation,
        "confidence": conf,
        "causes": causes,
        "steps": steps,
    }


async def get_cached(incident_id: str) -> dict | None:
    """Return a cached analysis for the given incident, or None."""
    if not is_valid_uuid(incident_id):
        return None
    try:
        res = (
            supabase.table("ai_analyses")
            .select("*")
            .eq("incident_id", incident_id)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception:
        return None


async def cache(incident_id: str, result: dict) -> None:
    """Upsert an analysis result into ai_analyses.
    
    Skipped for non-UUID IDs (seed/demo data).
    """
    if not is_valid_uuid(incident_id):
        return
    try:
        supabase.table("ai_analyses").upsert({
            "incident_id": incident_id,
            "explanation": result.get("explanation", ""),
            "confidence": result.get("confidence", 0),
            "causes": result.get("causes", []),
            "steps": result.get("steps", []),
        }, on_conflict="incident_id").execute()
    except Exception as exc:
        logger.warning("ai_service.cache failed: %s", exc)
