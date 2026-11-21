[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
& (Join-Path $repo 'tools\Build-GeometryObserver.ps1') -CoreOnly
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$output=Join-Path $repo 'build\geometry-observation'
$test=Join-Path $output 'GeometryObservation.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $output 'RichAudio.Geometry.Core.dll')) ('/out:'+$test) (Join-Path $repo 'tests\Test-GeometryObservation.cs')
if($LASTEXITCODE-ne0){throw 'Geometry contract test compilation failed'}
& $test (Join-Path $repo ('.local\geometry-fixtures-'+[guid]::NewGuid().ToString('N')))
if($LASTEXITCODE-ne0){throw 'Geometry observation tests failed'}
