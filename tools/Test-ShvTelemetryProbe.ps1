#requires -Version 7.0
[CmdletBinding()]
param(
 [string]$BuildReceipt='',
 [string]$OutputRoot='',
 [ValidateRange(3,30)][int]$CaseTimeoutSeconds=10
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(!$BuildReceipt){$BuildReceipt=Join-Path $repo 'build/playable-04-shv-probe/build-receipt.json'}
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-04/shv-fixture-'+[guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot)
$allowed=@((Join-Path $repo '.local'),(Join-Path $repo 'build')) | ForEach-Object {[IO.Path]::GetFullPath($_).TrimEnd('\')+'\'}
if(!@($allowed | Where-Object {$output.StartsWith($_,[StringComparison]::OrdinalIgnoreCase)}).Count -or (Test-Path -LiteralPath $output)){throw 'New isolated fixture output under this repository .local or build is required.'}
for($part=Split-Path -Parent $output;$part;$part=Split-Path -Parent $part){if((Test-Path -LiteralPath $part) -and ((Get-Item -LiteralPath $part -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output path is not permitted.'}}
$receipt=Get-Content -LiteralPath $BuildReceipt -Raw | ConvertFrom-Json
$candidate=(Get-Item -LiteralPath $receipt.Candidate.Path).FullName
$candidateHash=(Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
if($candidateHash -ne $receipt.Candidate.Sha256.ToLowerInvariant()){throw 'Actual production ASI differs from the reviewed build receipt.'}
$compiler=(Get-Item -LiteralPath $receipt.Toolchain.Compiler).FullName
$includes=@($receipt.Toolchain.IncludeDirs | ForEach-Object {'/I'+[string]$_})
$libraries=@($receipt.Toolchain.LibraryDirs | ForEach-Object {'/LIBPATH:'+ [string]$_})
if(!$includes.Count -or !$libraries.Count){throw 'Reviewed compiler include and library directories are required.'}
[IO.Directory]::CreateDirectory($output) | Out-Null
$fixture=Join-Path $output 'ScriptHookV.dll';$fixtureHost=Join-Path $output 'ShvProbe.FixtureHost.exe'
$originalLocation=Get-Location
try {
 Set-Location -LiteralPath $output
 & $compiler /nologo /O2 /W4 /WX /EHsc /std:c++17 /MT /LD @includes (Join-Path $repo 'tests/shv-probe/Fixture.cpp') ('/Fo'+(Join-Path $output 'Fixture.obj')) ('/Fe'+$fixture) /link @libraries /INCREMENTAL:NO /DYNAMICBASE /NXCOMPAT kernel32.lib
 if($LASTEXITCODE -ne 0){throw 'Device-free SHV fixture compilation failed.'}
 & $compiler /nologo /O2 /W4 /WX /EHsc /std:c++17 /MT @includes (Join-Path $repo 'tests/shv-probe/Host.cpp') ('/Fo'+(Join-Path $output 'Host.obj')) ('/Fe'+$fixtureHost) /link @libraries /INCREMENTAL:NO /DYNAMICBASE /NXCOMPAT bcrypt.lib kernel32.lib
 if($LASTEXITCODE -ne 0){throw 'Device-free host compilation failed.'}
} finally {Set-Location -LiteralPath $originalLocation}
$fixtureHash=(Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash.ToLowerInvariant()
$hostHash=(Get-FileHash -LiteralPath $fixtureHost -Algorithm SHA256).Hash.ToLowerInvariant()
$copiedCandidate=Join-Path $output 'RichAudio.OperatingState.Shv.asi'
Copy-Item -LiteralPath $candidate -Destination $copiedCandidate
if((Get-FileHash -LiteralPath $copiedCandidate -Algorithm SHA256).Hash.ToLowerInvariant() -ne $candidateHash){throw 'Copied ASI differs.'}
$cases=@(
 @{Name='finite';Target=1;Class='finite-unvalidated';Bits=[Convert]::ToUInt32('3f000000',16);Float=.5;Terminal='completed-unvalidated'},
 @{Name='zero';Target=1;Class='zero';Bits=0;Float=0;Terminal='completed-unvalidated'},
 @{Name='nan';Target=1;Class='nonfinite';Bits=[Convert]::ToUInt32('7fc12345',16);NullFloat=$true;Terminal='completed-unvalidated'},
 @{Name='infinity';Target=1;Class='nonfinite';Bits=[Convert]::ToUInt32('7f800000',16);NullFloat=$true;Terminal='completed-unvalidated'},
 @{Name='out_of_range';Target=1;Class='out-of-plausible-range';Bits=[Convert]::ToUInt32('42480000',16);Float=50;Terminal='completed-unvalidated'},
 @{Name='null_pointer';Target=1;Class='null';Terminal='target-null';Pointer=$false},
 @{Name='wrong_model';Target=0;Class='not-attempted';Terminal='deadline-before-target';Timeout=500},
 @{Name='passenger';Target=0;Class='not-attempted';Terminal='deadline-before-target';Timeout=500},
 @{Name='online';Target=0;Class='not-attempted';Terminal='online-context';Timeout=500},
 @{Name='no_vehicle';Target=0;Class='not-attempted';Terminal='deadline-before-target';Timeout=500},
 @{Name='changed_context';Target=0;Class='not-attempted';Terminal='context-changed';Armed=$true},
 @{Name='context_seh';Target=0;Class='not-attempted';Terminal='precondition-seh';Exception=[Convert]::ToUInt32('e0420004',16)},
 @{Name='target_seh';Target=1;Class='seh';Terminal='target-seh';Pointer=$false;Exception=[Convert]::ToUInt32('e0420005',16)},
 @{Name='delayed_target';Target=1;Terminal=@('deadline-during-target-returned','watchdog-native-outcome-unobserved');Timeout=200}
)
$script:checks=0
function Check([bool]$Value,[string]$Message){$script:checks++;if(!$Value){throw $Message}}
$results=@()
foreach($case in $cases){
 $caseRoot=Join-Path $output ('case-'+$case.Name);[IO.Directory]::CreateDirectory($caseRoot)|Out-Null
 $start=[Diagnostics.ProcessStartInfo]::new($fixtureHost);$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.WorkingDirectory=$output;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 foreach($argument in @($case.Name,$fixtureHash,$candidateHash,$caseRoot)){$start.ArgumentList.Add([string]$argument)}
 $start.Environment['RICHAUDIO_SHV_PROBE_TIMEOUT_MS']=if($case.Timeout){[string]$case.Timeout}else{'2000'}
 $child=[Diagnostics.Process]::new();$child.StartInfo=$start;$clock=[Diagnostics.Stopwatch]::StartNew()
 try {
  if(!$child.Start()){throw 'Owned fixture host failed to start.'}
  $stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
  if(!$child.WaitForExit($CaseTimeoutSeconds*1000)){
   # Stop this exact owned test host only; no process-name or game cleanup.
   try{$child.Kill();$child.WaitForExit(2000)|Out-Null}catch{}
   throw ('Owned device-free host exceeded its parent deadline: '+$case.Name)
  }
  $out=$stdout.GetAwaiter().GetResult();$err=$stderr.GetAwaiter().GetResult()
  [IO.File]::WriteAllText((Join-Path $caseRoot 'host.stdout.txt'),$out)
  [IO.File]::WriteAllText((Join-Path $caseRoot 'host.stderr.txt'),$err)
  Check ($child.ExitCode -eq 0) ('Fixture host failed '+$case.Name+': '+$err)
 } finally {$clock.Stop();$child.Dispose()}
 $metrics=Get-Content -LiteralPath (Join-Path $caseRoot 'fixture-metrics.json') -Raw | ConvertFrom-Json
 Check ($metrics.fixture -and !$metrics.actualShvExecuted -and $metrics.fixturePathAndHashVerified -and $metrics.candidateHashVerified) ('Fixture identity not proved: '+$case.Name)
 Check ($metrics.registerCalls -eq 1 -and $metrics.callbackInvocations -eq 2) ('Actual ASI registration/reentry guard failed: '+$case.Name)
 Check ($metrics.targetCalls -eq $case.Target) ('Target invocation count differs: '+$case.Name)
 Check ($metrics.armedJournalSeenBeforeTarget -eq $case.Target) ('Armed journal was not present before the target call: '+$case.Name)
 Check ($metrics.callsAfterTarget -eq 0 -and $metrics.contextViolations -eq 0 -and $metrics.unexpectedNativeCalls -eq 0 -and $metrics.argumentViolations -eq 0) ('Native context/argument/storage boundary failed: '+$case.Name)
 Check ($metrics.nativeCalls -le 200) ('Unbounded precondition acquisition: '+$case.Name)
 $captureFiles=@(Get-ChildItem -LiteralPath (Join-Path $caseRoot 'RichAudio/ShvProbe') -Recurse -File -Filter 'capture.json')
 $journalFiles=@(Get-ChildItem -LiteralPath (Join-Path $caseRoot 'RichAudio/ShvProbe') -Recurse -File -Filter 'journal.ndjson')
 Check ($captureFiles.Count -eq 1 -and $journalFiles.Count -eq 1) ('One bounded capture/journal required: '+$case.Name)
 Check (($captureFiles[0].Length+$journalFiles[0].Length) -le 16384) ('Capture volume exceeds declared16KiB bound: '+$case.Name)
 $raw=Get-Content -LiteralPath $captureFiles[0].FullName -Raw;$capture=$raw | ConvertFrom-Json
 Check ($capture.schema -eq 1 -and $capture.measuredRPM -eq $false -and $capture.providerValid -eq $false) ('Fixture must not promote an RPM/provider claim: '+$case.Name)
 Check ($capture.targetAttempts -eq $case.Target -and $capture.terminalReason -in @($case.Terminal)) ('Actual source terminal/count evidence differs: '+$case.Name+' '+$raw)
 if($case.Name -eq 'delayed_target'){
  Check ($capture.deadlineReached -eq $true -and $capture.targetAttempts -eq 1 -and ($capture.producerCompleted -eq $true -or ($capture.classification -eq 'outcome-unobserved' -and $null -eq $capture.rawBits -and $null -eq $capture.rawFloat))) 'An unobserved attempted target must retain one attempt and explicit unknown/null result evidence.'
 }
 if($case.ContainsKey('Class')){Check ($capture.classification -eq $case.Class) ('Raw result classification differs: '+$case.Name+' '+$raw)}
 if($case.ContainsKey('Bits')){Check ([uint32]$capture.rawBits -eq [uint32]$case.Bits) ('Raw float bit pattern changed: '+$case.Name)}
 if($case.ContainsKey('Float')){Check ([double]$capture.rawFloat -eq [double]$case.Float) ('Raw float value changed: '+$case.Name)}
 if($case.NullFloat){Check ($null -eq $capture.rawFloat) ('Nonfinite must serialize as null plus raw bits: '+$case.Name)}
 if($case.ContainsKey('Exception')){Check ([uint32]$capture.exceptionCode -eq $case.Exception) ('Structured exception evidence was lost: '+$case.Name)}
 if($case.ContainsKey('Pointer')){Check ($capture.resultPointerPresent -eq $case.Pointer) ('Pointer presence differs: '+$case.Name)}
 elseif($case.ContainsKey('Bits')){Check ($capture.resultPointerPresent -eq $true) ('Returned result storage not reported: '+$case.Name)}
 Check ($raw -notmatch '"(?:pointerAddress|resultPointerAddress|memoryAddress|address)"\s*:') ('Raw pointer/address leaked: '+$case.Name)
 $lines=@(Get-Content -LiteralPath $journalFiles[0].FullName | Where-Object {$_})
 Check ($lines.Count -le 32) ('Journal record count unbounded: '+$case.Name)
 foreach($line in $lines){$null=$line | ConvertFrom-Json}
 Check ((($lines -join "`n").Contains('armed-not-proof-of-invocation')) -eq ($case.Target -gt 0 -or $case.Armed)) ('Durable armed boundary differs from target eligibility: '+$case.Name)
 $results+=[ordered]@{case=$case.Name;targetCalls=$metrics.targetCalls;nativeCalls=$metrics.nativeCalls;callbackInvocations=$metrics.callbackInvocations;terminalReason=$capture.terminalReason;classification=$capture.classification;producerCompleted=$capture.producerCompleted;deadlineReached=$capture.deadlineReached;rawBits=$capture.rawBits;captureBytes=$captureFiles[0].Length;journalBytes=$journalFiles[0].Length;elapsedMilliseconds=$clock.ElapsedMilliseconds;fixture=$true;actualShvExecuted=$false;endpointOpened=$false}
}
$report=[ordered]@{schema=1;scope='Actual production ASI lifecycle against an isolated ABI-compatible SHV fixture; no real SHV/native/game/audio execution';candidateSha256=$candidateHash;fixtureSha256=$fixtureHash;hostSha256=$hostHash;checks=$script:checks;cases=$results;passed=$results.Count;actualShvExecuted=$false;gameStarted=$false;gameFilesWritten=$false;endpointOpened=$false;liveProviderEstablished=$false;limits='Fixture callbacks are not actual SHV fibers. The watchdog cannot preempt a stalled native, and DLL hot-unload is deliberately unsupported.'}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $output 'fixture-result.json') -Encoding utf8
Write-Output ('PASS '+$script:checks+' assertions across '+$results.Count+' actual-ASI ABI fixture cases; no real SHV, game or audio. '+(Join-Path $output 'fixture-result.json'))
