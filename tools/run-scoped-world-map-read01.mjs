// Owned child of PreparationCoordinator. --verify-only is installation-free.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const [mode,proposalArg,sealPin,outputArg]=process.argv.slice(2);
const repo=path.resolve(import.meta.dirname,'..');
const local=path.join(repo,'.local')+path.sep;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const shaPattern=/^[a-f0-9]{64}$/;
const scopePin='131f3f9c00f450640b44df74f19a6e20940ca3f5f32018d60a4e74c3f90f846c';
const narrowScopePin='cc2851d66eb4d04e5f080e40c238d9c88c0a9c9a249c0ba0202c27ee5dacc466';
const reject=message=>{throw Error(message);};
const check=(ok,message)=>{if(!ok)reject(message);};
const under=(file,root)=>file.toLowerCase().startsWith(root.toLowerCase()+path.sep);
const equal=(a,b)=>a&&b&&Object.keys(a).every(k=>a[k]===b[k]);
function plain(file){
 check(fs.realpathSync.native(file).toLowerCase()===file.toLowerCase(),'linked or noncanonical path');
 for(let p=file;p!==path.dirname(p);p=path.dirname(p))check(!fs.lstatSync(p).isSymbolicLink(),'linked path component');
 return file;
}
function read(file,pin,maximum=32*1024*1024){
 check(under(file,path.join(repo,'.local'))||file===import.meta.filename,'private pinned input');
 const info=fs.lstatSync(plain(file));
 check(info.isFile()&&info.nlink===1&&info.size>0&&info.size<=maximum&&shaPattern.test(pin),'bounded pinned file');
 const bytes=fs.readFileSync(file);
 check(bytes.length===info.size&&sha(bytes)===pin,'pinned file digest differs');
 return bytes;
}
const json=bytes=>JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
check(['--verify-only','--owned-installed'].includes(mode)&&proposalArg&&shaPattern.test(sealPin??''),'exact reviewed proposal inputs');
const proposal=path.resolve(proposalArg);
check(proposal.toLowerCase().startsWith(local.toLowerCase()),'private reviewed proposal');
const seal=json(read(path.join(proposal,'review-seal.json'),sealPin,64*1024));
const narrow=seal.mode==='exact-members-no-new-runtime-proof';
check(seal.schema===1&&seal.approvedForExecution===false&&seal.scope.sha256===(narrow?narrowScopePin:scopePin)&&
 /^[a-f0-9]{40}$/.test(seal.sourceCommit)&&seal.oneUse===true&&(narrow||seal.mode==='metadata-only-no-new-runtime-proof')&&
 seal.maxSeconds===900&&seal.maximumOwnedProcesses===3&&seal.maximumMemoryMiB===3072,'review scope identity');
const pinned=(name,max)=>read(path.resolve(proposal,seal[name].file),seal[name].sha256,max);
const scope=json(pinned('scope',(narrow?80:64)*1024));
const plan=json(pinned('plan',16*1024*1024));
const previous=json(pinned('priorArchiveIdentities',4*1024*1024));
const approvedPaths=(narrow?scope.archivePopulation:scope.archives).map(r=>r.relative),basis=narrow?scope.basis:scope;
check(approvedPaths.length===(narrow?18:123)&&new Set(approvedPaths).size===approvedPaths.length&&
 (narrow||scope.archives.filter(r=>r.collision>0).length===53&&scope.archives.reduce((n,r)=>n+r.collision,0)===10663)&&
 JSON.stringify(approvedPaths)===JSON.stringify(plan.archives)&&basis.gameExecutableSHA256===plan.executableSHA256&&
 basis.codeWalkerCoreSHA256===plan.parserSHA256,'approved map plan differs');
if(narrow){
 const selected=scope.allowedMembers,branches=new Set(),pins={};
 check(selected.length===118&&selected.filter(r=>r.kind==='ymf').length===9&&selected.filter(r=>r.kind==='ytyp').length===109&&
  JSON.stringify(selected.map(r=>r.member))===JSON.stringify(plan.selected)&&new Set(plan.selected).size===118,'exact metadata member population differs');
 const parent=member=>member.slice(0,member.lastIndexOf('.rpf/')+4);
 for(const row of selected){
  check(row.member.endsWith('.'+row.kind)&&row.archive===row.member.slice(0,row.member.indexOf('.rpf/')+4)&&
   approvedPaths.includes(row.archive)&&parent(row.member)===row.table,'exact member ancestry');
  for(let table=row.table;table!==row.archive;table=parent(table)){
   check(table.includes('.rpf/')&&table.startsWith(row.archive+'/'),'exact nested ancestor');
   branches.add(table);
  }
  const retained=row.retainedSHA256??row.previousReviewPin;
  if(retained){check(shaPattern.test(retained)&&(!row.previousReviewPin||row.previousReviewPin===retained),'retained member pin differs');pins[row.member]=retained;}
 }
 check(JSON.stringify([...branches].sort())===JSON.stringify(plan.branches)&&
  JSON.stringify(pins)===JSON.stringify(plan.memberPins)&&seal.bootstrap?.file==='GTA5_Enhanced.exe'&&
  seal.bootstrap.sha256===basis.gameExecutableSHA256,'narrow ancestor, digest or initializer scope differs');
}
check(previous.length===approvedPaths.length&&previous.every((r,i)=>r.relative===approvedPaths[i]),'prior proof ordering differs');
check(seal.core.sha256===basis.codeWalkerCoreSHA256&&path.dirname(seal.reader.file)===path.dirname(seal.core.file),'exact reader dependency location');
for(const item of ['reader','core','sharpDx','sharpDxMathematics','procedure','audit','runner','coordinator','catalogPaths','launcher'])pinned(item);
pinned('node',128*1024*1024);
check(sha(fs.readFileSync(import.meta.filename))===seal.runner.sha256&&
 sha(fs.readFileSync(process.execPath))===seal.node.sha256,'running coordinator inputs differ');
