[CmdletBinding()]
param([switch]$Tests)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo 'build\acoustic-settings'
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$sources=@((Join-Path $repo 'src\acoustics\host\Windows\AcousticSettings.cs'),(Join-Path $repo 'src\acoustics\host\Windows\InGameSettingsBridge.cs'),(Join-Path $repo 'src\acoustics\settings\AcousticSettingsWindow.cs'))
$options=@('/nologo','/optimize+','/warnaserror+','/platform:x64','/r:System.Web.Extensions.dll','/r:System.Windows.Forms.dll','/r:System.Drawing.dll')
$sources+=Join-Path $repo 'src\acoustics\host\Windows\MenuDiagnostic.cs'
& $compiler @options /target:winexe /main:RichAudio.Settings.SettingsProgram ('/out:'+(Join-Path $out 'RichAudio.Settings.exe')) @sources
if($LASTEXITCODE-ne0){throw 'Acoustic settings UI compilation failed'}
if($Tests){
 & $compiler @options /target:exe /main:RichAudio.Settings.Tests.SettingsTests ('/out:'+(Join-Path $out 'RichAudio.Settings.Tests.exe')) @sources (Join-Path $repo 'tests\host\TestAcousticSettings.cs')
 if($LASTEXITCODE-ne0){throw 'Acoustic settings fixture compilation failed'}
 & (Join-Path $out 'RichAudio.Settings.Tests.exe') $repo
 if($LASTEXITCODE-ne0){throw 'Acoustic settings persistence/UI/monitor tests failed'}
 & $compiler @options /target:exe /main:RichAudio.Settings.Tests.InGameSettingsBridgeTests ('/out:'+(Join-Path $out 'RichAudio.Menu.Bridge.Tests.exe')) @sources (Join-Path $repo 'tests\host\TestInGameSettingsBridge.cs')
 if($LASTEXITCODE-ne0){throw 'In-game settings bridge fixture compilation failed'}
 & (Join-Path $out 'RichAudio.Menu.Bridge.Tests.exe') $repo
 if($LASTEXITCODE-ne0){throw 'In-game preference persistence/bridge fixtures failed'}
}
Write-Output 'Built functional settings editor; no UI, host, audio endpoint or game was launched by the build.'
