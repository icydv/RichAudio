#requires -Version 7.0
[CmdletBinding()]param()
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot;$out=Join-Path $repo ('.local/latency-03/admission-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($out)|Out-Null
$files=@('src/acoustics/experiments/Latency03WorkerAdmission.cs','tests/host/TestLatency03Admission.cs');$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$exe=Join-Path $out 'Admission.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /r:System.Web.Extensions.dll ('/out:'+$exe) @($files|ForEach-Object{Join-Path $repo $_});if($LASTEXITCODE-ne0){throw 'Admission fixture compile failed.'}
& $exe (Join-Path $out 'fixture')|Set-Content -LiteralPath (Join-Path $out 'result.json') -Encoding utf8;if($LASTEXITCODE-ne0){throw 'Admission fixture failed.'}
Write-Output ('PASS one-shot exact worker admission; '+$out)
