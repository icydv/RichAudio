# Original authored clocks/receipts only. No target process is started.
#requires -Version 7.0
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
. (Join-Path $repo 'tools/Watch-StreetTrackedSession01.ps1') -FunctionsOnly
$root=Join-Path $repo ('.local/street01-passive-telemetry01/supervision-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$checks=0
function Check($condition,[string]$why){if(!$condition){throw $why};$script:checks++}
function Reject([scriptblock]$action,[string]$why){$rejected=$false;try{&$action}catch{$rejected=$true};Check $rejected $why}
$f=[Diagnostics.Stopwatch]::Frequency;$s=[long]($f*1000);$launch=[pscustomobject]@{monotonicStartTicks=$s;monotonicFrequency=$f}
$d=Get-StreetTrackedSessionDeadline01 $launch $null $null ($s+599*$f) $f
Check (!$d.expired-and$d.phase-eq'startup') 'Startup remains bounded before600s'
Check ((Get-StreetTrackedSessionDeadline01 $launch $null $null ($s+600*$f) $f).expired) 'Startup expires exactly600s'
$load=[pscustomobject]@{monotonicObservedTicks=($s+590*$f);monotonicFrequency=$f}
Check (!(Get-StreetTrackedSessionDeadline01 $launch $load $null ($s+722*$f) $f).expired) 'Pre-arm, native and three-second writer windows are explicit'
Check ((Get-StreetTrackedSessionDeadline01 $launch $load $null ($s+723*$f) $f).expired) 'Diagnostic window expires at133s'
$late=[pscustomobject]@{monotonicObservedTicks=($s+601*$f);monotonicFrequency=$f}
Check ((Get-StreetTrackedSessionDeadline01 $launch $late $null ($s+601*$f) $f).reason-eq'late-diagnostic-load-cannot-extend-startup') 'Late load cannot revive startup'
$exit=[pscustomobject]@{monotonicObservedTicks=($s+800*$f);monotonicFrequency=$f}
Check ((Get-StreetTrackedSessionDeadline01 $launch $load $exit ($s+912*$f) $f).deadlineTicks-eq($s+913*$f)) 'Normal exit cannot extend overall913s'
Reject {Get-StreetTrackedSessionDeadline01 $launch $null $null ($s-1) $f} 'Backwards clock rejected'
Reject {Get-StreetTrackedSessionDeadline01 $launch $null $null $s ($f+1)} 'Foreign frequency rejected'
Reject {Get-StreetTrackedSessionDeadline01 $launch ([pscustomobject]@{monotonicObservedTicks=$s+1;monotonicFrequency=$f}) $null $s $f} 'Future load rejected'
Reject {Get-StreetTrackedSessionDeadline01 ([pscustomobject]@{monotonicStartTicks=[long]::MaxValue-1;monotonicFrequency=$f}) $null $null ([long]::MaxValue) $f} 'Overflow rejected'

function New-AuthoredContext([string]$name){
 $dir=Join-Path $root $name;[IO.Directory]::CreateDirectory($dir)|Out-Null;$fake=Join-Path $dir 'game';[IO.Directory]::CreateDirectory($fake)|Out-Null
 Write-StreetTrackedNew01 (Join-Path $dir 'fixture-only.json') @{kind='OriginalStreetTrackedTransactionFixture01';installedAccessAllowed=$false}
 $h='a'*64;$rows=@();foreach($r in @('RichAudio.StreetTracked01.asi','Plugins/RichAudio.StreetTrackedDiagnostic01.Rph.dll','Plugins/RichAudio.StreetTrackedDiagnostic01.json','startup.rphs')){$rows+=@{relative=$r;sha256=$h;bytes=0;expectedOriginalExists=($r-eq'startup.rphs');expectedOriginalSha256=$h;expectedOriginalBytes=28}}
 $plan=@{schema=1;kind='RichAudioStreetTrackedCandidate01';approvalGranted=$false;maximumLaunches=1;automaticRetry=$false;audioAllowed=$false;nativeMutationAllowed=$false;mappingAllowed=$false;recordingAllowed=$false;hotUnloadAllowed=$false;fixtureOnly=$true;payload=$rows;sourcePins=@();gameRoot=$fake;baseline=@{gameExecutable=@{path=(Join-Path $fake 'GTA5_Enhanced.exe');sha256=$h};observedApi=@{sha256=$h}};sidecar=@{passiveOnly=$true;audioAllowed=$false;nativeMutationAllowed=$false;maximumRecords=2400;maximumSeconds=120;rphSHA256=$h;gameSHA256=$h};launch=@{method='Windows-shell-open-existing-cmd-once';useShellExecute=$true;verb='open';arguments='';alternateLaunchOrRetry=$false}}
 $plan.supervisorSha256=Get-StreetTrackedHash01 (Join-Path $repo 'tools/Watch-StreetTrackedSession01.ps1')
 $plan.launch.fileName=Join-Path $fake 'Launch RAGE Plugin Hook.cmd';$plan.launch.workingDirectory=$fake
 $candidate=Join-Path $dir 'candidate.json';Write-StreetTrackedNew01 $candidate $plan;$sha=Get-StreetTrackedHash01 $candidate
 $approval=@{kind='RichAudioStreetTrackedSessionApproval01';approved=$true;candidateSha256=$sha;maximumLaunches=1;noRetry=$true;processLifetimePinAcknowledged=$true;processExitBeforeRestoration=$true;supervisorSha256=(Get-StreetTrackedHash01 (Join-Path $repo 'tools/Watch-StreetTrackedSession01.ps1'))}
 $auth=Join-Path $dir 'approval.json';Write-StreetTrackedNew01 $auth $approval;$authSha=Get-StreetTrackedHash01 $auth
 $t=Join-Path $dir 'transaction';[IO.Directory]::CreateDirectory($t)|Out-Null
 Write-StreetTrackedNew01 (Join-Path $t 'deployed.json') @{candidateSha256=$sha;changes=$rows}
 Write-StreetTrackedNew01 (Join-Path $t 'attempt.json') @{candidateSha256=$sha;approval=$approval}
 [pscustomobject]@{candidate=$candidate;sha=$sha;approval=$auth;approvalSha=$authSha;t=$t;gamePath=$plan.baseline.gameExecutable.path}
}
$c=New-AuthoredContext 'joined'
$state=@{step=0;now=$s;birth=[DateTime]::UtcNow.ToFileTimeUtc().ToString()}
$clock={
 $state.step++;$state.now=$s+$state.step*$f
 if($state.step-eq2){[IO.File]::WriteAllText((Join-Path $c.t 'launch-intent.json'),(@{kind='StreetTrackedSoleCmdLaunch01';candidateSha256=$c.sha;approvalSha256=$c.approvalSha;monotonicStartTicks=$s+$f;monotonicFrequency=$f;atUtc=[DateTime]::UtcNow.AddSeconds(-10).ToString('o')}|ConvertTo-Json -Depth 4))}
 if($state.step-eq3){[IO.File]::WriteAllText((Join-Path $c.t 'diagnostic-load.json'),(@{candidateSha256=$c.sha;gameProcessId=4242;gameCreationFileTime=$state.birth;monotonicObservedTicks=$state.now;monotonicFrequency=$f}|ConvertTo-Json -Depth 4))}
 if($state.step-eq4){[IO.File]::WriteAllText((Join-Path $c.t 'diagnostic-finished.json'),(@{candidateSha256=$c.sha}|ConvertTo-Json))}
 [long]$state.now
}.GetNewClosure()
$processes={if($state.step-ge2-and$state.step-lt5){[pscustomobject]@{id=4242;name='GTA5_Enhanced';path=$c.gamePath;creationFileTime=$state.birth}}}.GetNewClosure()
Watch-StreetTrackedSession01 $c.candidate $c.sha $c.approval $c.approvalSha -FixtureClock $clock -FixtureProcesses $processes -FixtureSleep {}
$closed=Read-Menu02SupervisorJson (Join-Path $c.t 'closure-observed.json');Check ($closed.normalProcessClosureObserved-and$closed.absenceSeparationSeconds-ge2) 'Actual watcher requires two separated absence observations'
Check ((Read-Menu02SupervisorJson (Join-Path $c.t 'normal-exit-required.json')).forceTerminationAllowed-eq$false) 'Watcher requests normal exit without controlling game'
Check (!(Test-Path -LiteralPath (Join-Path $c.t 'launch-result.json'))) 'Authored watcher never invokes launcher'
Reject {Watch-StreetTrackedSession01 $c.candidate $c.sha $c.approval $c.approvalSha -FixtureClock $clock -FixtureProcesses {} -FixtureSleep {}} 'Consumed watcher refuses reuse'
Reject {Start-StreetTrackedSoleLaunch01 $c.candidate $c.sha $c.approval $c.approvalSha} 'Even approved authored fixture cannot launch a target'

$c=New-AuthoredContext 'late-load'
$state=@{step=0;now=$s;birth=[DateTime]::UtcNow.ToFileTimeUtc().ToString()}
$clock={
 $state.step++;$elapsed=switch($state.step){1{0}2{1}3{602}default{783}};$state.now=$s+$elapsed*$f
 if($state.step-eq2){[IO.File]::WriteAllText((Join-Path $c.t 'launch-intent.json'),(@{kind='StreetTrackedSoleCmdLaunch01';candidateSha256=$c.sha;approvalSha256=$c.approvalSha;monotonicStartTicks=$s+$f;monotonicFrequency=$f;atUtc=[DateTime]::UtcNow.AddSeconds(-10).ToString('o')}|ConvertTo-Json -Depth 4))}
 if($state.step-eq3){[IO.File]::WriteAllText((Join-Path $c.t 'diagnostic-load.json'),(@{candidateSha256=$c.sha;gameProcessId=4242;gameCreationFileTime=$state.birth;monotonicObservedTicks=$state.now;monotonicFrequency=$f}|ConvertTo-Json -Depth 4))}
 [long]$state.now
}.GetNewClosure()
$processes={if($state.step-ge2){[pscustomobject]@{id=4242;name='GTA5_Enhanced';path=$c.gamePath;creationFileTime=$state.birth}}}.GetNewClosure()
Reject {Watch-StreetTrackedSession01 $c.candidate $c.sha $c.approval $c.approvalSha -FixtureClock $clock -FixtureProcesses $processes -FixtureSleep {}} 'Unclosed game exceeds bounded normal-exit window'
Check ((Read-Menu02SupervisorJson (Join-Path $c.t 'normal-exit-required.json')).reason-eq'late-diagnostic-load-cannot-extend-startup') 'Actual watcher retains first late-load boundary'
Check (!(Test-Path -LiteralPath (Join-Path $c.t 'closure-observed.json'))) 'Expired watcher cannot fabricate process closure'
Check ((Read-Menu02SupervisorJson (Join-Path $c.t 'supervisor-failure.json')).removalAllowed-eq$false) 'Unknown closure forbids removal'

$c=New-AuthoredContext 'dispatch-failed-with-pending-launch-unknown'
$state=@{step=0;now=$s}
$clock={
 $state.step++;$elapsed=switch($state.step){1{0}2{1}3{182}default{183}};$state.now=$s+$elapsed*$f
 if($state.step-eq2){[IO.File]::WriteAllText((Join-Path $c.t 'launch-intent.json'),(@{kind='StreetTrackedSoleCmdLaunch01';candidateSha256=$c.sha;approvalSha256=$c.approvalSha;monotonicStartTicks=$s+$f;monotonicFrequency=$f;atUtc=[DateTime]::UtcNow.AddSeconds(-10).ToString('o')}|ConvertTo-Json -Depth 4));[IO.File]::WriteAllText((Join-Path $c.t 'launch-terminal-failure.json'),(@{candidateSha256=$c.sha;retry=$false}|ConvertTo-Json))}
 [long]$state.now
}.GetNewClosure()
Reject {Watch-StreetTrackedSession01 $c.candidate $c.sha $c.approval $c.approvalSha -FixtureClock $clock -FixtureProcesses {} -FixtureSleep {}} 'No observed game cannot prove cancellation of pending launcher UI'
Check ((Read-Menu02SupervisorJson (Join-Path $c.t 'normal-exit-required.json')).reason-eq'first-terminal-observation') 'Sole dispatch failure requests exit immediately'
Check (!(Test-Path -LiteralPath (Join-Path $c.t 'closure-observed.json'))) 'No-game absence never authorizes restoration'

$c=New-AuthoredContext 'unexpected-main-service'
$state=@{step=0}
$clock={
 $state.step++;if($state.step-eq2){[IO.File]::WriteAllText((Join-Path $c.t 'launch-intent.json'),(@{kind='StreetTrackedSoleCmdLaunch01';candidateSha256=$c.sha;approvalSha256=$c.approvalSha;monotonicStartTicks=$s+$f;monotonicFrequency=$f;atUtc=[DateTime]::UtcNow.AddSeconds(-10).ToString('o')}|ConvertTo-Json -Depth 4))};[long]($s+$state.step*$f)
}.GetNewClosure()
$processes={if($state.step-ge2){[pscustomobject]@{id=4343;name='node';reason='known-RichAudio-node-package-or-service';path=(Join-Path $c.gamePath 'authored-service');creationFileTime='1'}}}.GetNewClosure()
Reject {Watch-StreetTrackedSession01 $c.candidate $c.sha $c.approval $c.approvalSha -FixtureClock $clock -FixtureProcesses $processes -FixtureSleep {}} 'Unexpected main-mod service terminates passive scope'
Check ((Read-Menu02SupervisorJson (Join-Path $c.t 'unexpected-service.json')).passiveScopeViolated) 'Unexpected service retains its actual identity witness'
Check ((Read-Menu02SupervisorJson (Join-Path $c.t 'normal-exit-required.json')).normalExitRequired) 'Unexpected service requests normal exit with no restart'
$result=[ordered]@{schema=1;kind='StreetTrackedSupervisionOriginal01';passed=$true;assertions=$checks;actualWatchSchedules=4;targetProcessStarted=$false;originalInstallationRead=$false;endpointOpened=$false;sourceSha256=(Get-StreetTrackedHash01 (Join-Path $repo 'tools/Watch-StreetTrackedSession01.ps1'))}
Write-StreetTrackedNew01 (Join-Path $root 'validation.json') $result
$result|ConvertTo-Json -Compress
