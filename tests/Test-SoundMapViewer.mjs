import test from 'node:test';
import assert from 'node:assert/strict';
import {VisualState,PassiveState,presentation,DisplayCadence,RateMeter,TELEMETRY_POLL_FPS,DISPLAY_RATES,ReplayClock,project,pathStyle,parseVisualContext,visibleContext,clampFps} from '../tools/soundmap/ui/model.mjs';
import {observationCoordinates,modelPoint} from '../src/acoustics/engine/observed-geometry.mjs';
const calibration={originNative:[100,200,3],axes:[[0,1,0],[-1,0,0],[0,0,1]],metresPerNativeUnit:2,basis:'declared-demonstration-scale',reference:'original-test-transform',physicalCalibration:'unverified'};
const geometry=(generation='g1',sessionId='s1')=>({schemaVersion:1,generation,sessionId,coordinateSpace:'research-rh-z-up-metres-v1',calibration,createdAt:1000,validUntil:1500,coverage:'partial',surfaces:[{id:'finite-wall',vertices:[[0,0,0],[2,0,0],[2,0,2],[0,0,2]],openings:[]}],missingRegions:[]});
const frame=(sequence=1,sessionId='s1',generation='g1')=>({schemaVersion:1,sequence,sessionId,geometryGeneration:generation,geometryTimeMs:1100,listener:{valid:true,position:[0,2,1],forward:[1,0,0]},sources:[{id:'owned',position:[2,2,1]}],paths:[{id:'actual',sourceId:'owned',status:'selected',order:1,vertices:[[2,2,1],[1,0,1],[0,2,1]],points:[[1,0,1]]},{id:'unavailable',sourceId:'owned',status:'unknown',vertices:null,points:null}]});
const envelope=(f=frame(),g=geometry(),mode='live')=>({mode,frame:f,geometry:g});
test('conditional listener-only renderer stays distinct from observed geometry and expires with stale telemetry',()=>{
 const s=new VisualState(),f=frame();f.geometryGeneration=null;f.geometryTimeMs=null;
 f.readiness={rendererReadyForOwnedEmission:true,genuineGeometryPresent:false,reflectionsActive:false,mode:'listener-only-conditional-direct',visibilityAssumption:'unobserved-space-assumed-clear'};
 f.paths=[{id:'owned-direct',sourceId:'owned',status:'selected',order:0,vertices:[[2,2,1],[0,2,1]],visibilityAssumption:'unobserved-space-assumed-clear'}];
 s.ingest(envelope(f,null),0);assert.equal(s.geometry,null);assert.equal(s.health(10).state,'conditional');assert.equal(s.health(10).expired,true);
 assert.match(s.health(10).message,/unobserved space assumed clear/);assert.equal(s.health(501).state,'stale');
 assert.equal(s.health(10,false).state,'disconnected');assert.equal(s.frame.paths[0].visibilityAssumption,'unobserved-space-assumed-clear');
});
test('vehicle components remain live conditional direct evidence without inventing geometry or renewing stale telemetry',()=>{
 const s=new VisualState(),f=frame();f.geometryGeneration=null;f.geometryTimeMs=null;
 f.sources=['mechanical','exhaust','intake','drivetrain','tyres','aero','induction','transients'].map((name,i)=>
   ({id:`vehicle:1:${name}`,position:[i*.1,2,1],valid:true}));
 f.readiness={rendererReadyForOwnedEmission:true,genuineGeometryPresent:false,reflectionsActive:false,
   mode:'vehicle-conditional-direct',visibilityAssumption:'unobserved-space-assumed-clear'};
 f.paths=[{id:'vehicle-exhaust-direct',sourceId:'vehicle:1:exhaust',status:'selected',order:0,
   vertices:[[.1,2,1],[0,2,1]],visibilityAssumption:'unobserved-space-assumed-clear'}];
 s.ingest(envelope(f,null),0);assert.equal(s.frame.sources.length,8);assert.equal(s.geometry,null);
 assert.equal(s.health(10).state,'conditional');assert.equal(s.health(10).expired,true,'geometry remains unavailable');
 assert.match(s.health(10).message,/unobserved space assumed clear/);assert.equal(s.health(501).state,'stale');
 assert.equal(s.health(10,false).state,'disconnected');assert.equal(s.frame.paths[0].sourceId,'vehicle:1:exhaust');
});
const originalContext=()=>({schemaVersion:1,kind:'richaudio-visual-context',coordinateSpace:'research-rh-z-up-metres-v1',calibration,acousticUse:false,knowledge:'historical',provenance:{kind:'original-synthetic',reference:'analytic-box-fixture'},tiles:[{id:'context',bounds:{min:[0,0,0],max:[4,4,4]},vertices:[[0,0,0],[4,0,0],[4,4,0],[0,4,0]],faces:[[0,1,2,3]]}]});
test('viewer preserves solver emission/contact/arrival vertices and never manufactures unavailable rays',()=>{const s=new VisualState(),f=frame();s.ingest(envelope(f),10);assert.equal(s.frame.paths[0].vertices,f.paths[0].vertices);assert.deepEqual(s.frame.paths[0].points,[[1,0,1]]);assert.equal(s.frame.paths[1].vertices,null);assert(Object.isFrozen(s.frame.paths[0].vertices));assert.throws(()=>s.frame.paths[0].vertices.push([0,0,0]));});
test('immutable generation cache is reused, bounded, and cleared across session changes',()=>{const s=new VisualState();s.ingest(envelope(),10);const g=s.geometry;s.ingest(envelope(frame(2),null),20);assert.equal(s.geometry,g);assert.equal(s.geometryRequestKey(),'g1');for(let i=3;i<10;i++)s.ingest(envelope(frame(i,'s1','g'+i),geometry('g'+i)),i*10);assert.equal(s.geometries.size,4);s.ingest(envelope(frame(1,'s2','g1'),null),100);assert.equal(s.geometry,null);assert.equal(s.geometries.size,0);});
test('a new worker stream resets sequence and geometry even when the listener session is unchanged',()=>{
  const s=new VisualState(),first=frame(80,'same-listener','stream-a:g1'),g=geometry('stream-a:g1','same-listener');
  first.streamId='worker-stream-a';first.audioFrame=48000;g.streamId='worker-stream-a';s.ingest(envelope(first,g),10);
  const restarted=frame(1,'same-listener','stream-b:g1');restarted.streamId='worker-stream-b';restarted.audioFrame=0;
  assert.equal(s.ingest(envelope(restarted,null),20),true);assert.equal(s.frame.sequence,1);assert.equal(s.frame.audioFrame,0);
  assert.equal(s.sessionId,'same-listener');assert.equal(s.streamId,'worker-stream-b');assert.equal(s.geometry,null);assert.equal(s.geometries.size,0);assert.equal(s.dropped,0);
  const mismatch=geometry('stream-b:g1','same-listener');mismatch.streamId='worker-stream-a';
  assert.throws(()=>s.ingest(envelope({...restarted,sequence:2},mismatch),30),/different worker stream/);
  const fresh=geometry('stream-b:g1','same-listener');fresh.streamId='worker-stream-b';s.ingest(envelope({...restarted,sequence:2},fresh),40);assert.equal(s.geometry,fresh);
});
test('session identity and immutable generation drift reject instead of borrowing surfaces',()=>{const s=new VisualState();s.ingest(envelope(),10);assert.throws(()=>s.ingest(envelope(frame(2),geometry('g1','other')),20),/different/);const g=geometry();g.surfaces[0].vertices[0]=[100,0,0];assert.throws(()=>s.ingest(envelope(frame(3),g),30),/modified/);});
test('duplicate and out of order live frames cannot refresh freshness; missing generations are unavailable',()=>{const s=new VisualState();s.ingest(envelope(),0);assert.equal(s.ingest(envelope(frame(),null),499),false);assert.equal(s.health(501).state,'stale');assert.equal(s.receivedAt,0);s.ingest(envelope(frame(4,'s1','missing'),null),550);assert.equal(s.geometry,null);assert.equal(s.dropped,2);assert.equal(s.health(551).expired,true);});
test('lease expiry uses original geometry clock plus live elapsed time without changing evidence',()=>{const s=new VisualState();s.ingest(envelope(),100);assert.equal(s.health(499).expired,false);assert.equal(s.health(500).expired,true);assert.equal(s.geometry.validUntil,1500);assert.equal(s.health(101,false).state,'disconnected');});
test('attaching to an already old server frame never renews its lease or transport freshness',()=>{const s=new VisualState(),e=envelope();e.status={ageMs:900};e.frame.producedAtUnixMs=1000;s.ingest(e,5000,{wallNow:1950,requestElapsedMs:25});assert.equal(s.receivedAt,4025);assert.equal(s.health(5000).state,'stale');assert.equal(s.health(5000).expired,true);const r=new VisualState();e.mode='replay';e.status={ageMs:0};r.ingest(e,5000,{wallNow:1950,requestElapsedMs:25});assert.equal(r.receivedAt,5000);assert.equal(r.health(5000).state,'historical');assert.equal(r.health(5000).expired,false);});
test('replay retains historical label and original lifetime even after long wall time or backward seek',()=>{const s=new VisualState();s.ingest(envelope(frame(10),geometry(),'replay'),100);assert.equal(s.health(100000).state,'historical');assert.equal(s.health(100000).expired,false);s.ingest(envelope(frame(1),null,'replay'),100001);assert.equal(s.frame.sequence,1);assert.equal(s.frame.geometryTimeMs,1100);const expired=frame(2);expired.geometryTimeMs=1500;s.ingest(envelope(expired,null,'replay'),100002);assert.equal(s.health(100003).expired,true);});
test('replay cursor ages a held sample through a missing interval without inventing poses or wall-clock aging',()=>{
  const s=new VisualState(),f=frame(),g=geometry(),e={...envelope(f,g,'replay'),status:{ageMs:100}};
  s.ingest(e,50);const originalVertices=s.frame.paths[0].vertices;
  assert.equal(s.health(500000).expired,false);assert.equal(s.health(500000).ageMs,100);
  s.ingest({...envelope(f,null,'replay'),status:{ageMs:450}},500001);
  assert.equal(s.health(500001).expired,true);assert.equal(s.health(999999).ageMs,450);
  assert.match(s.health(999999).message,/held sample 450 ms before cursor/);
  assert.equal(s.frame.geometryTimeMs,1100);assert.equal(s.geometry.validUntil,1500);assert.equal(s.frame.paths[0].vertices,originalVertices);
  s.ingest({...envelope(f,null,'replay'),status:{ageMs:0}},1000000);assert.equal(s.health(2000000).expired,false);
});
test('disconnect with no frame clears old geometry and never leaves a current scene',()=>{const s=new VisualState();s.ingest(envelope(),1);s.ingest({mode:'live',frame:null},2);assert.equal(s.frame,null);assert.equal(s.geometry,null);assert.equal(s.health(3).state,'unavailable');});
test('bounded viewer rejects nonfinite data, unsupported coordinates and excessive paths',()=>{for(const alter of [e=>e.frame.listener.position=[NaN,0,0],e=>e.geometry.coordinateSpace='gta-native',e=>e.frame.paths=Array(257).fill(e.frame.paths[0]),e=>e.frame.paths[0].vertices=[[0,0,0],[Infinity,0,0]],e=>e.geometry.surfaces[0].openings=[{vertices:[]}],e=>e.frame.paths[0].status='invented']){const e=envelope();alter(e);assert.throws(()=>new VisualState().ingest(e,0));}});
test('projection consumes exactly the mapped engine frame and top down retains XY while discarding altitude',()=>{const mapped=modelPoint(observationCoordinates(calibration),[101,202,5]);assert.deepEqual(mapped,[4,-2,4]);const c={target:[0,0,0],yaw:0,topDown:true,scale:10,width:800,height:600};const p=project(mapped,c);assert.equal(p.x,440);assert.equal(Math.round(p.y),280);assert.equal(project([4,-2,200],c).x,p.x);assert(Math.abs(project([4,-2,200],c).y-p.y)<1e-9);});
test('direct, first/second reflection, rejected, pruned and unknown states have separate semantics',()=>{assert.equal(pathStyle({status:'selected',order:0}).label,'Selected direct');assert.notEqual(pathStyle({status:'selected',order:1}).color,pathStyle({status:'selected',order:2}).color);for(const status of ['unknown','rejected','pruned'])assert(pathStyle({status}).dash.length);});
test('private visual context remains immutable historical-only and exact calibration controls visibility',()=>{const c=parseVisualContext(JSON.stringify(originalContext()));assert(Object.isFrozen(c));assert.equal(visibleContext(c,geometry(),[0,0,0]).tiles.length,1);const g=geometry();g.calibration={...calibration,metresPerNativeUnit:1};assert.equal(visibleContext(c,g,[0,0,0]).tiles.length,0);assert.equal(c.acousticUse,false);assert.equal(c.knowledge,'historical');});
test('context culling bounds active tiles and retains distant regions as absent instead of filled',()=>{const c=originalContext();c.tiles=Array.from({length:12},(_,i)=>({...c.tiles[0],id:'tile'+i}));const data=parseVisualContext(JSON.stringify(c));assert.equal(visibleContext(data,geometry(),[0,0,0]).tiles.length,8);assert.equal(visibleContext(data,geometry(),[1000,1000,1000]).tiles.length,0);});
test('malformed, oversize, promoted or out of tile private meshes are rejected before use',()=>{for(const alter of [c=>c.acousticUse=true,c=>c.knowledge='current',c=>c.provenance.kind='unknown',c=>c.tiles[0].faces=[[0,1,999]],c=>c.tiles[0].vertices[0]=[100,0,0],c=>c.tiles=Array(65).fill(c.tiles[0]),c=>c.tiles[0].faces=[[0,0,1]],c=>c.calibration=null]){const c=structuredClone(originalContext());alter(c);assert.throws(()=>parseVisualContext(JSON.stringify(c)));}assert.throws(()=>parseVisualContext(' '.repeat(4*1024*1024+1)),/4 MiB/);});
test('pause, resume, scrub and replay end use monotonic elapsed time while keeping source timestamps separate',()=>{const r=new ReplayClock();r.open(1000);r.tick(0);r.playing=true;r.tick(200);assert.equal(r.timeMs,200);r.playing=false;r.tick(900);assert.equal(r.timeMs,200);r.seek(700);r.playing=true;r.tick(1000);r.tick(1100);assert.equal(r.timeMs,800);r.tick(1500);assert.equal(r.timeMs,1000);assert.equal(r.playing,false);r.seek(-40);assert.equal(r.timeMs,0);assert.equal(clampFps(1),15);assert.equal(clampFps(100),60);});
const passiveFrame=(sequence=1,streamId='passive-a')=>({schemaVersion:1,kind:'passive-listener',streamId,sessionId:'native-session',sequence,observedAtUnixMs:1000,ageMs:0,coordinateSpace:'gta-native-unscaled',units:'native-unverified',listener:{valid:true,position:[100,200,3],forward:[0,1,0],up:[0,0,1],velocity:null,generation:1,reason:'ready'}});
test('passive tracking is independent and returns after genuine acoustic freshness expires without mixed coordinates',()=>{
  const s=new VisualState(),p=new PassiveState();p.ingest(passiveFrame(),0,{wallNow:1000});
  let v=presentation(s,p,20,false);assert.equal(v.kind,'passive');assert.equal(v.geometry,null);assert.equal(v.frame,null);assert.deepEqual(v.listener.position,[100,200,3]);
  s.ingest(envelope(),100);const originalCache=s.geometry;v=presentation(s,p,120,true);assert.equal(v.kind,'acoustic');assert.deepEqual(v.listener.position,[0,2,1]);assert.notEqual(v.coordinateKey,'native:passive-a');
  const next=passiveFrame(2);next.observedAtUnixMs=1650;p.ingest(next,650,{wallNow:1650});
  v=presentation(s,p,651,true);assert.equal(v.kind,'passive');assert.equal(v.geometry,null);assert.equal(v.frame,null);assert.equal(s.geometry,originalCache,'passive never changes acoustic cache');assert.equal(s.sessionId,'s1');
  assert.equal(visibleContext(parseVisualContext(JSON.stringify(originalContext())),v.geometry,v.listener.position).tiles.length,0);
});
test('passive duplicate frames never renew age; invalid/paused and absent observations never become fresh solver evidence',()=>{
  const p=new PassiveState(),s=new VisualState();p.ingest(passiveFrame(),0,{wallNow:1000});assert.equal(p.ingest(passiveFrame(),499,{wallNow:1499}),false);assert.equal(p.health(501).state,'stale');
  const paused=passiveFrame(2);paused.listener.valid=false;paused.listener.reason='paused';p.ingest(paused,502,{wallNow:1502});assert.equal(p.health(502).state,'invalid');assert.match(p.health(502).message,/paused/);assert.equal(presentation(s,p,502,false).frame,null);
  p.ingest(null,503);assert.equal(presentation(s,p,503,false).kind,'waiting');
});
test('passive stream or session changes reanchor coordinates without altering an acoustic worker identity',()=>{
  const p=new PassiveState(),s=new VisualState();s.ingest(envelope(),0);p.ingest(passiveFrame(90),0,{wallNow:1000});const before=presentation(s,p,600,false).coordinateKey;
  const next=passiveFrame(1,'passive-b');next.sessionId='new-native-session';next.listener.position=[-100,-200,20];p.ingest(next,601,{wallNow:1000});const after=presentation(s,p,601,false);assert.notEqual(after.coordinateKey,before);assert.deepEqual(after.listener.position,[-100,-200,20]);assert.equal(s.sessionId,'s1');assert.equal(s.frame.sequence,1);
});
test('passive contract rejects acoustic evidence and calibrated coordinate disguises',()=>{for(const edit of [p=>p.paths=[],p=>p.coordinateSpace='research-rh-z-up-metres-v1',p=>p.units='metres',p=>p.listener.forward=[NaN,0,1],p=>p.listener.velocity=[Infinity,0,0]]){const p=passiveFrame();edit(p);assert.throws(()=>new PassiveState().ingest(p,0,{wallNow:1000}));}});
test('historical replay never switches to a simultaneous fresh passive stream',()=>{const s=new VisualState(),p=new PassiveState();s.ingest(envelope(frame(),geometry(),'replay'),0);p.ingest(passiveFrame(),0,{wallNow:1000});const view=presentation(s,p,200,false);assert.equal(view.kind,'replay');assert.equal(view.frame,s.frame);assert.equal(view.health.state,'historical');});
test('display cadence renders 15/20/30/60 targets on animation ticks without changing the fixed telemetry cadence',()=>{
  assert.deepEqual(DISPLAY_RATES,[15,20,30,60]);assert.equal(TELEMETRY_POLL_FPS,20);
  for(const target of DISPLAY_RATES){const d=new DisplayCadence(target),m=new RateMeter();let count=0;for(let tick=0;tick<600;tick++){const now=tick*1000/60;if(d.due(now)){count++;m.mark(now);}}
    assert(Math.abs(count-target*10)<=1,`${target} target yielded ${count} frames/10 seconds`);assert(Math.abs(m.rate(9999)-target)<1);assert.equal(TELEMETRY_POLL_FPS,20);}
});
test('slow displays and long pauses skip missed frame slots rather than burst or fabricate observations',()=>{
  const d=new DisplayCadence(60);let count=0;for(let i=0;i<300;i++)if(d.due(i*1000/30))count++;assert.equal(count,300);
  assert(d.due(20000));assert.equal(d.due(20000),false);assert.equal(d.due(20001),false);
  d.setRate(15);assert(d.due(21000));assert.equal(d.due(21020),false);assert(d.due(21070));
  const rate=new RateMeter();for(let i=0;i<1000;i++)rate.mark(i);assert(rate.times.length<=256);assert.equal(rate.rate(5000),0);
});
