#requires -Version 7.0
[CmdletBinding()]
param([string[]]$Cases,[string]$OutputRoot='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path).Hash.ToLowerInvariant()}
$baselinePath=Join-Path $repo '.local/playable-14/baseline.json'
if((Hash $baselinePath)-cne'8fce329188b82f650f7885e40e54243f8c43bb3a0816ef994dc112d34763b642'){throw 'PLAYABLE14 baseline differs.'}
$nativeReceipt=Join-Path $repo 'build/playable-09-shv-handoff-final/build-receipt.json'
if((Hash $nativeReceipt)-cne'f9d28cf4040bc4aa449a3620cfc942a6ed9006e7110e2fc3d9d8876788dc5dda'){throw 'Frozen native receipt differs.'}
$native=Get-Content -LiteralPath $nativeReceipt -Raw|ConvertFrom-Json
$nativeSha='05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40'
if((Hash $native.Candidate.Path)-cne$nativeSha-or(Get-Item -LiteralPath $native.Candidate.Path).Length-ne129024){throw 'Frozen native candidate differs.'}
foreach($pin in $native.SourceInputs){if((Hash (Join-Path $repo ($pin.Name-creplace'^repo/','')))-cne$pin.Sha256){throw 'Native production source changed.'}}
$matrix=@('binding14_legacy_frozen','binding14_normal','binding14_resume','binding14_never','binding14_wrong_identity','binding14_map_unavailable','binding14_map_expired','binding14_source_stale','binding14_peer_stale','binding14_peer_skew','binding14_journal_failure')
$selected=if($Cases){@($matrix|Where-Object{$_-in$Cases})}else{$matrix}
if($selected.Count-eq0-or($Cases-and@($Cases|Where-Object{$_-notin$matrix}).Count)){throw 'Known explicit focused cases required.'}
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-14/binding-fixture-'+[Guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot);$parent=[IO.Path]::GetFullPath((Join-Path $repo '.local/playable-14'))
if([IO.Path]::GetDirectoryName($output)-cne$parent-or[IO.Path]::GetFileName($output)-notmatch'^binding-fixture-[a-f0-9]{32}$'-or(Test-Path -LiteralPath $output)){throw 'New direct private14 binding-fixture-GUID output required.'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output refused.'}}
[IO.Directory]::CreateDirectory($output)|Out-Null
[IO.File]::Copy($native.Candidate.Path,(Join-Path $output 'RichAudio.OperatingState.ShvHandoff.asi'))
$core=@('src/acoustics/host/Handoff/ShvOperatingStateHandoff.cs','src/acoustics/host/Handoff/TrustedShvComposition.cs','src/acoustics/host/Handoff/ShvProducerModule.cs','src/acoustics/host/Handoff/ShvClockCalibration.cs','src/acoustics/host/Handoff/ShvHandoffConsumer.cs','src/acoustics/host/Handoff/ShvGameplayFrameAdapter.cs','src/acoustics/host/Transport/ListenerProtocol.cs','src/acoustics/host/Transport/GameplayProtocol.cs','src/acoustics/host/Transport/StatePipe.cs','src/acoustics/host/Transport/PipeDeadline.cs')
$test=@('tests/shv-handoff/Host.cs','tests/shv-handoff/WaitingBinding14.cs','tests/shv-handoff/Fixture.cpp')
$pins=@(@($core)+@($test)|ForEach-Object{[ordered]@{name=$_;sha256=(Hash (Join-Path $repo $_))}})
[ordered]@{schema=1;profile='PLAYABLE-14';selectedCases=$selected;sourceInputs=$pins;runnerSha256=(Hash $PSCommandPath);producerSha256=$nativeSha;producerBuildReceiptSha256=(Hash $nativeReceipt)}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $output 'compile-inputs.json') -Encoding utf8
$fake=Join-Path $output 'ScriptHookV.dll';$toolchain=$native.Toolchain
$cl=@('/nologo','/LD','/MT','/W4','/WX','/std:c++17','/EHsc','/guard:cf','/GS','/DSTRICT','/DWIN32_LEAN_AND_MEAN','/DNOMINMAX',('/Fo'+(Join-Path $output 'Fixture.obj')))
$cl+=@($toolchain.IncludeDirs|ForEach-Object{'/I'+$_});$cl+=(Join-Path $repo 'tests/shv-handoff/Fixture.cpp')
$cl+=@('/link',('/OUT:'+$fake),('/IMPLIB:'+(Join-Path $output 'Fixture.lib')),'/MACHINE:X64','/DYNAMICBASE','/NXCOMPAT','/GUARD:CF')
$cl+=@($toolchain.LibraryDirs|ForEach-Object{'/LIBPATH:'+$_})
$log=@(& $toolchain.Compiler @cl 2>&1);$log|Set-Content -LiteralPath (Join-Path $output 'fake-build.log') -Encoding utf8
if($LASTEXITCODE-ne0){throw ('Fake SHV compilation failed: '+($log-join[Environment]::NewLine))}
$fakeSha=Hash $fake;$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$hosts=@{};$legacyPins=@();$legacyCommit='08776ecc31f08b7a7838497b524d5d8b2ba75546'
foreach($variant in @('legacy','current')){
 if($variant-ceq'legacy'-and$selected-notcontains'binding14_legacy_frozen'){continue}
 if($variant-ceq'current'-and@($selected|Where-Object{$_-cne'binding14_legacy_frozen'}).Count-eq0){continue}
 $sources=@();$defines='SHV_BINDING_14'
 if($variant-ceq'legacy'){
  $defines+=',LEGACY_BINDING_13'
  foreach($name in $core){
   $file=Join-Path $output ('legacy-sources/'+$name);[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file))|Out-Null
   $info=[Diagnostics.ProcessStartInfo]::new((Get-Command git -CommandType Application|Select-Object -First 1).Source);$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
   foreach($arg in @('-C',$repo,'cat-file','blob',($legacyCommit+':'+$name))){$info.ArgumentList.Add($arg)}
   $process=[Diagnostics.Process]::new();$process.StartInfo=$info
   try{if(!$process.Start()){throw 'Git blob reader did not start.'};$errorText=$process.StandardError.ReadToEndAsync();$dest=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$process.StandardOutput.BaseStream.CopyTo($dest);$dest.Flush($true)}finally{$dest.Dispose()};$process.WaitForExit();if($process.ExitCode-ne0){throw $errorText.GetAwaiter().GetResult()}
   }finally{$process.Dispose()}
   $sources+=$file;$legacyPins+=[ordered]@{name=$name;commit=$legacyCommit;sha256=(Hash $file)}
  }
 }else{$sources=@($core|ForEach-Object{Join-Path $repo $_})}
 $sources+=@($test|Where-Object{$_-like'*.cs'}|ForEach-Object{Join-Path $repo $_})
 $binary=Join-Path $output ('RichAudio.ShvHandoff.Binding14.'+$variant+'.exe')
 $log=@(& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll /main:ShvHandoffFixtureHost ('/define:'+$defines) ('/out:'+$binary) @sources 2>&1)
 $log|Set-Content -LiteralPath (Join-Path $output ($variant+'-build.log')) -Encoding utf8
 if($LASTEXITCODE-ne0){throw ('Focused '+$variant+' host compilation failed: '+($log-join[Environment]::NewLine))};$hosts[$variant]=[ordered]@{path=$binary;sha256=(Hash $binary)}
}
$results=@()
foreach($case in $selected){
 $variant=if($case-ceq'binding14_legacy_frozen'){'legacy'}else{'current'};$dir=Join-Path $output $case;[IO.Directory]::CreateDirectory($dir)|Out-Null
 $info=[Diagnostics.ProcessStartInfo]::new($hosts[$variant].path);$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WorkingDirectory=$output;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 foreach($arg in @($case,$fakeSha,$nativeSha,$dir)){$info.ArgumentList.Add($arg)}
 $process=[Diagnostics.Process]::new();$process.StartInfo=$info
 try{if(!$process.Start()){throw 'Owned focused fixture failed to start.'};$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
  if(!$process.WaitForExit(45000)){try{$process.Kill();$process.WaitForExit(2000)|Out-Null}catch{};throw ('Owned focused fixture timed out: '+$case)}
  [IO.File]::WriteAllText((Join-Path $dir 'stdout.txt'),$stdout.GetAwaiter().GetResult());$err=$stderr.GetAwaiter().GetResult();[IO.File]::WriteAllText((Join-Path $dir 'stderr.txt'),$err)
  if($process.ExitCode-ne0){throw ('Focused case failed '+$case+': '+$err)}
 }finally{$process.Dispose()}
 $result=Get-Content -LiteralPath (Join-Path $dir 'fixture-result.json') -Raw|ConvertFrom-Json
 if(!$result.passed-or$result.unchangedProducerSha256-cne$nativeSha-or$result.actualShvExecuted-or$result.actualRphWitnessExecuted-or$result.gameStarted-or$result.endpointOpened-or$result.audioPlayback){throw 'Focused fixture boundary/outcome mismatch.'}
 $results+=$result;$results|ConvertTo-Json -Depth 22|Set-Content -LiteralPath (Join-Path $output 'case-results.partial.json') -Encoding utf8
 foreach($pin in $pins){if(($variant-ceq'current'-or$pin.name-in$test)-and(Hash (Join-Path $repo $pin.name))-cne$pin.sha256){throw 'Compiled source changed before case receipt.'}}
 [ordered]@{schema=1;profile='PLAYABLE-14';passed=$true;case=$case;caseResultSha256=(Hash (Join-Path $dir 'fixture-result.json'));compileInputsSha256=(Hash (Join-Path $output 'compile-inputs.json'));fixtureHost=$hosts[$variant];fakeShvSha256=$fakeSha;producerSha256=$nativeSha;gameLaunched=$false;endpointOpened=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $dir 'validation.json') -Encoding utf8
 Write-Output ('PASS focused '+$case+'; targets='+$result.facts.targetCalls+' frames='+$result.gameplayFrames)
}
# Current source pins may legitimately be edited by the production owner while
# running the legacy-only baseline repro. Those are not compiled legacy inputs.
$usedPins=if($selected.Count-eq1-and$selected[0]-ceq'binding14_legacy_frozen'){@($pins|Where-Object{$_.name-in$test})}else{$pins}
foreach($pin in $usedPins){if((Hash (Join-Path $repo $pin.name))-cne$pin.sha256){throw 'Compiled source changed during focused validation.'}}
foreach($pin in $native.SourceInputs){if((Hash (Join-Path $repo ($pin.Name-creplace'^repo/','')))-cne$pin.Sha256){throw 'Native production input changed.'}}
$report=[ordered]@{schema=1;profile='PLAYABLE-14';kind='focused-actual-native-managed-waiting-binding-fixtures';passed=$true;caseCount=$results.Count;assertions=($results.assertions|Measure-Object -Sum).Sum;cases=$results;
 unchangedProducerSha256=$nativeSha;producerBuildReceiptSha256=(Hash $nativeReceipt);fakeShvSha256=$fakeSha;fixtureHosts=$hosts;sources=$usedPins;legacyCompiledSourcePins=$legacyPins;legacyCommit=$legacyCommit;runnerSha256=(Hash $PSCommandPath);
 actualProducerExecuted=$true;actualShvExecuted=$false;actualRphWitnessExecuted=$false;gameLaunched=$false;gameFilesWritten=$false;endpointOpened=$false;audioPlayback=$false;liveHandoffAccepted=$false;nativeProductionInputsUnchanged=$true;
 limits='Actual unchanged native producer and compiled managed components with explicit fake SHV/import data and authored RPH peers. Clock/QPC is real and script callback is actually paused independently. No GTA, real RPH getters, real vehicle correspondence, endpoint or listening proof.'}
$path=Join-Path $output 'validation.json';$report|ConvertTo-Json -Depth 24|Set-Content -LiteralPath $path -Encoding utf8
Write-Output ('PASS focused '+$results.Count+' cases / '+$report.assertions+' assertions; '+$path)
