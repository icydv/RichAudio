// Qualification-only identity continuity check. Archive bytes are never opened.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const hex=(value,length)=>typeof value==='string'&&value.length===length&&/^[a-f0-9]+$/.test(value);
const need=(value,message)=>{if(!value)throw Error(message);};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
function unlinked(file){
 const full=path.resolve(file);
 need(samePath(fs.realpathSync.native(full),full),'Canonical unlinked path required');
 return full;
}
function readPinned(file,sha256,limit){
 need(hex(sha256,64),'Exact SHA-256 pin required');
 const full=unlinked(file),stat=fs.lstatSync(full);
 need(stat.isFile()&&stat.nlink===1&&stat.size>0&&stat.size<=limit,'Bounded private input required');
 const bytes=fs.readFileSync(full);
 need(bytes.length===stat.size&&digest(bytes)===sha256,'Private input pin differs');
 return JSON.parse(bytes);
}
const identityFields=['dev','ino','size','mtimeNs','ctimeNs','nlink'];
function identity(stat){
 need(stat.isFile()&&stat.nlink===1n,'Unlinked original source file required');
 return Object.fromEntries(identityFields.map(key=>[key,String(stat[key])]));
}
const sameIdentity=(a,b)=>identityFields.every(key=>a[key]===b[key]);
const relativeArchive=value=>typeof value==='string'&&value.length<=260&&value.endsWith('.rpf')&&
 value.split('/').every(part=>/^[a-zA-Z0-9_.-]+$/.test(part)&&part!=='.'&&part!=='..')&&
 !/(^|\/)(audio|mods)(\/|$)/i.test(value);

function mapIdentityScope01(scope){
 need(scope?.schema===1&&scope.kind==='soundmap-retained-source-continuity'&&scope.approved===false&&
  path.isAbsolute(scope.gameRoot)&&hex(scope.configSHA256,64)&&hex(scope.gameExecutableSHA256,64)&&
  Number.isFinite(Date.parse(scope.proofEpoch))&&Number.isSafeInteger(scope.gameExecutableBytes)&&
  scope.gameExecutableBytes>0&&scope.gameExecutableBytes<=256*1024*1024&&
  Array.isArray(scope.archives)&&scope.archives.length===123,'Exact disabled map identity scope required');
 const seen=new Set();
 for(const row of scope.archives){
  need(relativeArchive(row.relative)&&!seen.has(row.relative.toLowerCase())&&
   identityFields.every(key=>typeof row.identity?.[key]==='string'&&/^\d+$/.test(row.identity[key]))&&
   row.identity.nlink==='1'&&BigInt(row.identity.size)>=16n&&BigInt(row.identity.size)<=32n*1024n*1024n*1024n,
   'Exact unique retained map archive identity required');
  seen.add(row.relative.toLowerCase());
 }
 return scope;
}

function checkGameExecutable(scope){
 const file=unlinked(path.join(scope.gameRoot,'GTA5_Enhanced.exe'));
 const before=identity(fs.lstatSync(file,{bigint:true})),hash=createHash('sha256');
 need(Number(before.size)===scope.gameExecutableBytes,'Game executable length differs');
 const fd=fs.openSync(file,'r');
 try{
  need(sameIdentity(before,identity(fs.fstatSync(fd,{bigint:true}))),'Game executable replaced before hashing');
  const chunk=Buffer.allocUnsafe(1024*1024);
  let offset=0;
  while(offset<scope.gameExecutableBytes){
   const read=fs.readSync(fd,chunk,0,Math.min(chunk.length,scope.gameExecutableBytes-offset),offset);
   need(read>0,'Incomplete game executable hash');
   hash.update(chunk.subarray(0,read));offset+=read;
  }
  need(fs.readSync(fd,chunk,0,1,offset)===0&&sameIdentity(before,identity(fs.fstatSync(fd,{bigint:true})))&&
   sameIdentity(before,identity(fs.lstatSync(unlinked(file),{bigint:true}))),'Game executable changed during hashing');
  need(hash.digest('hex')===scope.gameExecutableSHA256,'Game executable SHA-256 differs');
 }finally{fs.closeSync(fd);}
 return before;
}

function checkArchives(scope){
 const root=unlinked(scope.gameRoot);
 for(const row of scope.archives){
  const file=unlinked(path.join(root,row.relative));
  need(sameIdentity(row.identity,identity(fs.lstatSync(file,{bigint:true}))),'Retained archive identity differs: '+row.relative);
 }
}

