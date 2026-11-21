param(
 [string]$Output=('.local/expiry-'+[guid]::NewGuid().ToString('N')),
 [switch]$Baseline,
 [ValidateSet('none-1','none-2','none-3','domain-1','domain-2','domain-3','before','after','late')]
 [string[]]$Case=@('none-1','none-2','none-3','domain-1','domain-2','domain-3','before','after','late'),
 [switch]$SkipConsoleFixture
)
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot;Set-Location $repo
. (Join-Path $PSScriptRoot 'UnsentExpiry.Diagnostics.ps1')
if($Case.Count -eq 0 -or $Case.Count -gt 9 -or @($Case|Select-Object -Unique).Count -ne $Case.Count){throw 'Select each expiry case at most once'}
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
$sources=@(Get-ChildItem src/acoustics/host/Transport -Filter '*.cs'|ForEach-Object FullName)+(Join-Path $repo 'tests/host/ExpiryExperiment.cs')
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
 $sources=@($sources|Where-Object { [IO.Path]::GetFileName($_) -ne 'StatePipe.cs' })+@($baselineFile)
 $define='/define:TRANSPORT_EXPIRY_TEST,EXPIRY_BASELINE'
}
& $compiler /nologo /optimize+ /warnaserror+ /platform:x64 $define /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll ('/out:'+$exe) @sources
if($LASTEXITCODE){throw 'Build failed'}
foreach($caseName in $Case){
 $mode=$caseName.Split('-')[0];$pipe='RichAudio.Expiry.'+[guid]::NewGuid().ToString('N');$rx=Join-Path $out ($caseName+'-receiver.json');$tx=Join-Path $out ($caseName+'-sender.json')
 $receiver=$null;$sender=$null;$senderKilled=$false;$receiverKilled=$false
 $execution=[pscustomobject]@{ReadinessObserved=$false;SenderWaitCompleted=$null;ReceiverWaitCompleted=$null;PrimaryTerminal=$null;CleanupErrors=[Collections.Generic.List[object]]::new();Sender=$null;Receiver=$null}
 $operation='receiver-start'
 try{
  $receiver=Start-Process $exe -ArgumentList @('receive',$pipe,$mode,('"'+$rx+'"')) -PassThru -WindowStyle Hidden
  $operation='readiness';$w=[Diagnostics.Stopwatch]::StartNew();while(!(Test-Path ($rx+'.ready')) -and $w.ElapsedMilliseconds -lt 2000){Start-Sleep -Milliseconds 10}
  $execution.ReadinessObserved=Test-Path ($rx+'.ready')
  if(!$execution.ReadinessObserved){$execution.PrimaryTerminal=[pscustomobject]@{Code='readiness-deadline';ExceptionType=$null}}
  else{
   $operation='sender-start';$sender=Start-Process $exe -ArgumentList @('send',$pipe,$mode,('"'+$tx+'"')) -PassThru -WindowStyle Hidden
   $operation='sender-wait';$execution.SenderWaitCompleted=$sender.WaitForExit(5000)
   if($execution.SenderWaitCompleted){$operation='receiver-wait';$execution.ReceiverWaitCompleted=$receiver.WaitForExit(6000)}
   if(!$execution.SenderWaitCompleted -or !$execution.ReceiverWaitCompleted){$execution.PrimaryTerminal=[pscustomobject]@{Code='child-lifetime';ExceptionType=$null}}
   else{$operation='child-status';if($sender.ExitCode -ne 0 -or $receiver.ExitCode -ne 0){$execution.PrimaryTerminal=[pscustomobject]@{Code='child-failed';ExceptionType=$null}}}
  }
 }catch{$execution.PrimaryTerminal=[pscustomobject]@{Code=($operation+'-failed');ExceptionType=Get-ExpiryExceptionType $_.Exception}}
 finally{
  foreach($child in @([pscustomobject]@{Role='sender';Process=$sender},[pscustomobject]@{Role='receiver';Process=$receiver})){
   if($null -eq $child.Process){continue}
   try{if(!$child.Process.HasExited){if($child.Role -eq 'sender'){$senderKilled=$true}else{$receiverKilled=$true};$child.Process.Kill()}}
   catch{$execution.CleanupErrors.Add([pscustomobject]@{Role=$child.Role;Code='kill-failed';ExceptionType=Get-ExpiryExceptionType $_.Exception})}
  }
  $execution.Sender=Get-ExpiryProcessState $sender $senderKilled;$execution.Receiver=Get-ExpiryProcessState $receiver $receiverKilled
 }
 $r=Read-ExpiryRecord $rx;$t=Read-ExpiryRecord $tx
 $record=New-ExpiryDiagnostic $caseName ([bool]$Baseline) $r $t $execution
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
