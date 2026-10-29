# Framework-independent validation only. No game inspection or deployment.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$output=Join-Path $repo ('.local\offline-validation-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($output) | Out-Null
Push-Location $repo
try {
    & (Join-Path $repo 'tools\Build-AcousticGpu.ps1') -Tests
    & node --test tests/Test-AcousticQuality.mjs tests/Test-AcousticGpuScenes.mjs tests/Test-AcousticAcceleration.mjs tests/Test-AcousticAccelerationBenchmark.mjs
    if($LASTEXITCODE-ne0){throw 'Acoustic quality, CPU fallback, adaptive selection or benchmark contracts failed.'}
    # Hardware checks are deliberately sequential: concurrent compute probes
    # would contaminate deadlines. Unsupported hardware is explicitly unverified.
    & node --test tests/Test-AcousticGpuDevice.mjs
    if($LASTEXITCODE-ne0){throw 'Actual GPU compute or bounded protocol validation failed.'}
    & node --test tests/Test-AcousticAccelerationProducer.mjs
    if($LASTEXITCODE-ne0){throw 'Actual quality/acceleration worker and RA07 integration failed.'}
    & (Join-Path $repo 'tools\Build-AcousticSettings.ps1') -Tests
    & (Join-Path $repo 'tools\Test-AcousticSettingsHandoff.ps1')
    & (Join-Path $repo 'tools\Test-InGameMenu.ps1')
    & (Join-Path $repo 'tools\Test-SoundMapMenu.ps1')
    & (Join-Path $repo 'tools\Test-PassiveSoundMap.ps1')
    & (Join-Path $repo 'tools\Test-MenuDeploymentLayout.ps1')
    & node --test tests/Test-SoundMapTelemetry.mjs tests/Test-SoundMapViewer.mjs tests/Test-SoundMapService.mjs tests/Test-SoundMapProducer.mjs
    if($LASTEXITCODE-ne0){throw 'SoundMap telemetry, viewer, recording, replay or actual producer checks failed.'}
    & node --test tests/Test-InGameAcousticControls.mjs
    if($LASTEXITCODE-ne0){throw 'Actual in-game acoustic settings integration failed.'}
    & node --test tests/Test-GeometryRelay.mjs
    if($LASTEXITCODE-ne0){throw 'Measured geometry relay admission failed.'}
    & (Join-Path $repo 'tools\Test-GeometryLive.ps1')
    & node --test tests/Test-RealtimeGeometry.mjs
    if($LASTEXITCODE -ne 0){throw 'Actual observed geometry worker/RA07 integration failed.'}
    & node --test tests/Test-ObservedGeometryAudio.mjs
    if($LASTEXITCODE -ne 0){throw 'Observed geometry to existing DSP integration failed.'}
    & node --check tools/Inspect-SteamInstall.mjs
    if($LASTEXITCODE -ne 0){throw 'Metadata inspector syntax check failed.'}
    & node --check tools/Audit-Repository.mjs
    if($LASTEXITCODE -ne 0){throw 'Repository auditor syntax check failed.'}
    & node --test tests/Test-SteamMetadata.mjs
    if($LASTEXITCODE -ne 0){throw 'Metadata parser tests failed.'}
    & node --test tests/Test-AcousticGeometry.mjs
    if($LASTEXITCODE -ne 0){throw 'Offline acoustic geometry research tests failed.'}
    & node --test tests/Test-AcousticRenderer.mjs tests/Test-AcousticMotion.mjs tests/Test-AcousticDemo.mjs
    if($LASTEXITCODE -ne 0){throw 'Original synthetic acoustic PCM tests failed.'}
    & node --test tests/Test-AcousticStreaming.mjs
    if($LASTEXITCODE -ne 0){throw 'Causal acoustic streaming and independent oracle tests failed.'}
    & node --test tests/Test-AcousticsHostProducer.mjs tests/Test-ListenerPlayout.mjs
    if($LASTEXITCODE -ne 0){throw 'Actual synthetic host-producer framing and lifecycle tests failed.'}
    & node --test tests/Test-OfflineContinuity.mjs
    if($LASTEXITCODE -ne 0){throw 'Silent production streaming continuity and responsiveness tests failed.'}
    & node --test tests/Test-OrientationPresentation.mjs
    if($LASTEXITCODE -ne 0){throw 'Opt-in orientation presentation and silent lifecycle tests failed.'}
    & node --test tests/Test-BeaconFrequency.mjs
    if($LASTEXITCODE -ne 0){throw 'Owned beacon frequency and device-free continuity tests failed.'}
    & node --test tests/Test-BeaconOutputTrim.mjs tests/Test-GeometryAudition.mjs
    if($LASTEXITCODE -ne 0){throw 'Bounded audition output and observed geometry PCM failed.'}
    & (Join-Path $repo 'tools\Prepare-Beacon600.ps1') -Output ('.local/beacon-ci-'+[guid]::NewGuid().ToString('N'))
    # Original PCM, bounded queues and local transport only: these tests never open an audio endpoint.
    & (Join-Path $repo 'tools\Build-AcousticsHost.ps1') -Tests
    & node --test tests/Test-SoundMapHost.mjs
    if($LASTEXITCODE-ne0){throw 'Native owned-output tap to private recording bundle failed.'}
    & (Join-Path $repo 'tools\Test-BeaconTransport.ps1')
    & (Join-Path $repo 'tools\Test-ListenerEvidence.ps1')
    & (Join-Path $repo 'tools\Test-UnsentExpiry.ps1')
    & (Join-Path $repo 'tools\Test-HostHandoff.ps1')
    & (Join-Path $repo 'tools\Measure-FirstFrameTiming.ps1') -Output ('.local/timing-ci-'+[guid]::NewGuid().ToString('N'))
    & (Join-Path $repo 'tests\Test-GeometryObservation.ps1')
    & node --test tests/Test-SurfaceReconstruction.mjs tests/Test-SurfacePrivatePaths.mjs
    if($LASTEXITCODE-ne0){throw 'Surface reconstruction/privacy tests failed.'}
    & (Join-Path $repo 'tests\Test-SurfaceAcquisition.ps1')
    & (Join-Path $repo 'tests\Test-DiagnosticTile.ps1')
    & node --test tests/Test-TileReplay.mjs
    if($LASTEXITCODE-ne0){throw 'Tile replay and separation tests failed.'}
    & node --test tests/Test-WorldCache.mjs tests/Test-LivingWorldContracts.mjs
    if($LASTEXITCODE-ne0){throw 'World cache and combined offline safety contracts failed.'}
    & (Join-Path $repo 'tests\Test-Phase1.ps1') -ReportPath (Join-Path $output 'phase1-results.json')
    & (Join-Path $PSScriptRoot 'Build-Telemetry.ps1') -CoreOnly
    $compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    $build=Join-Path $repo 'build\telemetry'
    $sources=@(Get-ChildItem (Join-Path $repo 'tests\telemetry') -Filter '*.cs' | ForEach-Object FullName)
    $sources+=@(Get-ChildItem (Join-Path $repo 'src\telemetry\Analysis') -Filter '*.cs' | ForEach-Object FullName)
    $testExe=Join-Path $build 'RichAudio.Telemetry.Tests.exe'
    & $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /target:exe /main:RichAudio.Tests.TestCore /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $build 'RichAudio.Telemetry.Core.dll')) ('/out:'+$testExe) @sources
    if($LASTEXITCODE -ne 0){throw 'Telemetry test compilation failed.'}
    & $testExe $output
    if($LASTEXITCODE -ne 0){throw 'Offline telemetry tests failed.'}
    & (Join-Path $build 'RichAudio.Telemetry.Analysis.exe') (Join-Path $output 'mock-session.jsonl') (Join-Path $output 'mock-analysis.json')
    if($LASTEXITCODE -ne 0){throw 'Fixture analysis failed.'}
    $configTest=Join-Path $build 'RichAudio.Config.Tests.exe'
    & $compiler /nologo /optimize+ /warnaserror+ /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $build 'RichAudio.Telemetry.Core.dll')) ('/out:'+$configTest) (Join-Path $repo 'src\telemetry\Rph\Configuration.cs') (Join-Path $repo 'tests\diagnostics\TestConfig.cs')
    if($LASTEXITCODE -ne 0){throw 'Configuration test compilation failed.'}
    & $configTest (Join-Path $output 'config-fixtures')
    if($LASTEXITCODE -ne 0){throw 'Configuration boundary tests failed.'}
    $appendTest=Join-Path $build 'RichAudio.Append.Tests.exe'
    & $compiler /nologo /optimize+ /warnaserror+ /r:System.Runtime.Serialization.dll ('/out:'+$appendTest) (Join-Path $repo 'tests\diagnostics\AppendProbe.cs')
    if($LASTEXITCODE -ne 0){throw 'Append probe compilation failed.'}
    & $appendTest (Join-Path $output 'append-fixtures') (Join-Path $output 'append-results.json')
    if($LASTEXITCODE -ne 0){throw 'Append sharing tests failed.'}
    & git diff --check
    if($LASTEXITCODE -ne 0){throw 'Whitespace check failed.'}
    Write-Output ('OFFLINE ONLY: reports and benchmarks at '+$output)
} finally { Pop-Location }