const target=new Set([...plan.selected,...plan.branches].map(p=>p.slice(0,p.indexOf('.rpf/')+4)));
check([...target].every(p=>approvedPaths.includes(p)),'selected member outside reviewed archives');
if(mode==='--verify-only'){
 console.log(JSON.stringify({source:seal.sourceCommit,archiveInventory:approvedPaths.length,affectedPhysicalArchives:target.size,
  selectedMembers:plan.selected.length,branches:plan.branches.length,initializerRequired:narrow,protectedReads:0,sealSHA256:sealPin}));
 process.exit(0);
}
const output=path.resolve(outputArg??'');
check(under(output,proposal)&&plain(output)===output,'fresh owned private result');
const claimPath=path.join(output,'claim.json'),claim=JSON.parse(fs.readFileSync(plain(claimPath),'utf8'));
check(claim.attempts===1&&claim.reviewSealSHA256===sealPin&&claim.sourceCommit===seal.sourceCommit&&
 claim.mode===seal.mode&&shaPattern.test(claim.authorizationSHA256),'one-use approved owned claim required');
read(path.join(output,'authorization.txt'),claim.authorizationSHA256,64*1024);
const readStarted=path.join(output,'protected-read-started.json');
fs.writeFileSync(readStarted,JSON.stringify({reviewSealSHA256:sealPin,utc:new Date().toISOString()})+'\n',{flag:'wx'});

const installation=path.resolve(seal.gameRoot),priorByPath=new Map(previous.map(r=>[r.relative,r]));
const fields=['dev','ino','size','mtimeNs','ctimeNs','nlink'];
function identity(file){
 const st=fs.lstatSync(plain(file),{bigint:true});
 check(st.isFile()&&st.nlink===1n&&st.size>=16n&&st.size<=32n*1024n*1024n*1024n,'protected archive identity or length invalid');
 return Object.fromEntries(fields.map(k=>[k,String(st[k])]));
}
function installedPaths(){
 return approvedPaths.map(rel=>{
  check(/^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*\.rpf$/.test(rel)&&!/(^|\/)(audio|sfx)(\/|$)/.test(rel)&&
   !rel.split('/').some(s=>s==='.'||s==='..'||s.endsWith('.')),'invalid reviewed archive path');
  const file=path.resolve(installation,rel);
  check(under(file,installation),'reviewed archive path escapes installation');
  return {rel,file};
 });
}
const files=installedPaths(), before=[];
for(const {rel,file} of files){
 check(!fs.existsSync(path.join(output,'supervised/cancel.request')),'owned cancellation');
 const current=identity(file),retained=priorByPath.get(rel);
 const same=equal(current,retained.archiveIdentity)&&!retained.finalIdentityChanged;
 before.push({relative:rel,current,same,
  retainedSHA256:same&&retained.matchesRetained===true?retained.collisionSHA256:null,
  hashAuthority:same?'retained-receipt-with-matching-file-identity':'fresh-hash-needed',
  runtimeProofReissued:false});
}
fs.writeFileSync(path.join(output,'archive-identity-check.json'),JSON.stringify(before,null,2)+'\n',{flag:'wx'});
check(before.every(r=>r.same),'protected archive identity changed; review exact affected hashes before proceeding');
const reader=path.resolve(proposal,seal.reader.file);
const readPass=spawnSync(reader,[narrow?'--installed-narrow':'--installed',installation,output,path.resolve(proposal,seal.plan.file),seal.plan.sha256],
 {cwd:proposal,encoding:'utf8',windowsHide:true,timeout:900000,maxBuffer:262144});
fs.writeFileSync(path.join(output,'reader-terminal.json'),JSON.stringify({status:readPass.status,signal:readPass.signal,
 error:readPass.error?.message??null,stderr:readPass.stderr})+'\n',{flag:'wx'});
const stable=files.map(({rel,file},i)=>({relative:rel,unchanged:equal(identity(file),before[i].current)}));
fs.writeFileSync(path.join(output,'archive-final-check.json'),JSON.stringify(stable,null,2)+'\n',{flag:'wx'});
check(stable.every(r=>r.unchanged)&&[0,2].includes(readPass.status),'reader or final archive identity failed');
console.log(JSON.stringify({readerExit:readPass.status,selectedTraversalComplete:readPass.status===0,effectiveMapVerified:false,runtimeProofReissued:false}));
process.exitCode=readPass.status;
