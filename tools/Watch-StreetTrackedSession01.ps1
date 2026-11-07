# Narrow passive profile adapter for the existing transaction/supervisor tools.
# Preview/function loading never inspects the installation or starts a process.
#requires -Version 7.0
[CmdletBinding()]
param([switch]$FunctionsOnly,[ValidateSet('Preview','Watch','Launch')][string]$Mode='Preview',
 [string]$Candidate,[string]$ExpectedCandidateSha256,[string]$ApprovalReceipt,[string]$ExpectedApprovalSha256)
$ErrorActionPreference='Stop'
$script:StreetWatchSource01=$PSCommandPath
$script:StreetWatchFunctionsOnly01=[bool]$FunctionsOnly
$script:StreetWatchRepo01=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'menu02-recovery/Supervision.ps1') -FunctionsOnly
. (Join-Path $PSScriptRoot 'Prepare-StreetTrackedCandidate01.ps1') -FunctionsOnly

function Get-StreetTrackedSessionDeadline01 {
 [CmdletBinding()]param([Parameter(Mandatory)]$LaunchIntent,$DiagnosticLoad=$null,$ExitRequest=$null,
  [long]$NowTicks=[Diagnostics.Stopwatch]::GetTimestamp(),[long]$Frequency=[Diagnostics.Stopwatch]::Frequency)
 $start=$LaunchIntent.monotonicStartTicks
 foreach($v in @($start,$LaunchIntent.monotonicFrequency)){if(($v-isnot[int]-and$v-isnot[long])-or$v-le0){throw 'Positive integer original clock operands required'}}
 if($Frequency-le0-or$Frequency-gt1000000000000L-or$LaunchIntent.monotonicFrequency-ne$Frequency-or$NowTicks-lt$start){throw 'Passive supervisor clock identity/order differs'}
 $startup=[decimal]$start+[decimal]$Frequency*600;$overall=[decimal]$start+[decimal]$Frequency*913
 if($overall-gt[long]::MaxValue){throw 'Passive supervisor clock overflows'}
 $phase='startup';$deadline=$startup;$reason='startup-or-Bati-admission-600s'
 if($null-ne$DiagnosticLoad){
  $loaded=$DiagnosticLoad.monotonicObservedTicks
  if(($loaded-isnot[int]-and$loaded-isnot[long])-or$DiagnosticLoad.monotonicFrequency-ne$Frequency-or$loaded-lt$start-or$loaded-gt$NowTicks){throw 'Diagnostic load clock differs'}
  if([decimal]$loaded-ge$startup){$reason='late-diagnostic-load-cannot-extend-startup'}
  else{$phase='diagnostic';$deadline=[Math]::Min([decimal]$loaded+[decimal]$Frequency*133,$overall);$reason='pre-arm-10s-native-120s-writer-3s'}
 }
 if($null-ne$ExitRequest){
  $exit=$ExitRequest.monotonicObservedTicks
  if(($exit-isnot[int]-and$exit-isnot[long])-or$ExitRequest.monotonicFrequency-ne$Frequency-or$exit-lt$start-or$exit-gt$NowTicks){throw 'Exit request clock differs'}
  $phase='normal-exit-only';$deadline=[Math]::Min([decimal]$exit+[decimal]$Frequency*180,$overall);$reason='normal-exit-180s'
 }
 if([decimal]$NowTicks-ge$overall){$reason='overall-913s'}
 [pscustomobject]@{phase=$phase;expired=([decimal]$NowTicks-ge$deadline);reason=$reason;deadlineTicks=[long]$deadline;overallDeadlineTicks=[long]$overall;frequency=$Frequency;elapsedSeconds=([double]($NowTicks-$start)/$Frequency);remainingSeconds=[Math]::Max(0,[double]($deadline-$NowTicks)/$Frequency);startupSeconds=600;preArmSeconds=10;nativeSeconds=120;writerSeconds=3;normalExitSeconds=180;overallSeconds=913}
}
function Get-StreetTrackedWatchContext01([string]$Candidate,[string]$ExpectedCandidateSha256,[string]$ApprovalReceipt,[string]$ExpectedApprovalSha256){
 $plan=Read-StreetTrackedPinned01 $Candidate $ExpectedCandidateSha256
 $approval=Read-StreetTrackedPinned01 $ApprovalReceipt $ExpectedApprovalSha256
 Assert-StreetTrackedApproval01 $plan $ExpectedCandidateSha256 $approval
 if($approval.supervisorSha256-cne(Get-StreetTrackedHash01 $script:StreetWatchSource01)){throw 'Separate approval must bind this exact passive supervisor source'}
 foreach($pin in $plan.sourcePins){if((Get-StreetTrackedHash01 (Join-Path $script:StreetWatchRepo01 $pin.path))-cne$pin.sha256){throw 'Prepared source changed'}}
 $transaction=Join-Path (Split-Path $Candidate -Parent) 'transaction'
 $deployed=Read-Menu02SupervisorJson (Join-Path $transaction 'deployed.json')
 $attempt=Read-Menu02SupervisorJson (Join-Path $transaction 'attempt.json')
 if($deployed.candidateSha256-cne$ExpectedCandidateSha256-or@($deployed.changes).Count-ne4-or$attempt.candidateSha256-cne$ExpectedCandidateSha256){throw 'Fresh exact deployment receipts required'}
 Assert-StreetTrackedApproval01 $plan $ExpectedCandidateSha256 $attempt.approval
 if($attempt.approval.supervisorSha256-cne$approval.supervisorSha256){throw 'Deployment/supervisor approval differs'}
 [pscustomobject]@{plan=$plan;approval=$approval;approvalSha256=$ExpectedApprovalSha256;transaction=$transaction;candidateSha256=$ExpectedCandidateSha256}
}
function Watch-StreetTrackedSession01 {
 [CmdletBinding()]param([Parameter(Mandatory)][string]$Candidate,[Parameter(Mandatory)][string]$ExpectedCandidateSha256,
  [Parameter(Mandatory)][string]$ApprovalReceipt,[Parameter(Mandatory)][string]$ExpectedApprovalSha256,
  [scriptblock]$FixtureClock,[scriptblock]$FixtureProcesses,[scriptblock]$FixtureSleep)
 $c=Get-StreetTrackedWatchContext01 $Candidate $ExpectedCandidateSha256 $ApprovalReceipt $ExpectedApprovalSha256
 if($FixtureClock-or$FixtureProcesses-or$FixtureSleep){
  if(!$c.plan.fixtureOnly){throw 'Supervisor injection is restricted to marked authored fixtures'}
  [void](Assert-StreetTrackedLocal01 $c.plan.gameRoot)
  $marker=Read-Menu02SupervisorJson (Join-Path (Split-Path $c.plan.gameRoot -Parent) 'fixture-only.json')
  if($marker.kind-cne'OriginalStreetTrackedTransactionFixture01'-or$marker.installedAccessAllowed-ne$false){throw 'Explicit original fixture marker required'}
 }
 if(!$FixtureClock){$FixtureClock={ [Diagnostics.Stopwatch]::GetTimestamp() }}
 if(!$FixtureProcesses){$FixtureProcesses={ @(Get-StreetTrackedActiveProcesses01 -Plan $c.plan) }}
 if(!$FixtureSleep){$FixtureSleep={Start-Sleep -Milliseconds 500}}
 $t=$c.transaction;$frequency=[Diagnostics.Stopwatch]::Frequency;$started=&$FixtureClock;$launch=$null;$loaded=$null;$exit=$null;$game=$null;$absence=$null
 foreach($name in @('supervisor-ready.json','launch-intent.json','launch-terminal-failure.json','supervisor-complete.json','supervisor-failure.json','normal-exit-required.json','closure-observed.json','restoration.json')){if(Test-Path -LiteralPath (Join-Path $t $name)){throw 'Consumed passive transaction cannot start another supervisor'}}
 if(@(&$FixtureProcesses).Count){throw 'Relevant processes must be absent before supervisor readiness'}
 $self=Get-Process -Id $PID
 Write-Menu02SupervisorNewJson (Join-Path $t 'supervisor-ready.json') ([ordered]@{schema=1;kind='StreetTrackedSupervisorReady01';candidateSha256=$c.candidateSha256;approvalSha256=$c.approvalSha256;supervisorSha256=(Get-StreetTrackedHash01 $script:StreetWatchSource01);pid=$PID;creationFileTime=$self.StartTime.ToUniversalTime().ToFileTimeUtc().ToString();monotonicObservedTicks=$started;monotonicFrequency=$frequency;launchWaitSeconds=120;overallSeconds=913});$self.Dispose()
 try{while($true){
  $now=&$FixtureClock;if($now-lt$started-or([decimal]$now-$started)/$frequency-ge1033){throw 'Passive independent supervisor bound expired'}
  if((Get-StreetTrackedHash01 $Candidate)-cne$c.candidateSha256-or(Get-StreetTrackedHash01 $ApprovalReceipt)-cne$c.approvalSha256){throw 'Bound candidate or approval changed'}
  if(!$launch){$path=Join-Path $t 'launch-intent.json';if(Test-Path -LiteralPath $path){$launch=Read-Menu02SupervisorJson $path
    if($launch.kind-cne'StreetTrackedSoleCmdLaunch01'-or$launch.candidateSha256-cne$c.candidateSha256-or$launch.approvalSha256-cne$c.approvalSha256-or$launch.monotonicStartTicks-lt$started){throw 'Fresh exact sole launch marker required'}
   }elseif(($now-$started)/[double]$frequency-ge120){throw 'Sole launch was not observed within120s'}}
  if($launch){
   $processes=@(&$FixtureProcesses)
   $services=@($processes|Where-Object{$_.name-match'^RichAudio'-or$_.reason-in@('known-RichAudio-node-package-or-service','RichAudio-preparation-worker')})
   if($services.Count){Write-Menu02SupervisorNewJson (Join-Path $t 'unexpected-service.json') ([ordered]@{candidateSha256=$c.candidateSha256;processes=$services;monotonicObservedTicks=$now;monotonicFrequency=$frequency;passiveScopeViolated=$true});throw 'Unexpected RichAudio audio/map/service process; passive session must end'}
   $enhanced=@($processes|Where-Object name -ceq 'GTA5_Enhanced')
   if($enhanced.Count-gt1){throw 'Multiple Enhanced lifetimes observed'}
   if($enhanced.Count-eq1){$seen=$enhanced[0]
    if(![string]::Equals($seen.path,$c.plan.baseline.gameExecutable.path,[StringComparison]::OrdinalIgnoreCase)-or[DateTime]::FromFileTimeUtc([long]$seen.creationFileTime)-lt[DateTime]::Parse($launch.atUtc).ToUniversalTime()){throw 'Enhanced process path/creation differs'}
    if(!$game){$game=$seen;Write-Menu02SupervisorNewJson (Join-Path $t 'game-process-observed.json') ([ordered]@{candidateSha256=$c.candidateSha256;process=$game;monotonicObservedTicks=$now;monotonicFrequency=$frequency})}
    elseif($game.id-ne$seen.id-or$game.creationFileTime-cne$seen.creationFileTime){throw 'Original Enhanced lifetime changed; no reacquisition'}
   }
   $loadPath=Join-Path $t 'diagnostic-load.json'
   if(!$loaded-and(Test-Path -LiteralPath $loadPath)){$loaded=Read-Menu02SupervisorJson $loadPath;if(!$game-or$loaded.candidateSha256-cne$c.candidateSha256-or$loaded.gameProcessId-ne$game.id-or$loaded.gameCreationFileTime-cne$game.creationFileTime){throw 'Manual diagnostic load witness is not the original observed game lifetime'}}
   $fault=(Test-Path -LiteralPath (Join-Path $t 'test-terminal.json'))-or(Test-Path -LiteralPath (Join-Path $t 'launch-terminal-failure.json'))
   $deadline=Get-StreetTrackedSessionDeadline01 $launch $loaded $exit $now $frequency
   if(!$exit-and($fault-or$deadline.expired-or(Test-Path -LiteralPath (Join-Path $t 'diagnostic-finished.json')))){
    $exit=[pscustomobject]@{candidateSha256=$c.candidateSha256;monotonicObservedTicks=$now;monotonicFrequency=$frequency;reason=$(if($fault){'first-terminal-observation'}elseif($deadline.expired){$deadline.reason}else{'diagnostic-finished'});deadline=$deadline;normalExitRequired=$true;forceTerminationAllowed=$false;artifactRemovalWhileGameAlive=$false}
    Write-Menu02SupervisorNewJson (Join-Path $t 'normal-exit-required.json') $exit
   }
   # An empty process list before any Enhanced lifetime was observed cannot
   # prove that a pending Steam/Rockstar launch has been cancelled.
   if($game-and$processes.Count-eq0){if($null-eq$absence){$absence=$now}elseif(($now-$absence)/[double]$frequency-ge2){
    Write-Menu02SupervisorNewJson (Join-Path $t 'closure-observed.json') ([ordered]@{candidateSha256=$c.candidateSha256;normalProcessClosureObserved=$true;absenceObservations=2;absenceSeparationSeconds=($now-$absence)/[double]$frequency;gameObserved=($null-ne$game);exitCodeKnown=$false;noHotUnloadProof=$true})
    Write-Menu02SupervisorNewJson (Join-Path $t 'supervisor-complete.json') ([ordered]@{candidateSha256=$c.candidateSha256;closureObserved=$true;automaticRetry=$false;launchedBySupervisor=$false;telemetryVerdict='separate-closed-evidence-analysis-required'});return
   }}else{$absence=$null}
   if($exit-and(Get-StreetTrackedSessionDeadline01 $launch $loaded $exit $now $frequency).expired){throw 'Normal game closure not observed within bound; preserve artifacts and report closure unknown'}
  }
  &$FixtureSleep
 }}catch{$failure=$_;try{if($launch-and!(Test-Path -LiteralPath (Join-Path $t 'normal-exit-required.json'))){Write-Menu02SupervisorNewJson (Join-Path $t 'normal-exit-required.json') ([ordered]@{candidateSha256=$c.candidateSha256;reason=$failure.Exception.Message;normalExitRequired=$true;forceTerminationAllowed=$false;artifactRemovalWhileGameAlive=$false;closureUnknown=$true})};Write-Menu02SupervisorNewJson (Join-Path $t 'supervisor-failure.json') ([ordered]@{candidateSha256=$c.candidateSha256;reason=$failure.Exception.Message;closureObserved=$false;forceTerminationAllowed=$false;removalAllowed=$false;automaticRetry=$false})}catch{};throw $failure}
}
function Start-StreetTrackedSoleLaunch01 {
 [CmdletBinding()]param([Parameter(Mandatory)][string]$Candidate,[Parameter(Mandatory)][string]$ExpectedCandidateSha256,
  [Parameter(Mandatory)][string]$ApprovalReceipt,[Parameter(Mandatory)][string]$ExpectedApprovalSha256)
 $c=Get-StreetTrackedWatchContext01 $Candidate $ExpectedCandidateSha256 $ApprovalReceipt $ExpectedApprovalSha256
 if($c.plan.fixtureOnly){throw 'Authored fixtures cannot launch a target'}
 $t=$c.transaction
 foreach($name in @('launch-intent.json','launch-terminal-failure.json','supervisor-complete.json','supervisor-failure.json','normal-exit-required.json','closure-observed.json','restoration.json')){if(Test-Path -LiteralPath (Join-Path $t $name)){throw 'Consumed or terminal transaction forbids launch'}}
 $ready=Read-Menu02SupervisorJson (Join-Path $t 'supervisor-ready.json')
 if($ready.kind-cne'StreetTrackedSupervisorReady01'-or$ready.candidateSha256-cne$c.candidateSha256-or$ready.approvalSha256-cne$c.approvalSha256-or$ready.supervisorSha256-cne(Get-StreetTrackedHash01 $script:StreetWatchSource01)){throw 'Exact independent supervisor is not ready'}
 $watcher=Get-Process -Id $ready.pid -ErrorAction Stop
 try{if($watcher.HasExited-or$watcher.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()-cne$ready.creationFileTime){throw 'Independent supervisor lifetime differs'}}finally{$watcher.Dispose()}
 [void](Assert-StreetTrackedFreshPreflight01 -Plan $c.plan -CandidateSha256 $c.candidateSha256 -Deployed)
 $now=[Diagnostics.Stopwatch]::GetTimestamp();if($ready.monotonicFrequency-ne[Diagnostics.Stopwatch]::Frequency-or$now-lt$ready.monotonicObservedTicks-or($now-$ready.monotonicObservedTicks)/[double][Diagnostics.Stopwatch]::Frequency-ge120){throw 'Supervisor launch window expired'}
 Write-Menu02SupervisorNewJson (Join-Path $t 'launch-intent.json') ([ordered]@{schema=1;kind='StreetTrackedSoleCmdLaunch01';candidateSha256=$c.candidateSha256;approvalSha256=$c.approvalSha256;monotonicStartTicks=$now;monotonicFrequency=[Diagnostics.Stopwatch]::Frequency;atUtc=[DateTime]::UtcNow.ToString('o');launches=1;route=$c.plan.launch.fileName;workingDirectory=$c.plan.launch.workingDirectory;arguments='';useShellExecute=$true;retry=$false})
 try{$info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$c.plan.launch.fileName;$info.WorkingDirectory=$c.plan.launch.workingDirectory;$info.Arguments='';$info.UseShellExecute=$true;$info.Verb='open';$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Normal
  $p=[Diagnostics.Process]::Start($info);if(!$p){throw 'Sole CMD dispatch returned no process'}
  try{Write-Menu02SupervisorNewJson (Join-Path $t 'launch-result.json') ([ordered]@{candidateSha256=$c.candidateSha256;launcherPid=$p.Id;dispatches=1;enhancedStartupProven=$false;automaticRetry=$false})}finally{$p.Dispose()}
 }catch{Write-Menu02SupervisorNewJson (Join-Path $t 'launch-terminal-failure.json') ([ordered]@{candidateSha256=$c.candidateSha256;reason=$_.Exception.Message;markerConsumed=$true;retry=$false});throw}
}
if($script:StreetWatchFunctionsOnly01){return}
if(!$Candidate-or!$ExpectedCandidateSha256){throw 'Supply an exact private candidate and SHA256; Preview is the default'}
if($Mode-eq'Preview'){$p=Read-StreetTrackedPinned01 $Candidate $ExpectedCandidateSha256;Assert-StreetTrackedPlan01 $p;[pscustomobject]@{preparedOnly=$true;launch=$p.launch;startupSeconds=600;preArmSeconds=10;nativeSeconds=120;writerSeconds=3;exitSeconds=180;overallSeconds=913;installationRead=$false;writes=$false;launchPerformed=$false};return}
if($Mode-eq'Watch'){Watch-StreetTrackedSession01 $Candidate $ExpectedCandidateSha256 $ApprovalReceipt $ExpectedApprovalSha256}
elseif($Mode-eq'Launch'){Start-StreetTrackedSoleLaunch01 $Candidate $ExpectedCandidateSha256 $ApprovalReceipt $ExpectedApprovalSha256}
