[CmdletBinding()]param([Parameter(Mandatory)][string]$SupervisorRoot,[Parameter(Mandatory)][string]$RuntimeRoot,[Parameter(Mandatory)][string]$OutputLog)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$previousSupervisor=$env:RICHAUDIO_NG041_SUPERVISOR;$previousRuntime=$env:RICHAUDIO_NG041_RUNTIME;$previousCleanupHelper=$env:RICHAUDIO_CLEANUP13_HELPER
try{
 $cleanupBuild=Join-Path ([IO.Path]::GetFullPath($SupervisorRoot)) 'cleanup13'
 & (Join-Path $PSScriptRoot 'Build-RuntimeCleanup13.ps1') -OutputRoot $cleanupBuild
 $env:RICHAUDIO_CLEANUP13_HELPER=Join-Path $cleanupBuild 'runtime-cleanup13.exe'
 $env:RICHAUDIO_NG041_SUPERVISOR=[IO.Path]::GetFullPath((Join-Path $SupervisorRoot 'world041-contained.exe'))
 $env:RICHAUDIO_NG041_RUNTIME=[IO.Path]::GetFullPath((Join-Path $RuntimeRoot 'node.exe'))
 & node --test (Join-Path $repo 'tests/Test-NgContained041.mjs') *> $OutputLog
 $code=$LASTEXITCODE;Get-Content -LiteralPath $OutputLog
 if($code-ne0){throw 'Contained NG synthetic decoder/probe controls failed; see retained log'}
}finally{$env:RICHAUDIO_NG041_SUPERVISOR=$previousSupervisor;$env:RICHAUDIO_NG041_RUNTIME=$previousRuntime;$env:RICHAUDIO_CLEANUP13_HELPER=$previousCleanupHelper}
