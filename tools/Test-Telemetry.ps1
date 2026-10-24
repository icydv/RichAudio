[CmdletBinding()]
param([switch]$BuildAdapter)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'Build-Telemetry.ps1') -CoreOnly:(!$BuildAdapter)
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$output=Join-Path $repo 'build\telemetry'
$sources=@(Get-ChildItem (Join-Path $repo 'tests\telemetry') -Filter '*.cs' | ForEach-Object FullName)
$sources+=@(Get-ChildItem (Join-Path $repo 'src\telemetry\Analysis') -Filter '*.cs' | ForEach-Object FullName)
& $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /target:exe /main:RichAudio.Tests.TestCore /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $output 'RichAudio.Telemetry.Core.dll')) ('/out:'+(Join-Path $output 'RichAudio.Telemetry.Tests.exe')) @sources
if($LASTEXITCODE -ne 0){throw 'Telemetry test compilation failed.'}
$run=Join-Path $repo ('.local\telemetry-tests-'+[guid]::NewGuid().ToString('N'))
& (Join-Path $output 'RichAudio.Telemetry.Tests.exe') $run
if($LASTEXITCODE -ne 0){throw 'Telemetry tests failed.'}
Copy-Item -LiteralPath (Join-Path $run 'test-results.json') -Destination (Join-Path $repo 'evidence\phase2\test-results.json')
Copy-Item -LiteralPath (Join-Path $run 'mock-session.jsonl') -Destination (Join-Path $repo 'tests\fixtures\mock-session.jsonl')
& (Join-Path $output 'RichAudio.Telemetry.Analysis.exe') (Join-Path $run 'mock-session.jsonl') (Join-Path $repo 'evidence\phase2\mock-analysis.json')
if($LASTEXITCODE -ne 0){throw 'Mock fixture analysis failed.'}
if($BuildAdapter){
 $frameworkShell=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
 & $frameworkShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Audit-Telemetry.ps1')
 if($LASTEXITCODE -ne 0){throw 'Adapter metadata/source audit failed.'}
}
Write-Output ('Artifacts: '+$run)
