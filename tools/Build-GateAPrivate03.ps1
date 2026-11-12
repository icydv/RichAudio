#requires -Version 7.0
param([Parameter(Mandatory)][string]$Output)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$task=Join-Path $repo '.local/gate-a-shvdne-private-03'
$out=[IO.Path]::GetFullPath($Output)
if(!$out.StartsWith(([IO.Path]::GetFullPath($task).TrimEnd('\')+'\'),[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Fresh PRIVATE03 output required'}
for($at=$out;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked output refused'}}
$api=Join-Path $repo '.local/shvdne-reference/release/ScriptHookVDotNet3.dll'
if((Get-FileHash -LiteralPath $api).Hash.ToLowerInvariant()-cne'1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48'){throw 'Pinned API3 required'}
New-Item -ItemType Directory -Path $out|Out-Null
$folder=Join-Path $repo 'tools/native-control/private-profile03'
$common=@('PrivateAssignmentController03.cs','PrivateProfile03.Shvdne.cs','PrivateResourceAdmission03.cs')|ForEach-Object{Join-Path $folder $_}
$protocol=Join-Path $repo 'tools/native-control/private-profile/SupervisorProtocol.cs'
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sources=$common+@((Join-Path $folder 'PrivateCandidateBinding03.cs'),(Join-Path $folder 'AssemblyInfo03.cs'),$protocol)
$binary=Join-Path $out 'RichAudio.GateAPrivate03.Shvdne.dll'
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /target:library /r:System.Core.dll /r:System.Windows.Forms.dll ('/r:'+$api) ('/out:'+$binary) @sources
if($LASTEXITCODE){throw 'PRIVATE03 candidate compilation failed'}
@'
Experiment=GATE-A-SHVDNE-PRIVATE-03
Enabled=false
SupervisorSession=
'@|Set-Content -LiteralPath (Join-Path $out 'RichAudio.GateAPrivate03.Shvdne.ini') -Encoding ascii
$fixture=Join-Path $out 'Private03.Fixture.exe'
$testSources=$common+@($protocol,(Join-Path $repo 'tests/host/TestGateAPrivate03.cs'))
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /target:exe /main:TestGateAPrivate03 /r:System.Core.dll /r:System.Windows.Forms.dll ('/out:'+$fixture) @testSources
if($LASTEXITCODE){throw 'PRIVATE03 fixture compilation failed'}
& $fixture 2>&1|Tee-Object -FilePath (Join-Path $out 'fixture.log')
if($LASTEXITCODE){throw 'PRIVATE03 fixture execution failed'}
[ordered]@{schema=1;experiment='GATE-A-SHVDNE-PRIVATE-03';version='0.3.0.0';candidateSha256=(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant();apiSha256=(Get-FileHash -LiteralPath $api).Hash.ToLowerInvariant();defaultEnabled=$false;baselineReviewGate=$true;nativeAssignmentsExecuted='authored stubs only';gameLaunched=$false;sources=@(($sources+$testSources+$PSCommandPath|Select-Object -Unique)|ForEach-Object{[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant()}});outputs=@(Get-ChildItem -LiteralPath $out -File|ForEach-Object{[ordered]@{path=$_.FullName;bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant()}})}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $out 'build-receipt.json') -Encoding UTF8
Write-Output ('PASS candidate '+(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant())
