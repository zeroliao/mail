<#
.SYNOPSIS
    Mail Account Manager - One-click stop script
.DESCRIPTION
    Stops backend and frontend processes started by start.ps1.
#>
$ProjectRoot = $PSScriptRoot
$pidFile = Join-Path $ProjectRoot ".running-pids"

Write-Host ""
Write-Host "Stopping Mail Account Manager..." -ForegroundColor Cyan

if (Test-Path $pidFile) {
    $content = Get-Content $pidFile
    foreach ($line in $content) {
        if ($line -match "=(\d+)") {
            $procId = [int]$Matches[1]
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($proc) {
                $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $procId }
                foreach ($child in $children) {
                    Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue
                }
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                $msg = "  Stopped PID {0} ({1})" -f $procId, $proc.Name
                Write-Host $msg -ForegroundColor Green
            }
        }
    }
    Remove-Item $pidFile -Force
} else {
    Write-Host "  No .running-pids found. Trying port-based stop..." -ForegroundColor Yellow
    @(3000, 3002, 5173) | ForEach-Object {
        $port = $_
        try {
            $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop
        } catch { $conns = $null }
        if ($conns) {
            foreach ($c in $conns) {
                $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
                if ($proc -and $proc.Name -eq "node") {
                    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                    $msg = "  Stopped node on port {0} (PID {1})" -f $port, $proc.Id
                    Write-Host $msg -ForegroundColor Green
                }
            }
        }
    }
}

Write-Host ""
Write-Host "All services stopped." -ForegroundColor Green
