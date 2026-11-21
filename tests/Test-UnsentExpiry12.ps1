[CmdletBinding()]
param([string]$Output=('.local/expiry12-controls-'+[guid]::NewGuid().ToString('N')))
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$repo=Split-Path -Parent $PSScriptRoot
. (Join-Path $repo 'tools/UnsentExpiry.Diagnostics.ps1')
. (Join-Path $repo 'tools/UnsentExpiry.StageJournal.ps1')
if($Output -notmatch '^\.local[/\\][A-Za-z0-9_-]+$'){throw 'Private output required'}
$out=[IO.Path]::GetFullPath((Join-Path $repo $Output))
for($dir=[IO.DirectoryInfo]::new($out);$dir;$dir=$dir.Parent){if($dir.Exists -and ($dir.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked control output'}}
if(Test-Path -LiteralPath $out){throw 'Fresh control output required'}
[void][IO.Directory]::CreateDirectory($out)
$script:checks12=0
function Assert-Expiry12([bool]$Condition,[string]$Label){$script:checks12++;if(!$Condition){throw ('WORLD12 expiry control: '+$Label)}}
$journal=New-ExpiryStageJournal (Join-Path $out 'authored-journal.bin') 'sender'
try {
 Add-ExpiryParentStage $journal 1
 $current=Get-Process -Id $PID
 $offset=64+16*32
 $journal.View.Write($offset+4,[int]32);$journal.View.Write($offset+8,[int]$PID);$journal.View.Write($offset+12,[int]1);$journal.View.Write($offset+16,[long][Diagnostics.Stopwatch]::GetTimestamp());$journal.View.Write($offset,[int]1)
 $read=Read-ExpiryStageJournal $journal $current
 Assert-Expiry12 ($read.State -eq 'qualified' -and $read.ChildEventCount -eq 1 -and $read.LastChildStage -eq 'child-entry' -and $read.ByteBound -eq 2112) 'bounded authored parent/child stages qualify'
 $journal.View.Write($offset+8,[int]($PID+1));$read=Read-ExpiryStageJournal $journal $current
 Assert-Expiry12 ($read.State -eq 'invalid-entry' -and $read.ChildEventCount -eq 0) 'foreign child PID is rejected'
 $journal.View.Write($offset+8,[int]$PID);$journal.View.Write($offset+4,[int]999);$read=Read-ExpiryStageJournal $journal $current
 Assert-Expiry12 ($read.State -eq 'invalid-entry' -and $read.ChildEventCount -eq 0) 'unknown stage cannot enter evidence'
 $journal.View.Write($offset+4,[int]32);$journal.View.Write($offset,[int]2);$read=Read-ExpiryStageJournal $journal $current
 Assert-Expiry12 ($read.State -eq 'invalid-entry') 'invalid commit is rejected'
 $journal.View.Write($offset,[int]1);$journal.View.Write(8,[int]($PID+1));$read=Read-ExpiryStageJournal $journal $current
 Assert-Expiry12 ($read.State -eq 'owner-mismatch' -and $read.Events.Count -eq 0) 'owner header mismatch fails closed'
 $journal.View.Write(8,[int]$PID);$journal.View.Write($offset,[int]0)
 $read=Read-ExpiryStageJournal $journal $current
 Assert-Expiry12 ($read.ChildEventCount -eq 0 -and $read.LastChildStage -eq $null) 'uncommitted stage is absent rather than fabricated'
 $journal.View.Write($offset+32+4,[int]32);$journal.View.Write($offset+32+8,[int]$PID);$journal.View.Write($offset+32+12,[int]1);$journal.View.Write($offset+32+16,[long][Diagnostics.Stopwatch]::GetTimestamp());$journal.View.Write($offset+32,[int]2)
 Assert-Expiry12 ((Read-ExpiryStageJournal $journal $current).State -eq 'invalid-entry') 'committed stage after a gap is rejected'
 $boundThrew=$false;try{Add-ExpiryParentStage $journal 999}catch{$boundThrew=$true}
 Assert-Expiry12 $boundThrew 'parent stage allowlist is enforced'
 $journal.ParentEntries=16;$boundThrew=$false;try{Add-ExpiryParentStage $journal 1}catch{$boundThrew=$true}
 Assert-Expiry12 $boundThrew 'parent entry capacity is enforced'
} finally {Close-ExpiryStageJournal $journal}

# Each authored hold is an independently selected negative control, executed
# once. It must fail the actual unchanged five-second harness and leave its
# journal after mandatory owned-process cleanup; no failed case is retried.
$faults=@('before-child-entry','appdomain-create-before','appdomain-activate-before','sender-entry','sender-ready','first-work-published','first-completion-observed','sender-stop-before','appdomain-unload-before','terminal-record-before')
$attempts=[Collections.Generic.List[object]]::new()
$hosted=if($env:GITHUB_ACTIONS -eq 'true'){Join-Path $repo '.local/expiry12-ci-evidence'}else{$null}
if($hosted){
 for($dir=[IO.DirectoryInfo]::new($hosted);$dir;$dir=$dir.Parent){if($dir.Exists -and ($dir.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked hosted control evidence'}}
 if(Test-Path -LiteralPath $hosted){throw 'Fresh hosted control evidence required'}
 [void][IO.Directory]::CreateDirectory($hosted)
}
$actions=$env:GITHUB_ACTIONS
try {
 $env:GITHUB_ACTIONS=$null
 foreach($fault in $faults){
  $relative=($Output.TrimEnd('/','\')+'-'+$fault);$started=[Diagnostics.Stopwatch]::StartNew();$threw=$false
  try{& (Join-Path $repo 'tools/Test-UnsentExpiry.ps1') -Output $relative -Case 'domain-1' -SkipConsoleFixture -DiagnosticFault $fault|Out-Null}catch{$threw=$true}
  $elapsed=$started.Elapsed.TotalMilliseconds
  $path=Join-Path (Join-Path $repo $relative) 'sanitized-diagnostics/domain-1.json'
  Assert-Expiry12 ($threw -and (Test-Path -LiteralPath $path)) ('failed control retained: '+$fault)
  $bytes=[IO.File]::ReadAllBytes($path);$record=[Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json
  if($hosted){[IO.File]::WriteAllBytes((Join-Path $hosted ($fault+'.json')),$bytes)}
  Assert-Expiry12 (!$record.Passed -and $record.DiagnosticFault -ceq $fault -and $record.Execution.SenderWaitCompleted -eq $false -and $record.Execution.SenderWaitBudgetMs -ge 0 -and $record.Execution.SenderWaitBudgetMs -le 5000 -and $record.Execution.PrimaryTerminal.Code -eq 'child-lifetime') ('five-second negative outcome: '+$fault)
  Assert-Expiry12 ($record.Execution.Sender.KillRequested -and $record.Execution.Sender.Exited -and $record.Execution.Receiver.Exited -and $record.Execution.CleanupErrorCount -eq 0) ('both owned processes terminated: '+$fault)
  Assert-Expiry12 ($record.StageJournals.Sender.State -eq 'qualified' -and $record.StageJournals.Receiver.State -eq 'qualified' -and $record.StageJournals.Sender.LastParentStage -eq 'parent-exit-observed') ('post-termination stage evidence: '+$fault)
  $expected=if($fault -eq 'before-child-entry'){$null}else{$fault}
  Assert-Expiry12 ($record.StageJournals.Sender.LastChildStage -ceq $expected) ('exact final committed stage: '+$fault)
  Assert-Expiry12 ($bytes.Length -le 16384 -and [IO.FileInfo]::new((Join-Path (Join-Path $repo $relative) 'domain-1-sender.stage-journal.bin')).Length -eq 2112) ('fixed publication and raw journal bounds: '+$fault)
  Assert-Expiry12 ($record.Sender.RecordState -eq 'missing' -and $record.FailedPredicates -contains 'sender.record.parsed') ('missing terminal record remains a failure: '+$fault)
  if($fault -in @('sender-ready','first-work-published','first-completion-observed','sender-stop-before')){
   $entry=@($record.StageJournals.Sender.Events|Where-Object{$_[0] -ceq 'sender-entry'})[0]
   $outer=@($record.StageJournals.Sender.Events|Where-Object{$_[0] -ceq 'child-entry'})[0]
   Assert-Expiry12 ($entry[2] -ne $outer[2]) ('actual observed child AppDomain differs from entry domain: '+$fault)
  }
  $attempts.Add([pscustomobject]@{fault=$fault;expectedFailure=$true;elapsedMs=$elapsed;lastChildStage=$record.StageJournals.Sender.LastChildStage;senderTerminated=$true;receiverTerminated=$true;diagnosticSha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant();diagnosticBytes=$bytes.Length})
 }
} finally {$env:GITHUB_ACTIONS=$actions}
$summary=[ordered]@{suite='world12-expiry-bounded-stage-controls';passed=$script:checks12;failed=0;attempts=$attempts.ToArray();senderWaitLimitMs=5000;automaticRetries=0;endpointConstructed=$false;liveGta=$false;limitation='Authored holds qualify timeout diagnostics and cleanup only. They do not identify the cause of retained hosted domain-1 failure.'}
$json=$summary|ConvertTo-Json -Depth 8
[IO.File]::WriteAllText((Join-Path $out 'summary.json'),$json,[Text.UTF8Encoding]::new($false))
if($hosted){[IO.File]::WriteAllText((Join-Path $hosted 'summary.json'),$json,[Text.UTF8Encoding]::new($false))}
$json
