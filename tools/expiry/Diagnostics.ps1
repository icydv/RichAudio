# Test-only diagnostic projection. Never emit raw JSON, exception messages or paths.
function Read-ExpiryRecord([string]$Path) {
 if(!(Test-Path -LiteralPath $Path)){return @{State='missing';Value=$null}}
 try {if((Get-Item -LiteralPath $Path).Length-gt65536){return @{State='oversize';Value=$null}};return @{State='available';Value=(Get-Content -LiteralPath $Path -Raw|ConvertFrom-Json)}}catch{return @{State='invalid-json';Value=$null}}
}
function Select-ExpiryFields($Value,[string[]]$Numbers,[string[]]$Words=@(),[string[]]$Flags=@()) {
 if($null-eq$Value){return $null};$r=[ordered]@{}
 foreach($key in $Numbers){$v=$Value.$key;$r[$key]=if($null-ne$v-and($v-is[byte]-or$v-is[sbyte]-or$v-is[int16]-or$v-is[uint16]-or$v-is[int32]-or$v-is[uint32]-or$v-is[int64]-or$v-is[uint64]-or$v-is[single]-or$v-is[double]-or$v-is[decimal])-and!([double]::IsNaN([double]$v))-and!([double]::IsInfinity([double]$v))){$v}else{$null}}
 foreach($key in $Words){$v=$Value.$key;$r[$key]=if($v-is[string]-and$v-match'^[A-Za-z0-9_.-]{1,64}$'){$v}else{$null}}
 foreach($key in $Flags){$v=$Value.$key;$r[$key]=if($v-is[bool]){$v}else{$null}}
 return $r
}
function Select-ExpiryTerminal($d) {
 if($null-eq$d){return $null}
 $r=Select-ExpiryFields $d @('Connection','ElapsedMs','ExpiredBeforeEncoding','ExpiredAfterEncoding') @('Stage','Code','Outcome','ExceptionType') @('HadAcceptedFrame','Terminal','AnotherAttempt')
 $r['FirstFrame']=Select-ExpiryFields $d.FirstFrame @('FrameSequence','CopyMs','AgeBeforeEncodeMs','EncodeMs','AgeBeforeWriteMs','WriteMs','AckMs','ConnectionMs','HeaderMs','PayloadMs','DecodeMs','DecisionAgeMs','CallbackMs','MinimumAgeMs','MaximumAgeMs') @('AgeClass') @('ClockFrequencyAgrees')
 $r['OffendingFrame']=Select-ExpiryFields $d.OffendingFrame @('FrameOrdinal','DecisionAgeMs') @('AgeClass')
 $r['FirstExpiredUnsent']=Select-ExpiryFields $d.FirstExpiredUnsent @('Sequence','AgeMs','EncodeMs','BeforeEncodeAgeMs') @('Stage')
 return $r
}
function Get-ExpiryPredicates($Receiver,$Sender,[string]$Mode,[bool]$Baseline) {
 $r=$Receiver;$t=$Sender;$checks=[ordered]@{}
 if($Mode-eq'late'){$checks['receiver-header-deadline']=$r.diagnostic.Code-eq'deadline';$checks['receiver-accepted-zero']=$null-ne$r.accepted-and$r.accepted-eq0;$checks['sender-one-attempt']=$t.attempts-eq1;$checks['sender-failed']=$t.diagnostic.Outcome-eq'failed'}
 elseif($Baseline-and$Mode-in@('domain','before','after')){$checks['baseline-accepted-zero']=$null-ne$r.accepted-and$r.accepted-eq0;$checks['baseline-first-frame-too-old']=$r.diagnostic.FirstFrame.AgeClass-eq'too-old';$checks['sender-one-attempt']=$t.attempts-eq1}
 else{$checks['receiver-one-connection']=$r.connections-eq1;$checks['sender-one-attempt']=$t.attempts-eq1;$checks['receiver-accepted-positive']=$r.accepted-gt0;$checks['receiver-rejected-zero']=$null-ne$r.rejected-and$r.rejected-eq0;$checks['receiver-deliberate-stop']=$r.diagnostic.Outcome-eq'deliberate-stop';$checks['sender-deliberate-stop']=$t.diagnostic.Outcome-eq'deliberate-stop'}
 if(!$Baseline-and$Mode-in@('before','after','late')){$checks['one-expired-after']=$t.expiredAfter-eq1;$checks['expired-age-over-250']=$t.firstExpired.AgeMs-gt250}
 return $checks
}
function Write-ExpiryDiagnostic([string]$Case,[string]$Mode,[bool]$Baseline,[string]$ReceiverPath,[string]$SenderPath,[string]$Directory,$Lifecycle,[bool]$Synthetic=$false) {
 if($Case-notmatch'^[a-z0-9-]{1,32}$'){throw 'Invalid diagnostic case'}
 $rx=Read-ExpiryRecord $ReceiverPath;$tx=Read-ExpiryRecord $SenderPath;$r=$rx.Value;$t=$tx.Value
 $checks=Get-ExpiryPredicates $r $t $Mode $Baseline
 $failed=@($checks.Keys|Where-Object {!$checks[$_]})
 if($rx.State-ne'available'){$failed+=('receiver-data-'+$rx.State)};if($tx.State-ne'available'){$failed+=('sender-data-'+$tx.State)}
 if($Lifecycle.FailureStage){$failed+=('lifecycle-'+$Lifecycle.FailureStage)}
 $receiver=Select-ExpiryFields $r @('accepted','rejected','connections');if($receiver){$receiver['terminal']=Select-ExpiryTerminal $r.diagnostic}
 $sender=Select-ExpiryFields $t @('sent','attempts','replaced','beforeDelayMs','afterDelayMs','expiredBefore','expiredAfter','firstPublished','firstTransmitted');if($sender){$sender['terminal']=Select-ExpiryTerminal $t.diagnostic;$sender['firstExpired']=Select-ExpiryFields $t.firstExpired @('Sequence','AgeMs','EncodeMs','BeforeEncodeAgeMs') @('Stage')}
 $record=[ordered]@{schema=1;case=$Case;mode=$Mode;baseline=$Baseline;syntheticDiagnosticFixture=$Synthetic;passed=($failed.Count-eq0);failedPredicates=$failed;predicates=$checks;receiverData=$rx.State;senderData=$tx.State;receiver=$receiver;sender=$sender;lifecycle=(Select-ExpiryFields $Lifecycle @('ElapsedMs','ReceiverExitCode','SenderExitCode') @('FailureStage') @('ReceiverStarted','SenderStarted','ReceiverExited','SenderExited','ReceiverKillRequested','SenderKillRequested'))}
 $json=$record|ConvertTo-Json -Depth 12 -Compress;if($json.Length-gt16384){throw 'Diagnostic projection exceeded bound'}
 Write-Host ('EXPIRY_DIAGNOSTIC '+$json)
 [IO.Directory]::CreateDirectory($Directory)|Out-Null;[IO.File]::WriteAllText((Join-Path $Directory ($Case+'.json')),$json+"`n")

 return $record
}
