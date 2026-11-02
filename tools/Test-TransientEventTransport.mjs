// Functional transport/ownership regression, not a latency benchmark. All PCM
// here is a private original render and no endpoint or recording is opened.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),out=path.join(root,'.local','latency-02','node-transport-'+randomUUID());
fs.mkdirSync(path.dirname(out),{recursive:true});
const prep=JSON.parse(execFileSync(process.execPath,[path.join(root,'tools/Prepare-TransientEventFixture.mjs'),'--output',out],{encoding:'utf8',windowsHide:true}));
const manifest=JSON.parse(fs.readFileSync(prep.receipt,'utf8')),session='cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd';
const files=['src/acoustics/events/contracts.mjs','src/acoustics/events/wire.mjs','src/acoustics/events/acquisition-capability.mjs',
  'tools/Run-TransientEventFixture.mjs','tools/Test-TransientEventTransport.mjs'];
const hash=b=>createHash('sha256').update(b).digest('hex'),pins=files.map(file=>({file,sha256:hash(fs.readFileSync(path.join(root,file)))}));
const event=n=>{const k=manifest.kernels[n%8];return {eventId:n+1,sourceId:k.sourceId,sourceGeneration:k.sourcePose.generation,kernelSlot:k.kernelSlot,kernelGeneration:1,
  sceneGeneration:k.sceneGeneration,listenerGeneration:k.listenerPose.generation,sourceEventSequence:Math.floor(n/8),priority:n%2,extraClockUncertaintyFrames:0,
  maximumSoftwareLatenessFrames:960,timing:{basis:'authored-fixture-clock',occurrenceLowerQpc:1000000000+n*10000,occurrenceUpperQpc:1000000000+n*10000,
    acquisitionBeforeQpc:null,observationAfterQpc:1000000200+n*10000,qpcFrequency:10000000}};};
async function run(text,preparation=prep.receipt,holdReader=false){return await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(root,'tools/Run-TransientEventFixture.mjs'),'--prepared',preparation,'--session',session],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']}),chunks=[];
  let stderr='',paused=false;const timer=setTimeout(()=>{child.kill();reject(Error('bounded fixture worker timeout'));},15000);
  child.stdout.on('data',data=>{chunks.push(data);if(holdReader&&!paused){paused=true;child.stdout.pause();setTimeout(()=>child.stdout.resume(),200);}});child.stderr.on('data',data=>{stderr+=data.toString('utf8');if(stderr.length>16384){child.kill();reject(Error('unbounded fixture diagnostics'));}});
  child.stdin.on('error',()=>{});child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve({code,bytes:Buffer.concat(chunks),stderr});});
  // Prime input before READY and split in the middle of fields/line endings.
  // The worker must prewarm first and own each output packet until write ends.
  for(let n=0;n<text.length;n+=37)child.stdin.write(text.slice(n,n+37));child.stdin.end();
});}
const success=await run(Array.from({length:2000},(_,n)=>JSON.stringify(event(n))).join('\r\n')+'\r\n',prep.receipt,true);assert.equal(success.code,0,success.stderr);
assert.equal(success.bytes.length,16+2000*144);assert.equal(success.bytes.toString('ascii',0,4),'RA2R');assert.equal(success.bytes.readUInt32LE(12),8);
for(let n=0;n<2000;n++){const at=16+n*144;assert.equal(success.bytes.toString('ascii',at,at+4),'RAE2');assert.equal(success.bytes.readUInt32LE(at+12),n);
  assert.equal(Number(success.bytes.readBigUInt64LE(at+16)),n+1);assert.equal(success.bytes.readUInt32LE(at+32),n%8);
  assert.equal(success.bytes.subarray(at+120,at+136).toString('hex'),session);assert.equal(success.bytes.readBigInt64LE(at+96),-1n);}
const completed=success.stderr.trim().split('\n').map(x=>JSON.parse(x)).find(x=>x.type==='authored-event-fixture-completed');assert(completed);
assert(completed.transportStatistics.maximumOutstanding<=128);assert(completed.transportStatistics.poolWaits>0||completed.transportStatistics.blockedWrites>0);
assert(completed.transportStatistics.maximumWriteCompletionMs>50,'paused reader must exercise actual pending writes');
assert(completed.transportStatistics.maximumChunkBytes<=16384);assert(completed.transportStatistics.maximumPartialLineBytes<=4096);
const duplicate=await run(JSON.stringify(event(0))+'\n'+JSON.stringify(event(0))+'\n');assert.equal(duplicate.code,1);assert.equal(duplicate.bytes.length,160);
assert(duplicate.stderr.includes('duplicate-event-id'));assert(duplicate.stderr.length<512);
const invalidOrigin=await run(JSON.stringify({...event(0),origin:[0,999,0]})+'\n');assert.equal(invalidOrigin.code,1);assert.equal(invalidOrigin.bytes.length,16);
assert(invalidOrigin.stderr.includes('origin differs'));
const giant=await run('x'.repeat(4097)+'\n');assert.equal(giant.code,1);assert.equal(giant.bytes.length,16);assert(giant.stderr.includes('event line size'));
// These are new negative-control copies, never edits to the original receipt.
const negative=path.join(out,'negative-metadata');fs.mkdirSync(negative);fs.copyFileSync(path.join(out,'kernels.f32le'),path.join(negative,'kernels.f32le'));
const changed=structuredClone(manifest);changed.kernels[0].sourcePose.position[0]=1;
const changedPath=path.join(negative,'preparation.json');fs.writeFileSync(changedPath,JSON.stringify(changed));
const tampered=await run('',changedPath);assert.equal(tampered.code,1);assert.equal(tampered.bytes.length,0);assert(tampered.stderr.includes('metadata mismatch: sourcePose'));assert(tampered.stderr.length<512);
const hugePath=path.join(negative,'oversized.json');fs.writeFileSync(hugePath,' '.repeat(524289));const huge=await run('',hugePath);
assert.equal(huge.code,1);assert.equal(huge.bytes.length,0);assert(huge.stderr.includes('Preparation metadata bound'));
for(const pin of pins)assert.equal(hash(fs.readFileSync(path.join(root,pin.file))),pin.sha256,'source drift');
const result={schema:1,kind:'original-authored-priority-event-transport-functional-regression',passed:true,sourcePins:pins,
  preparationSha256:prep.sha256,cases:6,descriptorsVerified:2000,chunkBytes:37,readerHoldAfterReadyMs:200,transportStatistics:completed.transportStatistics,sharedKernelCount:8,perEventPcmWrites:0,
  checks:{prewarmBeforeReady:true,chunkAndBackpressureSafeBufferOwnership:true,strictTransportSequence:true,sessionBytesPreserved:true,
    hostMapsOutputFrame:true,duplicateTerminates:true,wrongOriginTerminates:true,oversizedLineTerminates:true,boundedDiagnostics:true,
    alteredPoseMetadataRejectedBeforeReady:true,oversizedPreparationRejectedBeforeRead:true},
  transportOutputSha256:hash(success.bytes),endpointOpened:false,gameLaunched:false,recordingStarted:false,nativeEventAcquired:false,
  physicalLatencyMeasured:false,limits:'Functional pipe regression only; burst schedule is authored and has no sink or polyphony/real-time performance claim.'};
const receipt=path.join(out,'transport-validation.json');fs.writeFileSync(receipt,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,cases:6,descriptors:2000,receipt,sha256:hash(fs.readFileSync(receipt))}));
