import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Policy, budget } from '../tools/operator/policy.mjs';
const status={type:'status',beaconFrequencyHz:600,beaconLevel:.44,outputTrim:{db:24,peakLimit:.5,rejectedBlocks:0},sourceEmitting:false,listenerMode:'native-orientation-only-in-synthetic-scene',listenerPlayoutMode:'interpolated',listenerControlDelaySeconds:.1,observationAgeSeconds:.03,frame:512,paths:2,limited:0,peak:0};
const ready=()=>{const p=new Policy();p.visible=p.armed=p.senderAck=true;return p;};
test('progress, profile and exactly-once Start; no clock reset',()=>{
 const p=ready();assert.deepEqual(p.status(status,100),[]);assert.deepEqual(p.status(status,200),[]);
 assert.deepEqual(p.status({...status,frame:1024},300),['start']);assert.deepEqual(p.status({...status,frame:1536},400),[]);
 p.progressAt=45000;p.tick(45000);assert.equal(p.state,'stopping');p.progressAt=60000;assert.deepEqual(p.tick(60000),['mute','stop']);assert.deepEqual(p.status(status,60001),[]);
});
test('late, stale, invalid and incomplete readiness cannot Start',()=>{
 for(const change of [{beaconFrequencyHz:95},{listenerControlDelaySeconds:.05},{observationAgeSeconds:.251},{paths:0},{sourceEmitting:true},{limited:1},{frame:NaN}]){
 const p=ready();p.status(status,100);assert.deepEqual(p.status({...status,frame:1024,...change},200),[]);assert.equal(p.started,false);}
 const p=ready();p.status(status,100);assert.deepEqual(p.status({...status,frame:1024},24999),[]);assert.deepEqual(p.status({...status,frame:1536},25000),['mute','stop']);
});
test('normal EOF is not acknowledged Stop; malformed status and terminal failure abort',()=>{
 const p=ready();assert.deepEqual(p.line('{invalid',100),['mute','stop']);assert.equal(p.state,'aborted');
 const q=ready();assert.deepEqual(q.line('Listener terminal {}',100),['mute','stop']);
 const eof=ready();eof.closed(0,null,100);assert.equal(eof.state,'aborted');
 const failed=ready();failed.state='complete';failed.closed(1,null,100);assert.equal(failed.state,'aborted');
});
test('cutoff race, absent sender evidence, progress expiry and terminal immutability',()=>{
 assert.throws(()=>new Policy({...budget,ready:NaN}));assert.throws(()=>new Policy({...budget,end:90000}));assert.throws(()=>new Policy({...budget,stop:100}));
 const before=ready();before.status(status,24500);assert.deepEqual(before.status({...status,frame:1024},24999),['start']);
 const at=ready();at.status(status,24500);assert.deepEqual(at.status({...status,frame:1024},25000),['mute','stop']);
 const noAck=ready();noAck.senderAck=false;noAck.status(status,100);assert.deepEqual(noAck.status({...status,frame:1024},200),[]);
 const stale=ready();stale.status(status,100);stale.status({...status,frame:1024},200);assert.deepEqual(stale.tick(1711),['mute','stop']);
 const terminal='Listener terminal '+JSON.stringify({Connection:1,Stage:'connection',Code:'sender-stop',Outcome:'deliberate-stop',Terminal:true,AnotherAttempt:false})+'; owned output muted/stopping';
 stale.line(terminal,1300);assert.equal(stale.state,'aborted');
 const normal=ready();normal.status(status,100);normal.status({...status,frame:1024},200);normal.line(terminal,500);assert.equal(normal.state,'complete');assert.deepEqual(normal.status({...status,frame:2048},600),[]);
});
for(const mode of ['normal','cached','missing','malformed','no-ack','blocked'])test('real child supervision: '+mode,async()=>{
 const child=fork(fileURLToPath(new URL('../tools/Run-OperatorFixture.mjs',import.meta.url)),[mode],{silent:true});let output='';
 const completed=new Promise((resolve,reject)=>{child.stdout.on('data',b=>output+=b);child.on('error',reject);child.on('exit',resolve);});
 child.send('arm');child.send('sender-frames-confirmed');child.on('message',event=>{if(mode==='normal'&&event.code==='receiver-stop-observed')child.send('sender-stop-confirmed');});
 // Deliberately block this coordinator; independent process must still stop/kill its child.
 if(mode==='blocked'){const until=Date.now()+1600;while(Date.now()<until){}child.send('arm',()=>{});}
 await completed;const r=JSON.parse(output.trim());assert.equal(r.verifiedExit,true);assert.ok(r.elapsedMs<2200);
 const starts=r.commands.filter(e=>e.code==='command-start');assert.ok(starts.length<=1);
 if(mode==='normal'){assert.equal(r.normalStop,true);assert.equal(starts.length,1);assert.equal(r.exitCode,0);}
 else {assert.equal(r.normalStop,false);assert.equal(r.state,'aborted');}
 if(['cached','missing','malformed','blocked'].includes(mode))assert.equal(starts.length,0);
 if(mode==='blocked')assert.equal(r.killed,true);
 console.log(JSON.stringify({fixture:mode,elapsedMs:r.elapsedMs,killed:r.killed,normalStop:r.normalStop}));
});
