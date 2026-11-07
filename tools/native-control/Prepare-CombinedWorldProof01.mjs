// Explicitly approved stage only. No resource extraction, geometry decode or game writes.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {publishWarmupManifest01,revalidateArchive} from '../../src/acoustics/world/world-warmup.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function pinned(p,pin){if(!hex(pin)||fs.statSync(p).size>64*1024*1024)throw Error('pinned JSON byte limit');const b=fs.readFileSync(p);if(sha(b)!==pin)throw Error('pinned JSON changed');return JSON.parse(b.toString('utf8').replace(/^\uFEFF/,''));}
function plain(p){
 if(fs.realpathSync.native(p).toLowerCase()!==path.resolve(p).toLowerCase())throw Error('linked source refused');
 return path.resolve(p);
}
async function hashArchive(root,row,signal){
 if(!/^[\w@.-]+(?:\/[\w@.-]+)*\.rpf$/i.test(row.relative)||row.relative.split('/').includes('..')||!hex(row.sha256)||
  !Number.isSafeInteger(row.bytes)||row.bytes<=0||row.bytes>4_000_000_000)throw Error('bounded archive pin required');
 const file=plain(path.join(root,row.relative)),before=fs.statSync(file,{bigint:true});
 if(!before.isFile()||before.nlink!==1n||before.size!==BigInt(row.bytes))throw Error('archive identity or bytes differ');
 const hash=createHash('sha256');let bytes=0;
 for await(const b of fs.createReadStream(file,{highWaterMark:1024*1024,signal})){
  bytes+=b.length;if(bytes>row.bytes)throw Error('archive exceeded allowance');hash.update(b);
 }
 const digest=hash.digest('hex'),after=fs.statSync(plain(file),{bigint:true});
 if(bytes!==row.bytes||digest!==row.sha256||['dev','ino','size','mtimeNs','ctimeNs'].some(k=>before[k]!==after[k]))throw Error('archive changed or digest did not match');
 return {relative:row.relative,bytes,sha256:digest,identity:Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs'].map(k=>[k,String(after[k])]))};
}
export function publishSelectedObservationManifest01(plan,manifest,proofs,out,epoch){
 if(manifest.ResolvedCatalogSHA256!==plan.catalogSHA256||manifest.Resources.length!==plan.catalogueDenominator||new Set(plan.resourceIds).size!==plan.resourceIds.length)throw Error('retained world denominator or catalogue changed');
 for(const row of manifest.Resources)delete row.ArchiveValidation01;
 manifest.ValidationEpochUtc01=epoch;
 for(const proof of proofs){
  const ids=manifest.Resources.filter(r=>r.PhysicalArchive===proof.relative&&plan.resourceIds.includes(r.Id)).map(r=>r.Id);
  if(ids.length)revalidateArchive(manifest,proof.relative,proof.sha256,plan.catalogPath,plan.catalogSHA256,epoch,ids);
 }
 if(!plan.resourceIds.every(id=>{const r=manifest.Resources.find(r=>r.Id===id);return r?.PotentialStatus==='imported-resource-root-incomplete-surfaces'&&r.ArchiveValidation01?.EpochUtc===epoch;}))throw Error('selected geometry failed retained revalidation');
 const p=path.join(out,'manifest.json'),pin=publishWarmupManifest01(p,manifest);
 return {...plan,validatedManifestPath:p,validatedManifestSHA256:pin.sha256};
}
async function main(){
 const [receiptPath,outArg,confirmation]=process.argv.slice(2);
 if(confirmation!=='approved-selected-archive-read'||!outArg)throw Error('Separate approval for the exact selected archive reads is required');
 const plan=JSON.parse(fs.readFileSync(receiptPath,'utf8').replace(/^\uFEFF/,''));
 const root=plain(plan.gameRoot),out=path.resolve(outArg);
 if(!out.startsWith(plain(plan.privateRoot)+path.sep)||!Number.isSafeInteger(plan.catalogueDenominator)||
  plan.archives?.length!==2||new Set(plan.archives.map(a=>a.relative)).size!==2||
  plan.archives.reduce((n,a)=>n+a.bytes,0)>4_900_000_000||plan.resourceIds?.length!==1)throw Error('exact private observation scope required');
 const manifest=pinned(plan.retainedManifestPath,plan.retainedManifestSHA256);
 const catalog=pinned(plan.catalogPath,plan.catalogSHA256);
 const sources=manifest.Resources.find(r=>r.Id===plan.resourceIds[0])?.PreparationStates01?.placement?.interiorPlacements?.placements??[];
 const selected=sources.find(p=>p.instanceId===plan.instanceId);
 const archiveFor=entry=>plan.archives.filter(a=>entry.startsWith(a.relative+'/')).map(a=>a.relative);
 if(!selected||!catalog.InteriorPlacementMetadata01.YmapSourceBindings.some(b=>b.Path===selected.sourceYmap&&b.SHA256===selected.sourceYmapSHA256)||
  !catalog.InteriorPlacementMetadata01.YtypSourceBindings.some(b=>b.Path===selected.sourceYtyp&&b.SHA256===selected.sourceYtypSHA256)||
  new Set([selected.sourceYmap,selected.sourceYtyp,manifest.Resources.find(r=>r.Id===plan.resourceIds[0]).EntryPath].flatMap(archiveFor)).size!==2||
  [selected.sourceYmap,selected.sourceYtyp].some(p=>archiveFor(p).length!==1))throw Error('selected placement does not bind the reviewed source archives');
 const epoch=new Date().toISOString(),proofs=[],signal=AbortSignal.timeout(5*60_000);
 for(const archive of plan.archives)proofs.push(await hashArchive(root,archive,signal));
 plain(path.dirname(out));fs.mkdirSync(out);
 const staged=publishSelectedObservationManifest01(plan,manifest,proofs,out,epoch);
 fs.writeFileSync(path.join(out,'consumer-plan.json'),JSON.stringify({...staged,archiveProofs:proofs,epoch},null,2),{flag:'wx'});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
