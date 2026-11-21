[CmdletBinding()]
param([string]$Candidate='',[string]$RphExecutable='',[switch]$RingOnly,[string]$CompileObservationOwner='')
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot;$out=Join-Path $repo 'build/playable-tests';[IO.Directory]::CreateDirectory($out)|Out-Null
$sources=@('src/acoustics/host/Transport','src/acoustics/host/Windows','src/acoustics/recording','src/acoustics/geometry')|ForEach-Object{Get-ChildItem -LiteralPath (Join-Path $repo $_) -Filter '*.cs'|ForEach-Object FullName}
$sources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src/acoustics/observation/'+$_)}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$binary=Join-Path $out 'RichAudio.Gameplay.Tests.exe'
if($CompileObservationOwner){
    $scope=[IO.Path]::GetFullPath($CompileObservationOwner).TrimEnd([IO.Path]::DirectorySeparatorChar)
    $privateRoot=[IO.Path]::GetFullPath((Join-Path $repo '.local/street01'))+'\'
    if(!$scope.StartsWith($privateRoot,[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $scope)){throw 'Fresh private observation fixture directory required'}
    for($dir=Split-Path -Parent $scope;$dir;$dir=Split-Path -Parent $dir){
        if((Test-Path -LiteralPath $dir) -and ((Get-Item -LiteralPath $dir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked observation fixture output'}
    }
    [IO.Directory]::CreateDirectory($scope)|Out-Null
    $versionSource=Join-Path $scope 'AuthoredGameVersion.cs'
    '[assembly:System.Reflection.AssemblyFileVersion("1.0.1158.16")]' | Set-Content -LiteralPath $versionSource
    $sources+=$versionSource
    $binary=Join-Path $scope 'GTA5_Enhanced.exe'
}
& $compiler /nologo /optimize+ /warnaserror+ /unsafe+ /langversion:5 /platform:x64 /define:STATE_TRANSPORT,GEOMETRY_LIVE /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll /main:TestGameplay ('/out:'+$binary) @sources (Join-Path $repo 'tests/host/TestGameplay.cs')
if($LASTEXITCODE -ne 0){throw 'Gameplay fixture compilation failed'}
if($CompileObservationOwner){Write-Output $binary;return}
if($RingOnly){& $binary --ring-only;if($LASTEXITCODE -ne 0){throw 'Measured reserve regression failed'};exit}
if(!$Candidate -or !$RphExecutable){throw 'Supply Candidate and RphExecutable for the actual device-free chain'}
& $binary $Candidate $RphExecutable
if($LASTEXITCODE -ne 0){throw 'Actual gameplay chain failed; no endpoint opened'}
