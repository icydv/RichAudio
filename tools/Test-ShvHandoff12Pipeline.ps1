[CmdletBinding()]
param(
 [string]$BuildReceipt='build/playable-09-shv-handoff-final/build-receipt.json',
 [string]$OutputRoot,
 [string[]]$Cases,
 [ValidateRange(30,180)][int]$CaseTimeoutSeconds=150
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(!$OutputRoot){$OutputRoot='.local/playable-12/pipeline-fixture-'+[Guid]::NewGuid().ToString('N')}
$output=[IO.Path]::GetFullPath((Join-Path $repo $OutputRoot))
$allowed=Join-Path $repo '.local/playable-12'
if((Split-Path -Parent $output)-ne[IO.Path]::GetFullPath($allowed)-or(Split-Path -Leaf $output)-notmatch'^pipeline-fixture-[a-f0-9]{32}$'){throw 'A new direct PLAYABLE12 pipeline-fixture-GUID folder is required.'}
if(Test-Path -LiteralPath $output){throw 'Refusing to overwrite a pipeline fixture.'}
for($ancestor=Split-Path -Parent $output;$ancestor;$ancestor=Split-Path -Parent $ancestor){if(Test-Path -LiteralPath $ancestor){if((Get-Item -LiteralPath $ancestor).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'Linked output parents refused.'}}}
$receiptPath=[IO.Path]::GetFullPath((Join-Path $repo $BuildReceipt))
$build=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
$candidate=$build.Candidate.Path;$candidateHash=$build.Candidate.Sha256.ToLowerInvariant()
if((Get-FileHash -LiteralPath $candidate).Hash.ToLowerInvariant()-ne$candidateHash){throw 'Actual candidate digest mismatch.'}
foreach($pin in $build.SourceInputs){$file=Join-Path $repo ($pin.Name-replace'^repo/','');if((Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant()-ne$pin.Sha256){throw 'Production sources differ from final compiled candidate.'}}
$sourceNames=@('src/acoustics/host/Handoff/ShvOperatingStateHandoff.cs','src/acoustics/host/Handoff/TrustedShvComposition.cs',
 'src/acoustics/host/Handoff/ShvProducerModule.cs','src/acoustics/host/Handoff/ShvClockCalibration.cs','src/acoustics/host/Handoff/ShvHandoffConsumer.cs',
 'src/acoustics/host/Handoff/ShvGameplayFrameAdapter.cs','src/acoustics/host/Transport/ListenerProtocol.cs','src/acoustics/host/Transport/GameplayProtocol.cs',
 'src/acoustics/host/Transport/StatePipe.cs','src/acoustics/host/Transport/PipeDeadline.cs','tests/shv-handoff/Host.cs','tests/shv-handoff/Fixture.cpp')
$sourcePins=@($sourceNames|ForEach-Object{[ordered]@{name=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo $_)).Hash.ToLowerInvariant()}})
$matrix=@('valid_changing','metadata_pending','zero_running','null_pointer','target_seh','nan','infinity','out_of_range',
 'source_identity_changed','source_address_changed','source_driver_changed','source_engine_off','source_model_changed','source_offline_lost',
 'freeze_after_3','shutdown_after_3','post_context_delay','host_identity_changed','host_pool_counter_changed','host_owner_changed','host_driver_changed',
 'host_exit','post_peer_fault','post_peer_abort','queue_full','wrong_peer_address','wrong_binding_policy','wrong_provider_hash','wrong_session_key','wrong_process_open','no_foreground','max_duration')
