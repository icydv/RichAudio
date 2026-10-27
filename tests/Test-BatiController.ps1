[CmdletBinding()]param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
& (Join-Path $repo 'tools\Build-BatiController.ps1') -CoreOnly
$build=Join-Path $repo 'build\bati-controller';$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$exe=Join-Path $build 'Bati.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $build 'RichAudio.Bati.Core.dll')) ('/out:'+$exe) (Join-Path $repo 'tests\Test-BatiController.cs')
if($LASTEXITCODE){throw 'Bati synthetic test build failed'}
$output=Join-Path $repo ('.local\bati-fixtures-'+[guid]::NewGuid().ToString('N'))
& $exe $output
if($LASTEXITCODE){throw 'Bati synthetic tests failed'}
& node (Join-Path $repo 'tests\Check-BatiFixtures.mjs') $output
if($LASTEXITCODE){throw 'Independent Bati fixture checks failed'}
Write-Output ('Bati synthetic evidence: '+$output)
