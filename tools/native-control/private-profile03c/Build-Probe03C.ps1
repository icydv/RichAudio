#requires -Version 7.0
param()
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$out=Join-Path $repo '.local/gate-a-shvdne-private-03c/resource-probe/build-01'
if(Test-Path -LiteralPath $out){throw 'Fresh03C probe output required'}
$api=Join-Path $repo '.local/shvdne-reference/release/ScriptHookVDotNet3.dll'
if((Get-FileHash -LiteralPath $api).Hash.ToLowerInvariant()-cne'1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48'){throw 'Pinned API3 required'}
for($at=$out;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked output refused'}}
New-Item -ItemType Directory -Path $out|Out-Null
$common=@('PrivateAssignmentController03C.cs','PrivateProfile03C.Shvdne.cs','PrivateResourceAdmission03C.cs')|ForEach-Object{Join-Path $PSScriptRoot $_}
$protocol=Join-Path $repo 'tools/native-control/private-profile/SupervisorProtocol.cs'
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sources=$common+@((Join-Path $PSScriptRoot 'PrivateCandidateBinding03C.cs'),(Join-Path $PSScriptRoot 'AssemblyInfo03C.cs'),$protocol)
$binary=Join-Path $out 'RichAudio.GateAPrivate03C.Shvdne.dll'
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /target:library /r:System.Core.dll /r:System.Windows.Forms.dll ('/r:'+$api) ('/out:'+$binary) @sources
if($LASTEXITCODE){throw '03C candidate compilation failed'}
[IO.File]::WriteAllText((Join-Path $out 'RichAudio.GateAPrivate03C.Shvdne.ini'),"Experiment=GATE-A-SHVDNE-PRIVATE-03C`nEnabled=false`nSupervisorSession=`n",[Text.Encoding]::ASCII)
$existingFixture=Join-Path $out 'Existing03.Fixture.exe'
$existingTests=Join-Path $repo 'tests/host/TestGateAPrivate03.cs'
$newTests=Join-Path $repo 'tests/host/TestGateAPrivate03C.cs'
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /target:exe /main:TestGateAPrivate03 /r:System.Core.dll /r:System.Windows.Forms.dll ('/out:'+$existingFixture) @common $protocol $existingTests
if($LASTEXITCODE){throw 'Existing regression compilation failed'}
& $existingFixture 2>&1|Tee-Object -FilePath (Join-Path $out 'existing-fixture.log')
if($LASTEXITCODE){throw 'Existing regressions failed'}
$newFixture=Join-Path $out 'PhaseBoundary03C.Fixture.exe'
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /target:exe /main:TestGateAPrivate03C /r:System.Core.dll /r:System.Windows.Forms.dll ('/out:'+$newFixture) @common $protocol $existingTests $newTests
if($LASTEXITCODE){throw 'New regression compilation failed'}
& $newFixture 2>&1|Tee-Object -FilePath (Join-Path $out 'new-fixture.log')
if($LASTEXITCODE){throw 'New regressions failed'}
[ordered]@{schema=1;experiment='GATE-A-SHVDNE-PRIVATE-03C';version='0.3.1.0';candidateSha256=(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant();defaultEnabled=$false;reason='Demonstrated old80/100/140-second phase boundaries not independently enforced';baselineDecisionMs=80000;assignmentMs=100000;retirementMs=140000;activeMs=180000;nativeAssignmentsExecuted='Authored stand-ins only';gameLaunched=$false;resourceArtifactsRebuilt=$false;sources=@(($sources+$existingTests+$newTests+$PSCommandPath|Select-Object -Unique)|ForEach-Object{[ordered]@{path=$_;bytes=(Get-Item -LiteralPath $_).Length;sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant()}});outputs=@(Get-ChildItem -LiteralPath $out -File|ForEach-Object{[ordered]@{path=$_.FullName;bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant()}})}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $out 'build-receipt.json') -Encoding UTF8
Write-Output ('PASS new03C candidate '+(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant())
