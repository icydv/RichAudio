#requires -Version 7.0
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$source=Join-Path $PSScriptRoot 'probe-v0311'
$out=Join-Path $repo '.local/gate-a-shvdne-private-03c/resource-probe/build-02'
if(Test-Path -LiteralPath $out){throw 'Fresh03C final output required'}
for($at=$out;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked output refused'}}
$api=Join-Path $repo '.local/shvdne-reference/release/ScriptHookVDotNet3.dll'
if((Get-FileHash -LiteralPath $api).Hash.ToLowerInvariant()-cne'1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48'){throw 'Pinned API required'}
New-Item -ItemType Directory -Path $out|Out-Null
$common=@('PrivateAssignmentController03C.cs','PrivateProfile03C.Shvdne.cs','PrivateResourceAdmission03C.cs')|ForEach-Object{Join-Path $source $_}
$protocol=Join-Path $repo 'tools/native-control/private-profile/SupervisorProtocol.cs'
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sources=$common+@((Join-Path $source 'PrivateCandidateBinding03C.cs'),(Join-Path $source 'AssemblyInfo03C.cs'),$protocol)
$binary=Join-Path $out 'RichAudio.GateAPrivate03C.Shvdne.dll'
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /target:library /r:System.Core.dll /r:System.Windows.Forms.dll ('/r:'+$api) ('/out:'+$binary) @sources
if($LASTEXITCODE){throw 'Final03C candidate compilation failed'}
[IO.File]::WriteAllText((Join-Path $out 'RichAudio.GateAPrivate03C.Shvdne.ini'),"Experiment=GATE-A-SHVDNE-PRIVATE-03C`nEnabled=false`nSupervisorSession=`n",[Text.Encoding]::ASCII)
$originalTests=Join-Path $repo 'tests/host/TestGateAPrivate03.cs'
$explicitTests=Join-Path $out 'Existing03.ExplicitPhaseTests.cs'
$text=[IO.File]::ReadAllText($originalTests).Replace('new ShvdneProfileApi(delegate { return true; })','new ShvdneProfileApi(delegate { return true; }, delegate { return true; })').Replace('new ShvdneProfileApi(delegate { return false; })','new ShvdneProfileApi(delegate { return false; }, delegate { return true; })')
[IO.File]::WriteAllText($explicitTests,$text,[Text.UTF8Encoding]::new($false))
$newTests=Join-Path $repo 'tests/host/TestGateAPrivate03C.cs'
$nativeTests=Join-Path $repo 'tests/host/TestGateAPrivate03CNativeDeadline.cs'
foreach($spec in @(@{name='Existing03';main='TestGateAPrivate03';extra=@()},@{name='PhaseBoundary03C';main='TestGateAPrivate03C';extra=@($newTests)},@{name='NativeDeadline03C';main='TestGateAPrivate03CNativeDeadline';extra=@($nativeTests)})){
 $fixture=Join-Path $out ($spec.name+'.Fixture.exe')
 $testSources=$common+@($protocol,$explicitTests)+$spec.extra
 & $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /target:exe ('/main:'+$spec.main) /r:System.Core.dll /r:System.Windows.Forms.dll ('/out:'+$fixture) @testSources
 if($LASTEXITCODE){throw 'Final03C fixture compilation failed'}
 & $fixture 2>&1|Tee-Object -FilePath (Join-Path $out ($spec.name+'.log'))
 if($LASTEXITCODE){throw ('Final03C fixture failed: '+$spec.name)}
}
[ordered]@{schema=1;experiment='GATE-A-SHVDNE-PRIVATE-03C';version='0.3.1.1';candidateSha256=(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant();defaultEnabled=$false;reason='Independently enforced80/100/140 phasecutoffs plus finalphasecheck after nativecontextqueries';baselineDecisionMs=80000;assignmentMs=100000;retirementMs=140000;activeMs=180000;nativeAssignmentsExecuted='Authored stand-ins only';gameLaunched=$false;resourceArtifactsRebuilt=$false;originalBaseTestsPreserved=$true;testAdaptation='Same26cases, only explicit final-phase guard dependency supplied as true in existing directAPItests; separate native deadline cases exercise false/crossed guards';sources=@(($sources+$originalTests+$explicitTests+$newTests+$nativeTests+$PSCommandPath|Select-Object -Unique)|ForEach-Object{[ordered]@{path=$_;bytes=(Get-Item -LiteralPath $_).Length;sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant()}});outputs=@(Get-ChildItem -LiteralPath $out -File|ForEach-Object{[ordered]@{path=$_.FullName;bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant()}})}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $out 'build-receipt.json') -Encoding UTF8
Write-Output ('PASS final03C candidate '+(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant())
