import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BatiFiringEnvelope, voiceBatiPowertrain, batiExhaustPathGain } from '../src/acoustics/vehicle/bati-powertrain-voicing.mjs';

const control=(operatingPoint,lift=false)=>({operatingPoint,lift,load:lift?.05:.9,running:true});
test('a fast blip and a real rev dip follow the observed operating input',()=>{
 const l=new BatiFiringEnvelope();
 for(const r of [.20,.62,.94,1,1,.93,.66,.79]){
  assert.equal(l.select(control(r),512),r);
  assert.equal(l.cutting,false);
 }
 for(let i=0;i<35;i++)l.select(control(1),512);
 assert(l.cuts>0);
 assert.equal(l.select(control(.87),512),.87);
 assert.equal(l.cutting,false);
 assert.equal(l.select(control(1,true),512),1);
 assert.equal(l.cutting,false);
});

test('a sustained ceiling produces a repeated firing cut and a target dip',()=>{
 const source={vehicle:{model:'bati'},renderInto(c,e,x,n){this.last=c.operatingPoint;e.fill(.3,0,n);x.fill(.58,0,n);}};
 voiceBatiPowertrain(source);
 const e=new Float32Array(512),x=new Float32Array(512),signal=[],targets=[];
 assert.equal(source.batiExhaustDemand,0);
 for(let i=0;i<184;i++){
  source.renderInto(control(1),e,x);
  signal.push(Math.abs(x[511])); targets.push(source.last);
  assert(x.every(v=>Math.abs(v)<=.98));
 }
 assert(Math.min(...signal)<.15 && Math.max(...signal)>.65);
 assert(Math.min(...targets)<.96 && Math.max(...targets)===1);
 assert(source.batiFiring.cuts>=8);
 for(let i=0;i<12;i++)source.renderInto(control(.70,true),e,x);
 assert.equal(source.last,.7);
 assert.equal(source.batiFiring.cutting,false);
});

test('idle retains its original calibrated exhaust pressure',()=>{
 const s={vehicle:{model:'bati'},renderInto(c,e,x,n){e.fill(.12,0,n);x.fill(.2,0,n);}};
 voiceBatiPowertrain(s);
 const e=new Float32Array(512),x=new Float32Array(512);
 for(let i=0;i<100;i++)s.renderInto(control(.20),e,x);
 assert(Math.abs(x[511]*batiExhaustPathGain(40,0)-.20)<1e-7);
 assert(Math.abs(e[511]-.12)<1e-7);
});

test('loaded exhaust carries farther while inverse-distance pressure still falls',()=>{
 const close=batiExhaustPathGain(7,1);
 assert.equal(close,batiExhaustPathGain(40,0));
 assert(batiExhaustPathGain(24,1)>batiExhaustPathGain(16,1));
 for(let r=7;r<45;r+=.1)assert(batiExhaustPathGain(r,1)/r>batiExhaustPathGain(r+.1,1)/(r+.1));
});
