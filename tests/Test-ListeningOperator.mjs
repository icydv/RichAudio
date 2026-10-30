import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {ListeningOperator,emissionReadiness} from '../tools/listening/operator.mjs';
import {vehicleLiveSourceIds} from '../src/acoustics/vehicle/live-source.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'RichAudio operator ')),mock=path.join(root,'mock host.mjs');
fs.writeFileSync(mock,`console.log(JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}));if(process.argv[2]==='early')process.exit(7);if(process.argv[2]!=='quiet')setTimeout(()=>{console.log('RichAudio shared output: device-free fixture. Commands: start, mute, resume, emit-stop, status, stop. Maximum 60 seconds; gain 0.2');console.log('RichAudio shared output: duplicate. Commands: start, mute, resume, emit-stop, status, stop. Maximum 60 seconds; gain 0.2');},30);process.stdin.on('data',b=>{if(process.argv[2]!=='hung'&&b.toString().includes('stop'))process.exit(0);});`);
const pre={storyReady:true,bridgeReady:true,passiveMovementVerified:true};
const readyFrame=()=>({listener:{valid:true},listenerSessionId:'solver',sessionId:'solver',sequence:1,producedAtUnixMs:Date.now(),
 readiness:{transportAccepted:true,contextInitialized:true,rendererReadyForOwnedEmission:true,genuineGeometryPresent:false,reflectionsActive:false,
 mode:'listener-only-conditional-direct',visibilityAssumption:'unobserved-space-assumed-clear'}});
function setup(mode='normal',extra={}){const events=[],op=new ListeningOperator({executable:process.execPath,args:[mock,mode,'literal space','literal"quote'],cwd:root,emit:e=>events.push(e),readinessMs:500,stopMs:250,limitMs:350,cleanupMs:600,shutdownGraceMs:30,...extra});return {op,events};}
async function until(f){const end=performance.now()+3000;while(!f()){assert.ok(performance.now()<end,'fixture deadline');await new Promise(r=>setTimeout(r,5));}}
test('actual spawned mock: verified cwd/argv, readiness gate, original clock and exactly one listener/emission',async()=>{
 const {op,events}=setup();assert.throws(()=>op.permitListener());assert.throws(()=>op.begin({}));op.begin(pre);assert.throws(()=>op.permitListener());assert.throws(()=>op.begin(pre));await until(()=>op.state==='host-ready');
 assert.equal(events.filter(e=>e.type==='host-ready').length,1);const observed=JSON.parse(events.filter(e=>e.type==='stdout').map(e=>e.text).join('').split('\n')[0]);assert.equal(observed.cwd.toLowerCase(),root.toLowerCase());assert.deepEqual(observed.args,['normal','literal space','literal"quote']);
 assert.ok(op.permitListener().pid);assert.throws(()=>op.permitListener());op.listenerIssued();assert.throws(()=>op.emitBeacon());assert.throws(()=>op.accepted({listener:{valid:true}},{connected:true,ageMs:0}));
 const frame=readyFrame();op.accepted(frame,{connected:true,ageMs:10});assert.equal(op.readiness.genuineGeometryPresent,false);op.emitBeacon();assert.throws(()=>op.emitBeacon());await until(()=>op.finished);
 const result=events.find(e=>e.type==='terminal');assert.equal(result.primary,null);assert.equal(result.launches,1);assert.equal(result.listenerStarts,1);assert.equal(result.emissions,1);assert.equal(result.ownedPids.length,1);assert.ok(result.elapsedMs>=240&&result.elapsedMs<1500);assert.ok(events.some(e=>e.type==='recording-stop-required'));
});
test('readiness separates accepted transport, owned context, conditional rendering and genuine geometry',()=>{
 const f=readyFrame(),status={connected:true,ageMs:0};assert.equal(emissionReadiness(f,status).rendererReadyForOwnedEmission,true);
 for(const key of ['transportAccepted','contextInitialized','rendererReadyForOwnedEmission']){const bad=structuredClone(f);bad.readiness[key]=false;assert.equal(emissionReadiness(bad,status).rendererReadyForOwnedEmission,false,key);}
 for(const delta of [-3,251])assert.equal(emissionReadiness(f,status,{now:f.producedAtUnixMs+delta}).rendererReadyForOwnedEmission,false);
 const unmarked=structuredClone(f);delete unmarked.readiness.visibilityAssumption;assert.equal(emissionReadiness(unmarked,status).rendererReadyForOwnedEmission,false);
 const mismatch=structuredClone(f);mismatch.listenerSessionId='other';assert.equal(emissionReadiness(mismatch,status).rendererReadyForOwnedEmission,false);
 const observed=structuredClone(f);observed.readiness={...observed.readiness,genuineGeometryPresent:true,reflectionsActive:true,mode:'observed-geometry',visibilityAssumption:null};
 assert.equal(emissionReadiness(observed,status).reflectionsActive,true);assert.equal(emissionReadiness(observed,status).rendererReadyForOwnedEmission,true);
 assert.equal(emissionReadiness(f,{connected:true,ageMs:NaN}).rendererReadyForOwnedEmission,false);
});
test('spawn failure is terminal, no listener permitted, primary survives secondary fault',async()=>{
 const {op,events}=setup('normal',{executable:path.join(root,'does not exist.exe')});op.begin(pre);await until(()=>op.finished);assert.match(op.primary,/spawn:/);assert.throws(()=>op.permitListener());const first=op.primary;op.fail('later cleanup error');assert.equal(op.primary,first);assert.ok(op.secondary.includes('later cleanup error'));assert.equal(op.launches,1);assert.equal(op.listenerStarts,0);assert.equal(events.filter(e=>e.type==='launch-request').length,1);
});

