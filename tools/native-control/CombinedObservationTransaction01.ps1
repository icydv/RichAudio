# Shared one-file transaction for the reviewed session; no launcher or installed-root discovery.
# The coordinator must supply the reviewed roots, exact payload, and process/preflight checks.
#requires -Version 7.0
param()
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../playable/Setup.ps1') -FunctionsOnly
. (Join-Path $PSScriptRoot '../menu02-recovery/Restoration.ps1')
$script:CombinedTarget01='Plugins/RichAudio.dll'

function Install-CombinedObservation01 {
 param([string]$GameRoot,[string]$Transaction,[string]$Candidate,[string]$CandidateSHA256,[string]$OriginalSHA256,
  [long]$OriginalBytes,[scriptblock]$ProcessClosure,[scriptblock]$AssertReviewedPreflight)
 Assert-Menu02Closure $ProcessClosure
 if((& $AssertReviewedPreflight) -cne $true){throw 'Exact reviewed startup and installation preflight required'}
 $target=Safe-Path $GameRoot $script:CombinedTarget01
 if($CandidateSHA256-cnotmatch'^[a-f0-9]{64}$'-or(Digest $Candidate)-cne$CandidateSHA256-or
  $OriginalSHA256-cnotmatch'^[a-f0-9]{64}$'-or$OriginalBytes-le0-or
  !(Test-Path -LiteralPath $target -PathType Leaf)-or(Get-Item -LiteralPath $target).Length-ne$OriginalBytes){throw 'Unreviewed target or payload'}
 $prior=Get-Menu02RestoreFileState $target
 if($prior.sha256-cne$OriginalSHA256){throw 'Original RichAudio.dll drift'}
 Assert-Menu02UnlinkedPath $Transaction
 if(Test-Path -LiteralPath $Transaction){throw 'Observation transaction already consumed'}
 $originalRoot=Join-Path $Transaction 'original'
 [IO.Directory]::CreateDirectory($originalRoot)|Out-Null
 $backup=Join-Path $originalRoot 'RichAudio.dll'
 [IO.File]::Copy($target,$backup,$false)
 if((Digest $backup)-cne$OriginalSHA256){throw 'Backup pin differs'}
 $candidateBytes=(Get-Item -LiteralPath $Candidate).Length
 $change=[ordered]@{target=$target;backup=$backup;expectedOriginalExists=$true;expectedOriginalSha256=$OriginalSHA256;
  expectedOriginalBytes=$OriginalBytes;proposedSha256=$CandidateSHA256;proposedBytes=$candidateBytes;
  originalMetadata=$prior.metadata;expectedDeployedMetadata=$null}
 $setup=Join-Path $Transaction 'setup.json'
 $record=@{complete=$false;files=@($change)}
 Write-Json $setup $record
 try{
  Assert-Menu02Closure $ProcessClosure
  if((Digest $target)-cne$OriginalSHA256){throw 'Original changed before staging'}
  Invoke-InstallTransaction $GameRoot $Transaction @(@{relative=$script:CombinedTarget01;source=$Candidate}) `
   @(@{relative=$script:CombinedTarget01;backup='original/RichAudio.dll';sha256=$OriginalSHA256}) $setup $record
  $now=Get-Menu02RestoreFileState $target
  if(!$now.exists-or$now.sha256-cne$CandidateSHA256-or$now.bytes-ne$candidateBytes-or$now.metadata.sddl-cne$prior.metadata.sddl){throw 'Deployment verification failed'}
  $change.expectedDeployedMetadata=$now.metadata
  Write-Json (Join-Path $Transaction 'deployed.json') $change
 }catch{
  $failure=$_
  Invoke-Menu02Restoration -Changes @($change) -AllowedRoot $GameRoot -AllowedTargets @($target) -BackupRoot $originalRoot `
   -ReceiptPath (Join-Path $Transaction 'staging-failure-restoration.json') -AssertProcessClosure $ProcessClosure
  throw $failure
 }
}

function Restore-CombinedObservation01 {
 param([string]$GameRoot,[string]$Transaction,[string]$CandidateSHA256,[scriptblock]$ProcessClosure)
 Assert-Menu02Closure $ProcessClosure
 $target=Safe-Path $GameRoot $script:CombinedTarget01
 $originalRoot=Join-Path $Transaction 'original'
 $change=Get-Content -LiteralPath (Join-Path $Transaction 'deployed.json') -Raw|ConvertFrom-Json
 if($change.target-cne$target-or$change.backup-cne(Join-Path $originalRoot 'RichAudio.dll')-or$change.proposedSha256-cne$CandidateSHA256){
  throw 'Deployment receipt is for another target or payload'
 }
 Invoke-Menu02Restoration -Changes @($change) -AllowedRoot $GameRoot -AllowedTargets @($target) -BackupRoot $originalRoot `
  -ReceiptPath (Join-Path $Transaction 'restored.json') -AssertProcessClosure $ProcessClosure
}
