// Browser-only presentation of copied solver evidence. No ray tracing, game calls or audio.
export const MODEL_SPACE = 'research-rh-z-up-metres-v1';
export const LIMITS = Object.freeze({ surfaces:128, paths:256, sources:32, cachedGenerations:4,
  contextBytes:4*1024*1024, contextTiles:64, contextVertices:8192, contextFaces:8192, visibleContextTiles:8 });
export const isPoint = p => Array.isArray(p) && p.length===3 && p.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000);
const finite = n => Number.isFinite(n);
const ident = n => typeof n==='string'&&n.length>0&&n.length<=160;
const fail = (ok,message) => { if(!ok)throw Error(message); };
const immutable = x => { if(x&&typeof x==='object'){Object.values(x).forEach(immutable);Object.freeze(x);}return x; };
export const DISPLAY_RATES=Object.freeze([15,20,30,60]);
export const TELEMETRY_POLL_FPS=20;
export const clampFps = n => Math.max(15,Math.min(60,Math.round(Number(n)||20)));

// Display scheduling is deliberately independent of the telemetry fetch loop.
// Drift correction skips missed display slots; it never bursts catch-up frames.
export class DisplayCadence {
  constructor(fps=20){this.setRate(fps);}
  setRate(fps){this.fps=clampFps(fps);this.periodMs=1000/this.fps;this.nextDue=null;}
  due(now){
    if(!Number.isFinite(now))return false;
    if(this.nextDue===null){this.nextDue=now+this.periodMs;return true;}
    if(now+.1<this.nextDue)return false;
    this.nextDue+=Math.max(1,Math.floor((now-this.nextDue)/this.periodMs)+1)*this.periodMs;return true;
  }
  reset(){this.nextDue=null;}
}
export class RateMeter {
  constructor(){this.times=[];}
  mark(now){if(!Number.isFinite(now))return;this.times.push(now);this.trim(now);while(this.times.length>256)this.times.shift();}
  trim(now){while(this.times.length&&this.times[0]<now-2000)this.times.shift();}
  rate(now){this.trim(now);if(this.times.length<2)return 0;const elapsed=now-this.times[0];return elapsed>0?(this.times.length-1)*1000/elapsed:0;}
  reset(){this.times=[];}
}

export function checkPassive(p){
  fail(p?.schemaVersion===1&&p.kind==='passive-listener'&&ident(p.sessionId)&&ident(p.streamId),'Unsupported passive listener identity');
  fail(Number.isSafeInteger(p.sequence)&&p.sequence>=0&&Number.isFinite(p.observedAtUnixMs),'Invalid passive observation clock');
  fail(p.coordinateSpace==='gta-native-unscaled'&&p.units==='native-unverified','Passive coordinates must remain unscaled native units');
  fail(p.listener&&typeof p.listener.valid==='boolean','Passive validity required');
  if(p.listener.valid)fail(isPoint(p.listener.position)&&isPoint(p.listener.forward)&&isPoint(p.listener.up),'Invalid passive listener pose');
  fail(p.listener.velocity==null||isPoint(p.listener.velocity),'Invalid passive velocity');
  fail(p.geometry==null&&p.paths==null&&p.sources==null,'Passive listener must not carry acoustic evidence');
  return immutable(p);
}
export class PassiveState {
  constructor(){this.reset();}
  reset(){this.frame=null;this.receivedAt=null;this.dropped=0;}
  ingest(input,now,{wallNow=Date.now(),requestElapsedMs=0}={}){
    if(!input){this.reset();return false;}
    const p=checkPassive(input),changed=this.frame?.streamId!==p.streamId||this.frame?.sessionId!==p.sessionId;
    if(changed)this.reset();
    if(this.frame&&p.sequence<=this.frame.sequence)return false;
    if(this.frame)this.dropped+=Math.max(0,p.sequence-this.frame.sequence-1);
    const age=Math.max(Number.isFinite(p.ageMs)?Math.max(0,p.ageMs):0,Math.max(0,wallNow-p.observedAtUnixMs))+Math.max(0,requestElapsedMs);
    this.frame=p;this.receivedAt=now-age;return true;
  }
  health(now){
    if(!this.frame)return {state:'unavailable',message:'Waiting for passive camera tracking or an acoustic worker',expired:true,ageMs:null};
    const ageMs=Math.max(0,now-this.receivedAt);
    if(!this.frame.listener.valid)return {state:'invalid',message:'Passive camera unavailable · '+(this.frame.listener.reason||this.frame.reason||'invalid observation'),expired:true,ageMs};
    if(ageMs>500)return {state:'stale',message:'Passive camera stale · acoustic processing inactive',expired:true,ageMs};
    return {state:'passive',message:'Passive camera tracking · acoustic processing inactive',expired:false,ageMs};
  }
}
export function presentation(acoustic,passive,now,connected=true){
  const h=acoustic.health(now,connected),f=acoustic.frame;
  const modelKey='model:'+acoustic.streamId+':'+acoustic.sessionId+':'+JSON.stringify(f?.calibration??null);
  if(acoustic.mode==='replay')return {kind:'replay',frame:f,geometry:acoustic.geometry,listener:f?.listener,health:h,coordinateKey:modelKey};
  if(f&&connected&&h.ageMs<=500&&f.listener?.valid)return {kind:'acoustic',frame:f,geometry:acoustic.geometry,listener:f.listener,health:h,coordinateKey:modelKey};
  if(passive.frame)return {kind:'passive',frame:null,geometry:null,listener:passive.frame.listener,health:passive.health(now),coordinateKey:'native:'+passive.frame.streamId+':'+passive.frame.sessionId};
  return {kind:f?'stale-acoustic':'waiting',frame:null,geometry:null,listener:f?.listener,health:h,coordinateKey:f?'model:'+acoustic.streamId:'none'};
}

