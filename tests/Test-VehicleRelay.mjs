import {test} from 'node:test';import assert from 'node:assert/strict';
import {VehicleRelayGate} from '../src/acoustics/vehicle/relay.mjs';
const stage=(sequence=0,age=10)=>({type:'vehicle-relay-stage',sequence,vehicle:{type:'vehicle',receiptAgeMs:age,state:{sequence,position:[1,2,3]}}});
test('vehicle forwarding needs measured commit and retains immutable original age',()=>{
  let now=100;const output=[],events=[],g=new VehicleRelayGate({now:()=>now,log:x=>events.push(x),apply:x=>output.push(x)});
  const m=stage();g.receive(m);m.vehicle.state.position[0]=99;assert.equal(output.length,0);
  now=104;g.receive({type:'vehicle-relay-commit',sequence:0,maximumMs:6});
  assert.equal(output[0].receiptAgeMs,20);assert.equal(output[0].state.position[0],1);assert.equal(g.stats.committed,1);
  g.receive({type:'vehicle-relay-commit',sequence:0,maximumMs:6});assert.equal(g.stats.rejected,1);assert.equal(output.length,1);
});
test('stale, oversized, reordered and unmeasured vehicle deliveries never enter synthesis',()=>{
  let now=0,accepted=0;const g=new VehicleRelayGate({now:()=>now,log:()=>{},apply:()=>accepted++});
  g.receive(stage(0,245));now=4;g.receive({type:'vehicle-relay-commit',sequence:0,maximumMs:2});
  g.receive(stage(1));g.receive({type:'vehicle-relay-commit',sequence:1,maximumMs:11});
  g.receive(stage(1));g.receive({...stage(2),extra:'x'.repeat(8200)});
  g.receive(stage(3));g.receive({type:'vehicle-relay-drop',sequence:3});g.receive({type:'vehicle-relay-commit',sequence:3,maximumMs:1});
  assert.equal(accepted,0);assert.equal(g.stats.rejected,5);
});
