"""Email notification service using Resend (free tier: 3,000/month).

Falls back to console logging when RESEND_API_KEY is not configured.
"""

import logging

import httpx

from config import settings

logger = logging.getLogger(__name__)

RESEND_API = "https://api.resend.com"


async def send_email(to: str, subject: str, html_body: str, text_body: str = "") -> bool:
    """Send a transactional email via Resend.

    Returns True if sent, False otherwise.
    """
    api_key = getattr(settings, "RESEND_API_KEY", "")
    if not api_key:
        logger.info("[email:dev] No RESEND_API_KEY configured — skipping email to %s: %s", to, subject)
        return False

    payload = {
        "from": f"{settings.FROM_NAME} <{settings.FROM_EMAIL}>",
        "to": [to],
        "subject": subject,
        "html": html_body,
    }
    if text_body:
        payload["text"] = text_body

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{RESEND_API}/emails",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
            if resp.status_code < 300:
                logger.info("Email sent to %s: %s", to, subject)
                return True
            logger.warning("Resend API error %s: %s", resp.status_code, resp.text)
            return False
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to, exc)
        return False


async def send_incident_created(to: str, incident_title: str, severity: str, project_name: str, incident_id: str) -> bool:
    """Send notification email when a new incident is created."""
    color = {"critical": "#dc2626", "high": "#ea580c", "medium": "#ca8a04", "low": "#2563eb"}.get(severity, "#6b7280")
    html = f"""
    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: {color}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">🚨 New Incident: {severity.upper()}</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; color: #1f2937; margin: 0 0 12px;"><strong>{incident_title}</strong></p>
        <p style="color: #6b7280; margin: 0 0 8px;">Project: {project_name}</p>
        <p style="color: #6b7280; margin: 0 0 16px;">A new incident has been created and requires attention.</p>
        <a href="#" style="display: inline-block; background: {color}; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">View Incident</a>
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">Aether IDP — Automated Notification</p>
    </div>
    """
    return await send_email(to, f"[{severity.upper()}] {incident_title}", html)


async def send_team_invite(
    to: str,
    inviter_name: str,
    project_name: str,
    role: str,
    accept_url: str,
    decline_url: str,
) -> bool:
    """Send a team invitation email with accept/decline links."""
    role_color = {"admin": "#7c3aed", "developer": "#2563eb", "viewer": "#6b7280"}.get(role, "#6b7280")
    html = f"""
    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e5e7eb; border-radius: 12px; overflow: hidden; border: 1px solid #27272a;">
      <div style="background: linear-gradient(135deg, #18181b 0%, #09090b 100%); padding: 28px 32px; border-bottom: 1px solid #27272a;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
          <div style="width: 36px; height: 36px; background: #27272a; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px;">⚡</div>
          <span style="font-size: 13px; font-weight: 700; color: #a1a1aa; letter-spacing: 0.1em; font-family: monospace;">AETHER IDP</span>
        </div>
        <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #f4f4f5;">You've been invited</h1>
        <p style="margin: 6px 0 0; color: #a1a1aa; font-size: 14px;">Join <strong style="color: #f4f4f5;">{project_name}</strong> on Aether IDP</p>
      </div>
      <div style="padding: 28px 32px;">
        <p style="color: #d4d4d8; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
          <strong style="color: #f4f4f5;">{inviter_name}</strong> has invited you to collaborate on
          <strong style="color: #f4f4f5;"> {project_name}</strong> as a
          <span style="display: inline-block; background: {role_color}22; color: {role_color}; border: 1px solid {role_color}44; border-radius: 4px; padding: 1px 8px; font-size: 12px; font-weight: 600; font-family: monospace; margin-left: 4px;">{role.upper()}</span>.
        </p>
        <p style="color: #a1a1aa; font-size: 13px; margin: 0 0 28px;">
          If you already have an Aether IDP account, you can accept this invitation directly inside the platform.
          Otherwise, use the button below.
        </p>
        <div style="display: flex; gap: 12px; margin-bottom: 28px;">
          <a href="{accept_url}" style="flex: 1; display: block; text-align: center; background: #f4f4f5; color: #09090b; padding: 11px 20px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 13px;">
            ✓ Accept Invitation
          </a>
          <a href="{decline_url}" style="flex: 1; display: block; text-align: center; background: transparent; color: #a1a1aa; border: 1px solid #3f3f46; padding: 11px 20px; border-radius: 8px; text-decoration: none; font-size: 13px;">
            ✕ Decline
          </a>
        </div>
        <div style="background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 14px 16px;">
          <p style="margin: 0; color: #71717a; font-size: 11px; line-height: 1.6;">
            If you don't recognize this invitation or believe it was sent in error, you can safely ignore this email.
            This link expires in 7 days.
          </p>
        </div>
      </div>
      <div style="padding: 16px 32px; border-top: 1px solid #27272a; text-align: center;">
        <p style="margin: 0; color: #52525b; font-size: 11px;">Aether IDP — Internal Developer Platform</p>
      </div>
    </div>
    """
    text = (
        f"You've been invited to join {project_name} on Aether IDP as {role}.\n\n"
        f"Invited by: {inviter_name}\n"
        f"Accept: {accept_url}\n"
        f"Decline: {decline_url}\n\n"
        f"This link expires in 7 days. Ignore if unexpected."
    )
    return await send_email(to, f"You're invited to {project_name} on Aether IDP", html, text)


async def send_rollback_completed(to: str, project_name: str, version: str) -> bool:
    """Send notification email when a rollback completes."""
    html = f"""
    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #16a34a; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">✅ Rollback Completed</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; color: #1f2937; margin: 0 0 12px;"><strong>{project_name}</strong> rolled back to {version}</p>
        <p style="color: #6b7280; margin: 0 0 16px;">The rollback operation completed successfully. The service is now running the previous stable version.</p>
      </div>
    </div>
    """
    return await send_email(to, f"Rollback Completed: {project_name} → {version}", html)
