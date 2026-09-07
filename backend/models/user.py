"""Pydantic models for authentication and user data."""

from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    """Request body for POST /auth/register."""

    email: EmailStr
    password: str
    name: str


class LoginRequest(BaseModel):
    """Request body for POST /auth/login."""

    email: EmailStr
    password: str


class GithubLoginRequest(BaseModel):
    """Request body for POST /auth/github."""

    token: str  # GitHub Personal Access Token


class UserResponse(BaseModel):
    """Public user representation returned by auth endpoints."""

    id: str
    email: str
    name: str
    role: str = "member"
