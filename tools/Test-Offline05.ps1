# Original inputs only; never invokes an installed exporter or private reader.
[CmdletBinding()]param()
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
Push-Location $repo
try{
 & node --test tests/Test-CodeWalkerXml05.mjs tests/Test-CodeWalkerXmlPipeline05.mjs tests/Test-CodeWalkerXmlReview05.mjs tests/Test-XmlEvidenceReview05.mjs tests/Test-XmlViewReview05.mjs tests/Test-XmlViewOrchestrationReview05.mjs tests/Test-XmlReferenceVerifier05.mjs tests/Test-XmlBuildingView05.mjs tests/Test-SourcePreparation05.mjs tests/Test-XmlAcoustics05.mjs
 if($LASTEXITCODE-ne0){throw 'WORLD05 portable XML/cache/PCM/source/view controls failed'}
 & (Join-Path $PSScriptRoot 'Test-Offline042.ps1')
 if(!$?){throw 'Inherited WORLD04.2 offline suite failed'}
 $suffix=[guid]::NewGuid().ToString('N')
 $metadataTests=Join-Path $repo ('.local/world05-tool-metadata-tests-'+$suffix)
 $syntheticPowerShell=Join-Path $PSHOME 'pwsh.exe'
 & $syntheticPowerShell -NoProfile -NonInteractive -File (Join-Path $repo 'tests/Test-ToolMetadata05.ps1') -OutputRoot $metadataTests
 $metadataTestExit=$LASTEXITCODE
 if($metadataTestExit-ne0){throw 'WORLD05 original synthetic PE metadata controls failed'}
 $metadataControlResults=@(Get-Content -LiteralPath (Join-Path $metadataTests 'result.json') -Raw|ConvertFrom-Json)
 if($metadataControlResults.Count-ne22-or@($metadataControlResults|Where-Object {!$_.passed-or!$_.sourceOnlyOriginalFixture-or$_.gameFilesRead-or$_.audioEndpointOpened}).Count-ne0){throw 'WORLD05 synthetic PE metadata terminal evidence missing or incomplete'}
 $build=Join-Path $repo ('.local/world05-supervisor-'+$suffix)
 $runtime=Join-Path $repo ('.local/world05-node-'+$suffix)
 & (Join-Path $PSScriptRoot 'world05-build-contained.ps1') -OutputRoot $build
 if(!$?){throw 'WORLD05 supervisor original build failed'}
 & (Join-Path $PSScriptRoot 'Prepare-NgRuntime041.ps1') -OutputRoot $runtime
 if(!$?){throw 'Pinned public portable runtime preparation failed'}
 $oldSupervisor=$env:RICHAUDIO_XML05_SUPERVISOR;$oldRuntime=$env:RICHAUDIO_XML05_RUNTIME
 try{
  $env:RICHAUDIO_XML05_SUPERVISOR=Join-Path $build 'world05-contained.exe';$env:RICHAUDIO_XML05_RUNTIME=Join-Path $runtime 'node.exe'
  & node --test tests/Test-XmlContainment05.mjs tests/Test-XmlContainmentReview05.mjs
  if($LASTEXITCODE-ne0){throw 'WORLD05 original contained XML and independent controls failed'}
 }finally{$env:RICHAUDIO_XML05_SUPERVISOR=$oldSupervisor;$env:RICHAUDIO_XML05_RUNTIME=$oldRuntime}
 $profile=Join-Path $repo ('.local/world-03/world05-reference-profile-'+$suffix)
 $reference=Join-Path $repo ('.local/world-03/world05-reference-'+$suffix)
 & (Join-Path $PSScriptRoot 'Prepare-CodeWalkerPublicProfile03.ps1') -OutputRoot $profile
 if(!$?){throw 'Fresh public reference profile failed'}
 $legacy=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
 & $legacy -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Test-CodeWalkerXmlReference05.ps1') -ProfileRoot (Join-Path $profile 'profile') -OutputRoot $reference
 if($LASTEXITCODE-ne0){throw 'Fresh original actual-XML oracle failed'}
 $referenceParser=(Get-Content -LiteralPath (Join-Path $profile 'profile/profile.json') -Raw|ConvertFrom-Json).parserSha256
 & node (Join-Path $PSScriptRoot 'Test-CodeWalkerXmlReference05.mjs') --reference (Join-Path $reference 'reference.json') --parser-sha256 $referenceParser
 if($LASTEXITCODE-ne0){throw 'Fresh CodeWalker/Node XML cross-check failed'}
 foreach($variant in @(@{name='corner';x=0;w=2},@{name='east';x=40;w=2},@{name='wide';x=0;w=3})){
  & $legacy -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'New-CodeWalkerBuildingFixture05.ps1') -ProfileRoot (Join-Path $profile 'profile') -OutputRoot (Join-Path $repo ('.local/world-03/world05-fixture-'+$variant.name+'-'+$suffix)) -PositionX $variant.x -HalfWidth $variant.w
  if($LASTEXITCODE-ne0){throw 'Actual-format original closed-building fixture regeneration failed'}
 }
 & git diff --check
 if($LASTEXITCODE-ne0){throw 'Whitespace check failed'}
 Write-Output 'PASS WORLD05 offline suite: bounded actual XML, existing cache/scene/solver/stock PCM/SoundMap, explicit source preparation and contained-worker regressions. No genuine-resource or endpoint proof.'
}finally{Pop-Location}
