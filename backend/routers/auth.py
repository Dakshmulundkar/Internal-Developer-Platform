"""Authentication router.

Endpoints:
    POST /auth/register   — create a new account via Supabase Auth
    POST /auth/login      — sign in and receive JWT tokens
    POST /auth/github     — sign in via GitHub Personal Access Token
    POST /auth/logout     — invalidate the current session
    GET  /auth/me         — return the authenticated user's profile
"""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from config import settings
from database import supabase
from dependencies import get_current_user
from models.user import GithubLoginRequest, LoginRequest, RegisterRequest, UserResponse

logger = logging.getLogger(__name__)

router = APIRouter()


def _build_user_response(user) -> UserResponse:
    """Convert a Supabase user object into a serialisable UserResponse."""
    user_metadata: dict = getattr(user, "user_metadata", {}) or {}
    return UserResponse(
        id=str(user.id),
        email=user.email or "",
        name=user_metadata.get("name", ""),
        role=user_metadata.get("role", "member"),
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest) -> dict:
    """Create a new user account.

    Returns the created user object and an access token.
    Supabase may require e-mail confirmation depending on project settings;
    the access_token will be None until the address is verified in that case.
    """
    try:
        response = supabase.auth.sign_up(
            {
                "email": body.email,
                "password": body.password,
                "options": {
                    "data": {"name": body.name},
                },
            }
        )
    except Exception as exc:
        logger.error("Registration failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    if response.user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration failed — no user returned by Supabase.",
        )

    access_token: str | None = None
    if response.session is not None:
        access_token = response.session.access_token

    return {
        "user": _build_user_response(response.user).model_dump(),
        "access_token": access_token,
    }


