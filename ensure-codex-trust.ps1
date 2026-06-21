<#
.SYNOPSIS
    Ensure the current project directory is trusted by Codex (skip the first-run
    "Do you trust the contents of this directory?" prompt for every team member).
.DESCRIPTION
    Codex persists trusted projects in ~/.codex/config.toml as
    [projects.'<path>'] tables with trust_level = "trusted", and matches by exact
    path string. Golutra launches each agent terminal with its cwd as the Windows
    8.3 short name (e.g. ADMINI~1), which never matches a long-name trust entry,
    so every agent re-prompts. This script idempotently adds trust entries for
    BOTH the short-name and long-name forms of the project dir, so no member ever
    sees the trust prompt regardless of how its cwd is presented.

    Idempotent: running it repeatedly only adds missing entries; existing ones are
    left untouched.
.PARAMETER ProjectDir
    Directory to trust. Defaults to this script's own directory.
#>
param(
    [string]$ProjectDir = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

function Write-TrustLog { param([string]$Msg) Write-Host ("    [trust] " + $Msg) -ForegroundColor DarkCyan }

# Resolve Codex home (env override wins, else ~/.codex).
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE ".codex" }
$configPath = Join-Path $codexHome "config.toml"

if (-not (Test-Path $codexHome)) {
    New-Item -ItemType Directory -Path $codexHome -Force | Out-Null
}
if (-not (Test-Path $configPath)) {
    New-Item -ItemType File -Path $configPath | Out-Null
}

# Compute path variants: long name + 8.3 short name, both as-cased and lowercase.
$fso = New-Object -ComObject Scripting.FileSystemObject
$longPath = (Get-Item $ProjectDir).FullName
$shortPath = $fso.GetFolder($longPath).ShortPath

$variants = @(
    $longPath,
    $longPath.ToLower(),
    $shortPath,
    $shortPath.ToLower()
) | Select-Object -Unique

# Read existing config once.
$content = Get-Content $configPath -Raw -ErrorAction SilentlyContinue
if ($null -eq $content) { $content = "" }

$added = @()
foreach ($p in $variants) {
    # TOML table header uses single-quoted (literal) key; backslashes are fine inside.
    $header = "[projects.'" + $p + "']"
    # Match the exact header line (escape regex metachars in the path).
    $escaped = [regex]::Escape($header)
    if ($content -notmatch ("(?m)^" + $escaped + "\s*$")) {
        $block = "`r`n" + $header + "`r`ntrust_level = `"trusted`"`r`n"
        Add-Content -Path $configPath -Value $block -Encoding utf8
        $added += $p
    }
}

if ($added.Count -gt 0) {
    Write-TrustLog ("added trust entries for: " + ($added -join ", "))
} else {
    Write-TrustLog "project already trusted (all path variants present)"
}
