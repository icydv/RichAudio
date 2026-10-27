[CmdletBinding()]param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
& (Join-Path $repo 'tools\Build-TrafficCalibration.ps1') -CoreOnly
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$build=Join-Path $repo 'build\traffic-calibration'
$exe=Join-Path $build 'TrafficCalibration.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $build 'RichAudio.Traffic.Core.dll')) ('/out:'+$exe) (Join-Path $repo 'tests\Test-TrafficCalibration.cs')
if($LASTEXITCODE-ne0){throw 'Traffic test build failed'}
$fixture=Join-Path $repo ('.local\traffic-fixtures-'+[guid]::NewGuid().ToString('N'))
& $exe $fixture
if($LASTEXITCODE-ne0){throw 'Traffic lifecycle tests failed'}
& node (Join-Path $repo 'tests\Check-TrafficFixtures.mjs') $fixture
if($LASTEXITCODE-ne0){throw 'Independent traffic evidence interpretation failed'}
