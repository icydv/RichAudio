import {test} from 'node:test';import assert from 'node:assert/strict';
import {recentSelection} from '../tools/audio/recent-cycle-selection.mjs';
import {exactWavePeriods,lagComparison} from '../tools/audio/wave-recurrence.mjs';
import {prepareSources,renderResponsive} from '../tools/audio/responsive-engine.mjs';
import {eventPeriod} from '../tools/Analyse-ResponsiveEngine.mjs';
import {encodeWav} from '../src/offline-audio/stock-source.mjs';
import {hash} from '../tools/Inspect-Deceleration.mjs';
function fixture(){
  function source(step,phase){
    const grains=[];let position=1024;
    for(let f=32;f>=10;f-=step){grains.push({UnkUint1:position,UnkFloat1:f});position+=Math.round(48000/f);}
    const data=new Float64Array(position+1024);
    for(let i=0;i<grains.length-1;i++)for(let n=grains[i].UnkUint1;n<grains[i+1].UnkUint1;n++){
      const u=(n-grains[i].UnkUint1)/(grains[i+1].UnkUint1-grains[i].UnkUint1);
      data[n]=0.22*Math.sin(4*Math.PI*u+phase)+0.04*Math.sin(10*Math.PI*u+phase);
    }
    return {audio:{rate:48000,channels:1,data},grains};
  }
  return prepareSources(source(0.2,0.2),source(0.22,1.1));
}
const points=[{t:0,state:0.5},{t:5,state:0.5}],settings={duration:5,selectionMode:'recent-seeded-v1',selectionSeed:20261026};
test('The old modulo-seven walk and rounded clock reproduce a fourteen-event loop',()=>{
  let previous=37,direction=1;const rows=[{index:37,start:0,end:Math.round(48000/21)}];
  for(let k=1;k<105;k++){
    if((((Math.imul(k+1,1664525)+1013904223)>>>0)%7)===0)direction=-direction;
    if(previous+direction<36||previous+direction>38)direction=-direction;
    previous+=direction;rows.push({index:previous,start:Math.round(k*48000/21),end:Math.round((k+1)*48000/21)});
  }
  assert.equal(eventPeriod(rows),14);assert.equal(rows[14].start,32000);
});
test('Sample search detects all exact periods without any event schedule',()=>{
  const a=Float64Array.from({length:20000},(_,i)=>(i%101)/101);
  const r=exactWavePeriods(a,{trim:100,maxLag:1000,anchorLength:128});
  assert.deepEqual(r.exactPeriods.map(p=>p.lagFrames),Array.from({length:9},(_,i)=>101*(i+1)));assert.equal(r.limited,false);
});
test('Local anchor repeats are not mistaken for global waveform recurrence',()=>{
  const a=Float64Array.from({length:20000},(_,i)=>(i%101)/101);a[15000]=0.12345;
  const r=exactWavePeriods(a,{trim:100,maxLag:1000,anchorLength:128});assert.ok(r.anchorMatches>0);assert.equal(r.exactPeriods.length,0);
});
test('Identical samples reveal recurrence even when event identifiers do not',()=>{
  const rows=Array.from({length:20},(_,i)=>({index:i,start:i*101,end:(i+1)*101}));assert.equal(eventPeriod(rows),null);
  const a=Float64Array.from({length:10000},(_,i)=>i%101);assert.equal(lagComparison(a,101,100).differentSamples,0);
});
test('Degenerate inputs have a bounded explicitly incomplete search, never a false clean result',()=>{
  const r=exactWavePeriods(new Float64Array(10000),{trim:100,maxLag:1000,anchorLength:128,maxAnchors:4});assert.equal(r.limited,true);assert.equal(r.anchorMatches,4);
  for(const options of [{trim:-1},{maxLag:0},{maxLag:100000},{anchorLength:1},{maxAnchors:0}])assert.throws(()=>exactWavePeriods(new Float64Array(20000),options));
  const a=new Float64Array(20000);a[100]=NaN;assert.throws(()=>exactWavePeriods(a,{trim:100,maxLag:1000}),/nonfinite/);assert.throws(()=>lagComparison(a,0));
});
test('Explicit seeded policy is deterministic, avoids immediate reuse and never adds candidates',()=>{
  const a=recentSelection(20261026),b=recentSelection(20261026),pool=[{index:1},{index:2},{index:3}],before=JSON.stringify(pool);let previous=null;
  for(let n=0;n<105;n++){const x=a.order(pool,previous),y=b.order([...pool].reverse(),previous);assert.deepEqual(x,y);assert.notEqual(x[0].index,previous);assert.deepEqual(x.map(v=>v.index).sort(),[1,2,3]);previous=x[0].index;}
  assert.equal(JSON.stringify(pool),before);assert.equal(a.diagnostics().draws,105);
});
test('Single-candidate exhaustion remains finite; corrupt sets and invalid seeds are rejected',()=>{
  const s=recentSelection(1);for(let n=0;n<512;n++)assert.deepEqual(s.order([{index:7}],7),[{index:7}]);assert.throws(()=>s.order([{index:7}],7));
  for(const seed of [undefined,0,-1,NaN,1.5,4294967296])assert.throws(()=>recentSelection(seed));
  for(const pool of [[],[{index:1},{index:1}],[{index:-1}],Array.from({length:1025},(_,index)=>({index}))])assert.throws(()=>recentSelection(1).order(pool));
});
test('Research mode is opt-in and the reference synthetic PCM fingerprint is preserved',()=>{
  const p=fixture(),a=renderResponsive(p,points,{duration:5}),b=renderResponsive(p,points,{duration:5,selectionMode:'reference'});
  assert.equal(hash(encodeWav(a.preferred)),hash(encodeWav(b.preferred)));
  assert.equal(hash(encodeWav(a.preferred)),'01E8C78410A40BEAEBF8AEDECD1A4ACEB03A199E22D5F7ACA5AC800070A2A598');
  assert.throws(()=>renderResponsive(p,points,{duration:5,selectionSeed:1}),/explicit/);assert.throws(()=>renderResponsive(p,points,{duration:5,selectionMode:'guess'}));
  assert.throws(()=>renderResponsive(p,points,{duration:5,selectionMode:'recent-seeded-v1'}),/seed/);
});
test('Changed schedules preserve clock, requested state, pair eligibility, rates and source bounds',()=>{
  const p=fixture(),a=renderResponsive(p,points,{duration:5}),b=renderResponsive(p,points,settings),c=renderResponsive(p,points,{...settings,selectionSeed:7});
  assert.notDeepEqual(b.diagnostics.schedule.map(r=>r.index),c.diagnostics.schedule.map(r=>r.index));
  assert.notDeepEqual(a.diagnostics.schedule.map(r=>r.index),b.diagnostics.schedule.map(r=>r.index));
  for(const r of [b,c])for(let i=0;i<r.diagnostics.schedule.length;i++){
    const s=r.diagnostics.schedule[i],old=a.diagnostics.schedule[i];for(const k of ['start','end','state','value'])assert.equal(s[k],old[k]);
    assert.ok(Math.abs(s.engineState-s.value)/s.value<=0.02&&Math.abs(s.exhaustState-s.value)/s.value<=0.02);
    assert.ok([s.engineSpeed,s.exhaustSpeed].every(v=>v>=0.95&&v<=1.05));assert.ok(s.engineStart>=16&&s.engineEnd+117<p.engine.audio.data.length);
    assert.ok(s.exhaustStart>=16&&s.exhaustEnd+117<p.exhaust.audio.data.length);assert.ok(s.rawJoinMismatch<=0.25);
    if(i)assert.equal(s.start,r.diagnostics.schedule[i-1].end);
  }
});
test('Rendering is byte-deterministic and component gains, joins and separation remain unchanged',()=>{
  const p=fixture(),a=renderResponsive(p,points,settings),b=renderResponsive(p,points,settings),unity=renderResponsive(p,points,{...settings,engineScale:1});
  assert.deepEqual(encodeWav(a.preferred),encodeWav(b.preferred));assert.equal(a.engine.data.length,240000);assert.notDeepEqual(a.engine.data,a.exhaust.data);
  for(let n=0;n<a.engine.data.length;n++){
    assert.equal(a.preferred.data[n],a.engine.data[n]+a.exhaust.data[n]);assert.ok(Math.abs(a.engine.data[n]-unity.engine.data[n]*0.35)<1e-16);assert.equal(a.exhaust.data[n],unity.exhaust.data[n]);
  }
  // Independently recompute a selected join using the unchanged convex envelope.
  const s=a.diagnostics.schedule[1],prev=a.diagnostics.schedule[0],j=48,u=Math.sin(Math.PI/2*j/96)**2;
  return import('../src/offline-audio/stock-source.mjs').then(({sample})=>{
    const raw=(1-u)*sample(p.engine.audio,prev.engineEnd+j*prev.engineSpeed,0,prev.engineSpeed)+u*sample(p.engine.audio,s.engineStart+j*s.engineSpeed,0,s.engineSpeed);
    assert.ok(Math.abs(a.engine.data[s.start+j]-raw*0.2*0.35)<1e-16);
  });
});
