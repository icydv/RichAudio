# One bounded run of three diagnostic-only failures; never launches transport/audio/game.
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot;$out=Join-Path $repo ('.local/expiry-diagnostic-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($out)|Out-Null
foreach($case in @('composite-failure','missing-receiver','missing-both')){
 $dir=Join-Path $out $case;$p=[Diagnostics.Process]::new();$p.StartInfo=[Diagnostics.ProcessStartInfo]::new((Get-Process -Id $PID).Path)
 $p.StartInfo.UseShellExecute=$false;$p.StartInfo.CreateNoWindow=$true;$p.StartInfo.RedirectStandardOutput=$true;$p.StartInfo.RedirectStandardError=$true
 foreach($a in @('-NoProfile','-File',(Join-Path $PSScriptRoot 'host/ExpiryDiagnosticFailure.ps1'),'-Case',$case,'-Output',$dir)){[void]$p.StartInfo.ArgumentList.Add($a)}
 try{[void]$p.Start();$stdout=$p.StandardOutput.ReadToEndAsync();$stderr=$p.StandardError.ReadToEndAsync();if(!$p.WaitForExit(5000)){throw 'Diagnostic fixture timeout'};$text=$stdout.Result;$errorText=$stderr.Result
  [IO.File]::WriteAllText((Join-Path $out ($case+'-stdout.txt')),$text);[IO.File]::WriteAllText((Join-Path $out ($case+'-stderr.txt')),$errorText)
  if($p.ExitCode-eq0-or$errorText-notmatch'Deliberate diagnostic fixture failure'){throw 'Failure status/message not preserved'}
  $line=@($text-split"`n"|Where-Object {$_-like'EXPIRY_DIAGNOSTIC *'});if($line.Count-ne1){throw 'Expected exactly one console diagnostic before throw'}
  $record=$line[0].Substring(18)|ConvertFrom-Json
  if($record.passed-or!$record.syntheticDiagnosticFixture-or$record.failedPredicates.Count-eq0){throw 'Failed predicates missing'}
  if($text-match'DO-NOT-RETAIN|coordinates|privatePath|endpoint'){throw 'Unapproved data escaped projection'}
  if($case-eq'composite-failure'-and($record.receiver.terminal.FirstFrame.DecisionAgeMs-ne-3.25-or$record.receiver.terminal.OffendingFrame.DecisionAgeMs-ne-3.25-or$record.sender.firstExpired.AgeMs-ne351-or$record.failedPredicates-notcontains'receiver-accepted-positive')){throw 'Signed age/expiry/predicate attribution lost'}
  if($case-ne'composite-failure'-and$record.receiverData-ne'missing'){throw 'Missing receiver not explicit'}
  if($case-eq'missing-both'-and($record.senderData-ne'missing'-or$record.lifecycle.FailureStage-ne'receiver-readiness')){throw 'Early lifecycle missing'}
  $saved=Get-Content (Join-Path $dir ('diagnostics/'+$case+'.json')) -Raw|ConvertFrom-Json;if($saved.case-ne$case){throw 'Retained record missing'}
  Write-Output ('PASS intentional unsuccessful diagnostic fixture: '+$case)
 }finally{if(!$p.HasExited){$p.Kill();[void]$p.WaitForExit(1000)};$p.Dispose()}
}
