#requires -Version 7.0
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo ('.local/playable-12/rph-compatibility-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if(!(Test-Path -LiteralPath $compiler -PathType Leaf)){throw 'Existing .NET Framework x64 C# compiler required; nothing is installed.'}
$relative=@('src/acoustics/bridge/Rph/RphHandoffCompatibility.Rph.cs','src/acoustics/bridge/Rph/ShvPassiveHandoff.Rph.cs',
 'src/acoustics/bridge/Rph/ShvHandoffSampler.Rph.cs','tests/rph-compatibility/FakeRph.cs',
 'tests/rph-compatibility/FixtureHarness.cs','tests/rph-compatibility/FixtureLoader.cs',
 'tests/rph-compatibility/SamplerSupport.cs','tests/rph-compatibility/Launcher.cs')
$pins=@($relative|ForEach-Object{[ordered]@{name=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo $_)).Hash.ToLowerInvariant()}})
$loader=Join-Path $out 'FixtureLoader.exe'
& $compiler /nologo /target:exe /optimize+ /warnaserror+ /langversion:5 /platform:x64 ('/out:'+$loader) (Join-Path $repo 'tests/rph-compatibility/FixtureLoader.cs')
if($LASTEXITCODE-ne0){throw 'Fixture loader compile failed.'}
$matrix=@(
 @{name='normal';define='';sampler=$true},
 @{name='extra-bytes';define='EXTRA_BYTES'},
 @{name='unknown-version';define='UNKNOWN_VERSION'},
 @{name='memory';define=''},
 @{name='reject-missing-engine';define='MISSING_ENGINE'},
 @{name='reject-wrong-counter';define='WRONG_COUNTER'},
 @{name='reject-wrong-vector';define='WRONG_VECTOR'},
 @{name='reject-wrong-paused';define='WRONG_PAUSED'},
 @{name='reject-wrong-native';define='WRONG_NATIVE'}
)
$runs=@();$cases=0;$assertions=0
foreach($case in $matrix){
 $dir=Join-Path $out $case.name;[IO.Directory]::CreateDirectory($dir)|Out-Null
 $api=Join-Path $dir 'RageFixture.dll';$harness=Join-Path $dir 'FixtureHarness.dll';$launcher=Join-Path $dir 'LauncherFixture.dll'
 $apiArgs=@('/nologo','/target:library','/optimize+','/warnaserror+','/langversion:5','/platform:x64',('/out:'+$api))
 if($case.define){$apiArgs+=('/define:'+$case.define)}
 & $compiler @apiArgs (Join-Path $repo 'tests/rph-compatibility/FakeRph.cs')
 if($LASTEXITCODE-ne0){throw ('Fake API compile failed: '+$case.name)}
 & $compiler /nologo /target:library /optimize+ /warnaserror+ /langversion:5 /platform:x64 ('/out:'+$launcher) (Join-Path $repo 'tests/rph-compatibility/Launcher.cs')
 if($LASTEXITCODE-ne0){throw 'Separate launcher fixture compile failed.'}
 $defines='SHV_HANDOFF_09'
 $sources=@((Join-Path $repo 'src/acoustics/bridge/Rph/RphHandoffCompatibility.Rph.cs'),(Join-Path $repo 'tests/rph-compatibility/FixtureHarness.cs'))
 if($case.sampler){$defines+=',SAMPLER_TESTS';$sources+=@((Join-Path $repo 'src/acoustics/bridge/Rph/ShvHandoffSampler.Rph.cs'),(Join-Path $repo 'tests/rph-compatibility/SamplerSupport.cs'))}
 & $compiler /nologo /target:library /optimize+ /warnaserror+ /langversion:5 /platform:x64 /r:System.Web.Extensions.dll ('/r:'+$api) ('/define:'+$defines) ('/out:'+$harness) @sources
 if($LASTEXITCODE-ne0){throw ('Source-identical compatibility harness compile failed: '+$case.name)}
 $raw=@(& $loader $api $harness $case.name)
 if($LASTEXITCODE-ne0-or$raw.Count-ne1){throw ('Compiled compatibility fixture failed: '+$case.name)}
 $result=$raw[0]|ConvertFrom-Json
 if(!$result.passed-or!$result.fixtureOnly-or$result.actualRphRuntimeExecuted-or$result.actualShvRuntimeExecuted-or$result.gameLaunched-or$result.endpointOpened-or$result.audioPlayed){throw 'Fixture boundary failed.'}
 $cases+=[int]$result.cases;$assertions+=[int]$result.assertions
 $runs+=@([ordered]@{scenario=$case.name;cases=$result.cases;assertions=$result.assertions;casesPassed=$result.casesPassed;apiSha256=$result.apiSha256;apiFileVersion=$result.apiFileVersion})
}
$normal=@($runs|Where-Object scenario -eq normal)[0];$extra=@($runs|Where-Object scenario -eq extra-bytes)[0]
if($normal.apiSha256-eq$extra.apiSha256-or$normal.apiFileVersion-ne$extra.apiFileVersion){throw 'Same-version/different-API-byte fixtures were not distinct.'}

