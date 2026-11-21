import { test } from "node:test";
import assert from "node:assert/strict";
import { ListenerPlayout } from "../src/acoustics/streaming/listener-playout.mjs";
import {
  CausalSimulation,
  StreamingRenderer,
} from "../src/acoustics/streaming/causal.mjs";
import { fixture } from "../tools/acoustics-06-scenes.mjs";
import { ObservedSimulationInput } from '../src/acoustics/streaming/observed-live.mjs';
import { liveConfiguration,nativeEnvelope } from './fixtures/LiveGeometry.mjs';

const near = (actual, expected, tolerance = 1e-10) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} versus ${expected}`,
  );
function message(time, sequence, overrides = {}, lag = 0) {
  return {
    type: "listener",
    receiptAgeMs: lag * 1000,
    state: {
      version: 1,
      session: "a".repeat(32),
      generation: 1,
      sequence,
      observationTicks: 10000000 + Math.round(time * 10000000),
      clockFrequency: 10000000,
      gameTimeMs: Math.round(time * 1000),
      position: [time * 4, 0, 1],
      velocity: [4, 0, 0],
      forward: [0, 1, 0],
      up: [0, 0, 1],
      listenerKind: "synthetic",
      velocityKind: "authored-synthetic",
      paused: false,
      valid: true,
      reason: "valid",
      coordinates: "research-rh-z-up-metres-v1",
      units: "metres",
      sourceId: null,
      ...overrides,
    },
  };
}
function add(playout, time, sequence, overrides = {}, lag = 0) {
  return playout.add(
    message(time, sequence, overrides, lag),
    time + lag,
    (time + lag) * 1000,
  );
}

test("Listener playout has an explicit 100 ms control delay and unchanged 50 ms forecast ceiling", () => {
  const p = new ListenerPlayout();
  assert.equal(p.delay, 0.1);
  assert.equal(p.extrapolation, 0.05);
  const empty = p.sample(0.2, 200);
  assert.equal(empty.state, null);
  assert.equal(empty.mode, "missing");
  add(p, 0.1, 0);
  const warming = p.sample(0.15, 150);
  assert.equal(warming.state, null);
  assert.equal(warming.mode, "warming");
  const exact = p.sample(0.2, 200);
  assert.equal(exact.mode, "exact");
  near(exact.targetTime, 0.1);
  near(exact.state.position[0], 0.4);
  assert.equal(exact.playoutSeconds, 0.1);
});
test("Already received brackets reconstruct an independent linear trajectory at the retrospective timestamp", () => {
  const p = new ListenerPlayout();
  add(p, 0, 0);
  add(p, 0.05, 1);
  const result = p.sample(0.125, 125);
  assert.equal(result.mode, "interpolated");
  near(result.targetTime, 0.025);
  near(result.state.position[0], 0.1);
  assert.deepEqual(result.state.velocity, [4, 0, 0]);
  near(result.extrapolationSeconds, 0);
  assert.notEqual(
    result.state.position[0],
    0.125 * 4,
    "control latency must not become undisclosed present-time position",
  );
});
test("Orientation interpolation stays unit length and orthogonal", () => {
  const p = new ListenerPlayout();
  add(p, 0, 0);
  add(p, 0.05, 1, { forward: [1, 0, 0] });
  const state = p.sample(0.125, 125).state;
  near(state.forward[0], Math.SQRT1_2);
  near(state.forward[1], Math.SQRT1_2);
  near(Math.hypot(...state.forward), 1);
  near(Math.hypot(...state.up), 1);
  near(
    state.forward.reduce(
      (sum, value, index) => sum + value * state.up[index],
      0,
    ),
    0,
  );
});
test("No future bracket is invented and prediction stops at its existing 50 ms bound", () => {
  const p = new ListenerPlayout();
  add(p, 1, 0);
  const limited = p.sample(1.149, 1149);
  assert.equal(limited.mode, "predicted");
  near(limited.extrapolationSeconds, 0.049);
  near(limited.state.position[0], 4.196);
  const expired = p.sample(1.151, 1151);
  assert.equal(expired.state, null);
  assert.equal(expired.mode, "prediction-expired");
});
test("Receipt age and wall-clock freshness remain independent from presentation time", () => {
  const p = new ListenerPlayout();
  add(p, 1, 0, {}, 0.02);
  near(p.records[0].time, 1);
  near(p.sample(1.1, 1100).targetTime, 1);
  const stale = p.sample(1.1, 1251);
  assert.equal(stale.mode, "stale-wall-clock");
  assert.equal(stale.state, null);
  const backwards = p.sample(1.1, 1019);
  assert.equal(backwards.mode, "clock-invalid");
});
test("An old first observation cannot be relabelled fresh", () => {
  const p = new ListenerPlayout();
  p.add(message(0, 0, {}, 0.2), 0, 0);
  near(p.records[0].time, -0.2);
  const result = p.sample(0, 0);
  assert.equal(result.state, null);
  assert.equal(result.mode, "prediction-expired");
});
test("20 Hz snapshots with bounded variable delivery delay cover every 512-frame playout update after startup", () => {
  const p = new ListenerPlayout(),
    deliveries = [],
    variations = [0, 0.003, 0.017, 0.007, 0.028, 0.001, 0.019, 0.005];
  for (let sequence = 0; sequence <= 62; sequence++) {
    const time = sequence / 20,
      lag = 0.012 + variations[sequence % variations.length],
      yaw = time * 0.2;
    deliveries.push({
      sequence,
      time,
      lag,
      arrival: time + lag,
      forward: [-Math.sin(yaw), Math.cos(yaw), 0],
    });
  }
  let delivered = 0,
    checked = 0;
  for (let frame = 0; frame <= 48000 * 3; frame += 512) {
    const time = frame / 48000;
    while (
      delivered < deliveries.length &&
      deliveries[delivered].arrival <= time
    ) {
      const d = deliveries[delivered++];
      add(p, d.time, d.sequence, { forward: d.forward }, d.lag);
    }
    const result = p.sample(time, time * 1000);
    if (time < 0.11) continue;
    assert.ok(result.state, `unexpected gap at frame ${frame}: ${result.mode}`);
    assert.ok(
      ["interpolated", "exact"].includes(result.mode),
      "received brackets suffice without forecasting",
    );
    near(result.state.position[0], (time - 0.1) * 4);
    near(result.state.forward[0], -Math.sin((time - 0.1) * 0.2), 1e-6);
    assert.ok(
      p.records.every((record) => record.time <= time),
      "no future observation was supplied",
    );
    checked++;
  }
  assert.ok(checked > 250);
  assert.equal(p.stats.predicted, 0);
  assert.ok(p.stats.interpolated > 250);
});
test("A large missing observation interval is not filled with invented motion", () => {
  const p = new ListenerPlayout();
  add(p, 0, 0);
  add(p, 0.3, 1);
  const gap = p.sample(0.35, 350);
  assert.equal(gap.state, null);
  assert.equal(gap.mode, "observation-gap");
});

test("Jitter-buffered 20 Hz state remains continuous through actual causal PCM processing", () => {
  const playout = new ListenerPlayout(),
    simulation = new CausalSimulation(fixture("open-road").scene);
  const renderer = new StreamingRenderer({ sourceIds: ["beacon"] });
  const input = new Float32Array(512).fill(0.08),
    left = new Float32Array(512),
    right = new Float32Array(512);
  const source = {
    id: "beacon",
    generation: 1,
    position: [-5, 0, 1],
    velocity: [0, 0, 0],
    forward: [1, 0, 0],
    up: [0, 0, 1],
    valid: true,
  };
  const delays = [0.012, 0.015, 0.029, 0.019, 0.04, 0.013, 0.031, 0.017];
  let sequence = 0,
    checked = 0;
  for (let frame = 0; frame < 3 * 48000; frame += 512) {
    const time = frame / 48000;
    while (sequence / 20 + delays[sequence % delays.length] <= time) {
      add(
        playout,
        sequence / 20,
        sequence,
        {},
        delays[sequence % delays.length],
      );
      sequence++;
    }
    const sampled = playout.sample(time, time * 1000),
      listener = sampled.state ?? {
        position: [0, 0, 1],
        velocity: [0, 0, 0],
        forward: [0, 1, 0],
        up: [0, 0, 1],
        generation: 1,
      };
    simulation.observe({
      time,
      session: "continuity-probe",
      generation: 1,
      listener: { ...listener, valid: Boolean(sampled.state) },
      sources: [source],
    });
    renderer.accept(simulation.update(time));
    renderer.process({ beacon: input }, left, right);
    if (time < 0.4) continue;
    // Positive original DC is deliberate here: its zero-output frames cannot be natural tone zero crossings.
    for (let i = 0; i < 512; i++) {
      assert.ok(
        left[i] + right[i] > 1e-5,
        `unexpected PCM hole at ${frame + i}`,
      );
      checked++;
    }
  }
  assert.ok(checked > 120000);
  assert.equal(renderer.stats.limited, 0);
  assert.equal(renderer.stats.pathOverflow, 0);
});
test("Newest pause or invalid observation makes old playable state unavailable immediately", () => {
  for (const flags of [
    { paused: true },
    { valid: false, reason: "unavailable" },
  ]) {
    const p = new ListenerPlayout();
    add(p, 0, 0);
    add(p, 0.05, 1, flags);
    const result = p.sample(0.1, 100);
    assert.equal(result.state, null);
    assert.equal(result.mode, "invalid-or-paused");
  }
});
test("Session and generation changes clear interpolation history instead of blending identities", () => {
  for (const identity of [{ session: "b".repeat(32) }, { generation: 2 }]) {
    const p = new ListenerPlayout();
    add(p, 0, 0);
    add(p, 0.05, 1);
    add(p, 0.1, 2, { ...identity, position: [100, 0, 1] });
    assert.equal(p.records.length, 1);
    assert.equal(p.stats.resets, 2);
    assert.equal(p.sample(0.15, 150).state, null);
    near(p.sample(0.2, 200).state.position[0], 100);
  }
});
test("Position and antipodal orientation discontinuities require generation changes", () => {
  for (const change of [
    { position: [999, 0, 1] },
    { forward: [0, -1, 0] },
    { up: [0, 0, -1] },
  ]) {
    const p = new ListenerPlayout();
    add(p, 0, 0);
    assert.throws(() => add(p, 0.05, 1, change));
    assert.equal(p.records.length, 1);
    add(p, 0.05, 1, { ...change, generation: 2 });
    assert.equal(p.records.length, 1);
  }
});
test("Coordinate representation and listener identity changes cannot hide behind one generation", () => {
  for (const change of [
    { coordinates: "gta-native-unscaled", units: "native-unverified" },
    { listenerKind: "camera" },
  ]) {
    const p = new ListenerPlayout();
    add(p, 0, 0);
    assert.throws(() => add(p, 0.05, 1, change));
    assert.equal(p.stats.accepted, 1);
    add(p, 0.05, 1, { ...change, generation: 2 });
    assert.equal(p.stats.resets, 2);
  }
});
test("Mapped receipt clock reversal and host clock reversal fail before altering history", () => {
  const p = new ListenerPlayout();
  add(p, 0.1, 0);
  assert.throws(() => p.add(message(0.15, 1, {}, 0.1), 0.15, 150));
  assert.throws(() => p.add(message(0.15, 1), 0.15, 99));
  assert.equal(p.records.length, 1);
  assert.equal(p.stats.accepted, 1);
});
test("Equal mapped time permits only equivalent pose coalescing", () => {
  const p = new ListenerPlayout();
  add(p, 0.1, 0);
  p.add(message(0.15, 1, { position: [0.4, 0, 1] }, 0.05), 0.15, 150);
  assert.equal(p.records.length, 1);
  assert.equal(p.stats.coalesced, 1);
  assert.throws(() =>
    p.add(message(0.2, 2, { position: [100, 0, 1] }, 0.1), 0.2, 200),
  );
  assert.equal(p.records.length, 1);
  near(p.records[0].state.position[0], 0.4);
});
test("Retention stays bounded and malformed clocks are rejected", () => {
  const p = new ListenerPlayout();
  for (let i = 0; i < 300; i++) add(p, i / 20, i);
  assert.ok(p.records.length <= 128);
  assert.ok(p.records.at(-1).time - p.records[0].time <= 2.6);
  assert.throws(() => p.sample(NaN, 0));
  assert.throws(() => p.sample(1, -1));
  assert.throws(() => p.add(message(15, 300), Infinity, 15000));
});
test("Unavailable warmup pose to first valid distant pose does not invent a movement velocity or Doppler spike", () => {
  const simulation = new CausalSimulation(fixture("open-road").scene);
  const source = {
    id: "beacon",
    position: [-5, 0, 1],
    velocity: [0, 0, 0],
    forward: [1, 0, 0],
    up: [0, 0, 1],
    generation: 1,
    valid: true,
  };
  const listener = {
    position: [0, 0, 1],
    velocity: [0, 0, 0],
    forward: [-1, 0, 0],
    up: [0, 0, 1],
    generation: 1,
    valid: false,
  };
  simulation.observe({
    time: 0,
    session: "synthetic",
    generation: 1,
    listener,
    sources: [source],
  });
  let control;
  for (let i = 1; i <= 20; i++) {
    const time = i / 100;
    simulation.observe({
      time,
      session: "synthetic",
      generation: 1,
      listener: { ...listener, position: [20, 0, 1], valid: true },
      sources: [source],
    });
    control = simulation.update(time);
  }
  assert.ok(control.paths.length >= 1);
  for (const path of control.paths) near(path.rate, 1, 1e-9);
  const direct = control.paths.find((path) => path.order === 0);
  assert.ok(direct);
  near(direct.delay, 25 / 343, 1e-9);
});

test('Interactive position delay follows measured cadence and age without a presentation-clock jump',()=>{
  const p=new ListenerPlayout({interactive:true});let sequence=0,previousTarget=-Infinity,lowest=100;
  for(let frame=0;frame<48000*2;frame+=512){
    const time=frame/48000;
    while(sequence*.05+.008<=time){add(p,sequence*.05,sequence++,{position:[0,0,1],velocity:[0,0,0]},.008);}
    const sample=p.sample(time,time*1000);
    if(sample.state){
      assert.ok(sample.targetTime>=previousTarget-1e-9);
      previousTarget=sample.targetTime;
      assert.ok(sample.extrapolationSeconds<=.05);
      lowest=Math.min(lowest,sample.playoutSeconds*1000);
    }
  }
  near(p.delayTarget,.059,1e-9);
  assert.ok(lowest<60&&lowest>=58,'measured20Hz+8ms transport yields59ms, not a blind reduced constant');
  assert.equal(p.stats.resets,1);
});

test('Interactive quaternion reconstruction handles an accepted near-opposite turn without a zero orientation',()=>{
  const p=new ListenerPlayout({interactive:true});
  add(p,0,0,{velocity:[0,0,0],position:[0,0,1]});
  const angle=170*Math.PI/180;
  add(p,.05,1,{velocity:[0,0,0],position:[0,0,1],forward:[Math.sin(angle),Math.cos(angle),0]});
  const middle=p.sample(.125,125);
  assert.ok(middle.state);
  near(Math.hypot(...middle.state.forward),1);
  near(Math.hypot(...middle.state.up),1);
  near(dot(middle.state.forward,middle.state.up),0);
  near(middle.state.forward[0],Math.sin(angle/2));
  assert.equal(p.stats.resets,1);
});

test('Responsive presentation changes pan only and never forecasts angular motion',()=>{
  const p=new ListenerPlayout({interactive:true});
  add(p,0,0,{position:[0,0,1],velocity:[0,0,0]});
  add(p,.05,1,{position:[0,0,1],velocity:[0,0,0],forward:[1,0,0]});
  const sample=p.sample(.15,150);
  const path={id:'beacon:direct:g1',arrivalDirection:[1,0,0],pan:0,emissionFrame:3500,rate:1.03,distance:6,delay:6/343,bands:[.1,.09,.08]};
  const control={frame:7200,sourceGenerations:{beacon:1},paths:[path]};
  const before=JSON.stringify(control),result=p.presentation(control,sample,.15,150);
  assert.equal(JSON.stringify(control),before,'input controls stay immutable');
  assert.equal(result.muteBlock,false);
  assert.equal(result.diagnostic.orientationPredictionMs,0);
  assert.equal(result.diagnostic.orientationPredictionDegrees,0);
  assert.ok(result.control.paths.length===1);
  for(const key of ['emissionFrame','rate','distance','delay','bands'])assert.deepEqual(result.control.paths[0][key],path[key]);
  assert.equal(JSON.stringify(control),before);
});

test('Within-block pan uses a genuinely arrived final-sample pose and leaves retarded path physics intact',()=>{
  const p=new ListenerPlayout({interactive:true}),still={position:[0,0,1],velocity:[0,0,0]};
  for(let i=0;i<3;i++){const time=i*.05;add(p,time,i,{...still,forward:[Math.sin(time*2),Math.cos(time*2),0]});}
  const time=.125,sampled=p.sample(time,time*1000),path={id:'beacon:direct:g1',sourceId:'beacon',generation:1,
    arrivalDirection:[0,1,0],pan:0,emissionFrame:3500,rate:1.03,distance:6,delay:6/343,bands:[.1,.09,.08]};
  const result=p.presentation({frame:6000,paths:[path]},sampled,time,time*1000),trajectory=result.control.paths[0].panTrajectory;
  assert.equal(result.diagnostic.panReconstruction.qualified,true);
  assert.equal(result.diagnostic.panReconstruction.angularForecast,false);
  assert.equal(trajectory.frame,6000);assert.equal(trajectory.frames,512);
  assert.equal(trajectory.basis,'arrived-observation-brackets');
  near(trajectory.start,-Math.sin(.025*2));near(trajectory.end,-Math.sin((.025+511/48000)*2));
  for(const key of ['id','sourceId','generation','emissionFrame','rate','distance','delay','bands'])
    assert.deepEqual(result.control.paths[0][key],path[key]);
  const gapTime=.197,gap=p.presentation({frame:9456,paths:[path]},p.sample(gapTime,197),gapTime,197);
  assert.equal(gap.diagnostic.panReconstruction.qualified,true);
  assert.equal(gap.diagnostic.panReconstruction.complete,false);
  assert.equal(gap.control.paths[0].panTrajectory.frames,145);
  near(gap.control.paths[0].panTrajectory.end,-Math.sin(.2));
  near(gap.diagnostic.panReconstruction.endTargetTime,.1);
  assert.equal(gap.diagnostic.panReconstruction.unknownTailFrames,367,'unknown final samples are never forecast');
  const unknownTime=.21,unknown=p.presentation({frame:10080,paths:[path]},p.sample(unknownTime,210),unknownTime,210);
  assert.equal(unknown.diagnostic.panReconstruction.qualified,false);
  assert.equal(unknown.control.paths[0].panTrajectory,undefined);
  assert.equal(gap.diagnostic.orientationPredictionMs,0);
});

test('A known pan prefix stops before every intervening invalid, paused or gapped interval',()=>{
  for(const flags of [{valid:false,reason:'unavailable'},{paused:true}]){
    const p=new ListenerPlayout({interactive:true}),still={position:[0,0,1],velocity:[0,0,0]};
    for(const [i,time] of [.020,.026,.027,.028,.040].entries())
      add(p,time,i,{...still,forward:[Math.sin(time*2),Math.cos(time*2),0],...(i===2?flags:{})});
    const time=.125,sampled=p.sample(time,125),result=p.presentation({frame:6000,paths:[{
      arrivalDirection:[0,1,0],pan:0,emissionFrame:3500,rate:1,bands:[.1,.1,.1]}]},sampled,time,125);
    assert.equal(result.diagnostic.panReconstruction.qualified,true);
    assert.equal(result.diagnostic.panReconstruction.complete,false);
    assert.equal(result.control.paths[0].panTrajectory.frames,49);
    near(result.diagnostic.panReconstruction.endTargetTime,.026);
    assert.equal(result.diagnostic.panReconstruction.prefixStopReason,'invalid-paused-or-gapped-observation-interval');
  }
  const p=new ListenerPlayout({interactive:true}),still={position:[0,0,1],velocity:[0,0,0]};
  add(p,.020,0,still);add(p,.026,1,still);add(p,.3,2,still);
  const sampled=p.sample(.125,300),result=p.presentation({frame:6000,paths:[{
    arrivalDirection:[0,1,0],pan:0,emissionFrame:3500,rate:1,bands:[.1,.1,.1]}]},sampled,.125,300);
  assert.equal(result.control.paths[0].panTrajectory.frames,49);
  near(result.diagnostic.panReconstruction.endTargetTime,.026);
});

test('Responsive orientation stays unavailable across stale, invalid and generation boundaries',()=>{
  for(const flags of [{valid:false,reason:'unavailable'},{paused:true},{generation:2}]){
    const p=new ListenerPlayout({interactive:true});
    add(p,0,0);add(p,.05,1);const sample=p.sample(.125,125);
    add(p,.15,2,flags);
    const control={frame:7200,sourceGenerations:{beacon:1},paths:[]};
    const invalid=p.presentation(control,sample,.15,150);
    assert.equal(invalid.muteBlock,false);assert.equal(invalid.control.paths.length,0);assert.equal(invalid.diagnostic.mode,'unavailable');
  }
  const p=new ListenerPlayout({interactive:true});add(p,0,0);add(p,.05,1);const sample=p.sample(.125,125);
  assert.equal(p.presentation({frame:14880,paths:[]},sample,.31,310).diagnostic.mode,'unavailable');
  assert.throws(()=>new ListenerPlayout({interactive:true,delayMs:50}));
});

test('The interactive policy retains metric position discontinuity rejection and cannot predict stale gaps',()=>{
  const p=new ListenerPlayout({interactive:true});add(p,0,0);
  assert.throws(()=>add(p,.05,1,{position:[999,0,1]}),/position discontinuity/);
  add(p,.05,1);assert.equal(p.sample(.3,300).state,null);
});

test('Responsive native orientation uses the exact worker model rotation and never assumes native axes match solver axes',()=>{
  const p=new ListenerPlayout({interactive:true});
  const native={position:[0,0,1],velocity:[0,0,0],forward:[-1,0,0],coordinates:'gta-native-unscaled',units:'native-unverified',listenerKind:'camera'};
  add(p,0,0,native);add(p,.05,1,native);const sampled=p.sample(.125,125);
  const control={frame:6000,paths:[{pan:0,arrivalDirection:[0,1,0],emissionFrame:5000,rate:1,bands:[.1,.1,.1]}],
    geometry:{presentationAxes:[[0,1,0],[-1,0,0],[0,0,1]],presentationScale:1,mappedListener:{position:[0,0,1]}}};
  const result=p.presentation(control,sampled,.125,125);
  near(result.control.paths[0].pan,0);
  assert.equal(result.diagnostic.nativeToModelRotation,true);
  const missing=p.presentation({...control,geometry:{}},sampled,.125,125);
  assert.equal(missing.control.paths.length,0);assert.equal(missing.diagnostic.mode,'unavailable');
  const malformed=p.presentation({...control,geometry:{presentationAxes:[[1,0,0],[1,0,0],[0,0,1]]}},sampled,.125,125);
  assert.equal(malformed.control.paths.length,0);
});

test('Interactive sample times retain original QPC intervals rather than reanchoring to quantized credit arrivals',()=>{
  const p=new ListenerPlayout({interactive:true});
  for(let sequence=0;sequence<10;sequence++){
    const observed=sequence*.05,arrival=Math.ceil(observed*48000/512)*512/48000;
    p.add(message(observed,sequence),arrival,arrival*1000);
  }
  for(let i=1;i<p.records.length;i++)near(p.records[i].time-p.records[i-1].time,.05);
  assert.notEqual(p.records[1].time,p.records[1].receiptMappedTime);
  near(p.records.at(-1).state.observationTicks,10000000+Math.round(.45*10000000));
});

test('A cold render-clock phase settles once from warm stationary receipts without rewriting QPC cadence or freshness',()=>{
  const p=new ListenerPlayout({interactive:true}),still={position:[3,1,7],velocity:[0,0,0]};
  p.add(message(0,0,still,.012),.012,12);
  const jitter=[-.004,.002,.004,-.002,0,0,.04,0];
  for(let sequence=1;sequence<=15;sequence++){
    const time=sequence*.05,offset=-.024+jitter[(sequence-8+80)%8];
    p.add(message(time,sequence,still,.012),time+.012+offset,(time+.012)*1000);
    if(sequence===14)assert.equal(p.clockStartup.status,'warming');
  }
  assert.equal(p.clockStartup.status,'calibrated');near(p.clockStartup.shiftMs,-24);
  assert.equal(p.clockStartup.samples,8);assert.equal(p.stats.startupClockCalibrations,1);
  for(let i=0;i<p.records.length;i++){
    const r=p.records[i];near(r.time,i*.05-.024);
    assert.equal(r.state.observationTicks,10000000+Math.round(i*.05*10000000));
    near(r.hostMs,(i*.05+.012)*1000);near(r.receiptAgeMs,12);
    if(i)near(r.time-p.records[i-1].time,.05);
  }
  const anchor=p.observationAnchor.time;
  // A later scheduler phase change cannot reanchor an already calibrated clock.
  p.add(message(.8,16,still,.012),.8+.012-.07,812);
  near(p.observationAnchor.time,anchor);near(p.records.at(-1).time,.8-.024);
  assert.equal(p.stats.startupClockCalibrations,1);
  assert.equal(p.sample(1.05,1051).mode,'stale-wall-clock');
  const sampled=p.sample(.85,850),shown=p.presentation({frame:40800,paths:[]},sampled,.85,850);
  assert.equal(shown.diagnostic.observationClockStartup.status,'calibrated');
  near(shown.diagnostic.observationClockStartup.shiftMs,-24);
});

test('Startup phase never moves an identity which has moved, rotated, paused or become invalid',()=>{
  const still={position:[3,1,7],velocity:[0,0,0]};
  for(const change of [{position:[3.001,1,7]},{forward:[.01,Math.sqrt(1-.01**2),0]},
    {velocity:[.001,0,0]},{paused:true},{valid:false,reason:'unavailable'}]){
    const p=new ListenerPlayout({interactive:true});p.add(message(0,0,still,.012),.012,12);
    for(let sequence=1;sequence<=20;sequence++){
      const time=sequence*.05;
      p.add(message(time,sequence,{...still,...(sequence===2?change:{})},.012),time+.012-.024,(time+.012)*1000);
    }
    near(p.observationAnchor.time,0);assert.equal(p.stats.startupClockCalibrations,0);
    assert.equal(p.clockStartup.status,'skipped');assert.equal(p.stats.startupClockSkipped,1);
    for(let i=1;i<p.records.length;i++)near(p.records[i].time-p.records[i-1].time,.05);
  }
});

test('Startup phase bounds reject a large offset and calibration resets only with declared identity',()=>{
  const p=new ListenerPlayout({interactive:true}),still={position:[3,1,7],velocity:[0,0,0]};
  for(let sequence=0;sequence<=15;sequence++){
    const time=sequence*.05;
    p.add(message(time,sequence,still,.15),time+.15-(sequence?.12:0),(time+.15)*1000);
  }
  assert.equal(p.clockStartup.status,'skipped');assert.equal(p.clockStartup.reason,'startup-phase-offset-exceeds-bound');
  near(p.observationAnchor.time,0);assert.equal(p.stats.startupClockCalibrations,0);
  p.add(message(.8,16,{...still,generation:2},.012),.812,1000);
  assert.equal(p.clockStartup.status,'warming');assert.equal(p.clockStartup.samples,0);
  near(p.observationAnchor.time,.8);assert.equal(p.stats.resets,2);
});

test('Adaptive delay never changes a moving95–100m/s listener into a false over-budget trajectory',()=>{
  for(const speed of [95,99,100]){
    const p=new ListenerPlayout({interactive:true}),simulation=new CausalSimulation(fixture('open-road').scene);let sequence=0,checked=0;
    const source={id:'beacon',position:[-5,0,1],velocity:[0,0,0],forward:[1,0,0],up:[0,0,1],generation:1};
    for(let frame=0;frame<48000;frame+=512){
      const time=frame/48000;
      while(sequence*.05+.008<=time){const t=sequence*.05;add(p,t,sequence++,{position:[t*speed,0,1],velocity:[speed,0,0]},.008);}
      const sampled=p.sample(time,time*1000);if(!sampled.state)continue;
      simulation.observe({time,session:'fast-valid-listener',generation:1,listener:sampled.state,sources:[source]});checked++;
    }
    assert.ok(checked>70);near(p.delay,.1);assert.ok(p.stats.delayFrozenDuringMotion>0);
    assert.equal(simulation.stats.resets,1);
  }
});

test('Presentation reconstructs coherent latest listener position and orientation around an already retarded source',()=>{
  const p=new ListenerPlayout({interactive:true}),state={velocity:[0,0,0],coordinates:'gta-native-unscaled',units:'native-unverified',listenerKind:'camera'};
  add(p,0,0,{...state,position:[1,0,0],forward:[-1,0,0]});
  add(p,.05,1,{...state,position:[0,1,0],forward:[0,-1,0]});
  const sampled=p.sample(.125,125),buffered=[.5,.5,0];
  const path={arrivalOrigin:[0,0,0],arrivalDirection:[-Math.SQRT1_2,-Math.SQRT1_2,0],distance:Math.SQRT1_2,
    pan:0,emissionFrame:5000,rate:1,bands:[.1,.1,.1]};
  const result=p.presentation({frame:6000,paths:[path],geometry:{presentationAxes:[[1,0,0],[0,1,0],[0,0,1]],presentationScale:1,mappedListener:{position:buffered}}},sampled,.125,125);
  // Unbracketed orientation holds its observed direction. Use a stationary
  // pose to isolate coherent endpoint projection independently.
  const held=new ListenerPlayout({interactive:true});
  add(held,0,0,{...state,position:[0,1,0],forward:[0,-1,0]});add(held,.05,1,{...state,position:[0,1,0],forward:[0,-1,0]});
  const coherent=held.presentation({frame:6000,paths:[path],geometry:{presentationAxes:[[1,0,0],[0,1,0],[0,0,1]],presentationScale:1,mappedListener:{position:[0,1,0]}}},held.sample(.125,125),.125,125);
  near(coherent.control.paths[0].pan,0);
  assert.equal(coherent.control.paths[0].emissionFrame,path.emissionFrame);
  assert.deepEqual(coherent.control.paths[0].bands,path.bands);
  assert.ok(result.control.paths.length===1);
});

function dot(a,b){return a.reduce((n,x,i)=>n+x*b[i],0);}

test('Real causal PCM reconstructs a continuous20Hz camera turn with materially lower directional error',()=>{
  function run(interactive){
    const p=new ListenerPlayout({interactive}),simulation=new CausalSimulation(fixture('open-road').scene),renderer=new StreamingRenderer({sourceIds:['beacon'],continuousRates:interactive});
    const dry=new Float32Array(512),left=new Float32Array(512),right=new Float32Array(512);
    let sequence=0,sum=0,count=0,maxBoundaryResidual=0,previousDelta=0,previousValue=0;
    const source={id:'beacon',generation:1,position:[-5,0,1],velocity:[0,0,0],forward:[1,0,0],up:[0,0,1],valid:true};
    for(let frame=0;frame<48000*3;frame+=512){
      const time=frame/48000;
      while(sequence*.05+.008<=time){const t=sequence*.05,yaw=Math.max(0,t-.8)*2;add(p,t,sequence++,{position:[0,0,1],velocity:[0,0,0],forward:[-Math.sin(yaw),Math.cos(yaw),0]},.008);}
      const sampled=p.sample(time,time*1000),s=sampled.state??{position:[0,0,1],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],generation:1};
      simulation.observe({time,session:'smooth-camera',generation:1,listener:{...s,valid:!!sampled.state},sources:[source]});
      let control=simulation.update(time);
      if(interactive)control=p.presentation(control,sampled,time,time*1000).control;
      renderer.accept(control);
      for(let j=0;j<512;j++)dry[j]=.08*Math.sin(2*Math.PI*600*(frame+j)/48000);
      renderer.process({beacon:dry},left,right);
      if(time>1.2){const slot=renderer.slots.find(s=>s.active&&s.id.includes(':direct:'));
        assert.ok(slot);const expected=-Math.cos(Math.max(0,time+512/48000-.8)*2);sum+=(slot.pan-expected)**2;count++;
        const boundaryDelta=left[0]-previousValue;maxBoundaryResidual=Math.max(maxBoundaryResidual,Math.abs(boundaryDelta-previousDelta));
      }
      previousValue=left[511];previousDelta=left[511]-left[510];
      for(let j=0;j<512;j++)assert.ok(Number.isFinite(left[j])&&Number.isFinite(right[j]));
    }
    assert.equal(renderer.stats.limited,0);assert.equal(renderer.stats.cursorResets,0);
    assert.equal(renderer.stats.missingHistory,0);
    return {rmse:Math.sqrt(sum/count),maxBoundaryResidual,renderer};
  }
  const before=run(false),after=run(true);
  assert.ok(after.rmse<before.rmse*.75,`${after.rmse} versus ${before.rmse}`);
  assert.ok(after.rmse<.12,`${after.rmse}`);
  assert.ok(after.maxBoundaryResidual<.0002,`${after.maxBoundaryResidual}`);
});

test('Actual quaternion/prefix PCM cannot carry a late-observation residual past a rapid turn endpoint',()=>{
  const p=new ListenerPlayout({interactive:true}),simulation=new CausalSimulation(fixture('open-road').scene),
    renderer=new StreamingRenderer({sourceIds:['beacon'],continuousRates:true,historyDiagnostics:true});
  simulation.setProcessingSettings({pathBudget:1,maxReflectors:1,earlyReflections:false});
  const source={id:'beacon',position:[-5,0,1],velocity:[0,0,0],forward:[1,0,0],up:[0,0,1],generation:1,nearFieldRadius:10},
    dry=new Float32Array(512),left=new Float32Array(512),right=new Float32Array(512),lags=[.012,.065,.022,.045];
  let sequence=0,minimumPan=Infinity,lastPan=0,measured=0;
  for(let frame=0;frame<48000*2;frame+=512){
    const time=frame/48000;
    while(sequence*.05+lags[sequence%lags.length]<=time){
      const observed=sequence*.05,angle=Math.max(0,Math.min(1,(observed-.9)/.15))*Math.PI;
      p.add(message(observed,sequence++,{position:[0,0,1],velocity:[0,0,0],
        forward:[-Math.cos(angle),-Math.sin(angle),0]},time-observed),time,time*1000);
    }
    const sampled=p.sample(time,time*1000),state=sampled.state??{position:[0,0,1],velocity:[0,0,0],
      forward:[-1,0,0],up:[0,0,1],generation:1};
    simulation.observe({time,session:'nonmonotonic-prefix-pan',generation:1,
      listener:{...state,valid:Boolean(sampled.state)},sources:[source]});
    renderer.accept(p.presentation(simulation.update(time),sampled,time,time*1000).control);
    for(let j=0;j<512;j++)dry[j]=.1*Math.sin(2*Math.PI*600*(frame+j)/48000);
    renderer.process({beacon:dry},left,right);
    for(let j=0;j<512;j++){
      const power=left[j]**2+right[j]**2;
      if(time>.9&&power>1e-10){const pan=(right[j]**2-left[j]**2)/power;
        minimumPan=Math.min(minimumPan,pan);lastPan=pan;measured++;}
    }
  }
  assert.ok(measured>30000);assert.ok(renderer.stats.panPartialBlocks>0);
  assert.ok(renderer.stats.maximumPanResidual>.05,'exercise substantial late-observation residual, not just steady interpolation');
  assert.ok(renderer.stats.panResidualBoundFrames>0);
  assert.ok(minimumPan>=-1e-6,`no uncommanded opposite-side PCM${minimumPan}`);near(lastPan,0,1e-5);
  assert.ok(renderer.stats.maximumPanStep<.001);
  assert.equal(renderer.stats.cursorResets,0);assert.equal(renderer.stats.missingHistory,0);
  assert.equal(renderer.historyDiagnostics.future,0);assert.equal(renderer.historyDiagnostics.affectedFrames,0);
  assert.equal(renderer.stats.limited,0);
});

test('Retarded-time rate changes evolve sample by sample without cursor or source-history resets',()=>{
  const renderer=new StreamingRenderer({sourceIds:['beacon'],continuousRates:true}),dry=new Float32Array(512).fill(.08),left=new Float32Array(512),right=new Float32Array(512);
  let emission=0;
  for(let block=0;block<100;block++){
    const target=block<50?1:block<60?1.15:block<70?.85:1;
    const paths=block<4?[]:[{id:'beacon:direct:g1',sourceId:'beacon',generation:1,emissionFrame:emission-1024,rate:target,bands:[.1,.1,.1],pan:.2}];
    renderer.accept({frame:renderer.frame,sourceGenerations:{beacon:1},paths});
    renderer.process({beacon:dry},left,right);emission+=target*512;
  }
  assert.equal(renderer.stats.cursorResets,0);assert.equal(renderer.stats.missingHistory,0);
  assert.ok(renderer.stats.maximumRateStep<.001,`${renderer.stats.maximumRateStep}`);
  const slot=renderer.slots.find(s=>s.active);assert.ok(slot.rate>.999&&slot.rate<1.001);
});

test('Near-zero and coincident valid paths prime using the current dry tap that process writes before reading',()=>{
  for(const distance of [0,.001,.003]){
    const simulation=new CausalSimulation(fixture('open-road').scene),renderer=new StreamingRenderer({sourceIds:['beacon'],continuousRates:true});
    const dry=new Float32Array(512).fill(.08),left=new Float32Array(512),right=new Float32Array(512);
    const source={id:'beacon',generation:1,position:[-5,0,1],velocity:[0,0,0],forward:[1,0,0],up:[0,0,1],valid:true,nearFieldRadius:6};
    let ready=false,energy=0;
    for(let block=0;block<20;block++){
      const time=renderer.frame/48000;
      simulation.observe({time,session:'near-source',generation:1,listener:{...source,id:undefined,position:[-5+distance,0,1]},sources:[source]});
      const control=simulation.update(time);renderer.accept(control);ready ||= renderer.historyReady(control);
      renderer.process({beacon:dry},left,right);
      energy+=left.reduce((n,x)=>n+x*x,0)+right.reduce((n,x)=>n+x*x,0);
    }
    assert.equal(ready,true,`distance${distance}`);assert.ok(energy>0);
    assert.equal(renderer.stats.missingHistory,0);assert.equal(renderer.stats.cursorResets,0);
    assert.equal(renderer.historyReady({paths:[{sourceId:'beacon',generation:2,emissionFrame:renderer.frame}]}),false,'pending tap must retain matching generation');
    assert.equal(renderer.historyReady({paths:[{sourceId:'beacon',generation:1,emissionFrame:renderer.frame+.1}]}),false,'no future dry tap can be promised');
  }
});

test('Actual conditional geometry and interactive presentation render coincident and fractional-sample near-field paths safely',()=>{
  for(const distance of [0,1e-9,.001]){
    const simulation=new CausalSimulation(null,{allowMissingScene:true}),input=new ObservedSimulationInput(simulation,['beacon-0']);
    const p=new ListenerPlayout({interactive:true}),renderer=new StreamingRenderer({sourceIds:['beacon-0'],continuousRates:true,generationReleaseGuard:true});
    const c=liveConfiguration().configuration;c.sources[0].nearFieldRadius=6;
    const configuration={type:'listener-context-config',configuration:{contextEpoch:1,listenerSession:c.listenerSession,
      minimumListenerGeneration:1,build:c.build,coordinates:c.coordinates,region:c.region,sources:c.sources,engine:c.engine,
      directPath:{mode:'listener-only-conditional-direct',sourceId:'beacon-0',rights:'original-generated',visibilityAssumption:'unobserved-space-assumed-clear'}}};
    const position=[...c.sources[0].positionNative];position[0]+=distance/c.coordinates.metresPerNativeUnit;
    const dry=new Float32Array(512).fill(.08),left=new Float32Array(512),right=new Float32Array(512);let ready=false,energy=0;
    for(let block=0;block<30;block++){
      const now=renderer.frame/48000,envelope=nativeEnvelope(now,block,{position}),anchor={...envelope,queueAgeMs:0,
        delivery:{maximumMs:0,basis:'controlled-fixture',reference:'deterministic-near-field-presentation'}};
      p.add(envelope,now,now*1000);const sampled=p.sample(now,now*1000),s=sampled.state??envelope.state;
      input.consume(block===0?[configuration]:[],anchor,now);
      let control=input.update({session:s.session,generation:s.generation,listener:{...s,valid:!!sampled.state},paused:false,emitting:true},anchor,now);
      control=p.presentation(control,sampled,now,now*1000).control;renderer.accept(control);ready ||= renderer.historyReady(control);
      renderer.process({'beacon-0':dry},left,right);
      for(let j=0;j<512;j++){assert.ok(Number.isFinite(left[j])&&Number.isFinite(right[j]));energy+=left[j]**2+right[j]**2;}
      if(control.paths.length)near(control.paths[0].pan,0);
    }
    assert.equal(ready,true,`distance${distance}`);assert.ok(energy>0);
    assert.equal(renderer.stats.missingHistory,0);assert.equal(renderer.stats.cursorResets,0);
  }
});

test('A replacement reflection uses amplitude-complementary crossfade instead of a coherent attack/release bump',()=>{
  function render(continuousRates){
    const renderer=new StreamingRenderer({sourceIds:['beacon'],continuousRates}),dry=new Float32Array(512).fill(.08),left=new Float32Array(512),right=new Float32Array(512);
    let baseline=0,transition=0;
    for(let block=0;block<55;block++){
      const frame=renderer.frame,paths=block<4?[]:[{id:`beacon:r:wall:g1:geometry${block<25?1:2}`,sourceId:'beacon',generation:1,
        emissionFrame:frame-1024,rate:1,bands:[.1,.1,.1],pan:0}];
      renderer.accept({frame,sourceGenerations:{beacon:1},paths});renderer.process({beacon:dry},left,right);
      for(let i=0;i<512;i++){
        if(block>=20&&block<25)baseline=Math.max(baseline,left[i]);
        if(block>=25&&block<30)transition=Math.max(transition,left[i]);
      }
    }
    assert.equal(renderer.stats.missingHistory,0);assert.equal(renderer.stats.cursorResets,0);
    return transition/baseline;
  }
  const before=render(false),after=render(true);
  assert.ok(before>1.15&&before<1.16,`demonstrated old coherent peak${before}`);
  assert.ok(after<=1.000001,`corrected amplitude-complementary peak${after}`);
});

test('A moving replacement target cannot change PCM abruptly in the middle of its crossfade',()=>{
  const renderer=new StreamingRenderer({sourceIds:['beacon'],continuousRates:true}),dry=new Float32Array(512).fill(.08),left=new Float32Array(512),right=new Float32Array(512);
  let previous=0,transitionStep=0;
  for(let block=0;block<35;block++){
    const frame=renderer.frame,gain=block===26?.2:.1,paths=block<4?[]:[{id:`beacon:r:wall:g1:geometry${block<25?1:2}`,sourceId:'beacon',generation:1,
      emissionFrame:frame-1024,rate:1,bands:[gain,gain,gain],pan:0}];
    renderer.accept({frame,sourceGenerations:{beacon:1},paths});renderer.process({beacon:dry},left,right);
    if(block>=25&&block<=28)transitionStep=Math.max(transitionStep,Math.abs(left[0]-previous));
    previous=left[511];
  }
  assert.ok(transitionStep<.0001,`${transitionStep}`);
  assert.ok(renderer.stats.maximumGainStep<.001);
});

test('A listener crossing the source never reads future PCM while approach and recession Doppler remain correct',()=>{
  const simulation=new CausalSimulation(fixture('open-road').scene),renderer=new StreamingRenderer({sourceIds:['beacon'],continuousRates:true,historyDiagnostics:true});
  simulation.setProcessingSettings({pathBudget:1,maxReflectors:1,earlyReflections:false});
  const source={id:'beacon',position:[-5,0,1],velocity:[0,0,0],forward:[1,0,0],up:[0,0,1],generation:1,nearFieldRadius:10};
  const dry=new Float32Array(512),left=new Float32Array(512),right=new Float32Array(512),mono=[];
  for(let frame=0;frame<48000;frame+=512){
    const time=frame/48000;
    simulation.observe({time,session:'coincident-pass',generation:1,listener:{position:[-7+time*4,0,1],velocity:[4,0,0],forward:[0,1,0],up:[0,0,1],generation:1},sources:[source]});
    renderer.accept(simulation.update(time));
    for(let j=0;j<512;j++)dry[j]=.44*(Math.sin(2*Math.PI*600*(frame+j)/48000)+.35*Math.sin(2*Math.PI*1200*(frame+j)/48000)+.15*Math.sin(2*Math.PI*1800*(frame+j)/48000))/1.5;
    renderer.process({beacon:dry},left,right);
    for(let j=0;j<512;j++){assert.ok(Number.isFinite(left[j])&&Number.isFinite(right[j]));mono.push(left[j]+right[j]);}
  }
  assert.ok(renderer.stats.causalRateBoundFrames>0);
  assert.equal(renderer.historyDiagnostics.future,0);assert.equal(renderer.historyDiagnostics.affectedFrames,0);
  assert.equal(renderer.stats.missingHistory,0);assert.equal(renderer.stats.cursorResets,0);assert.equal(renderer.stats.limited,0);
  function frequency(start,end){const crossings=[];for(let i=Math.floor(start*48000)+1;i<end*48000;i++){
    if(mono[i-1]<=0&&mono[i]>0)crossings.push(i-1-mono[i-1]/(mono[i]-mono[i-1]));
  }return (crossings.length-1)*48000/(crossings.at(-1)-crossings[0]);}
  near(frequency(.3,.4),600*(343+4)/343,.2);
  near(frequency(.75,.85),600*(343-4)/343,.2);
});
