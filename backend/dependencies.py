"""FastAPI dependency functions shared across routers."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database import supabase

# Reusable bearer-token extractor
_bearer = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
):
    """Extract and validate the JWT from the Authorization header.

    Raises HTTP 401 if the token is missing, malformed, or rejected by Supabase.

    Returns the Supabase user object on success.
    """
    token = credentials.credentials

    try:
        response = supabase.auth.get_user(token)
        user = response.user
        if user is None:
            raise ValueError("No user returned")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    return user


_optional_bearer = HTTPBearer(auto_error=False)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
):
    """Optionally extract user if Bearer token is provided, otherwise return None."""
    if not credentials or not credentials.credentials:
        return None
    try:
        response = supabase.auth.get_user(credentials.credentials)
        return response.user
    except Exception:
        return None
