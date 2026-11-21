#requires -Version 7.0
[CmdletBinding(DefaultParameterSetName='Live')]
param(
 [Parameter(ParameterSetName='Live')][ValidatePattern('^[a-f0-9]{64}$')][string]$ApproveOneLaunch,
 [switch]$AcceptSettingsTimestampOnly,
 [Parameter(Mandatory,ParameterSetName='Fixture')][ValidatePattern('^fixture-[a-f0-9]{32}$')][string]$FixtureName,
 [Parameter(Mandatory,ParameterSetName='Fixture')][ValidatePattern('^[a-f0-9]{64}$')][string]$FixtureSeal
)
$ErrorActionPreference='Stop'
$q=$PSScriptRoot
if(!$ApproveOneLaunch -and !$FixtureName){Write-Host 'Review only. No game or installation access. Read REVIEW.md before authorizing one launch.';return}
$repo=[IO.Path]::GetFullPath((Join-Path $q '../../..'));Set-Location $repo
$supervisor=Join-Path $q 'Supervise-SoundMap.ps1'
$sealHash=if($FixtureName){$FixtureSeal}else{$ApproveOneLaunch}
& $supervisor -Mode Pins -SealSHA256 $sealHash | Out-Null
function J($p){Get-Content -LiteralPath $p -Raw|ConvertFrom-Json -DateKind String}
function AtlasHash($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Save($p,$v){$f=[IO.File]::Open($p,'CreateNew');try{$b=[Text.Encoding]::UTF8.GetBytes(($v|ConvertTo-Json -Depth 24));$f.Write($b);$f.Flush($true)}finally{$f.Dispose()}}
function Literal($x){"'"+$x.Replace("'","''")+"'"}
$s=J (Join-Path $q 'review-seal.json')
$x=Join-Path $q 'execution-01'
$fixture=$null
$config=$s
$serviceRoot=Join-Path $q 'package'
if($FixtureName){
 $x=Join-Path $q $FixtureName
 $fixture=J (Join-Path $x 'fixture-only.json')
 if($fixture.kind -cne 'SoundMapOrchestrationFixture01' -or $fixture.installedAccessAllowed -ne $false){throw 'Explicit disposable fixture only'}
 $config=J (Join-Path $x 'fixture-viewer.json')
 $serviceRoot=Join-Path $x 'service-root'
}else{
 if(Test-Path -LiteralPath $x){throw 'One-use execution already claimed; no retry'}
 $null=New-Item -Path $x -ItemType Directory -ErrorAction Stop
}
$owner=[guid]::NewGuid().ToString('N')
$controller=Get-Process -Id $PID
$authorization=Join-Path $x 'authorization.txt'
if(!$FixtureName){
 $f=[IO.File]::Open($authorization,'CreateNew')
 try{
  $b=[Text.Encoding]::UTF8.GetBytes("Explicit local operator invocation for one launch under seal $sealHash. settings timestamp-only exception: $([bool]$AcceptSettingsTimestampOnly).")
  $f.Write($b);$f.Flush($true)
 }finally{$f.Dispose()}
}
$authorizationSHA=if(!$FixtureName){AtlasHash $authorization}else{$null}
Save (Join-Path $x 'execution-intent.json') @{sealSHA256=$sealHash;ownerId=$owner;policy='operator-controlled';startAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();
 stopAt=$null;restoreBy=$null;acceptSettingsTimestampOnly=[bool]$AcceptSettingsTimestampOnly;authorizationSHA256=$authorizationSHA;
 controllerPid=$PID;controllerCreation=$controller.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()}
$entry=Join-Path $q 'Invoke-SoundMapQualification.ps1'
function Run([string]$op){
 $args01=@{Operation=$op;SealSHA256=$sealHash}
 if($FixtureName){$args01.FixtureName=$FixtureName}
 & $entry @args01
}
$sup=$null;$d=$null;$last=$null;$launched=$false;$sawGame=$false;$fault=$null;$closed=$false;$phase='prelaunch'
function Current($route){
 if(!$d){$script:d=J (Join-Path $serviceRoot '.local/soundmap/service.json')}
 if($d.ownerId -cne $owner -or $d.url -cne ('http://127.0.0.1:'+$config.port) -or $d.token -cnotmatch '^[a-f0-9]{64}$'){throw 'Owned descriptor differs'}
 Invoke-RestMethod ($d.url+$route) -Headers @{'X-RichAudio-Token'=$d.token} -TimeoutSec 5 -NoProxy
}
function Processes {
 if($FixtureName){
  $receipt=J (Join-Path $x 'launcher.json')
  $child=Get-Process -Id $receipt.id -ErrorAction SilentlyContinue
  $games=@()
  if($child){try{
   if(!$child.HasExited -and $child.StartTime.ToUniversalTime().ToFileTimeUtc().ToString() -ceq $receipt.creation){
    $games+=@{Name='fixture-game';ProcessId=$child.Id}
   }
  }finally{$child.Dispose()}}
  return @{game=$games;browser=@()}
 }
 $games=@(Get-CimInstance Win32_Process -Filter "Name='GTA5_Enhanced.exe' OR Name='GTA5.exe' OR Name='RAGEPluginHook.exe' OR Name='PlayGTAV.exe'" -ErrorAction Stop)
 $browser=@(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction Stop|Where-Object{[string]$_.CommandLine -like ('*'+(Join-Path $x 'browser-profile')+'*')})
 return @{game=$games;browser=$browser}
}
function Sample($items){
 @($items|ForEach-Object {
  $p=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
  if($p){try{@{id=$p.Id;cpuSeconds=$p.CPU;workingSet=$p.WorkingSet64;privateBytes=$p.PrivateMemorySize64;name=$p.ProcessName}}finally{$p.Dispose()}}
 })
}
function Record($status,$p,$tag){
 # One small JSON row per poll; diagnostics are capped independently of session duration.
 $file=Join-Path $x 'samples.jsonl'
 if((Test-Path -LiteralPath $file) -and (Get-Item -LiteralPath $file).Length -ge 67108864){return}
 $f=Current '/api/frame'
 $row=@{utc=[DateTime]::UtcNow;phase=$tag;game=(Sample $p.game);chrome=(Sample $p.browser);gtaFrameTime=$null;
  viewer=$status.operatorMap.metrics;camera=$f.passive;interior=$f.atlasContext.interior;proof=$status.worldAtlas.proof;atlasIo=$status.worldAtlas.io;
  gpuDrawBasis='WebGL timer query';viewerFrameBasis='measured browser draw cadence and CPU paint';gtaFrameBasis='unavailable-no-approved-present-instrumentation'}
 Add-Content -LiteralPath $file -Value ($row|ConvertTo-Json -Depth 16 -Compress) -Encoding utf8
}
try{
 Run Preflight
 $phase='staging'
 Run Stage
 $phase='viewer-startup'
 Save (Join-Path $x 'viewer-start-intent.json') @{ownerId=$owner;sealSHA256=$sealHash;stagingSHA256=(AtlasHash (Join-Path $x 'staging-complete.json'))}
 Save (Join-Path $x 'service-approval.json') @{sealSHA256=$sealHash;ownerId=$owner;proofSHA256=(AtlasHash (Join-Path $x 'current-source-identity.json'))}
 $command='$ErrorActionPreference="Stop"; & '+(Literal $supervisor)+' -Mode Service -SealSHA256 '+(Literal $sealHash)
 if($FixtureName){$command+=' -FixtureName '+(Literal $FixtureName)}
 $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
 $sup=Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',$encoded) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $x 'supervisor.stdout.log') -RedirectStandardError (Join-Path $x 'supervisor.stderr.log')
 Save (Join-Path $x 'supervisor-process.json') @{id=$sup.Id;creation=$sup.StartTime.ToUniversalTime().ToFileTimeUtc().ToString();ownerId=$owner;sealSHA256=$sealHash}
 $startup=[Diagnostics.Stopwatch]::StartNew()
 do{
  if($sup.HasExited -or $startup.Elapsed.TotalSeconds -gt 90){throw 'Owned viewer failed to present the complete overview before game launch'}
  if(Test-Path -LiteralPath (Join-Path $x 'viewer-process.json')){
   try{$last=Current '/api/status'}catch [System.Threading.Tasks.TaskCanceledException]{Start-Sleep -Milliseconds 250;continue}
   $m=$last.operatorMap.metrics
   if(!$last.viewOnlyMap -or !$last.worldAtlas.proof.live -or $last.worldAtlas.sha256 -cne $config.atlasSHA256 -or $last.passive.accepted -ne 0 -or $last.audio.hostConnected -or $last.accepted -ne 0 -or $last.worldAtlas.io.failures -ne 0 -or $m.viewerFault -or $m.detailFailures -gt 0){throw 'Unexpected startup authority or renderer state'}
   if($m.overviewReadyMs -ne $null -and $m.overviewPages -eq $config.overviewPages -and $m.visibleTriangles -eq $config.overviewTriangles){break}
  }
  Start-Sleep -Milliseconds 250
 }while($true)
 $overviewPath=Join-Path $x 'overview-before-launch.json'
 Save $overviewPath @{utc=[DateTime]::UtcNow;ownerId=$owner;sealSHA256=$sealHash;viewer=$m;acceptedCameraFrames=$last.passive.accepted;atlas=$last.worldAtlas.sha256}
 $phase='viewer-verification'
 if($fixture.holdBeforeLaunch){
  $gate=[Diagnostics.Stopwatch]::StartNew()
  while(!(Test-Path -LiteralPath (Join-Path $x 'fixture-release-launch.request'))){
   if($sup.HasExited -or $gate.Elapsed.TotalSeconds -gt 90){throw 'Disposable viewer verification gate failed'}
   Start-Sleep -Milliseconds 200
  }
 }
 $ownership=Run VerifyViewer
 $ownership | Add-Member -NotePropertyName overviewSHA256 -NotePropertyValue (AtlasHash $overviewPath)
 Save (Join-Path $x 'viewer-owned.json') $ownership
 $last=Current '/api/status'
 if($last.operatorMap.stopRequestedAt -ne $null -or (Test-Path -LiteralPath (Join-Path $x 'viewer-exited.json'))){throw 'Viewer stopped before launch'}
 if(!$last.worldAtlas.proof.live -or $last.audio.hostConnected -or $last.accepted -ne 0 -or $last.passive.accepted -ne 0 -or
   $last.worldAtlas.io.failures -ne 0 -or $last.operatorMap.metrics.detailFailures -gt 0 -or $last.operatorMap.metrics.viewerFault){throw 'Viewer readiness no longer qualifies'}
 $phase='awaiting-story'
 Run Launch
 $launched=$true
 Write-Host 'SoundMap is open. Handle the expected Steam confirmation and load your usual Story Mode save. Explore at your own pace. End test or quit GTA normally when done.'
 do{
  $p=Processes
  if($p.game.Count){
   foreach($g in $p.game){if($FixtureName -or $g.Name -ieq 'GTA5_Enhanced.exe'){
    if(!$FixtureName -and (!$g.ExecutablePath -or $g.ExecutablePath -ine (Join-Path $s.gameRoot 'GTA5_Enhanced.exe'))){throw 'Unexpected GTA process identity; close the game normally'}
    $sawGame=$true
   }}
  }elseif($sawGame){
   Save (Join-Path $x 'game-exit-observed.json') @{utc=[DateTime]::UtcNow;exitType='process-absence-only'}
   $closed=$true;break
  }
  if(!$fault){
   try{
    if($sup.HasExited){throw 'Owned service or supervisor ended'}
    $last=Current '/api/status'
    if(!$last.worldAtlas.proof.live -or $last.audio.hostConnected -or $last.accepted -ne 0 -or $last.passive.identityViolations -ne 0 -or $last.worldAtlas.io.failures -ne 0 -or $last.operatorMap.metrics.detailFailures -gt 0 -or $last.operatorMap.metrics.viewerFault){throw 'Source, atlas, camera identity or audio isolation failure'}
    if($last.operatorMap.stopRequestedAt -ne $null -or (Test-Path -LiteralPath (Join-Path $x 'viewer-exited.json'))){
     $fault='operator-ended';Write-Host 'Please quit GTA normally. Restoration waits for verified closure.'
    }elseif($last.passive.available -and $phase -ceq 'awaiting-story'){
     Save (Join-Path $x 'camera-ready.json') @{utc=[DateTime]::UtcNow;status=$last.passive}
     $phase='exploring'
    }
    Record $last $p $phase
   }catch{$fault=$_.Exception.Message;Write-Warning ($fault+'; please quit GTA normally.')}
  }
  if($fault -and !$sawGame -and !$p.game.Count){
   if($FixtureName){throw 'Disposable game lifetime was not established'}
   $confirm=Read-Host 'After dismissing any Steam launch prompt and confirming GTA/RPH are closed, type CLOSED to verify restoration'
   if($confirm -ceq 'CLOSED'){$closed=$true;break}
  }
  Start-Sleep -Seconds 1
 }while($true)
}catch{
 $fault=$_.Exception.Message
 throw
}finally{
 if($sup -and !$sup.HasExited){
  [IO.File]::WriteAllText((Join-Path $x 'viewer-shutdown.request'),'normal controller cleanup')
  if(!$sup.WaitForExit(15000)){[IO.File]::WriteAllText((Join-Path $x 'cancel.request'),'controller requested owned shutdown');$null=$sup.WaitForExit(10000)}
 }
 $restored=$false;$post=$false;$errorText=$null
 if(Test-Path -LiteralPath (Join-Path $x 'transaction/deployed.json')){
  try{
   if($launched -and !$closed){throw 'Normal GTA closure not established; original backup retained without writes'}
   if($launched){
    $sourceApproval=Join-Path $x 'source-approval.json'
    & (Join-Path $q 'package/runtime/node.exe') (Join-Path $q 'package/tools/soundmap/verify-map-source01.mjs') postcheck $config.sourceScope (AtlasHash $config.sourceScope) $sourceApproval (AtlasHash $sourceApproval)
    $post=$LASTEXITCODE -eq 0
   }
   Run Restore
   $restored=$true
  }catch{$errorText=$_.Exception.Message;Write-Warning $errorText}
 }
 Save (Join-Path $x 'session-summary.json') @{policy='operator-controlled';elapsedCutoff=$null;launchCompleted=$launched;gameObserved=$sawGame;closureObserved=$closed;restored=$restored;sourcePostcheck=$post;
  ownedServiceTerminal=(Test-Path -LiteralPath (Join-Path $x 'service-terminal.json'));lastPhase=$phase;stopReason=$fault;restorationError=$errorText}
 if($sup){$sup.Dispose()}
 Write-Host "Private result: $(Join-Path $x 'session-summary.json')"
}