// Background preparation priority only. Never an activation or acoustic lease.
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const point=x=>Array.isArray(x)&&x.length===3&&x.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000);
const initialKeys=['Schema','Kind','GameExecutableSHA256','session','sequence','generation','geometryTimeMs','sourceAgeMs','listener','sources','origin','receivedUtc'];
function earlierInitial(value,record){return value&&Object.keys(value).length===initialKeys.length&&initialKeys.every(k=>Object.hasOwn(value,k))&&value.Schema===1&&value.Kind==='RichAudioInitialWorldObservation01'&&value.GameExecutableSHA256===record.GameExecutableSHA256&&value.session===record.session&&value.origin==='normal-gameplay-observation'&&Number.isSafeInteger(value.sequence)&&value.sequence>=0&&Number.isSafeInteger(value.generation)&&value.generation>0&&Number.isFinite(value.geometryTimeMs)&&value.geometryTimeMs>=0&&Number.isFinite(value.sourceAgeMs)&&value.sourceAgeMs>=0&&value.sourceAgeMs<=500&&point(value.listener)&&Array.isArray(value.sources)&&value.sources.length<=2&&value.sources.every(point)&&typeof value.receivedUtc==='string'&&value.receivedUtc.endsWith('Z')&&Number.isFinite(Date.parse(value.receivedUtc))&&Date.parse(value.receivedUtc)<=Date.parse(record.receivedUtc);}
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
   if(record?.Schema!==1||record.Kind!=='RichAudioInitialWorldObservation01'||record.session!==session||record.GameExecutableSHA256!==gameSHA256||record.origin!=='normal-gameplay-observation'||!Number.isSafeInteger(record.sequence)||record.sequence<0||!Number.isSafeInteger(record.generation)||record.generation<1||!Number.isFinite(record.geometryTimeMs)||record.geometryTimeMs<0||!Number.isFinite(record.sourceAgeMs)||record.sourceAgeMs<0||record.sourceAgeMs>500||!Number.isFinite(received)||received>wall+250||elapsed>1000||age>500||!point(record.listener)||!Array.isArray(record.sources)||record.sources.length>2||!record.sources.every(point))return {accepted:false,reason:'invalid-or-expired-initial-observation'};
   const value={Schema:1,Kind:record.Kind,GameExecutableSHA256:gameSHA256,session,sequence:record.sequence,generation:record.generation,geometryTimeMs:record.geometryTimeMs,sourceAgeMs:age,listener:[...record.listener],sources:record.sources.map(p=>[...p]),origin:record.origin,receivedUtc:record.receivedUtc};
   localTarget(target);fs.mkdirSync(path.dirname(target),{recursive:true});
   const lockPath=target+'.lock',lock=fs.openSync(lockPath,'wx',0o600);
   try{
   // The preparation-only supervisor can have retained the initial camera pose
   // while the audio host was disabled. Preserve that earlier same-session
   // observation instead of replacing it when this consumer eventually starts.
   if(fs.existsSync(target)){const info=fs.lstatSync(target);if(info.isFile()&&info.size>0&&info.size<=8192){let prior;try{prior=JSON.parse(fs.readFileSync(target,'utf8').replace(/^\uFEFF/,''));}catch(error){if(!(error instanceof SyntaxError))throw error;}if(earlierInitial(prior,value)){accepted=true;return {accepted:true,reused:true,reason:'earlier-preparation-session-position-retained'};}}}
   const pending=target+'.pending-'+process.pid+'-'+randomUUID();
   fs.writeFileSync(pending,JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});
   if(record.sourceAgeMs+Math.abs(now()-received)>500)return {accepted:false,reason:'initial-observation-expired-before-publication'};
   fs.renameSync(pending,target);accepted=true;
   return {accepted:true,reused:false,sourceAgeMs:age,reason:'initial-session-position-retained'};
   }finally{fs.closeSync(lock);fs.unlinkSync(lockPath);}
  }catch(error){return {accepted:false,reason:'priority-write-failed: '+String(error.message).slice(0,120)};}
 }};
}
