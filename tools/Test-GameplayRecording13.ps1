#requires -Version 7.0
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$output=Join-Path $repo ('.local/playable-13/recording-validation-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($output)|Out-Null
$sources=@('src/acoustics/host/Windows','src/acoustics/host/Transport','src/acoustics/recording','src/acoustics/geometry')|ForEach-Object{Get-ChildItem -LiteralPath (Join-Path $repo $_) -Filter '*.cs'|ForEach-Object FullName}
$sources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src/acoustics/observation/'+$_)}
$sources+=Join-Path $repo 'tests/recording/GameplayRecordingTests.cs'
$pins=@($sources|ForEach-Object{[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant()}})
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$binary=Join-Path $output 'GameplayRecording.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /unsafe+ /platform:x64 /target:exe /define:STATE_TRANSPORT,GEOMETRY_LIVE /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll /main:GameplayRecordingTests ('/out:'+$binary) @sources
if($LASTEXITCODE-ne0){throw 'Recording integration fixture compilation failed.'}
$raw=@(& $binary (Join-Path $output 'fixture-workspace'))
if($LASTEXITCODE-ne0-or$raw.Count-ne1){throw 'Recording integration fixture failed; private attempt retained.'}
$result=$raw[0]|ConvertFrom-Json
if(!$result.passed-or!$result.fixtureOnly-or$result.endpointOpened-or$result.microphoneOpened-or$result.gameLaunched-or$result.humanListeningApproved){throw 'Recording fixture scope mismatch.'}
$analysis=Join-Path $output 'analysis'
& node (Join-Path $repo 'tools/Analyze-Playable13Recording.mjs') --session $result.captureDirectory --output $analysis
if($LASTEXITCODE-ne0){throw 'Automatic recording analysis failed.'}
$measurement=Get-Content -LiteralPath (Join-Path $analysis 'analysis.json') -Raw|ConvertFrom-Json
if(!$measurement.recordingComplete-or!$measurement.ownedIndexFramesMatchWave-or$measurement.owned.overFullScaleSamples-ne0-or$measurement.subjectiveQualityEstablished-or$measurement.humanListeningApproved){throw 'Recording analysis boundary failed.'}
if(!$measurement.findings-or!$measurement.recommendations-or$measurement.automaticCorrectionsApplied){throw 'Actionable bounded analysis findings are missing.'}
& node (Join-Path $repo 'tests/recording/Playable13AnalysisTests.mjs')
if($LASTEXITCODE-ne0){throw 'Recording findings controls failed.'}
foreach($name in @('owned-waveform.svg','owned-spectrogram.svg','loopback-waveform.svg','loopback-spectrogram.svg')){if((Get-Item -LiteralPath (Join-Path $analysis $name)).Length-lt500){throw 'Standalone analysis plot missing.'}}
$fixtureSession='11111111111111111111111111111111'
$workspace=Join-Path $output 'fixture-workspace'
$hostFolder=Join-Path $workspace ('.local/gameplay/'+$fixtureSession);[IO.Directory]::CreateDirectory($hostFolder)|Out-Null
# Explicit fixture host result only; no host/game/process was started by this test.
[ordered]@{demoProfile='PLAYABLE-13';hostState='stopped';hostPid=0;fixture=$true;recordingRequested=$true;recordingDirectory=$result.captureDirectory}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $hostFolder 'host.json') -Encoding utf8
$automatic=Join-Path $output 'automatic-analysis'
& pwsh -NoProfile -File (Join-Path $repo 'tools/Finalize-Playable13Capture.ps1') -PackageRoot $workspace -Session $fixtureSession -OutputRoot $automatic
if($LASTEXITCODE-ne0){throw 'Post-session automatic finalizer fixture failed.'}
$finalization=Get-Content -LiteralPath (Join-Path $automatic 'finalization.json') -Raw|ConvertFrom-Json
if(!$finalization.recordingComplete-or!$finalization.capturedFilesPreserved-or!$finalization.loopbackWaveRetained-or$finalization.endpointOpened-or$finalization.humanListeningApproved){throw 'Post-session finalizer evidence boundary failed.'}
foreach($pin in $pins){if((Get-FileHash -LiteralPath $pin.path).Hash.ToLowerInvariant()-cne$pin.sha256){throw 'Source changed during validation.'}}
$receipt=[ordered]@{schema=1;profile='PLAYABLE-13';kind='first-demo-recording-integration-device-free';passed=$true;assertions=$result.assertions;recordingDirectory=$result.captureDirectory;analysisDirectory=$analysis;automaticFinalizerExecuted=$true;finalizationSha256=(Get-FileHash -LiteralPath (Join-Path $automatic 'finalization.json')).Hash.ToLowerInvariant();sourcePins=$pins;binarySha256=(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant();runnerSha256=(Get-FileHash -LiteralPath $PSCommandPath).Hash.ToLowerInvariant();analysisRunnerSha256=(Get-FileHash -LiteralPath (Join-Path $repo 'tools/Analyze-Playable13Recording.mjs')).Hash.ToLowerInvariant();finalizerSha256=(Get-FileHash -LiteralPath (Join-Path $repo 'tools/Finalize-Playable13Capture.ps1')).Hash.ToLowerInvariant();recordingComplete=$true;actualProductionFillExecuted=$true;endpointOpened=$false;microphoneOpened=$false;gameLaunched=$false;fakeLoopbackOnly=$true;subjectiveQualityEstablished=$false;humanListeningApproved=$false;globalRecordingFeatureEnabled=$false;limits='Actual existing post-gain Fill/tap/WAV/loopback lifecycle and automatic file analysis with explicit fake renderer/driver. No live endpoint, framework, source qualification or human listening.'}
$path=Join-Path $output 'validation.json';$receipt|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $path -Encoding utf8
Write-Output ('PASS gameplay13 recording; '+$path)
