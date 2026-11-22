#requires -Version 7.0
[CmdletBinding()]param()
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot;$out=Join-Path $repo ('.local/latency-03/admission-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($out)|Out-Null
$files=@('src/acoustics/experiments/Latency03WorkerAdmission.cs','tests/host/TestLatency03Admission.cs');$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$exe=Join-Path $out 'Admission.Tests.exe';$compilerSha=(Get-FileHash -LiteralPath $compiler -Algorithm SHA256).Hash.ToLowerInvariant()
$pins=@(($files+@('tools/Test-Latency03Admission.ps1'))|ForEach-Object{[ordered]@{file=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo $_) -Algorithm SHA256).Hash.ToLowerInvariant()}})
& $compiler /nologo /optimize+ /warnaserror+ /r:System.Web.Extensions.dll ('/out:'+$exe) @($files|ForEach-Object{Join-Path $repo $_});if($LASTEXITCODE-ne0){throw 'Admission fixture compile failed.'}
& $exe (Join-Path $out 'fixture')|Set-Content -LiteralPath (Join-Path $out 'result.json') -Encoding utf8;if($LASTEXITCODE-ne0){throw 'Admission fixture failed.'}
foreach($pin in $pins){if((Get-FileHash -LiteralPath (Join-Path $repo $pin.file) -Algorithm SHA256).Hash.ToLowerInvariant()-cne$pin.sha256){throw 'Admission source changed during test'}}
if((Get-FileHash -LiteralPath $compiler -Algorithm SHA256).Hash.ToLowerInvariant()-cne$compilerSha){throw 'Admission compiler changed during test'}
[ordered]@{schema=2;passed=$true;sourcePins=$pins;compilerSha256=$compilerSha;resultSha256=(Get-FileHash -LiteralPath (Join-Path $out 'result.json') -Algorithm SHA256).Hash.ToLowerInvariant();endpointOpened=$false;scope='Exact reviewed-root and single-use worker admission fixtures only'}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $out 'validation.json') -Encoding utf8
Write-Output ('PASS one-shot exact worker admission; '+$out)