export function checkGeometry(g) {
  fail(g?.schemaVersion===1&&typeof g.generation==='string'&&g.generation.length<=512&&ident(g.sessionId),'Unsupported geometry identity');
  fail(g.streamId===undefined||ident(g.streamId),'Unsupported geometry stream identity');
  fail(g.coordinateSpace===MODEL_SPACE,'Unrecognised engine coordinate space');
  fail(Array.isArray(g.surfaces)&&g.surfaces.length<=LIMITS.surfaces,'Surface budget exceeded');
  for(const s of g.surfaces){
    fail(ident(s.id)&&Array.isArray(s.vertices)&&s.vertices.length>=3&&s.vertices.length<=16&&s.vertices.every(isPoint),'Invalid finite surface footprint');
    fail(s.openings===undefined||(Array.isArray(s.openings)&&s.openings.length<=8&&s.openings.every(o=>Array.isArray(o.vertices)&&o.vertices.length===4&&o.vertices.every(isPoint))),'Invalid surface opening');
  }
  return immutable(g);
}
export function checkFrame(f) {
  fail(f?.schemaVersion===1&&ident(f.sessionId)&&Number.isSafeInteger(f.sequence)&&f.sequence>=0,'Unsupported frame identity');
  fail(f.streamId===undefined||ident(f.streamId),'Unsupported frame stream identity');
  fail(Array.isArray(f.paths)&&f.paths.length<=LIMITS.paths&&Array.isArray(f.sources)&&f.sources.length<=LIMITS.sources,'Visual frame budget exceeded');
  fail(!f.listener?.valid||isPoint(f.listener.position),'Invalid listener pose');
  for(const s of f.sources)fail(!s.position||isPoint(s.position),'Invalid source pose');
  for(const p of f.paths){
    fail(['selected','rejected','unknown','pruned'].includes(p.status),'Unknown solver path state');
    fail(p.vertices===null||p.vertices===undefined||(Array.isArray(p.vertices)&&p.vertices.length>=2&&p.vertices.length<=4&&p.vertices.every(isPoint)),'Invalid solver path vertices');
    fail(p.points==null||(Array.isArray(p.points)&&p.points.length<=2&&p.points.every(isPoint)),'Invalid solver contact points');
  }
  return immutable(f);
}

