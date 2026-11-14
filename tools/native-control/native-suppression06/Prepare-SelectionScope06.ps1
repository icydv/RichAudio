#requires -Version 7.5
# Bind the committed candidate and adapt the existing exclusive installer/rollback.
param([Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedHead)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$root=Join-Path $repo '.local/native-suppression-01/candidate-06'
$old=Join-Path $repo '.local/native-suppression-01/candidate-05'
$run='C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-06'
function Need($ok,$why){if(!$ok){throw $why}}
function Sha($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Pin($p){$p=[IO.Path]::GetFullPath($p);[ordered]@{path=$p;bytes=(Get-Item -LiteralPath $p).Length;sha256=(Sha $p)}}
function Read($p){Get-Content -LiteralPath $p -Raw|ConvertFrom-Json -AsHashtable -DateKind String}
function WriteNew($p,$v){$b=[Text.UTF8Encoding]::new($false).GetBytes(($v|ConvertTo-Json -Depth 40));$f=[IO.File]::Open($p,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write);try{$f.Write($b,0,$b.Length)}finally{$f.Dispose()}}
Need (((& git -C $repo rev-parse HEAD).Trim())-ceq$ExpectedHead-and!@(& git -C $repo status --porcelain).Count) 'Committed clean source required'
Need (((& git -C $repo branch --show-current).Trim())-ceq'fix/native-idle-setup') 'Actual working branch required'
Need (!(Get-Process -Name GTA5_Enhanced,PlayGTAV,obs64,RAGEPluginHook -ErrorAction SilentlyContinue)) 'Offline preparation requires closed game/OBS'
Need (!(Test-Path -LiteralPath (Join-Path $root 'scope.json'))-and!(Test-Path -LiteralPath $run)) 'One fresh candidate06 scope and absent execution06 required'
$oldScope=Join-Path $old 'scope.json';Need ((Sha $oldScope)-ceq'f9d05b4ed18c7c9d8bb531ea5fb4c00e05542700d8bff27b027a18040544cbba') 'Historical scope drift'
$s=Read $oldScope
$buildPath=Join-Path $root 'probe/build.json';$resourcesPath=Join-Path $root 'resources-01/resources.json'
$controllerPath=Join-Path $repo '.local/native-suppression-06/controller-tests-final/result.json'
$sdkPath=Join-Path $repo '.local/native-suppression-06/sdk-argument-tests-final/result.json'
$resourceTestPath=Join-Path $repo '.local/native-suppression-06/resource-tests-final/result.json'
$inspectionPath=Join-Path $root 'compiled-inspection.json'
$b=Read $buildPath;$m=Read $resourcesPath;$ct=Read $controllerPath;$sdk=Read $sdkPath;$rt=Read $resourceTestPath;$il=Read $inspectionPath
Need ($b.sourceCommit-ceq$ExpectedHead-and$b.sourceClean-and$b.finalCandidate-and!$b.defaultEnabled-and!$b.installed-and!$b.gameLaunched) 'Own final disabled build required'
Need ($ct.passed-and$sdk.passed-and$rt.passed-and$il.passed-and$m.passed-and!$m.runtimeQualified) 'Final offline checks required'
foreach($f in $b.sources){Need ((Sha (Join-Path $repo $f.path))-ceq$f.sha256) 'Compiled source drift'}
foreach($receipt in @($ct,$sdk)){foreach($f in $receipt.artifacts){Need ((Sha $f.path)-ceq$f.sha256) 'Test artifact drift'}}
Need ($rt.manifest.sha256-ceq(Sha $resourcesPath)-and$il.candidateSha256-ceq$b.binary.sha256-and$b.dlc.sha256-ceq$m.dlc.sha256-and(Sha $b.binary.path)-ceq$b.binary.sha256-and(Sha $m.dlc.path)-ceq$m.dlc.sha256) 'Final artifact bindings differ'
Need ((Sha $m.builder.path)-ceq$m.builder.sha256-and(Sha (Join-Path $repo 'tools/native-control/native-suppression06/Test-SelectionControl06.ps1'))-ceq$rt.testSha256) 'Tested resource source drift'
$installation=Join-Path $root 'installation';$capture=Join-Path $root 'capture-settings'
[IO.Directory]::CreateDirectory($installation)|Out-Null;[IO.Directory]::CreateDirectory($capture)|Out-Null
$adaptations=@()
foreach($name in @('Install-Execution05.ps1','Restore-Execution.ps1')){
 $source=Join-Path $old ('installation/'+$name);$target=Join-Path $installation ($name.Replace('05','06'))
 $text=[IO.File]::ReadAllText($source);$adapted=$text.Replace('candidate-05','candidate-06').Replace('candidate05','candidate06').Replace('Candidate05','Candidate06').Replace('execution-05','execution-06').Replace('execution05','execution06').Replace('Execution05','Execution06').Replace('Live05','Live06').Replace('RichAudio.NativeSuppression01.dll','RichAudio.NativeSuppression06.dll').Replace('RichAudio.NativeSuppression01.ini','RichAudio.NativeSuppression06.ini').Replace('RichAudio.NativeSuppression01.Evidence','RichAudio.NativeSuppression06.Evidence')
 if($name.StartsWith('Install')){$adapted=$adapted.Replace('@($s.builds)+@($s.unchangedRootBinaryInventory)','@($s.builds)+@($s.originalResidentArchive)+@($s.unchangedRootBinaryInventory)')}
 Need (!(Test-Path -LiteralPath $target)) 'Prepared installer already exists'
 [IO.File]::WriteAllText($target,$adapted,[Text.UTF8Encoding]::new($false))
 $tokens=$null;$errors=$null;[Management.Automation.Language.Parser]::ParseFile($target,[ref]$tokens,[ref]$errors)|Out-Null;Need (!$errors.Count) 'Installer/rollback static parse'
 $adaptations+=@{source=(Pin $source);target=(Pin $target);changes='Candidate/execution/profile/probe basename substitutions; installer additionally checks originalResidentArchive; no installation executed'}
}
foreach($pair in @(@('basic.ini','basic.ini'),@('NativeSuppression01Live05.json','NativeSuppression01Live06.json'))){
 $source=Join-Path $old ('capture-settings/'+$pair[0]);$target=Join-Path $capture $pair[1]
 Need (!(Test-Path -LiteralPath $target)) 'Prepared capture file already exists'
 $text=[IO.File]::ReadAllText($source).Replace('NativeSuppression01Live05','NativeSuppression01Live06').Replace('execution-05','execution-06')
 [IO.File]::WriteAllText($target,$text,[Text.UTF8Encoding]::new($false));$adaptations+=@{source=(Pin $source);target=(Pin $target);changes='Only separate profile/collection and execution recording path'}
}
$enabled=Join-Path $root 'proposed-enabled.ini';[IO.File]::WriteAllText($enabled,"Enabled=true`r`n",[Text.UTF8Encoding]::new($false))
$s.sourceCommit=$ExpectedHead;$s.implementationCommit=$ExpectedHead;$s.sourceClean=$true;$s.authorized=$false;$s.executed=$false;$s.candidateName='candidate-06';$s.executionDirectory=$run
$s.summary='One stock self/positive/reset/private-stock-reference selection experiment on exact owned A; B unassigned; auxiliary horn getter; no deliberate suppression phase'
$s.procedure=Pin (Join-Path $repo 'docs/NATIVE_SUPPRESSION_06_PROCEDURE.md');$s.procedureAddendum=$s.procedure;$s.findings=Pin (Join-Path $repo 'docs/NATIVE_SUPPRESSION_06.md')
$priorRun='C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-05'
$s.priorExecution=@{scope=(Pin $oldScope);result=(Pin (Join-Path $priorRun 'RESULT.json'));cleanup=(Pin (Join-Path $priorRun 'cleanup-verification.json'));report=(Pin (Join-Path $repo 'docs/NATIVE_SUPPRESSION_05_EXECUTION.md'));meaning='Historical predefined D gate failed; private loading not proved to fail; prior approval consumed'}
$s.gameInstall[5].source=Pin $b.binary.path;$s.gameInstall[5].destination=$s.gameInstall[5].destination.Replace('NativeSuppression01','NativeSuppression06')
$s.gameInstall[6].source=Pin $enabled;$s.gameInstall[6].destination=$s.gameInstall[6].destination.Replace('NativeSuppression01','NativeSuppression06')
$s.gameInstall[7].source=Pin $m.dlc.path
foreach($i in 0..1){$s.capture.install[$i].destination=$s.capture.install[$i].destination.Replace('Live05','Live06')}
$s.capture.install[0].source=Pin (Join-Path $capture 'basic.ini');$s.capture.install[1].source=Pin (Join-Path $capture 'NativeSuppression01Live06.json')
$s.capture.arguments=@('--profile','NativeSuppression01Live06','--collection','NativeSuppression01Live06');$s.capture.recordingDirectory=Join-Path $run 'capture'
$s.sequence=@('stock baseline','BATI self-control','ADDER stock positive','BATI return','ra_ns06_adder_select','BATI final return')
$s.controllerTests=Pin $controllerPath;$s.deletionArgumentTests=Pin $sdkPath
$s.validationReuse=@{controllerOutput=(Pin (Join-Path (Split-Path $controllerPath) 'result.txt'));controllerCases=50;controllerAssertions=299;realSdkArgumentAssertions=24;nativeDispatchesBySdkTest=0;compiledInspection=(Pin $inspectionPath);runtimeQualified=$false}
$s.builds=@((Pin $buildPath),(Pin $resourcesPath),(Pin $resourceTestPath),(Pin $controllerPath),(Pin $sdkPath),(Pin $inspectionPath))
$s.originalResidentArchive=$m.resident
$s.resourceControls=@{manifest=(Pin $resourcesPath);validation=(Pin $resourceTestPath);privateName=$m.private.name;privateHash=$m.private.hash;stockPositive=$m.stockPositive;newRecords=1;newRelFiles=1;newWaveforms=0;oldDlcUnchanged=$m.oldDlc;historicalUnusedResourcesNotCallable=$true;runtimeQualified=$false}
$s.upstreamNativeDefinitions=Pin (Join-Path $repo '.local/native-suppression-06/upstream/definitions.json')
$s.selectionWitness=@{defaultHornGetterDecisive=$false;stockPositiveRequires='Attributed predicted ADDER engine/exhaust signature, not level-only change';privateRequires='Attributed matched ADDER engine/exhaust from reset Bati state OR distinct bus horn';whichWitnessMustBeRecorded=$true;effectiveProfileGetter=$false;fullGraphResolutionClaim=$false}
$s.phaseGates=@{self='Stable sustained BATI behavior';positive='Independent ADDER signature';reset='Normal same-A Bati before private phase';private='Predicted stock-reference signature; generic change/stock similarity insufficient';final='Observed same-A BATI return or explicitly uncertain containment outcome';missingEvidence='Terminal stop and one permitted release; no later diagnostic'}
$s.release=@{normal='Intermediate and final BATI in fixed list';terminal='F9; one allowed known-BATI release if needed on verified A';retryAllowed=$false;arbitraryPriorOverrideRecovery=$false;outcomeRequiredBeforeDeletion=$true;uncertainOutcomeCommand='Ctrl+Shift+F2';independentRecoveryQualified=$false}
$s.measurement=@{mode='Fixed transition/steady/horn windows, full-spectrum and listening review';getterAuxiliaryOnly=$true;mixedRmsDescriptiveOnly=$true;gainChangeAllowed=$false;retimingAllowed=$false;alternateTakeAllowed=$false;suppressionVerdictAllowed=$false;manualEvidenceAttestationNotAutomaticClassification=$true}
$s.capture.windowSelection=@{durationSeconds=10;steadyOffsetSeconds=5;transitionOffsetSeconds=0;hornOffsetSeconds=0;physicalHornInput='Between cue+2 and cue+5';phaseAnchor='First return by phase index; BATI names repeat';baseline='First baseline-idle-anchor';terminal='First BATI restore returned';B='First designated B snapshot; +5 baseline/post or +0 stability';extraSnapshots='Never replace anchors';finalization='Exact used PCM and timestamps; distinguish mutable finalized header and incomplete unused live tails'}
$s.proceduralTiming=@{minimumActiveSecondsBeforeDiagnosticArm=100;minimumActiveSecondsAtDiagnosticDispatch=100;terminalReleaseByActiveSecond=525;controllerDeadlineSeconds=600;callbackProgressRequired=$true;automaticPhaseAdvance=$false}
$s.runtimeFailurePolicy='Stop diagnostics; one permitted known-BATI release if needed on exact surviving A; record normal or uncertain same-A outcome; retire only after outcome; normal exit and exact disk rollback; no retry or forced termination'
$s.exclusions=@('No deliberate suppression, silent C, marker B1, historical D/S1/S2/S3 assignments','No second launch, pair, reload, unknown-name request, phase retry or B profile','No A engine setter, repeated B start, NPC driver or automatic restart','No new hook, memory scan or broader framework access','No new waveform or change to old candidate resources','No forced termination, crash recovery or arbitrary prior profile recovery','No push, merge, tag, release or successor experiment')
$s.installation.installerScript=Pin (Join-Path $installation 'Install-Execution06.ps1');$s.installation.rollbackScript=Pin (Join-Path $installation 'Restore-Execution.ps1');$s.installation.executionDirectory=$run
$s.installation.approvalReceiptSchema='NativeSuppression01Candidate06Approval';$s.installation.freshPreflightSchema='NativeSuppression01Candidate06FreshLivePreflight';$s.installation.authorization='Fresh explicit approval of this exact scope hash and presence required; no live authority from preparation'
$s.installation.requiredAbsentDirectories=@($s.installation.requiredAbsentDirectories|ForEach-Object {$_.Replace('Live05','Live06')})
$s.installation.additionalRequiredAbsent=@($s.installation.additionalRequiredAbsent|ForEach-Object {$_.Replace('execution-05','execution-06').Replace('Live05','Live06').Replace('NativeSuppression01.Evidence','NativeSuppression06.Evidence')})
$s.requiredAbsentDirectories=$s.installation.requiredAbsentDirectories;$s.additionalRequiredAbsent=$s.installation.additionalRequiredAbsent
foreach($key in @('readme','preparationReview')){$null=$s.installation.Remove($key)}
$adapt=Join-Path $root 'adaptation.json';WriteNew $adapt @{schema='NativeSuppression06PreparationAdaptation';passed=$true;files=$adaptations;gameWrites=$false;obsWrites=$false;installationExecuted=$false;approvalCreated=$false}
$s.installation.adaptation=Pin $adapt;$s.capture.adaptationReceipt=Pin $adapt
$originals=@($s.capture.originalSettingsToBackup)+@($s.logBackupsRequired|Where-Object exists|ForEach-Object original)
foreach($p in $originals){Need ((Sha $p.path)-ceq$p.sha256) ('Current original drift '+$p.path)}
foreach($p in @($s.gameInstall.destination)+@($s.capture.install.destination)+@($s.installation.requiredAbsentDirectories)+@($s.installation.additionalRequiredAbsent)){Need (!(Test-Path -LiteralPath $p)) ('Required absent '+$p)}
$inventory=@(Get-ChildItem (Split-Path $s.game.path) -File -Force|Where-Object Extension -in '.dll','.asi'|ForEach-Object FullName|Sort-Object)
Need (!@(Compare-Object ($s.unchangedRootBinaryInventory.path|Sort-Object) $inventory).Count) 'Current root binary inventory'
foreach($p in $s.unchangedRootBinaryInventory){Need ((Sha $p.path)-ceq$p.sha256) 'Current root binary bytes'}
$s.offlineOriginalsReview=@{basis=(Pin (Join-Path $priorRun 'cleanup-verification.json'));currentSettingsAndLogsRechecked=$true;currentRootBinarySetAndBytesRechecked=$true;isFreshLivePreflight=$false;postApprovalPreflightStillRequired=$true}
$s.assembly=@{script=(Pin $PSCommandPath);sourceHead=$ExpectedHead;sourceClean=$true;previousScope=(Pin $oldScope);scopeIsAuthorization=$false;freshPostApprovalPreflightStillRequired=$true}
WriteNew (Join-Path $root 'scope.json') $s
@{scopePath=(Join-Path $root 'scope.json');sha256=(Sha (Join-Path $root 'scope.json'));sourceCommit=$ExpectedHead;installed=$false;gameLaunched=$false}|ConvertTo-Json
