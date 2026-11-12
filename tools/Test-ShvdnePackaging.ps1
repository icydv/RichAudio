#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$BuildReceipt,[string]$PackageRoot='')
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
$build=Get-Content -LiteralPath $BuildReceipt -Raw|ConvertFrom-Json
$out=Join-Path $repo ('.local/migration-shvdne-01/packaging-fixture-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sources=@(Get-ChildItem (Join-Path $repo 'src/acoustics/host/Transport') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@('src/acoustics/bridge/Integration/ShvdneConfiguration.cs','src/acoustics/bridge/Integration/ShvdnePackageLinks.cs','src/acoustics/host/Windows/AcousticSettings.cs','tests/host/TestShvdnePackaging.cs')|ForEach-Object{Join-Path $repo $_}
$exe=Join-Path $out 'Packaging.Tests.exe'
& $compiler /nologo /target:exe /platform:x64 /langversion:5 /warnaserror+ /r:Microsoft.CSharp.dll /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll ('/out:'+$exe) @sources
if($LASTEXITCODE-ne0){throw 'Packaging fixture compile failed.'}
& $exe $out $build.integration $build.host $PackageRoot 2>&1|Tee-Object -FilePath (Join-Path $out 'fixture.log')
if($LASTEXITCODE-ne0){throw 'Packaging fixture failed.'}
