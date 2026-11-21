// Offline safety/telemetry model only. No native calls, entity creation or deletion.
import {vec,number,id,freeze} from './world-cache-format.mjs';
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const sameKey=(a,b)=>!!a&&!!b&&['handle','generation','session','model','nonce'].every(k=>a[k]===b[k]);
function key(k){if(!k||!Number.isSafeInteger(k.handle)||k.handle<=0||!Number.isSafeInteger(k.generation)||k.generation<1)throw Error('entity identity');for(const n of ['session','model','nonce'])id(k[n]);return structuredClone(k);}
function segmentDistance(p,a,b){const d=b.map((x,i)=>x-a[i]),n=d.reduce((s,x)=>s+x*x,0);if(n===0)return distance(p,a);const t=Math.max(0,Math.min(1,p.reduce((s,x,i)=>s+(x-a[i])*d[i],0)/n));return distance(p,a.map((x,i)=>x+t*d[i]));}
export function validateRoute(r){
 if(!r||r.version!==1||r.evidence!=='synthetic-validated'||r.liveValidated!==false||!Array.isArray(r.checkpoints)||r.checkpoints.length<3||r.checkpoints.length>16||!Number.isFinite(r.width)||r.width<=0||r.width>10)throw Error('no validated live route; synthetic fixture required');id(r.id);r.checkpoints.forEach(vec);vec(r.listener);for(let i=1;i<r.checkpoints.length;i++)if(distance(r.checkpoints[i],r.checkpoints[i-1])<1||distance(r.checkpoints[i],r.checkpoints[i-1])>200)throw Error('route segment');return r;
}
export class TrafficIsolationResearch{
 constructor(route){this.route=validateRoute(route);this.phase='off';this.started=0;this.last=null;}
 enable(now){number(now,0,86400000);if(this.phase!=='off')throw Error('isolation already requested');this.phase='requested';this.started=now;}
 nativeIntents(now){number(now,0,86400000);if(this.phase==='off'||now<this.started||now-this.started>=120000){this.off();return [];}return ['SET_VEHICLE_DENSITY_MULTIPLIER_THIS_FRAME','SET_RANDOM_VEHICLE_DENSITY_MULTIPLIER_THIS_FRAME','SET_PARKED_VEHICLE_DENSITY_MULTIPLIER_THIS_FRAME'].map(name=>({name,value:0,scope:'benchmark-phase-global-frame-only-request-not-verification'}));}
 observe(s){if(!s||s.domain!=='original-synthetic-fixture'||!Array.isArray(s.vehicles)||s.vehicles.length>256||!Array.isArray(s.coveredSegments)||s.coveredSegments.length!==this.route.checkpoints.length-1||!Number.isFinite(s.at))throw Error('traffic evidence');for(const v of s.vehicles){vec(v.position);number(v.radius,0,10);key(v.identity);}this.last=freeze(structuredClone(s));}
 status(now,owned=[]){
  number(now,0,86400000);if(this.phase==='off')return {isolation:'OFF',interference:'UNKNOWN',clear:false};const s=this.last;
  if(now<this.started||now-this.started>=120000){this.off();return {isolation:'OFF',interference:'UNKNOWN',clear:false};}
  if(!s||now<s.at||now-s.at>100||s.coveredSegments.some(x=>x!==true)||s.controlsObservedEffective!==true)return {isolation:'UNVERIFIED',interference:'UNKNOWN',clear:false};
  const found=s.vehicles.some(v=>!owned.some(k=>sameKey(k,v.identity))&&this.route.checkpoints.slice(1).some((end,i)=>segmentDistance(v.position,this.route.checkpoints[i],end)<=this.route.width+v.radius));
  return {isolation:'ACTIVE',interference:found?'DETECTED':'NONE OBSERVED',clear:!found};
 }
 off(){this.phase='off';this.last=null;}
}
export class BenchmarkResearch{
 constructor(route){this.route=freeze(structuredClone(validateRoute(route)));this.traffic=new TrafficIsolationResearch(this.route);this.state='IDLE';this.passes=[];this.current=null;this.owned=[];this.reason=null;}
 prepare(now){if(!['IDLE','READY'].includes(this.state)||this.current||this.passes.length>=2||this.passes.some(p=>!p.valid)||this.owned.length)throw Error('no automatic reset/retry');this.traffic.enable(now);this.state='PREPARED';}
 registerSpawn(vehicle,rider){if(this.state!=='PREPARED'||this.owned.length)throw Error('spawn state');const v=key(vehicle),r=key(rider);if(v.model!=='bati'||v.handle===r.handle||v.nonce!==r.nonce||v.session!==r.session)throw Error('spawn ownership');this.owned=[v,r];this.state='SPAWNED';}
 spawnFailed(){if(this.state!=='PREPARED')throw Error('spawn state');this.state='FAILED';this.reason='spawn-failed';this.traffic.off();this.passes.push({valid:false,reason:this.reason,frames:[]});}
 start({now,listener,cameraStable=true,storyMode=true}){number(now,0,86400000);vec(listener);if(this.state!=='SPAWNED'||!storyMode||!cameraStable||distance(listener,this.route.listener)>.25||!this.traffic.status(now,this.owned).clear)throw Error('benchmark start gate');this.current={started:now,last:null,next:0,frames:[],maximumObservedDistance:0,lastProgress:now};this.state='RUNNING';}
 fail(reason){if(!this.current)return;this.current.valid=false;this.current.reason=reason;this.passes.push(freeze(structuredClone(this.current)));this.current=null;this.state='FAILED';this.reason=reason;this.traffic.off();}
 observe(frame){
  if(this.state!=='RUNNING')throw Error('not running');const run=this.current;
  try{
   number(frame.at,0,86400000);if(frame.at<run.started||run.last!==null&&frame.at<=run.last)throw Error('timestamp');if(frame.at-run.started>120000||run.frames.length>=2400)throw Error('timeout-or-sample-bound');
   if(!sameKey(frame.vehicle?.identity,this.owned[0])||!sameKey(frame.rider?.identity,this.owned[1]))throw Error('entity-lost-or-reused');
   if(frame.vehicle.simulation!=='observed-current'||frame.vehicle.collision!==false||frame.rider.seated!==true||frame.rider.alive!==true)throw Error('simulation-collision-or-rider');
   const p=vec(frame.vehicle.position),listener=vec(frame.listener.position),velocity=vec(frame.vehicle.velocity);number(frame.listener.at,0,86400000);if(Math.abs(frame.at-frame.listener.at)>50||distance(listener,this.route.listener)>.25||frame.listener.stationary!==true||frame.listener.cameraStable!==true)throw Error('listener-or-time-alignment');
   if(run.last!==null&&frame.at-run.last>250)throw Error('missing-data-gap');const speed=Math.hypot(...velocity);number(speed,0,100);if(frame.vehicle.engineRunning!==true)throw Error('engine-state');if(run.frames.length&&distance(p,run.frames.at(-1).position)>100*(frame.at-run.last)/1000+2)throw Error('unexplained-position-jump');
   if(!this.traffic.status(frame.at,this.owned).clear)throw Error('traffic-interference-or-unknown-coverage');if(!this.route.checkpoints.slice(1).some((b,i)=>segmentDistance(p,this.route.checkpoints[i],b)<=this.route.width))throw Error('route-deviation');
   if(distance(p,this.route.checkpoints[run.next])<=1){run.next++;run.lastProgress=frame.at;}else if(this.route.checkpoints.slice(run.next+1).some(q=>distance(p,q)<=1))throw Error('checkpoint-skipped');
   if(frame.at-run.lastProgress>8000)throw Error('no-checkpoint-progress');const separation=distance(p,listener);run.maximumObservedDistance=Math.max(run.maximumObservedDistance,separation);run.last=frame.at;run.frames.push({at:frame.at,position:[...p],velocity:[...velocity],distanceNativeUnits:separation,speedNativeUnitsPerSecond:speed,checkpoint:run.next,rpm:{classification:'unavailable',reason:'RPH-getter-invalid-no-validated-provider'},geometryCoverage:'unknown',positionClassification:'observed-in-synthetic-fixture'});
   if(run.next===this.route.checkpoints.length){run.valid=true;run.reason='complete';this.passes.push(freeze(structuredClone(run)));this.current=null;this.state='COMPLETE';this.traffic.off();}
  }catch(e){this.fail(e.message);}
 }
 cleanupRequests(observed){if(!Array.isArray(observed)||observed.length>256)throw Error('bounded identities');return freeze(this.owned.filter(k=>observed.some(o=>sameKey(k,o))).map(k=>({...k,action:'request-delete-owned-only-not-executed'})));}
 acknowledgeCleanup({remaining,checkedAbsent}){if(!Array.isArray(remaining)||remaining.length>256||!Array.isArray(checkedAbsent)||checkedAbsent.length!==this.owned.length||!this.owned.every(k=>checkedAbsent.some(o=>sameKey(k,o))))throw Error('independent absence checks required');if(this.owned.some(k=>remaining.some(o=>sameKey(k,o))))throw Error('owned entity remains');if(remaining.some(o=>this.owned.some(k=>k.handle===o.handle&&!sameKey(k,o))))throw Error('handle reuse; cleanup uncertain');this.owned=[];if(this.state==='COMPLETE')this.state='READY';}
 stop(){if(this.current)this.fail('interrupted');this.traffic.off();if(this.state!=='FAILED')this.state='STOPPED';}
 replay(){return freeze({domain:'offline-synthetic-only',state:this.state,passes:structuredClone(this.passes),traffic:this.traffic.status(this.current?.last??0,this.owned),spawnRequests:0,geometryQueries:0,audioCalls:0,liveStartSupported:false});}
}
export function compareRuns(a,b){if(!a?.valid||!b?.valid)return {classification:'unproven',reason:'two-valid-passes-required'};for(const p of [a,b]){number(p.started,0,86400000);if(!Array.isArray(p.frames)||!p.frames.length||p.frames.length>2400)throw Error('comparison frame bound');p.frames.forEach(f=>{vec(f.position);number(f.at,0,86400000);});}if(a.frames.length!==b.frames.length)return {classification:'controlled-only',reason:'sample-count-differs'};const positionError=Math.max(...a.frames.map((f,i)=>distance(f.position,b.frames[i].position))),timeError=Math.max(...a.frames.map((f,i)=>Math.abs((f.at-a.started)-(b.frames[i].at-b.started))));return {classification:positionError<=1&&timeError<=100?'measured-comparable-synthetic-only':'controlled-only',positionErrorNativeUnits:positionError,timeErrorMs:timeError,deterministic:false};}