export class VisualState {
  constructor(){this.reset();this.dropped=0;this.rejected=0;}
  reset(){this.frame=null;this.geometry=null;this.geometries=new Map();this.sessionId=null;this.streamId=null;this.receivedAt=null;this.replaySampleAgeMs=0;this.mode='live';}
  ingest(envelope,now,{wallNow=Date.now(),requestElapsedMs=0}={}){
    const mode=envelope?.mode==='replay'?'replay':'live';
    if(!envelope?.frame){this.reset();this.mode=mode;return false;}
    let frame,geometry;
    try{frame=checkFrame(envelope.frame);if(envelope.geometry)geometry=checkGeometry(envelope.geometry);}
    catch(error){this.rejected++;throw error;}
    // Older schema-1 recordings lacked streamId. They retain session-scoped
    // compatibility, while new worker identities must never borrow that cache.
    const streamId=frame.streamId??frame.sessionId;
    if(this.sessionId!==frame.sessionId||this.streamId!==streamId||this.mode!==mode)this.reset();
    this.mode=mode;this.sessionId=frame.sessionId;this.streamId=streamId;
    if(geometry){
      fail(geometry.sessionId===frame.sessionId&&geometry.generation===frame.geometryGeneration,'Geometry belongs to a different frame/session');
      fail((geometry.streamId??geometry.sessionId)===streamId,'Geometry belongs to a different worker stream');
      const old=this.geometries.get(geometry.generation);
      fail(!old||JSON.stringify(old)===JSON.stringify(geometry),'Immutable geometry generation was modified');
      this.geometries.set(geometry.generation,geometry);
      while(this.geometries.size>LIMITS.cachedGenerations)this.geometries.delete(this.geometries.keys().next().value);
    }
    if(mode==='live'&&this.frame&&frame.sequence<=this.frame.sequence)return false;
    if(mode==='live'&&this.frame)this.dropped+=Math.max(0,frame.sequence-this.frame.sequence-1);
    const serverAge=Number.isFinite(envelope.status?.ageMs)?Math.max(0,envelope.status.ageMs):0;
    const producerAge=Number.isFinite(frame.producedAtUnixMs)?Math.max(0,wallNow-frame.producedAtUnixMs):0;
    // A cached frame does not become fresh when a browser attaches/reconnects.
    // Same-host UTC production age plus server age and full request elapsed time
    // conservatively bound transport delay; original geometry timestamps stay intact.
    const age=mode==='replay'?0:Math.max(serverAge,producerAge)+Math.max(0,requestElapsedMs);
    // Replay age is cursor distance from the retained original sample, not time
    // since the browser received it. Keep its pose/paths unchanged but expose the
    // held interval and expire its original geometry lease at the cursor.
    this.replaySampleAgeMs=mode==='replay'?serverAge:0;
    this.frame=frame;this.geometry=this.geometries.get(frame.geometryGeneration)||null;this.receivedAt=now-age;return true;
  }
  geometryRequestKey(){return this.geometry?.generation||'';}
  health(now,connected=true){
    if(!this.frame)return {state:'unavailable',message:'Waiting for acoustic solver evidence',expired:true};
    const age=Math.max(0,now-this.receivedAt),historical=this.mode==='replay';
    const clock=this.frame.geometryTimeMs+(historical?this.replaySampleAgeMs:age);
    const expired=!this.geometry||!finite(clock)||!finite(this.geometry.validUntil)||clock>=this.geometry.validUntil||clock<this.geometry.createdAt;
    if(historical)return {state:'historical',message:'Historical recording · original observation timestamps'+(this.replaySampleAgeMs>0?` · held sample ${Math.round(this.replaySampleAgeMs)} ms before cursor`:''),expired,ageMs:this.replaySampleAgeMs,replaySampleAgeMs:this.replaySampleAgeMs};
    if(!connected)return {state:'disconnected',message:'Disconnected · last received evidence',expired:true,ageMs:age};
    if(age>500)return {state:'stale',message:'Stale telemetry · last received evidence',expired:true,ageMs:age};
    const conditional=this.frame.readiness?.rendererReadyForOwnedEmission===true&&
      ['listener-only-conditional-direct','vehicle-conditional-direct'].includes(this.frame.readiness?.mode);
    return {state:conditional?'conditional':expired?'expired':'live',message:conditional?'Live conditional direct path · unobserved space assumed clear':expired?'Geometry unavailable or expired · coverage unknown':this.geometry.coverage==='complete-synthetic'?'Live solver evidence · original synthetic scene':'Live solver evidence · partial world coverage',expired,ageMs:age};
  }
}

// Orthographic 3D camera; Z is up in the existing acoustic model, not screen Y.
export function project(point,{target=[0,0,0],yaw=-.7,pitch=.7,scale=20,width=800,height=600,topDown=false}={}){
  const [x,y,z]=point.map((n,i)=>n-target[i]),s=Math.sin(yaw),c=Math.cos(yaw);
  const right=c*x+s*y,front=-s*x+c*y,p=topDown?Math.PI/2:pitch;
  return {x:width/2+right*scale,y:height/2+(front*Math.sin(p)-z*Math.cos(p))*scale,
    depth:front*Math.cos(p)+z*Math.sin(p)};
}
export function pathStyle(path){
  if(path.status==='rejected')return {color:'#ef8d93',dash:[3,6],label:'Rejected / obstructed candidate'};
  if(path.status==='pruned')return {color:'#92a0b5',dash:[2,6],label:'Valid candidate, not selected'};
  if(path.status==='unknown')return {color:'#e4cc80',dash:[8,6],label:'Unknown / unavailable propagation'};
  if(path.propagation==='obstructed')return {color:'#ffabb0',dash:[12,4],label:'Selected obstructed / transmission'};
  return path.order===0?{color:'#63e8d3',dash:[],label:'Selected direct'}:
    path.order===1?{color:'#ffbc80',dash:[],label:'Selected first reflection'}:{color:'#c6adff',dash:[],label:'Selected second reflection'};
}

