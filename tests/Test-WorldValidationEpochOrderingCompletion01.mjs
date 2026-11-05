// Actual production-driver control flow with a test-only phase observer.
// All archives, executables, parser files and collision data are authored here.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawn} from 'node:child_process';
import {originalInstalledCache01} from './fixtures/InstalledStaticCache01.mjs';
import {buildWarmupPlan,acceptBatch} from '../src/acoustics/world/world-warmup.mjs';
import {InstalledStaticWorld01,installedStaticSceneMetadata01} from '../src/acoustics/world/installed-static-scene01.mjs';
import {sha256} from '../src/acoustics/world/collision-mesh.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const driver=path.resolve('tools/Prepare-InstalledCollisionWorld.ps1');
function instrumentDriver01(text){
 const declaration='function RunOwned([string]$Command,[string]$Phase){',next='function RunNode([string[]]$Values,[string]$Phase){';
 assert.equal(text.split(declaration).length,2,'one production owned-process implementation');assert.equal(text.split(next).length,2,'one production Node dispatch implementation');
 const observer=`function RunOwned([string]$Command,[string]$Phase){
 $hook=$env:RICHAUDIO_ORIGINAL_ORDER_HOOK_ROOT
 if($Phase -eq 'verifying-source-archive-after-cache-work'){
  [IO.File]::WriteAllText((Join-Path $hook 'before-final-hash.pause'),'actual-driver-boundary')
  $gate=[Diagnostics.Stopwatch]::StartNew()
  while(![IO.File]::Exists((Join-Path $hook 'release-final-hash'))){if($gate.Elapsed.TotalSeconds-gt15){throw 'Original ordering observer timed out'};Start-Sleep -Milliseconds 5}
 }
 InvokeActualOwnedOrdering01 $Command $Phase
 $manifestFile=Join-Path $output 'manifest.json';$snapshot=$null
 if([IO.File]::Exists($manifestFile)){$snapshot=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json}
 $hashFile=Join-Path $output 'archive-hash.txt';$hash=if([IO.File]::Exists($hashFile)){[IO.File]::ReadAllText($hashFile).Trim()}else{$null}
 $proofs=@(if($snapshot){$snapshot.Resources|ForEach-Object{[ordered]@{Id=$_.Id;Status=$_.Status;ArchiveValidation01=$_.ArchiveValidation01}}})
 $record=[ordered]@{Phase=$Phase;ArchiveHash=$hash;ValidationEpochUtc01=if($snapshot){$snapshot.ValidationEpochUtc01}else{$null};Rows=$proofs}
 [IO.File]::AppendAllText((Join-Path $hook 'actual-driver-phases.jsonl'),($record|ConvertTo-Json -Depth 12 -Compress)+[Environment]::NewLine)
}
`;
 return text.replace(declaration,'function InvokeActualOwnedOrdering01([string]$Command,[string]$Phase){').replace(next,observer+next);
}
function activeSurfaceCount01(arm){
 const world=new InstalledStaticWorld01({manifestPath:arm.manifestPath,catalogPath:arm.catalogPath,catalogSHA256:arm.catalogSHA256,requiredValidationEpochUtc01:arm.epoch});
 try{return installedStaticSceneMetadata01(world.window({listener:[0,-2,2],sources:[[0,2,2]],session:'a'.repeat(32),generation:1,geometryTimeMs:0,durationMs:1000,radius:8})).activeSurfaces;}finally{world.close();}
}
function makeArm01(original,root,name,wrapper){
 const folder=path.join(root,name),cache=path.join(folder,'cache'),game=path.join(folder,'game'),core=path.join(folder,'core'),output=path.join(folder,'geometry');fs.mkdirSync(folder);fs.cpSync(original.root,cache,{recursive:true});for(const directory of [game,core,output])fs.mkdirSync(directory);
 fs.writeFileSync(path.join(game,'GTA5_Enhanced.exe'),'original inert executable identity');fs.writeFileSync(path.join(core,'CodeWalker.Core.dll'),'original inert parser identity');const archive=path.join(game,'a.rpf');fs.writeFileSync(archive,'original authored archive bytes A');
 const catalogPath=path.join(cache,'catalog.json'),catalog=read(catalogPath),gameHash=sha256(fs.readFileSync(path.join(game,'GTA5_Enhanced.exe'))),coreHash=sha256(fs.readFileSync(path.join(core,'CodeWalker.Core.dll'))),beforeHash=sha256(fs.readFileSync(archive));catalog.InputBinding={GameExecutableSHA256:gameHash,CodeWalkerCoreSHA256:coreHash};fs.writeFileSync(catalogPath,JSON.stringify(catalog));const catalogSHA256=sha256(fs.readFileSync(catalogPath));
 const receiptPath=path.join(cache,'receipt.json'),receipt=read(receiptPath);receipt.BeforeSHA256=receipt.AfterSHA256=beforeHash;receipt.ParserSHA256=coreHash;receipt.Result.index=path.join(cache,path.basename(path.dirname(receipt.Result.index)),'index.json');fs.writeFileSync(receiptPath,JSON.stringify(receipt));
 const plan=buildWarmupPlan(catalog,catalogSHA256,{gameRoot:game});acceptBatch(plan,{Schema:1,ArchiveUnchanged:true,AfterSHA256:beforeHash,Resources:[{Entry:catalog.Resources[0].Path,ReceiptPath:receiptPath}]},catalogPath,catalogSHA256);const manifestPath=path.join(output,'manifest.json');fs.writeFileSync(manifestPath,JSON.stringify(plan));
 const epoch=new Date().toISOString(),stdout=fs.openSync(path.join(folder,'stdout.log'),'wx'),stderr=fs.openSync(path.join(folder,'stderr.log'),'wx'),child=spawn('pwsh',['-NoProfile','-File',wrapper,'-PrepareScriptPath',driver,'-GameRoot',game,'-CodeWalkerRoot',core,'-ResolvedCatalogPath',catalogPath,'-ResolvedCatalogSHA256',catalogSHA256,'-OutputRoot',output,'-ObservationNotBeforeUtc',epoch,'-MaximumSeconds','60','-MaximumResources','16','-MaximumMemoryMiB','512'],{windowsHide:true,stdio:['ignore',stdout,stderr],env:{...process.env,RICHAUDIO_ORIGINAL_ORDER_HOOK_ROOT:folder}});fs.closeSync(stdout);fs.closeSync(stderr);
 const state={done:false,closed:false,code:null,error:null};let resolveClosed;const closed=new Promise(resolve=>{resolveClosed=resolve;});child.on('error',error=>{state.error=error;state.done=true;});child.on('exit',code=>{state.code=code;state.done=true;});child.on('close',()=>{state.closed=true;resolveClosed(true);});return {folder,archive,output,manifestPath,catalogPath,catalogSHA256,epoch,beforeHash,child,state,closed};
}
async function wait01(arm,predicate,milliseconds,why){const began=performance.now();while(!predicate()){if(arm.state.done)assert.fail(why+': actual driver ended '+arm.state.code+'; retained '+arm.folder);if(performance.now()-began>milliseconds)assert.fail(why+': bounded wait expired; retained '+arm.folder);await pause(10);}}
async function closeArm01(arm){
 let killed=false;const bounded=async milliseconds=>{let timer;try{return await Promise.race([arm.closed,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),milliseconds);})]);}finally{clearTimeout(timer);}};
 if(!arm.state.done){fs.writeFileSync(path.join(arm.folder,'release-final-hash'),'abort fixture');fs.writeFileSync(path.join(arm.output,'cancel.request'),'original-ordering-fixture-stop');}
 let closed=arm.state.closed||await bounded(3000);if(!closed){killed=true;arm.child.kill();closed=await bounded(3000);}
 fs.writeFileSync(path.join(arm.folder,'fixture-closure.json'),JSON.stringify({childCloseObserved:closed,forcedOwnedDriverStop:killed,exitCode:arm.state.code,spawnError:arm.state.error?.message??null,descendantClosureAuthority:'Production driver owned Windows Job; last completed helper closure remains in its retained metrics'},null,2));
 assert(closed,'original driver child closure must be observed after bounded cancellation/kill; retained '+arm.folder);
}
test('actual driver withholds epoch proof until equal final hash and never stamps an archive changed at the final boundary',{timeout:120000},async t=>{
 const original=originalInstalledCache01(),root=path.resolve('.local/street01-completion01/world-ordering-original',crypto.randomUUID());fs.mkdirSync(root,{recursive:true});const source=fs.readFileSync(driver,'utf8'),sourceSHA256=sha256(Buffer.from(source)),wrapper=path.join(root,'ObserveActualDriver.ps1');fs.writeFileSync(wrapper,instrumentDriver01(source));const results=[];
 try{for(const name of ['unchanged','changed-after-before-hash']){
  const arm=makeArm01(original,root,name,wrapper);
  try{
   await wait01(arm,()=>fs.existsSync(path.join(arm.folder,'before-final-hash.pause')),45000,'reach real pre-final-hash boundary');
   const pending=read(arm.manifestPath);assert.equal(pending.ValidationEpochUtc01,arm.epoch,'actual plan binds exact requested epoch');assert(pending.Resources.every(row=>row.ArchiveValidation01?.EpochUtc!==arm.epoch),'no resource may carry current epoch before final hash');assert.equal(activeSurfaceCount01(arm),0,'required-epoch factory cannot activate geometry at pre-final boundary');
   if(name!=='unchanged'){const stat=fs.statSync(arm.archive);fs.writeFileSync(arm.archive,'original authored archive bytes B');fs.utimesSync(arm.archive,stat.atime,stat.mtime);assert.equal(fs.statSync(arm.archive).size,stat.size);assert(Math.abs(fs.statSync(arm.archive).mtimeMs-stat.mtimeMs)<1,'authored mutation retains size/time');}
   fs.writeFileSync(path.join(arm.folder,'release-final-hash'),'continue real production helper');await wait01(arm,()=>arm.state.done,20000,'actual driver completion');assert.equal(arm.state.error,null);
   const trace=fs.readFileSync(path.join(arm.folder,'actual-driver-phases.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse),afterIndex=trace.findIndex(row=>row.Phase==='verifying-source-archive-after-cache-work');assert(afterIndex>=0,'actual final hashing helper was observed');
   for(const [index,step]of trace.entries())if(step.Rows.some(row=>row.ArchiveValidation01?.EpochUtc===arm.epoch)){assert(index>afterIndex,'epoch proof cannot precede or coincide with the after-hash helper');assert.equal(trace[afterIndex].ArchiveHash,arm.beforeHash,'proof requires final hash equal to original before hash');}
   const final=read(arm.manifestPath);
   if(name==='unchanged'){assert.equal(arm.state.code,0);assert(final.Resources.every(row=>row.ArchiveValidation01?.EpochUtc===arm.epoch&&row.ArchiveValidation01.ArchiveSHA256===arm.beforeHash));assert(activeSurfaceCount01(arm)>0,'equal completed archive validation enables original supported geometry');}
   else{assert.notEqual(arm.state.code,0);assert(final.Resources.every(row=>row.ArchiveValidation01?.EpochUtc!==arm.epoch),'changed archive cannot retain a current epoch proof');assert.equal(activeSurfaceCount01(arm),0);assert.equal(read(path.join(arm.output,'catalog-source-change01.json')).ArchiveSHA256,sha256(fs.readFileSync(arm.archive)));assert(trace.every(step=>step.Rows.every(row=>row.ArchiveValidation01?.EpochUtc!==arm.epoch)),'changed arm never transiently publishes epoch proof');}
   results.push({name,exitCode:arm.state.code,epochProofBeforeFinalHash:false,activeBeforeFinal:0,actualDriverPhases:trace.length});
  }finally{await closeArm01(arm);}
 }
 assert.equal(sha256(fs.readFileSync(driver)),sourceSHA256,'production driver stayed unchanged during control');fs.writeFileSync(path.join(root,'validation.json'),JSON.stringify({schema:1,passed:true,kind:'RichAudioActualDriverEpochOrderingOriginal01',sourceSHA256,observerSHA256:sha256(fs.readFileSync(wrapper)),results,productionSourceEdited:false,installedArchivesRead:false,gameOrVendorCodeExecuted:false,endpointOpened:false},null,2));t.diagnostic('Actual driver original ordering evidence: '+root);
 }finally{original.close();}
});
