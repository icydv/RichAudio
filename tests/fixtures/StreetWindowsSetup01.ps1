# Run by Windows PowerShell 5, matching Setup.cmd. Pure configuration assembly
# against the calling test's original identities; no Setup Install is invoked.
param([string]$Repository,[string]$Manifest,[string]$InstallRoot,[string]$GameRoot,[string]$ParserRoot,[string]$PowerShell7,[string]$Output)
$ErrorActionPreference='Stop'
. (Join-Path $Repository 'tools/playable/Setup.ps1') -FunctionsOnly
$m=Read-Json $Manifest
$c=New-StreetWorldWarmupConfiguration01 $m $InstallRoot $GameRoot $ParserRoot $PowerShell7
Write-Json $Output $c
