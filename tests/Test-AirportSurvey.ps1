[CmdletBinding()]param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
& (Join-Path $repo 'tools\Build-AirportSurvey.ps1') -CoreOnly
$build=Join-Path $repo 'build\airport-survey'
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /optimize+ /warnaserror+ /r:System.Runtime.Serialization.dll ('/r:'+(Join-Path $build 'RichAudio.Survey.Core.dll')) ('/out:'+(Join-Path $build 'Survey.Tests.exe')) (Join-Path $repo 'tests\Test-AirportSurvey.cs')
if($LASTEXITCODE){throw 'Survey test compilation failed'}
$output=Join-Path $repo ('.local\survey-fixtures-'+[guid]::NewGuid().ToString('N'))
& (Join-Path $build 'Survey.Tests.exe') $output
if($LASTEXITCODE){throw 'Survey assertions failed'}
& node (Join-Path $repo 'tests\Check-AirportSurvey.mjs') $output
if($LASTEXITCODE){throw 'Independent survey checks failed'}
Write-Output ('Survey original synthetic results: '+$output)
