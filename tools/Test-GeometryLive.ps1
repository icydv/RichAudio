[CmdletBinding()]
param([switch]$BuildOnly,[string]$Output='',
 [ValidateSet('auto','performance','balanced','quality','max')][string]$AcousticQuality='',
 [ValidateSet('auto','cpu','gpu')][string]$AcousticAcceleration='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo 'build\geometry-live'
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$sources=@(Get-ChildItem (Join-Path $repo 'src\acoustics\host\Windows') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@(Get-ChildItem (Join-Path $repo 'src\acoustics\host\Transport') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@(Get-ChildItem (Join-Path $repo 'src\acoustics\geometry') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src\acoustics\observation\'+$_)}
$sources+=Join-Path $repo 'tests\geometry-live\GeometryIntegration.cs'
$exe=Join-Path $out 'Geometry.Integration.exe'
& $compiler /nologo /optimize+ /warnaserror+ /unsafe+ /platform:x64 /langversion:5 /define:STATE_TRANSPORT,GEOMETRY_LIVE,GEOMETRY_FIXTURE /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll /main:RichAudio.Beacon.Windows.GeometryIntegration ('/out:'+$exe) @sources
if($LASTEXITCODE-ne0){throw 'Geometry integration compilation failed'}
if(!$BuildOnly){
 if(!$Output){$Output=Join-Path $repo ('.local\geometry-relay-'+[guid]::NewGuid().ToString('N'))}
 $Output=[IO.Path]::GetFullPath($Output)
 $prefix=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+[IO.Path]::DirectorySeparatorChar
 if(!$Output.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Fixture output must be private repository .local storage'}
 for($p=[IO.DirectoryInfo]::new($Output);$null-ne$p;$p=$p.Parent){if($p.Exists-and($p.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output rejected'}}
 if(Test-Path -LiteralPath $Output){throw 'Fresh fixture output required'}
 $fixtureArguments=@($repo,$Output)
 if($AcousticQuality -or $AcousticAcceleration){
  if(!$AcousticQuality){$AcousticQuality='auto'}
  if(!$AcousticAcceleration){$AcousticAcceleration='auto'}
  $AcousticQuality=$AcousticQuality.ToLowerInvariant()
  $AcousticAcceleration=$AcousticAcceleration.ToLowerInvariant()
  $fixtureArguments+=@($AcousticQuality,$AcousticAcceleration)
 }
 & $exe @fixtureArguments
 if($LASTEXITCODE-ne0){throw 'Actual publisher/host/producer integration failed'}
 & node (Join-Path $repo 'tools\Check-GeometryRelay.mjs') $Output
 if($LASTEXITCODE-ne0){throw 'Actual geometry relay PCM verification failed'}
 Write-Output ('DEVICE-FREE geometry evidence: '+$Output)
}