# Static entry controls are reported separately from compiled fixture cases.
$entry=Get-Content -LiteralPath (Join-Path $repo 'src/acoustics/bridge/Rph/ShvPassiveHandoff.Rph.cs') -Raw
$compatibility=Get-Content -LiteralPath (Join-Path $repo 'src/acoustics/bridge/Rph/RphHandoffCompatibility.Rph.cs') -Raw
$sampler=Get-Content -LiteralPath (Join-Path $repo 'src/acoustics/bridge/Rph/ShvHandoffSampler.Rph.cs') -Raw
function Test-SourceOrder([string]$Text,[string]$First,[string]$Second){
 $firstAt=$Text.IndexOf($First);$secondAt=$Text.IndexOf($Second)
 return ($firstAt -ge 0 -and $secondAt -ge 0 -and $firstAt -lt $secondAt)
}
$checks=[ordered]@{}
$checks.compatibilityBeforeAttachmentAndOpen=(Test-SourceOrder $entry 'RphHandoffCompatibility.Inspect()' 'ShvProducerModule.AttachLoaded(') -and (Test-SourceOrder $entry 'Need(compatibility.Compatible,compatibility.Reason)' 'ShvProducerModule.AttachLoaded(')
$checks.privateCompatibilityJournalBeforeOpen=(Test-SourceOrder $entry 'journal.WriteEvent("rph-compatibility"' 'module.OpenSession(') -and (Test-SourceOrder $entry 'journal=new ShvHandoffJournal(' 'module.OpenSession(')
$checks.noLauncherApiEqualityGate=$entry -notmatch 'config\.Scope\.Rph|rphRuntimeHash\s*==|rphRuntimeVersion\s*==|actual-rph-runtime-bytes-or-version-unreviewed'
$checks.noExpectedDistributionPolicy=$compatibility -notmatch 'config\.Scope|expected|Whitelist|Reviewed|RphSha256|RphVersion'
$checks.noRpmFallback=($entry+$compatibility+$sampler) -notmatch 'EngineRevolutionsRatio|CallByHash|F9DDA40BC293A61E'
$checks.noAudioOrEndpointStart=$entry -notmatch 'new GameplayRuntime|new GameplayPublisher|new WindowsHost|(?:SoundMap|Recording)\w*\s*\.\s*Start\s*\('
$checks.retirementBeforeSourceStop=(Test-SourceOrder $entry 'composition.Retire(' 'module.Stop()') -and (Test-SourceOrder $entry 'sampler.Retire()' 'module.Stop()')
$checks.sourceOpenBindBeginOrder=(Test-SourceOrder $entry 'module.OpenSession(' 'composition.TryBind(') -and (Test-SourceOrder $entry 'composition.TryBind(' 'composition.Begin()')
$checks.samplerRetainsBatiLifetimeAndPose=$sampler -match 'model!=H.BatiModel' -and $sampler -match 'VehicleCounter' -and $sampler -match 'rph-post-pose-relationship-changed' -and $sampler -match 'rph-peer-acquisition-over-budget'
$checks.sameConditionalIsolation=$entry.StartsWith('#if SHV_HANDOFF_09') -and $compatibility.StartsWith('#if SHV_HANDOFF_09')
foreach($name in $checks.Keys){if(!$checks[$name]){throw ('Static entry/scope control failed: '+$name)}}
foreach($pin in $pins){if((Get-FileHash -LiteralPath (Join-Path $repo $pin.name)).Hash.ToLowerInvariant()-ne$pin.sha256){throw 'Source changed during validation.'}}
$artifacts=@(Get-ChildItem -LiteralPath $out -Recurse -File|Where-Object {$_.Extension -in '.dll','.exe' -or $_.Name -like '*.dll.retained'}|ForEach-Object{[ordered]@{name=[IO.Path]::GetRelativePath($out,$_.FullName);bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant()}})
$receipt=[ordered]@{schema=1;profile='PLAYABLE-12';kind='functional-rph-compatibility-compiled-fixtures';runtimePolicy='functional-compatibility';passed=$true;
 cases=$cases;assertions=$assertions;scenarios=$runs;staticSourceControlCount=$checks.Count;staticSourceControls=$checks;sources=$pins;artifacts=$artifacts;
 compilerSha256=(Get-FileHash -LiteralPath $compiler).Hash.ToLowerInvariant();runnerSha256=(Get-FileHash -LiteralPath $PSCommandPath).Hash.ToLowerInvariant();
 fixtureOnly=$true;actualCompatibilityImplementationExecuted=$true;actualSamplerImplementationExecuted=$true;actualRphRuntimeExecuted=$false;actualShvRuntimeExecuted=$false;
 gameLaunched=$false;gameFilesWritten=$false;endpointOpened=$false;audioPlayed=$false;liveHandoffReady=$false;
 limits='Source-identical functional checker and unchanged sampler run against harmless separately compiled CLR API fakes only. Real RPH API getters/natives, actual SHV producer, game loading, real cross-framework correspondence and audibility are not established. Entry Open/BEGIN order is static source evidence, not executed production-entry evidence. Metadata/hash capture is best effort and not authentication or loaded-memory proof.'}
$path=Join-Path $out 'validation.json';$receipt|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $path -Encoding utf8
Write-Output ('PASS '+$cases+' cases / '+$assertions+' assertions; '+$checks.Count+' static controls; '+$path)
