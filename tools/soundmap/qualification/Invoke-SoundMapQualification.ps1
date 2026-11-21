#requires -Version 7.0
[CmdletBinding()]
param(
 [Parameter(Mandatory)][ValidateSet('Preflight','Stage','VerifyViewer','Launch','Restore')][string]$Operation,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$SealSHA256,
 [ValidatePattern('^fixture-[a-f0-9]{32}$')][string]$FixtureName
)
$ErrorActionPreference='Stop'
# The reviewed Setup helper sets Mode in the dot-sourced scope. Dispatch and
# callbacks use this immutable local copy, including after helper imports.
Set-Variable -Name SoundMapRequestedOperation01 -Value $Operation -Option Constant -Scope Local
$q=$PSScriptRoot
$retained=$q
Set-Location ([IO.Path]::GetFullPath((Join-Path $q '../../..')))
& (Join-Path $q 'Supervise-SoundMap.ps1') -Mode Pins -SealSHA256 $SealSHA256 | Out-Null
function readJ($f){Get-Content -LiteralPath $f -Raw|ConvertFrom-Json -DateKind String}
function sha($f){(Get-FileHash -LiteralPath $f).Hash.ToLowerInvariant()}
. ./tools/Prepare-StreetTrackedCandidate01.ps1 -FunctionsOnly
Import-StreetTrackedTransaction01
. ./tools/playable/QualificationTransaction01.ps1
. ./tools/soundmap/QualificationProcessOwnership01.ps1
$isFixture=[bool]$FixtureName
$x=Join-Path $q 'execution-01'
$ref=readJ (Join-Path $retained 'retained-inputs.json')
$base=readJ (Join-Path $q 'expected-protected-baseline.json');$old=readJ $ref.priorSeal
$settingsPath=Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Rockstar Games/GTAV Enhanced/settings.xml'
if((sha $old.originalReadScope.path) -cne $old.originalReadScope.sha256){throw 'Historical scope pin differs'}
$scope=readJ $old.originalReadScope.path
if((sha $scope.historicalBaseline.path) -cne $scope.historicalBaseline.sha256){throw 'Historical baseline pin differs'}
$hist=readJ $scope.historicalBaseline.path
$plan=readJ (Join-Path $retained 'qualification-plan.disabled.json')
$sourceScopePath=Join-Path $retained 'archive-identity-scope.disabled.json'
if($isFixture){
 $x=Join-Path $q $FixtureName
 Assert-Menu02UnlinkedPath $x
 $fixture=readJ (Join-Path $x 'fixture-only.json')
 if($fixture.kind -cne 'SoundMapOrchestrationFixture01' -or $fixture.installedAccessAllowed -ne $false){throw 'Explicit disposable fixture marker required'}
 $base=readJ (Join-Path $x 'baseline.json')
 $hist=readJ (Join-Path $x 'history.json')
 $plan=readJ (Join-Path $x 'plan.json')
 $sourceScopePath=Join-Path $x 'source-scope.json'
 $fixtureRoot=Join-Path $x 'installation'
 $settingsPath=Safe-Path $fixtureRoot 'settings.xml'
 if($base.launcher.workingDirectory -cne $fixtureRoot -or $plan.launcher.workingDirectory -cne $fixtureRoot -or (readJ $sourceScopePath).gameRoot -cne $fixtureRoot){throw 'Fixture installation root differs'}
 foreach($file in @($base.protected.path)+@($base.launcher.fileName,$plan.launcher.fileName,$hist.quarantine.originalPath)){
  $null=Assert-Menu02WithinRoot -Path $file -Root $fixtureRoot
 }
}
$root=$plan.launcher.workingDirectory
$targets=@($plan.destinations | ForEach-Object {
 @{relative=$_.relative;source=(Join-Path $retained $_.payload);bytes=$_.bytes;sha256=$_.sha256;originalExists=$_.originalExists;originalBytes=$_.originalBytes;originalSha256=$_.originalSha256}
})
foreach($target in $targets){$null=Assert-Menu02WithinRoot -Path $target.source -Root $retained}
$intent=readJ (Join-Path $x 'execution-intent.json')
if($intent.sealSHA256 -cne $SealSHA256 -or $intent.ownerId -cnotmatch '^[a-f0-9]{32}$' -or
 $intent.policy -cne 'operator-controlled' -or $null -ne $intent.stopAt -or $null -ne $intent.restoreBy -or
 [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -lt $intent.startAt){throw 'Exact fresh execution intent required'}
if(!$isFixture){
 $approval=Join-Path $x 'authorization.txt'
 Assert-Menu02UnlinkedPath $approval
 if($intent.authorizationSHA256 -cnotmatch '^[a-f0-9]{64}$' -or (sha $approval) -cne $intent.authorizationSHA256 -or
  !(Get-Content -LiteralPath $approval -Raw).ToLowerInvariant().Contains($SealSHA256)){throw 'Explicit replacement-seal authorization required'}
}
function save($name,$obj){Write-QualificationNewJson01 (Join-Path $x $name) $obj}
$script:ownedObservation=$null
$script:stageRollback=$false
function Active {
 $rows=@(Get-StreetTrackedActiveProcesses01 @{baseline=$hist})
 if($SoundMapRequestedOperation01 -cin @('VerifyViewer','Launch')){
  $script:ownedObservation=Get-SoundMapOwnedViewerProcesses01 $x $intent (readJ (Join-Path $q 'review-seal.json')) (Join-Path $q 'package') -Fixture:$isFixture
  $owned=readJ (Join-Path $x 'service-process.json')
  if(@($rows|Where-Object {$_.id -eq $owned.id -and $_.path -ieq $owned.path -and $_.creationFileTime -ceq $owned.creationFileTime}).Count -ne 1){throw 'Exact owned service not present'}
  return @($rows|Where-Object id -NE $owned.id)
 }
 $rows+=@(Get-SoundMapProfileProcesses01 $x)
 if($SoundMapRequestedOperation01 -ceq 'Restore'){
  if((Test-Path -LiteralPath (Join-Path $x 'launch-intent.json')) -and !(Test-Path -LiteralPath (Join-Path $x 'launcher.json'))){
   throw 'Original launch status is uncertain'
  }
  if(Test-Path (Join-Path $x 'launcher.json')){
   $launch=readJ (Join-Path $x 'launcher.json');$p=Get-Process -Id $launch.id -ErrorAction SilentlyContinue
   if($p -and $p.StartTime.ToUniversalTime().ToFileTimeUtc().ToString() -ceq $launch.creation){$rows+=@{id=$launch.id;name='original-launcher'}}
  }
  if(!$rows.Count){Assert-SoundMapOwnedJobClosed01 $x $intent}
 }
 return $rows
}
function TwoChecks($label){
 $snap=@()
 for($i=0;$i -lt 2;$i++){
  $r=@(Active);$snap+=@{utc=[DateTime]::UtcNow;active=$r;owned=$script:ownedObservation}
  if($r.Count){save "$label-blocked.json" $snap;throw 'Relevant processes still present'}
  if($i -eq 0){Start-Sleep -Milliseconds 2150}
 }
 save "$label.json" $snap
}
function CheckBaseline([bool]$After){
 Assert-StreetTrackedIdentity01 $root $base.launcher.rootIdentity
 Assert-StreetTrackedIdentity01 $base.launcher.fileName $base.launcher.cmdIdentity
 $rows=@();$exception=$null
 foreach($p in $base.protected){
  Assert-Menu02UnlinkedPath $p.path
  $item=Get-Item -LiteralPath $p.path -Force -ErrorAction SilentlyContinue
  if([bool]$item -ne $p.exists -or ($item -and ($item.PSIsContainer -or $item.Length -ne $p.bytes))){throw "Protected presence or length drift: $($p.path)"}
  $s=Get-Menu02RestoreFileState $p.path
  if($s.exists){
   $anchor=@($hist.protected)+@($hist.settings)+@($hist.dependencies)+@($hist.quarantine.held)|Where-Object path -CEQ $p.path|Select-Object -First 1
   $isTarget=$p.path -in @($targets.relative | ForEach-Object {Safe-Path $root $_})
   if($p.currentIdentity -and !($After -and $isTarget)){Assert-StreetTrackedIdentity01 $p.path @{CanonicalPath=$p.currentIdentity[0];VolumeSerial=$p.currentIdentity[1];FileId=$p.currentIdentity[2]}}
   elseif($anchor.identityAfter -and !($After -and $isTarget)){Assert-StreetTrackedIdentity01 $p.path $anchor.identityAfter}
   if($s.bytes -ne $p.bytes -or $s.sha256 -cne $p.sha256 -or $s.metadata.creationTimeUtc -cne $p.metadata.creationTimeUtc -or $s.metadata.sddl -cne $p.metadata.sddl -or $s.metadata.attributes -ne $p.metadata.attributes){
    save ('protected-drift-'+[guid]::NewGuid().ToString('N')+'.json') @{expected=$p;actual=$s}
    throw "Protected bytes or metadata drift: $($p.path)"
   }
   if($s.metadata.lastWriteTimeUtc -cne $p.metadata.lastWriteTimeUtc){
    $at=[DateTimeOffset]::Parse($s.metadata.lastWriteTimeUtc)
    if(!$After -or !$intent.acceptSettingsTimestampOnly -or $p.path -cne $settingsPath -or !$anchor.identityAfter -or
      !(Test-Path -LiteralPath (Join-Path $x 'launch-intent.json') -PathType Leaf) -or
      !(Test-Path -LiteralPath (Join-Path $x 'launcher.json') -PathType Leaf)){
     save ('timestamp-drift-'+[guid]::NewGuid().ToString('N')+'.json') @{path=$p.path;expected=$p.metadata.lastWriteTimeUtc;actual=$s.metadata.lastWriteTimeUtc;bytesAndHashMatched=$true}
     throw "Protected last-write timestamp drift: $($p.path)"
    }
    Assert-Preflight
    $preflight=readJ (Join-Path $x 'preflight-complete.json')
    $launchIntent=readJ (Join-Path $x 'launch-intent.json')
    $launched=readJ (Join-Path $x 'launcher.json')
    $preflightAt=[DateTimeOffset]::Parse($preflight.completedUtc)
    $launchAt=[DateTimeOffset]::new([DateTime]::FromFileTimeUtc([long]$launched.creation))
    $closure=@(readJ (Join-Path $x 'restoration-closure.json'))
    $closedAt=[DateTimeOffset]::Parse($closure[-1].utc)
    if(Test-Path -LiteralPath (Join-Path $x 'game-exit-observed.json')){
     $exitAt=[DateTimeOffset]::Parse((readJ (Join-Path $x 'game-exit-observed.json')).utc)
     if($exitAt -lt $closedAt){$closedAt=$exitAt}
    }
    if($launchIntent.sealSHA256 -cne $SealSHA256 -or $launchIntent.ownerId -cne $intent.ownerId -or
      $launchIntent.fileName -cne $base.launcher.fileName -or $launchIntent.workingDirectory -cne $base.launcher.workingDirectory -or $launchIntent.launchesAllowed -ne 1 -or
      $launchAt -lt $preflightAt -or $at -le $preflightAt -or $at -lt $launchAt -or
      $at -gt $closedAt -or $at -gt [DateTimeOffset]::UtcNow){
     save ('timestamp-drift-'+[guid]::NewGuid().ToString('N')+'.json') @{path=$p.path;expected=$p.metadata.lastWriteTimeUtc;actual=$s.metadata.lastWriteTimeUtc;preflightCompletedUtc=$preflight.completedUtc;launchUtc=$launchAt.ToString('o');bytesAndHashMatched=$true}
     throw "Protected last-write timestamp outside the qualified session: $($p.path)"
    }
    $exception=@{path=$p.path;before=$p.metadata.lastWriteTimeUtc;after=$s.metadata.lastWriteTimeUtc;bytesHashIdentityCreationAttributesPermissionsMatch=$true;timestampRewritten=$false;preflightCompletedUtc=$preflight.completedUtc;launchUtc=$launchAt.ToString('o')}
   }
  }
  $rows+=$s
 }
 if(Test-Path -LiteralPath $hist.quarantine.originalPath){throw 'Quarantined original unexpectedly present'}
 $files=@(Get-ChildItem -LiteralPath $root -File -Filter '*.asi'|Sort-Object Name)
 if(($files.Name -join '|') -cne (($base.asi.name|Sort-Object)-join '|')){throw 'ASI inventory changed'}
 $asi=@()
 foreach($row in $base.asi){
  $p=$row.observation;$limit=8388608
  if($row.name -ceq 'TrainerV.asi'){$limit=27073536;if($p.bytes -ne $limit){throw 'TrainerV pin differs'}}
  $actual=Get-StreetTrackedBoundedAsi01 (Safe-Path $root $row.name) $p.bytes $limit @{CanonicalPath=$p.canonicalPath;VolumeSerial=$p.volumeSerial;FileId=$p.fileId}
  if(!$actual.complete -or $actual.bytesRead -ne $p.bytes -or $actual.sha256 -cne $p.sha256){throw "ASI baseline changed: $($row.name)"}
  $asi+=$actual
 }
 foreach($p in $base.extra){
  $extra=Safe-Path $root $p.relative;Assert-Menu02UnlinkedPath $extra
  $item=Get-Item -LiteralPath $extra -Force -ErrorAction SilentlyContinue
  if([bool]$item -ne $p.exists -or ($item -and ($item.PSIsContainer -ne $p.directory -or (!$p.directory -and $item.Length -ne $p.bytes)))){throw "Protected extra path state changed: $($p.relative)"}
 }
 return @{protected=$rows;asi=$asi;extra=$base.extra;settingsException=$exception}
}
function Assert-Cutoff([long]$Deadline){
 if([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -ge $Deadline){throw 'Reviewed operation cutoff reached'}
}
function Assert-Preflight {
 $p=readJ (Join-Path $x 'preflight-complete.json')
 if($p.sealSHA256 -cne $SealSHA256 -or $p.ownerId -cne $intent.ownerId -or
  (sha (Join-Path $x 'protected-baseline-before.json')) -cne $p.baselineSHA256 -or
  (sha (Join-Path $x 'current-source-identity.json')) -cne $p.proofSHA256){throw 'Preflight evidence differs'}
}
function Assert-Deployed {
 if(!(Test-Path -LiteralPath (Join-Path $x 'transaction/deployed.json') -PathType Leaf)){throw 'No completed deployment transaction'}
}
switch -CaseSensitive ($SoundMapRequestedOperation01) {
 'Preflight' {
  Assert-Cutoff ($intent.startAt+480000)
  save 'preflight-claim.json' @{operation=$SoundMapRequestedOperation01;sealSHA256=$SealSHA256;ownerId=$intent.ownerId}
  TwoChecks 'preflight-closure'
  save 'protected-baseline-before.json' (CheckBaseline $false)
  $scopeHash=sha $sourceScopePath
  $sourceApproval=Join-Path $x 'source-approval.json'
  save 'source-approval.json' @{schema=1;kind='soundmap-one-use-source-approval';approved=$true;policy='operator-controlled';scopeSHA256=$scopeHash;ownerId=$intent.ownerId;startAt=$intent.startAt;stopAt=$null}
  $node=Join-Path $retained 'package/runtime/node.exe'
  $verifier=Join-Path $retained 'package/tools/soundmap/verify-map-source01.mjs'
  & $node $verifier confirm $sourceScopePath $scopeHash $sourceApproval (sha $sourceApproval)
  if($LASTEXITCODE -ne 0){throw 'Approved source continuity check failed'}
  Assert-Cutoff ($intent.startAt+480000)
  save 'preflight-complete.json' @{completedUtc=[DateTimeOffset]::UtcNow.ToString('o');operation=$SoundMapRequestedOperation01;sealSHA256=$SealSHA256;ownerId=$intent.ownerId;baselineSHA256=(sha (Join-Path $x 'protected-baseline-before.json'));proofSHA256=(sha (Join-Path $x 'current-source-identity.json'))}
 }
 'Stage' {
  Assert-Preflight
  Assert-Cutoff ($intent.startAt+480000)
  if(Test-Path -LiteralPath (Join-Path $x 'viewer-start-intent.json')){throw 'Staging must precede viewer dispatch'}
  Assert-SoundMapOwnedJobClosed01 $x $intent
  TwoChecks 'staging-closure'
  Install-Qualification01 -GameRoot $root -Transaction (Join-Path $x 'transaction') -Kind soundmap-view -Pack '' -Plan $targets -ProcessClosure { @(Active).Count -eq 0 } -RollbackProcessClosure { $script:stageRollback=$true; @(Active).Count -eq 0 } -AcquireBaseline { save 'protected-baseline-at-stage.json' (CheckBaseline $false);$true } -RevalidateBaseline { save ('protected-baseline-revalidated-'+[guid]::NewGuid().ToString('N')+'.json') (CheckBaseline $script:stageRollback);$true }
  save 'staging-complete.json' @{ownerId=$intent.ownerId;sealSHA256=$SealSHA256;deployedSHA256=(sha (Join-Path $x 'transaction/deployed.json'));utc=[DateTime]::UtcNow}
 }
 'VerifyViewer' {
  Assert-Preflight
  Assert-Deployed
  $config=if($isFixture){readJ (Join-Path $x 'fixture-viewer.json')}else{readJ (Join-Path $q 'review-seal.json')}
  $overview=readJ (Join-Path $x 'overview-before-launch.json')
  if($overview.sealSHA256 -cne $SealSHA256 -or $overview.ownerId -cne $intent.ownerId -or $overview.atlas -cne $config.atlasSHA256 -or
     $overview.acceptedCameraFrames -ne 0 -or $overview.viewer.overviewReadyMs -eq $null -or $overview.viewer.overviewPages -ne $config.overviewPages -or
     $overview.viewer.visibleTriangles -ne $config.overviewTriangles){throw 'Complete camera-only overview required before launch'}
  if(@(Active).Count){throw 'Relevant processes still present'}
  $script:ownedObservation
 }
 'Launch' {
  Assert-Preflight
  Assert-Deployed
  Assert-Cutoff ($intent.startAt+480000)
  $owned=readJ (Join-Path $x 'viewer-owned.json')
  if($owned.ownerId -cne $intent.ownerId -or $owned.overviewSHA256 -cne (sha (Join-Path $x 'overview-before-launch.json')) -or
     $owned.browserRootId -ne (readJ (Join-Path $x 'viewer-process.json')).id){throw 'Verified viewer readiness required before launch'}
  TwoChecks 'launch-closure'
  $l=$plan.launcher
  Assert-StreetTrackedIdentity01 $root $l.rootIdentity
  Assert-StreetTrackedIdentity01 $l.fileName $l.cmdIdentity
  $launcherState=Get-Menu02RestoreFileState $l.fileName
  if(!$launcherState.exists -or $launcherState.bytes -ne $l.cmdBytes -or $launcherState.sha256 -cne $l.cmdSha256 -or $launcherState.metadata.sddl -cne $l.cmdPermissionsSddl){throw 'Reviewed launcher identity differs'}
  $deployed=readJ (Join-Path $x 'transaction/deployed.json')
  foreach($target in $targets){
   $targetPath=Safe-Path $root $target.relative
   $state=Get-Menu02RestoreFileState $targetPath
   $record=@($deployed.files | Where-Object target -CEQ $targetPath)
   if(!$state.exists -or $state.bytes -ne $target.bytes -or $state.sha256 -cne $target.sha256 -or $record.Count -ne 1){throw 'Staged launch target differs'}
   foreach($field in 'creationTimeUtc','lastWriteTimeUtc','attributes','sddl'){
    if($state.metadata.$field -cne $record[0].expectedDeployedMetadata.$field){throw 'Staged launch target metadata differs'}
   }
  }
  Assert-Cutoff ($intent.startAt+480000)
  Assert-Menu02Closure { @(Active).Count -eq 0 }
  save 'launch-intent.json' @{ownerId=$intent.ownerId;fileName=$l.fileName;workingDirectory=$root;launchesAllowed=1;sealSHA256=$SealSHA256}
  if($isFixture){
   # The fixture executes an inert wait process after the production launch guard.
   $marker=(Join-Path $x 'fixture-game-exit.request').Replace("'","''")
   $wait='$watch=[Diagnostics.Stopwatch]::StartNew();while(![IO.File]::Exists('+"'"+$marker+"'"+') -and $watch.Elapsed.TotalSeconds -lt 90){Start-Sleep -Milliseconds 100}'
   $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($wait))
   $child=Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',$encoded) -WindowStyle Hidden -WorkingDirectory $root -PassThru
   try{save 'launcher.json' @{id=$child.Id;creation=$child.StartTime.ToUniversalTime().ToFileTimeUtc().ToString();fixtureOnly=$true}}
   finally{$child.Dispose()}
   return
  }
  $info=[Diagnostics.ProcessStartInfo]::new()
  $info.FileName=$l.fileName;$info.WorkingDirectory=$root;$info.Arguments='';$info.UseShellExecute=$true;$info.Verb='open';$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Normal
  $launched=[Diagnostics.Process]::Start($info)
  if(!$launched){throw 'Original launcher process identity unavailable'}
  try{save 'launcher.json' @{id=$launched.Id;creation=$launched.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()}}
  finally{$launched.Dispose()}
 }
 'Restore' {
  Assert-Deployed
  TwoChecks 'restoration-closure'
  Restore-Qualification01 -GameRoot $root -Transaction (Join-Path $x 'transaction') -Kind soundmap-view -Pack '' -Plan $targets -ProcessClosure { @(Active).Count -eq 0 } -AssertRestoredBaseline { save 'protected-baseline-after.json' (CheckBaseline $true);$true }
 }
 default {throw 'Unknown camera-only qualification operation'}
}
