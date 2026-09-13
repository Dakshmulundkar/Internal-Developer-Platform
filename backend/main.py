"""FastAPI application entry point.

Development (both servers, one command from project root):
    npm run dev

Production (FastAPI serves the built frontend too):
    npm run build
    uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
"""

import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import settings

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=settings.LOG_LEVEL.upper())
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Start in-process background services on boot."""
    try:
        from services.scheduler_service import start_scheduler

        start_scheduler()
    except Exception as exc:
        logger.warning("Scheduler startup skipped: %s", exc)
    yield


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Internal Developer Platform API",
    version="0.1.0",
    description="Backend for the IDP — real-time deployments, incidents, rollbacks, and AI analysis.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# In development the Vite proxy eliminates CORS entirely (same origin).
# In production FastAPI serves the frontend directly, so CORS is only needed
# for external consumers. We still honour CORS_ORIGINS for flexibility.
_extra_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
_all_origins = list({"http://localhost:5173"} | set(_extra_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_all_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
from routers import ai  # noqa: E402
from routers import audit  # noqa: E402
from routers import auth  # noqa: E402
from routers import comments  # noqa: E402
from routers import deployments  # noqa: E402
from routers import incidents  # noqa: E402
from routers import monitoring  # noqa: E402
from routers import notifications  # noqa: E402
from routers import plugins  # noqa: E402
from routers import projects  # noqa: E402
from routers import rollback  # noqa: E402
from routers import search  # noqa: E402
from routers import security  # noqa: E402
from routers import settings as settings_router  # noqa: E402
from routers import team  # noqa: E402
from routers import upload  # noqa: E402
from routers import activities  # noqa: E402
from routers import automation  # noqa: E402
from routers import scheduled_tasks  # noqa: E402
from routers import sharing  # noqa: E402
from webhooks import github_security_webhook  # noqa: E402
from webhooks import grafana_webhook  # noqa: E402
from webhooks import netlify_webhook  # noqa: E402
from webhooks import vercel_webhook  # noqa: E402

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(deployments.router, prefix="/deployments", tags=["deployments"])
app.include_router(incidents.router, prefix="/incidents", tags=["incidents"])
app.include_router(rollback.router, prefix="/rollback", tags=["rollback"])
app.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
app.include_router(audit.router, prefix="/audit", tags=["audit"])
app.include_router(ai.router, prefix="/ai", tags=["ai"])
app.include_router(monitoring.router, prefix="/monitoring", tags=["monitoring"])
app.include_router(plugins.router, prefix="/plugins", tags=["plugins"])
app.include_router(comments.router, prefix="/comments", tags=["comments"])
app.include_router(team.router, prefix="/team", tags=["team"])
app.include_router(search.router, prefix="/search", tags=["search"])
app.include_router(settings_router.router, prefix="/settings", tags=["settings"])
app.include_router(upload.router, prefix="/upload", tags=["upload"])
app.include_router(activities.router, prefix="/activities", tags=["activities"])
app.include_router(automation.router, prefix="/automation", tags=["automation"])
app.include_router(scheduled_tasks.router, prefix="/scheduled-tasks", tags=["scheduled-tasks"])
app.include_router(sharing.router, prefix="/share", tags=["share"])
app.include_router(vercel_webhook.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(netlify_webhook.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(grafana_webhook.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(github_security_webhook.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(security.router)

# Also accept direct /events intake from telemetry test runners
app.add_api_route("/events", monitoring.ingest_event, methods=["POST"], tags=["monitoring"])
app.add_api_route("/api/events", monitoring.ingest_event, methods=["POST"], tags=["monitoring"])


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
async def health_check() -> dict:
    """Liveness / readiness probe — returns 200 when the process is up."""
    return {"status": "ok"}


# ── WebSocket ─────────────────────────────────────────────────────────────────
# Active connections keyed by user_id — populated at runtime
active_connections: dict[str, WebSocket] = {}


import time as _time

_ws_user_cache: dict[str, tuple[float, str | None]] = {}
_WS_USER_CACHE_TTL = 30.0


async def _resolve_ws_user(token: str | None) -> str | None:
    """Validate the JWT passed as a query param and return the user_id (or None).

    A fresh, session-free Supabase client is used per connection so a leaked
    session from another user can never corrupt the lookup (this was the cause
    of the intermittent ``GET /auth/v1/user -> 403`` / WS 403 rejections). The
    result is cached per token for 30s because the frontend reconnects with the
    same token on retries / tab switches.
    """
    if not token:
        return None
    entry = _ws_user_cache.get(token)
    if entry and (_time.monotonic() - entry[0]) < _WS_USER_CACHE_TTL:
        return entry[1]

    resolved: str | None = None
    try:
        from database import get_auth_client
        response = get_auth_client().auth.get_user(token)
        user = response.user
        resolved = str(user.id) if user else None
    except Exception:
        resolved = None

    if len(_ws_user_cache) > 4096:
        _ws_user_cache.clear()
    _ws_user_cache[token] = (_time.monotonic(), resolved)
    return resolved


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, token: str = "") -> None:
    """Per-user WebSocket for real-time push events. Requires valid JWT."""
    # Authenticate: token comes from the query param (frontend sends ?token=JWT).
    # A valid token is mandatory — without it the user_id path segment is
    # client-controlled, which would let anyone subscribe to any user's pushes.
    resolved = await _resolve_ws_user(token)
    if resolved is None:
        await websocket.close(code=4401)
        return
    # Key the connection by the resolved Supabase UUID so that
    # broadcast_to_user(uuid) finds the right socket.
    user_id = resolved

    await websocket.accept()
    active_connections[user_id] = websocket
    logger.info("WebSocket connected (authenticated): user_id=%s", user_id)
    try:
        while True:
            # Keep the connection alive; events are pushed from server-side helpers
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_connections.pop(user_id, None)
        logger.info("WebSocket disconnected: user_id=%s", user_id)


async def broadcast_to_user(user_id: str, event_type: str, data: dict) -> None:
    """Push a JSON event to a connected user (no-op if user is offline)."""
    ws = active_connections.get(user_id)
    if ws is None:
        return
    payload = json.dumps({"event_type": event_type, "data": data})
    try:
        await ws.send_text(payload)
    except Exception as exc:
        logger.warning("Failed to send WebSocket message to %s: %s", user_id, exc)
        active_connections.pop(user_id, None)


# ── Static frontend (production only) ────────────────────────────────────────
# When ENVIRONMENT=production FastAPI serves the Vite build from ../dist.
# In development, Vite's own dev server handles the frontend (npm run dev).
_dist = Path(__file__).parent.parent / "dist"

if settings.ENVIRONMENT == "production" and _dist.is_dir():
    from fastapi.responses import FileResponse  # noqa: E402

    app.mount("/assets", StaticFiles(directory=str(_dist / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str) -> FileResponse:
        """Catch-all: serve index.html for any path the React router handles."""
        index = _dist / "index.html"
        return FileResponse(str(index))
