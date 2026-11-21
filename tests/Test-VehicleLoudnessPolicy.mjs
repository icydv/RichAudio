import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VehicleLoudnessPolicy,classifyVehicleLoudness,defaultVehicleLoudnessPolicy,
  validateVehicleLoudnessConfiguration,applyVehicleLoudnessEnvelopeInto,assessVehicleLoudnessHeadroom,
  vehicleModificationSlots} from '../src/acoustics/vehicle/loudness-policy.mjs';
import {stockExteriorPressure,stockExteriorPressureGains} from '../src/acoustics/vehicle/stock-pressure.mjs';
import {StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';
import {evaluateProductionActivation,defaultFeatureRequests} from '../src/acoustics/production/activation.mjs';

// Opaque fixture identity; no real vehicle/native compatibility is implied.
const vehicle=(changes={})=>({id:'fixture:car',generation:1,model:0x12345678,classId:1,context:'player',...changes});
const observed=(index=-1,count=4)=>({status:'observed',index,count});
function modification(v,{engine=observed(),exhaust=observed(),...changes}={}){
  return {vehicleId:v.id,generation:v.generation,model:v.model,observedAtSeconds:0,modKitReady:true,engine,exhaust,...changes};
}
const configured=(changes={})=>({...structuredClone(defaultVehicleLoudnessPolicy),enabled:true,modificationStaleAfterSeconds:5,...changes});
const outputs=vs=>vs.map(v=>({id:v.id,generation:v.generation,engine:new Float32Array(512),exhaust:new Float32Array(512),bus:new Float32Array(512)}));
function render(policy,vs,frames,block=512){
  const out=outputs(vs),result=vs.map(()=>({engine:[],exhaust:[],bus:[]}));
  for(let at=0;at<frames;at+=block){const n=Math.min(block,frames-at);policy.writeEnvelopesInto(out,n);
    for(let i=0;i<out.length;i++)for(const k of ['engine','exhaust','bus'])result[i][k].push(...out[i][k].subarray(0,n));}
  return result;
}

test('defaults preserve exact accepted reference and both live feature requests remain disabled',()=>{
  assert.equal(defaultVehicleLoudnessPolicy.enabled,false);
  assert.deepEqual(defaultVehicleLoudnessPolicy.reference,{engine:1,exhaust:10,commonHeadroom:.25});
  assert.equal(stockExteriorPressure.exhaust,10);assert.equal(stockExteriorPressure.commonHeadroom,.25);
  assert.deepEqual(stockExteriorPressureGains(['stock:a:engine','stock:a:exhaust']),{'stock:a:engine':.25,'stock:a:exhaust':2.5});
  const v=vehicle();v.modification=modification(v,{engine:observed(0),exhaust:observed(2)});
  const policy=new VehicleLoudnessPolicy();policy.update([v],0);
  for(const values of Object.values(render(policy,[v],2048)[0]))assert.ok(values.every(x=>x===1));
  assert.equal(defaultFeatureRequests.modificationAwareLoudness,false);
  assert.equal(evaluateProductionActivation({...defaultFeatureRequests,modificationAwareLoudness:true}).productionLoudnessAllowed,false);
});

test('factory category fallback is data-driven and never implies modifications',()=>{
  for(const classId of [0,1,2,3,8,9,10,31,null,undefined]){
    const d=classifyVehicleLoudness(vehicle({classId}),0);assert.equal(d.category,'civilian');assert.equal(d.qualifiedModified,false);
  }
  for(const classId of [4,6,7]){
    const d=classifyVehicleLoudness(vehicle({classId}),0);assert.equal(d.category,'performance');assert.equal(d.emission.exhaust,.65);
  }
  const c=configured();c.modelOverrides['0x12345678']={category:'performance',engine:.97,exhaust:.9};
  const v=vehicle();v.modification=modification(v,{engine:observed(0)});
  const d=classifyVehicleLoudness(v,0,c);assert.equal(d.modelOverride,true);assert.equal(d.category,'performance');
  assert.equal(d.modificationState,'ems');assert.equal(d.emission.exhaust,.9,'EMS cannot make an already prominent factory model quieter');
});

test('exhaust OR first nonstock EMS qualifies, including unavailable or unknown exhaust data',()=>{
  assert.deepEqual(vehicleModificationSlots,{exhaust:4,engine:11});
  for(const engine of [observed(0),observed(1),observed(3)]){
    const v=vehicle();v.modification=modification(v,{engine,exhaust:observed(-1,0)});
    const d=classifyVehicleLoudness(v,0);assert.equal(d.qualifiedModified,true);assert.equal(d.modificationState,'ems');
    assert.equal(d.emsUpgradeOrdinal,engine.index+1);assert.equal(d.exhaustState,'unavailable');assert.equal(d.emission.exhaust,.82);
  }
  const v=vehicle();v.modification=modification(v,{engine:observed(0),exhaust:{status:'unknown'}});
  assert.equal(classifyVehicleLoudness(v,0).modificationState,'ems');
  v.modification=modification(v,{engine:{status:'unknown'},exhaust:observed(0)});
  assert.equal(classifyVehicleLoudness(v,0).modificationState,'exhaust');
  assert.equal(classifyVehicleLoudness(v,0).emission.exhaust,1);
  v.modification=modification(v,{engine:observed(0),exhaust:observed(0)});
  assert.equal(classifyVehicleLoudness(v,0).modificationState,'exhaust-and-ems');
});

test('missing, contradictory, stale, future, foreign identity or unready mod-kit data falls back to stock',()=>{
  const base=vehicle({classId:6});
  for(const changes of [{modKitReady:false},{observedAtSeconds:-1},{observedAtSeconds:1},{vehicleId:'other'},
    {generation:2},{model:42},{engine:observed(4,4)},{engine:observed(0,0)},{engine:observed(-2)},
    {engine:{status:'observed',count:NaN,index:0}},{engine:{status:'observed',count:257,index:0}}]){
    const v={...base,modification:modification(base,changes)};const d=classifyVehicleLoudness(v,0);
    assert.equal(d.qualifiedModified,false);assert.equal(d.emission.exhaust,.65);assert.equal(d.modificationState,'unknown');
  }
  const old={...base,modification:modification(base,{engine:observed(0)})};
  assert.equal(classifyVehicleLoudness(old,.500001).qualifiedModified,false);
  const stock={...base,modification:modification(base)};
  assert.equal(classifyVehicleLoudness(stock,0).modificationState,'stock-or-no-options-reported');
  assert.equal(classifyVehicleLoudness(base,0).emission.exhaust,.65);
});

test('player and NPC use identical stock, uncertainty and qualification rules',()=>{
  for(const engine of [observed(),observed(0),{status:'unknown'}]){
    const p=vehicle();p.modification=modification(p,{engine});const n={...p,context:'npc'};
    const a=classifyVehicleLoudness(p,0),b=classifyVehicleLoudness(n,0);a.context=b.context;
    assert.deepEqual(a,b);
  }
});

test('positive bounded emission envelopes settle smoothly and are block-partition invariant',()=>{
  const v=vehicle(),a=new VehicleLoudnessPolicy({configuration:configured()}),b=new VehicleLoudnessPolicy({configuration:configured()});
  a.update([v],0);b.update([v],0);
  const x=render(a,[v],48000,512)[0],y=render(b,[v],48000,97)[0];assert.deepEqual(x,y);
  assert.ok(Math.abs(x.engine.at(-1)-(.85+.15*Math.exp(-5)))<1e-7);
  assert.ok(Math.abs(x.exhaust.at(-1)-(.3+.7*Math.exp(-5)))<1e-7);
  assert.ok(x.exhaust.every((z,i)=>z>=.3&&z<=1&&(!i||Math.abs(z-x.exhaust[i-1])<.001)));
  assert.ok(x.bus.every(z=>z===1));
});

test('weighted prominence remains bounded across priority transfers without muting voices',()=>{
  const c=configured(),vs=Array.from({length:8},(_,i)=>{const v=vehicle({id:`v${i}`,context:i%2?'npc':'player'});
    v.modification=modification(v,{exhaust:observed(0)});return v;});
  const p=new VehicleLoudnessPolicy({configuration:c});p.update(vs,0);const out=outputs(vs);
  for(let step=0;step<200;step++){
    if(step===80){vs.forEach((v,i)=>v.priority=i<2?0:1);p.update(vs,p.frames/48000);}
    p.writeEnvelopesInto(out);
    assert.ok(p.diagnostics().allocatedProminenceUnits<=2+1e-12);
    for(const o of out){assert.ok(o.bus.every(x=>x>=.6-1e-7&&x<=1));assert.ok(o.exhaust.every(x=>x>0&&x<=1));}
  }
  assert.equal(p.diagnostics().activeVehicles,8);
  assert.equal(p.diagnostics().liveIntegration,false);
});

test('modification expiry follows emitted frames and stale repeated updates cannot extend it',()=>{
  const v=vehicle();v.modification=modification(v,{exhaust:observed(0)});
  const p=new VehicleLoudnessPolicy({configuration:configured({modificationStaleAfterSeconds:.1})});p.update([v],0);
  render(p,[v],4800);p.update([v],0);render(p,[v],48000);
  const d=p.diagnostics().vehicles[0];assert.equal(d.modificationState,'expired');
  assert.ok(Math.abs(d.emission.exhaust-.3)<.005);assert.ok(d.emission.exhaust>0);
});

test('whole-bus prominence remains nonzero but can fall below stock baseline under contention',()=>{
  const c=configured({prominence:{maximumUnits:0,minimumBusGain:.6}}),v=vehicle({classId:6});
  v.modification=modification(v,{exhaust:observed(0)});
  const p=new VehicleLoudnessPolicy({configuration:c});p.update([v],0);
  const out=render(p,[v],96000)[0],bus=out.bus.at(-1);
  assert.ok(bus>=.6&&bus<.601);assert.equal(p.diagnostics().allocatedProminenceUnits,0);
  assert.ok(out.engine.at(-1)*bus<c.stockTreatments.performance.engine);
  assert.ok(out.exhaust.at(-1)*bus<c.stockTreatments.performance.exhaust);
  assert.ok(out.bus.every(x=>x>0),'contention never arbitrarily zeroes a vehicle bus');
});

test('classification change preserves smoothing state and independently retains release identities',()=>{
  const v=vehicle();const p=new VehicleLoudnessPolicy({configuration:configured()});p.update([v],0);
  render(p,[v],24000);const before=p.diagnostics().vehicles[0].emission.exhaust;
  v.modification=modification(v,{engine:observed(0),observedAtSeconds:.5});p.update([v],.5);
  const next=render(p,[v],1)[0].exhaust[0];assert.ok(Math.abs(next-before)<.001);
  const replacement={...v,generation:2};replacement.modification=modification(replacement,{engine:observed(0),observedAtSeconds:.5});
  p.update([v,replacement],.5);assert.equal(p.diagnostics().activeVehicles,2);
  const returned=p.update([v],.5);returned[0].stockEmission.exhaust=10;returned[0].emission.exhaust=10;
  render(p,[v],24000);assert.ok(p.diagnostics().vehicles[0].emission.exhaust<=1);
});

test('amplitude application never mutates original PCM, source playback or previous history frames',()=>{
  const samples=Float32Array.from({length:8192},(_,i)=>.2*Math.sin(i*.03));
  const asset={frames:8192,sampleRate:24000,samples};
  const bank={model:'bati',layers:Object.fromEntries(['engine','exhaust'].map(role=>[role,Object.fromEntries(['idle','accel','decel'].map(mode=>[mode,asset]))]))};
  const source=new StockVehicleSource(bank),baseline=new StockVehicleSource(bank),original=Float32Array.from(samples);
  const v=vehicle(),p=new VehicleLoudnessPolicy({configuration:configured()});p.update([v],0);const env=outputs([v]);
  const engine=new Float32Array(512),exhaust=new Float32Array(512),be=new Float32Array(512),bx=new Float32Array(512),out=new Float32Array(512);
  const retainedHistory=new Float32Array(1536),oldPrefix=new Float32Array(512).fill(.123);retainedHistory.set(oldPrefix);
  for(let b=0;b<3;b++){
    const control={operatingPoint:.7,load:.8,running:true,lift:false};source.renderInto(control,engine,exhaust);baseline.renderInto(control,be,bx);
    assert.deepEqual(engine,be);assert.deepEqual(exhaust,bx);p.writeEnvelopesInto(env);
    const before=Float32Array.from(exhaust);applyVehicleLoudnessEnvelopeInto(exhaust,env[0].exhaust,out);assert.deepEqual(exhaust,before);
    if(b<2)retainedHistory.set(out,512+b*512);
    assert.deepEqual(retainedHistory.subarray(0,512),oldPrefix);assert.equal(source.frame,baseline.frame);
  }
  assert.deepEqual(samples,original);assert.equal(source.stats.oscillatorSamples,0);
});

test('headroom uses absolute full-reference history bounds rather than cancellation or current quieter gains',()=>{
  const safe=assessVehicleLoudnessHeadroom([{engine:.2,exhaust:.4},{engine:.1,exhaust:.1}]);
  assert.equal(safe.admitted,true);assert.ok(Math.abs(safe.absolutePeakBound-.8)<1e-12);
  assert.equal(safe.includesOlderLouderHistory,true);assert.equal(safe.emissionHistoryGainCeiling,1);assert.equal(safe.reliesOnCancellation,false);
  assert.equal(assessVehicleLoudnessHeadroom([{engine:.6,exhaust:.5}]).admitted,false);
  assert.ok(Math.abs(.6-.5)<Math.abs(.6-.5*.3),'attenuation can remove cancellation; a smaller actual reference mix peak is not a safe bound');
  assert.throws(()=>assessVehicleLoudnessHeadroom([{engine:NaN,exhaust:.1}]));
  assert.equal(safe.measuredClippingProof,false);
});

test('configuration, capacity, clocks and aliased buffers reject before changing output/state',()=>{
  for(const change of [{enabled:1},{maximumVehicles:65},{transitionSeconds:0},{prominence:{maximumUnits:9,minimumBusGain:.6}},
    {reference:{engine:1,exhaust:11,commonHeadroom:.25}},{unknown:true}])assert.throws(()=>validateVehicleLoudnessConfiguration({...structuredClone(defaultVehicleLoudnessPolicy),...change}));
  const bad=configured();bad.stockTreatments.civilian.exhaust=0;assert.throws(()=>new VehicleLoudnessPolicy({configuration:bad}));
  const v=vehicle(),p=new VehicleLoudnessPolicy();p.update([v],1);const before=p.diagnostics();
  const zero=vehicle({model:0});zero.modification=modification(zero,{engine:observed(0)});
  assert.throws(()=>classifyVehicleLoudness(zero,0));assert.throws(()=>p.update([zero],1));
  assert.throws(()=>p.update([v,v],1));assert.throws(()=>p.update([v],.9));assert.deepEqual(p.diagnostics(),before);
  const out=outputs([v]);out[0].bus=out[0].exhaust;assert.throws(()=>p.writeEnvelopesInto(out));assert.equal(p.frames,0);
  const input=new Float32Array(512).fill(.2),env=new Float32Array(512).fill(1),copy=Float32Array.from(input);
  assert.throws(()=>applyVehicleLoudnessEnvelopeInto(input,env,input));assert.deepEqual(input,copy);
  env[100]=NaN;const dest=new Float32Array(512).fill(.7),prior=Float32Array.from(dest);
  assert.throws(()=>applyVehicleLoudnessEnvelopeInto(input,env,dest));assert.deepEqual(dest,prior);
});
