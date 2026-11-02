#requires -Version 7.0
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$output=Join-Path $repo ('.local/playable-12/journal-validation-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$workspace=Join-Path $output 'fixture-workspace';[IO.Directory]::CreateDirectory($workspace)|Out-Null
$binary=Join-Path $output 'RichAudio.ShvHandoff.Journal.Tests.exe';$policy=Join-Path $output 'ShvHandoffBuildPolicy.fixture.cs'
$values=[ordered]@{WorkspaceRoot=$workspace;GamePath=$binary;GameSha256=('1'*64);GameVersion='fixture';ShvPath=(Join-Path $workspace 'fixture-shv');ShvSha256=('2'*64);LoaderPath=(Join-Path $workspace 'fixture-loader');LoaderSha256=('3'*64);RphPath=(Join-Path $workspace 'fixture-rph');RphSha256=('4'*64);RphVersion='fixture';ProducerPath=(Join-Path $workspace 'fixture-producer');ProducerSha256=('5'*64);LeasePath=(Join-Path $workspace 'Plugins/RichAudio.ShvHandoff.json')}
$lines=@('namespace RichAudio.Beacon.Handoff { internal static class ShvHandoffBuildPolicy {');foreach($key in $values.Keys){$lines+='internal const string '+$key+' = @"'+$values[$key].Replace('"','""')+'";'};$lines+='} }';$lines|Set-Content -LiteralPath $policy -Encoding utf8
$sources=@('src/acoustics/host/Handoff/ShvOperatingStateHandoff.cs','src/acoustics/host/Handoff/TrustedShvComposition.cs','src/acoustics/host/Handoff/ShvProducerModule.cs','src/acoustics/host/Handoff/ShvClockCalibration.cs','src/acoustics/host/Handoff/ShvHandoffConsumer.cs','src/acoustics/host/Handoff/ShvGameplayFrameAdapter.cs','src/acoustics/host/Transport/ListenerProtocol.cs','src/acoustics/host/Transport/GameplayProtocol.cs','src/acoustics/host/Transport/StatePipe.cs','src/acoustics/host/Transport/PipeDeadline.cs','src/acoustics/bridge/Rph/ShvHandoffBootstrap.Rph.cs','src/acoustics/bridge/Rph/ShvHandoffJournal.Rph.cs','tests/host/TestShvHandoffJournal.cs')
$pins=@($sources|ForEach-Object{[ordered]@{name=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo $_)).Hash.ToLowerInvariant()}})
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if((Get-FileHash -LiteralPath $compiler).Hash.ToLowerInvariant() -ne '46809206887326d2d24db1eff1f3064de972c3451abe766b49111450a5e08e00'){throw 'Existing compiler pin differs.'}
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /define:SHV_HANDOFF_09 /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll /main:TestShvHandoffJournal ('/out:'+$binary) @($sources|ForEach-Object{Join-Path $repo $_}) $policy
if($LASTEXITCODE -ne 0){throw 'Journal fixture compilation failed.'}
$raw=@(& $binary);if($LASTEXITCODE -ne 0 -or $raw.Count -ne 1){throw 'Journal fixture execution failed.'}
$result=$raw[0]|ConvertFrom-Json;if(!$result.passed -or $result.gameExecuted -or $result.endpointOpened -or $result.audioPlayback){throw 'Unexpected journal fixture boundary.'}
foreach($pin in $pins){if((Get-FileHash -LiteralPath (Join-Path $repo $pin.name)).Hash.ToLowerInvariant() -ne $pin.sha256){throw 'Source changed during journal validation.'}}
$receipt=[ordered]@{schema=1;profile='PLAYABLE-12';runtimePolicy='functional-compatibility';kind='actual-bounded-journal-and-process-lease-private-fixtures';passed=$true;cases=$result.cases;assertions=$result.assertions;casesPassed=$result.casesPassed;sources=$pins;compilerSha256=(Get-FileHash -LiteralPath $compiler).Hash.ToLowerInvariant();fixturePolicySha256=(Get-FileHash -LiteralPath $policy).Hash.ToLowerInvariant();runnerSha256=(Get-FileHash -LiteralPath $PSCommandPath).Hash.ToLowerInvariant();binarySha256=(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant();fixturePolicyIsNotProductionPolicy=$true;actualCurrentFixtureProcessIdentityObserved=$true;actualWriterAndCodecExecuted=$true;gameExecuted=$false;gameFilesWritten=$false;actualRphOrProducerExecuted=$false;endpointOpened=$false;audioPlayback=$false}
$path=Join-Path $output 'validation.json';$receipt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $path -Encoding utf8
Write-Output ('PASS '+$result.cases+' journal/bootstrap cases / '+$result.assertions+' assertions; '+$path)
