# The expiry fixture writes private raw records. Only this explicit, bounded projection
# may be printed or uploaded; never serialize a child record or an exception directly.
$script:ExpiryCaseNames=@('none-1','none-2','none-3','domain-1','domain-2','domain-3','before','after','late')
$script:ExpiryRecordByteLimit=65536
$script:ExpiryDiagnosticByteLimit=16384

function Get-ExpiryProperty($Value,[string]$Name) {
 if($null -eq $Value){return $null}
 $property=$Value.PSObject.Properties[$Name]
 if($null -ne $property){return $property.Value}
 return $null
}
function ConvertTo-ExpiryNumber($Value) {
 if($null -eq $Value -or $Value -is [bool]){return $null}
 if($Value.GetType().Name -notin @('Byte','SByte','Int16','UInt16','Int32','UInt32','Int64','UInt64','Single','Double','Decimal')){return $null}
 $number=[double]$Value
 if([double]::IsNaN($number) -or [double]::IsInfinity($number) -or [Math]::Abs($number) -gt 1000000000000){return $null}
 return $Value
}
function ConvertTo-ExpiryBoolean($Value) {if($Value -is [bool]){return $Value};return $null}
function ConvertTo-ExpiryEnum($Value,[string[]]$Allowed) {
 if($null -eq $Value){return $null}
 if($Value -is [string] -and $Value -cin $Allowed){return $Value}
 return 'unrecognized'
}
function Get-ExpiryExceptionType($Exception) {
 $allowed=@('ArgumentException','ArgumentOutOfRangeException','InvalidDataException','InvalidOperationException','IOException','UnauthorizedAccessException','TimeoutException','Win32Exception','ObjectDisposedException','DecoderFallbackException','SerializationException','XmlException','RuntimeException','MethodInvocationException')
 if($null -ne $Exception -and $Exception.GetType().Name -cin $allowed){return $Exception.GetType().Name}
 return 'Exception'
}
function Read-ExpiryRecord([string]$Path) {
 $stream=$null
 try {
  if(!(Test-Path -LiteralPath $Path -PathType Leaf)){return [pscustomobject]@{State='missing';Value=$null}}
  $stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  if($stream.Length -gt $script:ExpiryRecordByteLimit){return [pscustomobject]@{State='oversized';Value=$null}}
  $bytes=[byte[]]::new([int]$stream.Length);$offset=0
  while($offset -lt $bytes.Length){$read=$stream.Read($bytes,$offset,$bytes.Length-$offset);if($read -eq 0){break};$offset+=$read}
  if($offset -ne $bytes.Length){return [pscustomobject]@{State='read-failed';Value=$null}}
  try {$json=[Text.UTF8Encoding]::new($false,$true).GetString($bytes);$value=$json|ConvertFrom-Json -ErrorAction Stop}
  catch {return [pscustomobject]@{State='malformed';Value=$null}}
  if(!$json.TrimStart().StartsWith('{') -or $null -eq $value -or $value.GetType().FullName -cne 'System.Management.Automation.PSCustomObject'){return [pscustomobject]@{State='invalid-shape';Value=$null}}
  return [pscustomobject]@{State='parsed';Value=$value}
 } catch {return [pscustomobject]@{State='read-failed';Value=$null}}
 finally {if($null -ne $stream){try{$stream.Dispose()}catch{}}}
}
function ConvertTo-ExpiryTiming($Timing) {
 if($null -eq $Timing){return $null}
 $safe=[ordered]@{}
 foreach($name in @('FrameSequence','CopyMs','MailboxAgeMs','AgeBeforeEncodeMs','EncodeMs','AgeBeforeWriteMs','WriteMs','AckMs','ConnectionMs','HeaderMs','PayloadMs','PayloadReceivedAgeMs','DecodeMs','DecisionAgeMs','CallbackMs','MinimumAgeMs','MaximumAgeMs')){$safe[$name]=ConvertTo-ExpiryNumber (Get-ExpiryProperty $Timing $name)}
 $safe.AgeClass=ConvertTo-ExpiryEnum (Get-ExpiryProperty $Timing 'AgeClass') @('future-dated','too-old','within-bounds')
 $safe.ClockFrequencyAgrees=ConvertTo-ExpiryBoolean (Get-ExpiryProperty $Timing 'ClockFrequencyAgrees')
 return [pscustomobject]$safe
}
function ConvertTo-ExpiryUnsent($Value) {
 if($null -eq $Value){return $null}
 $safe=[ordered]@{}
 foreach($name in @('Sequence','AgeMs','EncodeMs','BeforeEncodeAgeMs')){$safe[$name]=ConvertTo-ExpiryNumber (Get-ExpiryProperty $Value $name)}
 $safe.Stage=ConvertTo-ExpiryEnum (Get-ExpiryProperty $Value 'Stage') @('before-encoding','after-encoding-before-write')
 return [pscustomobject]$safe
}
function ConvertTo-ExpiryFailure($Value) {
 if($null -eq $Value){return $null}
 return [pscustomobject][ordered]@{
  Stage=ConvertTo-ExpiryEnum (Get-ExpiryProperty $Value 'stage') @('publisher-construct','publisher-start','sender-publish','sender-stop','sender-stop-wait','receiver-construct','receiver-start','receiver-ready-marker','receiver-wait','appdomain-create','appdomain-activate','appdomain-run','publisher-dispose','receiver-dispose','appdomain-unload')
  Code=ConvertTo-ExpiryEnum (Get-ExpiryProperty $Value 'code') @('sender-lifetime','receiver-lifetime','fixture-operation-failed','fixture-cleanup-failed')
  ExceptionType=ConvertTo-ExpiryEnum (Get-ExpiryProperty $Value 'exceptionType') @('Exception','InvalidDataException','TimeoutException','IOException','DecoderFallbackException','SerializationException','XmlException','CannotUnloadAppDomainException','AppDomainUnloadedException','TypeLoadException','FileNotFoundException')
 }
}
function ConvertTo-ExpiryTransport($Value,[string]$Role,$WireCount,$AcceptedCount) {
 if($null -eq $Value){return $null}
 $safe=[ordered]@{}
 foreach($name in @('ExpiredBeforeEncoding','ExpiredAfterEncoding','StartupDiscarded','Transmitted','Received','StartupDiscardLimit','StartupBudgetMs','Connection','ElapsedMs')){$safe[$name]=ConvertTo-ExpiryNumber (Get-ExpiryProperty $Value $name)}
 $safe.Stage=ConvertTo-ExpiryEnum (Get-ExpiryProperty $Value 'Stage') @('connection','header','length','payload','decoding','schema','sequence','freshness','callback','startup','ack')
 $safe.Code=ConvertTo-ExpiryEnum (Get-ExpiryProperty $Value 'Code') @('sender-stop','clean-eof','receiver-stop','deadline','operation-failed','truncated-header','invalid-length','payload-failed','invalid-encoding-or-json','invalid-schema','invalid-sequence','invalid-age','consumer-failed','connection-failed')
 $safe.ExceptionType=ConvertTo-ExpiryEnum (Get-ExpiryProperty $Value 'ExceptionType') @('Exception','InvalidDataException','TimeoutException','IOException','DecoderFallbackException','SerializationException','XmlException')
 $safe.Outcome=ConvertTo-ExpiryEnum (Get-ExpiryProperty $Value 'Outcome') @('deliberate-stop','unexpected-eof','failed','local-stop')
 foreach($name in @('HadAcceptedFrame','Terminal','AnotherAttempt')){$safe[$name]=ConvertTo-ExpiryBoolean (Get-ExpiryProperty $Value $name)}
 $safe.FirstWireObserved=if($null -eq $WireCount){$null}else{$WireCount -gt 0}
 $safe.FirstWireStage=if($null -eq $WireCount){'unknown'}elseif($WireCount -eq 0){'not-observed'}elseif($Role -eq 'sender'){'transmitted'}else{'received'}
 $safe.FirstAcceptedObserved=if($null -eq $AcceptedCount){$null}else{$AcceptedCount -gt 0}
 $safe.FirstAcceptedStage=if($null -eq $AcceptedCount){'unknown'}elseif($AcceptedCount -eq 0){'not-observed'}else{'accepted'}
 $safe.FirstWireFrame=if($safe.FirstWireObserved -eq $true){ConvertTo-ExpiryTiming (Get-ExpiryProperty $Value 'FirstFrame')}else{$null}
 $safe.FirstCandidateFrame=if($safe.FirstWireObserved -ne $true){ConvertTo-ExpiryTiming (Get-ExpiryProperty $Value 'FirstFrame')}else{$null}
 $safe.FirstAcceptedFrame=if($safe.FirstAcceptedObserved -eq $true){ConvertTo-ExpiryTiming (Get-ExpiryProperty $Value 'FirstAcceptedFrame')}else{$null}
 $safe.FirstExpiredUnsent=ConvertTo-ExpiryUnsent (Get-ExpiryProperty $Value 'FirstExpiredUnsent')
 $offending=Get-ExpiryProperty $Value 'OffendingFrame'
 $safe.OffendingFrame=if($null -eq $offending){$null}else{[pscustomobject][ordered]@{FrameOrdinal=ConvertTo-ExpiryNumber (Get-ExpiryProperty $offending 'FrameOrdinal');DecisionAgeMs=ConvertTo-ExpiryNumber (Get-ExpiryProperty $offending 'DecisionAgeMs');AgeClass=ConvertTo-ExpiryEnum (Get-ExpiryProperty $offending 'AgeClass') @('future-dated','too-old','within-bounds')}}
 return [pscustomobject]$safe
}
function ConvertTo-ExpiryChild($ReadResult,$ProcessState,[string]$Role) {
 $value=$ReadResult.Value;$safe=[ordered]@{RecordState=$ReadResult.State;Process=$ProcessState}
 foreach($name in @('sent','attempts','replaced','accepted','rejected','connections','transmitted','startupDiscarded','beforeDelayMs','afterDelayMs','expiredBefore','expiredAfter','firstPublished','firstTransmitted','schemaVersion')){$safe[$name]=ConvertTo-ExpiryNumber (Get-ExpiryProperty $value $name)}
 foreach($name in @('childAppDomain','isDefaultAppDomain','finished')){$safe[$name]=ConvertTo-ExpiryBoolean (Get-ExpiryProperty $value $name)}
 $safe.role=ConvertTo-ExpiryEnum (Get-ExpiryProperty $value 'role') @('sender','receiver')
 $safe.mode=ConvertTo-ExpiryEnum (Get-ExpiryProperty $value 'mode') @('none','domain','before','after','late')
 $safe.readyMarkerKind=ConvertTo-ExpiryEnum (Get-ExpiryProperty $value 'readyMarkerKind') @('worker-start-requested')
 $lifecycle=Get-ExpiryProperty $value 'lifecycle';$safeLifecycle=[ordered]@{}
 foreach($name in @('publisherConstructMs','publisherStartMs','firstSyntheticMs','firstPublishMs','firstPublicationAtMs','publicationCount','productionLoopMs','stopRequestMs','stopWaitMs','disposeMs','runMs','serverConstructMs','serverStartMs','readyMarkerAtMs','waitMs','appDomainCreateMs','appDomainActivateMs','appDomainUnloadMs','mainMs')){$safeLifecycle[$name]=ConvertTo-ExpiryNumber (Get-ExpiryProperty $lifecycle $name)}
 $safe.Lifecycle=[pscustomobject]$safeLifecycle
 $safe.FirstExpiredUnsent=ConvertTo-ExpiryUnsent (Get-ExpiryProperty $value 'firstExpired')
 $transport=Get-ExpiryProperty $value 'diagnostic'
 $wireCount=if($Role -eq 'sender'){$safe.transmitted}else{ConvertTo-ExpiryNumber (Get-ExpiryProperty $transport 'Received')}
 if($null -eq $wireCount -and $Role -eq 'sender'){$wireCount=ConvertTo-ExpiryNumber (Get-ExpiryProperty $transport 'Transmitted')}
 $acceptedCount=if($Role -eq 'sender'){$safe.sent}else{$safe.accepted}
 $safe.Transport=ConvertTo-ExpiryTransport $transport $Role $wireCount $acceptedCount
 $safe.HarnessFailure=ConvertTo-ExpiryFailure (Get-ExpiryProperty $value 'harnessFailure')
 $cleanup=[Collections.Generic.List[object]]::new();$cleanupSource=Get-ExpiryProperty $value 'cleanupFailures'
 $allCleanup=@(if($null -ne $cleanupSource){$cleanupSource})
 foreach($failure in $allCleanup|Select-Object -First 4){if($null -ne $failure){$cleanup.Add((ConvertTo-ExpiryFailure $failure))}}
 $safe.CleanupFailures=$cleanup.ToArray()
 $safe.CleanupFailureCount=$allCleanup.Count
 $safe.CleanupFailuresOmitted=[Math]::Max(0,$allCleanup.Count-4)
 return [pscustomobject]$safe
}
function Get-ExpiryProcessState($Process,[bool]$KillRequested=$false) {
 $state=[ordered]@{Started=($null -ne $Process);Exited=$null;ExitCode=$null;KillRequested=$KillRequested;InspectionFailed=$false}
 if($null -ne $Process){try{$state.Exited=$Process.HasExited;if($state.Exited){$state.ExitCode=ConvertTo-ExpiryNumber $Process.ExitCode}}catch{$state.InspectionFailed=$true}}
 return [pscustomobject]$state
}
function ConvertTo-ExpiryProcess($Value) {
 $safe=[ordered]@{}
 foreach($name in @('Started','Exited','KillRequested','InspectionFailed')){$safe[$name]=ConvertTo-ExpiryBoolean (Get-ExpiryProperty $Value $name)}
 $safe.ExitCode=ConvertTo-ExpiryNumber (Get-ExpiryProperty $Value 'ExitCode')
 return [pscustomobject]$safe
}
function ConvertTo-ExpiryExecution($Value) {
 $safe=[ordered]@{ReadinessObserved=ConvertTo-ExpiryBoolean (Get-ExpiryProperty $Value 'ReadinessObserved');SenderWaitCompleted=ConvertTo-ExpiryBoolean (Get-ExpiryProperty $Value 'SenderWaitCompleted');ReceiverWaitCompleted=ConvertTo-ExpiryBoolean (Get-ExpiryProperty $Value 'ReceiverWaitCompleted')}
 $primary=Get-ExpiryProperty $Value 'PrimaryTerminal'
 $codes=@('receiver-start-failed','readiness-failed','readiness-deadline','sender-start-failed','sender-wait-failed','receiver-wait-failed','child-status-failed','child-failed','child-lifetime')
 $safe.PrimaryTerminal=if($null -eq $primary){$null}else{[pscustomobject]@{Code=ConvertTo-ExpiryEnum (Get-ExpiryProperty $primary 'Code') $codes;ExceptionType=ConvertTo-ExpiryEnum (Get-ExpiryProperty $primary 'ExceptionType') @('Exception','ArgumentException','ArgumentOutOfRangeException','InvalidDataException','InvalidOperationException','IOException','UnauthorizedAccessException','TimeoutException','Win32Exception','ObjectDisposedException','RuntimeException','MethodInvocationException')}}
 $cleanup=[Collections.Generic.List[object]]::new();$cleanupSource=Get-ExpiryProperty $Value 'CleanupErrors'
 $allCleanup=@(if($null -ne $cleanupSource){$cleanupSource})
 foreach($failure in $allCleanup|Select-Object -First 4){if($null -eq $failure){continue};$cleanup.Add([pscustomobject]@{Role=ConvertTo-ExpiryEnum (Get-ExpiryProperty $failure 'Role') @('sender','receiver');Code=ConvertTo-ExpiryEnum (Get-ExpiryProperty $failure 'Code') @('kill-failed','dispose-failed','inspection-failed');ExceptionType=ConvertTo-ExpiryEnum (Get-ExpiryProperty $failure 'ExceptionType') @('Exception','ArgumentException','InvalidOperationException','IOException','UnauthorizedAccessException','Win32Exception','ObjectDisposedException','RuntimeException','MethodInvocationException')})}
 $safe.CleanupErrors=$cleanup.ToArray()
 $safe.CleanupErrorCount=$allCleanup.Count
 $safe.CleanupErrorsOmitted=[Math]::Max(0,$allCleanup.Count-4)
 $safe.Sender=ConvertTo-ExpiryProcess (Get-ExpiryProperty $Value 'Sender')
 $safe.Receiver=ConvertTo-ExpiryProcess (Get-ExpiryProperty $Value 'Receiver')
 return [pscustomobject]$safe
}
function New-ExpiryDiagnostic([string]$Case,[bool]$Baseline,$ReceiverRecord,$SenderRecord,$Execution) {
 if($Case -cnotin $script:ExpiryCaseNames){throw 'Unrecognized expiry case'}
 $safeExecution=ConvertTo-ExpiryExecution $Execution
 $r=ConvertTo-ExpiryChild $ReceiverRecord $safeExecution.Receiver 'receiver';$t=ConvertTo-ExpiryChild $SenderRecord $safeExecution.Sender 'sender'
 $failures=[Collections.Generic.List[string]]::new()
 if($ReceiverRecord.State -ne 'parsed'){$failures.Add('receiver.record.parsed')}
 if($SenderRecord.State -ne 'parsed'){$failures.Add('sender.record.parsed')}
 if($null -ne $safeExecution.PrimaryTerminal){$failures.Add('children.completed-with-zero-exit')}
 if($safeExecution.CleanupErrorCount -gt 0){$failures.Add('children.cleanup-succeeded')}
 if($safeExecution.ReadinessObserved -ne $true){$failures.Add('receiver.ready-marker.observed')}
 foreach($role in @('Sender','Receiver')){
  $process=Get-ExpiryProperty $safeExecution $role;$label=$role.ToLowerInvariant()
  if($process.Started -ne $true){$failures.Add($label+'.process.started')}
  if($process.Exited -ne $true){$failures.Add($label+'.process.exited')}
  if($process.ExitCode -ne 0){$failures.Add($label+'.process.exit-code.equals-zero')}
  if($process.InspectionFailed -ne $false){$failures.Add($label+'.process.inspection-succeeded')}
 }
 foreach($child in @([pscustomobject]@{Role='sender';Value=$t},[pscustomobject]@{Role='receiver';Value=$r})){
  if($null -ne $child.Value.HarnessFailure){$failures.Add($child.Role+'.harness-failure.is-null')}
  if($child.Value.CleanupFailureCount -gt 0){$failures.Add($child.Role+'.cleanup-succeeded')}
 }
 $mode=$Case.Split('-')[0]
 if($ReceiverRecord.State -eq 'parsed' -and $SenderRecord.State -eq 'parsed'){
  if($mode -eq 'late'){
   if((Get-ExpiryProperty $r.Transport 'Code') -ne 'deadline'){$failures.Add('receiver.code.equals-deadline')}
   if($r.accepted -ne 0){$failures.Add('receiver.accepted.equals-zero')}
   if($t.attempts -ne 1){$failures.Add('sender.attempts.equals-one')}
   if((Get-ExpiryProperty $t.Transport 'Outcome') -ne 'failed'){$failures.Add('sender.outcome.equals-failed')}
  } elseif($Baseline -and $mode -in @('domain','before','after')){
   if($r.accepted -ne 0){$failures.Add('receiver.accepted.equals-zero')}
   $baselineFirst=Get-ExpiryProperty $r.Transport 'FirstWireFrame';if($null -eq $baselineFirst){$baselineFirst=Get-ExpiryProperty $r.Transport 'FirstCandidateFrame'}
   if((Get-ExpiryProperty $baselineFirst 'AgeClass') -ne 'too-old'){$failures.Add('receiver.first-wire-age-class.equals-too-old')}
   if($t.attempts -ne 1){$failures.Add('sender.attempts.equals-one')}
  } else {
   if($r.connections -ne 1){$failures.Add('receiver.connections.equals-one')}
   if($t.attempts -ne 1){$failures.Add('sender.attempts.equals-one')}
   if($r.accepted -le 0){$failures.Add('receiver.accepted.greater-than-zero')}
   if($r.rejected -ne 0){$failures.Add('receiver.rejected.equals-zero')}
   if((Get-ExpiryProperty $r.Transport 'Outcome') -ne 'deliberate-stop'){$failures.Add('receiver.outcome.equals-deliberate-stop')}
   if((Get-ExpiryProperty $t.Transport 'Outcome') -ne 'deliberate-stop'){$failures.Add('sender.outcome.equals-deliberate-stop')}
  }
  if(!$Baseline -and $mode -in @('before','after','late')){
   if($t.expiredAfter -ne 1){$failures.Add('sender.expired-after.equals-one')}
   if((Get-ExpiryProperty $t.FirstExpiredUnsent 'AgeMs') -le 250){$failures.Add('sender.first-expired-age.greater-than-250ms')}
  }
 }
 return [pscustomobject][ordered]@{SchemaVersion=1;Case=$Case;Baseline=$Baseline;Passed=($failures.Count -eq 0);FailedPredicates=$failures.ToArray();RetentionFailures=@();Execution=$safeExecution;Receiver=$r;Sender=$t}
}
function ConvertTo-ExpiryDiagnosticJson($Record) {
 if($Record.Case -cnotin $script:ExpiryCaseNames){throw 'Unrecognized expiry case'}
 $json=$Record|ConvertTo-Json -Depth 12 -Compress
 if([Text.Encoding]::UTF8.GetByteCount($json) -gt $script:ExpiryDiagnosticByteLimit){throw 'Sanitized expiry diagnostic exceeded its fixed size bound'}
 return $json
}
function Write-ExpiryDiagnostic($Record,[string]$Directory) {
 $json=ConvertTo-ExpiryDiagnosticJson $Record
 [void][IO.Directory]::CreateDirectory($Directory)
 [IO.File]::WriteAllText((Join-Path $Directory ($Record.Case+'.json')),$json,[Text.UTF8Encoding]::new($false))
 $json
}
function Publish-ExpiryDiagnostic($Record,[string]$Directory,[string]$HostedDirectory) {
 $primaryPassed=$Record.Passed
 # Console evidence must survive a failure of either destination. Each destination
 # is attempted once; a secondary bounded record reports retention failures.
 ConvertTo-ExpiryDiagnosticJson $Record
 $retention=[Collections.Generic.List[object]]::new()
 foreach($destination in @([pscustomobject]@{Role='local';Directory=$Directory},[pscustomobject]@{Role='hosted';Directory=$HostedDirectory})){
  if(!$destination.Directory){continue}
  try{$null=Write-ExpiryDiagnostic $Record $destination.Directory}
  catch{$retention.Add([pscustomobject]@{Role=$destination.Role;Code='write-failed';ExceptionType=Get-ExpiryExceptionType $_.Exception})}
 }
 if($retention.Count -gt 0){
  $Record.RetentionFailures=$retention.ToArray();$Record.Passed=$false
  $Record.FailedPredicates=@($Record.FailedPredicates)+@('diagnostic.retention-succeeded')
  ConvertTo-ExpiryDiagnosticJson $Record
 }
 if(!$primaryPassed){throw ('Case failed; no retry: '+$Record.Case+'; see sanitized diagnostic')}
 if($retention.Count -gt 0){throw ('Expiry diagnostic retention failed: '+$Record.Case)}
}
