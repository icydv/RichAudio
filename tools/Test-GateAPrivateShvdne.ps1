#requires -Version 7.0
param([Parameter(Mandatory)][string]$Output)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=[IO.Path]::GetFullPath($Output)
$private=[IO.Path]::GetFullPath((Join-Path $repo '.local')).TrimEnd('\')+'\'
if(!$out.StartsWith($private,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Fresh repository .local output required'}
for($part=[IO.DirectoryInfo]::new($out);$null-ne$part;$part=$part.Parent){if($part.Exists-and($part.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked output refused'}}
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$exe=Join-Path $out 'GateAPrivateShvdne.Fixture.exe'
$sources=@('tools/native-control/private-profile/PrivateAssignmentController.cs','tools/native-control/private-profile/PrivateProfile.Shvdne.cs','tools/native-control/private-profile/PrivateResourceAdmission.cs','tools/native-control/private-profile/SupervisorProtocol.cs','tests/host/TestGateAPrivateShvdne.cs')|ForEach-Object{Join-Path $repo $_}
& $compiler /nologo /target:exe /main:TestGateAPrivateShvdne /platform:x64 /langversion:5 /warnaserror+ /r:System.Core.dll /r:System.Windows.Forms.dll ('/out:'+$exe) @sources
if($LASTEXITCODE){throw 'Fixture compilation failed'}
& $exe 2>&1|Tee-Object -FilePath (Join-Path $out 'fixture.log')
if($LASTEXITCODE){throw 'Fixture execution failed'}
[ordered]@{schema=1;kind='GATE-A-SHVDNE-PRIVATE-01-probe-offline-fixtures';passed=$true;gameLaunched=$false;nativeDispatch='authored-stub-only';runtimeQualified=$false;sources=@($sources|ForEach-Object{[ordered]@{path=[IO.Path]::GetRelativePath($repo,$_);sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant()}});executableSha256=(Get-FileHash -LiteralPath $exe).Hash.ToLowerInvariant()}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $out 'result.json') -Encoding utf8