test('vehicle readiness requires the exact original eight-component registration',()=>{
 const f=readyFrame(),status={connected:true,ageMs:0};f.readiness.mode='vehicle-conditional-direct';
 assert.equal(emissionReadiness(f,status).rendererReadyForOwnedEmission,false);
 f.directPath={rights:'original-generated',sourceIds:[...vehicleLiveSourceIds]};
 f.sources=vehicleLiveSourceIds.map(id=>({id,valid:true}));
 assert.equal(emissionReadiness(f,status).rendererReadyForOwnedEmission,true);
 f.sources[0].valid=false;assert.equal(emissionReadiness(f,status).rendererReadyForOwnedEmission,false);
 f.sources[0].valid=true;f.directPath.sourceIds[0]='beacon-0';assert.equal(emissionReadiness(f,status).rendererReadyForOwnedEmission,false);
});
test('early host exit and absent readiness cannot grant listener Start',async()=>{for(const mode of ['early','quiet']){const {op}=setup(mode,{readinessMs:100});op.begin(pre);await until(()=>op.finished);assert.ok(op.primary);assert.throws(()=>op.permitListener());assert.equal(op.listenerStarts,0);assert.equal(op.launches,1);}});
test('host death after startup invalidates permission; no duplicate launch or emission',async()=>{const {op}=setup('normal',{stopMs:1000,limitMs:1200});op.begin(pre);await until(()=>op.state==='host-ready');op.child.kill();await until(()=>op.finished);assert.throws(()=>op.permitListener());assert.throws(()=>op.emitBeacon());assert.throws(()=>op.begin(pre));assert.match(op.primary,/unexpected-host-exit/);});
test('input closure tracks actual child through graceful or reported bounded cleanup',async()=>{const {op,events}=setup();op.begin(pre);await until(()=>op.state==='host-ready');op.stop('operator-input-closed');assert.throws(()=>op.permitListener());await until(()=>op.finished);assert.equal(op.children.length,1);assert.ok(op.child.exitCode!==null||op.child.signalCode!==null,'owned child has terminated');if(op.child.signalCode)assert.equal(op.primary,'owned-host-cleanup-deadline','forced cleanup remains a reported failure');else assert.equal(op.child.exitCode,0);assert.equal(op.listenerStarts,0);assert.ok(events.some(e=>e.type==='terminal'));});
test('independent monotonic hard deadline and owned-child cleanup still run when child ignores stop',async()=>{const {op,events}=setup('hung',{stopMs:120,limitMs:160,cleanupMs:220,readinessMs:1000});op.begin(pre);await until(()=>op.finished);assert.equal(op.primary,'owned-host-cleanup-deadline');assert.ok(events.some(e=>e.type==='hard-host-limit'&&e.elapsedMs>=150));assert.ok(events.find(e=>e.type==='terminal').elapsedMs>=210);assert.equal(op.launches,1);assert.equal(op.listenerStarts,0);assert.equal(op.alive(),false);});
test.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('RichAudio operator '));fs.rmSync(root,{recursive:true});});
