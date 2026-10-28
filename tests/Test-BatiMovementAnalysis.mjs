import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {analyseMovement} from '../tools/benchmark/movement-analysis.mjs';
import {inspect,requirePrivate} from '../tools/Inspect-BatiMovement.mjs';
const p=x=>({X:x,Y:0,Z:0});
function fixture() {
  const raw=[0,1,2,2,2,2].map((x,i)=>({At:i*.5,Position:p(x),Velocity:p(i===1?4:0),Speed:i===1?4:0,GameTimeMs:i*500,
    TaskState:i?'InProgress':'NoTask',Gear:i<2?0:1,ConsoleOpen:false,GamePaused:false,Mounted:true,EngineOn:true,Collision:false,Interference:'UNKNOWN'}));
  return {raw,route:{Points:[0,300,600,900,1200].map(p)},footer:{Run:{Samples:raw.map(r=>({Observation:structuredClone(r),RouteProgress:r.Position.X})),
    Settings:{WaypointLookahead:25,FinishRadius:2,StallSeconds:5,StationarySpeed:.25,StationaryHoldSeconds:1,MaxGapSeconds:.6},
    Driving:{FirstTaskRequestedAt:0,LastProgressAt:1},Lifecycle:['AI checkpoint task requested; full throttle NOT PROVEN']}}};
}
function edit(f,i,field,value){f.raw[i][field]=value;f.footer.Run.Samples[i].Observation[field]=structuredClone(value);}
test('known position integral, timing, target and stationary evidence are independently recovered',()=>{
  const {summary:s,pairs}=analyseMovement(fixture());
  assert.equal(s.movement.path,2);assert.equal(s.movement.integratedSpeedDistance,2);assert.equal(s.movement.peakSpeed,4);
  assert.equal(s.movement.firstDisplacementAndSpeedAt,.5);assert.equal(s.movement.stationarySuffixBeginsAt,1);assert.equal(s.movement.stationarySuffixConfirmedAt,2);
  assert.equal(s.movement.acceleration.maximum,8);assert.equal(s.movement.acceleration.minimum,-8);
  assert.equal(s.route.startToMid1,300);assert.equal(s.route.finalDistanceToMid1,298);assert.equal(s.route.enteredLookahead,false);
  assert.equal(pairs[0].positionSpeed,2);assert.equal(s.consistency.maximumSpeedMagnitudeError,0);
});
test('missing evidence is rejected rather than reconstructed from scalar summaries',()=>{
  for(const modify of [f=>delete f.raw,f=>delete f.footer.Run.Samples,f=>delete f.route,f=>delete f.footer.Run.Driving]){const f=fixture();modify(f);assert.throws(()=>analyseMovement(f));}
});
test('velocity-only spike is reported as inconsistent with displacement, not proven acceleration',()=>{
  const f=fixture();edit(f,1,'Speed',40);edit(f,1,'Velocity',p(40));const s=analyseMovement(f).summary;
  assert.equal(s.movement.path,2);assert.equal(s.movement.integratedSpeedDistance,20);assert.equal(s.movement.acceleration.maximum,80);
  assert.ok(s.movement.vectorResidual.maximum>=9);
});
test('magnitude mismatch and position jump remain separately measurable',()=>{
  const f=fixture();edit(f,1,'Velocity',{X:3,Y:4,Z:0});edit(f,1,'Speed',4);assert.equal(analyseMovement(f).summary.consistency.maximumSpeedMagnitudeError,1);
  edit(f,1,'Position',p(100));const s=analyseMovement(f).summary;assert.equal(s.movement.path,198);assert.equal(s.route.maximumRecordedProgressError,99);
});
test('nonmonotonic, duplicate, nonfinite and mismatching accepted observations fail',()=>{
  for(const mutate of [f=>edit(f,1,'At',0),f=>edit(f,1,'Speed',NaN),f=>edit(f,1,'Position',null),f=>f.footer.Run.Samples[1].Observation.Speed=99]){
    const f=fixture();mutate(f);assert.throws(()=>analyseMovement(f));
  }
});
test('missing clocks stay unknown and cannot be treated as advancing',()=>{
  const f=fixture();for(let i=0;i<f.raw.length;i++)edit(f,i,'GameTimeMs',null);
  const s=analyseMovement(f).summary;assert.equal(s.consistency.missingGameClockPairs,5);assert.equal(s.consistency.gameDeltaMs,null);
});
test('gap, resumed motion and position drift prevent false sustained stationary confirmation',()=>{
  for(const change of [f=>{f.footer.Run.Settings.MaxGapSeconds=.1;},f=>{edit(f,5,'Speed',1);edit(f,5,'Velocity',p(1));},f=>edit(f,5,'Position',p(2.01))]){
    const f=fixture();change(f);assert.equal(analyseMovement(f).summary.movement.stationarySuffixConfirmedAt,null);
  }
});
test('transitions are recorded at actual sample times without task-identity inference',()=>{
  const s=analyseMovement(fixture()).summary;assert.deepEqual(s.transitions.filter(x=>x.field==='Gear'),[{at:1,field:'Gear',before:0,after:1}]);
  assert.equal(s.counted.TaskState.InProgress,5);assert.match(s.limits,/not physical freeze/);
});
test('output is deterministic and excludes source locations and identities',()=>{
  const f=fixture();const a=analyseMovement(f),b=analyseMovement(f);assert.deepEqual(a,b);
  assert.ok(!JSON.stringify(a).includes('"Position"'));assert.ok(!JSON.stringify(a).includes('"Handle"'));
});
test('private CLI verifies fingerprints, refuses overwrite and detects changed source bytes',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'richaudio-analysis-'));try{
    const local=path.join(root,'.local');fs.mkdirSync(local);const evidence=path.join(local,'evidence');fs.mkdirSync(evidence);
    const f=fixture(), files={'attempt.used':'synthetic-only','samples.jsonl':f.raw.map(x=>JSON.stringify(x)).join('\n')+'\n','final.json':JSON.stringify(f.footer),'session.json':JSON.stringify(f.route)};
    const receipts=Object.entries(files).map(([Name,data])=>{fs.writeFileSync(path.join(evidence,Name),data);return {Name,Bytes:Buffer.byteLength(data),SHA256:createHash('sha256').update(data).digest('hex')};});
    const manifest=path.join(local,'fingerprints.json');fs.writeFileSync(manifest,JSON.stringify(receipts));
    const out=path.join(local,'output');assert.equal(inspect(evidence,manifest,out).movement.path,2);assert.throws(()=>inspect(evidence,manifest,out),/fresh/);
    fs.appendFileSync(path.join(evidence,'samples.jsonl'),' ');assert.throws(()=>inspect(evidence,manifest,path.join(local,'other')),/fingerprint/);
    assert.ok(!fs.existsSync(path.join(local,'other')));assert.throws(()=>requirePrivate(root),/ignored/);
    const link=path.join(local,'linked');try{fs.symlinkSync(evidence,link,process.platform==='win32'?'junction':'dir');assert.throws(()=>requirePrivate(path.join(link,'samples.jsonl')),/linked/);}catch(e){if(e.code!=='EPERM')throw e;}
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
