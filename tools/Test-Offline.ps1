# Framework-independent validation only. No game inspection or deployment.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$output=Join-Path $repo ('.local\offline-validation-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($output) | Out-Null
Push-Location $repo
try {
    & node --check tools/Inspect-SteamInstall.mjs
    if($LASTEXITCODE -ne 0){throw 'Metadata inspector syntax check failed.'}
    & node --check tools/Audit-Repository.mjs
    if($LASTEXITCODE -ne 0){throw 'Repository auditor syntax check failed.'}
    & node --test tests/Test-SteamMetadata.mjs
    if($LASTEXITCODE -ne 0){throw 'Metadata parser tests failed.'}
    & node --test tests/Test-DrivetrainAnalysis.mjs
    if($LASTEXITCODE -ne 0){throw 'Drivetrain analysis tests failed.'}
    & node --test tests/Test-AudioOwnership.mjs
    if($LASTEXITCODE -ne 0){throw 'Synthetic ownership tests failed.'}
    & node --test tests/Test-StockSourceAudio.mjs
    if($LASTEXITCODE -ne 0){throw 'Offline source-audio tests failed.'}
    & node --test tests/Test-Deceleration.mjs
    if($LASTEXITCODE -ne 0){throw 'Offline deceleration diagnosis tests failed.'}
    & node --test tests/Test-CycleEvidence.mjs
    if($LASTEXITCODE -ne 0){throw 'Offline cycle-state evidence tests failed.'}
    & node --test tests/Test-ResponsiveEngine.mjs
    if($LASTEXITCODE -ne 0){throw 'Offline responsive-engine research tests failed.'}
    & node --test tests/Test-CycleRecurrence.mjs
    if($LASTEXITCODE -ne 0){throw 'Offline cycle recurrence tests failed.'}
    & node --test tests/Test-GranularModel.mjs
    if($LASTEXITCODE -ne 0){throw 'Offline granular-model diagnostic tests failed.'}
    & node --test tests/Test-ExhaustJoinAblation.mjs
    if($LASTEXITCODE -ne 0){throw 'Offline exhaust join-ablation tests failed.'}
    & node --test tests/Test-OuterWrapAblation.mjs
    if($LASTEXITCODE -ne 0){throw 'Offline outer-wrap ablation tests failed.'}
    & node --test tests/Test-SecondStateWrap.mjs
    if($LASTEXITCODE -ne 0){throw 'Offline second-state wrap tests failed.'}
    & (Join-Path $PSScriptRoot 'Build-OfflineAudio.ps1')
    & (Join-Path $repo 'tests\Test-OfflineAudioGuards.ps1')
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
    $drivetrainTest=Join-Path $build 'RichAudio.Drivetrain.Tests.exe'
    & $compiler /nologo /optimize+ /warnaserror+ /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $build 'RichAudio.Telemetry.Core.dll')) ('/out:'+$drivetrainTest) (Join-Path $repo 'src\telemetry\Rph\Configuration.cs') (Join-Path $repo 'tests\diagnostics\TestDrivetrain.cs')
    if($LASTEXITCODE -ne 0){throw 'Drivetrain test compilation failed.'}
    & $drivetrainTest (Join-Path $output 'drivetrain-fixtures')
    if($LASTEXITCODE -ne 0){throw 'Drivetrain diagnostic tests failed.'}
    $appendTest=Join-Path $build 'RichAudio.Append.Tests.exe'
    & $compiler /nologo /optimize+ /warnaserror+ /r:System.Runtime.Serialization.dll ('/out:'+$appendTest) (Join-Path $repo 'tests\diagnostics\AppendProbe.cs')
    if($LASTEXITCODE -ne 0){throw 'Append probe compilation failed.'}
    & $appendTest (Join-Path $output 'append-fixtures') (Join-Path $output 'append-results.json')
    if($LASTEXITCODE -ne 0){throw 'Append sharing tests failed.'}
    & git diff --check
    if($LASTEXITCODE -ne 0){throw 'Whitespace check failed.'}
    Write-Output ('OFFLINE ONLY: reports and benchmarks at '+$output)
} finally { Pop-Location }
