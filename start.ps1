<#
.SYNOPSIS
    Mail Account Manager - One-click startup script
.DESCRIPTION
    Detects environment and starts frontend + backend services.
    Supports dev mode (direct run) and docker mode.
    Handles: Docker not running, missing deps, missing .env, missing DB, port conflicts.
.PARAMETER Mode
    Startup mode: dev (default) or docker (Docker Compose)
.PARAMETER SkipOpen
    Skip auto-opening browser
.EXAMPLE
    .\start.ps1
    .\start.ps1 -Mode docker
    .\start.ps1 -Mode dev -SkipOpen
#>
param(
    [ValidateSet("dev", "docker")]
    [string]$Mode = "dev",
    [switch]$SkipOpen
)

$ErrorActionPreference = "Stop"
# Normalize to the canonical long path. Launching Vite from an 8.3 short-name
# path (e.g. ADMINI~1) makes its transform pipeline resolve module ids against a
# different root, silently skipping JSX/TS transpile and breaking the frontend.
$ProjectRoot = (Get-Item $PSScriptRoot).FullName
$BackendDir = Join-Path $ProjectRoot "mail-backend"
$FrontendDir = Join-Path $ProjectRoot "frontend"
$RuntimeDir = Join-Path $ProjectRoot ".runtime"
$EnvFile = Join-Path $ProjectRoot ".env"
$EnvExample = Join-Path $ProjectRoot ".env.example"

# --- Utility functions ---
function Write-Step  { param([string]$Msg) Write-Host ("`n[*] " + $Msg) -ForegroundColor Cyan }
function Write-Ok    { param([string]$Msg) Write-Host ("    [OK] " + $Msg) -ForegroundColor Green }
function Write-Warn  { param([string]$Msg) Write-Host ("    [!] " + $Msg) -ForegroundColor Yellow }
function Write-Err   { param([string]$Msg) Write-Host ("    [X] " + $Msg) -ForegroundColor Red }

