#!/usr/bin/env bash
# One-command update — run with: bash scripts/update.sh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

header() { printf '\n== %s\n' "$1"; }
ok()     { printf '  \xe2\x9c\x85 %s\n' "$1"; }
bad()    { printf '  \xe2\x9d\x8c %s\n' "$1"; }
warn()   { printf '  \xe2\x9a\xa0 %s\n' "$1"; }
fix()    { printf '      fix: %s\n' "$1"; }
finish() { printf '\n%s\n' "$1"; exit "$2"; }

http_health() {
    # $1 = port; echoes ok|degraded, returns 1 if unreachable
    local body=""
    if command -v curl >/dev/null 2>&1; then
        body="$(curl -fsS --max-time 3 "http://localhost:$1/health" 2>/dev/null)" || return 1
    elif command -v wget >/dev/null 2>&1; then
        body="$(wget -q -T 3 -O - "http://localhost:$1/health" 2>/dev/null)" || return 1
    else
        return 1
    fi
    if printf '%s' "$body" | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then echo ok; return 0; fi
    if printf '%s' "$body" | grep -q '"status"[[:space:]]*:[[:space:]]*"degraded"'; then echo degraded; return 0; fi
    return 1
}

header "Pulling latest code"
if ! git pull --ff-only; then
    bad "git pull --ff-only failed - local changes or diverged history."
    fix "run 'git status', commit or stash local changes, then retry this script"
    finish "FAILED" 1
fi
ok "git pull --ff-only succeeded"

header "Detecting Docker"
compose=""
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    compose="docker compose"
elif command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
    compose="docker-compose"
fi
daemon=0
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    daemon=1
elif [ -n "$compose" ]; then
    daemon=1
fi

if [ -z "$compose" ] || [ "$daemon" -eq 0 ]; then
    if [ -z "$compose" ]; then warn "Neither 'docker compose' nor 'docker-compose' found - using the local dev path."
    else warn "Docker daemon not reachable - using the local dev path."; fi

    header "Updating dependencies (local dev path)"
    npm ci || { bad "npm ci failed"; fix "check your network, then run: npm ci"; finish "FAILED" 1; }
    ok "npm ci finished"

    PIP="$ROOT/backend/venv/bin/pip"
    if [ ! -x "$PIP" ]; then
        bad "backend/venv is missing - cannot update backend deps."
        fix "run: bash scripts/setup.sh"
        finish "FAILED" 1
    fi
    "$PIP" install -U -e "./backend[dev]" || { bad "backend dependency update failed"; fix "check your network, then retry"; finish "FAILED" 1; }
    ok "backend deps updated"

    printf '  restart with npm run dev\n'
    status="$(http_health 8001 || true)"
    case "$status" in
        ok)       finish "UPDATED-HEALTHY" 0 ;;
        degraded) finish "UPDATED-HEALTH-DEGRADED" 0 ;;
        *)        finish "UPDATED-UNHEALTHY" 1 ;;
    esac
fi

ok "using $compose"
header "Rebuilding Docker stack"
$compose build || { bad "docker build failed"; fix "run '$compose build' manually and read the error"; finish "FAILED" 1; }
ok "image built"
$compose up -d || { bad "'$compose up -d' failed"; fix "run '$compose up -d' manually and read the error"; finish "FAILED" 1; }
ok "stack started"

header "Waiting for backend health (http://localhost:8000/health)"
status=""
deadline=$(( $(date +%s) + 120 ))
while [ "$(date +%s)" -lt "$deadline" ]; do
    status="$(http_health 8000 || true)"
    if [ -n "$status" ]; then break; fi
    sleep 5
done
case "$status" in
    ok)
        ok "backend healthy"
        finish "UPDATED-HEALTHY" 0 ;;
    degraded)
        warn "backend is up but degraded (see config_warnings in /health)"
        finish "UPDATED-HEALTH-DEGRADED" 0 ;;
    *)
        bad "backend did not report health within 120s"
        fix "check logs: $compose logs backend"
        finish "UPDATED-UNHEALTHY" 1 ;;
esac
