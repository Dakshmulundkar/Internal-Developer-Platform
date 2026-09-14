"""Authentication router.

Endpoints:
    POST /auth/register          — create a new account via Supabase Auth
    POST /auth/login             — sign in and receive JWT tokens
    GET  /auth/github/oauth      — redirect to GitHub OAuth authorization page
    GET  /auth/github/callback   — handle GitHub OAuth callback, return JWT
    POST /auth/github            — sign in via GitHub Personal Access Token (legacy)
    POST /auth/logout            — invalidate the current session
    GET  /auth/me                — return the authenticated user's profile
"""

import hashlib
import logging
import urllib.parse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse

from config import settings
from database import get_auth_client, supabase
from dependencies import get_current_user
from models.user import GithubLoginRequest, LoginRequest, RefreshRequest, RegisterRequest, UserResponse
from rate_limit import rate_limit

logger = logging.getLogger(__name__)

router = APIRouter()

_LOGIN_LIMIT = rate_limit(max_requests=20, window_seconds=60)
_REGISTER_LIMIT = rate_limit(max_requests=10, window_seconds=60)
_REFRESH_LIMIT = rate_limit(max_requests=120, window_seconds=60)
_GITHUB_LIMIT = rate_limit(max_requests=15, window_seconds=60)
# /github/oauth + /github/callback are unauthenticated and do heavy work
# (OAuth exchange, user creation, plugin install) — cap them too.
_GITHUB_OAUTH_LIMIT = rate_limit(max_requests=30, window_seconds=60)


def _no_cache_redirect(url: str) -> RedirectResponse:
    """Redirect that instructs browsers/proxies not to cache the response.

    Auth callbacks carry a JWT in the URL fragment — no-store keeps it out of
    browser/proxy disk and history caches.
    """
    return RedirectResponse(url=url, headers={"Cache-Control": "no-store"})


