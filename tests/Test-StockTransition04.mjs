// Analytical signals test clock/transition mechanics, never authentic timbre.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StockVehicleSource,StockGrainVoice,stockModes,stockRoles} from '../src/acoustics/vehicle/stock-source.mjs';

const FS=48000,loaded={operatingPoint:.7,load:.9,running:true,lift:false};
function periodic(period,offset=0,amplitude=.2){
  const frames=period*12,samples=Float32Array.from({length:frames},(_,i)=>amplitude*Math.sin(2*Math.PI*(i/period+offset)));
  return {samples,frames,sampleRate:FS,intervals:Array.from({length:12},(_,i)=>({startFrame:i*period,endFrame:(i+1)*period}))};
}
function fixture(){return {model:'prototipo',layers:{
  engine:{idle:periodic(600,.07),accel:periodic(480,.19),decel:periodic(400,.43)},
  exhaust:{idle:periodic(640,.31),accel:periodic(500,.49),decel:periodic(420,.73)},
}};}
function run(source,control,frames,observe=null){
  const e=new Float32Array(128),x=new Float32Array(128);
  for(let at=0;at<frames;at+=128){const n=Math.min(128,frames-at);source.renderInto(typeof control==='function'?control(at/FS):control,e,x,n);observe?.(e,x,n);}
}
function observed(source){
  const calls=Object.fromEntries(stockRoles.map(role=>[role,Object.fromEntries(stockModes.map(mode=>[mode,{frames:0,value:null,rate:null}]))]));
  for(const role of stockRoles)for(const mode of stockModes){const voice=source.voices[role][mode],original=voice.next;
    voice.next=function(u,rate){const value=original.call(this,u,rate),row=calls[role][mode];row.frames++;row.value=value;row.rate=rate;return value;};}
  return calls;
}
const rms=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);
const variation=a=>{const mean=a.reduce((s,x)=>s+x,0)/a.length;return Math.sqrt(a.reduce((s,x)=>s+(x-mean)**2,0)/a.length)/mean;};

test('role-local shared rate removes analytical independent-clock beating during mixed load',()=>{
  const vehicle=fixture(),source=new StockVehicleSource(vehicle),calls=observed(source);
  run(source,loaded,FS*2);
  const mixture={...loaded,load:.15},repaired=[];
  run(source,mixture,FS*2,(e,x,n)=>{if(repaired.length<FS*2)for(let i=0;i<n;i++)repaired.push(e[i]);});
  const window=480,energies=[];
  for(let at=FS;at+window<=repaired.length;at+=window)energies.push(rms(repaired.slice(at,at+window)));
  const a=new StockGrainVoice(vehicle.layers.engine.accel),b=new StockGrainVoice(vehicle.layers.engine.decel),independent=[];
  for(let i=0;i<FS;i++)independent.push(.25*(a.next(.7)+b.next(.3)));
  const oldEnergies=[];for(let at=0;at+window<=independent.length;at+=window)oldEnergies.push(rms(independent.slice(at,at+window)));
  // The analytical tones differ by20Hz. A10ms energy observation exposes
  // their independent-clock beat while retaining the shared110Hz tone.
  assert.ok(variation(oldEnergies)>.2,'independent-rate control must expose beat modulation');
  assert.ok(variation(energies)<.05,'registered same-rate material retains a stable periodic envelope');
  for(const role of stockRoles){assert.equal(calls[role].accel.rate,source.commonRates[role]);assert.equal(calls[role].decel.rate,source.commonRates[role]);}
  assert.notEqual(source.commonRates.engine,source.commonRates.exhaust,'different source roles retain independent rate evidence');
});

