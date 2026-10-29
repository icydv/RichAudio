[CmdletBinding()]
param([string]$Output='',[switch]$BuildOnly,[switch]$SkipBaseline)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$build=Join-Path $repo 'build\listener-startup'
[IO.Directory]::CreateDirectory($build)|Out-Null
$sources=@(Get-ChildItem (Join-Path $repo 'src\acoustics\host\Windows') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@(Get-ChildItem (Join-Path $repo 'src\acoustics\host\Transport') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@(Get-ChildItem (Join-Path $repo 'src\acoustics\geometry') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src\acoustics\observation\'+$_)}
$sources+=Join-Path $repo 'tests\geometry-live\GeometryIntegration.cs'
$sources+=Join-Path $repo 'tests\geometry-live\ListeningIntegration.cs'
$options=@('/nologo','/optimize+','/warnaserror+','/unsafe+','/platform:x64','/langversion:5','/define:STATE_TRANSPORT,GEOMETRY_LIVE,GEOMETRY_FIXTURE','/r:System.Runtime.Serialization.dll','/r:System.Web.Extensions.dll','/main:RichAudio.Beacon.Windows.ListeningIntegration')
$exe=Join-Path $build 'RichAudio.Listening.Tests.exe'
& $compiler @options ('/out:'+$exe) @sources
if($LASTEXITCODE-ne0){throw 'Actual listening integration compilation failed'}
if($BuildOnly){return}
if(!$Output){$Output=Join-Path $repo ('.local\listener-startup-'+[guid]::NewGuid().ToString('N'))}
$Output=[IO.Path]::GetFullPath($Output)
$prefix=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+[IO.Path]::DirectorySeparatorChar
if(!$Output.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Private repository .local output required'}
for($dir=[IO.DirectoryInfo]::new($Output);$null-ne$dir;$dir=$dir.Parent){if($dir.Exists-and($dir.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output rejected'}}
if(Test-Path -LiteralPath $Output){throw 'Fresh fixture output required'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$legacyRoot='';$legacyExe=''
if(!$SkipBaseline){
 $legacyRoot=Join-Path $Output 'candidate08-source'
 $archive=Join-Path $Output 'candidate08-source.zip'
 & git -C $repo archive --format=zip ('--output='+$archive) 9e159f8a33a7e428593ac1f34c466560dd7bb623
 if($LASTEXITCODE-ne0){throw 'Exact Candidate08 baseline source extraction failed'}
 Expand-Archive -LiteralPath $archive -DestinationPath $legacyRoot
 $legacyRelay=Join-Path $legacyRoot 'src\acoustics\geometry\GeometryHostRelay.cs'
 $baselineSources=@($sources|Where-Object{$_-ne(Join-Path $repo 'src\acoustics\geometry\GeometryHostRelay.cs')})+$legacyRelay
 $legacyExe=Join-Path $build 'RichAudio.Listening.Baseline.Tests.exe'
 & $compiler @options ('/out:'+$legacyExe) @baselineSources
 if($LASTEXITCODE-ne0){throw 'Candidate08 actual relay integration compilation failed'}
}
& node (Join-Path $repo 'tools\Run-ListenerStartupProof.mjs') $repo $Output $exe $legacyRoot $legacyExe
if($LASTEXITCODE-ne0){throw ('Actual combined startup proof failed; incomplete evidence retained: '+$Output)}
Write-Output ('DEVICE-FREE combined listening proof: '+$Output)
