[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo 'build\vehicle-live-01'
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$sources=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src\acoustics\host\Transport') -Filter '*.cs'|ForEach-Object FullName)
$binary=Join-Path $out 'RichAudio.VehicleEvidence.Tests.exe'
& $compiler '/nologo' '/optimize+' '/warnaserror+' '/platform:x64' '/target:exe' '/r:System.Runtime.Serialization.dll' ('/out:'+$binary) @sources (Join-Path $repo 'tests\host\TestVehicleEvidence.cs')
if($LASTEXITCODE-ne0){throw 'Vehicle evidence compilation failed.'}
& $binary
if($LASTEXITCODE-ne0){throw 'Vehicle evidence tests failed.'}
