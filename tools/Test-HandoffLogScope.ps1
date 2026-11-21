#requires -Version 7.0
[CmdletBinding()]
param([string]$OutputRoot='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'Select-CurrentHandoffLog.ps1')
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-14/epoch-scope/validation-'+[Guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot);$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local/playable-14/epoch-scope')).TrimEnd('\')+'\'
if(!$output.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'New private epoch-scope output required.'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked output refused.'}}
[IO.Directory]::CreateDirectory($output)|Out-Null
$script:assertions=0;$cases=[Collections.Generic.List[object]]::new()
function NeedScope([bool]$ok,[string]$why){$script:assertions++;if(!$ok){throw $why}}
function CaseScope([string]$name,[scriptblock]$body){$before=$script:assertions;& $body;$cases.Add([ordered]@{name=$name;passed=$true;assertions=$script:assertions-$before})}
function BytesScope([string]$text){return ,([Text.UTF8Encoding]::new($false).GetBytes($text))}
function CloneScope($value){return ($value|ConvertTo-Json -Depth 8|ConvertFrom-Json)}
$launch=[pscustomobject]@{profile='PLAYABLE-14';sessionId=('3'*32);utc='2026-11-01T19:10:00Z'}
$creation=([DateTimeOffset]::Parse('2026-11-01T19:10:01Z').UtcDateTime.ToFileTimeUtc()).ToString();$gamePath='C:\synthetic-fixture\GTA5_Enhanced.exe'
$lease=[ordered]@{schema=1;profile='PLAYABLE-14';runtimePolicy='functional-compatibility';sessionId=$launch.sessionId;gameProcessId=123;gameProcessCreationFileTime=$creation;gamePath=$gamePath;gameSha256=('a'*64);gameVersion='fixture';shvPath='fixture';shvSha256=('b'*64);loaderPath='fixture';loaderSha256=('c'*64);producerPath='fixture';producerSha256=('d'*64);callerAssemblySha256=('e'*64);passiveOnly=$true;audioPlaybackAllowed=$false;fixtureOnly=$false;identityMode='fixture';counterWrapAddressAbaExcluded=$true}
$leaseBytes=BytesScope ($lease|ConvertTo-Json);$owner=[pscustomobject]@{profile='PLAYABLE-14';sessionId=$launch.sessionId;gameProcessId=123;processCreationFileTime=$creation;sha256=(Get-HandoffBytesHash $leaseBytes)}
$process=[pscustomobject]@{Id=123;CreationFileTime=$creation;Path=$gamePath;Alive=$true}
$tag='RichAudio PLAYABLE-14 passive fresh-context handoff only; GTA stock audio retained. No audio host or recording.'
$oldText="[11/1/2026 6:52:29 PM.830] $tag`n[11/1/2026 6:55:47 PM.000] RichAudio passive handoff ACTIVE (120 seconds maximum)`n[11/1/2026 6:55:51 PM.128] RichAudio passive handoff RETIRED: reason=listener-discontinuous`n"
$freshText="[11/1/2026 7:10:02 PM.000] $tag`n[11/1/2026 7:10:03 PM.000] RichAudio handoff READY: current`n[11/1/2026 7:10:04 PM.000] RichAudio passive handoff ACTIVE (120 seconds maximum)`n"
$baseline=New-HandoffLogBaseline (BytesScope $oldText) '2026-11-01T19:09:50Z'
function SelectFixtureScope([byte[]]$bytes,$base=$baseline,$currentOwner=$owner,$currentProcess=$process,[byte[]]$currentLease=$leaseBytes){
 Select-CurrentHandoffLog -CurrentBytes $bytes -Baseline $base -Launch $launch -Owner $currentOwner -LeaseBytes $currentLease -CurrentProcess $currentProcess -ExpectedGamePath $gamePath -ObservedUtc '2026-11-01T19:10:30Z' -LogTimeZone ([TimeZoneInfo]::Utc)
}
$retained=@()
try{
 CaseScope 'actual-live02-reproduces-prior-live01-false-terminal-without-process-or-lease' {
  $oldLog=Join-Path $repo '.local/playable-14/live-02/before-logs/RagePluginHook.log';$markerPath=Join-Path $repo '.local/playable-14/live-02/one-launch-started.json';$preflightPath=Join-Path $repo '.local/playable-14/live-02/preflight.json'
  $raw=[IO.File]::ReadAllBytes($oldLog);$actualText=[Text.UTF8Encoding]::new($false,$true).GetString($raw);$marker=Get-Content -LiteralPath $markerPath -Raw|ConvertFrom-Json;$preflight=Get-Content -LiteralPath $preflightPath -Raw|ConvertFrom-Json
  $at=$actualText.LastIndexOf('RichAudio PLAYABLE-14 passive fresh-context handoff only;',[StringComparison]::Ordinal);NeedScope ($at-ge0) 'Retained actual prior14 tag exists'
  $legacy=$actualText.Substring($at);NeedScope ($legacy.Contains('RichAudio passive handoff ACTIVE (120 seconds maximum)')-and$legacy.Contains('listener-discontinuous')) 'Old substring selector would admit both prior ACTIVE and terminal'
  $actualBaseline=New-HandoffLogBaseline $raw $preflight.utc
  $selected=Select-CurrentHandoffLog -CurrentBytes $raw -Baseline $actualBaseline -Launch $marker -Owner $null -LeaseBytes @() -CurrentProcess $null -ExpectedGamePath $gamePath -ObservedUtc ((ConvertTo-HandoffUtc $marker.utc).AddSeconds(1)) -LogTimeZone ([TimeZoneInfo]::Utc)
  NeedScope (!$selected.Admitted-and!$selected.Active-and!$selected.TerminalLine) 'Actual no-process/no-lease02 cannot inherit prior01 state'
  foreach($p in @($oldLog,$markerPath,$preflightPath)){$script:retained+= [ordered]@{path=[IO.Path]::GetRelativePath($repo,$p);bytes=(Get-Item -LiteralPath $p).Length;sha256=(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant()}}
 }
 CaseScope 'identical-prior-profile-still-rejected-with-fresh-process-and-lease' {
  $s=SelectFixtureScope (BytesScope $oldText);NeedScope ($s.ScopeValidated-and!$s.Admitted-and!$s.Active-and!$s.TerminalLine) 'Identical prelaunch bytes never become current'
  $s=SelectFixtureScope (BytesScope ("changed-header`n"+$oldText));NeedScope (!$s.Admitted-and!$s.TerminalLine) 'Rotating old content does not make its timestamp current'
 }
 CaseScope 'new-current-entry-appended-after-baseline' {
  $s=SelectFixtureScope (BytesScope ($oldText+$freshText));NeedScope ($s.Admitted-and$s.Ready-and$s.Active-and!$s.TerminalLine) 'Only appended current entry reaches ACTIVE'
  NeedScope (!$s.Content.Contains('listener-discontinuous')-and$s.LogMode-eq'unchanged-or-appended') 'Prior terminal excluded by byte epoch'
 }
 CaseScope 'truncate-and-rotate-require-fresh-current-entry' {
  $s=SelectFixtureScope (BytesScope $freshText);NeedScope ($s.Admitted-and$s.LogMode-eq'truncated-or-replaced') 'Fresh truncated log accepted with original baseline'
  $s=SelectFixtureScope (BytesScope ("new-header`n"+$freshText));NeedScope ($s.Admitted-and!$s.TerminalLine) 'Fresh rotated log accepted'
  $s=SelectFixtureScope @();NeedScope (!$s.Admitted-and!$s.Active) 'Empty rotated log does not manufacture ACTIVE'
 }
 CaseScope 'missing-process-lease-or-live-lifetime' {
  $bytes=BytesScope ($oldText+$freshText);$s=SelectFixtureScope $bytes $baseline $owner $null;NeedScope (!$s.Admitted) 'No PID cannot admit log'
  $s=SelectFixtureScope $bytes $baseline $owner $process @();NeedScope (!$s.Admitted) 'No installed lease cannot admit log'
  $dead=CloneScope $process;$dead.Alive=$false;$s=SelectFixtureScope $bytes $baseline $owner $dead;NeedScope (!$s.Admitted) 'Ended process cannot admit log'
 }
 CaseScope 'pid-reuse-session-and-lease-hash-mismatch' {
  $bytes=BytesScope ($oldText+$freshText)
  $wrong=CloneScope $process;$wrong.Id=124;$s=SelectFixtureScope $bytes $baseline $owner $wrong;NeedScope (!$s.Admitted) 'Wrong PID rejected'
  $wrong=CloneScope $process;$wrong.CreationFileTime=([long]$creation-10000000).ToString();$s=SelectFixtureScope $bytes $baseline $owner $wrong;NeedScope (!$s.Admitted) 'Reused PID lifetime rejected'
  $wrongOwner=CloneScope $owner;$wrongOwner.sessionId=('4'*32);$s=SelectFixtureScope $bytes $baseline $wrongOwner;NeedScope (!$s.Admitted) 'Wrong session rejected'
  $wrongOwner=CloneScope $owner;$wrongOwner.sha256=('0'*64);$s=SelectFixtureScope $bytes $baseline $wrongOwner;NeedScope (!$s.Admitted) 'Lease bytes must match owner digest'
  $wrongOwner=CloneScope $owner;$wrong=CloneScope $process;$wrong.Id=0;$wrongOwner.gameProcessId=0;$s=SelectFixtureScope $bytes $baseline $wrongOwner $wrong;NeedScope (!$s.Admitted) 'Nonpositive current PID rejected'
  $future=([DateTimeOffset]::Parse('2026-11-01T20:10:01Z').UtcDateTime.ToFileTimeUtc()).ToString();$futureLease=CloneScope $lease;$futureLease.gameProcessCreationFileTime=$future;$futureBytes=BytesScope ($futureLease|ConvertTo-Json)
  $wrongOwner=CloneScope $owner;$wrongOwner.processCreationFileTime=$future;$wrongOwner.sha256=Get-HandoffBytesHash $futureBytes;$wrong=CloneScope $process;$wrong.CreationFileTime=$future
  $s=SelectFixtureScope $bytes $baseline $wrongOwner $wrong $futureBytes;NeedScope (!$s.Admitted) 'Future process lifetime rejected even when all lease operands match'
 }
 CaseScope 'missing-ambiguous-and-unparseable-epoch-entry' {
  $s=SelectFixtureScope (BytesScope ($oldText+$freshText+$freshText));NeedScope (!$s.Admitted-and$s.Reason-eq'ambiguous-current-profile-entries') 'Ambiguous profile loads rejected'
  $s=SelectFixtureScope (BytesScope ($oldText+"[11/1/2026 7:10:04 PM.000] RichAudio passive handoff ACTIVE (120 seconds maximum)`n"));NeedScope (!$s.Admitted) 'ACTIVE alone is not a profile epoch'
  $s=SelectFixtureScope (BytesScope ("[unparseable] $tag`n"));NeedScope (!$s.Admitted) 'Unknown timestamps do not become fresh'
 }
 CaseScope 'partial-lines-and-partial-prelaunch-utf8-are-not-events' {
  $partial=$oldText+$freshText+'[11/1/2026 7:10:05 PM.000] RichAudio passive handoff RETIRED: partial';$s=SelectFixtureScope (BytesScope $partial);NeedScope ($s.Admitted-and!$s.TerminalLine) 'Incomplete last line is not terminal'
  $prefix=BytesScope 'old π';$cut=[byte[]]::new($prefix.Length-1);[Array]::Copy($prefix,$cut,$cut.Length);$base=New-HandoffLogBaseline $cut '2026-11-01T19:09:50Z'
  $s=SelectFixtureScope (BytesScope ("old π`n"+$freshText)) $base;NeedScope ($s.Admitted) 'Partial prior UTF8 line discarded before decoding new epoch'
 }
 CaseScope 'fresh-current-lifecycle-error-can-stop-before-profile-entry' {
  $s=SelectFixtureScope (BytesScope ($oldText+"[11/1/2026 7:10:02 PM.000] RichAudio passive compatibility/lifecycle failure: current`n"));NeedScope ($s.Admitted-and$s.TerminalLine-and!$s.Active) 'Fresh process/session lifecycle failure remains observable'
 }
 CaseScope 'post-launch-but-before-current-process-messages-rejected' {
  $laterCreation=([DateTimeOffset]::Parse('2026-11-01T19:10:05Z').UtcDateTime.ToFileTimeUtc()).ToString();$laterLease=CloneScope $lease;$laterLease.gameProcessCreationFileTime=$laterCreation;$laterBytes=BytesScope ($laterLease|ConvertTo-Json)
  $laterOwner=CloneScope $owner;$laterOwner.processCreationFileTime=$laterCreation;$laterOwner.sha256=Get-HandoffBytesHash $laterBytes;$laterProcess=CloneScope $process;$laterProcess.CreationFileTime=$laterCreation
  $s=SelectFixtureScope (BytesScope ($oldText+$freshText)) $baseline $laterOwner $laterProcess $laterBytes
  NeedScope ($s.ScopeValidated-and!$s.Admitted-and!$s.Active-and!$s.TerminalLine) 'Parseable same-profile entry and ACTIVE after launch but before exact process creation are not its epoch'
 }
 CaseScope 'only-entry-after-current-process-creation-establishes-epoch' {
  $laterCreation=([DateTimeOffset]::Parse('2026-11-01T19:10:05Z').UtcDateTime.ToFileTimeUtc()).ToString();$laterLease=CloneScope $lease;$laterLease.gameProcessCreationFileTime=$laterCreation;$laterBytes=BytesScope ($laterLease|ConvertTo-Json)
  $laterOwner=CloneScope $owner;$laterOwner.processCreationFileTime=$laterCreation;$laterOwner.sha256=Get-HandoffBytesHash $laterBytes;$laterProcess=CloneScope $process;$laterProcess.CreationFileTime=$laterCreation
  $after="[11/1/2026 7:10:06 PM.000] $tag`n[11/1/2026 7:10:07 PM.000] RichAudio handoff READY: current process`n"
  $s=SelectFixtureScope (BytesScope ($oldText+$freshText+$after)) $baseline $laterOwner $laterProcess $laterBytes
  NeedScope ($s.Admitted-and$s.Ready-and!$s.Active) 'Current entry accepted without inheriting pre-process ACTIVE'
  NeedScope ($s.EntryUtc-eq'2026-11-01T19:10:06.0000000Z') 'Epoch timestamp belongs to current process'
 }
 CaseScope 'original-monotonic-startup-waiting-and-active-anchors-never-reset' {
  $none=SelectFixtureScope (BytesScope $oldText);$active=SelectFixtureScope (BytesScope ($oldText+$freshText));$launchTicks=100000L;$frequency=1000L
  $d=Get-HandoffObserverDecision -LaunchTicks $launchTicks -Frequency $frequency -NowTicks ($launchTicks+120000) -ScopedLog $none;NeedScope ($d.Failure-eq'startup-deadline-no-exact-enhanced-observed'-and$null-eq$d.ActiveAtTicks) 'Prior ACTIVE cannot suppress120s startup deadline'
  $d=Get-HandoffObserverDecision -LaunchTicks $launchTicks -Frequency $frequency -NowTicks ($launchTicks+300000) -StartupAtTicks ($launchTicks+33000) -ScopedLog $none;NeedScope ($d.Failure-eq'conservative-launch-waiting-deadline') 'Rotation cannot re-anchor300s waiting cap'
  $late=Get-HandoffObserverDecision -LaunchTicks $launchTicks -Frequency $frequency -NowTicks ($launchTicks+301000) -StartupAtTicks ($launchTicks+33000) -ScopedLog $active;NeedScope ($late.Failure-eq'conservative-launch-waiting-deadline'-and$null-eq$late.ActiveAtTicks) 'Late ACTIVE cannot reset expired waiting cap'
  $first=Get-HandoffObserverDecision -LaunchTicks $launchTicks -Frequency $frequency -NowTicks ($launchTicks+75000) -StartupAtTicks ($launchTicks+33000) -ScopedLog $active;NeedScope ($first.ActiveAtTicks-eq$launchTicks+75000) 'First genuine ACTIVE starts observed active anchor'
  $again=Get-HandoffObserverDecision -LaunchTicks $launchTicks -Frequency $frequency -NowTicks ($launchTicks+100000) -StartupAtTicks ($launchTicks+33000) -ActiveAtTicks $first.ActiveAtTicks -ScopedLog $active;NeedScope ($again.ActiveAtTicks-eq$first.ActiveAtTicks) 'Repeated ACTIVE cannot reset active anchor'
  $gap=Get-HandoffObserverDecision -LaunchTicks $launchTicks -Frequency $frequency -NowTicks ($launchTicks+100000) -StartupAtTicks ($launchTicks+33000) -ActiveAtTicks $first.ActiveAtTicks -ScopedLog $none;NeedScope ($gap.State-eq'active'-and$gap.ActiveAtTicks-eq$first.ActiveAtTicks) 'Log rotation preserves previously observed active state and anchor'
  $last=Get-HandoffObserverDecision -LaunchTicks $launchTicks -Frequency $frequency -NowTicks ($launchTicks+195000) -StartupAtTicks ($launchTicks+33000) -ActiveAtTicks $again.ActiveAtTicks -ScopedLog $none;NeedScope ($last.Failure-eq'active-deadline-observed-without-terminal'-and$last.ActiveAtTicks-eq$first.ActiveAtTicks) 'Missing/rotated log preserves120s active cap'
  $latched=Get-HandoffObserverDecision -LaunchTicks $launchTicks -Frequency $frequency -NowTicks ($launchTicks+196000) -StartupAtTicks ($launchTicks+33000) -ActiveAtTicks $again.ActiveAtTicks -ScopedLog $active -PriorFailure $last.Failure;NeedScope ($latched.Failure-eq$last.Failure-and$latched.StopRequired) 'Fresh text cannot clear earlier terminal observer failure'
 }
 $receipt=[ordered]@{schema=1;profile='PLAYABLE-14';kind='pure-current-process-session-log-epoch-and-deadline-fixtures';passed=$true;cases=$cases.Count;assertions=$script:assertions;caseResults=$cases.ToArray();retainedSources=$retained;helperSha256=(Get-FileHash (Join-Path $PSScriptRoot 'Select-CurrentHandoffLog.ps1')).Hash.ToLowerInvariant();runnerSha256=(Get-FileHash $PSCommandPath).Hash.ToLowerInvariant();origin='Synthetic process/lease/log inputs plus actual retained01log used by02 false-terminal reproduction';gameOrNativeExecuted=$false;processQueried=$false;uiActivated=$false;endpointOpened=$false;candidateChanged=$false;previousAttemptsChanged=$false;thirdLiveAttemptAuthorized=$false;limits='Pure text/byte/scope and monotonic-policy fixtures; no live observer, plugin, device, GTA or future launch was executed. New observer integration requires separate review and fresh explicit live approval.'}
 $path=Join-Path $output 'validation.json';[IO.File]::WriteAllText($path,($receipt|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false));Write-Output ('PASS'+$cases.Count+' focused handoff log-scope cases: '+$path)
}catch{[IO.File]::WriteAllText((Join-Path $output 'failure.txt'),$_.ToString(),[Text.UTF8Encoding]::new($false));throw}
