// Bankless observation consumer. Reads the private capture and the retained derived cache only.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as wait} from 'node:timers/promises';
import {InstalledSceneService01} from '../../src/acoustics/world/installed-scene-service01.mjs';
import {StockGameplay} from '../../src/acoustics/vehicle/gameplay.mjs';
import {bindCameraInterior01,matchInteriorInstance01} from '../../src/acoustics/world/interior-activation01.mjs';
import {interiorInstanceIdentities01} from '../../src/acoustics/world/interior-placements-completion01.mjs';

const maxBytes=8*1024*1024;
const sha=b=>createHash('sha256').update(b).digest('hex');
function pinned(filename,hash){
 if(!/^[a-f0-9]{64}$/.test(hash)||fs.statSync(filename).size>64*1024*1024)throw Error('bounded pinned JSON required');
 const b=fs.readFileSync(filename);
 if(sha(b)!==hash)throw Error('JSON digest differs');
 return JSON.parse(b.toString('utf8').replace(/^\uFEFF/,''));
}

const [planPath,capture,session,result,armByUtcMs,stopByUtcMs]=process.argv.slice(2);
if(!result||!capture||!/^[a-f0-9]{32}$/.test(session??'')||!/^\d+$/.test(armByUtcMs??'')||!/^\d+$/.test(stopByUtcMs??''))
 throw Error('Usage: node Observe-CombinedWorld01.mjs plan.json capture.jsonl session result.jsonl <arm cutoff UTC epoch ms> <observation cutoff UTC epoch ms>');
const startUtc=Date.now(),remainingToArmMs=Number(armByUtcMs)-startUtc,remainingToStopMs=Number(stopByUtcMs)-startUtc;
if(!Number.isSafeInteger(remainingToArmMs)||!Number.isSafeInteger(remainingToStopMs)||
 remainingToArmMs<=0||remainingToStopMs<=remainingToArmMs||remainingToStopMs>25*60_000)throw Error('Invalid session cutoffs');
const start=performance.now(),armCutoff=start+remainingToArmMs,deadline=start+remainingToStopMs;
const plan=JSON.parse(fs.readFileSync(planPath,'utf8').replace(/^\uFEFF/,''));
const catalog=pinned(plan.catalogPath,plan.catalogSHA256);
const manifest=plan.validatedManifestPath?pinned(plan.validatedManifestPath,plan.validatedManifestSHA256):null;
const epoch=manifest?.ValidationEpochUtc01;
if(manifest&&(!epoch||manifest.ResolvedCatalogSHA256!==plan.catalogSHA256||manifest.Resources.length!==catalog.Resources.filter(r=>r.Kind==='ybn').length||
 !plan.resourceIds.every(id=>{const r=manifest.Resources.find(r=>r.Id===id);return r?.PotentialStatus==='imported-resource-root-incomplete-surfaces'&&r.ArchiveValidation01?.Source==='current-archive-sha256'&&r.ArchiveValidation01?.EpochUtc===epoch&&r.ArchiveValidation01.ArchiveSHA256===r.PotentialResult?.ArchiveSHA256;})))
 throw Error('exact selected current-cache proofs required');