export function sourceMonitor01(scopePath,scopeSHA256,receipt){
 const scope=mapIdentityScope01(readPinned(scopePath,scopeSHA256,256*1024));
 need(receipt?.operatorControlled===true&&receipt.scopeSHA256===scopeSHA256&&receipt.gameExecutableIdentity&&
  scope.configSHA256===receipt.configSHA256&&scope.proofEpoch===receipt.proofEpoch,'Exact operator session source monitor binding required');
 return ()=>{
  checkArchives(scope);
  const exe=unlinked(path.join(scope.gameRoot,'GTA5_Enhanced.exe'));
  need(sameIdentity(receipt.gameExecutableIdentity,identity(fs.lstatSync(exe,{bigint:true}))),'Game executable identity changed since preflight');
 };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
const [mode,scopePath,scopeSHA256,approvalPath,approvalSHA256]=process.argv.slice(2);
need((mode==='verify'&&process.argv.length===5)||(['confirm','postcheck'].includes(mode)&&process.argv.length===7),'Explicit map source verification mode required');
const scope=mapIdentityScope01(readPinned(scopePath,scopeSHA256,256*1024));
if(mode==='verify'){
 console.log(JSON.stringify({archives:scope.archives.length,protectedPathsAccessed:0,archiveContentBytesRead:0}));
}else{
 const approval=readPinned(approvalPath,approvalSHA256,4096),started=Date.now();
 const operatorControlled=approval?.policy==='operator-controlled'&&approval.stopAt===null;
 need(approval?.schema===1&&approval.kind==='soundmap-one-use-source-approval'&&approval.approved===true&&
  approval.scopeSHA256===scopeSHA256&&hex(approval.ownerId,32)&&Number.isSafeInteger(approval.startAt)&&
  approval.startAt<=started&&(operatorControlled?(mode==='postcheck'||started-approval.startAt<480000):
   approval.policy===undefined&&Number.isSafeInteger(approval.stopAt)&&started<approval.stopAt&&
   approval.stopAt-approval.startAt<=25*60*1000),'Fresh one-use source approval required');
 const attempt=unlinked(path.dirname(approvalPath));
 need(attempt.split(path.sep).includes('.local'),'Private attempt directory required');
 const claim=path.join(attempt,'source-continuity-claim.json');
 let executableIdentity;
 if(mode==='confirm'){
  fs.writeFileSync(claim,JSON.stringify({scopeSHA256,approvalSHA256,started}),{flag:'wx'});
  checkArchives(scope);executableIdentity=checkGameExecutable(scope);
 }else{
  const original=JSON.parse(fs.readFileSync(unlinked(claim),'utf8'));
  need(original.scopeSHA256===scopeSHA256&&original.approvalSHA256===approvalSHA256&&
   fs.existsSync(path.join(attempt,'current-source-identity.json')),'Successful matching preflight required');
  fs.writeFileSync(path.join(attempt,'source-continuity-postcheck-claim.json'),JSON.stringify({scopeSHA256,approvalSHA256,started}),{flag:'wx'});
  if(operatorControlled){
   const proof=JSON.parse(fs.readFileSync(unlinked(path.join(attempt,'current-source-identity.json')),'utf8'));
   need(proof.approvalSHA256===approvalSHA256&&proof.ownerId===approval.ownerId&&proof.policy==='operator-controlled','Original operator source proof differs');
   executableIdentity=proof.gameExecutableIdentity;
   const exe=unlinked(path.join(scope.gameRoot,'GTA5_Enhanced.exe'));
   need(executableIdentity&&sameIdentity(executableIdentity,identity(fs.lstatSync(exe,{bigint:true}))),'Game executable identity changed since preflight');
  }
 }
 checkArchives(scope);
 const checkedAt=Date.now();
 need(operatorControlled||checkedAt<approval.stopAt,'Map source check exceeded its session deadline');
 const receipt={schema:1,kind:'soundmap-current-source-identity',ownerId:approval.ownerId,stopAt:approval.stopAt,
  configSHA256:scope.configSHA256,proofEpoch:scope.proofEpoch,scopeSHA256,approvalSHA256,checkedAt,
  archiveCount:123,matchingArchiveIdentities:123,archiveContentBytesRead:0,gameExecutableSHA256:scope.gameExecutableSHA256,
  ...(operatorControlled?{policy:'operator-controlled',gameExecutableIdentity:executableIdentity}:{})};
 const file=path.join(attempt,mode==='confirm'?'current-source-identity.json':'final-source-identity.json');
 const bytes=Buffer.from(JSON.stringify(receipt));
 fs.writeFileSync(file,bytes,{flag:'wx'});
 console.log(JSON.stringify({file,sha256:digest(bytes)}));
}
}