test('entering material has no silent playback history and aligns at different load-transition times',()=>{
  for(const time of [.411,.787]){
    const source=new StockVehicleSource(fixture()),calls=observed(source);
    run(source,loaded,Math.round(time*FS));
    for(const role of stockRoles){assert.equal(source.voices[role].decel.frame,0);assert.equal(calls[role].decel.frames,0);}
    const before=source.stats.transitions.phaseAlignments,e=new Float32Array(1),x=new Float32Array(1);
    let maximumMismatch=0;
    for(let i=0;i<960;i++){
      source.renderInto({...loaded,load:.15},e,x,1);
      for(const role of stockRoles){
        assert.equal(calls[role].accel.rate,calls[role].decel.rate,'both modes consume this sample\'s common clock');
        maximumMismatch=Math.max(maximumMismatch,Math.abs(calls[role].accel.value-calls[role].decel.value));
      }
    }
    assert.equal(source.stats.transitions.phaseAlignments,before+2,'one entering alignment per role');
    assert.ok(maximumMismatch<.012,'equivalent waveforms register against the current outgoing phase at either entry time');
  }
});

test('loaded acceleration, deceleration and settled idle are three actually exercised states',()=>{
  const source=new StockVehicleSource(fixture());
  run(source,loaded,FS*2);assert.equal(source.weights[0],0);assert.equal(source.weights[2],0);
  run(source,{...loaded,operatingPoint:.4,load:.05,lift:true},FS*2);
  assert.ok(source.weights[2]>.999999);assert.equal(source.weights[0],0);assert.equal(source.weights[1],0);
  const idleControl={operatingPoint:.04,load:.05,running:true,lift:true};
  run(source,idleControl,FS*2);
  assert.ok(source.weights[0]>.999999);assert.equal(source.weights[1],0);assert.equal(source.weights[2],0);
  for(const role of stockRoles){
    assert.ok(Math.abs(source.commonRates[role]-source.voices[role].idle.rateAt(.5))<1e-10);
    assert.ok(source.stats.energy[role].actual>0);assert.ok(source.envelope>.999999,'idle remains running and audible');
    const frames=source.voices[role].decel.frame;run(source,idleControl,128);assert.equal(source.voices[role].decel.frame,frames,'settled inactive decel must not advance');
  }
});

test('per-mode emitter shares are applied before waveform mixing without state cross terms',()=>{
  const vehicle=fixture();
  for(const role of stockRoles)for(const mode of stockModes)vehicle.layers[role][mode].samples.fill(mode==='accel'?.2:mode==='decel'?.6:.4);
  const shares={idle:{engine:.5,exhaust:.5},load:{engine:.2,exhaust:.8},lift:{engine:.8,exhaust:.2}},source=new StockVehicleSource(vehicle,{pressureSharesByState:shares});
  run(source,{...loaded,load:.15},FS*2);
  const e=new Float32Array(1),x=new Float32Array(1);source.renderInto({...loaded,load:.15},e,x);
  const wanted=role=>Math.fround(source.weights.reduce((s,w,m)=>s+w*shares[['idle','load','lift'][m]][role]*vehicle.layers[role][stockModes[m]].samples[0],0)*source.envelope);
  assert.equal(e[0],wanted('engine'));assert.equal(x[0],wanted('exhaust'));
  assert.ok(Math.abs(e[0]-.26)<1e-6,'engine blend is .5*.2*.2+.5*.8*.6');
});

test('continuous X80-style authored rise has a continuous measured-interval rate',()=>{
  const vehicle=fixture();
  for(const role of stockRoles){
    const periods=[4800,4000,3200,2400,1800,1400,1100,900,750,650,600,560],frames=periods.reduce((s,p)=>s+p,0),samples=new Float32Array(frames);let start=0;
    const intervals=periods.map(period=>{for(let i=0;i<period;i++)samples[start+i]=.2*Math.sin(2*Math.PI*i/period);const span={startFrame:start,endFrame:start+period};start+=period;return span;});
    vehicle.layers[role].accel={samples,frames,sampleRate:FS,intervals};
  }
  const source=new StockVehicleSource(vehicle),calls=observed(source);
  run(source,t=>({...loaded,operatingPoint:.3+.65*t/2}),FS*2);
  for(const role of stockRoles){
    const stats=source.stats.transitions.roles[role];
    assert.ok(stats.maximumCommonRateHz>stats.minimumCommonRateHz+20,'rise traverses distinct measured source rates');
    assert.ok(stats.maximumRateStepHz<.1,'continuous address interpolation must not become a quantized pitch staircase');
    assert.equal(calls[role].accel.rate,source.commonRates[role]);
  }
});
