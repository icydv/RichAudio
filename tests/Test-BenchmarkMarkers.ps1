[CmdletBinding()]param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
& (Join-Path $repo 'tools\Build-BenchmarkMarkers.ps1') -CoreOnly
$build=Join-Path $repo 'build\benchmark-markers';$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$exe=Join-Path $build 'BenchmarkMarkers.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $build 'RichAudio.Markers.Core.dll')) ('/out:'+$exe) (Join-Path $repo 'tests\Test-BenchmarkMarkers.cs')
if($LASTEXITCODE-ne0){throw 'Marker test build failed'}
$output=Join-Path $repo ('.local\marker-fixtures-'+[guid]::NewGuid().ToString('N'))
& $exe $output
if($LASTEXITCODE-ne0){throw 'Marker fixtures failed'}
& node (Join-Path $repo 'tests\Check-MarkerFixture.mjs') $output
if($LASTEXITCODE-ne0){throw 'Independent marker checks failed'}
