param([string]$PluginPath='')
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$fixture=Join-Path $repo ('.local\menu-deployment-'+[guid]::NewGuid().ToString('N'))
$cache=Join-Path $fixture 'cache';[IO.Directory]::CreateDirectory($cache)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$assembly=Join-Path $cache 'RichAudio.Beacon.Rph.dll'
$options=@('/nologo','/optimize+','/warnaserror+','/langversion:5','/platform:x64','/r:System.Web.Extensions.dll')
if($PluginPath){[IO.File]::Copy([IO.Path]::GetFullPath($PluginPath),$assembly,$false)}else{
    # CI lacks the private RPH SDK. Compile the exact shared implementation;
    # the local pinned-SDK run additionally exercises the actual combined DLL.
    $sources=@('AcousticSettings.cs','MenuDiagnostic.cs','InGameSettingsBridge.cs','InGameRecordingBridge.cs')|ForEach-Object{Join-Path $repo ('src\acoustics\host\Windows\'+$_)}
    & $compiler @options /target:library ('/out:'+$assembly) @sources
    if($LASTEXITCODE-ne0){throw 'Deployment component build failed'}
}
$test=Join-Path $cache 'MenuDeployment.Tests.exe'
& $compiler @options ('/r:'+$assembly) ('/out:'+$test) (Join-Path $repo 'tests\host\TestMenuDeploymentLayout.cs')
if($LASTEXITCODE-ne0){throw 'Deployment fixture build failed'}
& $test $fixture $repo
if($LASTEXITCODE-ne0){throw 'Deployment-layout fixture failed'}
Write-Output ('CombinedPluginTested='+[bool]$PluginPath+'; retained private fixture evidence')
