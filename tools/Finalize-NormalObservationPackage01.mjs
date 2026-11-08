// Materializes the six reviewed private player assets and binds a current
// proof when available. No installed destination, game launch or audio output.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const readScopeSha='3e90c01c6cc305b47225aacbc2f2a9b6ae1088383336d560d311b93addaf36df';
const readinessSha='5a74511c02a3c8122d50ff2be346ac916202b2e4035fa5bf99e25ccc6ba8781d';
const sameFile=(a,b)=>b.isFile()&&['dev','ino','size','nlink','mtimeNs','ctimeNs','birthtimeNs'].every(k=>a[k]===b[k]);
function plain(p){
 const absolute=path.resolve(p);
 if(fs.realpathSync.native(absolute).toLowerCase()!==absolute.toLowerCase())throw Error('linked qualification input');
 return absolute;
}
function pin(file,expected,limit,{links=1n,exactSize}={}){
 const p=plain(file);
 if(!/^[a-f0-9]{64}$/.test(expected))throw Error('exact binding required');
 const before=fs.lstatSync(p,{bigint:true});
 const fd=fs.openSync(p,'r');
 try{
  const a=fs.fstatSync(fd,{bigint:true});
  if(!before.isFile()||!sameFile(before,a)||a.nlink!==links||a.size<1n||a.size>BigInt(limit)||
     exactSize!==undefined&&a.size!==BigInt(exactSize))throw Error('bounded input link count, identity or length differs');
  const b=Buffer.alloc(Number(a.size));
  let n=0;while(n<b.length){const got=fs.readSync(fd,b,n,b.length-n,null);if(!got)break;n+=got;}
  if(n!==b.length||fs.readSync(fd,Buffer.alloc(1),0,1,null)!==0||sha(b)!==expected||
     !sameFile(a,fs.fstatSync(fd,{bigint:true}))||
     !sameFile(a,fs.lstatSync(plain(p),{bigint:true})))throw Error('incomplete or changed qualification input');
  return b;
 }finally{fs.closeSync(fd);}
}
const json=b=>JSON.parse(b.toString('utf8').replace(/^\uFEFF/,''));
const write=(p,b)=>fs.writeFileSync(p,b,{flag:'wx'});
const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
function copyNew(target,body){
 fs.mkdirSync(path.dirname(target),{recursive:true});
 plain(path.dirname(target));
 write(target,body);
}

// Production calls this only with rows from the exact reviewed read scope.
export function stageReviewedPcmCopy(asset,target){
 const body=pin(asset.path,asset.sha256,asset.bytes,{links:2n,exactSize:asset.bytes});
 copyNew(target,body);
 pin(target,asset.sha256,asset.bytes,{exactSize:asset.bytes});
 return {file:asset.relative,bytes:asset.bytes,sha256:asset.sha256,sourceLinks:2,copyLinks:1};
}

