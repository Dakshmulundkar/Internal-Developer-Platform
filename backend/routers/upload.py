"""Upload router — file attachments using Supabase Storage.

Stores files in the 'attachments' bucket and records metadata in the
`attachments` table.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status

from config import settings
from database import supabase
from dependencies import get_current_user, get_user_project_ids

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

_ALLOWED = {
    "image/png", "image/jpeg", "image/gif", "image/webp",
    "text/plain", "text/markdown", "text/x-log",
    "application/json", "application/x-json",
    "application/pdf",
}

# Magic-byte signatures used to verify the declared content type instead of
# trusting the client-supplied MIME header (which is trivially spoofable).
_SIGNATURES = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"RIFF", "image/webp"),
    (b"%PDF-", "application/pdf"),
)


def _looks_text(data: bytes) -> bool:
    """Reject binary blobs for text-ish MIME types (NUL bytes or >30% non-printable)."""
    sample = data[:4096]
    if not sample:
        return True
    nul = sample.count(b"\x00")
    if nul > 0:
        return False
    non_printable = sum(1 for b in sample if b < 9 or (13 < b < 32) or b == 127)
    return non_printable / len(sample) < 0.30


def _sniff_mime(data: bytes) -> str | None:
    """Return the detected MIME type from magic bytes, or None if unrecognized."""
    for sig, mime in _SIGNATURES:
        if data.startswith(sig):
            if mime == "image/webp" and data[8:12] != b"WEBP":
                continue
            return mime
    if _looks_text(data):
        return "text/plain"
    return None


_TEXTISH = {
    "text/plain", "text/markdown", "text/x-log",
    "application/json", "application/x-json",
}


def _validate_upload(content_type: str, data: bytes) -> str:
    """Validate declared content type against magic bytes; return effective type."""
    if not content_type or content_type not in _ALLOWED:
        if content_type != "application/octet-stream":
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                                detail=f"File type not allowed: {content_type}")

    detected = _sniff_mime(data)
    if content_type in ("application/octet-stream", "text/x-log") and detected:
        return detected
    if detected and detected != content_type:
        # Generic text detection is compatible with any declared text-ish type
        if not (detected == "text/plain" and content_type in _TEXTISH):
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                                detail=f"File content does not match declared type ({content_type})")
    return content_type


def _attachment_project_id(comment_type: str, comment_id: str) -> str | None:
    """Resolve the project id an attachment belongs to via its parent entity."""
    if not comment_id:
        return None
    if comment_type == "project":
        return comment_id
    table = {
        "incident": "incidents",
        "deployment": "deployments",
        "rollback": "rollback_operations",
    }.get(comment_type)
    if not table:
        return None
    res = supabase.table(table).select("project_id").eq("id", comment_id).single().execute()
    return res.data.get("project_id") if res.data else None


def _assert_attachment_access(attachment: dict, user_id: str) -> None:
    """Allow the uploader or any member of the parent project to view/delete."""
    if str(attachment.get("user_id")) == user_id:
        return
    project_id = _attachment_project_id(attachment.get("comment_type", ""), attachment.get("comment_id", ""))
    if not project_id or project_id not in get_user_project_ids(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    comment_id: str = None,
    comment_type: str = "incident",
    current_user=Depends(get_current_user),
):
    """Upload a file to Supabase Storage and record its metadata."""
    user_id = str(current_user.id)

    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No filename provided")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File exceeds 10 MB limit")

    content_type = _validate_upload(file.content_type or "application/octet-stream", data)

    # Loading onto another entity requires project membership
    if comment_id and comment_type != "project":
        project_id = _attachment_project_id(comment_type, comment_id)
        if not project_id or project_id not in get_user_project_ids(user_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    elif comment_type == "project" and comment_id:
        if comment_id not in get_user_project_ids(user_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Safe filename
    import re
    import uuid
    safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", file.filename) or "file"
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    storage_path = f"{user_id}/{ts}-{uuid.uuid4().hex[:8]}-{safe_name}"

    # Upload to 'attachments' bucket
    try:
        bucket = supabase.storage.from_("attachments")
        bucket.upload(storage_path, data, {"content-type": content_type})
    except Exception as exc:
        logger.error("Supabase Storage upload failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Upload failed: {exc}")

    # Build public URL
    base_url = settings.SUPABASE_URL.rstrip("/")
    public_url = f"{base_url}/storage/v1/object/public/attachments/{storage_path}"

    # Record metadata in the attachments table
    meta_res = supabase.table("attachments").insert({
        "comment_id": comment_id or "",
        "comment_type": comment_type,
        "user_id": user_id,
        "filename": safe_name,
        "file_url": public_url,
        "file_size": len(data),
        "mime_type": content_type,
        "storage_path": storage_path,
    }).execute()

    if not meta_res.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to record attachment metadata")

    return {
        "id": meta_res.data[0]["id"],
        "filename": safe_name,
        "file_url": public_url,
        "file_size": len(data),
        "mime_type": content_type,
    }


@router.get("/{attachment_id}")
async def get_attachment(attachment_id: str, current_user=Depends(get_current_user)):
    """Fetch attachment metadata."""
    res = supabase.table("attachments").select("*").eq("id", attachment_id).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    _assert_attachment_access(res.data[0], str(current_user.id))
    return res.data[0]


@router.delete("/{attachment_id}")
async def delete_attachment(attachment_id: str, current_user=Depends(get_current_user)):
    """Delete an attachment (uploader or project admins)."""
    res = supabase.table("attachments").select("*").eq("id", attachment_id).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    _assert_attachment_access(res.data[0], str(current_user.id))

    # Only the uploader may delete
    if str(res.data[0]["user_id"]) != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the uploader can delete this file")

    # Remove from storage + metadata
    try:
        supabase.storage.from_("attachments").remove([res.data[0]["storage_path"]])
    except Exception as exc:
        logger.warning("Storage delete failed: %s", exc)
    supabase.table("attachments").delete().eq("id", attachment_id).execute()
    return {"deleted": True, "id": attachment_id}