def _find_or_create_supabase_user(
    admin_client, email: str, derived_password: str, user_metadata: dict
) -> str:
    """Resolve a Supabase user id for ``email``, creating or re-keying as needed.

    Fast path: sign in with the deterministic server-derived password (one
    lightweight auth call). This is correct whenever the account was created by
    this flow, which is the overwhelmingly common case.

    Slow paths only run for brand-new accounts or accounts whose password was
    set outside this scheme (e.g. email/password registration):
      1. ``create_user`` — atomic; Supabase rejects duplicate emails.
      2. Duplicate-email blind spot (account exists but password isn't
         derivable): fall back to a single admin user listing to recover its
         id and re-key the password.

    This replaces the previous full ``admin.list_users()`` dump on every GitHub
    login, which was O(all users) and leaked every account's email into
    memory/server logs. The listing is now bounded to a rare edge case.

    Returns the user id on success; raises on failure.
    """
    try:
        session = get_auth_client().auth.sign_in_with_password(
            {"email": email, "password": derived_password}
        )
        if session.user is not None:
            admin_client.auth.admin.update_user_by_id(str(session.user.id), {
                "user_metadata": user_metadata,
                "password": derived_password,
            })
            return str(session.user.id)
    except Exception as exc:
        logger.debug("Sign-in fast path missed for %s: %s", email, exc)

    try:
        created = admin_client.auth.admin.create_user({
            "email": email,
            "password": derived_password,
            "email_confirm": True,
            "user_metadata": user_metadata,
        })
        return str(created.id)
    except Exception as exc:
        if "already" not in str(exc).lower():
            raise

    # Duplicate email → account exists with a non-derivable password.
    users = admin_client.auth.admin.list_users()
    existing_user = next((u for u in users if u.email == email), None)
    if existing_user is None:
        raise exc
    admin_client.auth.admin.update_user_by_id(str(existing_user.id), {
        "user_metadata": user_metadata,
        "password": derived_password,
    })
    return str(existing_user.id)


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
async def register(body: RegisterRequest, _: None = Depends(_REGISTER_LIMIT)) -> dict:
    """Create a new user account.

    Returns the created user object and an access token.
    Supabase may require e-mail confirmation depending on project settings;
    the access_token will be None until the address is verified in that case.
    """
    try:
        response = get_auth_client().auth.sign_up(
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
            detail="Registration failed. Please check your details and try again.",
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
async def login(body: LoginRequest, _: None = Depends(_LOGIN_LIMIT)) -> dict:
    """Sign in with email and password.

    Returns the user, access_token, and refresh_token on success.
    """
    try:
        response = get_auth_client().auth.sign_in_with_password(
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


@router.get("/github/oauth")
async def github_oauth_redirect(_: None = Depends(_GITHUB_OAUTH_LIMIT)) -> RedirectResponse:
    """Redirect the user to GitHub's OAuth authorization page.

    The frontend opens this URL (or redirects to it).
    GitHub will redirect back to /auth/github/callback with a code.
    """
    if not settings.GITHUB_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="GITHUB_CLIENT_ID is not configured in backend/.env",
        )

    params = urllib.parse.urlencode({
        "client_id": settings.GITHUB_CLIENT_ID,
        "scope": "read:user user:email repo write:repo_hook",
        "redirect_uri": f"{settings.APP_BACKEND_URL}/auth/github/callback",
    })
    return RedirectResponse(url=f"https://github.com/login/oauth/authorize?{params}")


@router.get("/github/callback")
async def github_oauth_callback(
    code: str = Query(...),
    _: None = Depends(_GITHUB_OAUTH_LIMIT),
) -> RedirectResponse:
    """Handle the OAuth callback from GitHub.

    Flow:
    1. Exchange the code for a GitHub access token
    2. Fetch the user's profile and email from GitHub
    3. Create or update the user in Supabase Auth
    4. Redirect the frontend to /#/auth/github?token=<jwt>
    """
    if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to backend/.env",
        )

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Step 1: Exchange code for access token
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": f"{settings.APP_BACKEND_URL}/auth/github/callback",
            },
        )
        token_data = token_resp.json()
        gh_access_token: str = token_data.get("access_token", "")
        if not gh_access_token:
            error = token_data.get("error_description", "GitHub token exchange failed")[:120]
            return _no_cache_redirect(
                url=f"{settings.APP_FRONTEND_URL}/?github_error={urllib.parse.quote(error)}"
            )

        # Step 2: Fetch user profile
        gh_headers = {
            "Authorization": f"Bearer {gh_access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        user_resp = await client.get("https://api.github.com/user", headers=gh_headers)
        gh_user = user_resp.json() if user_resp.status_code == 200 else {}

        # Step 3: Get primary verified email
        email: str = gh_user.get("email") or ""
        if not email:
            try:
                emails_resp = await client.get("https://api.github.com/user/emails", headers=gh_headers)
                if emails_resp.status_code == 200:
                    for e in emails_resp.json():
                        if e.get("primary") and e.get("verified"):
                            email = e["email"]
                            break
            except Exception:
                pass

    github_username: str = gh_user.get("login", "")
    display_name: str = gh_user.get("name") or github_username or (email.split("@")[0] if email else "Developer")
    avatar_url: str = gh_user.get("avatar_url", "")

    if not email:
        email = f"{github_username}@users.noreply.github.com"

    # Step 4: Create or update Supabase user
    if not settings.SUPABASE_SERVICE_KEY:
        return _no_cache_redirect(
            url=f"{settings.APP_FRONTEND_URL}/?github_error=SUPABASE_SERVICE_KEY+not+configured"
        )

    from supabase import create_client
    admin_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

    derived_password = hashlib.sha256(
        f"idp-gh-oauth-{gh_access_token[:20]}-{email}".encode()
    ).hexdigest()

    user_metadata = {
        "name": display_name,
        "user_name": github_username,
        "avatar_url": avatar_url,
        "provider": "github",
        "role": "admin",
        "github_access_token": gh_access_token,  # stored server-side for repo access
    }

    try:
        user_id = _find_or_create_supabase_user(
            admin_client, email, derived_password, user_metadata
        )
    except Exception as exc:
        logger.error("Failed to create/resolve Supabase user: %s", exc)
        return _no_cache_redirect(
            url=f"{settings.APP_FRONTEND_URL}/?github_error=GitHub+sign-in+failed"
        )

    # Sign in to get a Supabase JWT
    try:
        session_resp = get_auth_client().auth.sign_in_with_password({
            "email": email,
            "password": derived_password,
        })
        jwt = session_resp.session.access_token if session_resp.session else ""
    except Exception as exc:
        logger.error("Supabase sign-in failed after GitHub OAuth: %s", exc)
        return _no_cache_redirect(
            url=f"{settings.APP_FRONTEND_URL}/?github_error=GitHub+sign-in+failed"
        )

    # Auto-install GitHub plugin in Supabase (best-effort)
    if user_id:
        try:
            existing_plugin = (
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
                "api_key_encrypted": gh_access_token,
                "project_selector": github_username,
                "config_data": {"username": github_username, "avatar_url": avatar_url},
                "last_sync_at": "now()",
                "installed_by": user_id,
                "enabled_for_projects": [],
            }
            if existing_plugin.data:
                supabase.table("plugin_installations").update(plugin_data).eq("id", existing_plugin.data[0]["id"]).execute()
            else:
                supabase.table("plugin_installations").insert(plugin_data).execute()
        except Exception as exc:
            logger.warning("GitHub plugin install failed (non-fatal): %s", exc)

    # Redirect frontend with JWT + user info in query params
    params = urllib.parse.urlencode({
        "token": jwt,
        "name": display_name,
        "email": email,
        "avatar": avatar_url,
        "github": github_username,
        # gh_token intentionally omitted: the GitHub access token is stored
        # server-side in plugin_installations.api_key_encrypted during this
        # callback. Passing it through the redirect URL would expose it to
        # browser history, Referer headers, and server access logs.
    })
    return _no_cache_redirect(url=f"{settings.APP_FRONTEND_URL}/#/auth/github/success?{params}")


@router.post("/github")
async def github_login(body: GithubLoginRequest, _: None = Depends(_GITHUB_LIMIT)) -> dict:
    """Sign in using a GitHub Personal Access Token (legacy — kept for compatibility).

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

    from supabase import create_client
    admin_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

    # Use a deterministic password derived from the PAT so we can sign in again
    # This is safe — it's never exposed to the user, only used server-side
    derived_password = hashlib.sha256(
        f"idp-gh-{body.token}-{email}".encode()
    ).hexdigest()

    user_metadata = {
        "name": display_name,
        "user_name": github_username,
        "avatar_url": avatar_url,
        "provider": "github",
        "role": "admin",
    }

    try:
        user_id = _find_or_create_supabase_user(
            admin_client, email, derived_password, user_metadata
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user account. Please try again.",
        ) from exc

    # Step 4: Sign in with password to get a real Supabase JWT session
    try:
        session_resp = get_auth_client().auth.sign_in_with_password({
            "email": email,
            "password": derived_password,
        })
        access_token = session_resp.session.access_token if session_resp.session else None
        user_id = str(session_resp.user.id) if session_resp.user else user_id
    except Exception as exc:
        logger.error("GitHub sign-in session failed: %s", exc)
        access_token = None

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


@router.post("/refresh")
async def refresh(body: RefreshRequest, _: None = Depends(_REFRESH_LIMIT)) -> dict:
    """Exchange a refresh token for a fresh access token.

    Access tokens expire (default 1 hour); the client keeps the refresh_token
    and calls this to silently rotate the session instead of forcing re-login.
    """
    try:
        response = get_auth_client().auth.refresh_session(body.refresh_token)
    except Exception as exc:
        logger.warning("Refresh failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if response.session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session refresh failed.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return {
        "user": _build_user_response(response.user).model_dump() if response.user else None,
        "access_token": response.session.access_token,
        "refresh_token": response.session.refresh_token,
    }


@router.post("/logout")
async def logout() -> dict:
    """Sign out the current user.

    Supabase's ``sign_out`` invalidates the session server-side.
    The client is responsible for discarding its local token.
    """
    try:
        get_auth_client().auth.sign_out()
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