function Test-PortInUse {
    param([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    } catch { $conn = $null }
    return ($null -ne $conn)
}

function Stop-ProcessTree {
    param([int]$ProcessId)

    $children = @(Get-CimInstance Win32_Process -Filter ("ParentProcessId=" + $ProcessId) -ErrorAction SilentlyContinue)
    foreach ($child in $children) {
        Stop-ProcessTree -ProcessId $child.ProcessId
    }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Import-DotEnv {
    param([string]$LiteralPath)

    foreach ($line in @(Get-Content -LiteralPath $LiteralPath -Encoding UTF8)) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }

        $separator = $trimmed.IndexOf("=")
        if ($separator -le 0) { continue }

        $name = $trimmed.Substring(0, $separator).Trim()
        $value = $trimmed.Substring($separator + 1).Trim()
        if ($value.Length -ge 2 -and (($value[0] -eq '"' -and $value[-1] -eq '"') -or ($value[0] -eq "'" -and $value[-1] -eq "'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

# --- Banner ---
Write-Host ""
Write-Host "================================================" -ForegroundColor Magenta
Write-Host "   Mail Account Manager - Startup" -ForegroundColor Magenta
Write-Host ("   Mode: " + $Mode) -ForegroundColor Magenta
Write-Host "================================================" -ForegroundColor Magenta

# 1. Check .env
Write-Step "Checking .env config"
if (-not (Test-Path $EnvFile)) {
    if (Test-Path $EnvExample) {
        Copy-Item $EnvExample $EnvFile
        $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        $randomSecret = -join (1..32 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
        $content = Get-Content $EnvFile -Raw
        $content = $content -replace "JWT_SECRET=.*", ("JWT_SECRET=" + $randomSecret)
        $content | Set-Content $EnvFile -Encoding utf8 -NoNewline
        Write-Ok ".env created from .env.example (JWT_SECRET auto-generated)"
    } else {
        Write-Err ".env.example not found!"
        exit 1
    }
} else {
    Write-Ok ".env exists"
}

Import-DotEnv -LiteralPath $EnvFile

# Load ports from the canonical root environment.
$backendPort = 3000
$frontendPort = 5173
if ($env:PORT -match "^\d+$") { $backendPort = [int]$env:PORT }

# ====================== DOCKER MODE ======================
if ($Mode -eq "docker") {
    Write-Step "Docker mode"

    # Check docker installed
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $dockerCmd) {
        Write-Err "Docker not installed! Install from: https://www.docker.com/products/docker-desktop"
        exit 1
    }
    Write-Ok "Docker installed"

    # Check Docker daemon
    Write-Step "Checking Docker daemon"
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Docker daemon not running. Starting Docker Desktop..."

        $searchPaths = @(
            (Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"),
            (Join-Path $env:LOCALAPPDATA "Docker\Docker Desktop.exe")
        )
        $dockerDesktopPath = $searchPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

        if ($dockerDesktopPath) {
            Start-Process $dockerDesktopPath
            Write-Warn "Waiting for Docker (max 120s)..."
            $timeout = 120; $elapsed = 0
            while ($elapsed -lt $timeout) {
                Start-Sleep -Seconds 3; $elapsed += 3
                docker info 2>$null | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    Write-Ok ("Docker ready (took " + $elapsed + "s)")
                    break
                }
                Write-Host "." -NoNewline
            }
            if ($elapsed -ge $timeout) {
                Write-Err "Docker startup timed out. Please start manually."
                exit 1
            }
        } else {
            Write-Err "Cannot find Docker Desktop. Please start Docker manually."
            exit 1
        }
    } else {
        Write-Ok "Docker daemon running"
    }

    # Docker Compose up
    Write-Step "Starting Docker Compose"
    $composeFile = Join-Path $ProjectRoot "docker-compose.yml"
    if (-not (Test-Path $composeFile)) {
        Write-Err "docker-compose.yml not found"
        exit 1
    }

    $dockerFrontendPort = 5173
    $dockerBackendPort = 3000
    foreach ($port in @($dockerFrontendPort, $dockerBackendPort)) {
        if (Test-PortInUse $port) {
            Write-Err ("Port {0} is already in use. Stop the owning service before starting Docker mode." -f $port)
            exit 1
        }
    }

    Set-Location $ProjectRoot
    docker compose down 2>$null
    docker compose up --build -d
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Docker Compose failed"
        exit 1
    }

    # Health check
    Write-Step "Waiting for services..."
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        try {
            $resp = Invoke-WebRequest -Uri ("http://127.0.0.1:" + $dockerFrontendPort) -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            if ($resp.StatusCode -eq 200) { $ready = $true; break }
        } catch {}
        Write-Host "." -NoNewline
    }
    Write-Host ""
    if ($ready) { Write-Ok "Services ready!" }
    else { Write-Warn "Services may still be starting..." }

    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "   Started (Docker mode)" -ForegroundColor Green
    Write-Host ("   Frontend: http://localhost:" + $dockerFrontendPort) -ForegroundColor Green
    Write-Host ("   Backend:  http://localhost:" + $dockerBackendPort) -ForegroundColor Green
    Write-Host "   Stop: docker compose down" -ForegroundColor Yellow
    Write-Host "================================================" -ForegroundColor Green

    if (-not $SkipOpen) { Start-Process ("http://localhost:" + $dockerFrontendPort) }
    exit 0
}

# PLACEHOLDER_DEV_MODE
# ====================== DEV MODE ======================
Write-Step "Dev mode"

# 2. Check Node.js
Write-Step "Checking Node.js"
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Err "Node.js not installed! https://nodejs.org/"
    exit 1
}
$nodeVer = node --version
Write-Ok ("Node.js " + $nodeVer)

$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Write-Err "npm not found"
    exit 1
}
$npmExecutable = $npmCmd.Source
$npmVer = & $npmExecutable --version
if ($LASTEXITCODE -ne 0) { Write-Err "Unable to execute npm"; exit 1 }
Write-Ok ("npm " + $npmVer)

# 3. Backend dependencies
Write-Step "Checking backend dependencies"
$backendModules = Join-Path $BackendDir "node_modules"
if (-not (Test-Path $backendModules)) {
    Write-Warn "Installing backend dependencies..."
    Set-Location $BackendDir
    & $npmExecutable ci
    if ($LASTEXITCODE -ne 0) { Write-Err "Backend npm install failed"; exit 1 }
    Write-Ok "Backend dependencies installed"
} else {
    Write-Ok "Backend dependencies exist"
}

# 4. Frontend dependencies
Write-Step "Checking frontend dependencies"
$frontendModules = Join-Path $FrontendDir "node_modules"
if (-not (Test-Path $frontendModules)) {
    Write-Warn "Installing frontend dependencies..."
    Set-Location $FrontendDir
    & $npmExecutable ci
    if ($LASTEXITCODE -ne 0) { Write-Err "Frontend npm install failed"; exit 1 }
    Write-Ok "Frontend dependencies installed"
} else {
    Write-Ok "Frontend dependencies exist"
}

# 5. Prisma client
Write-Step "Checking Prisma client"
$prismaClient = Join-Path $BackendDir "node_modules\.prisma\client"
$prismaExecutable = Join-Path $BackendDir "node_modules\.bin\prisma.cmd"
if (-not (Test-Path $prismaClient)) {
    Write-Warn "Generating Prisma client..."
    Set-Location $BackendDir
    & $prismaExecutable generate
    if ($LASTEXITCODE -ne 0) { Write-Err "Prisma generate failed"; exit 1 }
    Write-Ok "Prisma client generated"
} else {
    Write-Ok "Prisma client exists"
}

