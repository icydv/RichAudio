#requires -Version 7.0
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo ('.local/private-profile-probe-fixture-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$exe=Join-Path $out 'probe-fixture.exe'
& $compiler /nologo /target:exe /main:TestPrivateProfileProbe01 /platform:x64 /langversion:5 /warnaserror+ /r:Microsoft.CSharp.dll ('/out:'+$exe) (Join-Path $repo 'tools/native-control/ProfileProbe.Rph.cs') (Join-Path $repo 'tools/native-control/ReadVehicleHorn.Rph.cs') (Join-Path $repo 'tests/host/TestPrivateProfileProbe01.cs')
if($LASTEXITCODE){throw 'Authored profile probe build failed'}
& $exe
if($LASTEXITCODE){throw 'Authored profile probe fixture failed'}
