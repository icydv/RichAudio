#requires -Version 7.0
[CmdletBinding()]param([string]$Output=('.local/vehicle-observation03-'+[guid]::NewGuid().ToString('N')),[string]$ReferenceSdkPath)
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
if($Output-notmatch'^\.local[/\\][A-Za-z0-9_-]+$'){throw 'Fresh private fixture output required'}
$out=[IO.Path]::GetFullPath((Join-Path $repo $Output));if(Test-Path -LiteralPath $out){throw 'Fixture output already exists'}
for($at=[IO.DirectoryInfo]::new($out);$at;$at=$at.Parent){if($at.Exists-and($at.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output refused'}}
[void][IO.Directory]::CreateDirectory($out)
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$core=Join-Path $repo 'src/acoustics/observation/VehicleObservation03.cs';$binding=Join-Path $repo 'src/acoustics/bridge/Rph/VehicleObservation03.Rph.cs'
$contact=Join-Path $repo 'src/acoustics/observation/VehicleContactObservation03.cs'
$exe=Join-Path $out 'VehicleObservation03.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /define:VEHICLE_OBSERVATION_03_RPH /r:System.Web.Extensions.dll ('/out:'+$exe) $core $contact $binding (Join-Path $repo 'tests/host/FakeVehicleRph03.cs') (Join-Path $repo 'tests/host/TestVehicleObservation03.cs')
if($LASTEXITCODE-ne0){throw 'Read-only observation fixture failed to compile'}
& $exe $out
if($LASTEXITCODE-ne0){throw 'Read-only observation fixture failed'}
& node (Join-Path $repo 'tests/Check-VehicleObservation03.mjs') (Join-Path $out 'authored-csharp-observations.json') (Join-Path $out 'authored-csharp-contacts.json')
if($LASTEXITCODE-ne0){throw 'Native authored capture and JS replay contract disagree'}
if($ReferenceSdkPath){
 $expected='1f8a8a88a511d8c6d4aacd196e72b5192970b730f4070606d8bfac63ed722d45'
 if((Get-FileHash -LiteralPath $ReferenceSdkPath -Algorithm SHA256).Hash.ToLowerInvariant()-cne$expected){throw 'Unreviewed reference SDK; no source binding compiled'}
 & $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /target:library /define:VEHICLE_OBSERVATION_03_RPH ('/r:'+[IO.Path]::GetFullPath($ReferenceSdkPath)) ('/out:'+(Join-Path $out 'VehicleObservation03.ReferenceCompileOnly.dll')) $core $contact $binding
 if($LASTEXITCODE-ne0){throw 'Candidate does not compile against retained declaration SDK'}
 [ordered]@{passed=$true;sdkSha256=$expected;scope='Reference declarations compile only; assembly not loaded or executed';runtimeVerified=$false;endpointOpened=$false;gameLaunched=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $out 'reference-compile.json') -Encoding utf8NoBOM
}
$report=Get-Content -LiteralPath (Join-Path $out 'validation.json') -Raw|ConvertFrom-Json
$report|ConvertTo-Json -Depth 5
Write-Output ('Private authored observation trace: '+(Join-Path $out 'authored-csharp-observations.json'))
