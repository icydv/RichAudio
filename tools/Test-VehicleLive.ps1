[CmdletBinding()]
param([string]$Output='',[switch]$BuildOnly)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$build=Join-Path $repo 'build\vehicle-live'
[IO.Directory]::CreateDirectory($build)|Out-Null
$sources=@(Get-ChildItem (Join-Path $repo 'src\acoustics\host\Windows') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@(Get-ChildItem (Join-Path $repo 'src\acoustics\host\Transport') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@(Get-ChildItem (Join-Path $repo 'src\acoustics\geometry') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src\acoustics\observation\'+$_)}
$sources+=Join-Path $repo 'tests\geometry-live\GeometryIntegration.cs'
$sources+=Join-Path $repo 'tests\geometry-live\VehicleIntegration.cs'
$options=@('/nologo','/optimize+','/warnaserror+','/unsafe+','/platform:x64','/langversion:5','/define:STATE_TRANSPORT,GEOMETRY_LIVE,GEOMETRY_FIXTURE,TRANSPORT_EXPIRY_TEST','/r:System.Runtime.Serialization.dll','/r:System.Web.Extensions.dll','/main:RichAudio.Beacon.Windows.VehicleIntegration')
$exe=Join-Path $build 'RichAudio.VehicleLive.Tests.exe'
& $compiler @options ('/out:'+$exe) @sources
if($LASTEXITCODE-ne0){
  $ci=Join-Path $repo '.local\vehicle-ci-evidence'
  [IO.Directory]::CreateDirectory($ci)|Out-Null
  @{schemaVersion=1;milestone='VEHICLE-LIVE-01';status='failed';stage='build';gameLaunched=$false;audioEndpointOpened=$false;failure=@{kind='native-compilation'}}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $ci 'result.json') -Encoding utf8
  throw 'Actual vehicle integration compilation failed'
}
if($BuildOnly){return}
if(!$Output){$Output=Join-Path $repo ('.local\vehicle-live-'+[guid]::NewGuid().ToString('N'))}
$Output=[IO.Path]::GetFullPath($Output)
$prefix=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+[IO.Path]::DirectorySeparatorChar
if(!$Output.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Private repository .local output required'}
for($dir=[IO.DirectoryInfo]::new($Output);$null-ne$dir;$dir=$dir.Parent){if($dir.Exists-and($dir.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output rejected'}}
if(Test-Path -LiteralPath $Output){throw 'Fresh fixture output required'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
& node (Join-Path $repo 'tools\Run-VehicleLiveProof.mjs') $repo $Output $exe
if($LASTEXITCODE-ne0){throw ('Actual vehicle proof failed; incomplete evidence retained: '+$Output)}
Write-Output ('DEVICE-FREE vehicle proof: '+$Output)
