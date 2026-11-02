#requires -Version 7.0
[CmdletBinding()]param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo ('.local/latency-03-1/process-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$helper=Join-Path $out 'Original.ProcessFixture031.exe'
& $compiler /nologo /optimize+ /warnaserror+ /platform:x64 ('/out:'+$helper) (Join-Path $repo 'tests/host/ProcessFixture031.cs')
if($LASTEXITCODE-ne0){throw 'Original process helper compilation failed.'}
$production=Join-Path $out 'OwnedProcess.Production031.dll'
& $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /target:library ('/out:'+$production) (Join-Path $repo 'src/acoustics/host/Transport/OwnedProcessJob.cs')
if($LASTEXITCODE-ne0){throw 'Production native-handle source compilation failed.'}
$assembly=[Reflection.Assembly]::LoadFrom($production)
$nativeType=$assembly.GetType('RichAudio.Beacon.Transport.OwnedProcessNative',$true)
$fields=$nativeType.GetFields([Reflection.BindingFlags]'Static,NonPublic,Public')
if(@($fields|Where-Object{$_.Name -match 'Fault|Fixture|LastFailed'}).Count){throw 'Production native-handle source exposed a fixture fault switch.'}
$legacy=Join-Path $out 'OwnedProcessJob.original.cs'
$raw=@(& git -C $repo show '57178c5986b8e82403ceeb9dbf80f2ef2ceaa935:src/acoustics/host/Transport/OwnedProcessJob.cs')
if($LASTEXITCODE-ne0){throw 'Exact original source unavailable.'}
[IO.File]::WriteAllText($legacy,($raw -join "`n").Replace('RichAudio.Beacon.Transport','RichAudio.Legacy031')+"`n",[Text.UTF8Encoding]::new($false))
$exe=Join-Path $out 'Process031.Tests.exe'
$sources=@((Join-Path $repo 'src/acoustics/host/Transport/OwnedProcessJob.cs'),(Join-Path $repo 'tests/host/TestLatency031Process.cs'),$legacy)
& $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /define:OWNED_PROCESS_FIXTURES /r:System.Web.Extensions.dll ('/out:'+$exe) @sources
if($LASTEXITCODE-ne0){throw 'Native lifetime fixture compilation failed.'}
& $exe $helper (Join-Path $out 'fixture') 1> (Join-Path $out 'result.json') 2> (Join-Path $out 'stderr.txt')
if($LASTEXITCODE-ne0){throw ('Native lifetime fixture failed; preserve '+$out)}
$result=Get-Content -LiteralPath (Join-Path $out 'result.json') -Raw|ConvertFrom-Json
$pins=@('src/acoustics/host/Transport/OwnedProcessJob.cs','tests/host/TestLatency031Process.cs','tests/host/ProcessFixture031.cs','tools/Test-Latency031Process.ps1')|ForEach-Object{[ordered]@{file=$_;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $repo $_)).Hash.ToLowerInvariant()}}
[ordered]@{schema=1;passed=$result.passed;checks=$result.checks;sourcePins=@($pins);originalSourceCommit='57178c5986b8e82403ceeb9dbf80f2ef2ceaa935';resultSha256=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $out 'result.json')).Hash.ToLowerInvariant();helperSha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $helper).Hash.ToLowerInvariant();productionAssemblySha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $production).Hash.ToLowerInvariant();productionFaultSwitchesAbsent=$true;allOriginalFixtureLifetimesAbsent=$result.allOriginalFixtureLifetimesAbsent;endpointOpened=$false;gameLaunched=$false;recordingStarted=$false;scope='Original native kernel process fixtures and clearly authored native-failure injections; no real audio endpoint'}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $out 'validation.json') -Encoding utf8
Write-Output ('PASS native process lifetime fixtures; '+$out)
