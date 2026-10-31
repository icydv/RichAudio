#requires -Version 7.0
[CmdletBinding()]
param(
 [string]$BuildReceipt='',
 [string]$OutputRoot='',
 [ValidateRange(8,30)][int]$CaseTimeoutSeconds=18,
 [string[]]$Cases=@()
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(!$BuildReceipt){$BuildReceipt=Join-Path $repo 'build/playable-06-shv-probe/build-receipt.json'}
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-06/shv-fixture-'+[guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot)
$allowed=@((Join-Path $repo '.local'),(Join-Path $repo 'build'))|ForEach-Object{[IO.Path]::GetFullPath($_).TrimEnd('\')+'\'}
if(!@($allowed|Where-Object{$output.StartsWith($_,[StringComparison]::OrdinalIgnoreCase)}).Count -or (Test-Path -LiteralPath $output)){throw 'New isolated fixture output under this repository .local or build is required.'}
for($part=Split-Path -Parent $output;$part;$part=Split-Path -Parent $part){if((Test-Path -LiteralPath $part) -and ((Get-Item -LiteralPath $part -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output path is not permitted.'}}
$receipt=Get-Content -LiteralPath $BuildReceipt -Raw|ConvertFrom-Json
if($receipt.Profile -ne 'playable-06'){throw 'PLAYABLE-06 build receipt required.'}
function Check-SourceLineage {
 foreach($inputFile in $receipt.SourceInputs){
  if(!$inputFile.Name.StartsWith('repo/')){throw 'Unexpected production source receipt path.'}
  $source=Join-Path $repo $inputFile.Name.Substring(5)
  if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $inputFile.Sha256){throw ('Production source changed after compilation: '+$inputFile.Name)}
 }
}
Check-SourceLineage
$candidate=(Get-Item -LiteralPath $receipt.Candidate.Path).FullName
$candidateHash=(Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
if($candidateHash -ne $receipt.Candidate.Sha256.ToLowerInvariant()){throw 'Production ASI differs from the reviewed build receipt.'}
$compiler=(Get-Item -LiteralPath $receipt.Toolchain.Compiler).FullName
$includes=@($receipt.Toolchain.IncludeDirs|ForEach-Object{'/I'+[string]$_})
$libraries=@($receipt.Toolchain.LibraryDirs|ForEach-Object{'/LIBPATH:'+ [string]$_})
if(!$includes.Count -or !$libraries.Count){throw 'Reviewed compiler include and library directories required.'}
[IO.Directory]::CreateDirectory($output)|Out-Null
$fixture=Join-Path $output 'ScriptHookV.dll';$fixtureHost=Join-Path $output 'ShvProbe.FixtureHost.exe'
$originalLocation=Get-Location
try {
 Set-Location -LiteralPath $output
 & $compiler /nologo /O2 /W4 /WX /EHsc /std:c++17 /MT /LD @includes (Join-Path $repo 'tests/shv-probe/Fixture.cpp') ('/Fo'+(Join-Path $output 'Fixture.obj')) ('/Fe'+$fixture) /link @libraries /INCREMENTAL:NO /DYNAMICBASE /NXCOMPAT kernel32.lib user32.lib
 if($LASTEXITCODE -ne 0){throw 'Device-free SHV fixture compilation failed.'}
 & $compiler /nologo /O2 /W4 /WX /EHsc /std:c++17 /MT @includes (Join-Path $repo 'tests/shv-probe/Host.cpp') ('/Fo'+(Join-Path $output 'Host.obj')) ('/Fe'+$fixtureHost) /link @libraries /INCREMENTAL:NO /DYNAMICBASE /NXCOMPAT bcrypt.lib kernel32.lib user32.lib
 if($LASTEXITCODE -ne 0){throw 'Device-free host compilation failed.'}
}finally{Set-Location -LiteralPath $originalLocation}
$fixtureHash=(Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash.ToLowerInvariant()
$hostHash=(Get-FileHash -LiteralPath $fixtureHost -Algorithm SHA256).Hash.ToLowerInvariant()
$copiedCandidate=Join-Path $output 'RichAudio.OperatingState.Shv.asi'
Copy-Item -LiteralPath $candidate -Destination $copiedCandidate
if((Get-FileHash -LiteralPath $copiedCandidate -Algorithm SHA256).Hash.ToLowerInvariant() -ne $candidateHash){throw 'Copied ASI differs.'}

$matrix=@(
 @{Name='finite';Target=1;Class='finite-unvalidated';Bits=[Convert]::ToUInt32('3f000000',16);Float=.5;Terminal='completed-unvalidated';Arm=$true},
 @{Name='uk_oem102';Target=1;Class='finite-unvalidated';Bits=[Convert]::ToUInt32('3f000000',16);Float=.5;Terminal='completed-unvalidated';Arm=$true},
 @{Name='release_then_rising';Target=1;Class='finite-unvalidated';Bits=[Convert]::ToUInt32('3f000000',16);Float=.5;Terminal='completed-unvalidated';Arm=$true},
 @{Name='zero';Target=1;Class='zero';Bits=0;Float=0;Terminal='completed-unvalidated';Arm=$true},
 @{Name='nan';Target=1;Class='nonfinite';Bits=[Convert]::ToUInt32('7fc12345',16);NullFloat=$true;Terminal='completed-unvalidated';Arm=$true},
 @{Name='infinity';Target=1;Class='nonfinite';Bits=[Convert]::ToUInt32('7f800000',16);NullFloat=$true;Terminal='completed-unvalidated';Arm=$true},
 @{Name='out_of_range';Target=1;Class='out-of-plausible-range';Bits=[Convert]::ToUInt32('42480000',16);Float=50;Terminal='completed-unvalidated';Arm=$true},
 @{Name='null_pointer';Target=1;Class='null';Terminal='target-null';Pointer=$false;Arm=$true},
 @{Name='target_seh';Target=1;Class='seh';Terminal='target-seh';Pointer=$false;Exception=[Convert]::ToUInt32('e0420005',16);Arm=$true},
 @{Name='delayed_target';Target=1;Terminal=@('deadline-during-target-returned','watchdog-native-outcome-unobserved');Timeout=3000;Arm=$true},
 @{Name='eligible_no_input';Target=0;Class='not-attempted';Terminal='deadline-before-target';Timeout=1500},
 @{Name='held_startup';Target=0;Class='not-attempted';Terminal='deadline-before-target';Timeout=1500},
 @{Name='wrong_foreground';Target=0;Class='not-attempted';Terminal='deadline-before-target';Timeout=1500},
 @{Name='missing_ctrl';Target=0;Class='not-attempted';Terminal='deadline-before-target';Timeout=1500},
 @{Name='missing_shift';Target=0;Class='not-attempted';Terminal='deadline-before-target';Timeout=1500},
 @{Name='extra_alt';Target=0;Class='not-attempted';Terminal='deadline-before-target';Timeout=1500},
 @{Name='wrong_key';Target=0;Class='not-attempted';Terminal='deadline-before-target';Timeout=1500},
 @{Name='input_before_ready';Target=0;Class='not-attempted';Terminal='deadline-before-target';Timeout=2000},
 @{Name='wrong_model';Target=0;Class='not-attempted';Terminal='deadline-before-target';Timeout=1500},
 @{Name='passenger';Target=0;Class='not-attempted';Terminal='deadline-before-target';Timeout=1500},
 @{Name='online';Target=0;Class='not-attempted';Terminal='online-context';Timeout=1500},
 @{Name='no_vehicle';Target=0;Class='not-attempted';Terminal='deadline-before-target';Timeout=1500},
 @{Name='false_running';Target=0;Class='not-attempted';Terminal='gate-engine-not-running';Arm=$true},
 @{Name='flapping_running';Target=0;Class='not-attempted';Terminal='gate-engine-not-running';Arm=$true},
 @{Name='moving';Target=0;Class='not-attempted';Terminal='gate-not-stationary';Arm=$true},
 @{Name='nonfinite_speed';Target=0;Class='not-attempted';Terminal='gate-speed-nonfinite';Arm=$true},
 @{Name='negative_speed';Target=0;Class='not-attempted';Terminal='gate-speed-invalid';Arm=$true},
 @{Name='changed_context';Target=0;Class='not-attempted';Terminal='gate-identity-changed';Arm=$true},
 @{Name='offline_lost';Target=0;Class='not-attempted';Terminal='online-context';Arm=$true},
 @{Name='focus_loss';Target=0;Class='not-attempted';Terminal='foreground-lost';Arm=$true},
 @{Name='pause';Target=0;Class='not-attempted';Terminal='gate-context-invalid';Arm=$true},
 @{Name='sample_gap';Target=0;Class='not-attempted';Terminal='gate-sample-gap';Arm=$true},
 @{Name='final_gate_failure';Target=0;Class='not-attempted';Terminal='gate-engine-not-running';Arm=$true;Qualified=$true},
 @{Name='delayed_final_context';Target=0;Class='not-attempted';Terminal=@('gate-sample-gap','gate-timeout');Arm=$true;Qualified=$true},
 @{Name='context_seh';Target=0;Class='not-attempted';Terminal='precondition-seh';Exception=[Convert]::ToUInt32('e0420004',16)},
 @{Name='hud_seh_before';Target=0;Class='not-attempted';Terminal='hud-seh';HudFault=$true},
 @{Name='hud_seh_after';Target=1;Class='finite-unvalidated';Bits=[Convert]::ToUInt32('3f000000',16);Float=.5;Terminal='completed-unvalidated';Arm=$true;HudFault=$true}
)
$selected=@($matrix|Where-Object{!$Cases.Count -or $_.Name -in $Cases})
if(!$selected.Count -or @($Cases|Where-Object{$_ -notin $matrix.Name}).Count){throw 'Unknown or empty case selection.'}
$script:checks=0
function Check([bool]$Value,[string]$Message){$script:checks++;if(!$Value){throw $Message}}
$results=@()
foreach($case in $selected){
 $caseRoot=Join-Path $output ('case-'+$case.Name);[IO.Directory]::CreateDirectory($caseRoot)|Out-Null
 $start=[Diagnostics.ProcessStartInfo]::new($fixtureHost);$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.WorkingDirectory=$output;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 foreach($argument in @($case.Name,$fixtureHash,$candidateHash,$caseRoot)){$start.ArgumentList.Add([string]$argument)}
 $start.Environment['RICHAUDIO_SHV_PROBE_TIMEOUT_MS']=if($case.Timeout){[string]$case.Timeout}else{'5000'}
 $child=[Diagnostics.Process]::new();$child.StartInfo=$start;$clock=[Diagnostics.Stopwatch]::StartNew()
 try {
  if(!$child.Start()){throw 'Owned fixture host failed to start.'}
  $stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
  if(!$child.WaitForExit($CaseTimeoutSeconds*1000)){
   # Stop this exact owned test host only; no process-name or game cleanup.
   try{$child.Kill();$child.WaitForExit(2000)|Out-Null}catch{}
   throw ('Owned device-free host exceeded its parent deadline: '+$case.Name)
  }
  $out=$stdout.GetAwaiter().GetResult();$err=$stderr.GetAwaiter().GetResult()
  [IO.File]::WriteAllText((Join-Path $caseRoot 'host.stdout.txt'),$out)
  [IO.File]::WriteAllText((Join-Path $caseRoot 'host.stderr.txt'),$err)
  Check ($child.ExitCode -eq 0) ('Fixture host failed '+$case.Name+': '+$err)
 } finally {$clock.Stop();$child.Dispose()}
 $metrics=Get-Content -LiteralPath (Join-Path $caseRoot 'fixture-metrics.json') -Raw | ConvertFrom-Json
 Check ($metrics.fixture -and !$metrics.actualShvExecuted -and !$metrics.globalKeyboardInputInjected -and $metrics.fixturePathAndHashVerified -and $metrics.candidateHashVerified) ('Fixture identity not proved: '+$case.Name)
 Check ($metrics.registerCalls -eq 1 -and $metrics.keyboardRegistrationCalls -eq 1 -and $metrics.callbackInvocations -eq 2) ('Actual ASI registration/reentry guard failed: '+$case.Name)
 Check ($metrics.targetCalls -eq $case.Target) ('Target invocation count differs: '+$case.Name)
 Check ($metrics.qualifiedJournalSeenBeforeTarget -eq $case.Target) ('Qualified journal was not present before target: '+$case.Name)
 Check ($metrics.forbiddenCallsAfterTarget -eq 0 -and $metrics.contextCallsAfterTarget -eq 0 -and $metrics.callsAfterTargetFault -eq 0 -and $metrics.callsAfterHudFault -eq 0 -and $metrics.contextViolations -eq 0 -and $metrics.unexpectedNativeCalls -eq 0 -and $metrics.argumentViolations -eq 0) ('Native context/argument/storage boundary failed: '+$case.Name)
 Check ($metrics.contextCalls -le 1600) ('Unbounded context acquisition: '+$case.Name)
 if($case.HudFault){Check ($metrics.hudFaultsInjected -eq 1) ('HUD fault not exercised: '+$case.Name)}
 $captureFiles=@(Get-ChildItem -LiteralPath (Join-Path $caseRoot 'RichAudio/ShvProbe') -Recurse -File -Filter 'capture.json')
 $journalFiles=@(Get-ChildItem -LiteralPath (Join-Path $caseRoot 'RichAudio/ShvProbe') -Recurse -File -Filter 'journal.ndjson')
 Check ($captureFiles.Count -eq 1 -and $journalFiles.Count -eq 1) ('One bounded capture/journal required: '+$case.Name)
 Check (($captureFiles[0].Length+$journalFiles[0].Length) -le 16383) ('Capture volume exceeds declared bound: '+$case.Name)
 $raw=Get-Content -LiteralPath $captureFiles[0].FullName -Raw;$capture=$raw | ConvertFrom-Json
 $events=@(Get-Content -LiteralPath $journalFiles[0].FullName|Where-Object{$_}|ForEach-Object{$_|ConvertFrom-Json})
 $qualifiedEvents=@($events|Where-Object stage -eq 'stable-idle-qualified')
 Check ($capture.schema -eq 2 -and $capture.measuredRPM -eq $false -and $capture.providerValid -eq $false) ('Fixture must not promote an RPM/provider claim: '+$case.Name)
 Check ($capture.targetAttempts -eq $case.Target -and $capture.terminalReason -in @($case.Terminal)) ('Actual source terminal/count evidence differs: '+$case.Name+' '+$raw)
 $gate=$capture.stableIdleGate;$operator=$capture.operatorArming;$gateSpanMs=0;$gateEvidenceSource='capture'
 if(!$capture.producerCompleted -and $case.Target -gt 0){
  Check ($qualifiedEvents.Count -eq 1 -and $qualifiedEvents[0].stableIdleGate.qualified) 'Unobserved target must retain its qualified full gate in the durable journal.'
  $gate=$qualifiedEvents[0].stableIdleGate;$gateEvidenceSource='durable-journal'
 }
 Check ($operator.accepted -eq [bool]$case.Arm) ('Operator input wrongly accepted/rejected: '+$case.Name)
 Check ($gate.requiredDurationMs -eq 2000 -and $gate.sampleIntervalMs -eq 100 -and $gate.maxAllowedGapMs -eq 250 -and $gate.postArmLimitMs -eq 3000) ('Production gate timings changed: '+$case.Name)
 Check ($gate.sampleCount -le 25 -and @($gate.samples).Count -eq $gate.sampleCount) ('Stable sample bound differs: '+$case.Name)
 if($gate.sampleCount -gt 0){$gateSpanMs=($gate.lastQpc-$gate.firstQpc)*1000.0/$capture.qpcFrequency}
 if($case.Target -gt 0 -or $case.Qualified){
  Check ($qualifiedEvents.Count -eq 1) ('Qualified journal event missing: '+$case.Name)
  Check ($gate.qualified -eq $true -and $gateSpanMs -ge 2000 -and $gate.maxGapQpc*1000.0/$capture.qpcFrequency -le 250) ('Full unshortened stable gate not proved: '+$case.Name)
  foreach($sample in $gate.samples){Check ($sample.engineRunningRaw -ne 0 -and $sample.sameIdentity -eq $true -and $null -ne $sample.speedMps -and [double]::IsFinite([double]$sample.speedMps) -and [double]$sample.speedMps -ge 0 -and [double]$sample.speedMps -le .1) ('Invalid stable sample accepted: '+$case.Name)}
  if($capture.producerCompleted){
   $durable=$qualifiedEvents[0].stableIdleGate
   Check ($durable.sampleCount -eq $gate.sampleCount -and $durable.firstQpc -eq $gate.firstQpc -and $durable.lastQpc -eq $gate.lastQpc) ('Durable/final qualified gate differs: '+$case.Name)
   for($n=0;$n -lt $gate.sampleCount;$n++){
    $a=$durable.samples[$n];$b=$gate.samples[$n]
    Check ($a.beforeQpc -eq $b.beforeQpc -and $a.afterQpc -eq $b.afterQpc -and $a.engineRunningRaw -eq $b.engineRunningRaw -and $a.speedBits -eq $b.speedBits -and $a.sameIdentity -eq $b.sameIdentity) ('Durable/final gate sample differs: '+$case.Name)
   }
  }
 }
 if($case.Target -gt 0){
  Check ($operator.inputBeforeQpc -gt 0 -and $operator.inputBeforeQpc -le $operator.inputAfterQpc -and $operator.inputAfterQpc -le $operator.context.acquisitionStartQpc -and $operator.context.acquisitionEndQpc -le $operator.observedQpc -and $gate.firstQpc -eq $operator.context.acquisitionEndQpc) ('Operator timestamp association differs: '+$case.Name)
  Check ($operator.terminalVk -eq $metrics.fixtureArmVirtualKey) ('Accepted physical key variant differs: '+$case.Name)
  if($capture.producerCompleted){Check ($gate.preTargetRevalidated -eq $true) ('Fresh final gate missing: '+$case.Name)}
  Check (($metrics.fixtureTargetQpc-$operator.inputBeforeQpc)*1000.0/$capture.qpcFrequency -ge 2000) ('Target preceded full stable interval: '+$case.Name)
 }
 if($case.Name -eq 'final_gate_failure'){Check ($gate.qualified -and !$gate.preTargetRevalidated -and $capture.targetAttempts -eq 0) 'Fresh failed final gate must prevent target after qualification.'}
 if($case.Name -eq 'negative_speed'){Check (@($gate.samples|Where-Object{[uint32]$_.speedBits -eq [Convert]::ToUInt32('bd4ccccd',16) -and $_.speedMps -lt 0}).Count -gt 0) 'Rejected negative speed must retain its raw bits rather than be clamped.'}
 if($case.Name -eq 'delayed_target'){
  Check ($capture.deadlineReached -eq $true -and $capture.targetAttempts -eq 1 -and ($capture.producerCompleted -eq $true -or ($capture.classification -eq 'outcome-unobserved' -and $null -eq $capture.rawBits -and $null -eq $capture.rawFloat))) 'An unobserved attempted target must retain one attempt and explicit unknown/null result evidence.'
 }
 if($case.ContainsKey('Class')){Check ($capture.classification -eq $case.Class) ('Raw result classification differs: '+$case.Name+' '+$raw)}
 if($case.ContainsKey('Bits')){Check ([uint32]$capture.rawBits -eq [uint32]$case.Bits) ('Raw float bit pattern changed: '+$case.Name)}
 if($case.ContainsKey('Float')){Check ([double]$capture.rawFloat -eq [double]$case.Float) ('Raw float value changed: '+$case.Name)}
 if($case.NullFloat){Check ($null -eq $capture.rawFloat) ('Nonfinite must serialize as null plus raw bits: '+$case.Name)}
 if($case.ContainsKey('Exception')){Check ([uint32]$capture.exceptionCode -eq $case.Exception) ('Structured exception evidence was lost: '+$case.Name)}
 if($case.ContainsKey('Pointer')){Check ($capture.resultPointerPresent -eq $case.Pointer) ('Pointer presence differs: '+$case.Name)}
 elseif($case.ContainsKey('Bits')){Check ($capture.resultPointerPresent -eq $true) ('Returned result storage not reported: '+$case.Name)}
 Check ($raw -notmatch '"(?:pointerAddress|resultPointerAddress|memoryAddress|address)"\s*:') ('Raw pointer/address leaked: '+$case.Name)
 $lines=@(Get-Content -LiteralPath $journalFiles[0].FullName | Where-Object {$_})
 Check ($lines.Count -le 32) ('Journal record count unbounded: '+$case.Name)
 foreach($line in $lines){$null=$line | ConvertFrom-Json}
 Check ((($lines -join [Environment]::NewLine).Contains('operator-armed')) -eq [bool]$case.Arm) ('Operator journal boundary differs: '+$case.Name)
 $results+=[ordered]@{case=$case.Name;targetCalls=$metrics.targetCalls;contextCalls=$metrics.contextCalls;hudCalls=$metrics.hudCalls;keyboardCallbackEvents=$metrics.deliveredKeyboardCallbackEvents;callbackInvocations=$metrics.callbackInvocations;terminalReason=$capture.terminalReason;classification=$capture.classification;operatorAccepted=$operator.accepted;stableQualified=$gate.qualified;stableSampleCount=$gate.sampleCount;stableSpanMs=$gateSpanMs;maxGapMs=$gate.maxGapQpc*1000.0/$capture.qpcFrequency;preTargetRevalidated=$capture.stableIdleGate.preTargetRevalidated;gateEvidenceSource=$gateEvidenceSource;producerCompleted=$capture.producerCompleted;deadlineReached=$capture.deadlineReached;rawBits=$capture.rawBits;captureBytes=$captureFiles[0].Length;journalBytes=$journalFiles[0].Length;elapsedMilliseconds=$clock.ElapsedMilliseconds;fixture=$true;actualShvExecuted=$false;globalKeyboardInputInjected=$false;endpointOpened=$false}
 Write-Output ('PASS fixture '+$case.Name+'; target='+$metrics.targetCalls+'; stable='+[Math]::Round($gateSpanMs,2)+'ms')
}
Check-SourceLineage
$full=$selected.Count -eq $matrix.Count
$report=[ordered]@{schema=2;profile='PLAYABLE-06';scope='Actual operator-armed ASI with public ABI keyboard callbacks and a real owned foreground window; fake SHV only, no global input or game/audio';candidateSha256=$candidateHash;fixtureSha256=$fixtureHash;hostSha256=$hostHash;checks=$script:checks;cases=$results;passed=$results.Count;fullMatrix=$full;operatorArmingValidated=$full;stableIdleGateValidated=$full;stableIdleMs=2000;actualShvExecuted=$false;globalKeyboardInputInjected=$false;gameStarted=$false;gameFilesWritten=$false;endpointOpened=$false;liveProviderEstablished=$false;limits='Fake callbacks are not actual SHV input delivery or GTA rendering. Real monotonic two-second gate retained. Watchdog cannot preempt blocked natives; hot-unload unsupported.'}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $output 'fixture-result.json') -Encoding utf8
Write-Output ('PASS '+$script:checks+' assertions across '+$results.Count+' actual-ASI ABI fixture cases; no real SHV, game or audio. '+(Join-Path $output 'fixture-result.json'))
