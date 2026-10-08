"""Fernet encryption for per-user plugin API keys.

Keys are stored in Supabase `plugin_installations.api_key_encrypted`.
Transparent migration: values that fail Fernet decryption are treated as
legacy plaintext (written before FERNET_KEY existed).
"""

import logging

from cryptography.fernet import Fernet, InvalidToken

from config import settings

logger = logging.getLogger(__name__)

_warned_no_key = False


def _fernet() -> Fernet | None:
    key = (getattr(settings, "FERNET_KEY", "") or "").strip()
    if not key:
        return None
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception as exc:
        logger.error("Invalid FERNET_KEY: %s", exc)
        return None


def encrypt_key(plaintext: str) -> str:
    """Encrypt an API key. Falls back to plaintext (with a loud warning) when no key configured."""
    global _warned_no_key
    f = _fernet()
    if f is None:
        if not _warned_no_key:
            logger.warning("FERNET_KEY not set — storing plugin API keys UNENCRYPTED. Set it in production.")
            _warned_no_key = True
        return plaintext
    return f.encrypt(plaintext.encode()).decode()


def decrypt_key(stored: str | None) -> str:
    """Decrypt a stored key. Legacy plaintext values pass through untouched."""
    if not stored:
        return ""
    f = _fernet()
    if f is None:
        return stored
    try:
        return f.decrypt(stored.encode()).decode()
    except InvalidToken:
        return stored  # legacy plaintext row
    except Exception:
        return ""
