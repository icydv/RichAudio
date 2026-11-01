#requires -Version 7.0
[CmdletBinding()]
param(
 [Alias('Profile')][ValidateSet('playable-07','playable-08')][string]$ProbeProfile='playable-07',
 [string]$BuildReceipt='',
 [string]$OutputRoot='',
 [string]$ValidateExistingRun='',
 [ValidateRange(10,180)][int]$CaseTimeoutSeconds=140,
 [string[]]$Cases=@()
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$profileTag=$ProbeProfile.ToUpperInvariant()
if(!$BuildReceipt){$BuildReceipt=Join-Path $repo ('build/'+$ProbeProfile+'-shv-probe/build-receipt.json')}
if($ValidateExistingRun){if($OutputRoot -or $Cases.Count){throw 'Existing full-run validation cannot change output root or case selection.'};$OutputRoot=$ValidateExistingRun}
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/'+$ProbeProfile+'/shv-fixture-'+[guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot)
$allowed=@((Join-Path $repo ('.local/'+$ProbeProfile)),(Join-Path $repo ('build/'+$ProbeProfile+'-fixtures')))|ForEach-Object{[IO.Path]::GetFullPath($_).TrimEnd('\')+'\'}
if(!@($allowed|Where-Object{$output.StartsWith($_,[StringComparison]::OrdinalIgnoreCase)}).Count -or ((Test-Path -LiteralPath $output) -and !$ValidateExistingRun)){throw 'New isolated profile-specific fixture output is required; earlier artifacts are protected.'}
if($ProbeProfile -eq 'playable-08'){$base=@($allowed|Where-Object{$output.StartsWith($_,[StringComparison]::OrdinalIgnoreCase)})[0];$leaf=$output.Substring($base.Length);if($leaf -notmatch '\Ashv-fixture-[a-f0-9]{32}\z'){throw 'PLAYABLE-08 fixtures require a new direct shv-fixture-<id> child; live captures, candidates and historical subdirectories are protected.'}}
if($ValidateExistingRun -and (!(Test-Path -LiteralPath $output -PathType Container) -or (Test-Path -LiteralPath (Join-Path $output 'fixture-result.json')))){throw 'Existing outputs with no final validation receipt are required.'}
if((Test-Path -LiteralPath $output) -and ((Get-Item -LiteralPath $output -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output leaf is not permitted.'}
for($part=Split-Path -Parent $output;$part;$part=Split-Path -Parent $part){if((Test-Path -LiteralPath $part) -and ((Get-Item -LiteralPath $part -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output path is not permitted.'}}
$receipt=Get-Content -LiteralPath $BuildReceipt -Raw|ConvertFrom-Json
if($receipt.Profile -ne $ProbeProfile){throw 'Matching explicit probe-profile build receipt required.'}
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
if(!$ValidateExistingRun){[IO.Directory]::CreateDirectory($output)|Out-Null}
$fixture=Join-Path $output 'ScriptHookV.dll';$fixtureHost=Join-Path $output 'ShvProbe.FixtureHost.exe'
$originalLocation=Get-Location
if(!$ValidateExistingRun){try {
 Set-Location -LiteralPath $output
 & $compiler /nologo /O2 /W4 /WX /EHsc /std:c++17 /MT /LD @includes (Join-Path $repo 'tests/shv-probe/Fixture.cpp') ('/Fo'+(Join-Path $output 'Fixture.obj')) ('/Fe'+$fixture) /link @libraries /INCREMENTAL:NO /DYNAMICBASE /NXCOMPAT kernel32.lib user32.lib
 if($LASTEXITCODE -ne 0){throw 'Device-free SHV fixture compilation failed.'}
 & $compiler /nologo /O2 /W4 /WX /EHsc /std:c++17 /MT @includes (Join-Path $repo 'tests/shv-probe/Host.cpp') ('/Fo'+(Join-Path $output 'Host.obj')) ('/Fe'+$fixtureHost) /link @libraries /INCREMENTAL:NO /DYNAMICBASE /NXCOMPAT bcrypt.lib kernel32.lib user32.lib
 if($LASTEXITCODE -ne 0){throw 'Device-free host compilation failed.'}
}finally{Set-Location -LiteralPath $originalLocation}}
$fixtureHash=(Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash.ToLowerInvariant()
$hostHash=(Get-FileHash -LiteralPath $fixtureHost -Algorithm SHA256).Hash.ToLowerInvariant()
$copiedCandidate=Join-Path $output 'RichAudio.OperatingState.Shv.asi'
if(!$ValidateExistingRun){Copy-Item -LiteralPath $candidate -Destination $copiedCandidate}
if((Get-FileHash -LiteralPath $copiedCandidate -Algorithm SHA256).Hash.ToLowerInvariant() -ne $candidateHash){throw 'Copied ASI differs.'}
$executionPath=Join-Path $output 'fixture-execution.json'
if($ValidateExistingRun){
 $execution=Get-Content -LiteralPath $executionPath -Raw|ConvertFrom-Json
 if($execution.profile -ne $profileTag -or $execution.candidateSha256 -ne $candidateHash -or $execution.fixtureSha256 -ne $fixtureHash -or $execution.hostSha256 -ne $hostHash -or $execution.actualShvExecuted -ne $false -or $execution.gameStarted -ne $false -or $execution.fixtureSourceSha256 -ne (Get-FileHash -LiteralPath (Join-Path $repo 'tests/shv-probe/Fixture.cpp') -Algorithm SHA256).Hash.ToLowerInvariant() -or $execution.hostSourceSha256 -ne (Get-FileHash -LiteralPath (Join-Path $repo 'tests/shv-probe/Host.cpp') -Algorithm SHA256).Hash.ToLowerInvariant()){throw 'Original execution binary/source identities differ.'}
}else{
 $execution=[ordered]@{schema=1;profile=$profileTag;createdBeforeOriginalRun=$true;candidateSha256=$candidateHash;fixtureSha256=$fixtureHash;hostSha256=$hostHash;fixtureSourceSha256=(Get-FileHash -LiteralPath (Join-Path $repo 'tests/shv-probe/Fixture.cpp') -Algorithm SHA256).Hash.ToLowerInvariant();hostSourceSha256=(Get-FileHash -LiteralPath (Join-Path $repo 'tests/shv-probe/Host.cpp') -Algorithm SHA256).Hash.ToLowerInvariant();executionRunnerSourceSha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant();actualShvExecuted=$false;gameStarted=$false;globalKeyboardInputInjected=$false}
 [IO.File]::WriteAllText($executionPath,($execution|ConvertTo-Json -Depth 4)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
}
$priorResults=if($ValidateExistingRun){@(Get-Content -LiteralPath (Join-Path $output 'case-results.partial.json') -Raw|ConvertFrom-Json)}else{@()}

$matrix=@(
 @{Name='sequence_dynamic';Terminal='operator-stop';Sequence=$true},
 @{Name='sequence_constant';Terminal='operator-stop';Sequence=$true},
 @{Name='sequence_wrong_trend';Terminal='operator-stop';Sequence=$true},
 @{Name='sequence_marker_only';Terminal='operator-stop';Sequence=$true},
 @{Name='finite';Terminal='operator-stop'},
 @{Name='uk_oem102';Terminal='operator-stop'},
 @{Name='release_then_rising';Terminal='operator-stop'},
 @{Name='rising';Terminal='operator-stop'},
 @{Name='falling';Terminal='operator-stop'},
 @{Name='zero_off';Terminal='operator-stop'},
 @{Name='zero_running';Terminal='operator-stop'},
 @{Name='nan';Terminal='target-nonfinite';Targets=3;Class='nonfinite'},
 @{Name='infinity';Terminal='target-nonfinite';Targets=3;Class='nonfinite'},
 @{Name='out_of_range';Terminal='target-out-of-range';Targets=3;Class='out-of-plausible-range'},
 @{Name='negative_ratio';Terminal='target-out-of-range';Targets=3;Class='out-of-plausible-range'},
 @{Name='null_pointer';Terminal='target-null';Targets=3;Class='null'},
 @{Name='target_seh';Terminal='target-seh';Targets=3;Class='seh';Exception=[Convert]::ToUInt32('e0420005',16)},
 @{Name='delayed_target';Terminal='observation-discontinuity';Targets=3},
 @{Name='context_seh';Terminal='precondition-seh';Targets=3;Exception=[Convert]::ToUInt32('e0420004',16)},
 @{Name='post_context_seh';Terminal='precondition-seh';Targets=3;Exception=[Convert]::ToUInt32('e0420004',16)},
 @{Name='post_context_delay';Terminal='observation-discontinuity';Targets=3},
 @{Name='hud_seh_before';Terminal='hud-seh';Targets=0},
 @{Name='hud_seh_active';Terminal='hud-seh';Targets=3},
 @{Name='stale_gap';Terminal='observation-discontinuity';Targets=3},
 @{Name='slow_context';Terminal='observation-discontinuity';Targets=3},
 @{Name='identity_changed';Terminal='context-changed'},
 @{Name='post_identity_changed';Terminal='context-changed';Targets=3},
 @{Name='player_changed';Terminal='context-changed'},
 @{Name='driver_changed';Terminal='context-invalid'},
 @{Name='offline_lost';Terminal='online-context'},
 @{Name='focus_loss';Terminal='foreground-lost'},
 @{Name='pause';Terminal='context-invalid'},
 @{Name='negative_speed';Terminal='speed-invalid'},
 @{Name='nonfinite_speed';Terminal='speed-nonfinite'},
 @{Name='phase_overflow';Terminal='operator-event-overflow';Targets=3},
 @{Name='eligible_no_input';Terminal='waiting-deadline';Targets=0;WaitMs=1500},
 @{Name='held_startup';Terminal='waiting-deadline';Targets=0;WaitMs=1500},
 @{Name='wrong_foreground';Terminal='waiting-deadline';Targets=0;WaitMs=1500},
 @{Name='missing_ctrl';Terminal='waiting-deadline';Targets=0;WaitMs=1500},
 @{Name='missing_shift';Terminal='waiting-deadline';Targets=0;WaitMs=1500},
 @{Name='extra_alt';Terminal='waiting-deadline';Targets=0;WaitMs=1500},
 @{Name='wrong_key';Terminal='waiting-deadline';Targets=0;WaitMs=1500},
 @{Name='input_before_ready';Terminal='waiting-deadline';Targets=0;WaitMs=2000},
 @{Name='wrong_model';Terminal='waiting-deadline';Targets=0;WaitMs=1500},
 @{Name='passenger';Terminal='waiting-deadline';Targets=0;WaitMs=1500},
 @{Name='online';Terminal='online-context';Targets=0;WaitMs=1500},
 @{Name='no_vehicle';Terminal='waiting-deadline';Targets=0;WaitMs=1500},
 @{Name='max_duration';Terminal=@('active-deadline','sample-limit');FullDuration=$true}
)
$selected=@($matrix|Where-Object{!$Cases.Count -or $_.Name -in $Cases})
if(!$selected.Count -or @($Cases|Where-Object{$_ -notin $matrix.Name}).Count){throw 'Unknown or empty case selection.'}
$script:checks=0
function Check([bool]$Value,[string]$Message){$script:checks++;if(!$Value){throw $Message}}
function Check-GuidedHud($Metrics,$Capture,$Phases,$Case){
 Check ($Metrics.droppedHudStrings -eq 0 -and $Metrics.oversizedHudStrings -eq 0 -and @($Metrics.hud).Count -eq $Metrics.distinctHudStrings) ('Bounded actual HUD trace incomplete: '+$Case.Name)
 foreach($entry in $Metrics.hud){Check ([Text.Encoding]::UTF8.GetByteCount($entry.text) -lt 99) ('Native text component exceeds documented display bound: '+$Case.Name)}
 $active=@($Metrics.hud|Where-Object text -like 'PHASE *');$labels=@();$largestElapsed=0;$smallestRemaining=120
 $names=@{'OFF'='OFF';'IDLE'='IDLE';'REV'='STATIONARY_REV';'ACCEL'='ACCELERATION';'GEAR'='GEAR_TRANSITIONS';'DECEL'='DECELERATION';'RETURN IDLE'='RETURN_IDLE'}
 $actions=@{'OFF'='If off unavailable, NEXT.';'IDLE'='Stay still 8s, then NEXT.';'REV'='Stay still; rev 8s, then NEXT.';'ACCEL'='Speed up 8s; NEXT before slowing.';'GEAR'='Optional 6s; gear unavailable.';'DECEL'='Slow down 8s, then NEXT.';'RETURN IDLE'='Stay still; idle 8s.'}
 $lastElapsed=@{}
 foreach($entry in $active){
  Check ($entry.text -match '^PHASE (RETURN IDLE|OFF|IDLE|REV|ACCEL|GEAR|DECEL) (\d+)s \| LEFT (\d+)s~n~(.+)~n~(.+)$') ('Actual HUD phase/timer/action format missing: '+$Case.Name)
  $label=$Matches[1];$elapsed=[int]$Matches[2];$remaining=[int]$Matches[3];$action=$Matches[4];$footer=$Matches[5]
  Check ($elapsed -ge 0 -and $elapsed -le 120 -and $remaining -ge 0 -and $remaining -le 120 -and $action -ceq $actions[$label]) ('Actual requested action/timer differs: '+$Case.Name)
  $expectedFooter=if($label -eq 'RETURN IDLE'){'\ FINISH | Ctrl+Shift+\ STOP'}else{'\ NEXT | Ctrl+Shift+\ STOP'}
  Check ($footer -ceq $expectedFooter) ('Advance/finish/early-stop guidance missing: '+$Case.Name)
  $marker=@($Phases|Where-Object{$_.requestedPhase -eq $names[$label] -and $_.action -ne 'stop'})
  Check ($marker.Count -eq 1) ('HUD shows a phase without exactly one accepted operator marker: '+$Case.Name)
  $expectedElapsed=[Math]::Floor(($entry.firstSeenQpc-$marker[0].acceptedQpc)/[double]$Capture.qpcFrequency)
  $expectedRemaining=[Math]::Max(0,[Math]::Min(120,[Math]::Ceiling(120-($entry.firstSeenQpc-$Capture.activeStartQpc)/[double]$Capture.qpcFrequency)))
  Check ([Math]::Abs($elapsed-$expectedElapsed) -le 1 -and [Math]::Abs($remaining-$expectedRemaining) -le 1) ('Displayed countdown/phase clock does not track actual monotonic time: '+$Case.Name)
  if($lastElapsed.ContainsKey($label)){Check ($elapsed -ge $lastElapsed[$label]) ('Phase elapsed display moved backwards: '+$Case.Name)}else{Check ($elapsed -le 1) ('Phase elapsed timer did not reset on operator advance: '+$Case.Name)}
  $lastElapsed[$label]=$elapsed;$labels+=$label;$largestElapsed=[Math]::Max($largestElapsed,$elapsed);$smallestRemaining=[Math]::Min($smallestRemaining,$remaining)
 }
 if($Metrics.targetCalls -gt 0){Check ($active.Count -gt 0) ('Guidance was never emitted by the actual ASI: '+$Case.Name)}
 if($Case.Sequence){Check (($labels|Select-Object -Unique) -join ',' -eq 'OFF,IDLE,REV,ACCEL,GEAR,DECEL,RETURN IDLE') ('Actual HUD did not visit each manually marked phase: '+$Case.Name)}
 if($Case.FullDuration){Check ($largestElapsed -ge 118 -and $smallestRemaining -le 2 -and @($labels|Select-Object -Unique).Count -eq 1 -and $Capture.lastRequestedPhaseIndex -eq 0 -and $Capture.phaseMarkers -eq 1) 'Full countdown may guide but must never automatically advance a phase.'}
 return [ordered]@{distinctStrings=$Metrics.distinctHudStrings;activeTimerStrings=$active.Count;phaseLabels=@($labels|Select-Object -Unique);largestPhaseElapsedSeconds=$largestElapsed;smallestRemainingSeconds=$smallestRemaining;actualGameRenderingVerified=$false}
}
$results=@()
foreach($case in $selected){
 $caseRoot=Join-Path $output ('case-'+$case.Name)
 if(!$ValidateExistingRun){[IO.Directory]::CreateDirectory($caseRoot)|Out-Null
 $start=[Diagnostics.ProcessStartInfo]::new($fixtureHost);$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.WorkingDirectory=$output;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 foreach($argument in @($case.Name,$fixtureHash,$candidateHash,$caseRoot)){$start.ArgumentList.Add([string]$argument)}
 $start.Environment['RICHAUDIO_SHV_PROBE_TIMEOUT_MS']=if($case.WaitMs){[string]$case.WaitMs}else{'5000'}
 $child=[Diagnostics.Process]::new();$child.StartInfo=$start;$clock=[Diagnostics.Stopwatch]::StartNew()
 try {
  if(!$child.Start()){throw 'Owned fixture host failed to start.'}
  $stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
  $limit=if($case.FullDuration){$CaseTimeoutSeconds}else{[Math]::Min($CaseTimeoutSeconds,$(if($ProbeProfile-eq'playable-08'){40}else{30}))}
  if(!$child.WaitForExit($limit*1000)){
   try{$child.Kill();$child.WaitForExit(2000)|Out-Null}catch{}
   throw ('Owned device-free host exceeded its parent deadline: '+$case.Name)
  }
  $out=$stdout.GetAwaiter().GetResult();$err=$stderr.GetAwaiter().GetResult()
  [IO.File]::WriteAllText((Join-Path $caseRoot 'host.stdout.txt'),$out)
  [IO.File]::WriteAllText((Join-Path $caseRoot 'host.stderr.txt'),$err)
  Check ($child.ExitCode -eq 0) ('Fixture host failed '+$case.Name+': '+$err)
 } finally {$clock.Stop();$child.Dispose()}
 }else{
  Check ((Get-Content -LiteralPath (Join-Path $caseRoot 'host.stdout.txt') -Raw).Contains('PASS device-free fixture case '+$case.Name+';') -and !(Get-Content -LiteralPath (Join-Path $caseRoot 'host.stderr.txt') -Raw)) ('Original owned host did not complete successfully: '+$case.Name)
 }
 $metrics=Get-Content -LiteralPath (Join-Path $caseRoot 'fixture-metrics.json') -Raw|ConvertFrom-Json
 Check ($metrics.fixture -and !$metrics.actualShvExecuted -and !$metrics.globalKeyboardInputInjected -and $metrics.fixturePathAndHashVerified -and $metrics.candidateHashVerified) ('Fixture identity not proved: '+$case.Name)
 Check ($metrics.registerCalls -eq 1 -and $metrics.keyboardRegistrationCalls -eq 1 -and $metrics.callbackInvocations -eq 2) ('Actual ASI registration/reentry failed: '+$case.Name)
 Check ($metrics.nativeCallsAfterFault -eq 0 -and $metrics.callsAfterHudFault -eq 0 -and $metrics.contextViolations -eq 0 -and $metrics.unexpectedNativeCalls -eq 0 -and $metrics.argumentViolations -eq 0) ('Native context/fault/argument boundary failed: '+$case.Name)
 Check ($metrics.targetCalls -le 2400 -and $metrics.contextCalls -le 122500) ('Unbounded acquisition: '+$case.Name)
 if($case.ContainsKey('Targets')){Check ($metrics.targetCalls -eq $case.Targets) ('Exact target count differs: '+$case.Name)}else{Check ($metrics.targetCalls -gt 3) ('Repeated observations not exercised: '+$case.Name)}
 $files=@(Get-ChildItem -LiteralPath (Join-Path $caseRoot 'RichAudio/ShvProbe') -Recurse -File)
 $captureFiles=@($files|Where-Object Name -eq 'capture.json');$journalFiles=@($files|Where-Object Name -eq 'journal.ndjson');$timelineFiles=@($files|Where-Object Name -eq 'timeline.ndjson')
 Check ($captureFiles.Count -eq 1 -and $journalFiles.Count -eq 1 -and $timelineFiles.Count -eq 1 -and $files.Count -eq 3) ('Exactly one bounded output set required: '+$case.Name)
 Check (($files|Measure-Object Length -Sum).Sum -le 12582912) ('Aggregate output exceeds12MiB: '+$case.Name)
 $capture=Get-Content -LiteralPath $captureFiles[0].FullName -Raw|ConvertFrom-Json
 $events=@(Get-Content -LiteralPath $journalFiles[0].FullName|Where-Object{$_}|ForEach-Object{$_|ConvertFrom-Json})
 $lines=@(Get-Content -LiteralPath $timelineFiles[0].FullName|Where-Object{$_})
 $records=@($lines|ForEach-Object{Check ([Text.Encoding]::UTF8.GetByteCount($_) -le 2047) ('Oversized row: '+$case.Name);$_|ConvertFrom-Json})
 foreach($line in $lines){if($line -match '"kind":"target-return"'){Check ([Text.Encoding]::UTF8.GetByteCount($line) -le 511) ('Oversized minimal raw-return row: '+$case.Name)}}
 $observations=@($records|Where-Object kind -eq 'observation');$declared=@($records|Where-Object kind -eq 'declared-precontext');$returns=@($records|Where-Object kind -eq 'target-return');$phases=@($records|Where-Object kind -eq 'phase')
 Check ($capture.schema -eq 3 -and $capture.measuredRPM -eq $false -and $capture.providerValid -eq $false) ('Capture promoted provider/RPM claim: '+$case.Name)
 Check ($capture.maximumActiveMs -eq 120000 -and $capture.maximumTargetObservations -eq 2400 -and $capture.minimumAfterToNextTargetMs -eq 50 -and $capture.maximumObservationGapMs -eq 250 -and $capture.ringCapacityRecords -eq 128 -and $capture.maximumTimelineRowBytes -eq 2047 -and $capture.aggregateFileBudgetBytes -eq 12582912) ('Production limits changed: '+$case.Name)
 Check ($capture.producerCompleted -and $capture.terminalReason -in @($case.Terminal) -and $capture.targetAttempts -eq $metrics.targetCalls) ('Capture terminal/count differs: '+$case.Name+' '+$capture.terminalReason)
 Check ($capture.targetOutcomesObserved -eq $metrics.targetCalls -and $capture.observationsProduced -eq $observations.Count -and $capture.timelineRecordsProduced -eq $records.Count) ('Stream/summary count mismatch: '+$case.Name)
 Check (@($observations|Where-Object targetAttempted).Count -eq $metrics.targetCalls -and $returns.Count -eq $metrics.targetCalls -and $records.Count -le 7209) ('Target outcome missing or stream unbounded: '+$case.Name)
 Check ($null -eq $capture.gear -and $null -eq $capture.throttle -and $null -eq $capture.controlAxis -and $capture.keyboardIntentIsThrottle -eq $false -and $capture.operatorLabelsAreAchievedStateProof -eq $false) ('Unsupported getter or operator label promoted: '+$case.Name)
 Check (@($events|Where-Object{$_.stage -eq 'capture-terminal' -and $_.captureWritten}).Count -eq 1 -and $events.Count -le 16) ('Final journal missing/unbounded: '+$case.Name)
 if($metrics.targetCalls -gt 0){
  Check ($capture.operatorArming.accepted -and $capture.operatorArming.terminalVk -eq $metrics.fixtureArmVirtualKey -and $metrics.armedJournalSeenAtTarget -eq $metrics.targetCalls) ('Explicit start/durable armed journal not proved: '+$case.Name)
  Check ($capture.operatorArming.inputBeforeQpc -le $capture.operatorArming.inputAfterQpc -and $capture.operatorArming.inputAfterQpc -le $capture.activeStartQpc) ('Start timestamp ordering differs: '+$case.Name)
  Check ($capture.activeEndQpc -ge $capture.activeStartQpc) ('Invalid active bounds: '+$case.Name)
 }
 $freq=[double]$capture.qpcFrequency;$previous=$null;$copied=0
 foreach($o in $observations){
  Check ($o.schema -eq 3 -and $o.operatorLabelIsAchievedStateProof -eq $false -and $o.keyboardIntentIsThrottle -eq $false -and $o.measuredRPM -eq $false -and $o.providerValid -eq $false -and $null -eq $o.gear -and $null -eq $o.throttle) ('Observation provenance/unsupported fields differ: '+$case.Name)
  if(!$o.targetAttempted){Check ($o.readStatus -eq 'not-attempted' -and $null -eq $o.rawBits -and $null -eq $o.rawFloat -and !$o.contextBracketValid) ('Unattempted observation borrowed a result/context: '+$case.Name);continue}
  Check (@($declared|Where-Object observationIndex -eq $o.observationIndex).Count -eq 1) ('Declaration missing or duplicated: '+$case.Name)
  $d=@($declared|Where-Object observationIndex -eq $o.observationIndex)[0]
  Check ([array]::IndexOf($records,$d) -lt [array]::IndexOf($records,$o)) ('Outcome precedes its declaration: '+$case.Name)
  $returned=@($returns|Where-Object observationIndex -eq $o.observationIndex)
  Check ($returned.Count -eq 1 -and [array]::IndexOf($records,$d) -lt [array]::IndexOf($records,$returned[0]) -and [array]::IndexOf($records,$returned[0]) -lt [array]::IndexOf($records,$o)) ('Raw return handoff order differs: '+$case.Name)
  $early=$returned[0]
  Check ($early.rawBits -eq $o.rawBits -and $early.rawBitsHex -eq $o.rawBitsHex -and $early.readStatus -eq $o.readStatus -and $early.targetBeforeQpc -eq $o.targetBeforeQpc -and $early.targetAfterQpc -eq $o.targetAfterQpc -and $early.contextBracketValid -eq $false -and $early.providerValid -eq $false) ('Early raw return changed or claimed context: '+$case.Name)
  Check ($d.invocationProven -eq $false -and $d.preContext.acquisitionStartQpc -eq $o.preContext.acquisitionStartQpc -and $d.preContext.acquisitionEndQpc -eq $o.preContext.acquisitionEndQpc) ('Declared context changed: '+$case.Name)
  $t=$metrics.targets[[int]$o.observationIndex-1]
  Check ($t.index -eq $o.observationIndex -and $o.targetBeforeQpc -le $t.beforeQpc -and $o.targetAfterQpc -ge $t.afterQpc) ('Independent target timing differs: '+$case.Name)
  if($previous){Check (($t.beforeQpc-$previous.beforeQpc)*1000.0/$freq -ge 50) ('Actual target entries exceeded20Hz: '+$case.Name)}
  $previous=$t
  Check ($o.targetBeforeQpc -ge $capture.activeStartQpc -and ($o.targetBeforeQpc-$capture.activeStartQpc)*1000.0/$freq -lt 120000) ('Target started beyond active bound: '+$case.Name)
  if($t.status -eq 0){Check ($o.readStatus -eq 'good' -and $o.pointerPresent -and [uint32]$o.rawBits -eq [uint32]$t.rawBits -and $o.rawBitsHex -eq ('{0:X8}' -f [uint32]$t.rawBits)) ('Immediate raw copy was lost: '+$case.Name);$copied++}
  else{Check ($null -eq $o.rawBits -and $null -eq $o.rawFloat -and !$o.pointerPresent -and $o.readStatus -eq $(if($t.status -eq 1){'null'}else{'seh'})) ('Missing/SEH storage was fabricated: '+$case.Name)}
  if($o.contextBracketValid){
   Check ($o.postContextObserved -and $o.preContext.player -eq $o.postContext.player -and $o.preContext.ped -eq $o.postContext.ped -and $o.preContext.vehicle -eq $o.postContext.vehicle -and $o.preContext.driver -eq $o.postContext.driver -and $o.preContext.model -eq $o.postContext.model -and $o.preContext.driver -eq $o.preContext.ped) ('Invalid context bracket accepted: '+$case.Name)
   Check ($o.preContext.acquisitionEndQpc -le $o.targetBeforeQpc -and $o.targetAfterQpc -le $o.postContext.acquisitionStartQpc) ('Context/target ordering differs: '+$case.Name)
  }
 }
 Check (@($declared|Where-Object invocationProven -ne $false).Count -eq 0 -and $phases.Count -le 9) ('Marker/declaration falsely proves invocation: '+$case.Name)
 if($case.Sequence){
  Check (($phases.requestedPhase|Select-Object -Unique) -join ',' -eq 'OFF,IDLE,STATIONARY_REV,ACCELERATION,GEAR_TRANSITIONS,DECELERATION,RETURN_IDLE') ('Requested phase sequence differs: '+$case.Name)
  Check ($phases[-1].action -eq 'stop' -and $phases[-1].earlyStop -eq $false -and $capture.operatorStopWasEarly -eq $false -and $capture.droppedOperatorEvents -eq 0) ('Explicit final stop not recorded: '+$case.Name)
 }
 elseif($capture.terminalReason -eq 'operator-stop'){Check ($capture.operatorStopWasEarly -eq $true -and $phases[-1].earlyStop -eq $true) ('Chord early stop was confused with completed phase progression: '+$case.Name)}
 if($case.ContainsKey('Class')){Check ($observations[-1].classification -eq $case.Class) ('Terminal raw classification differs: '+$case.Name)}
 if($case.ContainsKey('Exception')){Check ([uint32]$capture.exceptionCode -eq $case.Exception -or [uint32]$observations[-1].exceptionCode -eq $case.Exception) ('Structured exception was lost: '+$case.Name)}
 if($case.Name -eq 'zero_running'){Check ($capture.zeroWhileRunningCount -gt 0 -and @($observations|Where-Object zeroWhileRunning).Count -gt 0) 'Zero with running context must be flagged, not inferred into valid RPM.'}
 if($case.Name -eq 'zero_off'){Check ($capture.zeroWhileRunningCount -eq 0 -and @($observations|Where-Object{$_.rawFloat -eq 0 -and $_.preContext.engineRunningRaw -eq 0 -and $_.postContext.engineRunningRaw -eq 0}).Count -gt 3) 'Engine-off/zero fixture observations were not retained.'}
 if($case.Name -eq 'phase_overflow'){Check ($capture.droppedOperatorEvents -gt 0) 'Lost operator events must terminate visibly.'}
 if($case.Name -eq 'post_context_delay'){Check ($metrics.rawReturnVisibleWhilePostContextBlocked -eq 1) 'Raw target result must be visible in the off-thread file while the later context native is blocked.'}
 if($case.Name -eq 'post_identity_changed' -or $case.Name -eq 'post_context_seh'){Check ($observations[-1].targetAttempted -and $null -ne $observations[-1].rawBits -and !$observations[-1].contextBracketValid) 'A known target result must survive failed post-context with an invalid bracket.'}
 if($case.Name -eq 'rising'){Check (($observations[-1].rawFloat-$observations[0].rawFloat) -gt .5) 'Actual rising sequence missing.'}
 if($case.Name -eq 'falling'){Check (($observations[-1].rawFloat-$observations[0].rawFloat) -lt -.5) 'Actual falling sequence missing.'}
 if($case.FullDuration){Check (($capture.activeEndQpc-$capture.activeStartQpc)*1000.0/$freq -ge 120000 -and $metrics.targetCalls -ge 400 -and ($metrics.firstTargetQpc-$capture.activeStartQpc)*1000.0/$freq -le 250 -and ($capture.activeEndQpc-$metrics.fixtureTargetQpc)*1000.0/$freq -le 250 -and $metrics.maximumTargetEntryGapQpc*1000.0/$freq -le 250) 'Unshortened120-second capture must retain observations across the full interval without a minimum-rate claim.'}
 $hudGuidance=if($ProbeProfile -eq 'playable-08'){Check-GuidedHud $metrics $capture $phases $case}else{$null}
 $activeDuration=if($capture.activeStartQpc -gt 0){($capture.activeEndQpc-$capture.activeStartQpc)*1000.0/$freq}else{0}
 $elapsed=if($ValidateExistingRun){@($priorResults|Where-Object case -eq $case.Name)[0].fixtureElapsedMilliseconds}else{$clock.ElapsedMilliseconds}
 $maximumRowBytes=($lines|ForEach-Object{[Text.Encoding]::UTF8.GetByteCount($_)}|Measure-Object -Maximum).Maximum
 $result=[ordered]@{case=$case.Name;targetCalls=$metrics.targetCalls;targetOutcomesObserved=$capture.targetOutcomesObserved;observations=$observations.Count;declarations=$declared.Count;rawReturnRecords=$returns.Count;phaseRecords=$phases.Count;terminalReason=$capture.terminalReason;rawCopiesVerified=$copied;minimumActualTargetGapMs=$metrics.minimumTargetEntryGapQpc*1000.0/$freq;maximumActualTargetGapMs=$metrics.maximumTargetEntryGapQpc*1000.0/$freq;activeDurationMs=$activeDuration;zeroWhileRunningCount=$capture.zeroWhileRunningCount;captureBytes=$captureFiles[0].Length;journalBytes=$journalFiles[0].Length;timelineBytes=$timelineFiles[0].Length;maximumRowBytes=$maximumRowBytes;fixtureElapsedMilliseconds=$elapsed;fixture=$true;actualShvExecuted=$false;globalKeyboardInputInjected=$false;gameStarted=$false;endpointOpened=$false}
 $results+=$result
 if($ProbeProfile -eq 'playable-08'){$result.hudGuidance=$hudGuidance}
 if(!$ValidateExistingRun){$results|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $output 'case-results.partial.json') -Encoding utf8}
 Write-Output ('PASS fixture '+$case.Name+'; target='+$metrics.targetCalls+'; terminal='+$capture.terminalReason)
}
Check-SourceLineage
$full=$selected.Count -eq $matrix.Count
$report=[ordered]@{schema=3;profile=$profileTag;scope='Unchanged production ASI against isolated fake SHV callbacks and an ordinary owned foreground window; no global input/game/audio';candidateSha256=$candidateHash;fixtureSha256=$fixtureHash;hostSha256=$hostHash;checks=$script:checks;cases=$results;passed=$results.Count;fullMatrix=$full;boundedMultiStateValidated=$full;phaseMarkersValidated=$full;guidedHudValidated=($full -and $ProbeProfile -eq 'playable-08');fullDurationFixtureValidated=($full -and @($results|Where-Object case -eq 'max_duration').Count -eq 1);maximumCaptureSeconds=120;maximumObservations=2400;maximumHz=20;operatorPhaseProtocolValidated=$full;boundedTimelineValidated=$full;maximumActiveMs=120000;maximumTargetObservations=2400;maximumAcquisitionHz=20;actualShvExecuted=$false;globalKeyboardInputInjected=$false;gameStarted=$false;gameFilesWritten=$false;endpointOpened=$false;liveProviderEstablished=$false;providerQualified=$false;limits='Fake data/callbacks are not live SHV input, native resolution, gear/throttle support or GTA visual behaviour; watchdog cannot preempt blocked natives; hot-unload unsupported.'}
$report.readOnlyRevalidation=[bool]$ValidateExistingRun
$report.executionReceiptSha256=(Get-FileHash -LiteralPath $executionPath -Algorithm SHA256).Hash.ToLowerInvariant()
$report.executionRunnerSourceSha256=$execution.executionRunnerSourceSha256
$report.validationRunnerSourceSha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
$report.foregroundSetup=[ordered]@{maximumPendingMilliseconds=10000;guard='Actual GetForegroundWindow process identity before production ASI load';activation='One ordinary Win32 activation; an approved computer-use activation of the exact owned pending window may establish foreground';pendingTitle='RichAudio offline fixture - awaiting foreground';keyboardOrMouseInputInjected=$false;foregroundReadersSubstituted=$false;wrongForegroundCaseNeverPending=$true}
if($ValidateExistingRun){$report.validationNote='The unchanged original48-case execution was read back after correcting an arbitrary >2000 minimum count. Full120-second coverage and actual50..250ms spacing replace that minimum. No production/fixture binary changed and no native execution was repeated.'}
$report|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $output 'fixture-result.json') -Encoding utf8
Write-Output ('PASS '+$script:checks+' assertions across '+$results.Count+' actual-ASI timeline fixture cases; no real SHV/game/audio. '+(Join-Path $output 'fixture-result.json'))
