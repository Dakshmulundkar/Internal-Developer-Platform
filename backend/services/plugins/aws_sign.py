"""AWS Signature Version 4 signer (stdlib only — no boto dependency).

Supports query-protocol GETs (STS, CloudWatch, CodeDeploy via query string)
and JSON-protocol POSTs (CodeDeploy X-Amz-Target). Returns headers to send.
"""

import datetime
import hashlib
import hmac
from urllib.parse import quote, urlparse


def _sha256_hex(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def _hmac(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def sign_request(
    method: str,
    url: str,
    service: str,
    region: str,
    access_key: str,
    secret_key: str,
    headers: dict | None = None,
    params: dict | None = None,
    payload: str = "",
    amz_target: str | None = None,
    now: datetime.datetime | None = None,
) -> dict:
    """Sign an AWS request. Returns the headers to send (incl. Authorization)."""
    now = now or datetime.datetime.now(datetime.timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    parsed = urlparse(url)
    host = parsed.netloc
    path = parsed.path or "/"

    query_params = dict(params or {})
    canonical_qs = "&".join(
        f"{quote(str(k), safe='-_.~')}={quote(str(v), safe='-_.~')}"
        for k, v in sorted(query_params.items())
    )

    signed = {"host": host, "x-amz-date": amz_date}
    all_headers = {k.lower(): v for k, v in (headers or {}).items()}
    if amz_target:
        all_headers["x-amz-target"] = amz_target
    if method.upper() == "POST":
        all_headers.setdefault("content-type", "application/x-amz-json-1.1")
    signed.update({k: v for k, v in all_headers.items() if k in ("host", "x-amz-date", "x-amz-target", "content-type")})

    canonical_headers = "".join(f"{k}:{signed[k].strip()}\n" for k in sorted(signed))
    signed_headers = ";".join(sorted(signed))
    canonical_request = "\n".join([
        method.upper(), path, canonical_qs, canonical_headers, signed_headers, _sha256_hex(payload),
    ])

    scope = f"{date_stamp}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join(["AWS4-HMAC-SHA256", amz_date, scope, _sha256_hex(canonical_request)])

    k_date = _hmac(("AWS4" + secret_key).encode(), date_stamp)
    k_region = _hmac(k_date, region)
    k_service = _hmac(k_region, service)
    k_signing = _hmac(k_service, "aws4_request")
    signature = hmac.new(k_signing, string_to_sign.encode(), hashlib.sha256).hexdigest()

    out = dict(headers or {})
    out["Authorization"] = (
        f"AWS4-HMAC-SHA256 Credential={access_key}/{scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    out["x-amz-date"] = amz_date
    if amz_target:
        out["x-amz-target"] = amz_target
    return out


def signed_url(base_url: str, params: dict) -> str:
    """Append sorted, encoded query params to a base URL (matches signing)."""
    qs = "&".join(
        f"{quote(str(k), safe='-_.~')}={quote(str(v), safe='-_.~')}"
        for k, v in sorted(params.items())
    )
    return f"{base_url}?{qs}" if qs else base_url
