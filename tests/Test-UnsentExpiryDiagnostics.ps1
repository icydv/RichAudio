[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$repo=Split-Path -Parent $PSScriptRoot
. (Join-Path $repo 'tools/UnsentExpiry.Diagnostics.ps1')
$fixture=Join-Path $repo ('.local/expiry-diagnostic-fixtures-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($fixture)
$script:checks=0
function Assert-Expiry([bool]$Condition,[string]$Label){$script:checks++;if(!$Condition){throw ('Expiry diagnostic fixture failed: '+$Label)}}
function New-FixtureExecution {
 $process=[pscustomobject]@{Started=$true;Exited=$true;ExitCode=0;KillRequested=$false;InspectionFailed=$false}
 [pscustomobject]@{ReadinessObserved=$true;SenderWaitCompleted=$true;ReceiverWaitCompleted=$true;PrimaryTerminal=$null;CleanupErrors=@();Sender=$process;Receiver=$process}
}
function New-FixtureRead($Value){[pscustomobject]@{State='parsed';Value=$Value}}
function New-FixturePreparation {
 [pscustomobject]@{ClockFrequency=[long]10000000;RunStartQpc=[long]1700000000000;PreparationBeforeQpc=[long]1700000000001;PreparationAfterQpc=[long]1700000000002;PublisherStartBeforeQpc=[long]1700000000003;PublisherStartAfterQpc=[long]1700000000004;ServerStartBeforeQpc=[long]1700000000003;ServerStartAfterQpc=[long]1700000000004;Prewarmed=$true;PrewarmStatePublished=$false}
}
function New-FixtureReceiver {
 [pscustomobject]@{accepted=2;rejected=0;connections=1;fixture=New-FixturePreparation;diagnostic=[pscustomobject]@{Received=2;StartupDiscarded=0;Stage='connection';Code='sender-stop';Outcome='deliberate-stop';FirstFrame=[pscustomobject]@{DecisionAgeMs=42;AgeClass='within-bounds';DecodeMs=30};FirstAcceptedFrame=[pscustomobject]@{DecisionAgeMs=42;AgeClass='within-bounds'}}}
}
function New-FixtureSender {
 [pscustomobject]@{sent=2;attempts=1;transmitted=2;expiredAfter=0;firstExpired=$null;fixture=New-FixturePreparation;diagnostic=[pscustomobject]@{Transmitted=2;Stage='connection';Code='sender-stop';Outcome='deliberate-stop';FirstFrame=[pscustomobject]@{EncodeMs=31;AgeBeforeWriteMs=40};FirstAcceptedFrame=[pscustomobject]@{EncodeMs=31;AgeBeforeWriteMs=40}}}
}
$execution=New-FixtureExecution
$receiver=New-FixtureReceiver;$sender=New-FixtureSender
$good=New-ExpiryDiagnostic 'domain-1' $false (New-FixtureRead $receiver) (New-FixtureRead $sender) $execution
Assert-Expiry $good.Passed 'existing successful domain acceptance'
Assert-Expiry ($good.FailedPredicates.Count -eq 0) 'no failed predicates for success'
Assert-Expiry ($good.Receiver.Transport.FirstWireStage -eq 'received' -and $good.Sender.Transport.FirstWireStage -eq 'transmitted') 'wire stages reflect observed events'
Assert-Expiry ($good.Receiver.Transport.FirstAcceptedStage -eq 'accepted' -and $good.Sender.Transport.FirstAcceptedStage -eq 'accepted') 'accepted stages reflect observed events'
Assert-Expiry ($good.Receiver.Transport.FirstWireFrame.DecisionAgeMs -eq 42 -and $good.Sender.Transport.FirstAcceptedFrame.EncodeMs -eq 31) 'both timing objects retained'

$receiver.accepted=0;$receiver.rejected=1;$receiver.connections=0;$receiver.diagnostic.Outcome='failed';$receiver.diagnostic.Stage='freshness';$receiver.diagnostic.Code='invalid-age'
$sender.attempts=2;$sender.diagnostic.Outcome='failed'
$failed=New-ExpiryDiagnostic 'domain-1' $false (New-FixtureRead $receiver) (New-FixtureRead $sender) $execution
$expected=@('receiver.connections.equals-one','sender.attempts.equals-one','receiver.accepted.greater-than-zero','receiver.rejected.equals-zero','receiver.outcome.equals-deliberate-stop','sender.outcome.equals-deliberate-stop')
Assert-Expiry (!$failed.Passed -and $failed.FailedPredicates.Count -eq 6) 'every failed composite predicate is separate'
foreach($predicate in $expected){Assert-Expiry ($failed.FailedPredicates -contains $predicate) $predicate}
Assert-Expiry ($failed.Receiver.Transport.Stage -eq 'freshness' -and $failed.Receiver.Transport.FirstWireStage -eq 'received') 'terminal stage distinct from first-wire event'
Assert-Expiry ($failed.Receiver.Transport.FirstAcceptedStage -eq 'not-observed' -and $null -eq $failed.Receiver.Transport.FirstAcceptedFrame) 'no accepted timing claimed after failure'

$sender=New-FixtureSender;$sender.sent=0;$sender.transmitted=0;$sender.diagnostic.Transmitted=0
$unsent=New-ExpiryDiagnostic 'domain-1' $false (New-FixtureRead (New-FixtureReceiver)) (New-FixtureRead $sender) $execution
Assert-Expiry ($unsent.Sender.Transport.FirstWireStage -eq 'not-observed' -and $null -eq $unsent.Sender.Transport.FirstWireFrame) 'unsent candidate is not a wire frame'
Assert-Expiry ($unsent.Sender.Transport.FirstCandidateFrame.EncodeMs -eq 31) 'unsent candidate timing retained honestly'
$sender.PSObject.Properties.Remove('transmitted');$sender.diagnostic.PSObject.Properties.Remove('Transmitted')
$unknown=New-ExpiryDiagnostic 'domain-1' $false (New-FixtureRead (New-FixtureReceiver)) (New-FixtureRead $sender) $execution
Assert-Expiry ($unknown.Sender.Transport.FirstWireStage -eq 'unknown') 'missing wire counter is unknown'

$receiver=New-FixtureReceiver;$receiver.accepted=0;$receiver.diagnostic.Code='deadline'
$sender=New-FixtureSender;$sender.diagnostic.Outcome='failed';$sender.expiredAfter=1;$sender.firstExpired=[pscustomobject]@{Sequence=0;AgeMs=350;Stage='after-encoding-before-write'}
$late=New-ExpiryDiagnostic 'late' $false (New-FixtureRead $receiver) (New-FixtureRead $sender) $execution
Assert-Expiry $late.Passed 'original late deadline and controlled expiry accepted'
$domainReceiver=New-FixtureReceiver;$domainReceiver.accepted=0;$domainReceiver.rejected=1;$domainReceiver.diagnostic.Stage='header';$domainReceiver.diagnostic.Code='deadline';$domainReceiver.diagnostic.Outcome='failed';$domainReceiver.diagnostic|Add-Member -NotePropertyName ExceptionType -NotePropertyValue 'TimeoutException'
$domainReceiver.fixture|Add-Member -NotePropertyName FinishedQpc -NotePropertyValue ([long]1700000900000)
$sender.fixture|Add-Member -NotePropertyName Encoding -NotePropertyValue @([pscustomobject]@{Sequence=0;ObservationTicks=[long]1700000000005;BeforeEncodeQpc=[long]1700000000006;AfterEncodeQpc=[long]1700000900001})
$domainLate=New-ExpiryDiagnostic 'domain-late' $false (New-FixtureRead $domainReceiver) (New-FixtureRead $sender) $execution
Assert-Expiry $domainLate.Passed 'explicit late AppDomain negative case retains the same deadline and freshness predicates'
$domainReceiver.fixture.FinishedQpc=[long]1700000000005
$badCausality=New-ExpiryDiagnostic 'domain-late' $false (New-FixtureRead $domainReceiver) (New-FixtureRead $sender) $execution
Assert-Expiry (!$badCausality.Passed -and $badCausality.FailedPredicates -contains 'domain-late.encoding-brackets-receiver-terminal') 'receiver terminal before first encoding cannot claim causal wait evidence'
$domainReceiver.fixture.FinishedQpc=[long]1700000900000
$domainReceiver.rejected=0
$wrongDomainLate=New-ExpiryDiagnostic 'domain-late' $false (New-FixtureRead $domainReceiver) (New-FixtureRead $sender) $execution
Assert-Expiry (!$wrongDomainLate.Passed -and $wrongDomainLate.FailedPredicates -contains 'receiver.rejected.equals-one') 'late AppDomain case requires actual receiver terminal rejection'
$sender.expiredAfter=2;$sender.firstExpired.AgeMs=250
$lateFailed=New-ExpiryDiagnostic 'late' $false (New-FixtureRead $receiver) (New-FixtureRead $sender) $execution
Assert-Expiry ($lateFailed.FailedPredicates.Count -eq 2 -and $lateFailed.FailedPredicates -contains 'sender.expired-after.equals-one' -and $lateFailed.FailedPredicates -contains 'sender.first-expired-age.greater-than-250ms') 'expiry predicates and threshold unchanged'
$receiver.diagnostic.FirstFrame.AgeClass='too-old'
$baseline=New-ExpiryDiagnostic 'domain-1' $true (New-FixtureRead $receiver) (New-FixtureRead $sender) $execution
Assert-Expiry $baseline.Passed 'baseline acceptance unchanged'

$missing=Read-ExpiryRecord (Join-Path $fixture 'missing.json')
Assert-Expiry ($missing.State -eq 'missing') 'missing child record classified'
$malformedPath=Join-Path $fixture 'malformed.json';[IO.File]::WriteAllText($malformedPath,'{"private":"DO-NOT-EXPORT-THIS",')
$malformed=Read-ExpiryRecord $malformedPath
Assert-Expiry ($malformed.State -eq 'malformed') 'malformed child record classified'
$execution=New-FixtureExecution;$execution.PrimaryTerminal=[pscustomobject]@{Code='sender-start-failed';ExceptionType='Win32Exception';HResult=-2147467259}
$execution.Sender=Get-ExpiryProcessState $null
$execution.CleanupErrors=@([pscustomobject]@{Role='receiver';Code='kill-failed';ExceptionType='Win32Exception'})
$missingDiagnostic=New-ExpiryDiagnostic 'domain-1' $false $missing $malformed $execution
$missingJson=Write-ExpiryDiagnostic $missingDiagnostic (Join-Path $fixture 'sanitized')
Assert-Expiry (!$missingDiagnostic.Passed -and $missingDiagnostic.FailedPredicates -contains 'receiver.record.parsed' -and $missingDiagnostic.FailedPredicates -contains 'sender.record.parsed') 'missing and malformed records still produce diagnostic'
Assert-Expiry ($missingDiagnostic.FailedPredicates -contains 'sender.process.started') 'missing child produces process predicate'
Assert-Expiry ($missingDiagnostic.Execution.PrimaryTerminal.Code -eq 'sender-start-failed' -and $missingDiagnostic.Execution.CleanupErrors[0].Code -eq 'kill-failed') 'primary failure and cleanup failure retained separately'
Assert-Expiry ($missingDiagnostic.Execution.PrimaryTerminal.HResult -eq -2147467259) 'original wrapper exception HRESULT retained without its private message'
Assert-Expiry ($missingJson -notmatch 'DO-NOT-EXPORT-THIS') 'malformed private bytes not exported'

$oversizedPath=Join-Path $fixture 'oversized.json';[IO.File]::WriteAllText($oversizedPath,('x'*65537))
Assert-Expiry ((Read-ExpiryRecord $oversizedPath).State -eq 'oversized') 'input byte limit checked before parse'
foreach($text in @('null','[]','"scalar"','0')){
 $shapePath=Join-Path $fixture 'shape.json';[IO.File]::WriteAllText($shapePath,$text)
 Assert-Expiry ((Read-ExpiryRecord $shapePath).State -eq 'invalid-shape') 'invalid top-level shape classified'
}
$hostilePath=Join-Path $fixture 'hostile.json'
$privateMarker='DO-NOT-EXPORT-THIS';$privatePath=Join-Path $fixture ($privateMarker+'-private-record.json')
$hostile=[pscustomobject]@{accepted=[pscustomobject]@{secret=$privateMarker};rejected=$privateMarker;connections=1;session=$privateMarker;pipe=$privateMarker;capability=$privateMarker;path=$privatePath;privateBytes=@(1,2,3);diagnostic=[pscustomobject]@{Received=1;Stage=$privateMarker;Code=$privatePath;Outcome=$privateMarker;ExceptionType=$privateMarker;ExceptionMessage=$privatePath;FirstFrame=[pscustomobject]@{DecisionAgeMs=$privateMarker;AgeClass=$privateMarker;ObservationTicks=123;ClockFrequency=456;secret=$privateMarker}}}
[IO.File]::WriteAllText($hostilePath,($hostile|ConvertTo-Json -Depth 10))
$hostileRead=Read-ExpiryRecord $hostilePath
$hostileDiagnostic=New-ExpiryDiagnostic 'domain-1' $false $hostileRead (New-FixtureRead (New-FixtureSender)) (New-FixtureExecution)
$safeJson=Write-ExpiryDiagnostic $hostileDiagnostic (Join-Path $fixture 'sanitized-hostile')
Assert-Expiry (!$hostileDiagnostic.Passed) 'malformed numeric field cannot satisfy acceptance'
Assert-Expiry ($safeJson -notmatch $privateMarker -and $safeJson -notmatch 'ExceptionMessage|privateBytes|capability|session|pipe') 'whitelist excludes private identity and payload'
Assert-Expiry ($hostileDiagnostic.Receiver.Transport.FirstWireFrame.ObservationTicks -eq 123 -and $hostileDiagnostic.Receiver.Transport.FirstWireFrame.ClockFrequency -eq 456) 'original timestamp and frequency remain exact numeric evidence'
Assert-Expiry ($hostileDiagnostic.Receiver.Transport.Stage -eq 'unrecognized' -and $null -eq $hostileDiagnostic.Receiver.accepted) 'unrecognized values are not echoed'
Assert-Expiry ([Text.Encoding]::UTF8.GetByteCount($safeJson) -le 16384 -and [Text.Encoding]::UTF8.GetByteCount($missingJson) -le 16384) 'serialized diagnostic output bounded'
$largeClock=[pscustomobject]@{ObservationTicks=[long]1700000000000;ClockFrequency=[long]10000000;AgeClass='within-bounds'}
$clockTiming=ConvertTo-ExpiryTiming $largeClock
Assert-Expiry ($clockTiming.ObservationTicks -eq [long]1700000000000 -and $clockTiming.ClockFrequency -eq 10000000) 'valid long-running host clocks are not replaced with null by duration bounds'
$largeClock.ObservationTicks=$privateMarker;$largeClock.ClockFrequency=1.5
$invalidClock=ConvertTo-ExpiryTiming $largeClock
Assert-Expiry ($null -eq $invalidClock.ObservationTicks -and $null -eq $invalidClock.ClockFrequency) 'noninteger or private timestamp values are not exported'
$fixtureSource=[pscustomobject]@{ClockFrequency=[long]10000000;RunStartQpc=[long]1700000000000;Prewarmed=$true;PrewarmMs=3;Observations=@(1..6|ForEach-Object{[pscustomobject]@{Sequence=$_;ObservationTicks=[long]1700000000000;PublishBeforeQpc=[long]1700000000001;PublishAfterQpc=[long]1700000000002;message=$privateMarker}});Encoding=@([pscustomobject]@{Sequence=0;ObservationTicks=[long]1700000000000;BeforeEncodeQpc=[long]1700000000001;AfterEncodeQpc=[long]1700000900001;message=$privateMarker});ObservationRecordsDropped=0;EncodingRecordsDropped=0;secret=$privateMarker}
$safeFixture=ConvertTo-ExpiryFixture $fixtureSource
Assert-Expiry ($safeFixture.Observations.Count -eq 4 -and $safeFixture.ObservationsRecordCount -eq 6 -and $safeFixture.ObservationsRecordsOmitted -eq 2) 'bounded publication observations disclose omitted records'
Assert-Expiry ($safeFixture.Encoding[0].BeforeEncodeQpc -eq [long]1700000000001 -and $safeFixture.Encoding[0].AfterEncodeQpc -eq [long]1700000900001) 'decisive original first-encoding timestamps retained exactly'
Assert-Expiry (($safeFixture|ConvertTo-Json -Depth 8) -notmatch $privateMarker) 'fixture timestamp projection excludes arbitrary source messages'
$preparation=New-FixturePreparation;$safePreparation=ConvertTo-ExpiryFixture $preparation
Assert-Expiry ($safePreparation.PreparationBeforeQpc -eq [long]1700000000001 -and $safePreparation.PreparationAfterQpc -eq [long]1700000000002 -and $safePreparation.PublisherStartBeforeQpc -eq [long]1700000000003 -and $safePreparation.ServerStartAfterQpc -eq [long]1700000000004 -and $safePreparation.PrewarmStatePublished -eq $false) 'original preparation and worker-start chronology is explicitly projected'
$badPreparationReceiver=New-FixtureReceiver;$badPreparationReceiver.fixture.PreparationAfterQpc=[long]1700000000005
$badPreparation=New-ExpiryDiagnostic 'none-1' $false (New-FixtureRead $badPreparationReceiver) (New-FixtureRead (New-FixtureSender)) (New-FixtureExecution)
Assert-Expiry (!$badPreparation.Passed -and $badPreparation.FailedPredicates -contains 'receiver.fixture.preparation-before-start') 'preparation after connection-start cannot satisfy a success case'
$cleanupSender=New-FixtureSender
$cleanupSender|Add-Member -NotePropertyName harnessFailure -NotePropertyValue ([pscustomobject]@{stage='sender-stop-wait';code='sender-lifetime';exceptionType='TimeoutException'})
$cleanupSender|Add-Member -NotePropertyName cleanupFailures -NotePropertyValue @([pscustomobject]@{stage='appdomain-unload';code='fixture-cleanup-failed';exceptionType='CannotUnloadAppDomainException';message=$privateMarker})
$cleanupDiagnostic=New-ExpiryDiagnostic 'domain-1' $false (New-FixtureRead (New-FixtureReceiver)) (New-FixtureRead $cleanupSender) (New-FixtureExecution)
Assert-Expiry ($cleanupDiagnostic.Sender.HarnessFailure.Code -eq 'sender-lifetime' -and $cleanupDiagnostic.Sender.CleanupFailures[0].Stage -eq 'appdomain-unload') 'native primary and cleanup records retained separately'
$sourceStage=ConvertTo-ExpiryFailure ([pscustomobject]@{stage='codec-preparation';code='fixture-operation-failed';exceptionType='IOException';hResult=-2146232800;message=$privateMarker})
Assert-Expiry ($sourceStage.Stage -eq 'codec-preparation' -and $sourceStage.ExceptionType -eq 'IOException' -and $sourceStage.HResult -eq -2146232800 -and ($sourceStage|ConvertTo-Json -Compress) -notmatch $privateMarker) 'source preparation exception stage/type/HRESULT retained without private message'
Assert-Expiry (!$cleanupDiagnostic.Passed -and $cleanupDiagnostic.FailedPredicates -contains 'sender.harness-failure.is-null' -and $cleanupDiagnostic.FailedPredicates -contains 'sender.cleanup-succeeded') 'native failures cannot pass even with zero process exit'
$cleanupJson=Write-ExpiryDiagnostic $cleanupDiagnostic (Join-Path $fixture 'sanitized-cleanup')
Assert-Expiry ($cleanupJson -notmatch $privateMarker) 'native cleanup error message excluded'
$cleanupSender.cleanupFailures=@(1..6|ForEach-Object {[pscustomobject]@{stage='publisher-dispose';code='fixture-cleanup-failed';exceptionType='IOException';message=$privateMarker}})
$execution=New-FixtureExecution;$execution.CleanupErrors=@(1..7|ForEach-Object {[pscustomobject]@{Role='receiver';Code='kill-failed';ExceptionType='IOException';message=$privateMarker}})
$omitted=New-ExpiryDiagnostic 'domain-1' $false (New-FixtureRead (New-FixtureReceiver)) (New-FixtureRead $cleanupSender) $execution
Assert-Expiry ($omitted.Sender.CleanupFailureCount -eq 6 -and $omitted.Sender.CleanupFailures.Count -eq 4 -and $omitted.Sender.CleanupFailuresOmitted -eq 2) 'native cleanup truncation disclosed'
Assert-Expiry ($omitted.Execution.CleanupErrorCount -eq 7 -and $omitted.Execution.CleanupErrors.Count -eq 4 -and $omitted.Execution.CleanupErrorsOmitted -eq 3) 'child cleanup truncation disclosed'
$published=[Collections.Generic.List[string]]::new();$publicationFailed=$false
$publishedDirectory=Join-Path $fixture 'published-failed';$hostedDirectory=Join-Path $fixture 'published-hosted'
try {Publish-ExpiryDiagnostic $failed $publishedDirectory $hostedDirectory |ForEach-Object {$published.Add([string]$_)}}
catch {$publicationFailed=$true;Assert-Expiry ($_.Exception.Message -like 'Case failed; no retry: domain-1;*') 'original assertion still terminates failing case'}
Assert-Expiry ($publicationFailed -and $published.Count -eq 1) 'stdout JSON delivered before actual failing assertion'
$publishedRecord=$published[0]|ConvertFrom-Json
Assert-Expiry (!$publishedRecord.Passed -and $publishedRecord.FailedPredicates.Count -eq 6) 'stdout retains each failed predicate after throw'
$publishedPath=Join-Path $publishedDirectory 'domain-1.json';$hostedPath=Join-Path $hostedDirectory 'domain-1.json'
Assert-Expiry ((Test-Path -LiteralPath $publishedPath) -and (Test-Path -LiteralPath $hostedPath)) 'local and hosted diagnostic files survive actual throw'
Assert-Expiry ([IO.File]::ReadAllText($publishedPath) -ceq $published[0] -and [IO.File]::ReadAllText($hostedPath) -ceq $published[0]) 'published files contain exactly the bounded stdout record'
$blockedLocal=Join-Path $fixture 'blocked-local';$blockedHosted=Join-Path $fixture 'blocked-hosted'
[IO.File]::WriteAllText($blockedLocal,$privateMarker);[IO.File]::WriteAllText($blockedHosted,$privateMarker)
$retentionOutput=[Collections.Generic.List[string]]::new();$retentionThrew=$false
try {Publish-ExpiryDiagnostic $failed $blockedLocal $blockedHosted |ForEach-Object {$retentionOutput.Add([string]$_)}}
catch {$retentionThrew=$true;Assert-Expiry ($_.Exception.Message -like 'Case failed; no retry: domain-1;*') 'retention failure preserves original assertion'}
Assert-Expiry ($retentionThrew -and $retentionOutput.Count -eq 2) 'primary stdout survives both retention failures'
$retentionRecord=$retentionOutput[1]|ConvertFrom-Json
Assert-Expiry (!$retentionRecord.Passed -and $retentionRecord.RetentionFailures.Count -eq 2 -and $retentionRecord.RetentionFailures[0].Role -eq 'local' -and $retentionRecord.RetentionFailures[1].Role -eq 'hosted') 'both destinations fail independently with bounded role codes'
Assert-Expiry ($retentionRecord.FailedPredicates -contains 'diagnostic.retention-succeeded' -and $retentionRecord.FailedPredicates -contains 'receiver.connections.equals-one') 'secondary retention predicate preserves primary failure predicates'
Assert-Expiry ($retentionOutput[1] -notmatch [regex]::Escape($fixture) -and $retentionOutput[1] -notmatch $privateMarker -and [Text.Encoding]::UTF8.GetByteCount($retentionOutput[1]) -le 16384) 'retention exceptions do not export private paths or bytes'
$passWithRetentionFailure=New-ExpiryDiagnostic 'none-1' $false (New-FixtureRead (New-FixtureReceiver)) (New-FixtureRead (New-FixtureSender)) (New-FixtureExecution)
$passingOutput=[Collections.Generic.List[string]]::new();$passingThrew=$false
try {Publish-ExpiryDiagnostic $passWithRetentionFailure $blockedLocal $null |ForEach-Object {$passingOutput.Add([string]$_)}}
catch {$passingThrew=$true;Assert-Expiry ($_.Exception.Message -eq 'Expiry diagnostic retention failed: none-1') 'otherwise passing case fails required retention'}
Assert-Expiry ($passingThrew -and !($passingOutput[1]|ConvertFrom-Json).Passed) 'retention failure cannot produce successful script outcome'

# Authored maximum-width parsed records, not a transport measurement. Each raw
# input remains below 64 KiB while all allowed public sections are populated.
function Set-StressExpiryValue($Value,[string]$Name,$Data){$Value|Add-Member -NotePropertyName $Name -NotePropertyValue $Data -Force}
$wideNumber=[double]999999999999.999;$wideClock=[long]9000000000000000000
$wideReceiver=New-FixtureReceiver;$wideSender=New-FixtureSender
foreach($child in @($wideReceiver,$wideSender)){
 foreach($name in @('sent','attempts','replaced','accepted','rejected','connections','transmitted','startupDiscarded','beforeDelayMs','afterDelayMs','expiredBefore','expiredAfter','firstPublished','firstTransmitted','schemaVersion')){Set-StressExpiryValue $child $name $wideNumber}
 Set-StressExpiryValue $child 'lifecycle' ([pscustomobject]@{})
 foreach($name in @('publisherConstructMs','publisherStartMs','firstSyntheticMs','firstPublishMs','firstPublicationAtMs','publicationCount','productionLoopMs','stopRequestMs','stopWaitMs','disposeMs','runMs','serverConstructMs','serverStartMs','readyMarkerAtMs','waitMs','appDomainCreateMs','appDomainActivateMs','appDomainUnloadMs','prewarmMs','mainMs')){Set-StressExpiryValue $child.lifecycle $name $wideNumber}
 foreach($name in @('ClockFrequency','RunStartQpc','ReceiverReadyQpc','StopRequestQpc','FinishedQpc','PreparationBeforeQpc','PreparationAfterQpc','PublisherStartBeforeQpc','PublisherStartAfterQpc','ServerStartBeforeQpc','ServerStartAfterQpc')){Set-StressExpiryValue $child.fixture $name $wideClock}
 foreach($name in @('PublicationCount','ObservationRecordsDropped','EncodingRecordsDropped','PrewarmMs')){Set-StressExpiryValue $child.fixture $name $wideNumber}
 Set-StressExpiryValue $child.fixture 'Prewarmed' $true;Set-StressExpiryValue $child.fixture 'PrewarmStatePublished' $true
 $capture=@(1..32|ForEach-Object{[pscustomobject]@{Sequence=$wideNumber;ObservationTicks=$wideClock;PublishBeforeQpc=$wideClock;PublishAfterQpc=$wideClock;BeforeEncodeQpc=$wideClock;AfterEncodeQpc=$wideClock;message=$privateMarker}})
 Set-StressExpiryValue $child.fixture 'Observations' $capture;Set-StressExpiryValue $child.fixture 'Encoding' $capture
 foreach($name in @('ExpiredBeforeEncoding','ExpiredAfterEncoding','StartupDiscarded','Transmitted','Received','StartupDiscardLimit','StartupBudgetMs','Connection','ElapsedMs')){Set-StressExpiryValue $child.diagnostic $name $wideNumber}
 $frame=[pscustomobject]@{}
 foreach($name in @('FrameSequence','CopyMs','MailboxAgeMs','AgeBeforeEncodeMs','EncodeMs','AgeBeforeWriteMs','WriteMs','AckMs','ConnectionMs','HeaderMs','PayloadMs','PayloadReceivedAgeMs','DecodeMs','DecisionAgeMs','CallbackMs','MinimumAgeMs','MaximumAgeMs')){Set-StressExpiryValue $frame $name $wideNumber}
 Set-StressExpiryValue $frame 'ObservationTicks' $wideClock;Set-StressExpiryValue $frame 'ClockFrequency' $wideClock;Set-StressExpiryValue $frame 'AgeClass' 'future-dated';Set-StressExpiryValue $frame 'ClockFrequencyAgrees' $false
 Set-StressExpiryValue $child.diagnostic 'FirstFrame' $frame;Set-StressExpiryValue $child.diagnostic 'FirstAcceptedFrame' $frame
 $expired=[pscustomobject]@{Sequence=$wideNumber;AgeMs=$wideNumber;EncodeMs=$wideNumber;BeforeEncodeAgeMs=$wideNumber;Stage='after-encoding-before-write'}
 Set-StressExpiryValue $child.diagnostic 'FirstExpiredUnsent' $expired;Set-StressExpiryValue $child 'firstExpired' $expired
 Set-StressExpiryValue $child.diagnostic 'OffendingFrame' ([pscustomobject]@{FrameOrdinal=$wideNumber;DecisionAgeMs=$wideNumber;AgeClass='future-dated'})
 Set-StressExpiryValue $child.diagnostic 'Code' 'invalid-encoding-or-json';Set-StressExpiryValue $child.diagnostic 'Outcome' 'unexpected-eof';Set-StressExpiryValue $child.diagnostic 'ExceptionType' 'DecoderFallbackException'
 $failure=[pscustomobject]@{stage='receiver-terminal-signal';code='fixture-operation-failed';exceptionType='CannotUnloadAppDomainException';hResult=$wideNumber;message=$privateMarker}
 Set-StressExpiryValue $child 'harnessFailure' $failure;Set-StressExpiryValue $child 'cleanupFailures' @(1..6|ForEach-Object{$failure})
}
$wideProcess=[pscustomobject]@{Started=$true;Exited=$true;ExitCode=$wideNumber;KillRequested=$true;InspectionFailed=$true}
$wideExecution=[pscustomobject]@{ReadinessObserved=$false;SenderWaitCompleted=$false;ReceiverWaitCompleted=$false;PrimaryTerminal=[pscustomobject]@{Code='receiver-start-failed';ExceptionType='UnauthorizedAccessException';HResult=$wideNumber};CleanupErrors=@(1..7|ForEach-Object{[pscustomobject]@{Role='receiver';Code='kill-exit-unverified';ExceptionType='UnauthorizedAccessException';HResult=$wideNumber}});Sender=$wideProcess;Receiver=$wideProcess}
foreach($name in @('SenderWaitBudgetMs','SenderBudgetElapsedMs','ReceiverWaitBudgetMs','ReceiverBudgetElapsedMs')){Set-StressExpiryValue $wideExecution $name $wideNumber}
foreach($child in @($wideReceiver,$wideSender)){Assert-Expiry ([Text.Encoding]::UTF8.GetByteCount(($child|ConvertTo-Json -Depth 20 -Compress)) -lt 65536) 'maximum-width raw fixture stays inside parser byte bound'}
$wide=New-ExpiryDiagnostic 'domain-late' $false (New-FixtureRead $wideReceiver) (New-FixtureRead $wideSender) $wideExecution
$originalWidePredicates=@($wide.FailedPredicates)
Assert-Expiry ([Text.Encoding]::UTF8.GetByteCount(($wide|ConvertTo-Json -Depth 12 -Compress)) -gt 16384) 'maximum-width safe projection reproduces original early-size failure'
$wideOutput=[Collections.Generic.List[string]]::new();$wideThrew=$false
$wideLocal=Join-Path $fixture 'maximum-width-local';$wideHosted=Join-Path $fixture 'maximum-width-hosted'
try{Publish-ExpiryDiagnostic $wide $wideLocal $wideHosted|ForEach-Object{$wideOutput.Add([string]$_)}}catch{$wideThrew=$true}
Assert-Expiry ($wideThrew -and $wideOutput.Count -eq 1) 'oversized projection emits one bounded record before preserving actual failure'
$compact=$wideOutput[0]|ConvertFrom-Json
Assert-Expiry (!$compact.Passed -and $compact.ProjectionMode -eq 'compact' -and $compact.FailedPredicates -contains 'diagnostic.size.within-bound') 'diagnostic width is an explicit failing predicate'
foreach($predicate in $originalWidePredicates){Assert-Expiry ($compact.FailedPredicates -contains $predicate) 'compact projection retains each original failed predicate'}
Assert-Expiry ($compact.FailedPredicatesOmitted -eq 0 -and $compact.OriginalFailedPredicateCount -eq $originalWidePredicates.Count) 'generated failure names are retained without omission'
Assert-Expiry ($compact.Receiver.accepted -eq $wideNumber -and $compact.Sender.attempts -eq $wideNumber -and $compact.Receiver.Transport.Outcome -eq 'unexpected-eof' -and $compact.Sender.HarnessFailure.ExceptionType -eq 'CannotUnloadAppDomainException') 'compact counts/outcomes/source exception operands remain exact'
Assert-Expiry ($compact.Sender.Fixture.Encoding[0].ObservationTicks -eq $wideClock -and $compact.Sender.Fixture.Encoding[0].BeforeEncodeQpc -eq $wideClock -and $compact.Sender.Fixture.PreparationBeforeQpc -eq $wideClock -and $compact.Execution.Sender.ExitCode -eq $wideNumber -and $compact.Execution.SenderWaitBudgetMs -eq $wideNumber -and $compact.Execution.SenderBudgetElapsedMs -eq $wideNumber -and $compact.Execution.ReceiverWaitBudgetMs -eq $wideNumber -and $compact.Execution.ReceiverBudgetElapsedMs -eq $wideNumber) 'compact projection retains causal timestamps, preparation, process exits and wait budget operands'
Assert-Expiry ($compact.Sender.Fixture.EncodingRecordCount -eq 32 -and $compact.Sender.Fixture.EncodingRecordsOmitted -eq 31 -and $compact.Execution.CleanupErrorCount -eq 7 -and $compact.Execution.CleanupErrorsOmitted -eq 6 -and $compact.Sender.CleanupFailureCount -eq 6 -and $compact.OmittedSections.Count -gt 0) 'all compact section omissions and original counts are explicit'
Assert-Expiry ([Text.Encoding]::UTF8.GetByteCount($wideOutput[0]) -le 16384 -and $wideOutput[0] -notmatch $privateMarker) 'compact stdout remains within fixed privacy and size bounds'
Assert-Expiry ([IO.File]::ReadAllText((Join-Path $wideLocal 'domain-late.json')) -ceq $wideOutput[0] -and [IO.File]::ReadAllText((Join-Path $wideHosted 'domain-late.json')) -ceq $wideOutput[0]) 'both durable destinations retain identical compact evidence before throw'
$directJson=Write-ExpiryDiagnostic $wide (Join-Path $fixture 'maximum-width-direct')
Assert-Expiry (($directJson|ConvertFrom-Json).ProjectionMode -eq 'compact' -and [Text.Encoding]::UTF8.GetByteCount($directJson) -le 16384 -and $directJson -notmatch $privateMarker) 'direct diagnostic writes cannot bypass bounded compact projection'
# Cover the publication guard's full defensive predicate-name capacity as well
# as every timing section, rather than relying on ordinary fixture magnitudes.
foreach($child in @($wide.Receiver,$wide.Sender)){$child.Transport.FirstCandidateFrame=$child.Transport.FirstWireFrame}
$wide.FailedPredicates=@(1..64|ForEach-Object{('diagnostic.{0:d2}'-f$_)+('a'*83)})
$widestJson=ConvertTo-ExpiryDiagnosticJson $wide
Assert-Expiry ([Text.Encoding]::UTF8.GetByteCount($widestJson) -le 16384 -and ($widestJson|ConvertFrom-Json).FailedPredicatesOmitted -eq 0) '64 maximum-width predicate names and all timing sections remain bounded'
$journalEvents=[Collections.Generic.List[object]]::new();foreach($unused in 1..64){$journalEvents.Add(@('first-completion-observed',$wideClock,$wideNumber))}
$maximumJournal=[pscustomobject]@{State='qualified';ParentEventCount=16;ChildEventCount=48;LastParentStage='parent-exit-observed';LastChildStage='first-completion-observed';Events=$journalEvents.ToArray()}
$wide|Add-Member -NotePropertyName StageJournals -NotePropertyValue ([pscustomobject]@{Sender=$maximumJournal;Receiver=$maximumJournal})
$wide|Add-Member -NotePropertyName DiagnosticFault -NotePropertyValue 'terminal-record-before'
$journalJson=ConvertTo-ExpiryDiagnosticJson $wide;$journalCompact=$journalJson|ConvertFrom-Json
Assert-Expiry ([Text.Encoding]::UTF8.GetByteCount($journalJson) -le 16384 -and $journalCompact.StageJournals.Sender.LastChildQpc -eq $wideClock) 'maximum-width compact journal retains exact final stage timestamp inside publication bound'
Assert-Expiry ($journalCompact.StageJournals.Sender.LastChildStage -eq 'first-completion-observed' -and $journalCompact.StageJournals.Sender.EventsOmitted -eq 64 -and $journalCompact.StageJournals.Receiver.ParentEventCount -eq 16) 'compact journal retains final stages and explicit original event counts'
$wideRetentionOutput=[Collections.Generic.List[string]]::new();$wideRetentionThrew=$false
try{Publish-ExpiryDiagnostic $wide $blockedLocal $blockedHosted|ForEach-Object{$wideRetentionOutput.Add([string]$_)}}catch{$wideRetentionThrew=$true}
Assert-Expiry ($wideRetentionThrew -and $wideRetentionOutput.Count -eq 2 -and [Text.Encoding]::UTF8.GetByteCount($wideRetentionOutput[1]) -le 16384) 'maximum compact record also retains both destination failures inside the fixed bound'
$wideRetentionRecord=$wideRetentionOutput[1]|ConvertFrom-Json
Assert-Expiry (!$wideRetentionRecord.Passed -and $wideRetentionRecord.RetentionFailures.Count -eq 2 -and $wideRetentionRecord.FailedPredicates -contains 'diagnostic.retention-succeeded' -and $wideRetentionRecord.FailedPredicatesOmitted -eq 0) 'compact retention failure cannot mask size or original predicate failures'
$stressProof=[ordered]@{kind='authored-maximum-width-publication-regression';originalProjectedBytes=[Text.Encoding]::UTF8.GetByteCount(($wide|ConvertTo-Json -Depth 12 -Compress));widestCompactBytes=[Text.Encoding]::UTF8.GetByteCount($widestJson);compactWithMaximumJournalsBytes=[Text.Encoding]::UTF8.GetByteCount($journalJson);compactWithBothRetentionFailuresBytes=[Text.Encoding]::UTF8.GetByteCount($wideRetentionOutput[1]);fixedBound=16384;maximumPredicateNames=64;predicateCharacters=96;rawCaptureRecordsPerArray=32;journalEventsPerRole=64;endpointConstructed=$false}
[IO.File]::WriteAllText((Join-Path $fixture 'maximum-width-proof.json'),($stressProof|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
$wide.Passed=$true;$wide.FailedPredicates=@();$sizeOnlyOutput=[Collections.Generic.List[string]]::new();$sizeOnlyThrew=$false
try{Publish-ExpiryDiagnostic $wide (Join-Path $fixture 'maximum-width-pass') $null|ForEach-Object{$sizeOnlyOutput.Add([string]$_)}}catch{$sizeOnlyThrew=$true}
Assert-Expiry ($sizeOnlyThrew -and $sizeOnlyOutput.Count -eq 1 -and !($sizeOnlyOutput[0]|ConvertFrom-Json).Passed -and ($sizeOnlyOutput[0]|ConvertFrom-Json).FailedPredicates -contains 'diagnostic.size.within-bound') 'oversize cannot leave an otherwise passing publication outcome'

$scriptText=[IO.File]::ReadAllText((Join-Path $repo 'tools/Test-UnsentExpiry.ps1'))
$scriptTokens=$null;$parseErrors=$null
[void][Management.Automation.Language.Parser]::ParseInput($scriptText,[ref]$scriptTokens,[ref]$parseErrors)
Assert-Expiry ($parseErrors.Count -eq 0) 'expiry script parses'
Assert-Expiry ($scriptText.Contains('Get-ExpiryRemainingWaitMs $senderBudget.Elapsed.TotalMilliseconds 5000') -and $scriptText.Contains('Get-ExpiryRemainingWaitMs $receiverBudget.Elapsed.TotalMilliseconds 6000') -and $scriptText.Contains('$w.ElapsedMilliseconds -lt 2000') -and $scriptText.IndexOf('$senderBudget=[Diagnostics.Stopwatch]::StartNew()') -lt $scriptText.IndexOf('Add-ExpiryParentStage $senderJournal 2') -and $scriptText.IndexOf('$w=[Diagnostics.Stopwatch]::StartNew()') -lt $scriptText.IndexOf('Add-ExpiryParentStage $receiverJournal 2')) 'fixed child/readiness monotonic budgets charge new stage observations'
Assert-Expiry ((Get-ExpiryRemainingWaitMs 0 5000) -eq 5000) 'fresh sender budget has five-second maximum'
Assert-Expiry ((Get-ExpiryRemainingWaitMs 0.1 5000) -eq 4999) 'sub-millisecond observation work rounds upward against budget'
Assert-Expiry ((Get-ExpiryRemainingWaitMs 4999.1 5000) -eq 0) 'final fractional millisecond cannot extend sender budget'
Assert-Expiry ((Get-ExpiryRemainingWaitMs 5200 5000) -eq 0) 'exhausted observation budget remains a failure'
Assert-Expiry ((Get-ExpiryRemainingWaitMs 10 6000) -eq 5990) 'receiver observations are charged against original six-second budget'
$invalidBudgets=0;foreach($elapsed in @(-1,[double]::NaN,[double]::PositiveInfinity)){try{Get-ExpiryRemainingWaitMs $elapsed 5000|Out-Null}catch{$invalidBudgets++}}
Assert-Expiry ($invalidBudgets -eq 3) 'invalid elapsed measurements cannot produce an unbounded wait'
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$recordTest=Join-Path $fixture 'ExpiryRecordTests.exe'
$sources=@(Get-ChildItem (Join-Path $repo 'src/acoustics/host/Transport') -Filter '*.cs'|ForEach-Object FullName)+@(Join-Path $repo 'tests/host/ExpiryExperiment.cs')+@(Join-Path $repo 'tests/host/ExpiryStageJournal.cs')+@(Join-Path $repo 'tests/host/ExpiryRecordTests.cs')
& $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /define:TRANSPORT_EXPIRY_TEST /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll /main:ExpiryRecordTests ('/out:'+$recordTest) @sources
if($LASTEXITCODE -ne 0){throw 'Expiry record fixture build failed'}
& $recordTest
if($LASTEXITCODE -ne 0){throw 'Expiry record fixture failed'}
Write-Output ('Unsent expiry diagnostic fixtures passed: '+$script:checks+' checks; no transport or endpoint constructed')
