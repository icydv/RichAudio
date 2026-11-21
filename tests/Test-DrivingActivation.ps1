$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
& (Join-Path $repo 'tools\Build-BatiController.ps1') -CoreOnly
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe';$build=Join-Path $repo 'build\bati-controller'
& $compiler /nologo /optimize+ /warnaserror+ /main:DrivingActivationTests /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $build 'RichAudio.Bati.Core.dll')) ('/out:'+(Join-Path $build 'DrivingActivation.Tests.exe')) (Join-Path $repo 'tests\Test-BatiController.cs') (Join-Path $repo 'tests\Test-DrivingActivation.cs')
if($LASTEXITCODE){throw 'Activation compilation failed'}
& (Join-Path $build 'DrivingActivation.Tests.exe')
if($LASTEXITCODE){throw 'Activation tests failed'}
