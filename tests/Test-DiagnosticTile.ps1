[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
& (Join-Path $repo 'tools\Build-TileObserver.ps1') -CoreOnly
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$output=Join-Path $repo 'build\tile-observation'
$test=Join-Path $output 'DiagnosticTile.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $output 'RichAudio.Tile.Core.dll')) ('/out:'+$test) (Join-Path $repo 'tests\Test-DiagnosticTile.cs')
if($LASTEXITCODE-ne0){throw 'Tile test build failed'}
$fixture=Join-Path $repo ('.local\tile-fixtures-'+[guid]::NewGuid().ToString('N'))
& $test $fixture
if($LASTEXITCODE-ne0){throw 'Tile tests failed'}
& node (Join-Path $repo 'tests\Check-CSharpTileFixture.mjs') $fixture
if($LASTEXITCODE-ne0){throw 'Independent tile checks failed'}
