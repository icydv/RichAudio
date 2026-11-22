$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
& (Join-Path $repo 'tools\Build-BatiController.ps1') -CoreOnly
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe';$build=Join-Path $repo 'build\bati-controller'
$output=Join-Path $repo ('.local\stop-diagnostic-tests-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($output)|Out-Null
& $compiler /nologo /optimize+ /warnaserror+ /main:StopBoundaryTests /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $build 'RichAudio.Bati.Core.dll')) ('/out:'+(Join-Path $build 'StopBoundary.Tests.exe')) (Join-Path $repo 'tests\Test-BatiController.cs') (Join-Path $repo 'tests\Test-StopBoundaryDiagnostics.cs')
if($LASTEXITCODE){throw 'Stop diagnostics compilation failed'}
& (Join-Path $build 'StopBoundary.Tests.exe') $output
if($LASTEXITCODE){throw 'Stop diagnostics tests failed'}
