// Materializes only the six reviewed private player assets and the current
// proof. It never touches an installed destination, runs GTA or opens audio.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
function plain(p){
 const absolute=path.resolve(p);
 if(fs.realpathSync.native(absolute).toLowerCase()!==absolute.toLowerCase())throw Error('linked qualification input');
 return absolute;
}
function pin(file,expected,limit){
 const p=plain(file);
 if(!/^[a-f0-9]{64}$/.test(expected))throw Error('exact binding required');
 const fd=fs.openSync(p,'r');
 try{
  const a=fs.fstatSync(fd,{bigint:true});
  if(!a.isFile()||a.nlink!==1n||a.size<1n||a.size>BigInt(limit))throw Error('bounded single-link input required');
  const b=Buffer.alloc(Number(a.size));
  let n=0;while(n<b.length){const got=fs.readSync(fd,b,n,b.length-n,null);if(!got)break;n+=got;}
  const z=fs.statSync(plain(p),{bigint:true});
  if(n!==b.length||fs.readSync(fd,Buffer.alloc(1),0,1,null)!==0||sha(b)!==expected||
     ['dev','ino','size','mtimeNs','ctimeNs'].some(k=>a[k]!==z[k]))throw Error('incomplete or changed qualification input');
  return b;
 }finally{fs.closeSync(fd);}
}
const json=b=>JSON.parse(b.toString('utf8').replace(/^\uFEFF/,''));
const [draftFile,draftHash,proofFile,proofHash,approvalFile,approvalHash]=process.argv.slice(2);
const approval=json(pin(approvalFile,approvalHash,32768)),now=Date.now();
if(approval.approvedReadOnly!==true||approval.packageDraftSha256!==draftHash||
   !(Date.parse(approval.startUtc)<=now&&now<Date.parse(approval.stopByUtc)))throw Error('fresh exact private-source approval required');
const draft=json(pin(draftFile,draftHash,128*1024)),proof=json(pin(proofFile,proofHash,32768));
if(draft.approved!==false||proof.approvalSha!==approvalHash||proof.scopeSha!==approval.scopeSha256||
   proof.stopByUtc!==approval.stopByUtc||draft.configuration.acousticWorld.catalogPath!=='world/catalog.json'||
   draft.configuration.outputSink!=='environment-observation'||draft.pcm.length!==6||
   new Set(draft.pcm.map(r=>r.relative)).size!==6)throw Error('qualification proof and package scope differ');
const scope=plain(path.dirname(draftFile)),root=plain(draft.root),sidecars=plain(path.join(scope,'phase1-sidecars'));
if(!scope.split(path.sep).includes('.local')||root!==path.join(scope,'phase1-package'))throw Error('private qualification package required');
const write=(p,b)=>fs.writeFileSync(p,b,{flag:'wx'});
write(path.join(scope,'package-materialization-intent.json'),JSON.stringify({draftHash,proofHash,approvalHash,startedUtc:new Date().toISOString()}));
const bindings=[...draft.configuration.bindings];
for(const b of bindings){
 const p=path.resolve(root,b.file);
 if(!p.startsWith(root+path.sep))throw Error('package binding escaped scope');
 pin(p,b.sha256,128*1024*1024);
}
for(const asset of draft.pcm){
 if(!/^sources\/player\/bati\/(engine|exhaust)_(idle|accel|decel)\.f32$/.test(asset.relative)||
    !Number.isSafeInteger(asset.bytes)||asset.bytes<1||asset.bytes>32*1024*1024||!path.resolve(asset.path).split(path.sep).includes('.local'))throw Error('exact private Bati body required');
 const body=pin(asset.path,asset.sha256,asset.bytes);
 if(body.length!==asset.bytes)throw Error('private Bati length differs');
 const target=path.join(root,asset.relative);fs.mkdirSync(path.dirname(target),{recursive:true});plain(path.dirname(target));
 write(target,body);bindings.push({file:asset.relative,sha256:asset.sha256});
}
const world=pin(path.join(path.dirname(proofFile),'manifest.json'),proof.manifestSHA256,64*1024*1024);
plain(path.join(root,'world'));
write(path.join(root,'world/manifest.json'),world);
bindings.push({file:'world/manifest.json',sha256:proof.manifestSHA256});
const config={...draft.configuration,bindings,retainedQualification01:{proofEpochUtc:proof.epoch,stopByUtc:proof.stopByUtc,
 manifestSha256:proof.manifestSHA256,catalogSha256:proof.catalogSHA256}};
const text=JSON.stringify(config,null,2)+'\n',manifestSha256=sha(text);
if(Date.now()>=Date.parse(proof.stopByUtc))throw Error('package proof expired');
write(path.join(root,'playable.json'),text);
write(path.join(sidecars,'RichAudio.Playable.json'),JSON.stringify({schema:1,packageRoot:root,manifestSha256},null,2)+'\n');
write(path.join(scope,'materialized-package.json'),JSON.stringify({manifestSha256,bindings:bindings.length,approvedForLaunch:false},null,2));
