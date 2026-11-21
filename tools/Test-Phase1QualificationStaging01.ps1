#requires -Version 7.0
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'playable/QualificationTransaction01.ps1')
$root=Join-Path (Split-Path -Parent $PSScriptRoot) ('.local/phase1-staging-fixture-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$results=@()
foreach($scenario in @('success','protected-drift','process-drift','pre-copy-failure','partial-copy')){
 $scope=Join-Path $root $scenario
 $game=Join-Path $scope 'fixture-game'
 [IO.Directory]::CreateDirectory((Join-Path $game 'Plugins'))|Out-Null
 $startup=Join-Path $game 'startup.rphs'
 [IO.File]::WriteAllText($startup,'authored startup')
 $plan=@();$targets=@()
 foreach($relative in (Get-QualificationTargets01 phase1 '')){
  $target=Safe-Path $game $relative
  $targets+=$target
  if($targets.Count -le 3){[IO.File]::WriteAllText($target,"original $relative")}
  $old=Get-Menu02RestoreFileState $target
  $source=Join-Path $scope ('payload-'+$targets.Count)
  [IO.File]::WriteAllText($source,"different candidate $relative")
  $plan+=@{relative=$relative;source=$source;sha256=(Digest $source);bytes=(Get-Item -LiteralPath $source).Length
   originalExists=$old.exists;originalSha256=$old.sha256;originalBytes=$old.bytes}
 }
 $targetSnapshot={
  $rows=@(foreach($target in $targets){
   $s=Get-Menu02RestoreFileState $target
   if($s.metadata){$s.metadata.PSObject.Properties.Remove('lastAccessTimeUtc')}
   $s
  })
  return ,$rows
 }
 $originalTargets=(& $targetSnapshot)|ConvertTo-Json -Depth 8 -Compress
 $startupHash=Digest $startup
 $state=@{reads=0;busy=$null;lock=$null;firstCopyObserved=$false;receiptHash=$null}
 $tx=Join-Path $scope 'transaction'
 $readBaseline={
  $state.reads++
  if($state.reads -eq 2){
   $state.receiptHash=Digest (Join-Path $tx 'baseline.json')
   if($scenario -ceq 'protected-drift'){[IO.File]::WriteAllText($startup,'changed protected content')}
   if($scenario -ceq 'pre-copy-failure'){throw 'authored pre-copy baseline failure'}
   if($scenario -ceq 'process-drift'){
    $state.busy=Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList '-NoProfile -NonInteractive -Command Start-Sleep 30' -WindowStyle Hidden -PassThru
   }
  }
  $snapshot=[ordered]@{startupSha=(Digest $startup);targets=(& $targetSnapshot)}
  if($state.reads -eq 2 -and $scenario -ceq 'partial-copy'){
   $state.lock=[IO.File]::Open($targets[1],[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  }
  return $snapshot
 }
 $closure={
  if($state.lock -and (Digest $targets[0]) -ceq $plan[0].sha256){
   $state.firstCopyObserved=$true
   $state.lock.Dispose()
   $state.lock=$null
  }
  return !$state.busy -or $state.busy.HasExited
 }
 $params=@{GameRoot=$game;Transaction=$tx;Plan=$plan;ProcessClosure=$closure;ReadProtectedBaseline=$readBaseline}
 try{
  $failure=$null
  try{Install-Phase1Qualification01 @params}catch{$failure=$_.Exception.Message}
  $baseline=Join-Path $tx 'baseline.json'
  if(!(Test-Path -LiteralPath $baseline) -or (Digest $baseline) -cne $state.receiptHash -or
     @(Get-ChildItem -LiteralPath $tx -Filter 'baseline*.json' -File).Count -ne 1){throw "$scenario did not preserve one acquisition receipt"}
  if($scenario -ceq 'success'){
   if($failure -or $state.reads -ne 2){throw "Two-check staging failed: $failure"}
   $beforeReuse=$state.reads
   $refused=$false
   try{Install-Phase1Qualification01 @params}catch{$refused=$_.Exception.Message -match 'already consumed'}
   if(!$refused -or $state.reads -ne $beforeReuse){throw 'Consumed transaction was reused'}
   Restore-Qualification01 -GameRoot $game -Transaction $tx -Kind phase1 -Pack '' -Plan $plan -ProcessClosure $closure -AssertRestoredBaseline {
    ((& $targetSnapshot)|ConvertTo-Json -Depth 8 -Compress) -ceq $originalTargets
   }
  }else{
   if(!$failure){throw "$scenario failed to stop"}
   $evidence=Read-Json (Join-Path $tx 'staging-failure.json')
   $rollbackPath=Join-Path $tx 'staging-failure-restoration.json'
   if($scenario -ceq 'partial-copy'){
    if(!$state.firstCopyObserved -or !$evidence.restorationRequired -or !$evidence.independentBaselineVerified -or
       !(Read-Json $rollbackPath).succeeded){throw 'Real partial copy was not fully restored'}
   }else{
    if($evidence.restorationRequired -or $evidence.changedTargets.Count -ne 0 -or (Test-Path -LiteralPath $rollbackPath)){throw 'No-write failure entered restoration'}
    if($scenario -ceq 'protected-drift' -and $failure -cnotmatch 'Protected baseline drift'){throw 'Protected drift not detected at second check'}
    if($scenario -ceq 'process-drift' -and $failure -cnotmatch 'Process closure'){throw 'Live process drift was not detected'}
    if($scenario -ceq 'pre-copy-failure' -and !$evidence.independentBaselineVerified){throw 'Read-only failure verification missing'}
   }
  }
  if(((& $targetSnapshot)|ConvertTo-Json -Depth 8 -Compress) -cne $originalTargets){throw "$scenario target bytes or metadata differ"}
  $results+=@{scenario=$scenario;passed=$true;baselineReads=$state.reads;error=$failure;singleAcquisitionReceipt=$true}
 }finally{
  if($state.lock){$state.lock.Dispose()}
  if($state.busy -and !$state.busy.HasExited){$state.busy.Kill();$state.busy.WaitForExit()}
  if($state.busy){$state.busy.Dispose()}
 }
}
Write-QualificationNewJson01 (Join-Path $root 'verification.json') @{passed=$true;scenarios=$results;installedFilesRead=$false;gameLaunched=$false}
Write-Output "PASS Phase 1 baseline acquisition, revalidation, no-write and partial-copy rollback, and single-use checks. $root"
