"""Application configuration using pydantic-settings.

All settings are loaded from environment variables (or a .env file at runtime).

NOTE: User plugin credentials (Sentry, Grafana, New Relic, Datadog, Vercel tokens,
Netlify tokens, etc.) are stored per-user in Supabase via the Integrations UI.
They are NOT stored here — this file only holds server-level secrets.
"""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Always resolve .env relative to this file's directory (backend/)
_ENV_FILE = Path(__file__).parent / ".env"


class Settings(BaseSettings):
    """Central settings object — fields map 1-to-1 with environment variables."""

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── Supabase (REQUIRED) ───────────────────────────────────────────────────
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    # ── Webhook secrets (server-level — used to verify incoming webhooks) ─────
    VERCEL_WEBHOOK_SECRET: str = ""
    NETLIFY_WEBHOOK_SECRET: str = ""
    GRAFANA_WEBHOOK_SECRET: str = ""
    GITHUB_WEBHOOK_SECRET: str = ""
    VERCEL_API_TOKEN: str = ""
    NETLIFY_API_TOKEN: str = ""

    # ── LLM (server-level — Groq is primary, OpenAI is optional fallback) ─────
    GROQ_API_KEY: str = ""
    OPENAI_API_KEY: str = ""

    # ── GitHub OAuth App ─────────────────────────────────────────────────────
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""

    # ── Email (Resend) ─────────────────────────────────────────────────────
    RESEND_API_KEY: str = ""
    FROM_EMAIL: str = "noreply@localhost"
    FROM_NAME: str = "Aether IDP"

    # ── App base URLs (override in production) ────────────────────────────────
    # These default to localhost for development. Set them in backend/.env for
    # staging/production deployments so GitHub OAuth redirects work correctly.
    APP_FRONTEND_URL: str = "http://localhost:5173"
    APP_BACKEND_URL: str = "http://localhost:8000"

    # ── CORS ──────────────────────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:5173"

    # ── Event intake (external test runners / telemetry POST /monitoring/events) ─
    # Set a long random token in .env to allow unauthenticated event ingestion.
    # Without this, anonymous callers are rejected (fail-closed).
    EVENT_INTAKE_TOKEN: str = ""

    # ── Plugin API key encryption (Fernet) ─────────────────────────────
    # REQUIRED in production. Generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Without this, keys are stored as-is (dev convenience only — loud warning).
    FERNET_KEY: str = ""
    # Previous key, kept only during rotation (decrypt-only).
    FERNET_PREVIOUS_KEY: str = ""

    # ── Plugin OAuth (Slack / Microsoft Teams) ─────────────────────────
    # Without these, OAuth connect buttons report "not configured" and the
    # paste-a-token path keeps working.
    SLACK_CLIENT_ID: str = ""
    SLACK_CLIENT_SECRET: str = ""
    MS_CLIENT_ID: str = ""
    MS_CLIENT_SECRET: str = ""
    MS_TENANT_ID: str = "common"

    # ── Logging / runtime ─────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: str = "development"


# Singleton — import this everywhere instead of instantiating Settings() repeatedly
settings = Settings()


def collect_config_warnings(s: Settings | None = None) -> list[str]:
    """Return human-readable warnings for missing REQUIRED / core OPTIONAL config.

    Never raises and never includes secret values — plain strings only.
    Empty list means the backend is fully configured.
    """
    s = s or settings
    warnings: list[str] = []
    if not s.SUPABASE_URL:
        warnings.append(
            "SUPABASE_URL is empty: login and data features will fail "
            "(copy backend/.env.example to backend/.env)"
        )
    if not s.SUPABASE_KEY:
        warnings.append(
            "SUPABASE_KEY is empty: login and data features will fail "
            "(copy backend/.env.example to backend/.env)"
        )
    if not s.FERNET_KEY:
        warnings.append(
            "FERNET_KEY is empty: plugin credential storage and auto-fix tokens will not work"
        )
    if not s.GROQ_API_KEY and not s.OPENAI_API_KEY:
        warnings.append("AI analysis unavailable: set GROQ_API_KEY or OPENAI_API_KEY")
    return warnings
