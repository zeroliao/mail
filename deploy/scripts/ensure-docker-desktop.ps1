param(
    [ValidateRange(10, 300)]
    [int]$StartupTimeoutSeconds = 120,
    [ValidateRange(1, 15)]
    [int]$ProbeTimeoutSeconds = 5,
    [switch]$StopStartedProcessesOnFailure
)

$ErrorActionPreference = "Stop"

function Test-DockerDaemon {
    param(
        [string]$DockerExecutable,
        [int]$TimeoutSeconds
    )

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $DockerExecutable
    $startInfo.Arguments = 'info --format "{{.ServerVersion}}"'
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $probe = New-Object System.Diagnostics.Process
    $probe.StartInfo = $startInfo
    try {
        [void]$probe.Start()
        if (-not $probe.WaitForExit($TimeoutSeconds * 1000)) {
            $probe.Kill()
            $probe.WaitForExit()
            return $false
        }
        return ($probe.ExitCode -eq 0)
    } finally {
        $probe.Dispose()
    }
}

function Get-DockerDesktopProcesses {
    return @(Get-Process -Name "Docker Desktop", "com.docker.backend" -ErrorAction SilentlyContinue)
}

function Stop-NewDockerDesktopProcesses {
    param(
        [hashtable]$BaselineProcesses,
        [datetime]$StartedAfter
    )

    $candidates = @()
    foreach ($process in @(Get-DockerDesktopProcesses)) {
        try {
            $startTicks = $process.StartTime.ToUniversalTime().Ticks
            if (-not $BaselineProcesses.ContainsKey($process.Id) -and $process.StartTime.ToUniversalTime() -ge $StartedAfter) {
                $candidates += [pscustomobject]@{
                    Id = $process.Id
                    Name = $process.ProcessName
                    StartTicks = $startTicks
                }
            }
        } catch {}
    }

    foreach ($candidate in @($candidates | Sort-Object Id -Descending)) {
        $current = Get-Process -Id $candidate.Id -ErrorAction SilentlyContinue
        if (-not $current) { continue }
        try {
            if ($current.StartTime.ToUniversalTime().Ticks -ne $candidate.StartTicks) { continue }
            Stop-Process -Id $candidate.Id -Force
            Write-Host ("Stopped Docker process started by this attempt: {0} ({1})" -f $candidate.Id, $candidate.Name) -ForegroundColor Yellow
        } catch {
            Write-Warning ("Unable to stop Docker process {0}: {1}" -f $candidate.Id, $_.Exception.Message)
        }
    }
}

$dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
if (-not $dockerCommand) {
    $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
}
if (-not $dockerCommand) {
    throw "Docker CLI is not installed or is not available on PATH."
}
$dockerExecutable = $dockerCommand.Source

if (Test-DockerDaemon -DockerExecutable $dockerExecutable -TimeoutSeconds $ProbeTimeoutSeconds) {
    Write-Host "Docker daemon is ready." -ForegroundColor Green
    return
}

$dockerDesktopCandidates = @()
if ($env:ProgramFiles) {
    $dockerDesktopCandidates += (Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe")
}
if (${env:ProgramFiles(x86)}) {
    $dockerDesktopCandidates += (Join-Path ${env:ProgramFiles(x86)} "Docker\Docker\Docker Desktop.exe")
}
if ($env:LOCALAPPDATA) {
    $dockerDesktopCandidates += (Join-Path $env:LOCALAPPDATA "Docker\Docker Desktop.exe")
}
$dockerDesktopPath = @($dockerDesktopCandidates | Where-Object { Test-Path -LiteralPath $_ })[0]
if (-not $dockerDesktopPath) {
    throw "Docker daemon is unavailable and Docker Desktop could not be found."
}

$baselineProcesses = @{}
foreach ($process in @(Get-DockerDesktopProcesses)) {
    try {
        $baselineProcesses[$process.Id] = $process.StartTime.ToUniversalTime().Ticks
    } catch {}
}

$launchStartedAt = [DateTime]::UtcNow.AddSeconds(-2)
if ($baselineProcesses.Count -eq 0) {
    $desktopProcess = Start-Process -FilePath $dockerDesktopPath -PassThru -WindowStyle Hidden
    Write-Host ("Started Docker Desktop process {0}; waiting up to {1}s for the daemon." -f $desktopProcess.Id, $StartupTimeoutSeconds) -ForegroundColor Yellow
} else {
    Write-Host ("Docker Desktop is already starting; waiting up to {0}s for the daemon without launching another instance." -f $StartupTimeoutSeconds) -ForegroundColor Yellow
}

$deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
do {
    if (Test-DockerDaemon -DockerExecutable $dockerExecutable -TimeoutSeconds $ProbeTimeoutSeconds) {
        Write-Host "Docker daemon is ready." -ForegroundColor Green
        return
    }
    Start-Sleep -Seconds 3
} while ([DateTime]::UtcNow -lt $deadline)

if ($StopStartedProcessesOnFailure) {
    Stop-NewDockerDesktopProcesses -BaselineProcesses $baselineProcesses -StartedAfter $launchStartedAt
}

throw ("Docker Desktop did not become ready within {0}s." -f $StartupTimeoutSeconds)
