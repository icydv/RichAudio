[CmdletBinding()]
param([string]$SdkPath='',[switch]$CoreOnly)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo 'build\geometry-live'
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$core=@(Get-ChildItem (Join-Path $repo 'src\acoustics\geometry') -Filter '*.cs'|ForEach-Object FullName)
$core+=@(Get-ChildItem (Join-Path $repo 'src\acoustics\host\Transport') -Filter '*.cs'|ForEach-Object FullName)
$core+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src\acoustics\observation\'+$_)}
$options=@('/nologo','/optimize+','/warnaserror+','/langversion:5','/platform:x64','/target:library','/r:System.Runtime.Serialization.dll','/r:System.Web.Extensions.dll')
& $compiler @options ('/out:'+(Join-Path $out 'RichAudio.Geometry.Core.dll')) @core
if($LASTEXITCODE-ne0){throw 'Geometry core build failed'}
if(!$CoreOnly){
 if(!$SdkPath -or (Get-FileHash -LiteralPath $SdkPath).Hash-ne'5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0'){throw 'Explicit pinned authentic SDK required'}
 $adapter=@(Get-ChildItem (Join-Path $repo 'src\acoustics\bridge\Rph') -Filter '*.cs'|ForEach-Object FullName)
 & $compiler @options ('/r:'+$SdkPath) ('/out:'+(Join-Path $out 'RichAudio.Beacon.Geometry.Rph.dll')) @core @adapter
 if($LASTEXITCODE-ne0){throw 'Authentic RPH adapter compilation failed'}
}
Write-Output 'Compiled geometry publisher only; no game launch, deployment or audio device.'