const instances=interiorInstanceIdentities01(catalog);
const out=fs.openSync(result,'wx');
const record=x=>fs.writeSync(out,JSON.stringify(x)+'\n');
let service,engine,buffer='',at=0,frames=0,matches=0,clockErrors=0,lastSceneKey=null,lastBinding=null;
let lastCompletedRequest=0,lastConsumerOutcome=null,lastSequence=-1;
let stop=false;
const interrupt=()=>{stop=true;};
process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
try{
 if(manifest){
  const forbidden=()=>{throw Error('Audio banks are not allowed in this observation')};
  service=new InstalledSceneService01({config:{manifestPath:plan.validatedManifestPath,catalogPath:plan.catalogPath,
   expectedGameSHA256:catalog.InputBinding.GameExecutableSHA256,privateRoot:path.resolve(plan.privateRoot)},session,onScene:(scene,receipt)=>{
    const proofs=scene.observationModel.evidence.filter(x=>x.interiorInstanceId);
    const key=JSON.stringify(proofs);
    if(key!==lastSceneKey){lastSceneKey=key;record({type:'worker-publication',generation:receipt.generation,proofs,activeSurfaces:scene.tile.surfaces.length});}
    if(scene.tile.surfaces.length)engine.queueInstalledStaticScene01(scene,receipt);
   },onStatus:status=>{
    for(const row of status.sceneDeliveryDiagnostics01.recent){
     if(row.requestId<=lastCompletedRequest||row.completedAt===undefined||row.outcome==='coalesced-before-dispatch')continue;
     lastCompletedRequest=row.requestId;
     record({type:'worker-result',...row});
    }
   }});
  engine=new StockGameplay({registry:{resolve:forbidden,createSource:forbidden},session,now:()=>performance.now(),continuityPolicy:'camera-source-01'});
  engine.bindInstalledSceneService01(service);
  if(!service.bindPreparationEpoch01(epoch))throw Error('scene epoch rejected');
 }
 record({type:'start',session,sourceProof:manifest?(plan.authoredRehearsal?'authored-rehearsal; not a live source proof':'selected-cache-proofs-bound'):'not-current; raw and match only'});
 let lastMatch,lastAgeError;
 while(!stop&&performance.now()<deadline){
  if(service?.failed)throw Error(service.failure);
  if(fs.existsSync(capture)){
   const fd=fs.openSync(capture,'r');
   try{
    const size=fs.fstatSync(fd).size;
    if(size>maxBytes||size<at)throw Error('capture size/continuity');
    if(size>at){const bytes=Buffer.alloc(size-at);const got=fs.readSync(fd,bytes,0,bytes.length,at);at+=got;buffer+=bytes.subarray(0,got).toString('utf8');}
   }finally{fs.closeSync(fd);}
  }
  const rows=buffer.split('\n');buffer=rows.pop();
  for(const line of rows){
   if(performance.now()>=deadline)break;
   const row=JSON.parse(line),f=row.frame,l=f.listener,r=f.cameraInteriorReadback;
   if(f.session!==session||l.session!==session||l.sequence<=lastSequence||f.vehicles.length!==0||!r)throw Error('unexpected observation session');
   lastSequence=l.sequence;
   frames++;
   const sample=r.outcome==='observed'&&r.ready===true?{proxy:r.proxy,archetype:r.archetype,origin:r.origin,observationTicks:r.sampleTicks}:null;
   const scope={session,generation:l.generation,catalogSHA256:plan.catalogSHA256,epoch:epoch??'retained-match-only'};
   const matched=matchInteriorInstance01(instances,sample&&{...scope,...sample},scope);
   if(matched===plan.instanceId)matches++;
   const key=JSON.stringify([r.outcome,r.proxy,r.ready,r.archetype,matched,l.generation]);
   if(key!==lastMatch){lastMatch=key;record({type:'raw-and-match',sequence:l.sequence,generation:l.generation,raw:r,matched,selected:matched===plan.instanceId});}
   if(!service)continue;
   // Windows libuv hrtime and .NET Stopwatch use the system QPC. Require
   // per-frame domain agreement; negative or delayed samples stay rejected.
   const ticks=Number(process.hrtime.bigint()/1000n)*l.clockFrequency/1e6;
   const receiptDelay=(ticks-row.receivedTicks)*1000/l.clockFrequency;
   const age=(ticks-l.observationTicks)*1000/l.clockFrequency;
   const clockOK=Number.isSafeInteger(l.clockFrequency)&&l.clockFrequency>0&&receiptDelay>=0&&receiptDelay<=250;
   if(!clockOK||!row.fresh||!(age>=0&&age<=250)){
    clockErrors++;service.withdrawCameraInterior01();
    if(lastAgeError!==true)record({type:'live-consumer-age-rejected',receiptDelay,age});
    lastAgeError=true;continue;
   }
   lastAgeError=false;
   const remaining=Math.min(250,250-age);
   if(remaining<=0)continue;
   engine.accept(f,age,remaining);
   const now=performance.now();
   const projection={...f,cameraInterior01:sample,worldPreparationStartedUtc:epoch};
   service.updateWindow({listener:l.position,sources:[],generation:l.generation,geometryTimeMs:now,durationMs:1000,
    cameraInterior01:bindCameraInterior01(projection,age,null),maximumSurfaces:4096,
    prepareSoundMapGeometry01:false,engine:engine.direct.config});
  }
  if(engine){
   engine.applyPendingInstalledStaticScene01();
   engine.tickInstalledScene01();
   const outcomes=engine.installedSceneDiagnostics01.recent;
   for(let i=outcomes.lastIndexOf(lastConsumerOutcome)+1;i<outcomes.length;i++)
    record({type:'consumer-outcome',...outcomes[i]});
   lastConsumerOutcome=outcomes.at(-1)??null;
   const b=engine.staticSceneBinding;
   const state=b?.interiorGeometryActivation??null;
   const evidence=b?engine.pipeline.simulation.scene.observationModel.evidence.filter(e=>e.interiorInstanceId):[];
   const bindingKey=JSON.stringify([state,evidence,b?.generation]);
   if(bindingKey!==lastBinding){
    lastBinding=bindingKey;
    const panel=evidence.length?engine.pipeline.simulation.scene.tile.surfaces[0]:null;
    record({type:'consumer-binding',at:performance.now(),sequence:lastSequence,activation:state,binding:b??null,evidence,
     samplePanel:panel?{id:panel.id,center:panel.center,materialId:panel.materialId}:null});
   }
  }
  if(fs.existsSync(capture+'.closed')&&fs.statSync(capture).size===at||frames===0&&performance.now()>=armCutoff+30_000)break;
  await wait(20);
 }
}finally{
 try{
  if(engine)engine.beginStopInstalledScene01(performance.now(),'observation-stop');
  const closure=await service?.close();
  await engine?.close();
  if(engine)record({type:'consumer-summary',consumer:engine.installedSceneDiagnostics01,
   readiness:service.readinessSnapshot01(),worker:service.snapshot().worker});
  record({type:'end',frames,matches,clockErrors,partialLine:buffer.length!==0,workerJoined:closure?.workerJoined??null});
 }finally{fs.closeSync(out);}
}
