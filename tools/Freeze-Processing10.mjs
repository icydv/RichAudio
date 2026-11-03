// Copies only RichAudio-owned MJS source/fixture/profiler files. No upstream
// CodeWalker source, binary, installed resources or audio assets are selected.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(ok,reason)=>{if(!ok)throw Error(reason);};
export async function freezeProcessing10(name){
 check(/^world10-current-[a-z0-9-]+$/.test(name),'owned authored snapshot name required');
 const local=path.join(root,'.local');await fs.mkdir(local,{recursive:true});
 const parent=await fs.lstat(local);check(parent.isDirectory()&&!parent.isSymbolicLink(),'owned local directory required');
 const target=path.join(local,name);await fs.mkdir(target);const selected=[];
 async function visit(relative){
  const directory=path.join(root,relative);for(const entry of await fs.readdir(directory,{withFileTypes:true})){
   check(!entry.isSymbolicLink(),'source snapshot rejects links');const name=path.join(relative,entry.name);
   if(entry.isDirectory())await visit(name);else if(entry.isFile()&&entry.name.endsWith('.mjs'))selected.push(name);
  }
 }
 await visit('src/acoustics');selected.push('tools/Profile-Processing09.mjs','tools/Profile-AcousticBudget042.mjs','tools/Profile-Processing10.mjs','tests/fixtures/AcousticBudget042.mjs','tests/fixtures/Processing09.mjs','tests/fixtures/Processing10.mjs');
 const files=[];
 for(const relative of selected.sort()){
  const source=path.join(root,relative),info=await fs.lstat(source);check(info.isFile()&&!info.isSymbolicLink(),'owned source file required');
  const bytes=await fs.readFile(source),output=path.join(target,relative);await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,bytes,{flag:'wx'});
  files.push({path:relative.replaceAll('\\','/'),bytes:bytes.length,sha256:hash(bytes)});
 }
 for(const record of files)check(hash(await fs.readFile(path.join(root,record.path)))===record.sha256,'source changed while snapshot was captured');
 const manifest={schema:1,kind:'RichAudioAuthoredProcessingSnapshot10',createdUtc:new Date().toISOString(),scope:'RichAudio-owned MJS files only; no upstream source, binaries, private assets, installed resources or endpoints',files};
 const bytes=JSON.stringify(manifest,null,2)+'\n';await fs.writeFile(path.join(target,'snapshot10.json'),bytes,{flag:'wx'});
 return {name,files:files.length,manifestSha256:hash(bytes)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{check(process.argv.length===3,'one fresh snapshot name required');console.log(JSON.stringify(await freezeProcessing10(process.argv[2])));}
 catch(error){console.error(error.stack??error.message);process.exitCode=1;}
}
