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
    & node --test tests/Test-AcousticGeometry.mjs
    if($LASTEXITCODE -ne 0){throw 'Offline acoustic geometry research tests failed.'}
    & (Join-Path $repo 'tests\Test-GeometryObservation.ps1')
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
