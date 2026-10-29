import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createVehicleProfile, vehicleProfiles, vehicleLayerNames} from '../src/acoustics/vehicle/profiles.mjs';
import {VehicleSynthesizer,createVehicleBuffers,firingFrequency,vehiclePartialWeight,mechanicalRadiationWeight} from '../src/acoustics/vehicle/synthesizer.mjs';
const FS=48000, rms=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);
const peak=a=>a.reduce((m,x)=>Math.max(m,Math.abs(x)),0);
function power(a,hz) {let re=0,im=0;for(let i=0;i<a.length;i++){const x=a[i]*(.5-.5*Math.cos(2*Math.PI*i/(a.length-1))),phase=2*Math.PI*hz*i/FS;re+=x*Math.cos(phase);im+=x*Math.sin(phase);}return re*re+im*im;}
function steady(profile,control,seconds=3) {const s=new VehicleSynthesizer(profile);let result;for(let i=0;i<seconds;i++)result=s.render(control,FS);return {s,result};}
function fftPower(input) {
  const n=input.length,re=Float64Array.from(input,(v,i)=>v*(.5-.5*Math.cos(2*Math.PI*i/(n-1)))),im=new Float64Array(n);
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){const x=re[i];re[i]=re[j];re[j]=x;}}
  for(let width=2;width<=n;width*=2){const angle=-2*Math.PI/width;for(let i=0;i<n;i+=width)for(let j=0;j<width/2;j++){const k=i+j,l=k+width/2,c=Math.cos(angle*j),s=Math.sin(angle*j),r=re[l]*c-im[l]*s,q=re[l]*s+im[l]*c;re[l]=re[k]-r;im[l]=im[k]-q;re[k]+=r;im[k]+=q;}}
  return Float64Array.from(re.slice(0,n/2),(x,i)=>x*x+im[i]*im[i]);
}
test('Profiles are immutable original estimates with independent emitter layouts and bounded gain',()=>{
  for(const p of Object.values(vehicleProfiles)) {
    assert.equal(p.provenance.basis,'original-design-estimates');assert.ok(Object.isFrozen(p.components.exhaust));
    assert.equal(p.firingPattern.length,p.cylinders);assert.deepEqual(Object.keys(p.components),vehicleLayerNames);
    assert.ok(p.components.exhaust.axis[1]<0);assert.ok(p.components.intake.axis[1]>0);
    assert.throws(()=>createVehicleProfile({...p,components:{...p.components,exhaust:{...p.components.exhaust,gain:5}}}));
  }
  assert.notEqual(vehicleProfiles.hypercarV12.redlineRpm,vehicleProfiles.roadV8.redlineRpm);
});
test('Combustion frequency follows independently predicted cylinder/stroke/crank relationships',()=>{
  for(const cylinders of [1,2,4,8,10,12,16])for(const strokes of [2,4])for(const rpm of [1200,3600,9000])
    assert.equal(firingFrequency({cylinders,strokes},rpm),rpm/60*cylinders/(strokes/2));
});
for(const rpm of [3000,6000])test(`V12 actual exhaust PCM contains firing order and several harmonics at ${rpm} RPM`,()=>{
  const {result}=steady({...vehicleProfiles.hypercarV12,texture:0},{estimatedRpm:rpm,load:1,throttle:1,gear:3});
  const f=rpm/60*6,a=result.layers.exhaust;
  assert.ok(Math.abs(result.diagnostics.estimatedRpm-rpm)<.001);
  for(let h=1;h<=5;h++)assert.ok(power(a,f*h)>power(a,f*h+11)*1e5,`order ${h}`);
  assert.ok(power(a,2*f)>power(a,f)*.15,'higher harmonic is material');
});
test('Configured uneven firing angles alter the actual waveform while preserving cycle frequency',()=>{
  const base=vehicleProfiles.roadV8,uneven={...base,firingPattern:base.firingPattern.map((e,i)=>({...e,angleDegrees:e.angleDegrees+(i%2?20:0)}))};
  const a=steady(base,{rpm:3000,load:.8}).result.layers.exhaust,b=steady(uneven,{rpm:3000,load:.8}).result.layers.exhaust;
  let difference=0;for(let i=0;i<a.length;i++)difference+=(a[i]-b[i])**2;
  assert.ok(Math.sqrt(difference/a.length)>rms(a)*.15);
});
test('Two-stroke single-cylinder configuration supports half orders without cycle-wrap clicks',()=>{
  const p={...vehicleProfiles.roadV8,id:'original-single-two-stroke',strokes:2,cylinders:1,
    firingPattern:[{cylinder:1,angleDegrees:0,weight:1}],mechanicalOrders:[{order:.5,amplitude:1,phase:0}],texture:0};
  const {result}=steady(p,{rpm:3000,load:1});
  assert.ok(power(result.layers.exhaust,50)>power(result.layers.exhaust,61)*1e5);
  assert.ok(power(result.layers.mechanical,25)>power(result.layers.mechanical,50)*1e6);
  let step=0;for(let i=1;i<FS;i++)step=Math.max(step,Math.abs(result.layers.mechanical[i]-result.layers.mechanical[i-1]));
  assert.ok(step<.001,'half-order continuity survives every firing cycle');
});
test('Independent components include broadband texture, rolling/aero and profile-gated induction',()=>{
  const c={rpm:4200,load:.85,throttle:.85,speed:45,gear:3};
  const a=steady(vehicleProfiles.hypercarV12,c).result,b=steady(vehicleProfiles.roadV8,c).result;
  for(const name of ['mechanical','exhaust','intake','drivetrain','tyres','aero'])assert.ok(rms(a.layers[name])>1e-4,name);
  assert.equal(rms(a.layers.induction),0);assert.ok(rms(b.layers.induction)>.001);
  assert.equal(rms(a.layers.transients),0);
  const toneOnly=steady({...vehicleProfiles.hypercarV12,texture:0},c).result;
  const noise=Float32Array.from(a.layers.exhaust,(v,i)=>v-toneOnly.layers.exhaust[i]);
  assert.ok(rms(noise)>.0003);assert.ok(power(noise,1573)>0);
  assert.ok(power(a.layers.exhaust,420)>power(a.layers.exhaust,280)*10);
  assert.ok(power(b.layers.exhaust,280)>power(b.layers.exhaust,420)*10);
});
test('Constant controls are sample-identical across block partitions and reusable output buffers',()=>{
  const c={rpm:6100,load:.9,throttle:.92,speed:50,gear:4},a=new VehicleSynthesizer(),b=new VehicleSynthesizer();
  const whole=a.render(c,4096),parts=createVehicleBuffers(256),joined=createVehicleBuffers(4096);
  for(let i=0;i<16;i++){b.renderInto(c,parts);joined.mixed.set(parts.mixed,i*256);for(const n of vehicleLayerNames)joined.layers[n].set(parts.layers[n],i*256);}
  assert.deepEqual(joined.mixed,whole.mixed);for(const n of vehicleLayerNames)assert.deepEqual(joined.layers[n],whole.layers[n]);
});
test('RPM/load step and upshift retain phase and have bounded smooth state transitions',()=>{
  const s=new VehicleSynthesizer(),before=s.render({rpm:8500,load:1,throttle:1,gear:2},FS),phase=s.cyclePhase;
  const after=s.render({rpm:5400,load:.1,throttle:.1,gear:3},512);
  assert.equal(s.stats.shifts,1);assert.notEqual(after.diagnostics.cyclePhase,0);assert.notEqual(after.diagnostics.cyclePhase,phase);
  assert.ok(after.diagnostics.estimatedRpm>5400);assert.ok(after.diagnostics.estimatedRpm<before.diagnostics.estimatedRpm);
  assert.ok(after.diagnostics.maximumRpmStep<2);assert.ok(after.diagnostics.maximumLoadStep<.001);
  assert.ok(Math.abs(after.mixed[0]-before.mixed.at(-1))<.1);
  s.render({rpm:5400,load:.1,throttle:.1,gear:3},512);assert.equal(s.stats.shifts,1);
});
test('Ordinary lifts/shifts never produce pops; explicit eligible event is bounded and edge-triggered',()=>{
  const s=new VehicleSynthesizer();s.render({rpm:6000,load:1,throttle:1,gear:3},FS);
  let r=s.render({rpm:5000,load:0,throttle:0,gear:4,overrun:true},512);
  assert.equal(rms(r.layers.transients),0);assert.equal(s.stats.pops,0);
  r=s.render({rpm:5000,load:0,throttle:0,gear:4,overrun:true,exhaustPop:true},4096);
  assert.equal(s.stats.pops,1);assert.ok(rms(r.layers.transients)>.001);assert.ok(peak(r.layers.transients)<.07);
  s.render({rpm:5000,load:0,throttle:0,gear:4,overrun:true,exhaustPop:true},4096);assert.equal(s.stats.pops,1);
  const cold=new VehicleSynthesizer();cold.render({rpm:6000,load:0,throttle:0,overrun:true,exhaustPop:true},512);
  assert.equal(cold.stats.pops,0);assert.equal(cold.stats.rejectedPops,1);
});
test('Engine stop fades engine layers while independently moving tyres and air continue',()=>{
  const s=new VehicleSynthesizer();s.render({rpm:6000,load:1,speed:70,gear:3},FS);
  s.render({engineRunning:false,rpm:0,load:0,speed:70,gear:0},FS);
  const r=s.render({engineRunning:false,rpm:0,load:0,speed:70,gear:0},FS);
  assert.ok(rms(r.layers.mechanical)<1e-20);assert.ok(rms(r.layers.tyres)>.001);assert.ok(rms(r.layers.aero)>.001);
});
test('High-RPM additive output excludes upper aliases, with a smooth spectral guard',()=>{
  assert.equal(vehiclePartialWeight(9600),1);assert.equal(vehiclePartialWeight(11520),0);
  assert.ok(vehiclePartialWeight(10560)>.49&&vehiclePartialWeight(10560)<.51);
  const base=vehicleProfiles.hypercarV12,p={...base,id:'alias-stress-two-stroke',cylinders:16,strokes:2,redlineRpm:16000,texture:0,
    firingPattern:Array.from({length:16},(_,i)=>({cylinder:i+1,angleDegrees:i*22.5,weight:1}))};
  const {result}=steady(p,{rpm:15000,load:1,throttle:1}); // fundamental 4000 Hz; naive harmonics alias at 8/12/16/20 kHz.
  const spectrum=fftPower(result.layers.exhaust.slice(0,32768));
  let total=0,upper=0;for(let i=0;i<spectrum.length;i++){total+=spectrum[i];if(i*FS/32768>=12500)upper+=spectrum[i];}
  assert.ok(upper/total<1e-8,`energy above guard ${upper/total}`);
  assert.ok(power(result.layers.exhaust,4000)>power(result.layers.exhaust,20000)*1e9);
});
test('Noncommensurate omitted combustion partials do not fold into false audible engine orders',()=>{
  const p={...vehicleProfiles.hypercarV12,id:'alias-noncommensurate-stress',cylinders:16,strokes:2,redlineRpm:16000,texture:0,
    firingPattern:Array.from({length:16},(_,i)=>({cylinder:i+1,angleDegrees:i*22.5,weight:1}))};
  const rpm=14273,f=rpm/60*16,{result}=steady(p,{rpm,load:1,throttle:1});
  const a=result.layers.exhaust,reference=power(a,f);
  for(let h=4;h<=14;h++) {
    const alias=Math.abs(((h*f+FS/2)%FS)-FS/2);
    // Unlike the 4 kHz case, these folds do not coincide with retained orders.
    assert.ok(power(a,alias)/reference<1e-8,`omitted partial ${h}, folded frequency ${alias}`);
  }
});
test('Entering limiter and changing gear cannot cause an instantaneous phase or amplitude reset',()=>{
  const a=new VehicleSynthesizer(),b=new VehicleSynthesizer(),c={rpm:8000,load:1,throttle:1,gear:3,speed:60};
  a.render(c,FS);b.render(c,FS);
  const continued=a.render(c,512),changed=b.render({...c,rpm:11000,load:0,throttle:0,gear:4},512);
  assert.ok(Math.abs(continued.mixed[0]-changed.mixed[0])<.001);
  assert.ok(changed.diagnostics.maximumRpmStep<2);
  assert.equal(changed.diagnostics.shifts,1);assert.ok(changed.diagnostics.limitedFrames>0);
});
test('All operating extremes remain finite and below full scale without a limiter or normalization',()=>{
  for(const p of Object.values(vehicleProfiles)) {
    const s=new VehicleSynthesizer(p);let frames=0;
    for(const c of [{rpm:p.idleRpm,load:0,speed:0},{rpm:p.redlineRpm*1.2,load:1,speed:100,gear:5,roadSurface:'gravel'},
      {rpm:4000,load:0,throttle:0,speed:95,gear:4,overrun:true,exhaustPop:true},{rpm:0,load:0,speed:0,engineRunning:false}]) {
      const r=s.render(c,FS);frames+=FS;assert.equal(r.diagnostics.frames,frames);
      for(const a of [...Object.values(r.layers),r.mixed]) {assert.ok(a.every(Number.isFinite));assert.ok(peak(a)<.85);}
    }
    assert.ok(s.stats.limitedFrames>0);
  }
});
test('Invalid control and buffer bounds fail before advancing source state',()=>{
  const s=new VehicleSynthesizer();
  for(const c of [{rpm:NaN},{rpm:-1},{load:2},{speed:-1},{gear:.5},{engineRunning:'yes'},{roadSurface:'guessed'}])assert.throws(()=>s.render(c,512));
  assert.equal(s.frame,0);assert.throws(()=>s.render({},48001));assert.throws(()=>s.renderInto({},{}));
  assert.throws(()=>new VehicleSynthesizer(vehicleProfiles.hypercarV12,{sampleRate:44100}));
  assert.throws(()=>createVehicleProfile({...vehicleProfiles.hypercarV12,mechanicalOrders:[{order:.77,amplitude:1,phase:0}]}));
});
test('Zero mechanical normalization and unsupported vertical emitter axes are rejected at construction',()=>{
  const p=vehicleProfiles.hypercarV12;
  assert.throws(()=>new VehicleSynthesizer({...p,mechanicalOrders:p.mechanicalOrders.map(o=>({...o,amplitude:0}))}),/mechanical orders/);
  for(const axis of [[0,0,1],[0,Math.sqrt(.5),Math.sqrt(.5)]])
    assert.throws(()=>createVehicleProfile({...p,components:{...p.components,intake:{...p.components.intake,axis}}}),/vehicle component/);
  // Muting a component is explicit and safe; zero normalization is unnecessary.
  const silentMechanical={...p,components:{...p.components,mechanical:{...p.components.mechanical,gain:0}}};
  const r=new VehicleSynthesizer(silentMechanical).render({rpm:5000,load:.8},512);
  assert.equal(peak(r.layers.mechanical),0);assert.ok(r.mixed.every(Number.isFinite));
});
test('Mechanical radiation attenuates subsonic crank vibration while preserving the idle firing family',()=>{
  const p=vehicleProfiles.hypercarV12,{result}=steady(p,{rpm:p.idleRpm,load:.12,throttle:.12});
  assert.equal(mechanicalRadiationWeight(0,50),0);
  assert.ok(Math.abs(mechanicalRadiationWeight(50,50)-Math.SQRT1_2)<1e-12);
  for(const hz of [5,10,17.5,35,50,105,210,1000,10000])assert.ok(mechanicalRadiationWeight(hz,50)>=0&&mechanicalRadiationWeight(hz,50)<=1);
  const subsonic=power(result.layers.mechanical,17.5)+power(result.layers.mechanical,8.75);
  const firing=power(result.layers.mechanical,105)+power(result.layers.mechanical,210);
  assert.ok(firing>subsonic*10,`firing/subsonic mechanical power ratio ${firing/subsonic}`);
  assert.ok(power(result.mixed,105)>power(result.mixed,17.5)*10,'combined idle signal retains the firing identity');
  const first=mechanicalRadiationWeight(17.5,50),sixth=mechanicalRadiationWeight(105,50);
  assert.ok(first<.13&&sixth>.97,'low crank order is attenuated without suppressing the firing order');
  assert.throws(()=>createVehicleProfile({...p,mechanicalRadiationHz:0}));
});
