#requires -Version 7.0
[CmdletBinding()]
param([string]$OutputRoot='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-15/journal-profile-fixture-'+[Guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot);$parent=[IO.Path]::GetFullPath((Join-Path $repo '.local/playable-15'))
if([IO.Path]::GetDirectoryName($output)-cne$parent-or[IO.Path]::GetFileName($output)-notmatch'^journal-profile-fixture-[a-f0-9]{32}$'-or(Test-Path -LiteralPath $output)){throw 'New private15 journal-profile-fixture-GUID required.'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output refused.'}}
[IO.Directory]::CreateDirectory($output)|Out-Null
$relative=@('src/acoustics/host/Handoff/ShvOperatingStateHandoff.cs','src/acoustics/host/Handoff/TrustedShvComposition.cs','src/acoustics/host/Handoff/ShvProducerModule.cs','src/acoustics/host/Handoff/ShvClockCalibration.cs','src/acoustics/host/Handoff/ShvHandoffConsumer.cs','src/acoustics/host/Handoff/ShvGameplayFrameAdapter.cs','src/acoustics/host/Transport/ListenerProtocol.cs','src/acoustics/host/Transport/GameplayProtocol.cs','src/acoustics/host/Transport/StatePipe.cs','src/acoustics/host/Transport/PipeDeadline.cs','src/acoustics/bridge/Rph/ShvHandoffBootstrap.Rph.cs','src/acoustics/bridge/Rph/ShvHandoffJournal.Rph.cs','tests/host/TestShvJournalProfile15.cs')
$pins=@($relative|ForEach-Object{[ordered]@{name=$_;sha256=(Hash (Join-Path $repo $_))}})
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if((Hash $compiler)-cne'46809206887326d2d24db1eff1f3064de972c3451abe766b49111450a5e08e00'){throw 'Reviewed compiler pin differs.'}
$cases=@()
foreach($profile in @(15,14,13,12)){
 $dir=Join-Path $output ('profile-'+$profile);$workspace=Join-Path $dir 'fixture-workspace';[IO.Directory]::CreateDirectory($workspace)|Out-Null
 $binary=Join-Path $dir 'RichAudio.ShvJournalProfile.Tests.exe';$policy=Join-Path $dir 'ShvHandoffBuildPolicy.fixture.cs'
 $values=[ordered]@{WorkspaceRoot=$workspace;GamePath=$binary;GameSha256=('1'*64);GameVersion='fixture';ShvPath=(Join-Path $workspace 'fixture-shv');ShvSha256=('2'*64);LoaderPath=(Join-Path $workspace 'fixture-loader');LoaderSha256=('3'*64);ProducerPath=(Join-Path $workspace 'fixture-producer');ProducerSha256=('5'*64);LeasePath=(Join-Path $workspace 'Plugins/RichAudio.ShvHandoff.json')}
 $lines=@('namespace RichAudio.Beacon.Handoff { internal static class ShvHandoffBuildPolicy {');foreach($key in $values.Keys){$lines+='internal const string '+$key+' = @"'+$values[$key].Replace('"','""')+'";'};$lines+='} }';[IO.File]::WriteAllLines($policy,$lines,[Text.UTF8Encoding]::new($false))
 $defines='SHV_HANDOFF_09';if($profile-eq15){$defines+=',SHV_HANDOFF_13,SHV_HANDOFF_14,SHV_HANDOFF_15'}elseif($profile-eq14){$defines+=',SHV_HANDOFF_13,SHV_HANDOFF_14'}elseif($profile-eq13){$defines+=',SHV_HANDOFF_13'}
 $log=@(& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 ('/define:'+$defines) /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll /main:TestShvJournalProfile15 ('/out:'+$binary) @($relative|ForEach-Object{Join-Path $repo $_}) $policy 2>&1)
 $log|Set-Content -LiteralPath (Join-Path $dir 'build.log') -Encoding utf8
 if($LASTEXITCODE-ne0){throw ('Actual profile journal compilation failed: '+($log-join[Environment]::NewLine))}
 $raw=@(& $binary);if($LASTEXITCODE-ne0-or$raw.Count-ne1){throw ('Actual journal profile fixture failed: '+$profile)};$result=$raw[0]|ConvertFrom-Json
 if(!$result.passed-or$result.profile-cne('PLAYABLE-'+$profile)-or$result.nativeModuleAttached-or$result.gameExecuted-or$result.endpointOpened-or$result.audioPlayback){throw 'Fixture boundary/result mismatch.'}
 $cases+=[ordered]@{profile=$result.profile;assertions=$result.assertions;result=$result;binaryPath=$binary;binarySha256=(Hash $binary);fixturePolicySha256=(Hash $policy);defines=$defines}
 foreach($pin in $pins){if((Hash (Join-Path $repo $pin.name))-cne$pin.sha256){throw 'Compiled source changed during journal profile fixture.'}}
 Write-Output ('PASS actual '+$result.profile+' bootstrap/journal profile; '+$result.assertions+' assertions')
}
$oldDiagnosis=Join-Path $repo '.local/playable-15/reviews/startup-argument-diagnosis/diagnosis.json'
$report=[ordered]@{schema=1;profile='PLAYABLE-15';kind='actual-bootstrap-journal-profile-construction-and-completion';passed=$true;cases=$cases.Count;assertions=($cases.assertions|Measure-Object -Sum).Sum;caseResults=$cases;sources=$pins;compilerSha256=(Hash $compiler);runnerSha256=(Hash $PSCommandPath);oldSealedReproduction=[ordered]@{path=$oldDiagnosis;sha256=(Hash $oldDiagnosis)};actualConfigurationExecuted=$true;actualJournalWriterExecuted=$true;fixturePolicyIsNotProductionPolicy=$true;nativeModuleAttached=$false;nativeExportsInvoked=$false;gameExecuted=$false;gameFilesWritten=$false;endpointOpened=$false;audioPlayback=$false;limits='Actual production Configuration and journal constructors, event writer, final summary and bounded completion under explicit isolated fixture policy. No RPH/SDK or native-module attachment. Old exact sealed passive mismatch reproduction is preserved separately; this is not a live retry.'}
$path=Join-Path $output 'validation.json';$report|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $path -Encoding utf8
Write-Output ('PASS '+$cases.Count+' profiles / '+$report.assertions+' assertions; '+$path)
