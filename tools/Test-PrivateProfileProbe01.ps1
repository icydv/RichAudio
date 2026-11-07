#requires -Version 7.0
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo ('.local/private-profile-probe-fixture-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$exe=Join-Path $out 'probe-fixture.exe'
$sources=@('ProfileProbe.Rph.cs','ProfileProbeInput.cs','ObservationKeys.Rph.cs','ObservationSession.cs','ReadVehicleHorn.Rph.cs')|ForEach-Object{Join-Path $repo ('tools/native-control/'+$_)}
& $compiler /nologo /target:exe /main:TestPrivateProfileProbe01 /platform:x64 /langversion:5 /warnaserror+ /define:OBSERVATION_AUTHORED_FOCUS /r:Microsoft.CSharp.dll /r:System.Windows.Forms.dll /r:System.Runtime.Serialization.dll ('/out:'+$exe) @sources (Join-Path $repo 'tests/host/TestPrivateProfileProbe01.cs')
if($LASTEXITCODE){throw 'Authored profile probe build failed'}
& $exe
if($LASTEXITCODE){throw 'Authored profile probe fixture failed'}
