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
    VERCEL_API_TOKEN: str = ""
    NETLIFY_API_TOKEN: str = ""
    PUBLIC_WEBHOOK_URL: str = ""

    # ── LLM (server-level — Groq is primary, OpenAI is optional fallback) ─────
    GROQ_API_KEY: str = ""
    OPENAI_API_KEY: str = ""

    # ── CORS ──────────────────────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:5173"

    # ── Logging / runtime ─────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: str = "development"


# Singleton — import this everywhere instead of instantiating Settings() repeatedly
settings = Settings()
