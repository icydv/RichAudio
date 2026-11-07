// Genuine retained camera input and derived geometry with original procedural
// vehicle PCM and authored source poses. Runs the normal producer, no host,
// device, installed reads, or replay of native sound.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as wait} from 'node:timers/promises';
import {writeOriginalGameplayPackageStreet01} from '../tests/fixtures/StreetGameplayPackage01.mjs';
import {budgetFrame042} from '../tests/fixtures/AcousticBudget042.mjs';

const source=path.resolve('.local/combined-observation-manual-01');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const plan=read(path.join(source,'world-proof/consumer-plan.json'));
const manifest=read(plan.validatedManifestPath),epoch=manifest.ValidationEpochUtc01;
const capture=path.join(source,'capture.jsonl');
assert(fs.statSync(capture).size<=8*1024*1024);
const frames=fs.readFileSync(capture,'utf8').trim().split('\n').map(JSON.parse)
 .filter(r=>r.frame.listener.sequence<=625);
const folder=fs.mkdtempSync(path.resolve('.local/normal-interior-replay-'));
console.log(folder);
const cacheRoot=path.resolve('.local');
const pkg=writeOriginalGameplayPackageStreet01(folder,{latencyProfile:'street-01',gameHash:manifest.InputBinding.GameExecutableSHA256,
 acousticWorld:{privateCacheRoot:cacheRoot,derivedCacheRoot:cacheRoot,manifestPath:path.relative(cacheRoot,plan.validatedManifestPath),
  catalogPath:path.relative(cacheRoot,plan.catalogPath)}});
// STREET-01 source and timing contract, with the explicit retained-cache
// reader binding already supported by the normal producer.
fs.writeFileSync(pkg.manifest,JSON.stringify({...pkg.config,featureProfile:'STREET-01',continuityPolicy:'camera-source-01'}));
const session=frames[0].frame.session;
const child=spawn(process.execPath,['tools/Run-Gameplay.mjs','--manifest',pkg.manifest,'--session',session],{stdio:['pipe','pipe','pipe']});
const exited=once(child,'exit'),lines=readline.createInterface({input:child.stderr});
const statuses=[],admissions=[],errors=[];
let ready=false,closed=false,pcmBytes=0,maximumPacketGap=0,lastPacketAt=null,creditsSent=0,creditTimer=null;
child.stdin.on('error',error=>errors.push(error.message));
child.stdout.on('data',b=>{pcmBytes+=b.length;if(pcmBytes%4112===0){const at=performance.now();if(lastPacketAt!==null)maximumPacketGap=Math.max(maximumPacketGap,at-lastPacketAt);lastPacketAt=at;}});
lines.on('line',line=>{
 const row=JSON.parse(line);
 if(row.type==='gameplay-ready')ready=true;
 if(row.type==='gameplay-status')statuses.push(row.status);
 if(row.type==='installed-world-producer-admission')admissions.push(row);
 if(row.type==='gameplay-error')errors.push(row.code);
 if(row.type==='installed-world-worker-closed')closed=row.workerJoined;
});
const send=row=>child.stdin.write(JSON.stringify(row)+'\n');
const [x,y,z]=frames.find(r=>r.frame.cameraInteriorReadback.ready).frame.cameraInteriorReadback.origin;
try{
 const timeout=performance.now()+8000;
 while(!ready){assert(child.exitCode===null&&performance.now()<timeout,errors.join(' '));await wait(10);}
 send({type:'settings',quality:'balanced',acceleration:'cpu',enabled:true,volume:1,reflections:true,mode:'experimental-additive'});
 const first=frames[0].receivedTicks,start=performance.now()+50;
 // Windows may round a timer above one block. Grant only due credits,
 // including a small catch-up batch within the ordinary six-block window.
 creditTimer=setInterval(()=>{
  const due=Math.floor((performance.now()-start)/(512/48))+1;
  const count=Math.min(6-creditsSent+Math.floor(pcmBytes/4112),due-creditsSent);
  if(count>0&&child.exitCode===null){creditsSent+=count;send({type:'credit',blocks:count});}
 },5);
 for(const row of frames){
  const elapsed=(row.receivedTicks-first)/10_000,due=start+elapsed;
  while(performance.now()<due)await wait(Math.max(1,Math.floor(due-performance.now())));
  assert(child.exitCode===null,errors.join(' '));
  const f=structuredClone(row.frame),r=f.cameraInteriorReadback,l=f.listener,t=elapsed/1000;
  f.worldPreparationStartedUtc=epoch;
  if(r.ready)f.cameraInterior01={proxy:r.proxy,archetype:r.archetype,origin:r.origin,observationTicks:r.sampleTicks};
  delete f.cameraInteriorReadback;
  const authored=budgetFrame042(l.sequence,t).vehicles[0];
  // An authored path on the other side of a represented foyer boundary.
  authored.position=[x-6+.7*Math.sin(t/2),y+.5+1.2*Math.cos(t/2),z+1.35];
  authored.velocity=[.35*Math.cos(t/2),-.6*Math.sin(t/2),0];
  authored.observationTicks=l.observationTicks;
  f.vehicles=[authored];
  send({type:'snapshot',ageMs:row.sourceAgeMs+Math.max(0,performance.now()-due),frame:f});
 }
 await wait(750);
 clearInterval(creditTimer);send({type:'stop'});child.stdin.end();
 assert.equal((await exited)[0],0,errors.join(' '));
}finally{
 clearInterval(creditTimer);if(child.exitCode===null&&child.signalCode===null)child.kill();
 fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify({statuses,admissions,errors,closed,pcmBlocks:pcmBytes/4112,maximumPacketGap},null,2)+'\n');
}
const active=statuses.filter(s=>s.installedScene?.surroundingSurfaces>0&&s.activeSources>0);
assert(active.length>0,'normal producer must admit a surrounding workset and render an authored source');
assert(active.every(s=>s.installedScene.sourceCatalogueSHA256===plan.catalogSHA256));
assert(active.some(s=>s.acousticWorld.environmentalReadiness01.counters.replacements>=2));
const final=statuses.at(-1);
assert.equal(final.acousticWorld.environmentalReadiness01.counters.validityGaps,0);
assert.equal(final.installedScene,null);
const postExit=statuses.slice(statuses.indexOf(active.at(-1))+1).find(s=>!s.installedScene&&s.activeSources>0);
assert(postExit,'observe the same source after exterior withdrawal');
assert([...active,postExit].every(s=>s.arrivals===active[0].arrivals&&s.retired===active[0].retired),
 'geometry admission, renewals and exterior withdrawal do not reacquire the source after the earlier capture gap');
assert(postExit.sourceStates[0].sourceFrame>active.at(-1).sourceStates[0].sourceFrame);
assert(final.installedPropagation.directBlocks+final.installedPropagation.directWithheldWithKnownHit>0,
 'actual direct calculations must hit represented surfaces, including hits in a partially unknown path');
assert.equal(closed,true);
console.log(JSON.stringify({radius:active[0].installedScene.activeRadius,surfaces:active[0].installedScene.activeSurfaces,
 surrounding:active[0].installedScene.surroundingSurfaces,propagation:final.installedPropagation,maximumPacketGap}));
