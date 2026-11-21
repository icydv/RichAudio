import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {validateCalibration} from '../tools/traffic/validate-calibration.mjs';
const root=process.argv[2],read=name=>JSON.parse(fs.readFileSync(path.join(root,name+'.json'),'utf8'));let checks=0;
const e=read('pool-complete'),result=validateCalibration(e);
for(const [actual,expected]of [[result.version,2],[result.verdict,'PARTIAL'],[result.entireRouteClear,false],[result.cityWideEffectiveness,'UNVERIFIED'],[result.windowsComplete,true],[result.controlsClean,true],[result.meaningfulBaseline,true],[result.phases.BASELINE.enumeratedPoolCounts.mean,80],[result.phases.SUPPRESSION_ACTIVE.enumeratedPoolCounts.mean,10],[result.phases.RESTORING.enumeratedPoolCounts.mean,80],[result.phases.BASELINE.omittedReadingOccurrences,225*48],[result.phases.SUPPRESSION_ACTIVE.omittedReadingOccurrences,0]]){assert.equal(actual,expected);checks++;}
assert(!('entriesAfterInitialSnapshot'in result.phases.BASELINE));checks++;
assert.match(result.trafficReturn,/UNVERIFIED/);checks++;assert.match(result.membershipChanges,/not-proven/);checks++;
assert.equal(fs.readFileSync(path.join(root,'pool-complete.json'),'utf8'),fs.readFileSync(path.join(root,'pool-repeat.json'),'utf8'));checks++;
for(const mutate of [x=>x.Version=1,x=>x.Version=3,x=>x.Area.Provenance='measured-player-pose-local-corridor-v1',x=>x.Samples[0].Coverage='VALID',x=>x.Samples[0].PoolEligible++,x=>x.Samples[0].PoolOmitted--,x=>x.Samples[0].Enumerated--,x=>x.Samples[0].Vehicles.pop(),x=>x.Samples[0].Vehicles[0].PoolCounter++,x=>x.Samples[0].Vehicles[0].Identity='old-label',x=>x.Samples[0].Vehicles[0].Position.X=200001,x=>x.Samples[0].Vehicles.push(x.Samples[0].Vehicles[0]),x=>x.Samples[0].Listener.X=1,x=>x.Receipts[0].AtMs=0,x=>x.Samples[0].Vehicles.reverse()]){const copy=structuredClone(e);mutate(copy);assert.throws(()=>validateCalibration(copy));checks++;}
const empty=read('pool-stopped');assert.equal(validateCalibration(empty).verdict,'PARTIAL');checks++;
const original=JSON.stringify(e);assert.deepEqual(validateCalibration(e),validateCalibration(e));assert.equal(JSON.stringify(e),original);checks+=2;
console.log('PASS: '+checks+' independent versioned pool evidence checks; no road/traffic effectiveness claim.');
