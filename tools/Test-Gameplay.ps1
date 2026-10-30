[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Candidate,[Parameter(Mandatory=$true)][string]$RphExecutable)
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot;$out=Join-Path $repo 'build/playable-tests';[IO.Directory]::CreateDirectory($out)|Out-Null
$sources=@('src/acoustics/host/Transport','src/acoustics/host/Windows','src/acoustics/geometry')|ForEach-Object{Get-ChildItem -LiteralPath (Join-Path $repo $_) -Filter '*.cs'|ForEach-Object FullName}
$sources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src/acoustics/observation/'+$_)}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$binary=Join-Path $out 'RichAudio.Gameplay.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /unsafe+ /langversion:5 /platform:x64 /define:STATE_TRANSPORT,GEOMETRY_LIVE /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll /main:TestGameplay ('/out:'+$binary) @sources (Join-Path $repo 'tests/host/TestGameplay.cs')
if($LASTEXITCODE -ne 0){throw 'Gameplay fixture compilation failed'}
& $binary $Candidate $RphExecutable
if($LASTEXITCODE -ne 0){throw 'Actual gameplay chain failed; no endpoint opened'}
