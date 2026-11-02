#requires -Version 7.0
[CmdletBinding()]param()
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo ('.local/latency-02/bus-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($out)|Out-Null
$files=@('src/acoustics/host/Windows/PcmRing.cs','src/acoustics/host/Windows/PreparedTransientBus.cs','src/acoustics/host/Windows/TransientEventProtocol.cs','src/acoustics/host/Windows/SharedPeriodPlan.cs','tests/host/TestTransientBus02.cs')
$pins=@($files|ForEach-Object{[ordered]@{file=$_;sha256=(Get-FileHash (Join-Path $repo $_)).Hash.ToLowerInvariant()}})
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$exe=Join-Path $out 'TransientBus.Tests.exe'
& $compiler /nologo /optimize+ /unsafe+ /warnaserror+ /platform:x64 /r:System.Web.Extensions.dll ('/out:'+$exe) @($files|ForEach-Object{Join-Path $repo $_})
if($LASTEXITCODE-ne0){throw 'Synthetic transient bus compile failed.'}
$raw=@(& $exe);if($LASTEXITCODE-ne0){throw 'Synthetic transient bus test failed.'};$raw|Set-Content -LiteralPath (Join-Path $out 'result.json') -Encoding utf8
foreach($p in $pins){if((Get-FileHash (Join-Path $repo $p.file)).Hash.ToLowerInvariant()-cne$p.sha256){throw 'Source changed during bus test.'}}
[ordered]@{schema=1;passed=$true;sources=$pins;resultSha256=(Get-FileHash (Join-Path $out 'result.json')).Hash.ToLowerInvariant();endpointOpened=$false;gameLaunched=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $out 'validation.json') -Encoding utf8
Write-Output ('PASS synthetic transient bus; '+(Join-Path $out 'validation.json'))
