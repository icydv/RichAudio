#requires -Version 7.0
# Fresh public-source/original-fixture validation by default. No installed
# resources, external CodeWalker application, private key source or audio IO.
[CmdletBinding()]
param(
 [string]$OutputRoot,
 [string]$PublicPreparationRoot,
 [string]$BuildRoot,
 [string]$SupervisorBuildRoot,
 [string]$PackageRoot,
 [string]$FixtureRoot,
 [string]$CompilerPath,
 [string]$NodePath
)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
if(!$IsWindows){throw 'WORLD08 actual native controls require Windows; skips are not acceptance'}
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Local([string]$p,[bool]$fresh=$false){
 if(![IO.Path]::IsPathRooted($p)){$p=Join-Path $repo $p};$p=[IO.Path]::GetFullPath($p);$ok=@('.local','build')|Where-Object{$p.StartsWith([IO.Path]::GetFullPath((Join-Path $repo $_))+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)}
 if(!$ok){throw 'Current-checkout public/original build roots only'}
 for($at=$p;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked offline build/test path refused'}}
 if($fresh-and(Test-Path -LiteralPath $p)){throw 'Fresh offline result root required; earlier evidence is retained'}
 return $p
}
function Stage([string]$name,[scriptblock]$work){Write-Output ('WORLD08 '+$name);& $work;if(!$?){throw ('WORLD08 stage failed: '+$name)}}
$id=[guid]::NewGuid().ToString('N')
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/world08-offline-'+$id)}
$output=Local $OutputRoot $true
foreach($p in @($PublicPreparationRoot,$BuildRoot,$SupervisorBuildRoot,$PackageRoot,$FixtureRoot)){if($p){[void](Local $p)}}
[IO.Directory]::CreateDirectory($output)|Out-Null
$freshPublic=$false;$freshCore=$false;$freshWorker=$false;$freshFixtures=$false;$freshPackage=$false;$coreControls=$null
$environment=@{}
foreach($name in @('RICHAUDIO_PROVIDER08_PACKAGE','RICHAUDIO_PROVIDER08_FIXTURES')){$environment[$name]=@{exists=(Test-Path -LiteralPath ('Env:'+$name));value=[Environment]::GetEnvironmentVariable($name,'Process')}}
Push-Location $repo
try{
 if(!$BuildRoot){
  if(!$PublicPreparationRoot){$PublicPreparationRoot=Join-Path $repo ('.local/world-03/world08-offline-public-'+$id);Stage 'fresh pinned public C# and public dependency preparation' {& (Join-Path $PSScriptRoot 'Prepare-CodeWalkerPublicProfile03.ps1') -OutputRoot $PublicPreparationRoot -CompilerPath $CompilerPath};$freshPublic=$true}
  Stage 'two fresh full Core builds and original API/bounds controls' {& (Join-Path $PSScriptRoot 'Test-CodeWalkerProviderBuild08.ps1') -OutputRoot (Join-Path $output 'core-repro') -PublicPreparationRoot $PublicPreparationRoot -CompilerPath $CompilerPath};$freshCore=$true
  $coreResult=Get-Content -LiteralPath (Join-Path $output 'core-repro/result.json') -Raw|ConvertFrom-Json
  if(!$coreResult.passed-or!$coreResult.byteIdenticalCoreBuilds-or$coreResult.originalApiControls-lt23-or$coreResult.sourceFiles-ne114){throw 'Expected complete full Core API/reproducibility evidence missing'};$coreControls=$coreResult.originalApiControls
  $BuildRoot=Join-Path $output 'worker'
  Stage 'fresh actual headless worker build' {& (Join-Path $PSScriptRoot 'Build-CodeWalkerProvider08.ps1') -OutputRoot $BuildRoot -PublicPreparationRoot $PublicPreparationRoot -CompilerPath $CompilerPath};$freshWorker=$true
 }else{$BuildRoot=Local $BuildRoot}
 if(!$FixtureRoot){$FixtureRoot=Join-Path $output 'fixtures';Stage 'original native RPF/RSC/CacheDat/PSO plus synthetic NG/AES fixtures' {& (Join-Path $PSScriptRoot 'New-CodeWalkerProviderFixtures08.ps1') -BuildRoot $BuildRoot -OutputRoot $FixtureRoot};$freshFixtures=$true}else{$FixtureRoot=Local $FixtureRoot}
 if(!$PackageRoot){
  if(!$SupervisorBuildRoot){$SupervisorBuildRoot=Join-Path $output 'supervisor';Stage 'fresh independently contained companion supervisor' {& (Join-Path $PSScriptRoot 'Build-ProviderSupervisor08.ps1') -OutputRoot $SupervisorBuildRoot -CompilerPath $CompilerPath}}
  Stage 'integrated companion package with official Node and notices' {& (Join-Path $PSScriptRoot 'Package-CodeWalkerProvider08.ps1') -OutputRoot (Join-Path $output 'package') -BuildRoot $BuildRoot -SupervisorBuildRoot $SupervisorBuildRoot -CompilerPath $CompilerPath -NodePath $NodePath};$PackageRoot=Join-Path $output 'package/WorldProvider08';$freshPackage=$true
 }else{$PackageRoot=Local $PackageRoot}
 Stage 'exact ZIP contents and extracted package-relative imports/CLI' {& (Join-Path $PSScriptRoot 'Test-CodeWalkerPackage08.ps1') -PackageDirectory $PackageRoot -OutputRoot (Join-Path $output 'package-validation')}
 $node=Join-Path $PackageRoot 'runtime/node.exe'
 $env:RICHAUDIO_PROVIDER08_PACKAGE=$PackageRoot;$env:RICHAUDIO_PROVIDER08_FIXTURES=$FixtureRoot
 $cases=@(Get-ChildItem -LiteralPath (Join-Path $repo 'tests') -Filter 'Test-*08.mjs' -File|Sort-Object Name|ForEach-Object FullName)
 if($cases.Count-lt6){throw 'WORLD08 companion, native, decoder, admission, discovery and progress cases missing'}
 $testLog=Join-Path $output 'world08-tests.tap'
 Stage 'all WORLD08 tests including actual contained CodeWalker; zero skips required' {
  & $node --test --test-reporter=tap --test-concurrency=1 @cases *> $testLog
  $code=$LASTEXITCODE;Get-Content -LiteralPath $testLog
  if($code-ne0){throw 'WORLD08 actual offline tests failed; raw output retained'}
 }
 $tap=Get-Content -LiteralPath $testLog -Raw
 $count=[regex]::Match($tap,'(?m)^# tests ([0-9]+)\s*$');$passed=[regex]::Match($tap,'(?m)^# pass ([0-9]+)\s*$')
 if(!$count.Success-or!$passed.Success-or[int]$count.Groups[1].Value-lt1-or[int]$passed.Groups[1].Value-ne[int]$count.Groups[1].Value-or$tap-notmatch'(?m)^# fail 0\s*$'-or$tap-notmatch'(?m)^# skipped 0\s*$'-or$tap-notmatch'(?m)^# cancelled 0\s*$'){throw 'All WORLD08 controls must pass without skipped/cancelled native cases'}
 $pipelineLog=Join-Path $output 'actual-pipeline.json'
 Stage 'actual compiled archive to existing cache/solver/SoundMap/PCM and restart' {
  & $node (Join-Path $repo 'tests/Run-CodeWalkerPipeline08.mjs') $PackageRoot $FixtureRoot (Join-Path $output 'pipeline-work') *> $pipelineLog
  $code=$LASTEXITCODE;Get-Content -LiteralPath $pipelineLog
  if($code-ne0){throw 'Actual native archive/cache/solver pipeline failed; output retained'}
 }
 $pipeline=Get-Content -LiteralPath $pipelineLog -Raw|ConvertFrom-Json
 if(!$pipeline.passed-or$pipeline.kind-cne'RichAudioActualCodeWalkerPipeline08'-or!$pipeline.dryPcmIdentical-or!$pipeline.stereoPcmDifferent-or$pipeline.conversionsOnRestart-ne0-or$pipeline.cacheHitsOnRestart-lt1-or$pipeline.installedWorldVerified-or$pipeline.endpointOpened-or$pipeline.privateInputsRead){throw 'Actual original binary pipeline evidence missing or overclaims authority'}
 Stage 'preserved inherited WORLD06 and earlier offline regression suites' {& (Join-Path $PSScriptRoot 'Test-Offline06.ps1')}
 & git diff --check
 if($LASTEXITCODE-ne0){throw 'WORLD08 whitespace check failed'}
 $packageResult=Get-Content -LiteralPath (Join-Path $output 'package-validation/result.json') -Raw|ConvertFrom-Json
 $artifact=Join-Path $output 'artifact';[IO.Directory]::CreateDirectory($artifact)|Out-Null
 Copy-Item -LiteralPath (Join-Path ([IO.Path]::GetDirectoryName($PackageRoot)) 'WorldProvider08.zip') -Destination (Join-Path $artifact 'WorldProvider08.zip')
 $result=[ordered]@{schema=1;kind='RichAudioOffline08Validation';passed=$true;tests=[int]$count.Groups[1].Value;testFiles=$cases.Count;skipped=0;freshPublicPreparation=$freshPublic;freshCoreReproducibility=$freshCore;coreOriginalApiControls=$coreControls;freshWorkerBuild=$freshWorker;freshOriginalFixtures=$freshFixtures;freshPackage=$freshPackage;testLogSHA256=Hash $testLog;actualPipelineSHA256=Hash $pipelineLog;coreSourceCommit='485d56bec00262ed7fa472261cce7bbc6202b96e';packageManifestSHA256=$packageResult.manifestSHA256;packageZIP_SHA256=$packageResult.zipSHA256;actualBinaryResources=$pipeline.resources;cacheHitsOnRestart=$pipeline.cacheHitsOnRestart;conversionsOnRestart=$pipeline.conversionsOnRestart;dryPcmIdentical=$true;stereoPcmDifferent=$true;inheritedOffline06Passed=$true;protectedBootstrapAvailable=$false;privateInputsRead=$false;installedResourcesRead=$false;endpointOpened=$false;gameLaunched=$false;deployed=$false;merged=$false}
 $json=($result|ConvertTo-Json -Depth 5)+"`n"
 [IO.File]::WriteAllText((Join-Path $output 'result.json'),$json,[Text.UTF8Encoding]::new($false));[IO.File]::WriteAllText((Join-Path $artifact 'validation.json'),$json,[Text.UTF8Encoding]::new($false))
 Write-Output ('PASS WORLD08 '+$result.tests+' actual/pure controls; zero skips; exact package ZIP; actual original binary cache/solver/PCM and inherited suites. No installed-world proof or deployment.')
}finally{
 foreach($name in $environment.Keys){if($environment[$name].exists){Set-Item -LiteralPath ('Env:'+$name) -Value $environment[$name].value}else{Remove-Item -LiteralPath ('Env:'+$name) -ErrorAction SilentlyContinue}}
 Pop-Location
}
