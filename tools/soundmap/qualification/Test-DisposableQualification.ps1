#requires -Version 7.0
$ErrorActionPreference='Stop'
$q=$PSScriptRoot
$repo=[IO.Path]::GetFullPath((Join-Path $q '../../..'))
$retained=$q
Set-Location $repo
. ./tools/Prepare-StreetTrackedCandidate01.ps1 -FunctionsOnly
Import-StreetTrackedTransaction01
. ./tools/playable/QualificationTransaction01.ps1
. ./tools/soundmap/QualificationProcessOwnership01.ps1
function ReadFixtureJson($p){Get-Content -LiteralPath $p -Raw|ConvertFrom-Json -DateKind String}
function SaveFixtureJson($p,$data){Write-QualificationNewJson01 $p $data}
function Check($test,$reason){if(!$test){throw $reason}}
function Identity($file){
 Initialize-Menu02LaunchNativeIdentity
 $i=[Menu02RecoveryLaunch.NativeIdentity]::ReadDirectory($file)
 return @{CanonicalPath=$i[0];VolumeSerial=$i[1];FileId=$i[2]}
}
$seal=(Digest (Join-Path $q 'review-seal.json'))
$entry=Join-Path $q 'Invoke-SoundMapQualification.ps1'
$node=Join-Path $retained 'package/runtime/node.exe'
$seed=ReadFixtureJson (Join-Path $retained 'qualification-plan.disabled.json')
$candidate=ReadFixtureJson (Join-Path $q 'review-seal.json')
$approvedTime=[DateTimeOffset]::Parse($candidate.settingsLastWrite).UtcDateTime
$oldTime=$approvedTime.AddHours(-3)
$shared=Join-Path $q ('disposable-atlas-'+[guid]::NewGuid().ToString('N'))
function NewFixture([switch]$FailBeforeViewer,[switch]$HoldBeforeLaunch,[switch]$Direct) {
 $name='fixture-'+[guid]::NewGuid().ToString('N');$x=Join-Path $q $name
 $game=Join-Path $x 'installation'
 $null=[IO.Directory]::CreateDirectory((Join-Path $game 'Plugins'))
 $fileList=@('Plugins/RichAudio.dll','Plugins/RichAudio.Menu.json','Plugins/RichAudio.Playable.json','startup.rphs','settings.xml','GTA5_Enhanced.exe','fixture-launch.cmd','OpenIV.asi.menu03-hold-01')
 foreach($rel in $fileList){
  $file=Safe-Path $game $rel
  [IO.File]::WriteAllText($file,"disposable original $rel")
  $item=Get-Item -LiteralPath $file
  $item.CreationTimeUtc=[DateTime]::new(2024,4,1,9,30,0,[DateTimeKind]::Utc)
  $item.LastWriteTimeUtc=[DateTime]::new(2024,4,2,9,30,0,[DateTimeKind]::Utc)
 }
 [IO.File]::SetLastWriteTimeUtc((Safe-Path $game 'settings.xml'),$approvedTime)
 $protected=@($fileList+@('Plugins/RichAudio.WorldWarmup.json')|ForEach-Object{Get-Menu02RestoreFileState (Safe-Path $game $_)})
 $asi=@()
 foreach($row in @(@{name='TrainerV.asi';bytes=27073536},@{name='FixtureOther.asi';bytes=32})){
  $file=Safe-Path $game $row.name
  $fs=[IO.File]::Open($file,[IO.FileMode]::CreateNew);try{$fs.SetLength($row.bytes)}finally{$fs.Dispose()}
  $asi+=@{name=$row.name;observation=(Get-StreetTrackedBoundedAsi01 $file $row.bytes $row.bytes)}
 }
 $launcher=Safe-Path $game 'fixture-launch.cmd'
 $ls=Get-Menu02RestoreFileState $launcher
 $l=@{fileName=$launcher;workingDirectory=$game;rootIdentity=(Identity $game);cmdIdentity=(Identity $launcher);cmdBytes=$ls.bytes;cmdSha256=$ls.sha256;cmdPermissionsSddl=$ls.metadata.sddl}
 $extra=@(@{relative='mods';exists=$false;directory=$false;bytes=0})
 SaveFixtureJson (Join-Path $x 'baseline.json') @{protected=$protected;launcher=$l;extra=$extra;asi=$asi}
 $hist=@($protected|Where-Object exists|ForEach-Object {@{path=$_.path;identityAfter=(Identity $_.path)}})
 SaveFixtureJson (Join-Path $x 'history.json') @{protected=$hist;settings=@();dependencies=@();quarantine=@{originalPath=(Safe-Path $game 'OpenIV.asi');held=@()}}
 $dest=@($seed.destinations|ForEach-Object{
  $f=Get-Menu02RestoreFileState (Safe-Path $game $_.relative)
  @{relative=$_.relative;payload=$_.payload;originalExists=$true;originalBytes=$f.bytes;originalSha256=$f.sha256;bytes=$_.bytes;sha256=$_.sha256}
 })
 SaveFixtureJson (Join-Path $x 'plan.json') @{launcher=$l;destinations=$dest}
 SaveFixtureJson (Join-Path $x 'fixture-only.json') @{kind='SoundMapOrchestrationFixture01';installedAccessAllowed=$false;failBeforeViewer=[bool]$FailBeforeViewer;holdBeforeLaunch=[bool]$HoldBeforeLaunch}
 if($Direct){
  $controller=Get-Process -Id $PID
  SaveFixtureJson (Join-Path $x 'execution-intent.json') @{sealSHA256=$seal;ownerId=[guid]::NewGuid().ToString('N');policy='operator-controlled';startAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();stopAt=$null;restoreBy=$null;acceptSettingsTimestampOnly=$true;
   controllerPid=$PID;controllerCreation=$controller.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()}
 }
 $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start()
 $port=$listener.LocalEndpoint.Port;$listener.Stop()
 $code=@"
const fs=require('node:fs'),p=require('node:path'),c=require('node:crypto');const [g,x,atlasFile,port,fixture]=process.argv.slice(1);
const hash=b=>c.createHash('sha256').update(b).digest('hex');
const write=(file,value)=>{const b=Buffer.from(JSON.stringify(value));fs.writeFileSync(file,b,{flag:'wx'});return hash(b)};
const archives=Array.from({length:123},(_,i)=>{
const relative='authored-'+i+'.rpf', f=p.join(g,relative);fs.writeFileSync(f,Buffer.alloc(16,i),{flag:'wx'});
const s=fs.lstatSync(f,{bigint:true});return {relative,identity:Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs','nlink'].map(k=>[k,String(s[k])]))};});
const gameExecutableSHA256=hash(fs.readFileSync(p.join(g,'GTA5_Enhanced.exe')));
fs.mkdirSync(p.join(x,'service-root'));
const context=p.join(fixture,'context.json'),manifestPath=p.join(fixture,'manifest.json'),catalogPath=p.join(fixture,'catalog.json');
const atlas=p.join(fixture,'atlas.json');
if(!fs.existsSync(atlas)){
 fs.mkdirSync(fixture);
 const a=JSON.parse(fs.readFileSync(atlasFile)),src=p.dirname(atlasFile),proofEpoch=new Date().toISOString();
 const manifestSHA256=write(manifestPath,{fixture:true}),catalogSHA256=write(catalogPath,{fixture:true,Resources:[]});
 write(context,{manifestPath,catalogPath,catalogSHA256,expectedGameSHA256:gameExecutableSHA256,privateRoot:fixture,proofEpoch});
 // Preserve every geometry byte. Only the fixture manifest's source binding changes.
 for(const name of fs.readdirSync(src).filter(n=>n.endsWith('.ram')||n==='provenance.json'))fs.copyFileSync(p.join(src,name),p.join(fixture,name),fs.constants.COPYFILE_EXCL);
 a.identity={...a.identity,manifestSHA256,catalogSHA256,gameExecutableSHA256,proofEpoch};
 write(atlas,a);
}
const source=fs.readFileSync(atlas),a=JSON.parse(source),proofEpoch=a.identity.proofEpoch,sourceScope=p.join(x,'source-scope.json');
const configSHA256=hash(fs.readFileSync(context));
write(sourceScope,{schema:1,kind:'soundmap-retained-source-continuity',approved:false,gameRoot:g,configSHA256,proofEpoch,gameExecutableBytes:fs.statSync(p.join(g,'GTA5_Enhanced.exe')).size,gameExecutableSHA256,archives});
const pages=a.tiles.flatMap(t=>t.pages[0]),t=a.tiles.find(t=>t.pages.every(level=>level.length===1));
write(p.join(x,'fixture-viewer.json'),{atlas,atlasSHA256:hash(source),context,sourceScope,port:Number(port),
 centre:t.bounds.min.map((n,i)=>(n+t.bounds.max[i])/2),overviewPages:pages.length,overviewTriangles:pages.reduce((n,page)=>n+page.triangles,0)});
"@
 & $node -e $code $game $x $candidate.atlas $port $shared
 Check ($LASTEXITCODE -eq 0) 'Fixture source generation failed'
 return @{name=$name;x=$x;game=$game;targets=$dest;protected=$protected}
}
function RunFixture($fixture,$op){
 & $entry -Operation $op -SealSHA256 $seal -FixtureName $fixture.name
}
function Refuse($fixture,$op,$pattern){
 try{RunFixture $fixture $op;throw 'Unexpected operation success'}catch{if($_.Exception.Message -notmatch $pattern){throw}}
}
function Snapshot($f){
 @(Get-ChildItem -LiteralPath $f.game -Recurse -File | Sort-Object FullName | ForEach-Object {
  $s=Get-Menu02RestoreFileState $_.FullName
  @{path=$_.FullName;bytes=$s.bytes;sha256=$s.sha256;metadata=$s.metadata}
 })
}
function Differences($before,$after){
 Check ($before.Count -eq $after.Count) 'Disposable installation file inventory changed'
 for($i=0;$i -lt $before.Count;$i++){
  $a=$before[$i];$b=$after[$i]
  Check ($a.path -ceq $b.path) 'Disposable file paths changed'
  if($a.bytes -ne $b.bytes -or $a.sha256 -cne $b.sha256 -or $a.metadata.creationTimeUtc -cne $b.metadata.creationTimeUtc -or
   $a.metadata.lastWriteTimeUtc -cne $b.metadata.lastWriteTimeUtc -or $a.metadata.attributes -ne $b.metadata.attributes -or $a.metadata.sddl -cne $b.metadata.sddl){$a.path}
 }
}
function AwaitFile($f,$name,$controller){
 $file=Join-Path $f.x $name
 $clock=[Diagnostics.Stopwatch]::StartNew()
 do{
  if(Test-Path -LiteralPath $file){
   try{return ReadFixtureJson $file}catch [System.Management.Automation.RuntimeException] {}
  }
  if($controller.HasExited -or $clock.Elapsed.TotalSeconds -gt 100){
   $logs=Get-Content -LiteralPath (Join-Path $f.x 'controller.stderr.log') -Tail 8
   throw "Missing $name in $($f.x). $logs"
  }
  Start-Sleep -Milliseconds 150
 }while($true)
}
function StartFixture($f){
 $start=Join-Path $q 'Start-SoundMapQualification.ps1'
 $command="& '$start' -FixtureName '$($f.name)' -FixtureSeal '$seal' -AcceptSettingsTimestampOnly"
 $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
 $p=Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',$encoded) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $f.x 'controller.stdout.log') -RedirectStandardError (Join-Path $f.x 'controller.stderr.log')
 $null=$p.Handle
 return $p
}
function SignalFixture($f,$name){[IO.File]::WriteAllText((Join-Path $f.x $name),'disposable test signal')}
function CheckStaging($f,$before){
 $staged=Snapshot $f
 $delta=@(Differences $before $staged)
 $stage=@(ReadFixtureJson (Join-Path $f.x 'staging-closure.json'))
 $receipt=ReadFixtureJson (Join-Path $f.x 'transaction/deployed.json')
 Check ($delta.Count -eq 2 -and $receipt.files.Count -eq 2 -and $stage.Count -eq 2 -and
  @($stage|Where-Object {$_.owned -or $_.active.Count}).Count -eq 0) 'Stage did not run with an absent viewer and exact target population'
 foreach($target in $f.targets){
  $file=Safe-Path $f.game $target.relative
  Check ($file -cin $delta -and (Digest $file) -ceq $target.sha256) 'Staged payload differs'
 }
}
function CheckResult($f,$before,$expectedLaunch,$expectedStop,$controller){
 Check ($controller.WaitForExit(40000)) 'Production fixture controller did not join'
 $summary=ReadFixtureJson (Join-Path $f.x 'session-summary.json')
 $join=ReadFixtureJson (Join-Path $f.x 'supervision.json')
 $closed=@(ReadFixtureJson (Join-Path $f.x 'restoration-closure.json'))
 $restore=ReadFixtureJson (Join-Path $f.x 'transaction/restored.json')
 $baseline=ReadFixtureJson (Join-Path $f.x 'transaction/independent-baseline.json')
 $after=ReadFixtureJson (Join-Path $f.x 'protected-baseline-after.json')
 Check ($summary.restored -and $summary.launchCompleted -eq $expectedLaunch -and $summary.elapsedCutoff -eq $null -and
  $summary.stopReason -match $expectedStop -and !$summary.restorationError -and
  $summary.sourcePostcheck -eq $expectedLaunch -and $summary.gameObserved -eq $expectedLaunch) 'Unexpected controller result'
 Check ($join.ControlJoined -and !$join.UnknownClosure -and $join.MaximumSeconds -eq $null -and $closed.Count -eq 2 -and
  @($closed | Where-Object {$_.active.Count}).Count -eq 0) 'Independent closure or untimed ownership failed'
 Check ($baseline.verified -and $restore.succeeded -and $restore.completedTargets.Count -eq 2 -and
  @($restore.completedTargets|Where-Object {!($_.originalBytes -and $_.timestamps -and $_.attributes -and $_.accessPermissions)}).Count -eq 0) 'Exact restoration failed'
 $changes=@(Differences $before (Snapshot $f))
 if($after.settingsException){
  Check ($changes.Count -eq 1 -and $changes[0] -ceq (Safe-Path $f.game 'settings.xml') -and $after.settingsException.bytesHashIdentityCreationAttributesPermissionsMatch -and
   !$after.settingsException.timestampRewritten) 'Post-launch fixture timestamp exception differs'
 }else{Check ($changes.Count -eq 0) 'Independent fixture baseline changed'}
 $launchClaim=Test-Path -LiteralPath (Join-Path $f.x 'launch-intent.json')
 Check ($launchClaim -eq $expectedLaunch) 'Launch count differs'
 if($expectedLaunch){
  $terminal=ReadFixtureJson (Join-Path $f.x 'service-terminal.json')
  Check ($terminal.rendererFrames -eq 0 -and $join.Completed -and $controller.ExitCode -eq 0) 'Camera-only terminal differs'
 }
 return @{fixture=$f.x;summary=$summary;closure=$closed;controllerExit=$controller.ExitCode;joined=$join.ControlJoined;restored=$baseline.verified;settingsException=$after.settingsException;launches=[int]$launchClaim}
}
$main=NewFixture -HoldBeforeLaunch
$before=Snapshot $main
$legacy=& { $Mode='Preflight'; . ./tools/playable/QualificationTransaction01.ps1; $Mode }
Check ($legacy -ceq 'Validate') 'Fixture did not exercise the known helper scope collision'
$controller=StartFixture $main
$ownershipRejections=[Collections.Generic.List[string]]::new()
function RejectClaim($case,$files,$mutate,$reason){
 $original=@{};$claims=@{}
 foreach($name in $files){
  $file=Join-Path $main.x $name
  $original[$name]=[IO.File]::ReadAllBytes($file)
  $claims[$name]=ReadFixtureJson $file
 }
 try{
  & $mutate $claims
  foreach($name in $files){[IO.File]::WriteAllText((Join-Path $main.x $name),($claims[$name]|ConvertTo-Json -Depth 10))}
  Refuse $main VerifyViewer $reason
  Check (!(Test-Path (Join-Path $main.x 'launch-intent.json'))) 'Rejected claim reached launch'
  $ownershipRejections.Add($case)
 }finally{foreach($name in $files){[IO.File]::WriteAllBytes((Join-Path $main.x $name),$original[$name])}}
}
function ViewRequest($fixture,$route,$body){
 $d=ReadFixtureJson (Join-Path $fixture.x 'service-root/.local/soundmap/service.json')
 $args01=@{Uri=$d.url+$route;Headers=@{'X-RichAudio-Token'=$d.token};TimeoutSec=5;NoProxy=$true}
 if($null -ne $body){$args01.Method='Post';$args01.ContentType='application/json';$args01.Body=$body}
 Invoke-RestMethod @args01
}
try{
 $overview=AwaitFile $main 'overview-before-launch.json' $controller
 $p=ReadFixtureJson (Join-Path $main.x 'preflight-complete.json')
 $proof=ReadFixtureJson (Join-Path $main.x 'current-source-identity.json')
 $stage=ReadFixtureJson (Join-Path $main.x 'staging-complete.json')
 $dispatch=ReadFixtureJson (Join-Path $main.x 'viewer-start-intent.json')
 Check ($p.operation -ceq 'Preflight' -and $proof.matchingArchiveIdentities -eq 123 -and $proof.archiveContentBytesRead -eq 0 -and
  $stage.deployedSHA256 -ceq (Digest (Join-Path $main.x 'transaction/deployed.json')) -and
  $dispatch.stagingSHA256 -ceq (Digest (Join-Path $main.x 'staging-complete.json'))) 'Production preflight/staging/dispatch lineage differs'
 CheckStaging $main $before
 Check ($overview.viewer.overviewPages -eq $candidate.overviewPages -and $overview.viewer.visibleTriangles -eq $candidate.overviewTriangles -and
  $overview.acceptedCameraFrames -eq 0 -and !(Test-Path (Join-Path $main.x 'launch-intent.json'))) 'Full retained overview did not precede launch'
 $preChurn=RunFixture $main VerifyViewer
 Check ($preChurn.browserIds.Count -gt 1) 'Multiple owned Chrome processes required'
 $intent=ReadFixtureJson (Join-Path $main.x 'execution-intent.json')
 $binding=ReadFixtureJson (Join-Path $main.x 'job-ownership.json')
 $supervisor=Get-Process -Id $binding.supervisorId -ErrorAction Stop
 $job=[RichAudio.SoundMap.JobQuery]::new($supervisor,[long]$binding.handle)
 $churnCode=@'
const fs=require('node:fs');const [profile,signal,done]=process.argv.slice(2);
(async()=>{
 const [port,url]=fs.readFileSync(require('node:path').join(profile,'DevToolsActivePort'),'utf8').trim().split(String.fromCharCode(10)).map(line=>line.trim());
 const socket=new WebSocket('ws://127.0.0.1:'+port+url);
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
 let id=0;const pending=new Map();
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}});
 const send=(method,params)=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
 const target=await send('Target.createTarget',{url:'data:text/html,<title>Disposable ownership churn</title>',background:true});
 fs.writeFileSync(signal,'created',{flag:'wx'});
 for(let i=0;i<160&&!fs.existsSync(done);i++)await new Promise(r=>setTimeout(r,100));
 await send('Target.closeTarget',{targetId:target.targetId});socket.close();
})().catch(e=>{console.error(e);process.exit(1)});
'@
 $churnFile=Join-Path $main.x 'browser-churn.cjs'
 [IO.File]::WriteAllText($churnFile,$churnCode)
 $profile=Join-Path $main.x 'browser-profile'
 $signal=Join-Path $main.x 'browser-churn-started'
 $done=Join-Path $main.x 'browser-churn-close'
 $baselineMembers=@($job.Members())
 $churn=Start-Process -FilePath $node -ArgumentList (@($churnFile,$profile,$signal,$done)|ForEach-Object {'"'+$_+'"'}) -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $main.x 'browser-churn.stderr.log')
 $null=$churn.Handle
 try{
  $clock=[Diagnostics.Stopwatch]::StartNew()
  do{
   Check (!$churn.HasExited -and $clock.Elapsed.TotalSeconds -lt 12) 'Chrome did not start an owned renderer for the rehearsal tab'
   $new=@(Get-SoundMapProfileProcesses01 $main.x | Where-Object {$_.id -notin $baselineMembers -and $_.CommandLine -match '--type=renderer'})
   if(!$new.Count){Start-Sleep -Milliseconds 150}
  }while(!(Test-Path -LiteralPath $signal) -or !$new.Count)
  try{Assert-SoundMapProfilePopulation01 $job $baselineMembers $new;throw 'Stale snapshot qualified'}catch [TimeoutException]{
   Check ($_.Exception.Message -match 'New owned SoundMap browser') 'New child was not proven to belong to the live job'
  }
  $duringChurn=RunFixture $main VerifyViewer
  Check (@($new|Where-Object id -In $duringChurn.browserIds).Count -gt 0) 'Fresh production verification did not include the new Chrome child'
 }finally{
  [IO.File]::WriteAllText($done,'close rehearsal tab')
  $null=$churn.WaitForExit(18000)
  if(!$churn.HasExited){$churn.Kill()}
  $churn.Dispose()
  $job.Dispose()
  $supervisor.Dispose()
 }
 $clock=[Diagnostics.Stopwatch]::StartNew()
 do{
  $afterChurn=RunFixture $main VerifyViewer
  $exited=@($new|Where-Object id -NotIn $afterChurn.browserIds)
  if(!$exited.Count){Start-Sleep -Milliseconds 150}
 }while(!$exited.Count -and $clock.Elapsed.TotalSeconds -lt 10)
 Check ($exited.Count -gt 0) 'Chrome child exit was not observed in production verification'
 RejectClaim 'forged-job-handle' @('job-ownership.json') {param($c)$c['job-ownership.json'].handle=1} 'Exception calling ".ctor"|Exception calling "Members"'
 RejectClaim 'reused-pid' @('viewer-process.json') {param($c)$c['viewer-process.json'].creation='1'} 'process lifetime differs'
 RejectClaim 'stale-supervisor' @('job-ownership.json','supervisor-process.json') {
  param($c)$c['job-ownership.json'].supervisorCreation='1';$c['supervisor-process.json'].creation='1'
 } 'process lifetime differs'
 RejectClaim 'wrong-executable-path' @('viewer-process.json') {param($c)$c['viewer-process.json'].path='C:
ot-approvedchrome.exe'} 'receipt binding differs'
 RejectClaim 'mismatched-browser-profile' @('viewer-process.json') {param($c)$c['viewer-process.json'].profile='C:
ot-approvedprofile'} 'receipt binding differs'
 $otherProfile=Join-Path $main.x 'unrelated-profile'
 $outside=Start-Process -FilePath $candidate.browser -ArgumentList @('--headless=new','--disable-background-networking',('"--user-data-dir='+$otherProfile+'"'),('"--soundmap-profile-probe='+$profile+'"'),'about:blank') -WindowStyle Hidden -PassThru
 try{
  $null=$outside.Handle
  Refuse $main VerifyViewer 'Unrelated browser claims the SoundMap profile'
  $ownershipRejections.Add('unrelated-chrome')
  RejectClaim 'escaped-child' @('viewer-process.json') {
   param($c)$c['viewer-process.json'].id=$outside.Id;$c['viewer-process.json'].creation=$outside.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()
  } 'escaped the supervisor job'
 }finally{
  if(!$outside.HasExited){$outside.Kill($true)}
  $null=$outside.WaitForExit(5000)
  $outside.Dispose()
 }
 SignalFixture $main 'fixture-release-launch.request'
 $launch=AwaitFile $main 'launcher.json' $controller
 Check ($launch.fixtureOnly -and (Get-Process -Id $launch.id -ErrorAction Stop)) 'Inert launch process was not observed'
 Refuse $main Restore 'Relevant processes still present'
 $ownershipRejections.Add('active-viewer-and-simulated-game-refused-restore')
 $cfg=ReadFixtureJson (Join-Path $main.x 'fixture-viewer.json')
 $frame=@{schemaVersion=1;kind='passive-listener';streamId=('b'*32);sessionId=('c'*32);sequence=1;observedAtUnixMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();sampleAgeMs=0;
  coordinateSpace='gta-native-unscaled';units='native-unverified';listener=@{position=$cfg.centre;forward=@(0,1,0);up=@(0,0,1);velocity=$null;valid=$true;reason='disposable camera';generation=1};
  interiorReadback=@{outcome='no-proxy';proxy=0;ready=$null;archetype=$null;origin=$null;offsetMs=0}}
 $ack=ViewRequest $main '/api/passive' ($frame|ConvertTo-Json -Depth 5 -Compress)
 Check $ack.accepted 'Disposable camera transport was not accepted'
 Start-Sleep -Milliseconds 1400
 $stale=ViewRequest $main '/api/frame'
 Check ($stale.passive.ageMs -gt 500 -and $stale.atlasContext.interior -eq $null -and $stale.status.operatorMap.metrics.visibleTriangles -gt 0) 'Camera expiry stopped the viewer'
 [IO.File]::SetLastWriteTimeUtc((Safe-Path $main.game 'settings.xml'),[DateTime]::UtcNow)
 $stop=ViewRequest $main '/api/operator/stop' '{"end":true}'
 Check ($stop.stopRequestedAt -and (Get-Process -Id $launch.id -ErrorAction Stop)) 'Operator stop forced the simulated game to exit'
 Start-Sleep -Seconds 2
 SignalFixture $main 'fixture-game-exit.request'
 $success=CheckResult $main $before $true '^operator-ended$' $controller
}finally{
 if(!$controller.HasExited){
  SignalFixture $main 'fixture-release-launch.request'
  SignalFixture $main 'fixture-game-exit.request'
  SignalFixture $main 'viewer-shutdown.request'
  $null=$controller.WaitForExit(40000)
 }
 $controller.Dispose()
}

function FailureCase($scenario){
 $f=NewFixture -FailBeforeViewer:($scenario -ceq 'before-viewer') -HoldBeforeLaunch:($scenario -ceq 'after-overview')
 $original=Snapshot $f
 $c=StartFixture $f
 try{
  switch($scenario){
   'before-viewer' {
    $result=CheckResult $f $original $false 'failed to present' $c
    Check (!(Test-Path (Join-Path $f.x 'viewer-process.json')) -and $c.ExitCode -ne 0) 'Startup fault reached Chrome or returned success'
   }
   'after-overview' {
    $observed=AwaitFile $f 'overview-before-launch.json' $c
    Check ($observed.viewer.overviewPages -eq $candidate.overviewPages) 'Failure fixture overview did not open'
    Refuse $f Restore 'Relevant processes still present'
    $ownershipRejections.Add('active-viewer-refused-restore')
    $stop=ViewRequest $f '/api/operator/stop' '{"end":true}'
    Check $stop.stopRequestedAt 'Prelaunch viewer stop was not observed'
    SignalFixture $f 'fixture-release-launch.request'
    $result=CheckResult $f $original $false 'Viewer stopped before launch' $c
    Check ($result.summary.ownedServiceTerminal -and $c.ExitCode -ne 0) 'Prelaunch viewer failure was not closed'
   }
   'premature-game-exit' {
    $null=AwaitFile $f 'launcher.json' $c
    $clock=[Diagnostics.Stopwatch]::StartNew()
    while(!(Test-Path -LiteralPath (Join-Path $f.x 'samples.jsonl'))){
     Check (!$c.HasExited -and $clock.Elapsed.TotalSeconds -lt 12) 'Simulated GTA lifetime was not observed'
     Start-Sleep -Milliseconds 150
    }
    SignalFixture $f 'fixture-game-exit.request'
    $result=CheckResult $f $original $true '^$' $c
    Check (!(Test-Path (Join-Path $f.x 'camera-ready.json')) -and
     (Test-Path (Join-Path $f.x 'game-exit-observed.json'))) 'Premature exit was not recorded before camera readiness'
   }
  }
  return $result
 }finally{
  if(!$c.HasExited){
   SignalFixture $f 'fixture-release-launch.request'
   SignalFixture $f 'fixture-game-exit.request'
   SignalFixture $f 'viewer-shutdown.request'
   $null=$c.WaitForExit(40000)
  }
  $c.Dispose()
 }
}
$failures=[ordered]@{}
foreach($scenario in 'before-viewer','after-overview','premature-game-exit'){$failures[$scenario]=FailureCase $scenario}
function RejectFixture($name,$mutate,$reason){
 $f=NewFixture -Direct
 $settings=Safe-Path $f.game 'settings.xml'
 & $mutate $settings $f
 $atReject=Snapshot $f
 Refuse $f Preflight $reason
 Refuse $f Stage 'preflight-complete.json'
 Refuse $f Restore 'No completed deployment transaction'
 Check (!(Test-Path (Join-Path $f.x 'transaction')) -and !(Test-Path (Join-Path $f.x 'source-approval.json'))) 'Rejected baseline reached staging, restore or source checks'
 Check (@(Differences $atReject (Snapshot $f)).Count -eq 0) 'Rejected baseline was changed'
 return @{case=$name;fixture=$f.x;rejected=$true;staged=$false;restored=$false;reason=$reason}
}
$negatives=@(
 RejectFixture 'old-timestamp' {param($settings,$f) [IO.File]::SetLastWriteTimeUtc($settings,$oldTime)} 'Protected last-write timestamp drift'
 RejectFixture 'unexpected-pre-session-timestamp' {param($settings,$f) [IO.File]::SetLastWriteTimeUtc($settings,$approvedTime.AddSeconds(1))} 'Protected last-write timestamp drift'
 RejectFixture 'same-length-content-change' {
  param($settings,$f)
  $b=[IO.File]::ReadAllBytes($settings)
  $b[0]=$b[0] -bxor 1
  [IO.File]::WriteAllBytes($settings,$b)
  [IO.File]::SetLastWriteTimeUtc($settings,$approvedTime)
 } 'Protected bytes or metadata drift'
 RejectFixture 'same-content-replacement-identity' {
  param($settings,$f)
  $m=Get-Menu02RestoreFileState $settings
  $oldPath=Join-Path $f.x 'displaced-fixture-settings.xml'
  [IO.File]::Move($settings,$oldPath)
  [IO.File]::Copy($oldPath,$settings)
  [IO.File]::SetCreationTimeUtc($settings,[DateTimeOffset]::Parse($m.metadata.creationTimeUtc).UtcDateTime)
  [IO.File]::SetLastWriteTimeUtc($settings,$approvedTime)
 } 'Fresh file/directory identity differs'
 RejectFixture 'changed-permissions' {
  param($settings,$f)
  $acl=Get-Acl -LiteralPath $settings
  $acl.SetAccessRuleProtection($true,$true)
  Set-Acl -LiteralPath $settings -AclObject $acl
 } 'Protected bytes or metadata drift'
 RejectFixture 'unexpected-protected-file-change' {
  param($settings,$f)
  [IO.File]::AppendAllText((Safe-Path $f.game 'startup.rphs'),'fixture drift')
 } 'Protected presence or length drift'
)
$report=@{sealSHA256=$seal;sourceCommit=(git rev-parse HEAD);entrypoint=(Join-Path $q 'Start-SoundMapQualification.ps1');
 helperModeAfterImport=$legacy;actualPreflightOperation=$p.operation;fixtureArchiveIdentities=$proof.matchingArchiveIdentities;
 fixtureArchiveContentBytesRead=0;protectedInstalledReads=0;protectedInstalledWrites=0;gtaLaunches=0;exactStagedTargets=@($main.targets.relative);
 overviewPages=$overview.viewer.overviewPages;overviewTriangles=$overview.viewer.visibleTriangles;cameraExpiryKeptAtlas=$true;stagePrecededViewer=$true;viewerPrecededLaunch=$true;
 browserBefore=$preChurn.browserIds;browserDuring=$duringChurn.browserIds;browserAfter=$afterChurn.browserIds;ownedNewChild=@($new.id);exitedChild=@($exited.id);
 ownershipRejections=@($ownershipRejections);success=$success;failures=$failures;baselineRejections=$negatives}
$out=Join-Path $q ('rehearsal-'+[guid]::NewGuid().ToString('N')+'.json')
SaveFixtureJson $out $report
[pscustomobject]@{receipt=$out;overviewPages=$report.overviewPages;overviewTriangles=$report.overviewTriangles;ownershipRejections=$ownershipRejections.Count;
 failureCases=$failures.Count;baselineRejections=$negatives.Count;protectedInstalledReads=0;protectedInstalledWrites=0;gtaLaunches=0}|ConvertTo-Json
