#requires -Version 7.0
[CmdletBinding()]param()
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot;$out=Join-Path $repo ('.local/latency-03/output-tests-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($out)|Out-Null
$files=@('PcmRing.cs','PreparedTransientBus.cs','SharedPeriodPlan.cs','WasapiInterop.cs','WasapiOutput.cs','OwnedOutputTap.cs','Latency03PresentationClock.cs','Latency03Interop.cs','Latency03OutputSession.cs')|ForEach-Object{'src/acoustics/host/Windows/'+$_};$files+=@('tests/host/TestLatency03Output.cs','tools/Test-Latency03Output.ps1');$pins=@($files|ForEach-Object{[ordered]@{file=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo $_)).Hash.ToLowerInvariant()}})
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$exe=Join-Path $out 'Latency03Output.Tests.exe'
& $compiler /nologo /optimize+ /unsafe+ /warnaserror+ /platform:x64 /r:System.Web.Extensions.dll ('/out:'+$exe) @($files|Where-Object{$_-like'*.cs'}|ForEach-Object{Join-Path $repo $_})
if($LASTEXITCODE-ne0){throw 'LATENCY-03 output fixture compilation failed.'};$raw=@(& $exe);if($LASTEXITCODE-ne0){throw 'LATENCY-03 output fixture failed.'};$raw|Set-Content -LiteralPath (Join-Path $out 'result.json') -Encoding utf8
foreach($p in $pins){if((Get-FileHash -LiteralPath (Join-Path $repo $p.file)).Hash.ToLowerInvariant()-cne$p.sha256){throw 'Source changed during output fixture.'}}
[ordered]@{schema=1;passed=$true;sourcePins=$pins;resultSha256=(Get-FileHash -LiteralPath (Join-Path $out 'result.json')).Hash.ToLowerInvariant();endpointOpened=$false;gameLaunched=$false;realComInstantiated=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $out 'validation.json') -Encoding utf8
Write-Output ('PASS LATENCY-03 managed-fake output tests; '+(Join-Path $out 'validation.json'))
