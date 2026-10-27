// Independent interpretation of bounded original/supervised evidence. No native calls.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {privateStoragePath} from '../../src/acoustics/research/research-private-storage.mjs';
const fail=message=>{throw Error(message);},finite=x=>Number.isFinite(x),phases=['BASELINE','SUPPRESSION_ACTIVE','RESTORING'];
const phase=t=>t<45000?phases[0]:t<90000?phases[1]:t<135000?phases[2]:'COMPLETE';
const vector=p=>p&&['X','Y','Z'].every(k=>finite(p[k])&&Math.abs(p[k])<=200000),dot=(a,b)=>a.X*b.X+a.Y*b.Y+a.Z*b.Z,sub=(a,b)=>({X:a.X-b.X,Y:a.Y-b.Y,Z:a.Z-b.Z});
export function validateCalibration(e){
 if(!e||e.Version!==1||!['runtime-observation','original-synthetic-fixture'].includes(e.Domain)||!finite(e.BeginMs)||!finite(e.FinishedMs)||!Array.isArray(e.Samples)||e.Samples.length>800||!Array.isArray(e.Receipts)||e.Receipts.length>20000)fail('bounded evidence schema');
 const a=e.Area;if(!a||!vector(a.Anchor)||!vector(a.Forward)||!vector(a.Right)||Math.abs(dot(a.Forward,a.Forward)-1)>1e-6||Math.abs(dot(a.Right,a.Right)-1)>1e-6||Math.abs(dot(a.Forward,a.Right))>1e-6||a.Forward.Z!==0||a.Right.Z!==0)fail('area');
 const summaries=Object.fromEntries(phases.map(p=>[p,{samples:0,unique:new Set(),entries:0,newlyObserved:new Set(),newAmbientMoving:new Set(),existingAtSuppression:new Set(),emergency:new Set(),stationary:new Set(),populationTypes:{},readErrors:0,first:null,last:null,coveragePartial:false}]));
 let previousTime=-1,gaps=0,previousIDs=new Set(),priorPhase=null;const seen=new Map();
 for(const s of e.Samples){
  const t=s.AtMs-e.BeginMs,p=phase(t);if(!finite(s.AtMs)||t<0||t>=135000||s.AtMs<=previousTime||s.Phase!==p||!summaries[p]||!Array.isArray(s.Vehicles)||s.Vehicles.length>64||!vector(s.Listener)||!vector(s.CameraRotation)||!Number.isInteger(s.Enumerated)||s.Enumerated<0||s.Enumerated>4096||!Number.isInteger(s.ReadErrors)||s.ReadErrors<0||s.ReadErrors>4096||!finite(s.ObservationCostMs)||s.ObservationCostMs<0||s.ObservationCostMs>1000)fail('sample/clock');
  if(Math.sqrt(dot(sub(s.Listener,a.Anchor),sub(s.Listener,a.Anchor)))>.25)fail('listener drift');
  if(!['PARTIAL','VALID'].includes(s.Coverage)||e.Domain==='runtime-observation'&&s.Coverage==='VALID')fail('unsupported runtime coverage promotion');
  if(previousTime>=0&&s.AtMs-previousTime>400)gaps++;previousTime=s.AtMs;const q=summaries[p],ids=new Set(),handles=new Set();q.samples++;q.first??=t;q.last=t;q.coveragePartial||=s.Coverage!=='VALID';q.readErrors+=s.ReadErrors;
  for(const v of s.Vehicles){if(!v||typeof v.Identity!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(v.Identity)||ids.has(v.Identity)||!vector(v.Position)||!vector(v.Velocity)||!Number.isInteger(v.VehicleClass)||v.VehicleClass<0||v.VehicleClass>22||!Number.isInteger(v.PopulationType)||v.PopulationType<0||v.PopulationType>32||!Number.isInteger(v.Handle)||v.Handle<=0||!Number.isInteger(v.PoolCounter)||v.PoolCounter<0||v.PoolCounter>255)fail('vehicle reading');
   if(handles.has(v.Handle)||!Number.isInteger(v.Model)||v.Model<0||v.Model>4294967295||v.Handle>4294967295||Math.sqrt(dot(v.Velocity,v.Velocity))>200)fail('handle/model/velocity');handles.add(v.Handle);
   const d=sub(v.Position,a.Anchor),f=dot(d,a.Forward),r=dot(d,a.Right);if(f<12||f>42||r<0||r>12||Math.abs(d.Z)>3)fail('outside area');ids.add(v.Identity);q.unique.add(v.Identity);
   if(priorPhase===p&&!previousIDs.has(v.Identity))q.entries++;if(!seen.has(v.Identity)){q.newlyObserved.add(v.Identity);if(v.PopulationType>=1&&v.PopulationType<=5&&v.VehicleClass<=13&&Math.sqrt(dot(v.Velocity,v.Velocity))>.25)q.newAmbientMoving.add(v.Identity);}else if(p===phases[1]&&seen.get(v.Identity)<45000)q.existingAtSuppression.add(v.Identity);
   if(v.VehicleClass===18)q.emergency.add(v.Identity);if(Math.sqrt(dot(v.Velocity,v.Velocity))<.25)q.stationary.add(v.Identity);q.populationTypes[v.PopulationType]=(q.populationTypes[v.PopulationType]??0)+1;
  }
  for(const id of ids)if(!seen.has(id))seen.set(id,t);previousIDs=ids;priorPhase=p;
 }
 let receiptTime=-1,frame=-1,calls=0,partial=0,maxReceiptGapMs=0,observedFrameGaps=0;for(const r of e.Receipts){const t=r.AtMs-e.BeginMs;if(!finite(r.AtMs)||t<45000||t>=90000||r.AtMs<receiptTime||!Number.isSafeInteger(r.Frame)||r.Frame<=frame||!['1:0','3:1','7:3','7:7'].includes(r.AttemptMask+':'+r.SuccessMask))fail('control receipt outside phase/order/mask');if(receiptTime>=0){maxReceiptGapMs=Math.max(maxReceiptGapMs,r.AtMs-receiptTime);observedFrameGaps+=r.Frame-frame-1;}receiptTime=r.AtMs;frame=r.Frame;calls+=[1,2,4].filter(bit=>r.SuccessMask&bit).length;if(r.SuccessMask!==7&&r.SuccessMask!==0)partial++;}
 if(calls!==e.ControlCalls||partial!==e.PartialControlFrames||e.ControlFrames!==e.Receipts.filter(r=>r.SuccessMask===7).length||e.LastControlFrame!==(e.Receipts.filter(r=>r.SuccessMask!==0).at(-1)?.Frame??-1))fail('receipt counter mismatch');
 const windowsComplete=e.State==='COMPLETE'&&e.FinishedMs-e.BeginMs>=135000&&phases.every((p,i)=>{const s=summaries[p];return s.samples>=200&&s.first-i*45000<=400&&(i+1)*45000-s.last<=400;});
 if(!Number.isSafeInteger(e.ObservationGaps)||e.ObservationGaps!==gaps||!Number.isSafeInteger(e.MissedControlFrames)||e.MissedControlFrames<observedFrameGaps)fail('gap counter mismatch');
 const baseline=summaries.BASELINE,supp=summaries.SUPPRESSION_ACTIVE,rest=summaries.RESTORING,meaningful=baseline.entries>=3&&baseline.newAmbientMoving.size>=3;
 const controlsClean=e.ControlCalls>0&&e.PartialControlFrames===0&&e.MissedControlFrames===0&&maxReceiptGapMs<=1000&&e.Receipts.every(r=>r.SuccessMask===7)&&e.Receipts[0].AtMs-e.BeginMs-45000<=100&&90000-(e.Receipts.at(-1).AtMs-e.BeginMs)<=100;
 const coverageComplete=phases.every(p=>!summaries[p].coveragePartial&&summaries[p].readErrors===0)&&gaps===0;
 const returning=rest.newAmbientMoving.size>0&&rest.entries>0;
 let verdict='INCONCLUSIVE',reason='insufficient-baseline-or-observation';
 if(!windowsComplete||!controlsClean){verdict='PARTIAL';reason='incomplete-windows-or-control-evidence';}
 else if(meaningful&&supp.newlyObserved.size>0){verdict='PARTIAL';reason='remaining-first-observed-traffic-cannot-certify-isolation';}
 else if(meaningful&&coverageComplete&&returning){verdict=e.Domain==='runtime-observation'?'PARTIAL':'PASS_SYNTHETIC_ONLY';reason='bounded-observation-consistent-with-suppression-not-city-proof';}
 else if(meaningful){verdict='PARTIAL';reason=!coverageComplete?'coverage-partial-no-road-clear-proof':'traffic-return-not-observed';}
 const summary=Object.fromEntries(phases.map(p=>{const q=summaries[p];return [p,{samples:q.samples,uniqueVehicles:q.unique.size,entriesAfterInitialSnapshot:q.entries,firstObservedIDs:q.newlyObserved.size,firstObservedAmbientMovingIDs:q.newAmbientMoving.size,previouslyObservedIDsPresentDuringSuppression:q.existingAtSuppression.size,emergencyClassIDs:q.emergency.size,stationaryIDs:q.stationary.size,populationTypeObservations:q.populationTypes,readErrors:q.readErrors,firstRelativeMs:q.first,lastRelativeMs:q.last,coverage:q.coveragePartial?'PARTIAL':'VALID_SYNTHETIC_ONLY'}];}));
 return {version:1,verdict,reason,phases:summary,meaningfulBaseline:meaningful,windowsComplete,controlsClean,maxReceiptGapMs,requestsAfterSuppression:0,observationGaps:gaps,reportedObservationGaps:e.ObservationGaps,trafficReturn:returning?'newly_observed_traffic_returned_not_proof_of_creation':'NOT_OBSERVED_INCONCLUSIVE',coverage:coverageComplete?'VALID_SYNTHETIC_ONLY':'PARTIAL',entireRouteClear:false,cityWideEffectiveness:'UNVERIFIED',newGeneration:'UNAVAILABLE-first-observation-is-not-creation',restoration:'request-ledger-checked-traffic-observation-separate',sourceDomain:e.Domain};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),file=privateStoragePath(root,process.argv[2]??''),s=fs.lstatSync(file);if(!s.isFile()||s.size>16777216)fail('private evidence file bound');const data=JSON.parse(fs.readFileSync(file,'utf8'),(k,v)=>{if(['__proto__','prototype','constructor'].includes(k))fail('unsafe key');return v;});console.log(JSON.stringify(validateCalibration(data),null,2));}catch(e){console.error(e.message);process.exitCode=2;}
}
