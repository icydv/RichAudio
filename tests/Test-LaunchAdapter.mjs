import test from 'node:test';
import assert from 'node:assert/strict';
import { Policy,budget } from '../tools/operator/policy.mjs';
import { StopEvidence } from '../tools/operator/stop-evidence.mjs';
const s={type:'status',beaconFrequencyHz:600,beaconLevel:.44,outputTrim:{db:24,peakLimit:.5,rejectedBlocks:0},sourceEmitting:false,listenerMode:'native-orientation-only-in-synthetic-scene',listenerPlayoutMode:'interpolated',listenerControlDelaySeconds:.1,observationAgeSeconds:.03,frame:0,paths:2,limited:0,peak:0};
function replay(age,{phase=0,jitter=0,freeze=false}={}){
 const p=new Policy({...budget,statusAge:age});p.visible=p.armed=p.senderAck=true;
 const cadence=94*512/48000*1000;let frame=0,next=cadence,lastPoll=-Infinity;
 for(let at=0;at<44000;at+=10){
  if(at>=next&&!(freeze&&at>5000)){frame++;next+=cadence+(frame%2?jitter:-jitter);}
  p.tick(at);if(at>=phase&&at-lastPoll>=250){lastPoll=at;if(frame)p.status({...s,frame:frame*94*512},at);}
  if(p.state==='aborted')break;
 }
 return p;
}
test('production cadence reproduces old 2010 Start / 4020 abort at polling phase 10',()=>{
 const p=replay(1000,{phase:10});assert.deepEqual(p.events.filter(x=>['start','status-progress-expired'].includes(x.code)),[{at:2010,code:'start'},{at:4020,code:'status-progress-expired'}]);
});
test('bounded allowance covers cached replies, all tick polling phases and 200ms jitter',()=>{
 for(let phase=0;phase<250;phase+=10)for(const jitter of [0,100,200]){const p=replay(budget.statusAge,{phase,jitter});assert.equal(p.started,true);assert.notEqual(p.state,'aborted');assert.equal(p.events.filter(e=>e.code==='start').length,1);}
});
test('frozen cached replies never renew progress',()=>{const p=replay(budget.statusAge,{freeze:true});assert.equal(p.state,'aborted');assert.equal(p.events.at(-1).code,'status-progress-expired');assert.ok(p.events.at(-1).at<7000);});
test('Stop evidence supports both orders and reconciliation after host exit',()=>{
 for(const order of ['receiver-first','sender-first']){const e=new StopEvidence();const r=()=>e.receiverObserved(46000,45000),s=()=>e.confirmSender({confirmedAtMs:47000,observedAtMs:47000});order==='receiver-first'?(r(),s()):(s(),r());assert.equal(e.result().onTimeAcknowledgedStop,true);}
 const e=new StopEvidence();e.receiverObserved(46000);assert.equal(e.result().timing,'unverified');e.confirmSender({confirmedAtMs:80000,occurrenceUpperBoundMs:48000,evidenceSha256:'a'.repeat(64)});assert.equal(e.result().onTimeAcknowledgedStop,true);
});
test('missing timing and late ACK cannot become on-time via late confirmation',()=>{
 for(const data of [{confirmedAtMs:80000},{confirmedAtMs:80000,occurrenceUpperBoundMs:61000,evidenceSha256:'b'.repeat(64)}]){const e=new StopEvidence();e.receiverObserved(46000);e.confirmSender(data);assert.equal(e.result().onTimeAcknowledgedStop,false);}
 const e=new StopEvidence();e.receiverObserved(46000);assert.equal(e.confirmSender({confirmedAtMs:80000,occurrenceUpperBoundMs:48000}),false);
});

import {supervise} from '../tools/operator/supervisor.mjs';
import {fileURLToPath} from 'node:url';
for(const order of ['sender-before-terminal','sender-after-host-exit'])test('actual supervisor evidence ordering: '+order,async()=>{
 await new Promise((resolve,reject)=>{
  const c=supervise(process.execPath,[fileURLToPath(new URL('./operator/host-fixture.mjs',import.meta.url)),'normal'],{limits:{ready:600,stop:700,ack:1100,kill:1400,end:2000,statusAge:250},onDone:r=>{try{assert.equal(r.verifiedExit,true);if(order==='sender-after-host-exit'){assert.equal(r.normalStop,false);assert.equal(c.control('sender-stop-confirmed'),true);}assert.equal(c.snapshot().normalStop,true);resolve();}catch(e){reject(e);}}});
  c.control('arm');c.control('sender-frames-confirmed');if(order==='sender-before-terminal')setTimeout(()=>c.control('sender-stop-confirmed'),750);
 });
});
