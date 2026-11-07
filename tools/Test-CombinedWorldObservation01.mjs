// Optional retained-data rehearsal. The clocks and camera inputs are authored.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as wait} from 'node:timers/promises';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {publishSelectedObservationManifest01} from './native-control/Prepare-CombinedWorldProof01.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const planPath=path.resolve(process.argv[2]??'');
assert(planPath.startsWith(path.resolve('.local')+path.sep),'private retained fixture only');
const plan=read(planPath),manifest=read(plan.retainedManifestPath);
const out=fs.mkdtempSync(path.join(path.dirname(planPath),'retained-authored-'));
const prepared=publishSelectedObservationManifest01(plan,manifest,plan.archives,out,new Date().toISOString());
fs.writeFileSync(path.join(out,'fixture-only.json'),JSON.stringify({authoredCamera:true,assumedArchiveDigestsFromRetainedMetadata:true,noInstalledReads:true}));
const staged=path.join(out,'fixture-plan.json'),capture=path.join(out,'capture.jsonl'),result=path.join(out,'out.jsonl'),session=randomBytes(16).toString('hex');
fs.writeFileSync(staged,JSON.stringify({...prepared,authoredRehearsal:true}));
console.log(out);
const child=spawn(process.execPath,['tools/native-control/Observe-CombinedWorld01.mjs',staged,capture,session,result,String(Date.now()+120_000)],{stdio:'inherit'});
const exit=once(child,'exit');
let seq=0;
async function phase(inward,count){
 const origin=plan.placement.matrix.slice(12,15),position=[origin[0],origin[1],origin[2]+1],archetype=Number(plan.placement.archetypeHash);
 for(let i=0;i<count;i++){
  assert(child.exitCode===null,'bankless consumer exited prematurely');
  const now=Number(process.hrtime.bigint()/100n);
  const listener={version:1,session,generation:1,sequence:++seq,observationTicks:now-1000,clockFrequency:10_000_000,gameTimeMs:seq*50,position,
   velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],listenerKind:'camera',velocityKind:'estimated-camera-difference',paused:false,valid:true,
   reason:'valid',coordinates:'gta-native-unscaled',units:'native-unverified',sourceId:null};
  const raw=inward?{proxy:71,archetype,origin,sampleTicks:now,ready:true,outcome:'observed'}:{proxy:0,ready:null,archetype:null,origin:null,sampleTicks:now,outcome:'no-proxy'};
  fs.appendFileSync(capture,JSON.stringify({receivedTicks:now,sourceAgeMs:.1,fresh:true,frame:{version:1,session,listener,vehicles:[],cameraInteriorReadback:raw}})+'\n');
  await wait(50);
 }
}
try{
 await wait(1300);
 await phase(false,20);await phase(true,90);await wait(1250);await phase(true,65);await phase(false,25);
 fs.writeFileSync(capture+'.closed','',{flag:'wx'});
 const [code]=await exit;
 assert.equal(code,0);
 const rows=fs.readFileSync(result,'utf8').trim().split('\n').map(line=>JSON.parse(line));
 const applied=rows.findIndex(r=>r.type==='consumer-binding'&&r.evidence?.some(x=>x.interiorInstanceId===plan.instanceId&&plan.resourceIds.includes(x.resourceId)));
 assert(applied>0&&rows[applied].binding.activeSurfaces>0&&rows[applied].samplePanel.center.every(Number.isFinite),'transformed surface reached the consumer');
 const changes=rows.slice(applied).filter(r=>r.type==='consumer-binding');
 assert.deepEqual(changes.map(r=>!!r.binding),[true,false,true,false],'expiry withdraws; fresh input readmits; exterior withdraws again');
 assert.equal(rows.at(-1).frames,seq);
 assert.equal(rows.at(-1).clockErrors,0);
 assert.equal(rows.at(-1).workerJoined,true);
 console.log('PASS bankless selected geometry applied and withdrawn; surfaces='+rows[applied].binding.activeSurfaces);
}finally{if(child.exitCode===null&&child.signalCode===null)child.kill();}
