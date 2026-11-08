import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const utc=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3,7}Z$/.test(value)?Date.parse(value):NaN;
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const maximumQualificationMs01=25*60_000;

// An independently hashed retained publication can predate the normal bridge
// launch. Authenticate the two timestamps separately. A live pose still has
// its original validity and the service still requires current proof per row.
export function normalQualification01(config,root,session,{now=Date.now}={}){
 const proof=config.retainedQualification01;
 if(proof===undefined)return null;
 const world=config.acousticWorld,started=utc(proof?.proofEpochUtc),until=utc(proof?.stopByUtc),at=now();
 if(config.outputSink!=='environment-observation'||config.demoProfile!=null||config.latencyProfile!=='street-01'||
    !/^[a-f0-9]{32}$/.test(session)||!world||world.privateCacheRoot!==undefined||world.initialObservationPath!==undefined||
    !hex(proof?.manifestSha256)||!hex(proof?.catalogSha256)||!Number.isFinite(started)||!Number.isFinite(until)||
    at<started||at>=until||until-started>maximumQualificationMs01||
    ![world.manifestPath,world.catalogPath].every(x=>typeof x==='string'&&/^world\/[\w.-]+\.json$/.test(x)))
  throw Error('current immutable normal qualification required');
 const verifyBinding=(relative,sha,maximum,read=false)=>{
  const file=path.join(root,relative);
  const matches=config.bindings?.filter(b=>b.file===relative&&b.sha256===sha);
  if(matches?.length!==1||fs.realpathSync.native(file).toLowerCase()!==file.toLowerCase()||fs.statSync(file).size>maximum)
   throw Error('retained qualification path binding');
  // Host and supervisor hash the complete pinned catalogue before startup.
  // Inspect the manifest header once here; the worker verifies the catalogue
  // binding and revalidates per-resource authority before issuing a scene.
  if(!read)return;
  const b=fs.readFileSync(file);
  if(b.length>maximum||createHash('sha256').update(b).digest('hex')!==sha)throw Error('retained qualification manifest changed');
  return JSON.parse(b.toString('utf8').replace(/^\uFEFF/,''));
 };
 verifyBinding(world.catalogPath,proof.catalogSha256,128*1024*1024);
 const manifest=verifyBinding(world.manifestPath,proof.manifestSha256,64*1024*1024,true);
 if(manifest.ValidationEpochUtc01!==proof.proofEpochUtc||manifest.ResolvedCatalogSHA256!==proof.catalogSha256||
    manifest.InputBinding?.GameExecutableSHA256!==config.gameSha256||manifest.Resources?.length!==10663)
  throw Error('retained qualification publication identity');
 let launchEpoch=null;
 const monotonicStop=performance.now()+until-at;
 return {
  epoch:proof.proofEpochUtc, stopBy:until,
  acceptLaunch(value){
   const observed=utc(value),nowUtc=now();
   if(!Number.isFinite(observed)||observed<started||observed>nowUtc+250||nowUtc>=until||performance.now()>=monotonicStop||
      launchEpoch!==null&&launchEpoch!==value)
    throw Error('retained qualification launch epoch changed, expired or absent');
   launchEpoch=value;
   return proof.proofEpochUtc;
  },
 };
}

// Retain evidence outside the output callback and independently of the
// pinned host's stderr parser. Refuse incomplete evidence on overflow or IO.
export function openNormalQualificationEvidence01(root,session,onFailure){
 const dir=path.join(root,'.local','gameplay',session);
 if(fs.realpathSync.native(dir).toLowerCase()!==dir.toLowerCase())throw Error('linked qualification evidence directory');
 fs.writeFileSync(path.join(root,'.local','environment-observation-claim.json'),JSON.stringify({session,pid:process.pid}),{flag:'wx'});
 const stream=fs.createWriteStream(path.join(dir,'environment-evidence.jsonl'),{flags:'wx',highWaterMark:64*1024});
 let bytes=0,failed=false;
 const fail=error=>{if(failed)return;failed=true;onFailure(error);};
 stream.on('error',fail);
 return {
  record(value){
   if(failed||stream.writableEnded)return;
   const text=JSON.stringify(value)+'\n',size=Buffer.byteLength(text);
   if(size>32768||bytes+size>128*1024*1024||stream.writableLength+size>512*1024){
    fail(Error('normal qualification evidence budget exceeded'));return;
   }
   bytes+=size;stream.write(text);
  },
  close(){if(!stream.writableEnded)stream.end();},
 };
}
