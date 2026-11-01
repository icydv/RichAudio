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
function New-FixtureReceiver {
 [pscustomobject]@{accepted=2;rejected=0;connections=1;diagnostic=[pscustomobject]@{Received=2;StartupDiscarded=0;Stage='connection';Code='sender-stop';Outcome='deliberate-stop';FirstFrame=[pscustomobject]@{DecisionAgeMs=42;AgeClass='within-bounds';DecodeMs=30};FirstAcceptedFrame=[pscustomobject]@{DecisionAgeMs=42;AgeClass='within-bounds'}}}
}
function New-FixtureSender {
 [pscustomobject]@{sent=2;attempts=1;transmitted=2;expiredAfter=0;firstExpired=$null;diagnostic=[pscustomobject]@{Transmitted=2;Stage='connection';Code='sender-stop';Outcome='deliberate-stop';FirstFrame=[pscustomobject]@{EncodeMs=31;AgeBeforeWriteMs=40};FirstAcceptedFrame=[pscustomobject]@{EncodeMs=31;AgeBeforeWriteMs=40}}}
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
$sender=New-FixtureSender;$sender.diagnostic.Outcome='failed';$sender.expiredAfter=1;$sender.firstExpired=[pscustomobject]@{AgeMs=350;Stage='after-encoding-before-write'}
$late=New-ExpiryDiagnostic 'late' $false (New-FixtureRead $receiver) (New-FixtureRead $sender) $execution
Assert-Expiry $late.Passed 'original late deadline and controlled expiry accepted'
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
$execution=New-FixtureExecution;$execution.PrimaryTerminal=[pscustomobject]@{Code='sender-start-failed';ExceptionType='Win32Exception'}
$execution.Sender=Get-ExpiryProcessState $null
$execution.CleanupErrors=@([pscustomobject]@{Role='receiver';Code='kill-failed';ExceptionType='Win32Exception'})
$missingDiagnostic=New-ExpiryDiagnostic 'domain-1' $false $missing $malformed $execution
$missingJson=Write-ExpiryDiagnostic $missingDiagnostic (Join-Path $fixture 'sanitized')
Assert-Expiry (!$missingDiagnostic.Passed -and $missingDiagnostic.FailedPredicates -contains 'receiver.record.parsed' -and $missingDiagnostic.FailedPredicates -contains 'sender.record.parsed') 'missing and malformed records still produce diagnostic'
Assert-Expiry ($missingDiagnostic.FailedPredicates -contains 'sender.process.started') 'missing child produces process predicate'
Assert-Expiry ($missingDiagnostic.Execution.PrimaryTerminal.Code -eq 'sender-start-failed' -and $missingDiagnostic.Execution.CleanupErrors[0].Code -eq 'kill-failed') 'primary failure and cleanup failure retained separately'
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
Assert-Expiry ($safeJson -notmatch $privateMarker -and $safeJson -notmatch 'ObservationTicks|ClockFrequency":|ExceptionMessage|privateBytes|capability|session|pipe') 'whitelist excludes private identity and payload'
Assert-Expiry ($hostileDiagnostic.Receiver.Transport.Stage -eq 'unrecognized' -and $null -eq $hostileDiagnostic.Receiver.accepted) 'unrecognized values are not echoed'
Assert-Expiry ([Text.Encoding]::UTF8.GetByteCount($safeJson) -le 16384 -and [Text.Encoding]::UTF8.GetByteCount($missingJson) -le 16384) 'serialized diagnostic output bounded'
$cleanupSender=New-FixtureSender
$cleanupSender|Add-Member -NotePropertyName harnessFailure -NotePropertyValue ([pscustomobject]@{stage='sender-stop-wait';code='sender-lifetime';exceptionType='TimeoutException'})
$cleanupSender|Add-Member -NotePropertyName cleanupFailures -NotePropertyValue @([pscustomobject]@{stage='appdomain-unload';code='fixture-cleanup-failed';exceptionType='CannotUnloadAppDomainException';message=$privateMarker})
$cleanupDiagnostic=New-ExpiryDiagnostic 'domain-1' $false (New-FixtureRead (New-FixtureReceiver)) (New-FixtureRead $cleanupSender) (New-FixtureExecution)
Assert-Expiry ($cleanupDiagnostic.Sender.HarnessFailure.Code -eq 'sender-lifetime' -and $cleanupDiagnostic.Sender.CleanupFailures[0].Stage -eq 'appdomain-unload') 'native primary and cleanup records retained separately'
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

$scriptText=[IO.File]::ReadAllText((Join-Path $repo 'tools/Test-UnsentExpiry.ps1'))
$scriptTokens=$null;$parseErrors=$null
[void][Management.Automation.Language.Parser]::ParseInput($scriptText,[ref]$scriptTokens,[ref]$parseErrors)
Assert-Expiry ($parseErrors.Count -eq 0) 'expiry script parses'
Assert-Expiry ($scriptText.Contains('$sender.WaitForExit(5000)') -and $scriptText.Contains('$receiver.WaitForExit(6000)') -and $scriptText.Contains('$w.ElapsedMilliseconds -lt 2000')) 'child and readiness deadlines unchanged'
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$recordTest=Join-Path $fixture 'ExpiryRecordTests.exe'
$sources=@(Get-ChildItem (Join-Path $repo 'src/acoustics/host/Transport') -Filter '*.cs'|ForEach-Object FullName)+@(Join-Path $repo 'tests/host/ExpiryExperiment.cs')+@(Join-Path $repo 'tests/host/ExpiryRecordTests.cs')
& $compiler /nologo /optimize+ /warnaserror+ /platform:x64 /define:TRANSPORT_EXPIRY_TEST /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll /main:ExpiryRecordTests ('/out:'+$recordTest) @sources
if($LASTEXITCODE -ne 0){throw 'Expiry record fixture build failed'}
& $recordTest
if($LASTEXITCODE -ne 0){throw 'Expiry record fixture failed'}
Write-Output ('Unsent expiry diagnostic fixtures passed: '+$script:checks+' checks; no transport or endpoint constructed')
