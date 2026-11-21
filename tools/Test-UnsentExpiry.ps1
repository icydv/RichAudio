param(
 [string]$Output=('.local/expiry-'+[guid]::NewGuid().ToString('N')),
 [switch]$Baseline,
 [ValidateSet('none-1','none-2','none-3','domain-1','domain-2','domain-3','before','after','late','domain-late')]
 [string[]]$Case=@('none-1','none-2','none-3','domain-1','domain-2','domain-3','before','after','late','domain-late'),
 [switch]$SkipConsoleFixture,
 [ValidateSet('none','before-child-entry','child-entry','appdomain-create-before','appdomain-activate-before','sender-entry','sender-ready','first-work-published','first-completion-observed','sender-stop-before','appdomain-unload-before','terminal-record-before')]
 [string]$DiagnosticFault='none'
)
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot;Set-Location $repo
. (Join-Path $PSScriptRoot 'UnsentExpiry.Diagnostics.ps1')
if($Case.Count -eq 0 -or $Case.Count -gt 10 -or @($Case|Select-Object -Unique).Count -ne $Case.Count){throw 'Select each expiry case at most once'}
if($DiagnosticFault -ne 'none' -and ($Case.Count -ne 1 -or $Case[0] -ne 'domain-1' -or $Baseline)){throw 'Explicit fault controls require one original domain-1 case'}
$faultCode=if($DiagnosticFault -eq 'none'){'none'}elseif($DiagnosticFault -eq 'before-child-entry'){'before-child-entry'}else{[string](@($script:ExpiryStages.Keys|Where-Object{$script:ExpiryStages[$_] -ceq $DiagnosticFault})[0])}
if($Output -notmatch '^\.local[/\\][A-Za-z0-9_-]+$'){throw 'Private output required'}
$out=[IO.Path]::GetFullPath((Join-Path $repo $Output));for($d=[IO.DirectoryInfo]::new($out);$d;$d=$d.Parent){if($d.Exists -and ($d.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked output'}}
if($out -eq (Join-Path $repo '.local/expiry-ci-evidence')){throw 'Sanitized hosted evidence directory is reserved'}
if(Test-Path $out){throw 'Fresh output required'};[IO.Directory]::CreateDirectory($out)|Out-Null
$diagnosticDirectory=Join-Path $out 'sanitized-diagnostics';$hostedEvidence=$null
if($env:GITHUB_ACTIONS -eq 'true'){
 $hostedEvidence=Join-Path $repo '.local/expiry-ci-evidence'
 for($d=[IO.DirectoryInfo]::new($hostedEvidence);$d;$d=$d.Parent){if($d.Exists -and ($d.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked hosted evidence'}}
 if(Test-Path -LiteralPath $hostedEvidence){throw 'Fresh hosted evidence required'}
 [void][IO.Directory]::CreateDirectory($hostedEvidence)
}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$exe=Join-Path $out 'Expiry.exe'
$sources=@(Get-ChildItem src/acoustics/host/Transport -Filter '*.cs'|ForEach-Object FullName)+@((Join-Path $repo 'tests/host/ExpiryExperiment.cs'),(Join-Path $repo 'tests/host/ExpiryStageJournal.cs'))
$define='/define:TRANSPORT_EXPIRY_TEST'
if($Baseline){
 $original=git show '61fa719635bad23e76da129e55ac23459d5bb123:src/acoustics/host/Transport/StatePipe.cs'
 if($LASTEXITCODE){throw 'Pinned baseline source missing'}
 $original=$original -join "`n"
 $anchor='        private void Run()'+"`n"+'        {'+"`n"+'            while(!stopped.WaitOne(0)&&Attempts<maximumAttempts)'
 if(!$original.Contains($anchor)){throw 'Baseline source shape differs'}
 $original=$original.Replace($anchor,('        internal Action BeforeEncodeTest, AfterEncodeTest;'+"`n"+$anchor))
 $original=$original.Replace('byte[] bytes=Protocol.Frame(state);','if(BeforeEncodeTest!=null)BeforeEncodeTest();byte[] bytes=Protocol.Frame(state);if(AfterEncodeTest!=null)AfterEncodeTest();')
 $baselineFile=Join-Path $out 'BaselineStatePipe.cs';$original|Set-Content $baselineFile
 # The historical listener protocol predates the independent gameplay ACK
 # contract. Compile only the historical listener under test, unchanged.
 $sources=@($sources|Where-Object { [IO.Path]::GetFileName($_) -notin @('StatePipe.cs','GameplayProtocol.cs') })+@($baselineFile)
 $define='/define:TRANSPORT_EXPIRY_TEST,EXPIRY_BASELINE'
}
& $compiler /nologo /optimize+ /warnaserror+ /platform:x64 $define /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll ('/out:'+$exe) @sources
if($LASTEXITCODE){throw 'Build failed'}
foreach($caseName in $Case){
 $mode=if($caseName -ceq 'domain-late'){'domain-late'}else{$caseName.Split('-')[0]};$pipe='RichAudio.Expiry.'+[guid]::NewGuid().ToString('N');$rx=Join-Path $out ($caseName+'-receiver.json');$tx=Join-Path $out ($caseName+'-sender.json')
 $receiver=$null;$sender=$null;$senderKilled=$false;$receiverKilled=$false
 $senderJournal=$null;$receiverJournal=$null
 $execution=[pscustomobject]@{ReadinessObserved=$false;SenderWaitCompleted=$null;ReceiverWaitCompleted=$null;SenderWaitBudgetMs=$null;SenderBudgetElapsedMs=$null;ReceiverWaitBudgetMs=$null;ReceiverBudgetElapsedMs=$null;PrimaryTerminal=$null;CleanupErrors=[Collections.Generic.List[object]]::new();Sender=$null;Receiver=$null}
 $operation='stage-journal-create'
 try{
  $senderJournal=New-ExpiryStageJournal (Join-Path $out ($caseName+'-sender.stage-journal.bin')) 'sender'
  $receiverJournal=New-ExpiryStageJournal (Join-Path $out ($caseName+'-receiver.stage-journal.bin')) 'receiver'
  $operation='receiver-start'
  Add-ExpiryParentStage $receiverJournal 1
  $receiver=Start-Process $exe -ArgumentList @('receive',$pipe,$mode,('"'+$rx+'"'),('"'+$receiverJournal.Path+'"'),$receiverJournal.Nonce,$receiverJournal.OwnerPid,$receiverJournal.OwnerTicks,'none') -PassThru -WindowStyle Hidden
  $w=[Diagnostics.Stopwatch]::StartNew()
  Add-ExpiryParentStage $receiverJournal 2
  $operation='readiness';while(!(Test-Path ($rx+'.ready')) -and $w.ElapsedMilliseconds -lt 2000){Start-Sleep -Milliseconds 10}
  $markerPresent=Test-Path ($rx+'.ready');$execution.ReadinessObserved=$markerPresent -and $w.Elapsed.TotalMilliseconds -le 2000
  if(!$execution.ReadinessObserved){$execution.PrimaryTerminal=[pscustomobject]@{Code='readiness-deadline';ExceptionType=$null}}
  else{
   $operation='sender-start';Add-ExpiryParentStage $senderJournal 1
   $sender=Start-Process $exe -ArgumentList @('send',$pipe,$mode,('"'+$tx+'"'),('"'+$senderJournal.Path+'"'),$senderJournal.Nonce,$senderJournal.OwnerPid,$senderJournal.OwnerTicks,$faultCode) -PassThru -WindowStyle Hidden
   $senderBudget=[Diagnostics.Stopwatch]::StartNew()
   Add-ExpiryParentStage $senderJournal 2;Add-ExpiryParentStage $senderJournal 3
   $operation='sender-wait';$remaining=Get-ExpiryRemainingWaitMs $senderBudget.Elapsed.TotalMilliseconds 5000
   $execution.SenderWaitBudgetMs=$remaining
   $waitCompleted=$remaining -gt 0 -and $sender.WaitForExit($remaining)
   $execution.SenderBudgetElapsedMs=$senderBudget.Elapsed.TotalMilliseconds
   $execution.SenderWaitCompleted=$waitCompleted -and $execution.SenderBudgetElapsedMs -le 5000
   Add-ExpiryParentStage $senderJournal $(if($execution.SenderWaitCompleted){4}else{5})
   if($execution.SenderWaitCompleted){
    $receiverBudget=[Diagnostics.Stopwatch]::StartNew();$operation='receiver-wait';Add-ExpiryParentStage $receiverJournal 3
    $remaining=Get-ExpiryRemainingWaitMs $receiverBudget.Elapsed.TotalMilliseconds 6000;$execution.ReceiverWaitBudgetMs=$remaining
    $waitCompleted=$remaining -gt 0 -and $receiver.WaitForExit($remaining);$execution.ReceiverBudgetElapsedMs=$receiverBudget.Elapsed.TotalMilliseconds
    $execution.ReceiverWaitCompleted=$waitCompleted -and $execution.ReceiverBudgetElapsedMs -le 6000
    Add-ExpiryParentStage $receiverJournal $(if($execution.ReceiverWaitCompleted){4}else{5})
   }
   if(!$execution.SenderWaitCompleted -or !$execution.ReceiverWaitCompleted){$execution.PrimaryTerminal=[pscustomobject]@{Code='child-lifetime';ExceptionType=$null}}
   else{$operation='child-status';if($sender.ExitCode -ne 0 -or $receiver.ExitCode -ne 0){$execution.PrimaryTerminal=[pscustomobject]@{Code='child-failed';ExceptionType=$null}}}
  }
 }catch{$execution.PrimaryTerminal=[pscustomobject]@{Code=($operation+'-failed');ExceptionType=Get-ExpiryExceptionType $_.Exception;HResult=$_.Exception.HResult}}
 finally{
  foreach($child in @([pscustomobject]@{Role='sender';Process=$sender;Journal=$senderJournal},[pscustomobject]@{Role='receiver';Process=$receiver;Journal=$receiverJournal})){
   if($null -eq $child.Process){continue}
   try{if(!$child.Process.HasExited){if($child.Role -eq 'sender'){$senderKilled=$true}else{$receiverKilled=$true};try{Add-ExpiryParentStage $child.Journal 6}catch{};$child.Process.Kill();if(!$child.Process.WaitForExit(2000)){$execution.CleanupErrors.Add([pscustomobject]@{Role=$child.Role;Code='kill-exit-unverified';ExceptionType=$null})}else{Add-ExpiryParentStage $child.Journal 7}};if($child.Process.HasExited){Add-ExpiryParentStage $child.Journal 8}}
   catch{$execution.CleanupErrors.Add([pscustomobject]@{Role=$child.Role;Code='kill-failed';ExceptionType=Get-ExpiryExceptionType $_.Exception;HResult=$_.Exception.HResult})}
  }
  $execution.Sender=Get-ExpiryProcessState $sender $senderKilled;$execution.Receiver=Get-ExpiryProcessState $receiver $receiverKilled
 }
 $r=Read-ExpiryRecord $rx;$t=Read-ExpiryRecord $tx
 $record=New-ExpiryDiagnostic $caseName ([bool]$Baseline) $r $t $execution
 $journals=[ordered]@{}
 foreach($child in @([pscustomobject]@{Role='Sender';Process=$sender;Journal=$senderJournal},[pscustomobject]@{Role='Receiver';Process=$receiver;Journal=$receiverJournal})){
  try{$journals[$child.Role]=Read-ExpiryStageJournal $child.Journal $child.Process}
  catch{$journals[$child.Role]=[pscustomobject]@{State='read-failed';Events=@()}}
  finally{try{Close-ExpiryStageJournal $child.Journal}catch{$record.Passed=$false;$record.FailedPredicates=@($record.FailedPredicates)+@('diagnostic.journal-close-succeeded')}}
 }
 $record|Add-Member -NotePropertyName StageJournals -NotePropertyValue ([pscustomobject]$journals)
 $record|Add-Member -NotePropertyName DiagnosticFault -NotePropertyValue $DiagnosticFault
 if(@($journals.Values|Where-Object{$_.State -ne 'qualified'}).Count -gt 0){$record.Passed=$false;$record.FailedPredicates=@($record.FailedPredicates)+@('diagnostic.journal-qualified')}
 Publish-ExpiryDiagnostic $record $diagnosticDirectory $hostedEvidence
}
if($SkipConsoleFixture){return}
# Console capture is tested with a synthetic Console.WriteLine child only; no host/backend entry point.
$readyWatch=[Diagnostics.Stopwatch]::StartNew()
$p=[Diagnostics.Process]::new();$p.StartInfo=[Diagnostics.ProcessStartInfo]::new($exe,'console');$p.StartInfo.UseShellExecute=$false;$p.StartInfo.CreateNoWindow=$true;$p.StartInfo.RedirectStandardOutput=$true
try{[void]$p.Start();$lineTask=$p.StandardOutput.ReadLineAsync();if(!$lineTask.Wait(750)){throw 'Direct capture readiness deadline'};$directMs=$readyWatch.Elapsed.TotalMilliseconds;$beforeExit=!$p.HasExited;if(!$beforeExit -or $lineTask.Result -ne 'READY synthetic-console; no endpoint'){throw 'Live console readiness not observable'};if(!$p.WaitForExit(3000)){throw 'Console fixture lifetime'}}finally{if(!$p.HasExited){$p.Kill()};$p.Dispose()}
$wrapper=Join-Path $out 'console-wrapper.ps1';$capture=Join-Path $out 'console-capture.txt';$emitted=Join-Path $out 'console-emitted.txt'
("& '"+$exe.Replace("'","''")+"' console '"+$emitted.Replace("'","''")+"' 1> '"+$capture.Replace("'","''")+"'")|Set-Content $wrapper
$pwsh=(Get-Process -Id $PID).Path
$wrapperProcess=Start-Process $pwsh -ArgumentList @('-NoProfile','-File',('"'+$wrapper+'"')) -WindowStyle Hidden -PassThru
try{$emissionWait=[Diagnostics.Stopwatch]::StartNew();while(!(Test-Path $emitted) -and $emissionWait.ElapsedMilliseconds -lt 2500){Start-Sleep -Milliseconds 10};if(!(Test-Path $emitted)){throw 'Console child emission deadline'};Start-Sleep -Milliseconds 100;$bytes=if(Test-Path $capture){(Get-Item $capture).Length}else{0};$wrapperAlive=!$wrapperProcess.HasExited;if(!$wrapperProcess.WaitForExit(5000)){throw 'Wrapper lifetime'};if((Get-Content $capture -Raw).Trim() -ne 'READY synthetic-console; no endpoint'){throw 'Console retention'}}finally{if(!$wrapperProcess.HasExited){$wrapperProcess.Kill()}}
[ordered]@{directReadinessMs=$directMs;directObservedBeforeExit=$beforeExit;fileBytesAfterConfirmedEmission=$bytes;childEmissionConfirmed=(Test-Path $emitted);wrapperAliveAtObservation=$wrapperAlive;endpointConstructed=$false;limitation='Console plumbing fixture; not proof that a production listener pipe is ready'}|ConvertTo-Json|Set-Content (Join-Path $out 'console-readiness.json')
Get-Content (Join-Path $out 'console-readiness.json')
