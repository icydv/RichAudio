[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
& (Join-Path $repo 'tools\Build-SurfaceObserver.ps1') -CoreOnly
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$output=Join-Path $repo 'build\surface-observation'
$test=Join-Path $output 'SurfaceAcquisition.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $output 'RichAudio.Surface.Core.dll')) ('/out:'+$test) (Join-Path $repo 'tests\Test-SurfaceAcquisition.cs')
if($LASTEXITCODE-ne0){throw 'Surface acquisition tests did not compile'}
$fixture=Join-Path $repo ('.local\surface-fixtures-'+[guid]::NewGuid().ToString('N'))
& $test $fixture
if($LASTEXITCODE-ne0){throw 'Surface acquisition tests failed'}
& node (Join-Path $repo 'tests\Check-CSharpSurfaceFixture.mjs') (Join-Path $fixture 'synthetic-batch.json')
if($LASTEXITCODE-ne0){throw 'Independent cross-language contract test failed'}
