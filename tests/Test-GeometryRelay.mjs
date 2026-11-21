import test from 'node:test';
import assert from 'node:assert/strict';
import {GeometryRelayGate} from '../src/acoustics/streaming/geometry-relay.mjs';
import {ObservationClock} from '../src/acoustics/streaming/observed-live.mjs';
import {nativeEnvelope,liveConfiguration} from './fixtures/LiveGeometry.mjs';
function fixture(){let time=0;const applied=[],logs=[],closed=[];const gate=new GeometryRelayGate({now:()=>time,
  apply:m=>applied.push(m),log:m=>logs.push(m),unavailable:m=>closed.push(m)});
  return {gate,applied,logs,closed,tick:ms=>time=ms};}
const stage=(sequence=1,messages=[])=>({type:'geometry-relay-stage',sequence,listener:nativeEnvelope(0),messages});
test('uncommitted messages never reach the worker; a measured commit preserves source timestamps',()=>{
  const f=fixture(),config=liveConfiguration();delete config.configuration.clock.delivery;
  f.gate.receive(stage(1,[config]));assert.equal(f.applied.length,0);assert.equal(f.logs[0].type,'geometry-relay-ack');
  f.tick(4);f.gate.receive({type:'geometry-relay-commit',sequence:1,maximumMs:2});
  assert.equal(f.applied.length,1);const p=f.applied[0];assert.equal(p.listener.state.observationTicks,nativeEnvelope(0).state.observationTicks);
  assert.equal(p.at,0);assert.equal(p.elapsed,4);assert.equal(p.delivery.maximumMs,2);
  assert.equal(p.messages[0].configuration.clock.delivery.reference,'relay:1');
});
test('slow, unproven, stale, duplicate and reordered commits are rejected rather than relaxing the limit',()=>{
  for(const bound of [undefined,0,-1,NaN,10.001,100]){const f=fixture();f.gate.receive(stage());
    f.gate.receive({type:'geometry-relay-commit',sequence:1,maximumMs:bound});assert.equal(f.applied.length,0);assert.equal(f.gate.stats.rejected,1);}
  const f=fixture();f.gate.receive(stage());f.tick(251);f.gate.receive({type:'geometry-relay-commit',sequence:1,maximumMs:1});assert.equal(f.applied.length,0);
  f.gate.receive(stage(1));assert.equal(f.gate.stats.rejected,2);
});
test('disconnect cancels an in-flight commit and cannot inject configuration as a close notice',()=>{
  const f=fixture();f.gate.receive(stage());f.gate.receive({type:'geometry-relay-close',through:1,event:null});
  f.gate.receive({type:'geometry-relay-commit',sequence:1,maximumMs:1});assert.equal(f.applied.length,0);assert.equal(f.closed.length,1);
  f.gate.receive({type:'geometry-relay-close',through:2,event:liveConfiguration()});assert.equal(f.closed.length,1);
});
test('publisher clocks require current packet delivery evidence and tolerate a legitimately tighter interval',()=>{
  const c=liveConfiguration().configuration.clock;c.basis='publisher-paired-samples';c.delivery={maximumMs:5,basis:'measured-forwarding-upper-bound',reference:'relay:1'};
  const clock=new ObservationClock(c),a={...nativeEnvelope(.2),queueAgeMs:0};
  assert.throws(()=>clock.now(a),/per-message/);
  const first=clock.now({...a,delivery:{maximumMs:5,basis:'measured-forwarding-upper-bound',reference:'relay:1'}});
  const next=clock.now({...a,delivery:{maximumMs:1,basis:'measured-forwarding-upper-bound',reference:'relay:2'}});
  assert.equal(first.upper,10205);assert.equal(next.upper,10201);assert.equal(next.lower,10200);
  assert.throws(()=>clock.now({...a,queueUncertaintyMs:2,delivery:{maximumMs:1,basis:'measured-forwarding-upper-bound',reference:'relay:3'}}),/uncertainty/);
});
