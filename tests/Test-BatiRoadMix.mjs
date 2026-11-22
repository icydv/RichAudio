import assert from 'node:assert/strict';
import test from 'node:test';
import {batiExhaustPathGain, voiceBatiPowertrain} from '../src/acoustics/vehicle/bati-powertrain-voicing.mjs';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {VehicleAcousticPipeline} from '../src/acoustics/vehicle/pipeline.mjs';
import {distanceProbeScene} from './fixtures/vehicle-distance-probe.mjs';

test('off-axis radiation keeps more body than bark at equal distance', async () => {
  async function direct(forward) {
    const pipeline = new VehicleAcousticPipeline({scene:distanceProbeScene('authored-detail-loss-v1'),sourceIds:['tailpipe']});
    const listener = {position:[0,0,1],velocity:[0,0,0],forward:[1,0,0],up:[0,0,1]};
    const source = {...listener,id:'tailpipe',generation:1,position:[132,0,1],forward,
      roadExhaust:true,directivity:.45,valid:true,emitting:true};
    const silence = new Float32Array(512);
    let path;
    try {
      for(let i=0;i<48;i++){
        const control = await pipeline.prepare({time:i*512/48000,session:'road-direct',
          generation:1,listener,sources:[source]});
        path = control.paths[0];
        pipeline.process({tailpipe:silence},new Float32Array(512),new Float32Array(512),512);
      }
      return path;
    } finally { await pipeline.close(); }
  }
  const rear = await direct([-1,0,0]);
  const theta = 80*Math.PI/180;
  const side = await direct([-Math.cos(theta),Math.sin(theta),0]);
  assert.equal(rear.delay,side.delay);
  const ratio = side.bands.map((v,i)=>v/rear.bands[i]);
  assert(ratio[0]>.85 && ratio[0]<1);
  assert(ratio[1]<.6 && ratio[2]<ratio[1]);
});

test('a loud covered exhaust keeps late returns inside the pressure budget', () => {
  const sourceId = 'stock:slot0:exhaust';
  const paths = Array.from({length:12}, (_, i) => ({
    id:'return-'+i, sourceId, distance:4+i, order:Math.min(i,3),
    bands:i ? [.13,.08,.06] : [.24,.23,.22],
  }));
  const game = {slots:[{index:0,source:{batiExhaustDemand:1,batiVoicing:'bati-road',roadMix:true}}],
    stats:{headroomPathsOmitted:0},settings:{}};
  const renderer = {slots:[],sources:new Map([[sourceId,{pressureGain:2.5}]])};
  const admitted = StockGameplay.prototype.filter.call(game, {paths,geometry:{}},renderer).paths;
  assert.equal(admitted.length,paths.length);
  assert.equal(game.stats.headroomPathsOmitted,0);
  for (const p of admitted) assert(p.bands[0]>0 && p.bands[0]>=p.bands[1] && p.bands[1]>=p.bands[2]);
  const reserved=admitted.reduce((sum,p)=>sum+p.bands[0]*.98*2.5*.175,0);
  assert(reserved<=.95);

  // The direct path and a first-order return can arrive before the rest
  // of the wall paths. Their earlier gain must not lock out the canopy.
  let field=StockGameplay.prototype.filter.call(game,{paths:paths.slice(0,2),geometry:{}},renderer).paths;
  for(let i=0;i<6;i++) {
    renderer.slots=field.map(p=>({active:true,id:p.id,source:{pressureGain:2.5},gain:p.bands,target:p.bands}));
    field=StockGameplay.prototype.filter.call(game,{paths,geometry:{}},renderer).paths;
  }
  assert.deepEqual(field.map(p=>p.id),admitted.map(p=>p.id));
  for(let i=0;i<field.length;i++)assert(Math.abs(field[i].bands[0]-admitted[i].bands[0])<1e-8);
});

test('road and bold keep distinct, falling pressure beyond the near field', () => {
  const at = (r, mix) => batiExhaustPathGain(r, 1, mix) / r;
  for (const mix of ['bati-road', 'bati-bold']) {
    for (let r = 2; r < 150; r++) assert(at(r, mix) > at(r + 1, mix));
  }
  assert(at(132, 'bati-road') > 6 * at(132));
  assert(at(132, 'bati-bold') > 1.7 * at(132, 'bati-road'));
});

test('the road body follows existing pulses and releases to silence', () => {
  let step = 0, running = true;
  const voice = {vehicle:{model:'bati'}, renderInto(_, e, x) {
    e.fill(0);
    for (let i=0; i<x.length; i++, step++) x[i] = running ? .37*Math.sin(step*2*Math.PI*190/48000) : 0;
  }};
  voiceBatiPowertrain(voice, 'bati-road');
  const e = new Float32Array(512), x = new Float32Array(512);
  const control = {operatingPoint:.93, running:true, lift:false};
  for (let block=0; block<30; block++) voice.renderInto(control,e,x);
  assert(Math.max(...x) > .55);
  assert(Math.min(...x) < -.55);
  running = false;
  for (let block=0; block<20; block++) voice.renderInto({...control,lift:true},e,x);
  assert(x.every(sample => Math.abs(sample)<1e-8));
});

test('a small reported rev oscillation stays loaded and a sustained fall enters the lift layer', () => {
  function source() {
    return voiceBatiPowertrain({vehicle:{model:'bati'}, renderInto(control, engine, exhaust) {
      this.renderedControl = control;
      engine.fill(control.load * .32);
      exhaust.fill(control.lift ? .19 : .4);
    }}, 'bati-road');
  }
  const reference = source(), wobbling = source();
  const e = new Float32Array(512), x = new Float32Array(512);
  const e2 = new Float32Array(512), x2 = new Float32Array(512);
  for (let i=0; i<120; i++) {
    const ratio = i%10<5 ? .832 : .824;
    const control = {operatingPoint:ratio, running:true, load:.9, lift:false};
    reference.renderInto(control,e,x);
    wobbling.renderInto(i%10>=5 ? {...control,load:.05,lift:true} : control,e2,x2);
    assert.deepEqual(x2,x);
    assert.equal(wobbling.renderedControl.operatingPoint,ratio);
  }
  wobbling.renderInto({operatingPoint:.81, running:true, load:.05, lift:true},e2,x2);
  wobbling.renderInto({operatingPoint:.79, running:true, load:.05, lift:true},e2,x2);
  assert.equal(wobbling.renderedControl.lift,true);
  assert.equal(wobbling.renderedControl.load,.05);
  assert.equal(wobbling.renderedControl.operatingPoint,.79);
  wobbling.renderInto({operatingPoint:.80, running:true, load:.9, lift:false},e2,x2);
  assert.equal(wobbling.renderedControl.lift,false);
});