function prepareReviewedPcm(reviewDir,successorDir,approvalFile,approvalHash){
 const old=plain(reviewDir),successor=path.resolve(successorDir);
 const approval=json(pin(approvalFile,approvalHash,32768)),now=Date.now();
 const start=Date.parse(approval.startUtc),stop=Date.parse(approval.stopByUtc);
 if(approval.approvedReviewedPcmOnly!==true||approval.readScopeSha256!==readScopeSha||
    approval.readinessPinsSha256!==readinessSha||approval.successor!==successor||
    !(start<=now&&now<stop&&stop-start<=25*60_000)||path.dirname(successor)!==path.dirname(old)||
    !successor.split(path.sep).includes('.local'))throw Error('fresh exact six-PCM approval and private successor required');
 const readScope=json(pin(path.join(old,'read-scope.json'),readScopeSha,32768));
 const pins=json(pin(path.join(old,'readiness-pins.json'),readinessSha,32768));
 const draft=json(pin(path.join(old,'phase1-package-draft.json'),pins.phase1.draft.sha256,128*1024));
 const rows=readScope.phase1PrivateAssetRead.files;
 if(pins.readScope.sha256!==readScopeSha||readScope.packageDraft.sha256!==pins.phase1.draft.sha256||
    draft.root!==path.join(old,'phase1-package')||draft.approved!==false||rows.length!==6||
    JSON.stringify(rows)!==JSON.stringify(draft.pcm)||draft.configuration.bindings.length!==167)
  throw Error('exact reviewed package population required');
 plain(path.dirname(successor));
 fs.mkdirSync(successor);
 const root=path.join(successor,'phase1-package'),sidecars=path.join(successor,'phase1-sidecars');
 write(path.join(successor,'package-materialization-intent.json'),jsonBytes({readScopeSha,readinessSha,approvalHash,startedUtc:new Date().toISOString()}));
 for(const b of draft.configuration.bindings){
  const source=path.resolve(draft.root,b.file),target=path.resolve(root,b.file);
  if(!source.startsWith(draft.root+path.sep)||!target.startsWith(root+path.sep))throw Error('package binding escaped scope');
  copyNew(target,pin(source,b.sha256,128*1024*1024));
  pin(target,b.sha256,128*1024*1024);
 }
 for(const b of pins.phase1.sidecars){
  const name=path.basename(b.path),body=pin(path.join(old,'phase1-sidecars',name),b.sha256,b.bytes,{exactSize:b.bytes});
  if(name==='RichAudio.Menu.json'){
   const menu=json(body);
   if(menu.workspaceRoot!==draft.root||menu.controllerEnabled!==false)throw Error('private menu scope differs');
   copyNew(path.join(sidecars,name),jsonBytes({...menu,workspaceRoot:root}));
  }else copyNew(path.join(sidecars,name),body);
 }
 const settings='.local/acoustic-settings.json';
 copyNew(path.join(root,settings),pin(path.join(draft.root,settings),
  '967eb15b6dfcc5ac850957b870379abbe0fbb047ececad56e5e486f3ec13dead',65536));
 const verified=[];
 for(const asset of rows){
  if(Date.now()>=stop)throw Error('six-PCM approval expired');
  verified.push(stageReviewedPcmCopy(asset,path.join(root,asset.relative)));
 }
 const successorDraft={...draft,root,stagedPcm:true,
  pcm:rows.map(asset=>({...asset,path:path.join(root,asset.relative)}))};
 write(path.join(successor,'phase1-package-draft.json'),jsonBytes(successorDraft));
 write(path.join(successor,'pcm-prepared.json'),jsonBytes({approvedForLaunch:false,archiveReads:0,
  currentProofBound:false,nonPcmBindings:draft.configuration.bindings.length,approvalHash,verified}));
}

function finalize([draftFile,draftHash,proofFile,proofHash,approvalFile,approvalHash]){
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
 if(now>=Date.parse(proof.stopByUtc))throw Error('package proof expired');
 const intent=draft.stagedPcm===true?'proof-finalization-intent.json':'package-materialization-intent.json';
 write(path.join(scope,intent),JSON.stringify({draftHash,proofHash,approvalHash,startedUtc:new Date().toISOString()}));
 const bindings=[...draft.configuration.bindings];
 for(const b of bindings){
  const p=path.resolve(root,b.file);
  if(!p.startsWith(root+path.sep))throw Error('package binding escaped scope');
  pin(p,b.sha256,128*1024*1024);
 }
 for(const asset of draft.pcm){
  if(!/^sources\/player\/bati\/(engine|exhaust)_(idle|accel|decel)\.f32$/.test(asset.relative)||
     !Number.isSafeInteger(asset.bytes)||asset.bytes<1||asset.bytes>32*1024*1024||!path.resolve(asset.path).split(path.sep).includes('.local'))throw Error('exact private Bati body required');
  const target=path.join(root,asset.relative);
  if(draft.stagedPcm===true){
   if(asset.path!==target)throw Error('prepared PCM path differs from private package copy');
  }else copyNew(target,pin(asset.path,asset.sha256,asset.bytes,{exactSize:asset.bytes}));
  pin(target,asset.sha256,asset.bytes,{exactSize:asset.bytes});
  bindings.push({file:asset.relative,sha256:asset.sha256});
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
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);
 if(args[0]==='--prepare-reviewed-pcm')prepareReviewedPcm(...args.slice(1));
 else finalize(args);
}
