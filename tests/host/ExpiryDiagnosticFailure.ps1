param([ValidateSet('composite-failure','missing-receiver','missing-both')][string]$Case,[string]$Output)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../../tools/expiry/Diagnostics.ps1')
[IO.Directory]::CreateDirectory($Output)|Out-Null
$rx=Join-Path $Output 'receiver.json';$tx=Join-Path $Output 'sender.json'
if($Case-eq'composite-failure'){@{accepted=0;rejected=1;connections=1;coordinates=@(123,456);endpoint='DO-NOT-RETAIN';diagnostic=@{Stage='freshness';Code='invalid-age';Outcome='failed';FirstFrame=@{DecisionAgeMs=-3.25;AgeClass='too-new';MaximumAgeMs=250;MinimumAgeMs=-2};OffendingFrame=@{FrameOrdinal=2;DecisionAgeMs=-3.25;AgeClass='too-new'}}}|ConvertTo-Json -Depth 5|Set-Content $rx}
if($Case-ne'missing-both'){@{sent=0;attempts=1;expiredBefore=0;expiredAfter=1;firstExpired=@{AgeMs=351;BeforeEncodeAgeMs=1;EncodeMs=350;Sequence=0;Stage='after-encode'};diagnostic=@{Stage='ack';Code='deadline';Outcome='failed'};privatePath='DO-NOT-RETAIN'}|ConvertTo-Json -Depth 5|Set-Content $tx}
$life=@{ReceiverStarted=$true;SenderStarted=($Case-ne'missing-both');ReceiverExited=$true;SenderExited=($Case-ne'missing-both');ReceiverExitCode=1;SenderExitCode=0;ReceiverKillRequested=$false;SenderKillRequested=$false;ElapsedMs=123;FailureStage=$(if($Case-eq'missing-both'){'receiver-readiness'}else{$null})}
$r=Write-ExpiryDiagnostic -Case $Case -Mode none -Baseline $false -ReceiverPath $rx -SenderPath $tx -Directory (Join-Path $Output 'diagnostics') -Lifecycle $life -Synthetic $true
if(!$r.passed){throw 'Deliberate diagnostic fixture failure'}
throw 'Fixture unexpectedly passed'
