#requires -Version 7.0
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$output=Join-Path $repo ('.local/playable-09/gameplay-adapter-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if((Get-FileHash -LiteralPath $compiler).Hash.ToLowerInvariant() -ne '46809206887326d2d24db1eff1f3064de972c3451abe766b49111450a5e08e00'){throw 'Expected existing reviewed .NET Framework x64 compiler.'}
$relative=@('src/acoustics/host/Handoff/ShvOperatingStateHandoff.cs','src/acoustics/host/Handoff/TrustedShvComposition.cs',
 'src/acoustics/host/Handoff/ShvProducerModule.cs','src/acoustics/host/Handoff/ShvClockCalibration.cs','src/acoustics/host/Handoff/ShvHandoffConsumer.cs',
 'src/acoustics/host/Handoff/ShvGameplayFrameAdapter.cs','src/acoustics/host/Transport/ListenerProtocol.cs',
 'src/acoustics/host/Transport/GameplayProtocol.cs','src/acoustics/host/Transport/StatePipe.cs','src/acoustics/host/Transport/PipeDeadline.cs',
 'tests/host/TestShvGameplayFrameAdapter.cs')
$pins=@($relative|ForEach-Object {[ordered]@{name=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo $_)).Hash.ToLowerInvariant()}})
$binary=Join-Path $output 'RichAudio.ShvGameplayFrameAdapter.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /r:System.Runtime.Serialization.dll /main:TestShvGameplayFrameAdapter ('/out:'+$binary) @($relative|ForEach-Object {Join-Path $repo $_})
if($LASTEXITCODE -ne 0){throw 'Focused adapter compilation failed.'}
$raw=@(& $binary);if($LASTEXITCODE -ne 0 -or $raw.Count -ne 1){throw 'Focused adapter fixture failed.'}
$result=$raw[0]|ConvertFrom-Json
if(!$result.passed -or !$result.passiveOnly -or $result.audioPlaybackAllowed -or $result.endpointOpened -or $result.gameLaunched){throw 'Unexpected adapter fixture boundary.'}
foreach($pin in $pins){if((Get-FileHash -LiteralPath (Join-Path $repo $pin.name)).Hash.ToLowerInvariant() -ne $pin.sha256){throw 'Source changed during adapter validation.'}}
$receipt=[ordered]@{schema=1;profile='PLAYABLE-09';kind='existing-gameplay-frame-adapter-device-free';passed=$true;cases=$result.cases;assertions=$result.assertions;casesPassed=$result.casesPassed;sources=$pins;binary=[ordered]@{path=$binary;sha256=(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant()};compilerSha256=(Get-FileHash -LiteralPath $compiler).Hash.ToLowerInvariant();runnerSha256=(Get-FileHash -LiteralPath $PSCommandPath).Hash.ToLowerInvariant();passiveOnly=$true;audioPlaybackAllowed=$false;gameLaunched=$false;gameFilesWritten=$false;actualProducerExecuted=$false;actualRphWitnessExecuted=$false;endpointOpened=$false;qualification='Authored typed capability fixtures and actual existing GameplayWire codec only; no game process, native module, pipe, playback host, audio device or source controller executed.'}
$receiptPath=Join-Path $output 'validation.json';$receipt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $receiptPath -Encoding utf8
Write-Output ('PASS '+$result.cases+' adapter cases / '+$result.assertions+' assertions; '+$receiptPath)