$selected=if($Cases){@($matrix|Where-Object{$_-in$Cases})}else{$matrix}
if($selected.Count-eq0-or($Cases-and@($Cases|Where-Object{$_-notin$matrix}).Count-gt0)){throw 'Known explicit pipeline cases required.'}
[IO.Directory]::CreateDirectory($output)|Out-Null
[IO.File]::Copy($candidate,(Join-Path $output 'RichAudio.OperatingState.ShvHandoff.asi'))
$toolchain=$build.Toolchain
$fixture=Join-Path $output 'ScriptHookV.dll';$object=Join-Path $output 'Fixture.obj'
$clArgs=@('/nologo','/LD','/MT','/W4','/WX','/std:c++17','/EHsc','/guard:cf','/GS','/DSTRICT','/DWIN32_LEAN_AND_MEAN','/DNOMINMAX',('/Fo'+$object))
$clArgs+=@($toolchain.IncludeDirs|ForEach-Object{'/I'+$_})
$clArgs+=(Join-Path $repo 'tests/shv-handoff/Fixture.cpp')
$clArgs+=@('/link',('/OUT:'+$fixture),('/IMPLIB:'+(Join-Path $output 'Fixture.lib')),'/MACHINE:X64','/DYNAMICBASE','/NXCOMPAT','/GUARD:CF')
$clArgs+=@($toolchain.LibraryDirs|ForEach-Object{'/LIBPATH:'+$_})
$compile=@(& $toolchain.Compiler @clArgs 2>&1);$compile|Set-Content -LiteralPath (Join-Path $output 'fixture-build.log') -Encoding utf8
if($LASTEXITCODE-ne0){throw ('Fake SHV compilation failed: '+($compile-join[Environment]::NewLine))}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$hostPath=Join-Path $output 'RichAudio.ShvHandoff.FixtureHost.exe'
$cs=@($sourceNames|Where-Object{$_-like'*.cs'}|ForEach-Object{Join-Path $repo $_})
$csOutput=@(& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll /main:ShvHandoffFixtureHost ('/out:'+$hostPath) @cs 2>&1)
$csOutput|Set-Content -LiteralPath (Join-Path $output 'host-build.log') -Encoding utf8
if($LASTEXITCODE-ne0){throw ('Actual C# component fixture compilation failed: '+($csOutput-join[Environment]::NewLine))}
$fakeHash=(Get-FileHash -LiteralPath $fixture).Hash.ToLowerInvariant();$hostHash=(Get-FileHash -LiteralPath $hostPath).Hash.ToLowerInvariant()
$execution=[ordered]@{schema=1;profile='PLAYABLE-12';candidateSha256=$candidateHash;fixtureSha256=$fakeHash;hostSha256=$hostHash;sources=$sourcePins;buildReceiptSha256=(Get-FileHash -LiteralPath $receiptPath).Hash.ToLowerInvariant();runnerSha256=(Get-FileHash -LiteralPath $PSCommandPath).Hash.ToLowerInvariant();actualShvExecuted=$false;gameStarted=$false}
$execution|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $output 'execution.json') -Encoding utf8
$results=@()
foreach($case in $selected){
 $caseRoot=Join-Path $output ('case-'+$case);[IO.Directory]::CreateDirectory($caseRoot)|Out-Null
 $start=[Diagnostics.ProcessStartInfo]::new($hostPath);$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.WorkingDirectory=$output;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 foreach($value in @($case,$fakeHash,$candidateHash,$caseRoot)){$start.ArgumentList.Add([string]$value)}
 $child=[Diagnostics.Process]::new();$child.StartInfo=$start
 try{
  if(!$child.Start()){throw 'Owned fixture process did not start.'}
  $stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
  $timeout=if($case-eq'max_duration'){$CaseTimeoutSeconds}else{[Math]::Min(30,$CaseTimeoutSeconds)}
  if(!$child.WaitForExit($timeout*1000)){try{$child.Kill();$child.WaitForExit(2000)|Out-Null}catch{};throw ('Owned fixture host deadline: '+$case)}
  $out=$stdout.GetAwaiter().GetResult();$err=$stderr.GetAwaiter().GetResult()
  [IO.File]::WriteAllText((Join-Path $caseRoot 'stdout.txt'),$out);[IO.File]::WriteAllText((Join-Path $caseRoot 'stderr.txt'),$err)
  if($child.ExitCode-ne0){throw ('Pipeline case failed '+$case+': '+$err)}
 }finally{$child.Dispose()}
 $result=Get-Content -LiteralPath (Join-Path $caseRoot 'fixture-result.json') -Raw|ConvertFrom-Json
 if(!$result.passed-or$result.candidateSha256-ne$candidateHash-or$result.actualShvExecuted-or$result.gameStarted-or$result.endpointOpened-or$result.audioPlayback-or$result.providerQualified){throw 'Unexpected genuine-component fixture boundary.'}
 $results+=$result;$results|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $output 'case-results.partial.json') -Encoding utf8
 Write-Output ('PASS pipeline '+$case+'; accepted='+$result.accepted+'; targets='+$result.targetCalls)
}
foreach($pin in $sourcePins){if((Get-FileHash -LiteralPath (Join-Path $repo $pin.name)).Hash.ToLowerInvariant()-ne$pin.sha256){throw 'Source changed during pipeline validation.'}}
$report=[ordered]@{schema=1;profile='PLAYABLE-12';scope='Actual unchanged native producer, loaded-module reader, measured clock, trusted composition, existing08 validator, autonomous consumer, frame adapter and GameplayWire in isolated explicit fake SHV/peer fixtures.'
 candidateSha256=$candidateHash;fixtureSha256=$fakeHash;hostSha256=$hostHash;buildReceiptSha256=$execution.buildReceiptSha256;executionReceiptSha256=(Get-FileHash -LiteralPath (Join-Path $output 'execution.json')).Hash.ToLowerInvariant();sources=$sourcePins
 passed=$results.Count;assertions=($results.assertions|Measure-Object -Sum).Sum;fullMatrix=($selected.Count-eq$matrix.Count);cases=$results
 actualShvExecuted=$false;actualRphWitnessExecuted=$false;gameStarted=$false;gameFilesWritten=$false;endpointOpened=$false;audioPlayback=$false;providerQualified=$false;liveHandoffReady=$false
 globalKeyboardInputInjected=$false;foregroundReadersSubstituted=$false;maximumPendingForegroundMilliseconds=10000
 limits='Fake SHV provides native data and the fixture authors independent peer/camera observations. Actual SDK calls and physical correspondence require separate live approval. Full unobserved8-bit pool-counter/address ABA is excluded; native preemption and hot-unload are not promised.'}
$path=Join-Path $output 'validation.json';$report|ConvertTo-Json -Depth 15|Set-Content -LiteralPath $path -Encoding utf8
Write-Output ('PASS '+$results.Count+' actual-component cases / '+$report.assertions+' assertions; '+$path)
