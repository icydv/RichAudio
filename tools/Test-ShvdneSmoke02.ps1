#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$HostBinary,[Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$output=[IO.Path]::GetFullPath($OutputRoot)
if(!$output.StartsWith([IO.Path]::GetFullPath((Join-Path $repo '.local'))+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'Fresh private offline fixture output required'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture path refused'}}
$api=Join-Path $repo '.local/shvdne-reference/release/ScriptHookVDotNet3.dll'
if((Get-FileHash -LiteralPath $api).Hash-ne'1E4D0BC4D34D05A6038FC87EEDE492D3DC4265522DE473EC19CDF6746B5B0E48'){throw 'Pinned authentic API3 bytes required'}
[IO.Directory]::CreateDirectory($output)|Out-Null
$sources=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics/host/Transport') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@('src/acoustics/host/Windows/GameplayRuntime.cs','src/acoustics/host/Windows/AcousticSettings.cs','src/acoustics/bridge/Integration/ShvdneHostController.cs','src/acoustics/bridge/Integration/ShvdneConfiguration.cs','src/acoustics/bridge/Integration/GameObservations.cs','src/acoustics/bridge/Integration/CameraListenerTracker.cs','src/acoustics/bridge/Integration/SharedFrameSampler.cs','tests/host/TestShvdneSmoke02.cs')|ForEach-Object{Join-Path $repo $_}
$binary=Join-Path $output 'GTA5_Enhanced.exe' # Authored fixture, never the installed game.
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll /main:TestShvdneSmoke02 ('/out:'+$binary) @sources
if($LASTEXITCODE-ne0){throw 'Smoke-02 offline fixture compilation failed'}
& $binary $output $api ([IO.Path]::GetFullPath($HostBinary)) 2>&1 | Tee-Object -FilePath (Join-Path $output 'fixture.log')
if($LASTEXITCODE-ne0){throw 'Smoke-02 offline fixtures failed'}
