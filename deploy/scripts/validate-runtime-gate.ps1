param(
    [ValidateRange(10, 300)]
    [int]$DockerStartupTimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$ensureDockerScript = Join-Path $PSScriptRoot "ensure-docker-desktop.ps1"

& $ensureDockerScript `
    -StartupTimeoutSeconds $DockerStartupTimeoutSeconds `
    -StopStartedProcessesOnFailure

$bashCandidates = @()
if ($env:ProgramFiles) {
    $bashCandidates += (Join-Path $env:ProgramFiles "Git\bin\bash.exe")
    $bashCandidates += (Join-Path $env:ProgramFiles "Git\usr\bin\bash.exe")
}
if (${env:ProgramFiles(x86)}) {
    $bashCandidates += (Join-Path ${env:ProgramFiles(x86)} "Git\bin\bash.exe")
}
if ($env:LOCALAPPDATA) {
    $bashCandidates += (Join-Path $env:LOCALAPPDATA "Programs\Git\bin\bash.exe")
}
$bashExecutable = @($bashCandidates | Where-Object { Test-Path -LiteralPath $_ })[0]
if (-not $bashExecutable) {
    throw "Git Bash was not found. Install Git for Windows or run the Bash gate from another Docker-capable environment."
}

Push-Location $ProjectRoot
try {
    & $bashExecutable "deploy/scripts/validate-runtime-gate.sh"
    if ($LASTEXITCODE -ne 0) {
        throw ("Runtime gate failed with exit code {0}." -f $LASTEXITCODE)
    }
} finally {
    Pop-Location
}
