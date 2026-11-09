# Shared qualification transaction. The caller supplies the approved baseline,
# exact payload pins and process-closure checks. Dot-sourcing never deploys.
#requires -Version 7.0
. (Join-Path $PSScriptRoot 'Setup.ps1') -FunctionsOnly
. (Join-Path $PSScriptRoot '../menu02-recovery/Restoration.ps1')

function Write-QualificationNewJson01([string]$Path,$Value){
 $bytes=[Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Depth 24))
 $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
 try{$stream.Write($bytes);$stream.Flush($true)}finally{$stream.Dispose()}
}

# This is the Phase 1 coordinator's staging entry. The reader performs
# current checks against the reviewed anchors on every invocation.
function Install-Phase1Qualification01 {
 param([string]$GameRoot,[string]$Transaction,[object[]]$Plan,
  [scriptblock]$ProcessClosure,[scriptblock]$ReadProtectedBaseline)
 $baselineFile=Join-Path $Transaction 'baseline.json'
 $baselinePin=@{sha256=$null}
 $acquire={
  $snapshot=@(& $ReadProtectedBaseline)
  if($snapshot.Count -ne 1 -or $null -eq $snapshot[0]){throw 'Expected one protected baseline snapshot'}
  Write-QualificationNewJson01 $baselineFile $snapshot[0]
  $baselinePin.sha256=Digest $baselineFile
  return $true
 }
 $revalidate={
  Assert-Menu02UnlinkedPath $baselineFile
  if(!$baselinePin.sha256 -or (Digest $baselineFile) -cne $baselinePin.sha256){throw 'Acquired baseline receipt identity differs'}
  $held=Get-Content -LiteralPath $baselineFile -Raw | ConvertFrom-Json -DateKind String
  $current=@(& $ReadProtectedBaseline)
  if($current.Count -ne 1 -or (Digest $baselineFile) -cne $baselinePin.sha256 -or
     ($held|ConvertTo-Json -Depth 24 -Compress) -cne ($current[0]|ConvertTo-Json -Depth 24 -Compress)){
   throw 'Protected baseline drift between checks'
  }
  return $true
 }
 Install-Qualification01 -GameRoot $GameRoot -Transaction $Transaction -Kind phase1 -Pack '' -Plan $Plan `
  -ProcessClosure $ProcessClosure -AcquireBaseline $acquire -RevalidateBaseline $revalidate
}

function Get-QualificationTargets01([string]$Kind,[string]$Pack){
 if($Kind -ceq 'soundmap-view' -and !$Pack){
  return @('Plugins/RichAudio.dll','Plugins/RichAudio.Menu.json')
 }
 if($Kind -ceq 'phase1'){
  return @('Plugins/RichAudio.dll','Plugins/RichAudio.Playable.json','Plugins/RichAudio.Menu.json','Plugins/RichAudio.WorldWarmup.json')
 }
 if($Kind -ceq 'marker-a' -and $Pack -cmatch '^raprobe_[a-f0-9]{8}$'){
  return @('Plugins/RichAudio.dll','mods/update/update.rpf',"mods/update/x64/dlcpacks/$Pack/dlc.rpf")
 }
 throw 'Unknown qualification transaction type'
}

function Install-Qualification01 {
 param([string]$GameRoot,[string]$Transaction,[string]$Kind,[string]$Pack,[object[]]$Plan,
  [Parameter(Mandatory)][scriptblock]$ProcessClosure,[Parameter(Mandatory)][scriptblock]$AcquireBaseline,
  [Parameter(Mandatory)][scriptblock]$RevalidateBaseline,[scriptblock]$RollbackProcessClosure)
 $ErrorActionPreference='Stop'
 $rollbackClosure=if($RollbackProcessClosure){$RollbackProcessClosure}else{$ProcessClosure}
 $allowed=@(Get-QualificationTargets01 $Kind $Pack)
 if($Plan.Count -ne $allowed.Count -or @($Plan.relative|Sort-Object -Unique).Count -ne $allowed.Count -or
    @($Plan.relative|Where-Object {$_ -cnotin $allowed}).Count){throw 'Exact qualification target population required'}
 Assert-Menu02Closure $ProcessClosure
 Assert-Menu02UnlinkedPath $Transaction
 if(Test-Path -LiteralPath $Transaction){throw 'Transaction already consumed'}
 [IO.Directory]::CreateDirectory($Transaction)|Out-Null
 Write-QualificationNewJson01 (Join-Path $Transaction 'claim.json') @{kind=$Kind;claimedUtc=[DateTime]::UtcNow}
 $backupRoot=Join-Path $Transaction 'original'
 $changes=@();$rollback=@();$index=0;$created=@()
 $changed=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
 try{
  if((& $AcquireBaseline) -cne $true){throw 'Current protected baseline did not qualify'}
  [IO.Directory]::CreateDirectory($backupRoot)|Out-Null
  $markerDirectories=@()
  if($Kind -ceq 'marker-a'){
   $markerDirectories=@('mods','mods/update','mods/update/x64','mods/update/x64/dlcpacks',"mods/update/x64/dlcpacks/$Pack"|ForEach-Object {Safe-Path $GameRoot $_})
   if(Test-Path -LiteralPath $markerDirectories[-1]){throw 'Expected absent private pack directory'}
  }
  $absentDirectories=@($markerDirectories|Where-Object {!(Test-Path -LiteralPath $_ -PathType Container)})
  $targetStates=@{}
  foreach($p in $Plan){
   $target=Safe-Path $GameRoot $p.relative
   if((Split-Path -Parent $target) -cnotin $absentDirectories -and !(Test-Path -LiteralPath (Split-Path -Parent $target) -PathType Container)){
    throw 'Unexpected qualification destination directory'
   }
   Assert-Menu02UnlinkedPath $p.source
   if((Get-Item -LiteralPath $p.source).Length -ne $p.bytes -or (Digest $p.source) -cne $p.sha256){throw 'Payload pin differs'}
   $old=Get-Menu02RestoreFileState $target
   if($p.originalExists -isnot [bool] -or $old.exists -ne $p.originalExists -or
      ($old.exists -and ($old.sha256 -cne $p.originalSha256 -or $old.bytes -ne $p.originalBytes))){throw 'Current target differs from approved baseline'}
   $targetStates[$target]=$old
   $saved='original/'+($index++).ToString()+'.original'
   $backup=Join-Path $Transaction $saved
   if($old.exists){
    [IO.File]::Copy($target,$backup,$false)
    if((Digest $backup) -cne $old.sha256 -or (Get-Item -LiteralPath $backup).Length -ne $old.bytes){throw 'Backup differs'}
   }
   $changes+=@{target=$target;backup=$backup;expectedOriginalExists=$old.exists
    expectedOriginalSha256=$old.sha256;expectedOriginalBytes=$old.bytes;originalMetadata=$old.metadata
    proposedSha256=$p.sha256;proposedBytes=$p.bytes;expectedDeployedMetadata=$null}
   $rollback+=@{relative=$p.relative;backup=$(if($old.exists){$saved}else{$null});sha256=$old.sha256}
  }
  $setup=Join-Path $Transaction 'setup.json'
  Write-Json (Join-Path $Transaction 'intent.json') @{kind=$Kind;pack=$Pack;files=$changes;absentDirectories=$absentDirectories}
  Assert-Menu02Closure $ProcessClosure
  if((& $RevalidateBaseline) -cne $true){throw 'Protected baseline drift before staging'}
  Assert-Menu02Closure $ProcessClosure
  foreach($directory in $absentDirectories){
   $null=New-Item -Path $directory -ItemType Directory -ErrorAction Stop
   $created+=$directory
  }
  $copy={
   param($from,$to)
   if($RollbackProcessClosure){Assert-Menu02Closure $ProcessClosure}
   try{
    Copy-Item -LiteralPath $from -Destination $to -Force -ErrorAction Stop
    [void]$changed.Add($to)
   }catch{
    $copyFailure=$_
    # A failed copy can leave partial content. Uncertain writes take the
    # restoration route. A demonstrably untouched target is left alone.
    try{
     $before=$targetStates[$to];$after=Get-Menu02RestoreFileState $to
     if($before.exists -ne $after.exists -or $before.sha256 -cne $after.sha256 -or
        $before.bytes -ne $after.bytes -or
        ($before.metadata|ConvertTo-Json -Compress) -cne ($after.metadata|ConvertTo-Json -Compress)){
      [void]$changed.Add($to)
     }
    }catch{[void]$changed.Add($to)}
    throw $copyFailure
   }
  }
  Invoke-InstallTransaction $GameRoot $Transaction $Plan $rollback $setup @{complete=$false;files=$changes} `
   $copy {Assert-Menu02Closure $rollbackClosure} {param($target) $changed.Contains($target)}
  foreach($c in $changes){
   $found=Get-Menu02RestoreFileState $c.target
   if($found.sha256 -cne $c.proposedSha256 -or $found.bytes -ne $c.proposedBytes -or
      ($c.expectedOriginalExists -and $found.metadata.sddl -cne $c.originalMetadata.sddl)){throw 'Deployed identity differs'}
   $c.expectedDeployedMetadata=$found.metadata
  }
  Write-Json (Join-Path $Transaction 'deployed.json') @{kind=$Kind;pack=$Pack;files=$changes;createdDirectories=$created}
 }catch{
  $failure=$_
  $result=@{error=$failure.Exception.Message;changedTargets=@($changed|ForEach-Object {$_});createdDirectories=$created
   restorationRequired=($changed.Count -gt 0 -or $created.Count -gt 0);independentBaselineVerified=$false}
  try{
   if($result.restorationRequired){
    $restore=@{Changes=$changes;AllowedRoot=$GameRoot;AllowedTargets=@($changes.target);BackupRoot=$backupRoot
     ReceiptPath=(Join-Path $Transaction 'staging-failure-restoration.json');AssertProcessClosure=$rollbackClosure}
    $null=Invoke-Menu02Restoration @restore
    Remove-QualificationDirectories01 $created
   }
   Assert-Menu02Closure $(if($result.restorationRequired){$rollbackClosure}else{$ProcessClosure})
   $result.independentBaselineVerified=((& $RevalidateBaseline) -ceq $true)
  }catch{$result.verificationError=$_.Exception.Message}
  Write-QualificationNewJson01 (Join-Path $Transaction 'staging-failure.json') $result
  throw $failure
 }
}

