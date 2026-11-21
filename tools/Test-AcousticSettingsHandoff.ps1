[CmdletBinding()]
param([switch]$BuildOnly)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo 'build\acoustic-settings'
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$sources=@(Get-ChildItem (Join-Path $repo 'src\acoustics\host\Windows'),(Join-Path $repo 'src\acoustics\host\Transport'),(Join-Path $repo 'src\acoustics\geometry') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src\acoustics\observation\'+$_)}
$sources+=Join-Path $repo 'src\acoustics\settings\AcousticSettingsWindow.cs'
$sources+=@(Get-ChildItem (Join-Path $repo 'src\acoustics\settings\InGame') -Filter '*.cs'|ForEach-Object FullName)
$sources+=Join-Path $repo 'tests\host\AcousticSettingsHandoff.cs'
$exe=Join-Path $out 'RichAudio.Settings.Handoff.exe'
& $compiler /nologo /optimize+ /unsafe+ /warnaserror+ /platform:x64 /define:STATE_TRANSPORT,GEOMETRY_LIVE /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /main:RichAudio.Beacon.Windows.AcousticSettingsHandoff ('/out:'+$exe) @sources
if($LASTEXITCODE-ne0){throw 'Actual settings handoff compilation failed'}
if(!$BuildOnly){& $exe $repo;if($LASTEXITCODE-ne0){throw 'Actual UI/settings/host/producer handoff failed'}}
