"""Lightweight in-process rate limiting for high-risk endpoints.

Fixed-window limiter keyed by client IP + request path. No external
dependencies. This is a single-process budget meant to blunt credential
stuffing / brute-force attempts on the auth endpoints; it is not a substitute
for a shared edge-level limiter when running multiple workers.
"""

import logging
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

logger = logging.getLogger(__name__)

_HITS: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_LOCK = threading.Lock()


def rate_limit(max_requests: int, window_seconds: int = 60):
    """Return a FastAPI dependency enforcing a fixed-window rate per client+route."""

    def _dependency(request: Request) -> None:
        key = (request.client.host if request.client else "unknown", request.url.path)
        now = time.monotonic()
        with _LOCK:
            window_start = now - window_seconds
            dq = _HITS[key]
            while dq and dq[0] <= window_start:
                dq.popleft()
            if len(dq) >= max_requests:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests. Please try again later.",
                )
            dq.append(now)

    return _dependency