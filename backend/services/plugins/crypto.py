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


def _fernets() -> list:
    """Active key first, previous key second (rotation support)."""
    from cryptography.fernet import Fernet

    keys = []
    for attr in ("FERNET_KEY", "FERNET_PREVIOUS_KEY"):
        key = (getattr(settings, attr, "") or "").strip()
        if not key:
            continue
        try:
            keys.append(Fernet(key.encode() if isinstance(key, str) else key))
        except Exception as exc:
            logger.error("Invalid %s: %s", attr, exc)
    return keys


def _fernet():
    ferns = _fernets()
    return ferns[0] if ferns else None


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
    """Decrypt a stored key, trying the previous key during rotation.

    Values that fail all keys pass through untouched (legacy plaintext rows).
    Rotation procedure: set FERNET_PREVIOUS_KEY to the old key, deploy a new
    FERNET_KEY, then re-save (or wait for natural rewrites — encrypt always
    uses the current key, so rows migrate on next save).
    """
    if not stored:
        return ""
    for f in _fernets():
        try:
            return f.decrypt(stored.encode()).decode()
        except InvalidToken:
            continue
        except Exception:
            return ""
    return stored  # legacy plaintext row
