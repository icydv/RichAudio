#requires -Version 7.0
[CmdletBinding()]param()
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo ('.local/latency-03-1/supervision-native-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($out)|Out-Null
$files=@('src/acoustics/host/Transport/OwnedProcessJob.cs','src/acoustics/experiments/Latency031Supervision.cs','src/acoustics/experiments/Latency031NativeChild.cs','src/acoustics/experiments/Latency031SupervisionReceipt.cs','tests/host/ProcessFixture031.cs','tests/host/TestLatency031SupervisionIntegration.cs','tools/Test-Latency031SupervisionIntegration.ps1')
$pins=@($files|ForEach-Object{[ordered]@{file=$_;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $repo $_)).Hash.ToLowerInvariant()}})
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$helper=Join-Path $out 'Original.SupervisionProcess031.exe'
& $compiler /nologo /optimize+ /warnaserror+ /platform:x64 ('/out:'+$helper) (Join-Path $repo 'tests/host/ProcessFixture031.cs')
if($LASTEXITCODE-ne0){throw 'Original supervision process fixture compilation failed'}
$exe=Join-Path $out 'Latency031.NativeSupervision.Tests.exe'
$compile=@($files|Where-Object{$_-like'*.cs'-and$_-ne'tests/host/ProcessFixture031.cs'}|ForEach-Object{Join-Path $repo $_})
& $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /r:System.Web.Extensions.dll ('/out:'+$exe) @compile
if($LASTEXITCODE-ne0){throw 'Native supervisor integration fixture compilation failed'}
& $exe $helper (Join-Path $out 'fixture') 1> (Join-Path $out 'result.json') 2> (Join-Path $out 'stderr.txt');$code=$LASTEXITCODE
foreach($pin in $pins){if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $repo $pin.file)).Hash.ToLowerInvariant()-cne$pin.sha256){throw 'Source changed during integration test; preserve output without promoting result'}}
$result=Get-Content -LiteralPath (Join-Path $out 'result.json') -Raw|ConvertFrom-Json
[ordered]@{schema=1;passed=($code-eq0-and$result.passed);checks=$result.checks;sourcePins=$pins;resultSha256=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $out 'result.json')).Hash.ToLowerInvariant();originalFixtureLifetimes=$result.originalFixtureLifetimes;allOriginalFixtureLifetimesAbsent=$result.allOriginalFixtureLifetimesAbsent;endpointOpened=$false;recordingStarted=$false;gameLaunched=$false;scope='Actual native process + production policy/adapter integration; no experimental output route'}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $out 'validation.json') -Encoding utf8
if($code-ne0){throw ('Native supervisor integration failed; preserve '+$out)}
Write-Output ('PASS LATENCY03.1 native supervision integration; '+(Join-Path $out 'validation.json'))
