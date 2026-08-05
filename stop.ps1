<#
.SYNOPSIS
    Mail Account Manager - One-click stop script
.DESCRIPTION
    Stops backend and frontend processes started by start.ps1.
.PARAMETER DelayMilliseconds
    Wait before stopping so an API caller can receive its response first.
#>
param(
    [ValidateRange(0, 5000)]
    [int]$DelayMilliseconds = 0
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Get-Item $PSScriptRoot).FullName
$RuntimeDir = Join-Path $ProjectRoot ".runtime"
$pidFile = Join-Path $RuntimeDir "running-pids"

function Stop-ProcessTree {
    param([int]$ProcessId)

    if ($ProcessId -eq $PID) { return }

    $children = @(Get-CimInstance Win32_Process -Filter ("ParentProcessId=" + $ProcessId) -ErrorAction SilentlyContinue)
    foreach ($child in $children) {
        if ($child.ProcessId -eq $PID) { continue }
        Stop-ProcessTree -ProcessId $child.ProcessId
    }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Get-ListeningProcessIds {
    param([int[]]$Ports)

    $ownerIds = @()
    foreach ($port in $Ports) {
        try {
            $connections = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop)
        } catch {
            $connections = @()
        }

        foreach ($connection in $connections) {
            if ($connection.OwningProcess) {
                $ownerIds += [int]$connection.OwningProcess
            }
        }

        if ($connections.Count -eq 0) {
            foreach ($line in @(netstat -ano -p tcp | Select-String -Pattern (":" + $port + "\s+.*LISTENING\s+(\d+)\s*$"))) {
                if ($line.Line -match "LISTENING\s+(\d+)\s*$") {
                    $ownerIds += [int]$Matches[1]
                }
            }
        }
    }

    return @($ownerIds | Select-Object -Unique)
}

function Test-ProjectCommandLine {
    param(
        [string]$CommandLine,
        [bool]$AllowLauncher
    )

    if (-not $CommandLine) { return $false }
    if ($CommandLine.IndexOf($ProjectRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
        return $true
    }

    if (-not $AllowLauncher) { return $false }
    return $CommandLine -match "(?i)(npm-cli\.js.*\brun\s+dev|npm\.cmd.*\brun\s+dev|tsx(?:\\|/)dist(?:\\|/)cli\.mjs.*\bwatch\s+src(?:\\|/)server\.ts|\bcmd\.exe.*\btsx\s+watch\s+src(?:\\|/)server\.ts|vite(?:\.js)?.*--port\s+5173)"
}

function Get-ProjectProcessRoot {
    param([int]$PortOwnerProcessId)

    $currentProcessId = $PortOwnerProcessId
    $rootProcessId = 0
    for ($depth = 0; $depth -lt 12 -and $currentProcessId -gt 0; $depth++) {
        $processInfo = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $currentProcessId) -ErrorAction SilentlyContinue
        if (-not $processInfo) { break }

        $matchesProject = Test-ProjectCommandLine -CommandLine ([string]$processInfo.CommandLine) -AllowLauncher ($rootProcessId -ne 0)
        if (-not $matchesProject) { break }
        if ($processInfo.ProcessId -eq $PID) { break }

        $rootProcessId = [int]$processInfo.ProcessId
        $currentProcessId = [int]$processInfo.ParentProcessId
    }

    return $rootProcessId
}

function Stop-ProjectPortProcesses {
    param([int[]]$Ports)

    $stoppedRoots = @()
    foreach ($ownerProcessId in @(Get-ListeningProcessIds -Ports $Ports)) {
        $rootProcessId = Get-ProjectProcessRoot -PortOwnerProcessId $ownerProcessId
        if ($rootProcessId -le 0) {
            Write-Host ("  Skipped non-project process {0} listening on a MailOps port" -f $ownerProcessId) -ForegroundColor Yellow
            continue
        }
        if ($stoppedRoots -contains $rootProcessId) { continue }

        Stop-ProcessTree -ProcessId $rootProcessId
        $stoppedRoots += $rootProcessId
        Write-Host ("  Stopped project process tree {0}" -f $rootProcessId) -ForegroundColor Green
    }
}

if ($DelayMilliseconds -gt 0) {
    Start-Sleep -Milliseconds $DelayMilliseconds
}

Write-Host ""
Write-Host "Stopping Mail Account Manager..." -ForegroundColor Cyan

if (Test-Path -LiteralPath $pidFile) {
    $content = @(Get-Content -LiteralPath $pidFile -Encoding UTF8)
    foreach ($line in $content) {
        if ($line -match "^[^=]+=(\d+)\|(\d+)$") {
            $procId = [int]$Matches[1]
            $expectedStartTicks = [long]$Matches[2]
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($proc) {
                $actualStartTicks = $proc.StartTime.ToUniversalTime().Ticks
                if ($actualStartTicks -ne $expectedStartTicks) {
                    Write-Host ("  Skipped reused PID {0}" -f $procId) -ForegroundColor Yellow
                    continue
                }
                Stop-ProcessTree -ProcessId $procId
                $msg = "  Stopped PID {0} ({1})" -f $procId, $proc.Name
                Write-Host $msg -ForegroundColor Green
            }
        } elseif ($line.Trim()) {
            Write-Host "  Ignored legacy PID entry without a start-time guard" -ForegroundColor Yellow
        }
    }
    Remove-Item -LiteralPath $pidFile -Force
} else {
    Write-Host "  No .runtime/running-pids found; checking project ports." -ForegroundColor Yellow
}

# npm.cmd can exit after handing off to Node, and watch-mode restarts can replace
# child PIDs. Clean up only listeners whose command line belongs to this project.
for ($attempt = 0; $attempt -lt 3; $attempt++) {
    Stop-ProjectPortProcesses -Ports @(3000, 5173)
    Start-Sleep -Milliseconds 250
}

$remainingProcessIds = @(Get-ListeningProcessIds -Ports @(3000, 5173))
if ($remainingProcessIds.Count -gt 0) {
    Write-Host ("  Could not stop listeners: {0}" -f ($remainingProcessIds -join ", ")) -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "All services stopped." -ForegroundColor Green
