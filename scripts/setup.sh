#!/usr/bin/env bash
# One-command setup — run with: bash scripts/setup.sh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

header() { printf '\n== %s\n' "$1"; }
ok()     { printf '  \xe2\x9c\x85 %s\n' "$1"; }
bad()    { printf '  \xe2\x9d\x8c %s\n' "$1"; }
warn()   { printf '  \xe2\x9a\xa0 %s\n' "$1"; }
die()    { bad "$1"; printf '      fix: %s\n' "$2"; exit 1; }

header "1/7 Checking tools"
command -v node >/dev/null 2>&1 || die "Node.js not found" "install Node 18+ from https://nodejs.org"
NODE_V="$(node -v | sed 's/^v//')"
NODE_MAJOR="${NODE_V%%.*}"
case "$NODE_MAJOR" in
    ''|*[!0-9]*) die "could not read Node version (got '$NODE_V')" "install Node 18+ from https://nodejs.org" ;;
esac
if [ "$NODE_MAJOR" -lt 18 ]; then die "Node v$NODE_V is older than 18" "install Node 18+ from https://nodejs.org"; fi
ok "Node v$NODE_V found (>= 18)"
command -v npm >/dev/null 2>&1 || die "npm not found" "install Node 18+ (npm is included)"
ok "npm found"

header "2/7 Environment files"
if [ -f "backend/.env" ]; then
    ok "backend/.env already exists (left untouched)"
elif [ -f "backend/.env.example" ]; then
    cp "backend/.env.example" "backend/.env" || die "could not create backend/.env" "copy backend/.env.example to backend/.env manually"
    ok "backend/.env created from backend/.env.example"
    printf '     Open backend/.env and fill the REQUIRED keys (Supabase).\n'
else
    die "backend/.env.example is missing" "restore it with: git checkout backend/.env.example"
fi
if [ -f ".env" ]; then
    ok "root .env already exists (left untouched)"
elif [ -f ".env.example" ]; then
    cp ".env.example" ".env" || die "could not create .env" "copy .env.example to .env manually"
    ok "root .env created from .env.example"
else
    die ".env.example is missing" "restore it with: git checkout .env.example"
fi

header "3/7 Installing frontend dependencies (npm ci)"
npm ci || die "npm ci failed" "check your network connection, then run: npm ci"
ok "npm ci finished"

header "4/7 Creating Python virtualenv (backend/venv)"
if [ -x "backend/venv/bin/python" ]; then
    ok "backend/venv already exists"
else
    if command -v python3 >/dev/null 2>&1; then PY=python3
    elif command -v python >/dev/null 2>&1; then PY=python
    else die "Python not found" "install Python 3.10+ from https://python.org"; fi
    "$PY" -m venv backend/venv || die "creating backend/venv failed" "run manually: python3 -m venv backend/venv"
    [ -x "backend/venv/bin/python" ] || die "creating backend/venv failed" "run manually: python3 -m venv backend/venv"
    ok "backend/venv created"
fi

header "5/7 Upgrading pip"
if [ ! -x "backend/venv/bin/pip" ]; then die "pip not found inside backend/venv" "recreate it: python3 -m venv backend/venv, then rerun this script"; fi
backend/venv/bin/pip install -U pip || die "pip self-upgrade failed" "check your network, then rerun this script"
ok "pip upgraded"

header "6/7 Installing backend dependencies (./backend[dev])"
backend/venv/bin/pip install -U -e "./backend[dev]" || die "backend dependency install failed" "check your network, then rerun this script"
ok "backend deps installed"

header "7/7 Docker (optional)"
if ! command -v docker >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
    warn "Docker not installed - that is fine, dev mode (npm run dev) does not need it."
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    ok "Docker daemon is running (only needed for the docker path)"
else
    warn "Docker installed but daemon not running - that is fine, dev mode (npm run dev) does not need it."
fi

printf '\nSetup complete. Next steps:\n'
printf '  1. Open backend/.env and fill the REQUIRED keys (Supabase).\n'
printf '  2. Run backend/supabase_schema.sql then backend/supabase_schema_additions.sql in the Supabase SQL editor.\n'
printf '  3. npm run dev\n'
printf '  4. Open http://localhost:5174\n'
exit 0
