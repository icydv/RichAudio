// Read-only installed archive proof. No decoding and no historical writes.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {publishWarmupManifest01,revalidateArchive} from '../src/acoustics/world/world-warmup.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const read=(file,expected)=>{
 const p=path.resolve(file);
 if(!/^[a-f0-9]{64}$/.test(expected)||fs.realpathSync.native(p).toLowerCase()!==p.toLowerCase()||fs.statSync(p).size>64*1024*1024)throw Error('bounded pinned JSON required');
 const b=fs.readFileSync(p);
 if(b.length>64*1024*1024||sha(b)!==expected)throw Error('JSON digest differs');
 return JSON.parse(b.toString('utf8').replace(/^\uFEFF/,''));
};
async function hashArchive(root,row,signal){
 if(!/^[\w@.-]+(?:\/[\w@.-]+)*\.rpf$/i.test(row.relative)||row.relative.split('/').includes('..')||
    !/^[a-f0-9]{64}$/.test(row.sha256)||!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>4_000_000_000)
  throw Error('exact bounded archive pin required');
 const file=path.resolve(root,row.relative);
 const identity=()=>{if(fs.realpathSync.native(file).toLowerCase()!==file.toLowerCase())throw Error('linked archive refused');return fs.statSync(file,{bigint:true});};
 const before=identity(),handle=await fs.promises.open(file,'r');
 const same=(a,b)=>['dev','ino','size','mtimeNs','ctimeNs'].every(k=>a[k]===b[k]);
 try{
  if(!before.isFile()||before.nlink!==1n||before.size!==BigInt(row.bytes)||!same(before,await handle.stat({bigint:true})))
   throw Error('archive identity differs before hashing');
  const hash=createHash('sha256');let bytes=0;
  for await(const block of handle.createReadStream({highWaterMark:1024*1024,signal,autoClose:false})){
   bytes+=block.length;if(bytes>row.bytes)throw Error('archive exceeded scope');hash.update(block);
  }
  if(bytes!==row.bytes||hash.digest('hex')!==row.sha256||!same(before,await handle.stat({bigint:true}))||!same(before,identity()))
   throw Error('incomplete archive read or identity changed');
  return {...row,identity:Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs'].map(k=>[k,String(before[k])]))};
 }finally{await handle.close();}
}

export function verifyNormalProofScope01(plan,manifest,catalog){
 const {archives,resourceIds,instanceId,catalogSHA256}=plan;
 if(manifest.Resources.length!==10663||manifest.ResolvedCatalogSHA256!==catalogSHA256||
    !Array.isArray(archives)||archives.length<2||archives.length>5||
    archives.reduce((n,a)=>n+a.bytes,0)>12_000_000_000||new Set(archives.map(a=>a.relative)).size!==archives.length||
    !Array.isArray(resourceIds)||resourceIds.length<2||resourceIds.length>12||new Set(resourceIds).size!==resourceIds.length)
  throw Error('bounded normal proof scope');
 const selected=resourceIds.map(id=>manifest.Resources.find(r=>r.Id===id));
 if(selected.some(r=>!r||!archives.some(a=>a.relative===r.PhysicalArchive&&a.sha256===(r.Result??r.PotentialResult)?.ArchiveSHA256)))
  throw Error('exact retained resource and archive bindings required');
 const placed=selected.filter(r=>r.Eligibility!=='eligible-exterior');
 const place=placed[0]?.PreparationStates01?.placement?.interiorPlacements?.placements?.find(p=>p.instanceId===instanceId);
 if(placed.length!==1||!place||!['Ymap','Ytyp'].every(kind=>{
  const entry=place['source'+kind],hash=place['source'+kind+'SHA256'];
  return archives.filter(a=>entry.startsWith(a.relative+'/')).length===1&&
   catalog.InteriorPlacementMetadata01?.[kind+'SourceBindings']?.some(b=>b.Path===entry&&b.SHA256===hash);
 }))throw Error('exact retained placement and metadata source bindings required');
 return selected;
}

export function publishNormalProof01(plan,manifest,catalog,proofs,out,epoch){
 const selected=verifyNormalProofScope01(plan,manifest,catalog);
 if(proofs.length!==plan.archives.length||plan.archives.some(a=>!proofs.some(p=>p.relative===a.relative&&p.bytes===a.bytes&&p.sha256===a.sha256)))
  throw Error('complete current proof set required');
 for(const row of manifest.Resources)delete row.ArchiveValidation01;
 manifest.ValidationEpochUtc01=epoch;
 for(const proof of proofs){
  const ids=selected.filter(r=>r.PhysicalArchive===proof.relative).map(r=>r.Id);
  if(ids.length)revalidateArchive(manifest,proof.relative,proof.sha256,plan.catalogPath,plan.catalogSHA256,epoch,ids);
 }
 if(!plan.resourceIds.every(id=>{const r=manifest.Resources.find(row=>row.Id===id);return r?.ArchiveValidation01?.EpochUtc===epoch&&
  (r.Eligibility==='eligible-exterior'?r.Status==='imported-exterior-incomplete-surfaces':r.PotentialStatus==='imported-resource-root-incomplete-surfaces');}))
  throw Error('selected retained geometry failed proof publication');
 return publishWarmupManifest01(path.join(out,'manifest.json'),manifest);
}

async function main(){
 const [scopeFile,scopeSha,approvalFile,approvalSha]=process.argv.slice(2);
 const plan=read(scopeFile,scopeSha),approval=read(approvalFile,approvalSha);
 const stop=Date.parse(approval.stopByUtc),begin=Date.parse(approval.startUtc),now=Date.now();
 if(plan.approvedReadOnly!==false||approval.approvedReadOnly!==true||approval.scopeSha256!==scopeSha||
    now<begin||now>=stop||!(stop-begin<=25*60_000)||approvalFile===scopeFile)throw Error('fresh approved read scope and cutoff required');
 const root=path.resolve(plan.privateRoot),out=path.resolve(plan.outputRoot);
 if(!root.split(path.sep).includes('.local')||!out.startsWith(root+path.sep)||
    fs.realpathSync.native(path.dirname(out)).toLowerCase()!==path.dirname(out).toLowerCase())throw Error('fresh private proof output required');
 const manifest=read(plan.retainedManifestPath,plan.retainedManifestSHA256),catalog=read(plan.catalogPath,plan.catalogSHA256);
 verifyNormalProofScope01(plan,manifest,catalog);
 fs.mkdirSync(out); // one claim before any archive read
 const game=fs.realpathSync.native(plan.gameRoot),signal=AbortSignal.timeout(Math.min(8*60_000,stop-now));
 if(game.toLowerCase()!==path.resolve(plan.gameRoot).toLowerCase())throw Error('linked installation root');
 const proofs=[];
 for(const archive of plan.archives)proofs.push(await hashArchive(game,archive,signal));
 const epoch=new Date().toISOString();
 if(Date.now()>=stop)throw Error('proof cutoff elapsed');
 const published=publishNormalProof01(plan,manifest,catalog,proofs,out,epoch);
 fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify({scopeSha,approvalSha,epoch,stopByUtc:approval.stopByUtc,
  archiveProofs:proofs,resourceIds:plan.resourceIds,catalogSHA256:plan.catalogSHA256,manifestSHA256:published.sha256},null,2),{flag:'wx'});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