# 6. Database
Write-Step "Checking database"
$dbFile = Join-Path $BackendDir "prisma\prisma\dev.db"
$dbDir = Split-Path $dbFile -Parent
if (-not (Test-Path $dbDir)) {
    New-Item -ItemType Directory -Path $dbDir -Force | Out-Null
}
if (-not (Test-Path $dbFile)) {
    Write-Warn "Database not found. Running migration..."
    Set-Location $BackendDir
    & $prismaExecutable migrate deploy
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "migrate deploy failed, trying migrate dev..."
        & $prismaExecutable migrate dev --name init --skip-generate
        if ($LASTEXITCODE -ne 0) { Write-Err "Database migration failed"; exit 1 }
    }
    Write-Ok "Database migration complete"
} else {
    Write-Ok "Database exists"
}

# 7. Check ports
Write-Step "Checking port availability"
if (Test-PortInUse $backendPort) {
    Write-Err ("Backend port " + $backendPort + " is already in use. Run .\stop.ps1 or choose another port.")
    exit 1
} else {
    Write-Ok ("Backend port " + $backendPort + " available")
}

if (Test-PortInUse $frontendPort) {
    Write-Err ("Frontend port " + $frontendPort + " is already in use. Run .\stop.ps1 or choose another port.")
    exit 1
} else {
    Write-Ok ("Frontend port " + $frontendPort + " available")
}

# 8. Start backend
Write-Step ("Starting backend (port " + $backendPort + ")")
if (-not (Test-Path -LiteralPath $RuntimeDir)) {
    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
}
$backendOutLog = Join-Path $RuntimeDir "backend.out.log"
$backendErrLog = Join-Path $RuntimeDir "backend.err.log"
$frontendOutLog = Join-Path $RuntimeDir "frontend.out.log"
$frontendErrLog = Join-Path $RuntimeDir "frontend.err.log"
Set-Location $BackendDir
$backendJob = Start-Process -FilePath $npmExecutable -ArgumentList "run","dev" -WorkingDirectory $BackendDir -PassThru -WindowStyle Hidden -RedirectStandardOutput $backendOutLog -RedirectStandardError $backendErrLog
Write-Ok ("Backend PID: " + $backendJob.Id)

# Wait for backend
$backendReady = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-WebRequest -Uri ("http://127.0.0.1:" + $backendPort + "/api/v1/health") -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) { $backendReady = $true }
    } catch {}
    if ($backendReady) { break }
}
if ($backendReady) {
    Write-Ok ("Backend ready on port " + $backendPort)
} else {
    Stop-ProcessTree -ProcessId $backendJob.Id
    if (Test-Path -LiteralPath $backendErrLog) { Get-Content -LiteralPath $backendErrLog -Tail 20 -ErrorAction SilentlyContinue }
    Write-Err "Backend did not become healthy in time"
    exit 1
}

# 9. Start frontend
Write-Step ("Starting frontend (port " + $frontendPort + ")")
Set-Location $FrontendDir
$frontendJob = Start-Process -FilePath $npmExecutable -ArgumentList "run","dev" -WorkingDirectory $FrontendDir -PassThru -WindowStyle Hidden -RedirectStandardOutput $frontendOutLog -RedirectStandardError $frontendErrLog
Write-Ok ("Frontend PID: " + $frontendJob.Id)

# Wait for frontend
$frontendReady = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-WebRequest -Uri ("http://127.0.0.1:" + $frontendPort) -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) { $frontendReady = $true; break }
    } catch {}
}
if ($frontendReady) {
    Write-Ok ("Frontend ready on port " + $frontendPort)
} else {
    foreach ($processId in @($frontendJob.Id, $backendJob.Id)) {
        Stop-ProcessTree -ProcessId $processId
    }
    if (Test-Path -LiteralPath $frontendErrLog) { Get-Content -LiteralPath $frontendErrLog -Tail 20 -ErrorAction SilentlyContinue }
    Write-Err "Frontend did not become ready in time"
    exit 1
}

# 10. Done
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "   Started (Dev mode)" -ForegroundColor Green
Write-Host ("   Frontend: http://localhost:" + $frontendPort) -ForegroundColor Green
Write-Host ("   Backend:  http://localhost:" + $backendPort) -ForegroundColor Green
Write-Host "   Stop: .\stop.ps1" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

# Save PIDs for stop.ps1
$pidFile = Join-Path $RuntimeDir "running-pids"
$pidContent = ("backend={0}|{1}`nfrontend={2}|{3}" -f $backendJob.Id, $backendJob.StartTime.ToUniversalTime().Ticks, $frontendJob.Id, $frontendJob.StartTime.ToUniversalTime().Ticks)
$pidContent | Set-Content $pidFile -Encoding utf8

Write-Host "PIDs saved to .runtime/running-pids" -ForegroundColor DarkGray

if (-not $SkipOpen) {
    Start-Sleep -Seconds 1
    Start-Process ("http://localhost:" + $frontendPort)
}

Set-Location $ProjectRoot
