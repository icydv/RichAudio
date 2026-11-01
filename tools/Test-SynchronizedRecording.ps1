#requires -Version 7.0
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$output=Join-Path $repo ('.local/playable-08/recording-validation-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($output)|Out-Null
& (Join-Path $PSScriptRoot 'Build-AcousticsHost.ps1') -OutputDirectory (Join-Path $output 'compiled-host')
if($LASTEXITCODE-ne0){throw 'Isolated host compilation failed.'}
$sources=@('src/acoustics/host/Windows','src/acoustics/host/Transport','src/acoustics/recording','src/acoustics/geometry')|ForEach-Object{Get-ChildItem -LiteralPath (Join-Path $repo $_) -Filter '*.cs'|ForEach-Object FullName}
$sources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src/acoustics/observation/'+$_)}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$exe=Join-Path $output 'Recording.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /unsafe+ /platform:x64 /target:exe /define:STATE_TRANSPORT,GEOMETRY_LIVE /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll /main:RecordingTests ('/out:'+$exe) @sources (Join-Path $repo 'tests/recording/RecordingTests.cs')
if($LASTEXITCODE-ne0){throw 'Recording fixture compilation failed.'}
& $exe (Join-Path $output 'fixture-workspace') | Tee-Object -Variable fixtureOutput
if($LASTEXITCODE-ne0){throw 'Device-free production recording tests failed.'}
& node (Join-Path $repo 'tests/recording/AnalysisTests.mjs') $output
if($LASTEXITCODE-ne0){throw 'Recording analysis fixture tests failed.'}
$analysis=Get-Content -LiteralPath (Join-Path $output 'analysis-tests.json') -Raw|ConvertFrom-Json
$count=[int][regex]::Match(($fixtureOutput-join"`n"),'PASS (\d+) production').Groups[1].Value
$files=@('src/acoustics/host/Windows/OwnedOutputTap.cs','src/acoustics/host/Windows/WasapiOutput.cs','src/acoustics/recording/RecordingContracts.cs','src/acoustics/recording/RecordingSession.cs','src/acoustics/recording/StreamingLoopback.cs','src/acoustics/recording/analyze.mjs','tests/recording/RecordingTests.cs','tests/recording/AnalysisTests.mjs','tools/Test-SynchronizedRecording.ps1','tools/Build-AcousticsHost.ps1')
$receipt=[ordered]@{schema=1;profile='PLAYABLE-08-recording';scope='Actual production PCM submission path through a managed fake renderer; bounded local file writers and known-signal analysis only';csharpAssertions=$count;analysisChecks=$analysis.passed;failed=0;gameStarted=$false;productHostStarted=$false;audioEndpointOpened=$false;microphoneOpened=$false;realLoopbackBackendExecuted=$false;realLoopbackBackendCompiled=$true;actualProductionFillExecuted=$true;losslessSubmissionBytesVerified=$true;liveAcceptance=$false;sourcePins=@($files|ForEach-Object{[ordered]@{file=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo $_) -Algorithm SHA256).Hash.ToLowerInvariant()}});artifacts=@((Join-Path $output 'compiled-host/RichAudio.Acoustics.Host.exe'),$exe)|ForEach-Object{[ordered]@{name=[IO.Path]::GetFileName($_);sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}}}
$receipt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $output 'validation.json') -Encoding utf8
Write-Output ('Recording validation output: '+$output)
