[CmdletBinding()]param()
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
& (Join-Path $repo 'tools\Build-BatiController.ps1') -CoreOnly
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe';$build=Join-Path $repo 'build\bati-controller'
& $compiler /nologo /optimize+ /warnaserror+ /main:FiveStopTests /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $build 'RichAudio.Bati.Core.dll')) ('/out:'+(Join-Path $build 'FiveStop.Tests.exe')) (Join-Path $repo 'tests\Test-BatiController.cs') (Join-Path $repo 'tests\Test-FiveStopController.cs')
if($LASTEXITCODE){throw 'Five-stop tests compilation failed'}
$output=Join-Path $repo ('.local\five-stop-fixtures-'+[guid]::NewGuid().ToString('N'))
& (Join-Path $build 'FiveStop.Tests.exe') $output
if($LASTEXITCODE){throw 'Five-stop tests failed'}
& node (Join-Path $repo 'tests\Check-FiveStopController.mjs') $output
if($LASTEXITCODE){throw 'Independent five-stop checks failed'}
Write-Output ('Five-stop synthetic output: '+$output)
