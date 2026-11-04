// Complete original-only executable closure. Parent source comes from Git;
// current harness and authored fixture bytes are identical in both snapshots.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const git=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(ok,reason)=>{if(!ok)throw Error(reason);};
export const processingParent13='85646ec65f2f88f0eb935374a79260a75e96b728';
const helpers=['tools/Profile-Processing13.mjs','tools/Owned-Processing13.mjs','tools/Freeze-Processing13.mjs','tools/Summarize-Processing13.mjs','tools/Processing-Continuity13.mjs','tools/Profile-Processing09.mjs','tools/Profile-AcousticBudget042.mjs','tests/fixtures/Processing13.mjs','tests/fixtures/Processing10.mjs','tests/fixtures/Processing09.mjs','tests/fixtures/AcousticBudget042.mjs'];
export async function captureProcessingWorkingClosure13(){
 const selected=[];
 async function visit(relative){const info=await fs.lstat(path.join(root,relative));check(info.isDirectory()&&!info.isSymbolicLink(),'owned working source directory required');for(const e of await fs.readdir(path.join(root,relative),{withFileTypes:true})){
  check(!e.isSymbolicLink(),'working source links refused');const member=relative+'/'+e.name;if(e.isDirectory())await visit(member);else if(e.isFile()&&member.endsWith('.mjs'))selected.push(member);
 }}await visit('src/acoustics');
 const files=[];
 for(const member of [...selected,...helpers].sort()){const info=await fs.lstat(path.join(root,member));check(info.isFile()&&!info.isSymbolicLink(),'regular working source required');const bytes=await fs.readFile(path.join(root,member));files.push({path:member,bytes:bytes.length,sha256:sha(bytes)});}
 return {files,closureSha256:sha(JSON.stringify(files))};
}
export async function verifyProcessingSnapshot13(directory){
 const manifestBytes=await fs.readFile(path.join(directory,'snapshot13.json')),manifest=JSON.parse(manifestBytes);
 check(manifest.kind==='RichAudioOwnedProcessingSnapshot13'&&manifest.parent===processingParent13&&['parent','candidate'].includes(manifest.implementation)&&manifest.name===path.basename(directory)&&manifest.files.length>100,'complete original source closure required');
 const paths=new Set();
 for(const f of manifest.files){
  check(/^(src\/acoustics\/[\w/-]+|tools\/[\w-]+|tests\/fixtures\/[\w-]+)\.mjs$/.test(f.path)&&!paths.has(f.path),'bounded unique owned snapshot member required');paths.add(f.path);
  for(let at=path.join(directory,f.path);at.startsWith(directory);at=path.dirname(at)){const info=await fs.lstat(at);check(!info.isSymbolicLink(),'snapshot links refused');if(at===directory)break;}
  const bytes=await fs.readFile(path.join(directory,f.path));check(bytes.length===f.bytes&&sha(bytes)===f.sha256,'frozen executable closure changed: '+f.path);
 }
 check(helpers.every(h=>paths.has(h)),'complete executed harness and input helpers required');
 return {manifest,manifestSha256:sha(manifestBytes)};
}
export async function freezeProcessing13(name,{implementation='candidate'}={}){
 check(/^world13-(?:current|baseline)-[a-z0-9-]+$/.test(name)&&['candidate','parent'].includes(implementation),'fresh bounded original snapshot required');
 const local=path.join(root,'.local');await fs.mkdir(local,{recursive:true});check(!(await fs.lstat(local)).isSymbolicLink(),'owned local directory required');
 const target=path.join(local,name);await fs.mkdir(target);const sources=[];
 if(implementation==='parent'){
  const result=await git('git',['ls-tree','-r','--name-only',processingParent13,'--','src/acoustics'],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024,windowsHide:true});
  sources.push(...result.stdout.trim().split(/\r?\n/).filter(n=>n.endsWith('.mjs')));
 }else{
  async function visit(relative){for(const e of await fs.readdir(path.join(root,relative),{withFileTypes:true})){
   check(!e.isSymbolicLink(),'source links refused');const member=relative+'/'+e.name;if(e.isDirectory())await visit(member);else if(e.isFile()&&member.endsWith('.mjs'))sources.push(member);
  }}await visit('src/acoustics');
 }
 check(sources.length>100&&sources.every(n=>/^src\/acoustics\/[\w/-]+\.mjs$/.test(n)),'owned MJS runtime closure required');
 const files=[];
 for(const member of [...sources,...helpers].sort()){
  let bytes;
  if(implementation==='parent'&&member.startsWith('src/'))bytes=(await git('git',['show',processingParent13+':'+member],{cwd:root,encoding:'buffer',maxBuffer:4*1024*1024,windowsHide:true})).stdout;
  else{const info=await fs.lstat(path.join(root,member));check(info.isFile()&&!info.isSymbolicLink(),'owned regular authored source required');bytes=await fs.readFile(path.join(root,member));}
  const destination=path.join(target,member);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,bytes,{flag:'wx'});
  files.push({path:member,bytes:bytes.length,sha256:sha(bytes),origin:implementation==='parent'&&member.startsWith('src/')?'git:'+processingParent13:'current-authored-harness-or-source'});
 }
 for(const f of files.filter(f=>!f.origin.startsWith('git:')))check(sha(await fs.readFile(path.join(root,f.path)))===f.sha256,'source changed while freezing');
 const manifest={schema:1,kind:'RichAudioOwnedProcessingSnapshot13',name,implementation,parent:processingParent13,createdUtc:new Date().toISOString(),scope:'Only RichAudio-authored MJS runtime, harness and original analytic fixtures. No upstream source, compiled code, installed resources or assets.',files};
 await fs.writeFile(path.join(target,'snapshot13.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 const verified=await verifyProcessingSnapshot13(target);return {name,implementation,files:files.length,manifestSha256:verified.manifestSha256};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{check(process.argv.length>=3&&process.argv.length<=4,'snapshot name and optional parent required');console.log(JSON.stringify(await freezeProcessing13(process.argv[2],{implementation:process.argv[3]??'candidate'})));}
 catch(error){console.error(error.stack??error.message);process.exitCode=1;}
}
