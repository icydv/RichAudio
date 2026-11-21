# Additive WORLD04.2 regressions. Original inputs only; inherited runner/core
# remain unchanged. No real exports, saved ciphertext, keys or game are read.
[CmdletBinding()]param()
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
Push-Location $repo
try{
 & node --test tests/Test-NgReadiness042.mjs tests/Test-SuppliedBuilding042.mjs tests/Test-SuppliedBuildingView042.mjs tests/Test-SuppliedBuildingReview042.mjs tests/Test-AcousticBudget042.mjs
 if($LASTEXITCODE-ne0){throw 'WORLD04.2 original readiness/import/viewer/PCM/continuity controls failed'}
 & (Join-Path $PSScriptRoot 'Test-Offline.ps1')
 if(!$?){throw 'Inherited offline runner failed'}
 $suffix=[guid]::NewGuid().ToString('N')
 $public=Join-Path $repo ('.local/world-03/world042-xml-profile-'+$suffix)
 $fixture=Join-Path $repo ('.local/world-03/world042-xml-fixtures-'+$suffix)
 $roundtrip=Join-Path $repo ('.local/world-03/world042-xml-roundtrip-'+$suffix)
 & (Join-Path $PSScriptRoot 'Prepare-CodeWalkerPublicProfile03.ps1') -OutputRoot $public
 $legacy=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
 & $legacy -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Test-StaticResources03.ps1') -ProfileRoot (Join-Path $public 'profile') -OutputRoot $fixture
 if($LASTEXITCODE-ne0){throw 'Original actual-format XML source fixtures failed'}
 & $legacy -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Test-CodeWalkerXml042.ps1') -ProfileRoot (Join-Path $public 'profile') -FixtureRoot $fixture -OutputRoot $roundtrip
 if($LASTEXITCODE-ne0){throw 'Pinned original XML export/semantic/security checks failed'}
 & git diff --check
 if($LASTEXITCODE-ne0){throw 'Whitespace check failed'}
 Write-Output 'PASS WORLD04.2 offline suite: 31 portable controls, 18 original XML exports, 36 static DTO roundtrips and five XML rejection controls; no real-resource or endpoint proof.'
}finally{Pop-Location}
