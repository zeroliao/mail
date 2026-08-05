<#
.SYNOPSIS
    Starts stop.ps1 in a process detached from the MailOps backend tree.
#>
param(
    [ValidateRange(250, 5000)]
    [int]$DelayMilliseconds = 1200
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Get-Item $PSScriptRoot).FullName
$StopScript = Join-Path $ProjectRoot "stop.ps1"
$PowerShellExecutable = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

if (-not (Test-Path -LiteralPath $StopScript)) {
    throw "stop.ps1 was not found."
}

$stopArguments = @(
    "-NoLogo",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $StopScript,
    "-DelayMilliseconds",
    [string]$DelayMilliseconds
)

Start-Process -FilePath $PowerShellExecutable -ArgumentList $stopArguments -WorkingDirectory $ProjectRoot -WindowStyle Hidden | Out-Null
