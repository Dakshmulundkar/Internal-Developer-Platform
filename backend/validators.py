"""Shared validation helpers used across routers and services."""

import uuid


def is_valid_uuid(val: str) -> bool:
    """Check if a string is a valid UUID."""
    if not val:
        return False
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, TypeError, AttributeError):
        return False