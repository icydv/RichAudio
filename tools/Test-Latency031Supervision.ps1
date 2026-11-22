#requires -Version 7.0
[CmdletBinding()]param()
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo ('.local/latency-03-1/supervision-policy-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($out)|Out-Null
$files=@('src/acoustics/experiments/Latency031Supervision.cs','tests/host/TestLatency031Supervision.cs','tools/Test-Latency031Supervision.ps1')
$pins=@($files|ForEach-Object{[ordered]@{file=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo $_)).Hash.ToLowerInvariant()}})
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$exe=Join-Path $out 'Latency031.Supervision.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /r:System.Web.Extensions.dll ('/out:'+$exe) @($files|Where-Object{$_-like'*.cs'}|ForEach-Object{Join-Path $repo $_})
if($LASTEXITCODE-ne0){throw 'Supervisor policy fixture compilation failed'}
$raw=@(& $exe);$raw|Set-Content -LiteralPath (Join-Path $out 'result.json') -Encoding utf8
if($LASTEXITCODE-ne0){throw 'Supervisor policy fixtures failed; preserve output'}
foreach($p in $pins){if((Get-FileHash -LiteralPath (Join-Path $repo $p.file)).Hash.ToLowerInvariant()-cne$p.sha256){throw 'Source changed during fixture'}}
[ordered]@{schema=1;passed=$true;sourcePins=$pins;resultSha256=(Get-FileHash -LiteralPath (Join-Path $out 'result.json')).Hash.ToLowerInvariant();endpointOpened=$false;gameLaunched=$false;scope='Deterministic control-thread policy fixtures; separate kernel handle tests required'}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $out 'validation.json') -Encoding utf8
Write-Output ('PASS LATENCY03.1 supervision policy; '+(Join-Path $out 'validation.json'))
