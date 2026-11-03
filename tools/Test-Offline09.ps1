#requires -Version 7.0
[CmdletBinding()]
param([string]$OutputRoot)
$ErrorActionPreference='Stop';$repo=Split-Path $PSScriptRoot -Parent
if(!$IsWindows){throw 'WORLD09 requires actual contained Windows controls, not skipped native cases'}
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/world09-offline-'+[guid]::NewGuid().ToString('N'))}
if(![IO.Path]::IsPathRooted($OutputRoot)){$OutputRoot=Join-Path $repo $OutputRoot}
$root=[IO.Path]::GetFullPath($OutputRoot)
if(!$root.StartsWith((Join-Path $repo '.local')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $root)){throw 'Fresh current-checkout .local output required'}
for($at=$root;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked output refused'}}
[IO.Directory]::CreateDirectory($root)|Out-Null
function Hash([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
$oldPackage=[Environment]::GetEnvironmentVariable('RICHAUDIO_PROVIDER08_PACKAGE');$oldFixtures=[Environment]::GetEnvironmentVariable('RICHAUDIO_PROVIDER08_FIXTURES')
Push-Location $repo
try{
 $inherited=Join-Path $root 'inherited08'
 & (Join-Path $PSScriptRoot 'Test-Offline08.ps1') -OutputRoot $inherited
 if(!$?){throw 'Preserved complete WORLD08 regression failed'}
 $package=Join-Path $inherited 'package/WorldProvider08';$env:RICHAUDIO_PROVIDER08_PACKAGE=$package;$env:RICHAUDIO_PROVIDER08_FIXTURES=Join-Path $inherited 'fixtures';$node=Join-Path $package 'runtime/node.exe'
 $cases=@(Get-ChildItem -LiteralPath (Join-Path $repo 'tests') -File -Filter 'Test-*09.mjs'|Sort-Object Name|ForEach-Object FullName)
 if($cases.Count-ne3){throw 'Expected initialization, processing and consolidated-session WORLD09 controls'}
 $tap=Join-Path $root 'world09-tests.tap'; & $node --test --test-reporter=tap --test-concurrency=1 @cases *> $tap
 $exit=$LASTEXITCODE;Get-Content -LiteralPath $tap
 $text=Get-Content -LiteralPath $tap -Raw
 if($exit-ne0-or$text-notmatch'(?m)^# fail 0\s*$'-or$text-notmatch'(?m)^# skipped 0\s*$'-or$text-notmatch'(?m)^# cancelled 0\s*$'){throw 'WORLD09 requires all controls and native integration, no skips'}
 $tests=[int]([regex]::Match($text,'(?m)^# tests ([0-9]+)\s*$').Groups[1].Value)
 $profile=Join-Path (Join-Path $repo '.local') ('world09-processing-'+[IO.Path]::GetFileName($root)+'.json'); & $node (Join-Path $repo 'tools/Profile-Processing09.mjs') --run --out $profile
 if($LASTEXITCODE-ne0){throw 'Measured original processing profile failed; preserve findings'}
 $earlier=Get-Content -LiteralPath (Join-Path $inherited 'result.json') -Raw|ConvertFrom-Json
 $artifact=Join-Path $root 'artifact';[IO.Directory]::CreateDirectory($artifact)|Out-Null
 Copy-Item -LiteralPath (Join-Path $inherited 'artifact/WorldProvider08.zip') -Destination (Join-Path $artifact 'WorldProvider08.zip')
 $result=[ordered]@{schema=1;kind='RichAudioOffline09Validation';passed=$true;world09Tests=$tests;world09Skipped=0;world09TAP_SHA256=Hash $tap;world08Tests=$earlier.tests;coreControls=$earlier.coreOriginalApiControls;fullInheritedPassed=$earlier.inheritedOffline06Passed;freshCoreReproducibility=$earlier.freshCoreReproducibility;packageZIP_SHA256=$earlier.packageZIP_SHA256;packageManifestSHA256=$earlier.packageManifestSHA256;processingSHA256=Hash $profile;genuineResourceVerified=$false;installedResourcesRead=$false;privateCapabilityRead=$false;gameLaunched=$false;endpointOpened=$false;deployed=$false;merged=$false}
 $json=($result|ConvertTo-Json -Depth 6)+"`n";[IO.File]::WriteAllText((Join-Path $root 'result.json'),$json,[Text.UTF8Encoding]::new($false));[IO.File]::WriteAllText((Join-Path $artifact 'validation.json'),$json,[Text.UTF8Encoding]::new($false))
 & git diff --check;if($LASTEXITCODE-ne0){throw 'Whitespace validation failed'}
 Write-Output ('PASS WORLD09 '+$tests+' controls zero skips; original bootstrap/NG/cache/SoundMap/PCM; all inherited regressions; measured processing retained')
}finally{
 [Environment]::SetEnvironmentVariable('RICHAUDIO_PROVIDER08_PACKAGE',$oldPackage);[Environment]::SetEnvironmentVariable('RICHAUDIO_PROVIDER08_FIXTURES',$oldFixtures);Pop-Location
}