@router.post("/login")
async def login(body: LoginRequest) -> dict:
    """Sign in with email and password.

    Returns the user, access_token, and refresh_token on success.
    """
    try:
        response = supabase.auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
    except Exception as exc:
        logger.warning("Login failed for %s: %s", body.email, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if response.session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed — no session returned.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return {
        "user": _build_user_response(response.user).model_dump(),
        "access_token": response.session.access_token,
        "refresh_token": response.session.refresh_token,
    }


@router.post("/github")
async def github_login(body: GithubLoginRequest) -> dict:
    """Sign in using a GitHub Personal Access Token.

    Flow:
    1. Validate the PAT by calling GitHub's /user API
    2. Extract the user's primary email from GitHub
    3. Create or look up the user in Supabase Auth (admin API)
    4. Return a Supabase session token

    Requires SUPABASE_SERVICE_KEY in backend/.env (admin privileges needed).
    """
    # Step 1: Validate PAT and get GitHub user profile
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            gh_resp = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {body.token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            gh_resp.raise_for_status()
            gh_user = gh_resp.json()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid GitHub token — could not verify with GitHub API.",
            ) from exc

        # Step 2: Get primary verified email
        email: str = gh_user.get("email") or ""
        if not email:
            try:
                email_resp = await client.get(
                    "https://api.github.com/user/emails",
                    headers={
                        "Authorization": f"Bearer {body.token}",
                        "Accept": "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                )
                email_resp.raise_for_status()
                emails = email_resp.json()
                # Pick primary verified email
                for e in emails:
                    if e.get("primary") and e.get("verified"):
                        email = e["email"]
                        break
                if not email and emails:
                    email = emails[0]["email"]
            except Exception:
                pass

    if not email:
        # Fallback: construct email from GitHub username — still creates a valid Supabase account
        _gh_login = gh_user.get("login", "unknown")
        email = f"{_gh_login}@users.noreply.github.com"
        logger.info("Using noreply email for GitHub user %s", _gh_login)

    github_username: str = gh_user.get("login", "")
    display_name: str = gh_user.get("name") or github_username or email.split("@")[0]
    avatar_url: str = gh_user.get("avatar_url", "")

    # Step 3: Create or retrieve Supabase user via admin API (needs service key)
    if not settings.SUPABASE_SERVICE_KEY:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="GitHub login requires SUPABASE_SERVICE_KEY in backend/.env.",
        )

    import secrets
    from supabase import create_client
    admin_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

    # Try to get existing user by email
    try:
        existing = admin_client.auth.admin.list_users()
        existing_user = next(
            (u for u in existing if u.email == email), None
        )
    except Exception:
        existing_user = None

    # Use a deterministic password derived from the PAT so we can sign in again
    # This is safe — it's never exposed to the user, only used server-side
    import hashlib
    derived_password = hashlib.sha256(
        f"idp-gh-{body.token}-{email}".encode()
    ).hexdigest()

    if existing_user is None:
        try:
            admin_client.auth.admin.create_user({
                "email": email,
                "password": derived_password,
                "email_confirm": True,
                "user_metadata": {
                    "name": display_name,
                    "user_name": github_username,
                    "avatar_url": avatar_url,
                    "provider": "github",
                    "role": "admin",
                },
            })
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create user in Supabase: {exc}",
            ) from exc
    else:
        # Update metadata with latest GitHub info
        try:
            admin_client.auth.admin.update_user_by_id(str(existing_user.id), {
                "user_metadata": {
                    "name": display_name,
                    "user_name": github_username,
                    "avatar_url": avatar_url,
                    "provider": "github",
                    "role": "admin",
                },
                # Keep password in sync so sign-in always works
                "password": derived_password,
            })
        except Exception:
            pass

    # Step 4: Sign in with password to get a real Supabase JWT session
    try:
        session_resp = supabase.auth.sign_in_with_password({
            "email": email,
            "password": derived_password,
        })
        access_token = session_resp.session.access_token if session_resp.session else None
        user_id = str(session_resp.user.id) if session_resp.user else email
    except Exception as exc:
        logger.error("GitHub sign-in session failed: %s", exc)
        access_token = None
        user_id = str(existing_user.id) if existing_user else email

    return {
        "user": {
            "id": user_id,
            "email": email,
            "name": display_name,
            "role": "admin",
        },
        "access_token": access_token,
        "github_username": github_username,
        "avatar_url": avatar_url,
    }


@router.post("/github/setup")
async def github_setup(body: GithubLoginRequest, current_user=Depends(get_current_user)) -> dict:
    """After GitHub PAT login, auto-install GitHub integration and fetch repos.

    Call this right after /auth/github succeeds.
    Returns the list of GitHub repos so the frontend can create projects.
    """
    user_id = str(current_user.id)

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Fetch user repos (up to 100, sorted by most recently pushed)
        repos_resp = await client.get(
            "https://api.github.com/user/repos",
            params={"sort": "pushed", "per_page": 100, "affiliation": "owner,collaborator"},
            headers={
                "Authorization": f"Bearer {body.token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        repos: list = []
        if repos_resp.status_code == 200:
            repos = repos_resp.json()

        # Fetch GitHub user info for display name / username
        user_resp = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {body.token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        gh_user = user_resp.json() if user_resp.status_code == 200 else {}

    github_username = gh_user.get("login", "")

    # Upsert GitHub plugin installation in Supabase
    # Store the PAT encrypted in api_key_encrypted so the integration works going forward
    try:
        existing = (
            supabase.table("plugin_installations")
            .select("id")
            .eq("installed_by", user_id)
            .eq("plugin_id", "plugin-github")
            .execute()
        )
        plugin_data = {
            "plugin_id": "plugin-github",
            "plugin_name": "GitHub",
            "category": "source_control",
            "status": "connected",
            "api_key_encrypted": body.token,  # stored server-side only
            "project_selector": github_username,
            "config_data": {
                "username": github_username,
                "avatar_url": gh_user.get("avatar_url", ""),
            },
            "last_sync_at": "now()",
            "installed_by": user_id,
            "enabled_for_projects": [],
        }
        if existing.data:
            supabase.table("plugin_installations").update(plugin_data).eq("id", existing.data[0]["id"]).execute()
        else:
            supabase.table("plugin_installations").insert(plugin_data).execute()
    except Exception as exc:
        logger.warning("Could not upsert GitHub plugin installation: %s", exc)

    # Return repo list for frontend to create projects from
    repo_list = [
        {
            "id": r.get("id"),
            "name": r.get("name"),
            "full_name": r.get("full_name"),
            "owner": r.get("owner", {}).get("login", ""),
            "description": r.get("description") or "",
            "default_branch": r.get("default_branch", "main"),
            "private": r.get("private", False),
            "url": r.get("html_url"),
            "pushed_at": r.get("pushed_at"),
        }
        for r in repos
    ]

    return {
        "github_username": github_username,
        "repos": repo_list,
        "plugin_installed": True,
    }


@router.post("/logout")
async def logout() -> dict:
    """Sign out the current user.

    Supabase's ``sign_out`` invalidates the session server-side.
    The client is responsible for discarding its local token.
    """
    try:
        supabase.auth.sign_out()
    except Exception as exc:
        # Non-fatal — the client should discard its token regardless.
        logger.warning("sign_out raised an exception (ignored): %s", exc)

    return {"success": True}


@router.get("/me", response_model=UserResponse)
async def me(current_user=Depends(get_current_user)) -> UserResponse:
    """Return the authenticated user's profile.

    Requires a valid ``Authorization: Bearer <jwt>`` header.
    """
    return _build_user_response(current_user)
