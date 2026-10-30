[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo 'build\passive-soundmap'
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$sources=@('AcousticSettings.cs','InGameSettingsBridge.cs','MenuDiagnostic.cs','PassiveSoundMapBridge.cs')|ForEach-Object{Join-Path $repo ('src\acoustics\host\Windows\'+$_)}
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /r:System.Web.Extensions.dll /main:TestPassiveSoundMap ('/out:'+(Join-Path $out 'RichAudio.Passive.Tests.exe')) @sources (Join-Path $repo 'tests\host\TestPassiveSoundMap.cs')
if($LASTEXITCODE-ne0){throw 'Passive camera fixture compilation failed'}
& node --test (Join-Path $repo 'tests\Test-SoundMapPassive.mjs')
if($LASTEXITCODE-ne0){throw 'Passive camera actual component integration failed'}
