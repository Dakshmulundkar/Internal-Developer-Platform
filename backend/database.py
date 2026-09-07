"""Supabase client singleton — lazy initialization.

The client is created on first access to avoid blocking the asyncio event loop
during module import (which causes request timeouts on Windows with Python 3.14).
"""

from __future__ import annotations

from typing import Optional

from supabase import Client

from config import settings

_supabase_client: Optional[Client] = None


def get_supabase() -> Client:
    """Return the shared Supabase client, creating it on first call."""
    global _supabase_client
    if _supabase_client is None:
        from supabase import create_client
        _supabase_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_KEY or settings.SUPABASE_KEY,
        )
    return _supabase_client


# Convenience proxy — allows `from database import supabase` to still work
# by accessing the client lazily through __getattr__ on a module-level object.
class _LazyClient:
    """Thin wrapper that forwards all attribute access to the real Supabase client."""

    def __getattr__(self, name: str):
        return getattr(get_supabase(), name)

    def __repr__(self) -> str:
        return repr(get_supabase())


supabase: Client = _LazyClient()  # type: ignore[assignment]
