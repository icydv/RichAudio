# Original declared-world startup tests plus the preserved inherited suite.
[CmdletBinding()]param()
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
Push-Location $repo
try{
 $cases=@(Get-ChildItem -LiteralPath (Join-Path $repo 'tests') -Filter 'Test-*06.mjs' -File | Sort-Object Name | ForEach-Object FullName)
 if($cases.Count-lt4){throw 'WORLD06 startup/storage/coverage/acceptance cases missing'}
 & node --test @cases
 if($LASTEXITCODE-ne0){throw 'WORLD06 startup-prewarming controls failed'}
 & (Join-Path $PSScriptRoot 'Test-Offline05.ps1')
 if(!$?){throw 'Inherited WORLD05 offline suite failed'}
 & git diff --check
 if($LASTEXITCODE-ne0){throw 'WORLD06 whitespace check failed'}
 Write-Output 'PASS WORLD06 original declared-world startup prewarming; unvisited tile persisted before first visit. No installed-world or live loading-screen qualification.'
}finally{Pop-Location}
