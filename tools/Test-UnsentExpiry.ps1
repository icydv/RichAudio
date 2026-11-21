param([string]$Output=('.local/expiry-'+[guid]::NewGuid().ToString('N')),[switch]$Baseline)
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot;Set-Location $repo
if($Output -notmatch '^\.local[/\\][A-Za-z0-9_-]+$'){throw 'Private output required'}
$out=[IO.Path]::GetFullPath((Join-Path $repo $Output));for($d=[IO.DirectoryInfo]::new($out);$d;$d=$d.Parent){if($d.Exists -and ($d.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked output'}}
if(Test-Path $out){throw 'Fresh output required'};[IO.Directory]::CreateDirectory($out)|Out-Null
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
foreach($case in @('none-1','none-2','none-3','domain-1','domain-2','domain-3','before','after','late')){
 $mode=$case.Split('-')[0];$pipe='RichAudio.Expiry.'+[guid]::NewGuid().ToString('N');$rx=Join-Path $out ($case+'-receiver.json');$tx=Join-Path $out ($case+'-sender.json')
 $receiver=Start-Process $exe -ArgumentList @('receive',$pipe,$mode,('"'+$rx+'"')) -PassThru -WindowStyle Hidden
 try{$w=[Diagnostics.Stopwatch]::StartNew();while(!(Test-Path ($rx+'.ready')) -and $w.ElapsedMilliseconds -lt 2000){Start-Sleep -Milliseconds 10};if(!(Test-Path ($rx+'.ready'))){throw 'Readiness deadline'}
  $sender=Start-Process $exe -ArgumentList @('send',$pipe,$mode,('"'+$tx+'"')) -PassThru -WindowStyle Hidden
  try{if(!$sender.WaitForExit(5000) -or !$receiver.WaitForExit(6000)){throw 'Child lifetime'};if($sender.ExitCode -ne 0 -or $receiver.ExitCode -ne 0){throw 'Child failed'}}finally{if(!$sender.HasExited){$sender.Kill()}}
 }finally{if(!$receiver.HasExited){$receiver.Kill()}}
 $r=Get-Content $rx -Raw|ConvertFrom-Json;$t=Get-Content $tx -Raw|ConvertFrom-Json
 if($mode -eq 'late'){if($r.diagnostic.Code -ne 'deadline' -or $r.accepted -ne 0 -or $t.attempts -ne 1 -or $t.diagnostic.Outcome -ne 'failed'){throw 'Original header deadline must remain terminal'}}
 elseif($Baseline -and $mode -in @('domain','before','after')){if($r.accepted -ne 0 -or $r.diagnostic.FirstFrame.AgeClass -ne 'too-old' -or $t.attempts -ne 1){throw 'Baseline expiry not reproduced'}}
 elseif($r.connections -ne 1 -or $t.attempts -ne 1 -or $r.accepted -le 0 -or $r.rejected -ne 0 -or $r.diagnostic.Outcome -ne 'deliberate-stop' -or $t.diagnostic.Outcome -ne 'deliberate-stop'){throw "Case failed; no retry: $case"}
 if(!$Baseline -and $mode -in @('before','after','late') -and ($t.expiredAfter -ne 1 -or $t.firstExpired.AgeMs -le 250)){throw 'Controlled expiry was not attributed'}
 [pscustomobject]@{Case=$case;Accepted=$r.accepted;Rejected=$r.rejected;Age=$r.diagnostic.FirstFrame.DecisionAgeMs;Outcome=$r.diagnostic.Outcome;Encode=$t.diagnostic.FirstFrame.EncodeMs;PreWriteAge=$t.diagnostic.FirstFrame.AgeBeforeWriteMs;Write=$t.diagnostic.FirstFrame.WriteMs;ExpiredAfter=$t.expiredAfter;FirstExpired=$t.firstExpired}|ConvertTo-Json -Compress
}
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
