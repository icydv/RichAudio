import test from 'node:test';
import assert from 'node:assert/strict';
import { observationCoordinates, modelPoint, modelDirection, observedAcousticScene, ObservedGeometryFeed } from '../src/acoustics/engine/observed-geometry.mjs';
import { trajectory,ownedSource,acousticScene } from '../src/acoustics/engine/contracts.mjs';
import { candidatePaths,solvePath,pathGeometry } from '../src/acoustics/engine/paths.mjs';
import { prepare,render,PcmRenderer } from '../src/acoustics/engine/renderer.mjs';
import { signal,wav,audioMetrics } from '../src/acoustics/engine/signals.mjs';
import { createTile,onPatch,querySegment } from '../src/acoustics/research/local-geometry.mjs';
import { observedInput,demonstrationCoordinates } from './fixtures/ObservedGeometry.mjs';
const close=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function setup(overrides={}){
 const coordinates=observationCoordinates(demonstrationCoordinates(1)),input={...observedInput(),coordinates,...overrides};
 const scene=observedAcousticScene(input),listener=trajectory([{time:0,position:modelPoint(coordinates,input.listenerNative),forward:[-1,0,0]}]);
 const source=ownedSource({id:'original-impulse',pcm:signal('impulse',.05,{amplitude:.2}),track:trajectory([{time:0,position:modelPoint(coordinates,[-.3,.1,.8])}])});
 return {scene,listener,source,coordinates,input};
}
test('native observations become finite partial geometry with explicit assumptions and untouched provenance',()=>{
 const raw=observedInput(),before=structuredClone(raw),f=setup(raw);
 assert.deepEqual(raw,before);assert.equal(f.scene.tile.coverage,'partial');assert.equal(f.scene.tile.surfaces.length,2);
 for(const s of f.scene.tile.surfaces){assert.equal(s.confidence,null);assert.equal(s.motion,'unknown');assert.equal(s.footprint.length,4);assert.equal(s.provenance.kind,'derived');assert.equal(s.material.observedId,null);}
 const model=f.scene.observationModel;assert.equal(model.calibration.physicalCalibration,'unverified');assert.equal(model.evidence[0].sourceIds.length,9);
 assert.equal(model.evidence[0].uncertainty.probability,null);assert.equal(model.evidence[0].originalValidUntilMs,1010);
 assert.ok(Object.isFrozen(model.evidence[0].nativeFootprint));
 assert.throws(()=>acousticScene(f.scene.tile,f.scene.materials),/moving reflectors/);
});
test('coordinate transform explicitly recentres, rotates, scales positions and preserves directions',()=>{
 const c=observationCoordinates({...demonstrationCoordinates(2),originNative:[100,200,3],axes:[[0,1,0],[-1,0,0],[0,0,1]]});
 assert.deepEqual(modelPoint(c,[101,202,6]),[4,-2,6]);assert.deepEqual(modelDirection(c,[1,0,0]),[0,-1,0]);
 assert.throws(()=>observationCoordinates({...demonstrationCoordinates(),basis:'measured'}),/scale basis/);
 assert.throws(()=>observationCoordinates({...demonstrationCoordinates(),axes:[[1,0,0],[0,-1,0],[0,0,1]]}),/right-handed/);
 assert.throws(()=>observationCoordinates({...demonstrationCoordinates(),metresPerNativeUnit:NaN}),/scale/);
});
test('existing image-source solver derives analytic direct, wall, ground and two-bounce lengths/delays',()=>{
 const f=setup(),p=candidatePaths(f.scene).map(c=>solvePath(f.scene,f.source,f.listener,.1,c));
 const wanted={direct:Math.sqrt(.37),'r:wall-candidate-1':Math.sqrt(1.01),'r:ground-candidate-1':Math.sqrt(.61),
  'r:wall-candidate-1>ground-candidate-1':Math.sqrt(1.25)};
 assert.equal(p.length,5);for(const path of p){if(!(path.id in wanted)){assert.notEqual(path.status,'renderable');continue;}assert.equal(path.status,'renderable');close(path.distance,wanted[path.id]);close(path.delay,path.distance/343);assert.equal(path.visibility,'conditional-observed-path');}
});
test('convex finite support rejects a bounce inside its bounding rectangle but outside the observed polygon',()=>{
 const f=setup(),input=JSON.parse(JSON.stringify(f.scene.tile));
 const s=input.surfaces.find(s=>s.id==='wall-candidate-1');s.footprint=[[0,-.2],[.2,0],[0,.2],[-.2,0]];
 const tile=createTile(input),patch=tile.surfaces.find(s=>s.id==='wall-candidate-1');
 const point=patch.center.map((x,i)=>x+.18*patch.u[i]+.18*patch.v[i]);assert.equal(onPatch(patch,point),false);
 assert.equal(querySegment(tile,point.map((x,i)=>x+patch.normal[i]),point.map((x,i)=>x-patch.normal[i])).hits.length,0);
 const scene=acousticScene(tile,f.scene.materials,{...f.scene.config,observationModel:f.scene.observationModel});
 const normalPath=pathGeometry(scene,[-.3,.1,.55],[.3,.1,.55],[patch]);assert.equal(normalPath.status,'outside-finite-patch-or-opening');
 s.footprint=[[0,0],[.2,0],[0,.2],[.2,.2]];assert.throws(()=>createTile(input),/convex/);
});
test('known obstruction uses authored three-band transmission while unknown materials are not fabricated',()=>{
 const f=setup({listenerNative:[.3,.8,.8]}),c=candidatePaths(f.scene)[0],p=solvePath(f.scene,f.source,f.listener,.1,c);
 assert.equal(p.status,'renderable');assert.equal(p.visibility,'authored-transmission-in-partial-model');
 close(p.bands[0],Math.sqrt(.025));close(p.bands[1],Math.sqrt(.004));close(p.bands[2],Math.sqrt(.0004));
 const unknown=setup({listenerNative:[.3,.8,.8],materialsByKind:{}});
 assert.equal(solvePath(unknown.scene,unknown.source,unknown.listener,.1,candidatePaths(unknown.scene)[0]).status,'material-unknown');
 assert.throws(()=>setup({materialsByKind:{wall:{reflection:[.5,.3,.1],basis:'measured'}}}),/authored/);
});
test('existing DSP renders deterministic fractional-delay PCM and isolated orders sum to the combined result',()=>{
 const f=setup(),duration=.15,run=orders=>render(prepare(f.scene,[f.source],f.listener,{duration,pathOrders:orders}),{masterGain:1});
 const direct=run([0]),first=run([1]),second=run([2]),all=run([0,1,2]);
 const arrival=Math.sqrt(.37)/343*48000,k=Math.floor(arrival),fraction=arrival-k;
 close(direct.left[k],.2*Math.SQRT1_2*(1-fraction),1e-8);close(direct.left[k+1],.2*Math.SQRT1_2*fraction,1e-8);
 for(let i=0;i<all.left.length;i++)close(all.left[i],direct.left[i]+first.left[i]+second.left[i],2e-8);
 assert.ok(audioMetrics([second.left]).peak>0);assert.equal(all.metrics.limitedFrames,0);
 assert.deepEqual(wav([all.left,all.right]),wav([run([0,1,2]).left,run([0,1,2]).right]));
 const plan=prepare(f.scene,[f.source],f.listener,{duration}),renderer=new PcmRenderer(plan,{masterGain:1}),left=new Float32Array(128),right=new Float32Array(128),out=[];
 while(renderer.position<renderer.frames){const n=renderer.process(left,right);out.push(...left.subarray(0,n));}
 assert.deepEqual(new Float32Array(out),all.left);
});
test('live snapshots retain original expiry while historical replay explicitly uses a separate frozen model lease',()=>{
 const f=setup();assert.equal(f.scene.tile.createdAt,20);assert.equal(f.scene.tile.validUntil,1010);
 assert.throws(()=>setup({context:{...observedInput().context,nowMs:1010}}),/stale/);
 assert.throws(()=>prepare(f.scene,[f.source],f.listener,{duration:2}),/expires/);
 const replay=setup({mode:'historical-replay',replayDurationMs:3000,context:{...observedInput().context,nowMs:900000}});
 assert.equal(replay.scene.tile.createdAt,0);assert.equal(replay.scene.observationModel.evidence[0].finishedMs,10);
 assert.match(replay.scene.observationModel.timing,/not-current/);assert.ok(prepare(replay.scene,[replay.source],replay.listener,{duration:2}));
});
test('whole-snapshot feed replaces geometry and invalidates failed/stale/context-mismatched generations',()=>{
 const feed=new ObservedGeometryFeed(),input={...observedInput(),coordinates:observationCoordinates(demonstrationCoordinates())},a=feed.publish(input);
 const ctx={...input.context,nowMs:30};assert.equal(feed.current(ctx),a);
 const b=feed.publish({...input,groups:[input.groups[1]],context:{...ctx,revision:2}});
 assert.equal(b.tile.surfaces.length,1);assert.notEqual(b.geometryKey,a.geometryKey);
 assert.throws(()=>feed.publish(input),/revision/);assert.equal(feed.current(ctx),null);
 feed.publish({...input,context:{...ctx,revision:3}});assert.equal(feed.current({...ctx,interior:5}),null);
 feed.publish({...input,context:{...ctx,revision:4}});assert.equal(feed.current({...ctx,nowMs:1010}),null);
 assert.throws(()=>feed.publish({...input,mode:'historical-replay',context:{...ctx,revision:5}}),/historical/);
});
test('mixed sessions, missing samples, duplicate groups, unspecified units and budgets fail before rendering',()=>{
 assert.throws(()=>setup({coordinates:demonstrationCoordinates()}),/coordinate/);
 const groups=observedInput().groups;groups[0].Samples.pop();assert.throws(()=>setup({groups}),/unqualified/);
 assert.throws(()=>setup({groups:Array(9).fill(observedInput().groups[0])}),/count/);
 assert.throws(()=>setup({groups:[observedInput().groups[0],observedInput().groups[0]]}),/duplicate/);
 assert.throws(()=>setup({visibilityAssumption:undefined}),/assumptions/);
 const mixed=observedInput().groups;mixed[1].Session='another-session';assert.throws(()=>setup({groups:mixed}),/mixed/);
});