function Restore-Qualification01 {
 param([string]$GameRoot,[string]$Transaction,[string]$Kind,[string]$Pack,[object[]]$Plan,
  [scriptblock]$ProcessClosure,[scriptblock]$AssertRestoredBaseline)
 $ErrorActionPreference='Stop'
 Assert-Menu02Closure $ProcessClosure
 $allowed=@(Get-QualificationTargets01 $Kind $Pack|ForEach-Object {Safe-Path $GameRoot $_})
 $receipt=Read-Json (Join-Path $Transaction 'deployed.json')
 if($receipt.kind -cne $Kind -or $receipt.pack -cne $Pack -or $Plan.Count -ne $allowed.Count -or $receipt.files.Count -ne $allowed.Count){throw 'Different qualification transaction'}
 for($i=0;$i -lt $Plan.Count;$i++){
  $p=$Plan[$i];$c=$receipt.files[$i]
  if($c.target -cne (Safe-Path $GameRoot $p.relative) -or $c.backup -cne (Join-Path $Transaction "original/$i.original") -or
     $c.proposedSha256 -cne $p.sha256 -or $c.proposedBytes -ne $p.bytes -or $c.expectedOriginalExists -ne $p.originalExists -or
     $c.expectedOriginalSha256 -cne $p.originalSha256 -or $c.expectedOriginalBytes -ne $p.originalBytes){throw 'Deployment receipt pins differ'}
 }
 $restore=@{Changes=$receipt.files;AllowedRoot=$GameRoot;AllowedTargets=$allowed;BackupRoot=(Join-Path $Transaction 'original')
  ReceiptPath=(Join-Path $Transaction 'restored.json');AssertProcessClosure=$ProcessClosure}
 $null=Invoke-Menu02Restoration @restore
 if($Kind -ceq 'marker-a'){
  $possible=@('mods','mods/update','mods/update/x64','mods/update/x64/dlcpacks',"mods/update/x64/dlcpacks/$Pack"|ForEach-Object {Safe-Path $GameRoot $_})
  $intent=Read-Json (Join-Path $Transaction 'intent.json')
  $created=@($receipt.createdDirectories)
  if(($created -join '|') -cne ($intent.absentDirectories -join '|') -or
     @($created|Where-Object {$_ -cnotin $possible}).Count){throw 'Owned marker directories differ from transaction intent'}
  Remove-QualificationDirectories01 $created
 }
 if((& $AssertRestoredBaseline) -cne $true){throw 'Independent restored baseline failed'}
 Write-Json (Join-Path $Transaction 'independent-baseline.json') @{verified=$true;kind=$Kind}
}

function Remove-QualificationDirectories01([object[]]$Directories){
 for($i=$Directories.Count-1;$i -ge 0;$i--){
  $directory=$Directories[$i]
  if(!(Test-Path -LiteralPath $directory)){continue}
  Assert-Menu02UnlinkedPath $directory
  if(@(Get-ChildItem -LiteralPath $directory -Force).Count){throw 'Owned marker directory contains unexpected files'}
  [IO.Directory]::Delete($directory,$false)
 }
}
