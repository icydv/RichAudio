#requires -Version 7.5
[CmdletBinding()]
param(
 [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{64}$')][string]$ScopeSha256,
 [Parameter(Mandatory)][string]$ApprovalReceiptPath,
 [Parameter(Mandatory)][string]$FreshPreflightReceiptPath,
 [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{64}$')][string]$FreshPreflightSha256
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$repo='C:\Users\Libby\Documents\RichAudio-NativeSuppressionFixes'
$scopePath=Join-Path $repo '.local\native-suppression-01\candidate-07\scope.json'
$run='C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-07'
$game='D:\Games\steamapps\common\Grand Theft Auto V Enhanced'
$obs='C:\Users\Libby\AppData\Roaming\obs-studio'
function Pin([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function NoLinks([string]$p){
 if(![IO.Path]::IsPathFullyQualified($p)){throw "Absolute path required: $p"}
 $full=[IO.Path]::GetFullPath($p)
 for($at=$full;$at;$at=[IO.Path]::GetDirectoryName($at)){
  if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw "Reparse path: $full"}
 }
 return $full
}
function Inside([string]$p,[string]$root){
 $full=NoLinks $p
 if(!$full.StartsWith(([IO.Path]::GetFullPath($root).TrimEnd('\')+'\'),[StringComparison]::OrdinalIgnoreCase)){throw "Outside expected root: $full"}
 return $full
}
function CheckPin($f){
 $null=NoLinks $f.path
 if($f.sha256-notmatch'^[0-9a-f]{64}$'-or(Get-Item -LiteralPath $f.path).Length-ne$f.bytes-or(Pin $f.path)-cne$f.sha256){throw "Pinned file drift: $($f.path)"}
}
function RequireTrue($value,[string]$name){if($value-isnot[bool]-or!$value){throw "Required true receipt field: $name"}}
function UtcTime($value,[string]$name){
 if($value-isnot[string]-or$value-notmatch'Z$'){throw "UTC timestamp required: $name"}
 return [DateTimeOffset]::Parse($value,[Globalization.CultureInfo]::InvariantCulture)
}
$null=NoLinks $scopePath
if((Pin $scopePath)-cne$ScopeSha256){throw 'Approved scope hash differs'}
$s=Get-Content -LiteralPath $scopePath -Raw|ConvertFrom-Json -DateKind String
if($s.schema-cne'RichAudioNativeSuppression01Scope'-or$s.candidateName-cne'candidate-07'-or$s.repository-cne$repo-or$s.authorized-isnot[bool]-or$s.authorized-ne$false-or$s.executed-isnot[bool]-or$s.executed-ne$false-or$s.gameLaunches-ne1-or!$s.offlineStoryModeOnly-or$s.installation.executionDirectory-cne$run){throw 'Candidate07 scope identity or offline proposal state differs'}
RequireTrue $s.sourceClean 'scope sourceClean'
CheckPin $s.installation.installerScript
CheckPin $s.installation.rollbackScript
if([IO.Path]::GetFullPath($s.installation.installerScript.path)-cne[IO.Path]::GetFullPath($PSCommandPath)){throw 'Installer is not the scope-pinned script'}
$rollbackTemplate=Inside $s.installation.rollbackScript.path (Join-Path $repo '.local\native-suppression-01\candidate-07\installation')
$ApprovalReceiptPath=NoLinks $ApprovalReceiptPath
$FreshPreflightReceiptPath=NoLinks $FreshPreflightReceiptPath
$approvalPin=Pin $ApprovalReceiptPath
$a=Get-Content -LiteralPath $ApprovalReceiptPath -Raw|ConvertFrom-Json -DateKind String
if($a.schema-cne'NativeSuppression01Candidate07Approval'-or$a.candidate-cne'candidate-07'-or$a.scopeSha256-cne$ScopeSha256-or$a.sourceCommit-cne$s.sourceCommit-or[string]::IsNullOrWhiteSpace($a.userApprovalText)){throw 'Explicit candidate07 approval receipt missing or mismatched'}
RequireTrue $a.userPresentConfirmed 'userPresentConfirmed'; RequireTrue $a.oneRunApproved 'oneRunApproved'
$approvalUtc=UtcTime $a.approvedUtc 'approvedUtc'
if((Pin $FreshPreflightReceiptPath)-cne$FreshPreflightSha256){throw 'Fresh preflight hash differs'}
$p=Get-Content -LiteralPath $FreshPreflightReceiptPath -Raw|ConvertFrom-Json -DateKind String
if($p.schema-cne'NativeSuppression01Candidate07FreshLivePreflight'-or$p.candidate-cne'candidate-07'-or$p.scopeSha256-cne$ScopeSha256-or$p.sourceCommit-cne$s.sourceCommit){throw 'Fresh preflight identity differs'}
RequireTrue $p.passed 'passed'; RequireTrue $p.sourceClean 'sourceClean'
if($p.processes-isnot[array]-or$p.inventoryDiff-isnot[array]-or$p.verifiedAbsent-isnot[array]-or$p.checkedIdentities-isnot[array]-or$p.processes.Count-or$p.inventoryDiff.Count){throw 'Fresh preflight collections missing or not clear'}
$preflightUtc=UtcTime $p.utc 'utc'
$now=[DateTimeOffset]::UtcNow
if($approvalUtc-gt$preflightUtc-or$preflightUtc-gt$now.AddMinutes(1)-or($now-$preflightUtc).TotalMinutes-gt15){throw 'Preflight must follow approval and be no more than 15 minutes old'}
$head=(& git -C $repo rev-parse HEAD).Trim(); if($LASTEXITCODE){throw 'Git identity unavailable'}
$dirty=@(& git -C $repo status --porcelain); if($LASTEXITCODE-or$head-cne$s.sourceCommit-or$dirty.Count){throw 'Source drift'}
if(Get-Process -Name GTA5_Enhanced,PlayGTAV,obs64,RAGEPluginHook -ErrorAction SilentlyContinue){throw 'Game or recorder active'}
$null=Inside $run 'C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01'
if(Test-Path -LiteralPath $run){throw 'Execution07 directory already exists; approval cannot be reused'}
$expectedGame=@('ScriptHookVDotNet.asi','ScriptHookVDotNet2.dll','ScriptHookVDotNet3.dll','MinHook.x64.dll','ScriptHookVDotNet.ini','scripts\RichAudio.NativeSuppression07.dll','scripts\RichAudio.NativeSuppression07.ini','mods\update\x64\dlcpacks\ra_ns01_8b7e24c1\dlc.rpf','mods\update\update.rpf')|ForEach-Object{Join-Path $game $_}
$expectedObs=@((Join-Path $obs 'basic\profiles\NativeSuppression01Live07\basic.ini'),(Join-Path $obs 'basic\scenes\NativeSuppression01Live07.json'))
$install=@($s.gameInstall)+@($s.capture.install)
if(@($s.gameInstall).Count-ne9-or@($s.capture.install).Count-ne2-or@(Compare-Object ($expectedGame+$expectedObs|Sort-Object) (@($install.destination)|Sort-Object)).Count){throw 'Installation must contain exactly the reviewed nine game and two Live07 OBS files'}
if($s.capture.recordingDirectory-cne(Join-Path $run 'capture')-or$s.parkAndRestore.path-cne(Join-Path $game 'TrainerV.asi')){throw 'Capture or Trainer path differs'}
$requiredAbsent=@($expectedGame)+@($expectedObs)+@((Join-Path $game 'scripts'),(Join-Path $game 'mods'),(Join-Path $obs 'basic\profiles\NativeSuppression01Live07'),(Join-Path $obs 'basic\scenes\NativeSuppression01Live07.json.bak'),$run)+@($s.installation.requiredAbsentDirectories)+@($s.installation.additionalRequiredAbsent)
foreach($l in $s.logBackupsRequired){if(!$l.exists){$requiredAbsent+=@($l.path)}}
foreach($path in $requiredAbsent){$null=NoLinks $path;if((Test-Path -LiteralPath $path)-or$path-notin$p.verifiedAbsent){throw "Required absent path differs from preflight: $path"}}
foreach($f in $install){
 $root=if($f.destination-in$expectedGame){$game}else{$obs};$null=Inside $f.destination $root
 if($f.requiredAbsent-ne$true){throw 'Every install destination must require absence'}
 CheckPin $f.source
}
$expectedOriginals=@((Join-Path $obs 'user.ini'),(Join-Path $obs 'global.ini'))
if(@(Compare-Object ($expectedOriginals|Sort-Object) (@($s.capture.originalSettingsToBackup.path)|Sort-Object)).Count){throw 'OBS original settings set differs'}
$logNames=@('asiloader.log','ScriptHookV.log','OpenRPF.log','ScriptHookVDotNet.log')|ForEach-Object{Join-Path $game $_}
if(@($s.logBackupsRequired).Count-ne4-or@(Compare-Object ($logNames|Sort-Object) (@($s.logBackupsRequired.path)|Sort-Object)).Count){throw 'Log backup plan differs'}
foreach($l in $s.logBackupsRequired){$null=Inside $l.path $game;if($l.exists-and$l.original.path-cne$l.path){throw 'Log original path differs'}}
$settingsRoot='C:\Users\Libby\Documents\Rockstar Games\GTAV Enhanced'
if(@($s.gameSettingsBackups).Count-ne3){throw 'Exactly three original game settings backups required'}
foreach($f in $s.gameSettingsBackups){
 $null=Inside $f.path $settingsRoot
 $relative=[IO.Path]::GetRelativePath($settingsRoot,$f.path)
 if($relative-cne'settings.xml'-and$relative-notmatch'^Profiles\\[0-9A-Fa-f]{8}\\(cfg\.dat|pc_settings\.bin)$'){throw 'Unapproved game settings path'}
}
$originals=@($s.capture.originalSettingsToBackup)+@($s.gameSettingsBackups)+@($s.logBackupsRequired|Where-Object exists|ForEach-Object original)
$extra=@($s.operator.executionFiles)
if($extra.Count-ne2-or@(Compare-Object @('Recorder07.lua','operator-plan.json') @($extra.name)).Count){throw 'Only the sealed local recorder and operator plan may be retained for execution'}
foreach($f in $extra){CheckPin $f.source}
$requiredPins=@($s.game,$s.capture.executable,$s.parkAndRestore,$s.originalBaseArchive,$s.originalGranularArchive,$s.installation.installerScript,$s.installation.rollbackScript,$s.procedureAddendum,$s.registrationProcedure)+@($s.builds)+@($s.originalResidentArchive)+@($s.unchangedRootBinaryInventory)+@($originals)+@($install|ForEach-Object source)+@($extra|ForEach-Object source)
foreach($f in $requiredPins){
 CheckPin $f
 $match=@($p.checkedIdentities|Where-Object {$_.path-ceq$f.path-and$_.sha256-ceq$f.sha256-and$_.bytes-eq$f.bytes})
 if($match.Count-ne1){throw "Fresh preflight lacks unique exact pin: $($f.path)"}
}
$currentRootBinaries=@(Get-ChildItem -LiteralPath $game -File -Force|Where-Object {$_.Extension-in@('.dll','.asi')}|ForEach-Object FullName|Sort-Object)
if(@(Compare-Object (@($s.unchangedRootBinaryInventory.path)|Sort-Object) $currentRootBinaries).Count){throw 'Current root DLL/ASI set differs from the reviewed inventory'}
# All gates above are read-only. The rollback template is retained before any
# game/OBS mutation. This does not launch the game or manufacture approval.
if(([DateTimeOffset]::UtcNow-$preflightUtc).TotalMinutes-gt15){throw 'Fresh preflight expired during file checks'}
if(Get-Process -Name GTA5_Enhanced,PlayGTAV,obs64,RAGEPluginHook -ErrorAction SilentlyContinue){throw 'Game or recorder became active'}
[IO.Directory]::CreateDirectory($run)|Out-Null
[IO.File]::Copy($rollbackTemplate,(Join-Path $run 'Restore-Execution.ps1'),$false)
if((Pin (Join-Path $run 'Restore-Execution.ps1'))-cne$s.installation.rollbackScript.sha256){throw 'Retained rollback mismatch; no game/OBS mutation started'}
[IO.Directory]::CreateDirectory((Join-Path $run 'backups'))|Out-Null
[IO.Directory]::CreateDirectory((Join-Path $run 'capture'))|Out-Null
[IO.File]::Copy($scopePath,(Join-Path $run 'scope.json'),$false)
[IO.File]::Copy($ApprovalReceiptPath,(Join-Path $run 'approval.json'),$false)
[IO.File]::Copy($FreshPreflightReceiptPath,(Join-Path $run 'preflight.json'),$false)
if((Pin (Join-Path $run 'scope.json'))-cne$ScopeSha256-or(Pin (Join-Path $run 'approval.json'))-cne$approvalPin-or(Pin (Join-Path $run 'preflight.json'))-cne$FreshPreflightSha256){throw 'Retained input mismatch; no game/OBS mutation started'}
foreach($f in $extra){
 $target=Inside (Join-Path $run $f.name) $run
 [IO.File]::Copy($f.source.path,$target,$false)
 if((Pin $target)-cne$f.source.sha256){throw 'Sealed local operator input changed'}
}
$t=[ordered]@{schema='NativeSuppression01Execution';candidate='candidate-07';startedUtc=[DateTime]::UtcNow.ToString('o');sourceCommit=$s.sourceCommit;scopeSha256=$ScopeSha256;authorizationSha256=$approvalPin;preflightSha256=$FreshPreflightSha256;status='installing';gameLaunchRequested=$false;silentPhaseAuthorized=$false;backups=@();createdDirectories=@();files=@();trainer=$null}
$ledger=Join-Path $run 'transaction.json'
function SaveLedger{$t|ConvertTo-Json -Depth 15|Set-Content -LiteralPath $ledger -Encoding utf8}
SaveLedger
try{
 $i=0
 foreach($f in $originals){
  CheckPin $f;$item=Get-Item -LiteralPath $f.path
  $backup=Join-Path $run ('backups\{0:D2}-{1}'-f$i,$item.Name)
  [IO.File]::Copy($f.path,$backup,$false)
  if((Pin $backup)-cne$f.sha256-or(Pin $f.path)-cne$f.sha256){throw 'Backup mismatch'}
  $t.backups+=@{path=$f.path;backup=$backup;sha256=$f.sha256;bytes=$item.Length;creationUtc=$item.CreationTimeUtc.ToString('o');lastWriteUtc=$item.LastWriteTimeUtc.ToString('o');attributes=[int]$item.Attributes};$i++;SaveLedger
 }
 foreach($f in $install){
  $root=if($f.destination-in$expectedGame){$game}else{$obs};$null=Inside $f.destination $root
  $pending=[Collections.Generic.List[string]]::new();$parent=[IO.Path]::GetDirectoryName($f.destination)
  while(!(Test-Path -LiteralPath $parent)){$null=Inside $parent $root;$pending.Add($parent);$parent=[IO.Path]::GetDirectoryName($parent)}
  for($i=$pending.Count-1;$i-ge0;$i--){$dir=$pending[$i];$t.createdDirectories+=@($dir);SaveLedger;[IO.Directory]::CreateDirectory($dir)|Out-Null}
  $entry=@{source=$f.source.path;destination=$f.destination;sha256=$f.source.sha256;bytes=$f.source.bytes;state='copy-pending'}
  $t.files+=@($entry);SaveLedger
  [IO.File]::Copy($f.source.path,$f.destination,$false)
  if((Pin $f.destination)-cne$f.source.sha256){throw 'Installed bytes mismatch'}
  $entry.state='installed-verified';SaveLedger
 }
 # Trainer is the last mutation, after every installed file is verified.
 CheckPin $s.parkAndRestore
 $item=Get-Item -LiteralPath $s.parkAndRestore.path
 $parked=Inside (Join-Path $run 'backups\TrainerV.asi') $run
 if(Test-Path -LiteralPath $parked){throw 'Trainer backup destination exists'}
 $t.trainer=@{original=$item.FullName;parked=$parked;sha256=$s.parkAndRestore.sha256;creationUtc=$item.CreationTimeUtc.ToString('o');lastWriteUtc=$item.LastWriteTimeUtc.ToString('o');attributes=[int]$item.Attributes;state='park-pending'};SaveLedger
 Move-Item -LiteralPath $item.FullName -Destination $parked
 if((Pin $parked)-cne$s.parkAndRestore.sha256){throw 'Parked Trainer mismatch'}
 $t.trainer.state='parked-verified';$t.status='installed-verified';$t.installedUtc=[DateTime]::UtcNow.ToString('o');SaveLedger
}catch{
 $failure=$_
 $t.status='installation-failed-requires-ledger-rollback'
 try{SaveLedger}catch{Write-Warning 'Ledger status update failed; retain the last ledger and inspect each copy-pending/park-pending path.'}
 Write-Warning 'Do not launch or retry installation. Complete the already-authorized rollback from transaction.json: inspect each pending destination, retain mismatches, remove only verified candidate copies, restore verified original backups/Trainer and metadata, then remove only recorded empty created directories. The full-install restore script is not a partial-install recovery tool.'
 throw $failure
}
'Candidate07 installation verified; originals backed up; no launch requested.'
