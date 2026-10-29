[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$output=Join-Path $repo 'build\in-game-settings'
[IO.Directory]::CreateDirectory($output)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$sources=@('AcousticSettings.cs','InGameSettingsBridge.cs','InGameRecordingBridge.cs')|ForEach-Object{Join-Path $repo ('src\acoustics\host\Windows\'+$_)}
$sources+=Join-Path $repo 'tests\host\TestInGameRecording.cs'
$test=Join-Path $output 'RichAudio.InGameRecording.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /r:System.Web.Extensions.dll /main:TestInGameRecording ('/out:'+$test) @sources
if($LASTEXITCODE-ne0){throw 'Recording menu bridge compilation failed'}
& $test (Join-Path $repo ('.local\recording-menu-fixture-'+[guid]::NewGuid().ToString('N')))
if($LASTEXITCODE-ne0){throw 'Recording menu bridge device-free tests failed'}
