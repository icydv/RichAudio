import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLatencyProfile} from '../src/acoustics/vehicle/latency-profile.mjs';
test('immutable baseline preserves original history delay, capacity and credits',()=>{
 assert.deepEqual(resolveLatencyProfile(),{id:'baseline',controlDelayMs:100,startupBlocks:8,producerCreditBlocks:8,ringCapacityBlocks:8});
 assert.equal(resolveLatencyProfile(null),resolveLatencyProfile('baseline'));
});
test('opt-in retains cold reserve and bounds the fixed prepared-source credit window',()=>{
 const p=resolveLatencyProfile('low-latency-01');assert.deepEqual(p,{id:'low-latency-01',controlDelayMs:75,startupBlocks:8,producerCreditBlocks:6,ringCapacityBlocks:8});
 assert.ok(Object.isFrozen(p));assert.throws(()=>{p.controlDelayMs=0;},TypeError);
});
test('unknown or malformed profile cannot silently select a new timing policy',()=>{
 for(const name of ['',false,{},[],0,'LOW-LATENCY-01','low-latency-02'])assert.throws(()=>resolveLatencyProfile(name),/Unknown immutable/);
});
