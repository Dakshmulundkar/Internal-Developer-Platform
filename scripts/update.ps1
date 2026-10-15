# One-command update - run with: npm run update
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot

function Header($msg) { Write-Host ""; Write-Host ("== " + $msg) -ForegroundColor Cyan }
function Ok($msg)     { Write-Host ("  " + [char]0x2705 + " " + $msg) }
function Bad($msg)    { Write-Host ("  " + [char]0x274C + " " + $msg) -ForegroundColor Red }
function Warn($msg)   { Write-Host ("  " + [char]0x26A0 + " " + $msg) -ForegroundColor Yellow }
function Fix($msg)    { Write-Host ("      fix: " + $msg) -ForegroundColor Yellow }
function Finish($status, $code) {
    Write-Host ""
    Write-Host $status
    exit $code
}
function Probe-Health($port) {
    try {
        $r = Invoke-RestMethod -Uri ("http://localhost:" + $port + "/health") -TimeoutSec 3 -ErrorAction Stop
        if ($r.status -eq "ok" -or $r.status -eq "degraded") { return $r.status }
    } catch { }
    return $null
}

Header "Pulling latest code"
Push-Location $root
git pull --ff-only
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) {
    Bad "git pull --ff-only failed (exit code $code) - local changes or diverged history."
    Fix "run 'git status', commit or stash local changes, then retry npm run update"
    Finish "FAILED" 1
}
Ok "git pull --ff-only succeeded"

Header "Detecting Docker"
$composeProg = $null
$composeArgs = @()
if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker compose version 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $composeProg = "docker"; $composeArgs = @("compose") }
}
if (-not $composeProg -and (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    docker-compose version 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $composeProg = "docker-compose"; $composeArgs = @() }
}
$daemon = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker info 2>$null | Out-Null
    $daemon = ($LASTEXITCODE -eq 0)
} elseif ($composeProg) {
    $daemon = $true
}

if (-not $composeProg -or -not $daemon) {
    if (-not $composeProg) { Warn "Neither 'docker compose' nor 'docker-compose' found - using the local dev path." }
    else { Warn "Docker daemon not reachable - using the local dev path." }

    Header "Updating dependencies (local dev path)"
    Push-Location $root
    npm ci
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { Bad "npm ci failed (exit code $code)"; Fix "check your network, then run: npm ci"; Finish "FAILED" 1 }
    Ok "npm ci finished"

    $venvPy = Join-Path $root "backend\venv\Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $venvPy)) { $venvPy = Join-Path $root "backend\venv\bin\python" }
    if (-not (Test-Path -LiteralPath $venvPy)) {
        Bad "backend/venv is missing - cannot update backend deps."
        Fix "run: npm run setup"
        Finish "FAILED" 1
    }
    Push-Location $root
    & $venvPy -m pip install -U -e "./backend[dev]"
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { Bad "backend dependency update failed (exit code $code)"; Fix "check your network, then retry"; Finish "FAILED" 1 }
    Ok "backend deps updated"

    Write-Host "  restart with npm run dev"
    $status = Probe-Health 8001
    if ($status -eq "ok")      { Finish "UPDATED-HEALTHY" 0 }
    if ($status -eq "degraded") { Finish "UPDATED-HEALTH-DEGRADED" 0 }
    Finish "UPDATED-UNHEALTHY" 1
}

Ok "using $composeProg"
Header "Rebuilding Docker stack"
Push-Location $root
& $composeProg @composeArgs build
if ($LASTEXITCODE -ne 0) { Pop-Location; Bad "docker build failed (exit code $LASTEXITCODE)"; Fix "run '$composeProg build' manually and read the error"; Finish "FAILED" 1 }
Ok "image built"
& $composeProg @composeArgs up -d
if ($LASTEXITCODE -ne 0) { Pop-Location; Bad "'$composeProg up -d' failed (exit code $LASTEXITCODE)"; Fix "run '$composeProg up -d' manually and read the error"; Finish "FAILED" 1 }
Pop-Location
Ok "stack started"

Header "Waiting for backend health (http://localhost:8000/health)"
$status = $null
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
    $status = Probe-Health 8000
    if ($status) { break }
    Start-Sleep -Seconds 5
}
if ($status -eq "ok") {
    Ok "backend healthy"
    Finish "UPDATED-HEALTHY" 0
}
if ($status -eq "degraded") {
    Warn "backend is up but degraded (see config_warnings in /health)"
    Finish "UPDATED-HEALTH-DEGRADED" 0
}
Bad "backend did not report health within 120s"
Fix "check logs: $composeProg logs backend"
Finish "UPDATED-UNHEALTHY" 1
