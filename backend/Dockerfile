# =============================================================================
# IDP Backend — Multi-stage Dockerfile
# =============================================================================

# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM python:3.11-slim AS builder
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

# ── Stage 2: slim runtime image ───────────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# curl is required by the HEALTHCHECK below; ca-certificates for TLS to
# vendor APIs. Trivy static binary powers IDP-side vulnerability scanning
# (no Docker daemon needed). Pinned + checksummed upstream release.
ARG TRIVY_VERSION=0.66.0
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && curl -sSL -o /tmp/trivy.tar.gz \
      "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
    && tar -xzf /tmp/trivy.tar.gz -C /usr/local/bin trivy \
    && rm /tmp/trivy.tar.gz \
    && trivy --version

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn

COPY . .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

# Railway injects $PORT; default keeps `docker run` working locally.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2"]
