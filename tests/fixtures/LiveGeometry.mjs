// Controlled live-feed clocks and original analytic ray observations. No GTA capture.
import { observedFixture } from './ObservedGeometry.mjs';
export const nativeOrigin=[100,200,3],frequency=10000000,tickOrigin=700000000,observationOriginMs=10000;
export const listenerSession='a'.repeat(32),geometrySession='controlled-observation';
const add=p=>p.map((x,i)=>x+nativeOrigin[i]);
export function liveConfiguration(epoch=1){return {type:'geometry-config',configuration:{epoch,
  geometrySession,listenerSession,minimumListenerGeneration:1,build:'1.0.1158.16',interior:0,
  coordinates:{originNative:nativeOrigin,axes:[[0,1,0],[-1,0,0],[0,0,1]],metresPerNativeUnit:10,
    basis:'declared-demonstration-scale',reference:'original-controlled-native-fixture'},
  clock:{id:'controlled-clock-1',relation:'paired-same-rate-monotonic',basis:'controlled-fixture',frequency,
    delivery:{maximumMs:0,basis:'controlled-fixture',reference:'deterministic-audio-frame-delivery'},
    samples:[{observationMs:9000,listenerTicks:tickOrigin-frequency,uncertaintyMs:0},
      {observationMs:10000,listenerTicks:tickOrigin,uncertaintyMs:0}]},
  region:{minNative:add([-2,-2,-1]),maxNative:add([2,2,3])},
  sources:[nativeSource()],materialsByKind:{wall:{reflection:[.85,.6,.3],transmission:[.025,.004,.0004],reference:'authored-wall'},
    ground:{reflection:[.7,.45,.2],reference:'authored-ground'}},engine:{order:2,airDbPerMetre:[0,0,0]}}};}
export function nativeSource(generation=1){return {id:'beacon-0',rights:'original-generated',reference:'owned-synthetic-beacon',generation,
  positionNative:add([-.3,.1,.8]),velocityNative:[0,0,0],forwardNative:[1,0,0],upNative:[0,0,1]};}
export function nativeEnvelope(time,sequence=0,overrides={}) {return {type:'listener',receiptAgeMs:0,state:{
  version:1,session:listenerSession,generation:1,sequence,observationTicks:tickOrigin+Math.round(time*frequency),clockFrequency:frequency,
  gameTimeMs:Math.round(time*1000),position:add([.3,.1,.7]),velocity:[0,0,0],forward:[-1,0,0],up:[0,0,1],
  listenerKind:'camera',velocityKind:'estimated-camera-difference',paused:false,valid:true,reason:'valid',
  coordinates:'gta-native-unscaled',units:'native-unverified',sourceId:null,...overrides}};}
export function geometryEvent(time,revision,{empty=false,wallY=.5}={}){
  // Capture completes 1 ms before delivery; raw listener QPC is tick-quantized.
  const end=observationOriginMs+time*1000-1,groups=empty?[]:observedFixture();
  for(const g of groups){
    g.Session=geometrySession;g.StartedMs=end-10;g.FinishedMs=end;
    for(const key of ['Player']){g[key]={X:g[key].X+100,Y:g[key].Y+200,Z:g[key].Z+3};}
    for(const s of g.Samples){
      s.Observation.SessionId=geometrySession;s.Observation.ObservedAtMs+=end-10;
      if(g.Kind==='wall')s.Observation.HitPosition.Y=wallY;
      for(const [o,keys] of [[s.Ray,['Origin','End']],[s.Observation,['Origin','End','HitPosition']]])
        for(const key of keys)o[key]={X:o[key].X+100,Y:o[key].Y+200,Z:o[key].Z+3};
    }
  }
  return {type:'geometry',epoch:1,clockId:'controlled-clock-1',session:geometrySession,build:'1.0.1158.16',interior:0,
    revision,observedAtMs:end,groups};
}
