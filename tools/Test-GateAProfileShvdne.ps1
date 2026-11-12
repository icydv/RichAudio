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
$exe=Join-Path $out 'GateAProfileShvdne.Fixture.exe'
& $compiler /nologo /target:exe /main:TestGateAProfileShvdne /platform:x64 /langversion:5 /warnaserror+ /r:System.Core.dll /r:System.Windows.Forms.dll ('/out:'+$exe) (Join-Path $repo 'tools/native-control/ProfileAssignmentController.cs') (Join-Path $repo 'tools/native-control/GateAProfile01.Shvdne.cs') (Join-Path $repo 'tests/host/TestGateAProfileShvdne.cs')
if($LASTEXITCODE){throw 'Fixture compilation failed'}
& $exe 2>&1|Tee-Object -FilePath (Join-Path $out 'fixture.log')
if($LASTEXITCODE){throw 'Fixture execution failed'}