function calibrationKey(c){
  if(!c||!isPoint(c.originNative)||!Array.isArray(c.axes)||c.axes.length!==3||!c.axes.every(isPoint)||!finite(c.metresPerNativeUnit)||c.metresPerNativeUnit<=0)return null;
  return JSON.stringify([c.originNative,c.axes,c.metresPerNativeUnit,c.basis,c.reference,c.physicalCalibration]);
}
export function parseVisualContext(text){
  fail(typeof text==='string'&&new TextEncoder().encode(text).length<=LIMITS.contextBytes,'Private context file exceeds 4 MiB');
  const c=JSON.parse(text);
  fail(c?.schemaVersion===1&&c.kind==='richaudio-visual-context'&&c.coordinateSpace===MODEL_SPACE,'Unsupported visual context schema');
  fail(c.acousticUse===false&&c.knowledge==='historical'&&calibrationKey(c.calibration),'Context must declare historical visual-only use and its exact calibration');
  fail(ident(c.provenance?.reference)&&['private-simplified-collision','original-synthetic'].includes(c.provenance.kind),'Context provenance required');
  fail(Array.isArray(c.tiles)&&c.tiles.length<=LIMITS.contextTiles,'Context tile budget exceeded');
  let vertices=0,faces=0;
  const ids=new Set();
  for(const t of c.tiles){
    fail(ident(t.id)&&!ids.has(t.id),'Invalid or duplicate context tile identity');ids.add(t.id);
    fail(isPoint(t.bounds?.min)&&isPoint(t.bounds?.max)&&t.bounds.min.every((x,i)=>t.bounds.max[i]>x&&t.bounds.max[i]-x<=256),'Invalid bounded context tile');
    fail(Array.isArray(t.vertices)&&t.vertices.length<=512&&t.vertices.every(v=>isPoint(v)&&v.every((n,i)=>n>=t.bounds.min[i]&&n<=t.bounds.max[i])),'Invalid context vertices');
    fail(Array.isArray(t.faces)&&t.faces.length<=512&&t.faces.every(f=>Array.isArray(f)&&f.length>=3&&f.length<=8&&new Set(f).size===f.length&&f.every(i=>Number.isSafeInteger(i)&&i>=0&&i<t.vertices.length)),'Invalid context faces');
    vertices+=t.vertices.length;faces+=t.faces.length;
  }
  fail(vertices<=LIMITS.contextVertices&&faces<=LIMITS.contextFaces,'Aggregate context geometry budget exceeded');
  return immutable(c);
}
export function visibleContext(c,geometry,listener,radius=80){
  if(!c||!geometry||!isPoint(listener))return {tiles:[],reason:'No compatible acoustic coordinate evidence'};
  const calibration=geometry.calibration||geometry.observationModel?.calibration;
  if(calibrationKey(c.calibration)!==calibrationKey(calibration))return {tiles:[],reason:'Coordinate calibration mismatch; context hidden'};
  const distance=t=>Math.hypot(...listener.map((x,i)=>Math.max(t.bounds.min[i]-x,0,x-t.bounds.max[i])));
  const nearby=c.tiles.map(t=>({t,d:distance(t)})).filter(x=>x.d<=radius).sort((a,b)=>a.d-b.d);
  return {tiles:nearby.slice(0,LIMITS.visibleContextTiles).map(x=>x.t),reason:'Historical visual-only context · never acoustic surfaces',culled:Math.max(0,nearby.length-LIMITS.visibleContextTiles)};
}

export class ReplayClock {
  constructor(){this.durationMs=0;this.timeMs=0;this.playing=false;this.lastNow=null;}
  open(durationMs){this.durationMs=Math.max(0,Number(durationMs)||0);this.seek(0);this.playing=false;this.lastNow=null;}
  seek(ms){this.timeMs=Math.max(0,Math.min(this.durationMs,Number(ms)||0));this.lastNow=null;return this.timeMs;}
  tick(now){if(this.playing&&this.lastNow!==null)this.timeMs=Math.min(this.durationMs,this.timeMs+Math.max(0,now-this.lastNow));this.lastNow=now;if(this.timeMs>=this.durationMs)this.playing=false;return this.timeMs;}
}
