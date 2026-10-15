# One-command setup - run with: npm run setup
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot

function Header($msg) { Write-Host ""; Write-Host ("== " + $msg) -ForegroundColor Cyan }
function Ok($msg)     { Write-Host ("  " + [char]0x2705 + " " + $msg) }
function Bad($msg)    { Write-Host ("  " + [char]0x274C + " " + $msg) -ForegroundColor Red }
function Warn($msg)   { Write-Host ("  " + [char]0x26A0 + " " + $msg) -ForegroundColor Yellow }
function Die($msg, $fix) {
    Bad $msg
    Write-Host ("      fix: " + $fix) -ForegroundColor Yellow
    exit 1
}

Header "1/7 Checking tools"
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Die "Node.js not found" "install Node 18+ from https://nodejs.org" }
$nodeVer = (& node -v) 2>&1
if ($LASTEXITCODE -ne 0) { Die "node is not runnable" "reinstall Node 18+ from https://nodejs.org" }
$nodeVer = ("$nodeVer").Trim().TrimStart("v")
$nodeMajor = 0
[void][int]::TryParse($nodeVer.Split(".")[0], [ref]$nodeMajor)
if ($nodeMajor -lt 18) { Die "Node v$nodeVer is older than 18" "install Node 18+ from https://nodejs.org" }
Ok "Node v$nodeVer found (>= 18)"
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Die "npm not found" "install Node 18+ (npm is included)" }
Ok "npm found"

Header "2/7 Environment files"
$beEnv = Join-Path $root "backend\.env"
$beEnvEx = Join-Path $root "backend\.env.example"
if (Test-Path -LiteralPath $beEnv) {
    Ok "backend/.env already exists (left untouched)"
} elseif (Test-Path -LiteralPath $beEnvEx) {
    Copy-Item -LiteralPath $beEnvEx -Destination $beEnv
    if (-not (Test-Path -LiteralPath $beEnv)) { Die "could not create backend/.env" "copy backend/.env.example to backend/.env manually" }
    Ok "backend/.env created from backend/.env.example"
    Write-Host "     Open backend/.env and fill the REQUIRED keys (Supabase)."
} else {
    Die "backend/.env.example is missing" "restore it with: git checkout backend/.env.example"
}
$rootEnv = Join-Path $root ".env"
$rootEnvEx = Join-Path $root ".env.example"
if (Test-Path -LiteralPath $rootEnv) {
    Ok "root .env already exists (left untouched)"
} elseif (Test-Path -LiteralPath $rootEnvEx) {
    Copy-Item -LiteralPath $rootEnvEx -Destination $rootEnv
    if (-not (Test-Path -LiteralPath $rootEnv)) { Die "could not create .env" "copy .env.example to .env manually" }
    Ok "root .env created from .env.example"
} else {
    Die ".env.example is missing" "restore it with: git checkout .env.example"
}

Header "3/7 Installing frontend dependencies (npm ci)"
Push-Location $root
npm ci
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Die "npm ci failed (exit code $code)" "check your network connection, then run: npm ci" }
Ok "npm ci finished"

Header "4/7 Creating Python virtualenv (backend/venv)"
$venvDir = Join-Path $root "backend\venv"
$venvPy = Join-Path $venvDir "Scripts\python.exe"
if (Test-Path -LiteralPath $venvPy) {
    Ok "backend/venv already exists"
} else {
    $pyArgs = @()
    if (Get-Command python -ErrorAction SilentlyContinue) { $pyCmd = "python" }
    elseif (Get-Command py -ErrorAction SilentlyContinue) { $pyCmd = "py"; $pyArgs = @("-3") }
    else { Die "Python not found" "install Python 3.10+ from https://python.org and tick 'Add python.exe to PATH'" }
    & $pyCmd @pyArgs -m venv $venvDir
    if (-not (Test-Path -LiteralPath $venvPy)) { Die "creating backend/venv failed" "run manually: python -m venv backend/venv" }
    Ok "backend/venv created"
}

Header "5/7 Upgrading pip"
# pip 26 refuses self-upgrade via the pip.exe shim — must run as `python -m pip`
& $venvPy -m pip install -U pip
if ($LASTEXITCODE -ne 0) { Die "pip self-upgrade failed (exit code $LASTEXITCODE)" "check your network, then rerun: npm run setup" }
Ok "pip upgraded"

Header "6/7 Installing backend dependencies (./backend[dev])"
Push-Location $root
& $venvPy -m pip install -U -e "./backend[dev]"
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Die "backend dependency install failed (exit code $code)" "check your network, then rerun: npm run setup" }
Ok "backend deps installed"

Header "7/7 Docker (optional)"
$hasDocker = [bool](Get-Command docker -ErrorAction SilentlyContinue)
$hasCompose = [bool](Get-Command docker-compose -ErrorAction SilentlyContinue)
if (-not $hasDocker -and -not $hasCompose) {
    Warn "Docker not installed - that is fine, dev mode (npm run dev) does not need it."
} else {
    $daemonUp = $false
    if ($hasDocker) {
        docker info 2>$null | Out-Null
        $daemonUp = ($LASTEXITCODE -eq 0)
    }
    if ($daemonUp) { Ok "Docker daemon is running (only needed for the docker path)" }
    else { Warn "Docker installed but daemon not running - that is fine, dev mode (npm run dev) does not need it." }
}

Write-Host ""
Write-Host "Setup complete. Next steps:" -ForegroundColor Green
Write-Host "  1. Open backend/.env and fill the REQUIRED keys (Supabase)."
Write-Host "  2. Run backend/supabase_schema.sql then backend/supabase_schema_additions.sql in the Supabase SQL editor."
Write-Host "  3. npm run dev"
Write-Host "  4. Open http://localhost:5174"
exit 0
