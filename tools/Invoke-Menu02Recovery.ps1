#requires -Version 7.0
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$ManifestPath,
 [Parameter(Mandatory)][string]$ExpectedManifestSha256,
 [ValidateSet('Preview','Deploy','Supervise','Launch','Rollback')][string]$Mode='Preview',
 [switch]$FreshApproval
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
function HashFile($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Unlinked($p){
 if(![IO.Path]::IsPathFullyQualified($p)-or$p.StartsWith('\\')){throw 'Fully qualified local path required'}
 for($at=[IO.Path]::GetFullPath($p);$at;$at=[IO.Path]::GetDirectoryName($at)){
  $item=$null
  try{$item=Get-Item -LiteralPath $at -Force -ErrorAction Stop}catch{if($_.CategoryInfo.Category-ne[Management.Automation.ErrorCategory]::ObjectNotFound){throw}}
  if($null-ne$item-and($item.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked recovery path refused'}
 }
}
function WriteNewJson($path,$value){
 Unlinked $path;$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($value|ConvertTo-Json -Depth 15))
 $stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
function AssertClosed {
 if(@(Get-Process -Name @('GTA5_Enhanced','GTA5','RAGEPluginHook','RichAudio.Acoustics.Host','RichAudio.AcousticGpu') -ErrorAction SilentlyContinue).Count){throw 'Relevant runtime remains active; no file mutation allowed'}
 return $true
}
function CheckPin($pin){
 Unlinked $pin.path;$exists=Test-Path -LiteralPath $pin.path
 if($exists-ne[bool]$pin.exists){throw ('Protected path existence mismatch: '+$pin.role)}
 if($exists){
  if(!(Test-Path -LiteralPath $pin.path -PathType Leaf)){throw 'Protected regular file required'}
  if((Get-Item -LiteralPath $pin.path).Length-ne$pin.bytes-or(HashFile $pin.path)-cne$pin.sha256){throw ('Protected fingerprint mismatch: '+$pin.role)}
 }
}
function CheckAll($pins){foreach($pin in $pins){CheckPin $pin}}
if($ExpectedManifestSha256-notmatch'\A[a-f0-9]{64}\z'){throw 'Externally reviewed manifest hash required'}
Unlinked $ManifestPath
if((HashFile $ManifestPath)-cne$ExpectedManifestSha256){throw 'Reviewed manifest identity differs'}
$m=Get-Content -LiteralPath $ManifestPath -Raw|ConvertFrom-Json
$live=[IO.Path]::GetFullPath([string]$m.transaction.root)
Unlinked $live
if($m.kind-cne'Menu02RecoveryManifest'-or$m.schema-ne1-or$m.maximumAttempts-ne1-or$m.changes.Count-ne2-or$m.phaseExpectations.original.Count-ne13){throw 'Exact MENU-02 recovery manifest required'}
$privatePrefix=[IO.Path]::GetFullPath((Join-Path $repo '.local')).TrimEnd('\')+'\'
if(!$live.StartsWith($privatePrefix,[StringComparison]::OrdinalIgnoreCase)-or[IO.Path]::GetFileName($live)-cne'menu02-live-02'){throw 'New exact single-use transaction root required'}
$plugins=Join-Path $m.launch.workingDirectory 'Plugins'
$allowed=@((Join-Path $plugins 'RichAudio.dll'),(Join-Path $plugins 'RichAudio.Menu.json'))
if(@($m.changes|Where-Object{$_.target-notin$allowed}).Count-or@($m.changes.target|Select-Object -Unique).Count-ne2){throw 'Only exact two reviewed installed targets are permitted'}
foreach($pin in $m.helperSources){
 Unlinked $pin.path
 if(!$pin.path.StartsWith([IO.Path]::GetFullPath((Join-Path $repo 'tools'))+'\',[StringComparison]::OrdinalIgnoreCase)-or(HashFile $pin.path)-cne$pin.sha256){throw 'Reviewed recovery source differs'}
}
$launcher=@($m.helperSources|Where-Object role -eq 'launcher')
$restorer=@($m.helperSources|Where-Object role -eq 'restoration')
$self=@($m.helperSources|Where-Object role -eq 'coordinator')
$supervisor=@($m.helperSources|Where-Object role -eq 'supervision')
if($launcher.Count-ne1-or$restorer.Count-ne1-or$self.Count-ne1-or$supervisor.Count-ne1-or![string]::Equals($self[0].path,$PSCommandPath,[StringComparison]::OrdinalIgnoreCase)){throw 'Exact coordinator and helper identities required'}
$coordinatorManifestPath=$ManifestPath
$coordinatorManifestHash=$ExpectedManifestSha256
. $launcher[0].path -ManifestPath $coordinatorManifestPath -ExpectedManifestSha256 $coordinatorManifestHash -FunctionsOnly
. $restorer[0].path
. $supervisor[0].path
if($ManifestPath-cne$coordinatorManifestPath-or$ExpectedManifestSha256-cne$coordinatorManifestHash){throw 'Helper import changed externally pinned coordinator arguments'}
function CheckCandidate {
 foreach($c in $m.changes){Unlinked $c.source;if((HashFile $c.source)-cne$c.proposedSha256-or(Get-Item -LiteralPath $c.source).Length-ne$c.proposedBytes){throw 'Reviewed MENU-02 payload changed'}}
 Unlinked $m.isolatedPreferences.path
 if((HashFile $m.isolatedPreferences.path)-cne$m.isolatedPreferences.sha256){throw 'Initial isolated preferences changed'}
 $runtime=Split-Path -Parent (Split-Path -Parent $m.isolatedPreferences.path)
 foreach($relative in $m.isolatedPreferences.requiredAbsent){$p=Join-Path $runtime $relative;Unlinked $p;if(Test-Path -LiteralPath $p){throw 'Unexpected isolated service/status file'}}
}
if($Mode-eq'Preview'){
 CheckAll $m.phaseExpectations.original
 CheckCandidate
 $info=New-Menu02LaunchStartInfo -Manifest $m
 [pscustomobject]@{mode='preview';willDeploy=$false;willLaunch=$false;fileName=$info.FileName;workingDirectory=$info.WorkingDirectory;arguments=@();useShellExecute=$info.UseShellExecute;protectedChecks=13;candidateUnchanged=$true;freshApprovalRequired=$true}
 return
}
if($Mode-eq'Deploy'){
 if(!$FreshApproval){throw 'Current preparation is not deployment approval; require explicit fresh approval'}
 if(Test-Path -LiteralPath $live){throw 'Transaction already exists; no deployment/preflight retry'}
 $null=New-Item -ItemType Directory -Path $live -ErrorAction Stop
 WriteNewJson (Join-Path $live 'approval.json') ([ordered]@{schema=1;kind='Menu02RecoveryApproval';approved=$true;scope='one-temporary-deployment-one-launch-one-session-rollback';manifestSha256=$ExpectedManifestSha256;launches=1;atUtc=[DateTime]::UtcNow.ToString('o')})
 try{
  $null=AssertClosed
  CheckAll $m.phaseExpectations.original
  CheckCandidate
  $null=New-Menu02LaunchStartInfo -Manifest $m
  $backupRoot=Join-Path $live 'original';$null=New-Item -ItemType Directory -Path $backupRoot -ErrorAction Stop
  $restore=@()
  foreach($c in $m.changes){
   Unlinked $c.target;Unlinked $c.backup
   if(!$c.backup.StartsWith($backupRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Backup escaped new transaction'}
   $meta=Get-Menu02FileMetadata -Path $c.target
   [IO.File]::Copy($c.target,$c.backup,$false)
   if((HashFile $c.backup)-cne$c.expectedOriginalSha256-or(Get-Item -LiteralPath $c.backup).Length-ne$c.expectedOriginalBytes){throw 'Original byte backup verification failed'}
   $restore+=@([ordered]@{target=$c.target;backup=$c.backup;expectedOriginalExists=$true;expectedOriginalBytes=$c.expectedOriginalBytes;expectedOriginalSha256=$c.expectedOriginalSha256;proposedBytes=$c.proposedBytes;proposedSha256=$c.proposedSha256;originalMetadata=$meta})
  }
  WriteNewJson (Join-Path $live 'restoration-inputs.json') $restore
  WriteNewJson (Join-Path $live 'backups-verified.json') @{atUtc=[DateTime]::UtcNow.ToString('o');files=2;beforeAnyReplacement=$true;manifestSha256=$ExpectedManifestSha256;approvalReceiptSha256=(HashFile (Join-Path $live 'approval.json'));restorationInputsSha256=(HashFile (Join-Path $live 'restoration-inputs.json'))}
  $index=0
  foreach($c in $m.changes){
   $null=AssertClosed
   if((HashFile $c.target)-cne$c.expectedOriginalSha256){throw 'Target drift immediately before temporary replacement'}
   WriteNewJson (Join-Path $live ('write-intent-'+$index+'.json')) @{target=$c.target;atUtc=[DateTime]::UtcNow.ToString('o');manifestSha256=$ExpectedManifestSha256}
   [IO.File]::Copy($c.source,$c.target,$true)
   if((HashFile $c.target)-cne$c.proposedSha256){throw 'Temporary target hash differs'}
   $deployed=Get-Menu02FileMetadata -Path $c.target
   if($deployed.sddl-cne$restore[$index].originalMetadata.sddl){throw 'Destination access permissions changed'}
   WriteNewJson (Join-Path $live ('deployed-metadata-'+$index+'.json')) $deployed
   WriteNewJson (Join-Path $live ('write-complete-'+$index+'.json')) @{target=$c.target;sha256=$c.proposedSha256;manifestSha256=$ExpectedManifestSha256;deployedMetadataSha256=(HashFile (Join-Path $live ('deployed-metadata-'+$index+'.json')))}
   $index++
  }
  CheckAll $m.phaseExpectations.deployed
  WriteNewJson (Join-Path $live 'deployment-complete.json') @{schema=1;kind='Menu02RecoveryDeploymentComplete';manifestSha256=$ExpectedManifestSha256;approvalReceiptSha256=(HashFile (Join-Path $live 'approval.json'));complete=$true;restored=$false;atUtc=[DateTime]::UtcNow.ToString('o')}
  Write-Output 'PASS exact two-file deployment; launch remains a separate single-use phase.'
 }catch{WriteNewJson (Join-Path $live 'deployment-terminal-failure.json') @{atUtc=[DateTime]::UtcNow.ToString('o');manifestSha256=$ExpectedManifestSha256;message=$_.Exception.Message;retry=$false};throw}
 return
}
if($Mode-eq'Supervise'){
 Watch-Menu02Recovery -Manifest $m -ManifestPath $ManifestPath -ExpectedManifestSha256 $ExpectedManifestSha256
 return
}
if($Mode-eq'Launch'){
 try{
 if(!(Test-Path -LiteralPath (Join-Path $live 'approval.json'))-or!(Test-Path -LiteralPath (Join-Path $live 'deployment-complete.json'))){throw 'Fresh exact deployment and approval receipts are absent'}
 foreach($name in @('deployment-terminal-failure.json','restoration-started.json','restoration-result.json','restoration-complete.json','restoration-terminal-failure.json','test-terminal.json','launch-terminal-failure.json')){
  if(Test-Path -LiteralPath (Join-Path $live $name)){throw 'Terminal/restoration marker exists; no launch permitted'}
 }
 $null=AssertClosed
 CheckAll $m.phaseExpectations.deployed
 CheckCandidate
 $watch=Read-Menu02LaunchJson (Join-Path $live 'supervisor-ready.json')
 if($watch.schema-ne1-or$watch.kind-cne'Menu02RecoverySupervisorReady'-or$watch.manifestSha256-cne$ExpectedManifestSha256){throw 'Supervisor receipt identity differs'}
 $watchProcess=Get-Process -Id $watch.pid -ErrorAction Stop
 if($watchProcess.StartTime.ToUniversalTime().Ticks-ne(ConvertTo-Menu02Utc $watch.processCreationUtc).Ticks){throw 'Supervisor PID/start-time identity differs'}
 foreach($stop in @('deadline-expired.json','supervisor-terminal-failure.json','supervisor-complete.json','supervisor-stop.json')){if(Test-Path -LiteralPath (Join-Path $live $stop)){throw 'Supervisor stopped or deadline expired; no launch permitted'}}
 Invoke-Menu02LaunchOnce -ManifestPath $ManifestPath -ExpectedManifestSha256 $ExpectedManifestSha256 -DeploymentReceiptPath (Join-Path $live 'deployment-complete.json') -ApprovedReceiptPath (Join-Path $live 'approval.json') -Execute
 }catch{
  $failure=$_
  $approvalPath=Join-Path $live 'approval.json'
  $terminalPath=Join-Path $live 'launch-terminal-failure.json'
  if((Test-Path -LiteralPath $approvalPath)-and!(Test-Path -LiteralPath $terminalPath)){
   $ownedApproval=Read-Menu02LaunchJson $approvalPath
   if($ownedApproval.kind-ceq'Menu02RecoveryApproval'-and$ownedApproval.manifestSha256-ceq$ExpectedManifestSha256){WriteNewJson $terminalPath @{atUtc=[DateTime]::UtcNow.ToString('o');manifestSha256=$ExpectedManifestSha256;stage='launch-guard-or-start';message=$failure.Exception.Message;retry=$false}}
  }
  throw $failure
 }
 return
}
if($Mode-eq'Rollback'){
 $null=AssertClosed
 if(!(Test-Path -LiteralPath (Join-Path $live 'approval.json'))-or!(Test-Path -LiteralPath (Join-Path $live 'backups-verified.json'))){throw 'No exact owned transaction with verified originals'}
 if(Test-Path -LiteralPath (Join-Path $live 'restoration-started.json')){throw 'Restoration already attempted; do not retry consumed phase'}
 $approval=Read-Menu02LaunchJson (Join-Path $live 'approval.json')
 if($approval.schema-ne1-or$approval.kind-cne'Menu02RecoveryApproval'-or$approval.manifestSha256-cne$ExpectedManifestSha256-or$approval.approved-ne$true-or$approval.launches-ne1-or$approval.scope-cne'one-temporary-deployment-one-launch-one-session-rollback'){throw 'Rollback approval context differs'}
 $backups=Read-Menu02LaunchJson (Join-Path $live 'backups-verified.json')
 if($backups.manifestSha256-cne$ExpectedManifestSha256-or$backups.approvalReceiptSha256-cne(HashFile (Join-Path $live 'approval.json'))-or$backups.restorationInputsSha256-cne(HashFile (Join-Path $live 'restoration-inputs.json'))){throw 'Verified original backup context changed'}
 $restore=Get-Content -LiteralPath (Join-Path $live 'restoration-inputs.json') -Raw|ConvertFrom-Json
 if(@($restore).Count-ne2){throw 'Exact two original restoration records required'}
 $index=0
 foreach($r in $restore){
  $declared=@($m.changes|Where-Object target -eq $r.target)
  if($declared.Count-ne1-or$r.expectedOriginalExists-ne$true-or$r.backup-cne$declared[0].backup-or$r.expectedOriginalBytes-ne$declared[0].expectedOriginalBytes-or$r.expectedOriginalSha256-cne$declared[0].expectedOriginalSha256-or$r.proposedBytes-ne$declared[0].proposedBytes-or$r.proposedSha256-cne$declared[0].proposedSha256){throw 'Restoration record differs from approved target identities'}
  $metadataPath=Join-Path $live ('deployed-metadata-'+$index+'.json')
  $completedPath=Join-Path $live ('write-complete-'+$index+'.json')
  if(Test-Path -LiteralPath $completedPath){
   $completed=Read-Menu02LaunchJson $completedPath
   if($completed.target-cne$r.target-or$completed.sha256-cne$r.proposedSha256-or$completed.manifestSha256-cne$ExpectedManifestSha256-or$completed.deployedMetadataSha256-cne(HashFile $metadataPath)){throw 'Completed deployment metadata differs'}
   $r|Add-Member -NotePropertyName expectedDeployedMetadata -NotePropertyValue (Read-Menu02LaunchJson $metadataPath)
  }
  $index++
 }
 WriteNewJson (Join-Path $live 'restoration-started.json') @{manifestSha256=$ExpectedManifestSha256;atUtc=[DateTime]::UtcNow.ToString('o');helperSha256=$restorer[0].sha256}
 try{
  $result=Invoke-Menu02Restoration -Changes $restore -AllowedRoot $plugins -AllowedTargets $allowed -BackupRoot (Join-Path $live 'original') -ReceiptPath (Join-Path $live 'restoration-result.json') -AssertProcessClosure {AssertClosed}
  CheckAll $m.phaseExpectations.original
  WriteNewJson (Join-Path $live 'restoration-complete.json') @{schema=1;kind='Menu02RecoveryRestorationComplete';atUtc=[DateTime]::UtcNow.ToString('o');manifestSha256=$ExpectedManifestSha256;approvalReceiptSha256=(HashFile (Join-Path $live 'approval.json'));restorationStartedSha256=(HashFile (Join-Path $live 'restoration-started.json'));restorationResultSha256=(HashFile (Join-Path $live 'restoration-result.json'));all13OriginalsPass=$true;twoOriginalsRestored=$true;independentVerificationStillRequired=$true}
  $result
 }catch{WriteNewJson (Join-Path $live 'restoration-terminal-failure.json') @{atUtc=[DateTime]::UtcNow.ToString('o');manifestSha256=$ExpectedManifestSha256;message=$_.Exception.Message;retry=$false};throw}
}
