import {test} from 'node:test';
import assert from 'node:assert/strict';
import {flyby,motionAt,operatingAt,directScenes} from '../tools/vehicle-reference-03-scenario.mjs';
import {VehicleSynthesizer,createVehicleBuffers} from '../src/acoustics/vehicle/synthesizer.mjs';
import {vehicleProfiles} from '../src/acoustics/vehicle/profiles.mjs';

test('authored motion is continuous, integrated from speed, bounded and 216 km/h at pass',()=>{
  assert.equal(motionAt(flyby.passTime).position[0],0);assert.equal(motionAt(flyby.passTime).speed,60);
  for(let t=.001;t<flyby.duration-.001;t+=.007){
    const s=motionAt(t),derivative=(motionAt(t+1e-5).position[0]-motionAt(t-1e-5).position[0])/2e-5;
    assert.ok(Math.abs(derivative-s.speed)<1e-6);assert.ok(Math.abs(s.acceleration)<=10.00001);
    assert.ok(s.speed>=25&&s.speed<=60);
  }
  for(const t of [3,3.25,5.5,6.2,10]){
    assert.ok(Math.abs(motionAt(t-1e-7).speed-motionAt(t+1e-7).speed)<1e-5);
  }
});
test('engine state follows wheel/gear ratio, one upshift, a torque cut and post-pass lift without pops',()=>{
  let shifts=0,previous=3;
  for(let t=0;t<flyby.duration;t+=.01){const c=operatingAt('dynamic',t);
    assert.ok(c.estimatedRpm>=4000&&c.estimatedRpm<vehicleProfiles.hypercarV12.redlineRpm);
    assert.equal(c.speed,motionAt(t).speed);assert.equal(c.exhaustPop,false);
    if(c.gear!==previous){shifts++;previous=c.gear;}
  }
  assert.equal(shifts,1);assert.ok(operatingAt('dynamic',3.125).load<operatingAt('dynamic',2.99).load);
  assert.ok(operatingAt('dynamic',6.6).load<.06);assert.equal(operatingAt('constant',8).estimatedRpm,7644);
  const c=operatingAt('dynamic',5.5);
  assert.ok(Math.abs(c.estimatedRpm-c.speed/(2*Math.PI*.34)*60*3.4*1.6)<1e-10);
});
test('two empty bounded scenes cover the shared current emitter trajectory without invented reflections',()=>{
  const scenes=directScenes();for(const s of scenes){assert.equal(s.tile.surfaces.length,0);assert.equal(s.config.order,0);}
  for(let t=0;t<flyby.duration;t+=.01){const x=motionAt(t).position[0],scene=scenes[t<5.5?0:1];
    assert.ok(x-2>scene.tile.bounds.min[0]&&x+2<scene.tile.bounds.max[0]);}
});
test('sample-level crank and gear-oscillator phase remain continuous across the authored upshift',()=>{
  const synth=new VehicleSynthesizer(vehicleProfiles.hypercarV12,{seed:flyby.seed}),comparison=new VehicleSynthesizer(vehicleProfiles.hypercarV12,{seed:flyby.seed});
  const block=createVehicleBuffers(512);let at=0;
  for(;at/48000<3;at+=512){const c=operatingAt('dynamic',at/48000);synth.renderInto(c,block);comparison.renderInto(c,createVehicleBuffers(512));}
  const c=operatingAt('dynamic',at/48000),one=createVehicleBuffers(1);
  const originalNext=comparison.renderInto({...c,gear:3},createVehicleBuffers(1)).mixed[0];
  let first=true;
  for(let i=0;i<1024;i++){
    const before=synth.rotationPhase,gearBefore=synth.drivetrainPhase,control=operatingAt('dynamic',(at+i)/48000);
    const result=synth.renderInto(control,one);
    assert.ok(Math.abs(synth.rotationPhase-(before+synth.rpm/60/(4*48000))%1)<1e-12);
    assert.ok(Math.abs(synth.drivetrainPhase-(gearBefore+synth.rpm/60*(7+.35*control.gear)/48000)%1)<1e-12);
    if(first){assert.ok(Math.abs(result.mixed[0]-originalNext)<.0005,'no instantaneous amplitude reset at shift');first=false;}
  }
  assert.equal(synth.stats.shifts,1);assert.equal(synth.stats.pops,0);
});
