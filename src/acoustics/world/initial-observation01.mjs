// Background preparation priority only. Never an activation or acoustic lease.
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const point=x=>Array.isArray(x)&&x.length===3&&x.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e9);
function localTarget(file){
 if(typeof file!=='string'||!path.isAbsolute(file)||path.basename(file)!=='initial-observation01.json')throw Error('Bound initial-observation path required');
 const target=path.resolve(file);for(let at=target;at;at=path.dirname(at)){if(fs.existsSync(at)&&fs.lstatSync(at).isSymbolicLink())throw Error('Linked priority output refused');if(path.dirname(at)===at)break;}return target;
}
export function createInitialWorldObservationWriter01({outputPath,session,gameSHA256,now=Date.now}={}){
 if(!/^[a-f0-9]{32}$/.test(session)||!hex(gameSHA256)||typeof now!=='function')throw Error('Bound priority writer identity required');
 const target=localTarget(outputPath);let accepted=false;
 return {write(record){
  if(accepted)return {accepted:true,reused:true,reason:'initial-session-position-already-retained'};
  try{
   const wall=now(),received=Date.parse(record?.receivedUtc),elapsed=Math.abs(wall-received),age=record?.sourceAgeMs+elapsed;
   if(record?.Schema!==1||record.Kind!=='RichAudioInitialWorldObservation01'||record.session!==session||record.GameExecutableSHA256!==gameSHA256||record.origin!=='normal-gameplay-observation'||!Number.isSafeInteger(record.sequence)||record.sequence<1||!Number.isSafeInteger(record.generation)||record.generation<1||!Number.isFinite(record.geometryTimeMs)||record.geometryTimeMs<0||!Number.isFinite(record.sourceAgeMs)||record.sourceAgeMs<0||record.sourceAgeMs>500||!Number.isFinite(received)||received>wall+250||elapsed>1000||age>500||!point(record.listener)||!Array.isArray(record.sources)||record.sources.length>2||!record.sources.every(point))return {accepted:false,reason:'invalid-or-expired-initial-observation'};
   const value={Schema:1,Kind:record.Kind,GameExecutableSHA256:gameSHA256,session,sequence:record.sequence,generation:record.generation,geometryTimeMs:record.geometryTimeMs,sourceAgeMs:age,listener:[...record.listener],sources:record.sources.map(p=>[...p]),origin:record.origin,receivedUtc:record.receivedUtc};
   localTarget(target);fs.mkdirSync(path.dirname(target),{recursive:true});const pending=target+'.pending-'+process.pid+'-'+randomUUID();
   fs.writeFileSync(pending,JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});fs.renameSync(pending,target);accepted=true;
   return {accepted:true,reused:false,sourceAgeMs:age,reason:'initial-session-position-retained'};
  }catch(error){return {accepted:false,reason:'priority-write-failed: '+String(error.message).slice(0,120)};}
 }};
}
