[CmdletBinding()]param()
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
& (Join-Path $repo 'tools\Build-BatiController.ps1') -CoreOnly
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe';$build=Join-Path $repo 'build\bati-controller'
& $compiler /nologo /optimize+ /warnaserror+ /main:ModKitTests /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $build 'RichAudio.Bati.Core.dll')) ('/out:'+(Join-Path $build 'ModKit.Tests.exe')) (Join-Path $repo 'tests\Test-BatiController.cs') (Join-Path $repo 'tests\Test-ModKitContract.cs')
if($LASTEXITCODE){throw 'Mod-kit contract test compilation failed'}
$output=Join-Path $repo ('.local\mod-kit-fixtures-'+[guid]::NewGuid().ToString('N'))
& (Join-Path $build 'ModKit.Tests.exe') $output
if($LASTEXITCODE){throw 'Mod-kit contract tests failed'}
& node (Join-Path $repo 'tests\Check-ModKitContract.mjs') $output
if($LASTEXITCODE){throw 'Independent mod-kit checks failed'}
Write-Output ('Original synthetic diagnostic output: '+$output)
