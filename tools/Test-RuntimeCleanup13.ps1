[CmdletBinding()]param([Parameter(Mandatory)][string]$HelperRoot,[Parameter(Mandatory)][string]$OutputLog)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$previous=$env:RICHAUDIO_CLEANUP13_HELPER
try{
 $env:RICHAUDIO_CLEANUP13_HELPER=[IO.Path]::GetFullPath((Join-Path $HelperRoot 'runtime-cleanup13.exe'))
 & node --test (Join-Path $repo 'tests/Test-RuntimeCleanup13.mjs') *> $OutputLog
 $code=$LASTEXITCODE;Get-Content -LiteralPath $OutputLog
 if($code-ne0){throw 'Original owned runtime cleanup controls failed; see retained log'}
}finally{$env:RICHAUDIO_CLEANUP13_HELPER=$previous}
