// Private regression of the sealed manual01 capture, through the bankless
// production consumer. No archives, endpoint, game, or new observations.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

const source=path.resolve('.local/combined-observation-manual-01');
const framesPath=path.join(source,'capture.jsonl');
const planPath=path.join(source,'world-proof/consumer-plan.json');
const observer=fileURLToPath(new URL('./native-control/Observe-CombinedWorld01.mjs',import.meta.url));
const readLines=file=>fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);
assert(fs.statSync(framesPath).size<=8*1024*1024);
const frames=readLines(framesPath);
const plan=JSON.parse(fs.readFileSync(planPath,'utf8'));
assert.equal(frames.length,1179);
const output=fs.mkdtempSync(path.resolve('.local/admission-replay-'));
console.log(output);
const ticks=()=>Number(process.hrtime.bigint()/100n);

async function replay(name,input,holdAfterMs=0){
 const capture=path.join(output,name+'.capture.jsonl'),result=path.join(output,name+'.result.jsonl');
 const now=Date.now(),session=frames[0].frame.session;
 const child=spawn(process.execPath,[observer,
  planPath,capture,session,result,String(now+85_000),String(now+95_000)],{stdio:'inherit'});
 const exit=once(child,'exit');
 try{
  await wait(1100);
  // Translate all three clocks by one constant. Source age, frame order,
  // sample offsets, camera motion, and gaps in the original stream survive.
  const offset=ticks()+500_000-input[0].receivedTicks;
  for(const original of input){
   assert.equal(child.exitCode,null,'consumer exited before replay completed');
   const row=structuredClone(original),{listener,cameraInteriorReadback}=row.frame;
   assert.equal(listener.clockFrequency,10_000_000);
   row.receivedTicks+=offset;
   listener.observationTicks+=offset;
   cameraInteriorReadback.sampleTicks+=offset;
   while(ticks()<row.receivedTicks)await wait(Math.max(1,Math.floor((row.receivedTicks-ticks())/10_000)));
   fs.appendFileSync(capture,JSON.stringify(row)+'\n');
  }
  await wait(holdAfterMs);
  fs.writeFileSync(capture+'.closed','',{flag:'wx'});
  assert.equal((await exit)[0],0);
  const rows=readLines(result),terminal=rows.at(-1);
  assert.equal(terminal.frames,input.length);
  assert.equal(terminal.clockErrors,0);
  assert.equal(terminal.workerJoined,true);
  const bindings=rows.filter(r=>r.type==='consumer-binding');
  assert.deepEqual(bindings.map(r=>!!r.binding),[false,true,false],name+' must admit and then withdraw the scene');
  const [,admitted,withdrawn]=bindings;
  assert(admitted.binding.activeSurfaces>0&&admitted.samplePanel.center.every(Number.isFinite));
  assert(admitted.evidence.length>0&&admitted.evidence.every(e=>e.interiorInstanceId===plan.instanceId&&plan.resourceIds.includes(e.resourceId)));
  const applied=rows.filter(r=>r.type==='consumer-outcome'&&r.accepted);
  assert(applied.length>=3,'first admission and at least two replacements required');
  assert(applied[0].activationDecision.renewalQualified,'first admission must have a qualified successor forecast');
  assert(applied.every(r=>r.generation===admitted.binding.generation&&r.completedAt<r.expiresAt&&
   r.expiresAt-r.requestedAt<=1000));
  assert(applied.slice(1).every((r,i)=>r.completedAt<applied[i].expiresAt),'replacements keep the valid lease continuous');
  const summary=rows.find(r=>r.type==='consumer-summary');
  return {admitted,withdrawn,applied,summary};
 }finally{if(child.exitCode===null&&child.signalCode===null)child.kill();}
}

const passage=await replay('passage',frames);
assert.equal(passage.summary.readiness.counters.validityGaps,0);
assert(passage.applied.every(r=>r.activationDecision.renewalQualified));
assert(frames.find(r=>r.frame.listener.sequence===passage.withdrawn.sequence)?.frame.cameraInteriorReadback.outcome==='no-proxy');
// The same continuous interior segment, stopped before the exterior sample.
const lastInterior=frames.findIndex(r=>r.frame.listener.sequence===549);
assert(lastInterior>=0&&frames[lastInterior].frame.cameraInteriorReadback.ready);
const expiry=await replay('expiry',frames.slice(0,lastInterior+1),1200);
assert.equal(expiry.summary.readiness.counters.validityGaps,1);
assert.equal(expiry.summary.readiness.firstExpiredAt,expiry.applied.at(-1).expiresAt);
assert(expiry.withdrawn.at>=expiry.applied.at(-1).expiresAt);
console.log(JSON.stringify({clock:'single QPC offset; offline replay of retained GTA capture',
 passage:{surfaces:passage.admitted.binding.activeSurfaces,applications:passage.applied.length,
  exitSequence:passage.withdrawn.sequence},
 expiry:{applications:expiry.applied.length,lease:expiry.applied.at(-1).expiresAt,withdrawnAt:expiry.withdrawn.at}}));
