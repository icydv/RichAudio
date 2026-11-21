// Original Windows handle/mapping controls. Never inspect installed resources.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createRuntimeCleanup13,cleanupBudgetMs13,cleanupMaximumAttempts13} from '../tools/runtime-cleanup13.mjs';
const repo=path.dirname(path.dirname(fileURLToPath(import.meta.url))),helper=process.env.RICHAUDIO_CLEANUP13_HELPER;
if(!helper)throw Error('Run tools/Test-RuntimeCleanup13.ps1 with a fresh original fixture helper');
const cleanup=await createRuntimeCleanup13({helper}),bytes=await fs.readFile(helper),sha256=createHash('sha256').update(bytes).digest('hex');
async function fixture(){const root=await fs.mkdtemp(path.join(repo,'.local/world041-contained-')),stage=path.join(root,'stage');await fs.mkdir(stage);await fs.writeFile(path.join(stage,'node.exe'),bytes,{flag:'wx'});return cleanup.registerPreparedCopy({root,stage,nodeSHA256:sha256,timeoutMs:500});}
async function hold(p,mode){
 const target=path.join(p.stage,'node.exe'),child=spawn(helper,[mode,target],{windowsHide:true,stdio:['pipe','pipe','pipe']}),lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();let stderr='';child.stderr.on('data',b=>stderr+=b);
 const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal,stderr}))),timer=setTimeout(()=>child.kill(),10000);
 const next=await lines.next();assert.equal(next.done,false,JSON.stringify(await Promise.race([closed,Promise.resolve({pending:true})])));const held=JSON.parse(next.value),info=await fs.lstat(target,{bigint:true});assert.equal(held.stage,'held');assert.equal(String(held.volume),String(info.dev));assert.equal(held.fileIndex,String(info.ino));
 let released=false;
 return {held,async release(){if(released)return;released=true;child.stdin.end('release\n');const next=await lines.next();assert.equal(next.done,false);assert.deepEqual(JSON.parse(next.value),{stage:'released',fileHandleClosed:true,mappingHeld:false});assert.deepEqual(await closed,{code:0,signal:null,stderr:''});clearTimeout(timer);}};
}
async function receipt(p){return JSON.parse(await fs.readFile(path.join(p.root,'cleanup13.json'),'utf8'));}
test('four original controls retain actual Node unlink outcomes independently of the native cleanup API',async()=>{
 for(const [mode,expectedCode]of [['no-delete-share','EBUSY'],['delete-share',null],['data-map',null],['image-map','EPERM']]){
  const p=await fixture(),target=path.join(p.stage,'node.exe'),holder=await hold(p,mode),before=await fs.lstat(target,{bigint:true}),result={schema:1,kind:'World13OriginalNodeUnlinkControl',controller:process.version,mode,held:holder.held,identity:{dev:String(before.dev),ino:String(before.ino),size:String(before.size)},expectedSHA256:sha256};
  try{
   try{await fs.unlink(target);result.firstOutcome={deleted:true};}catch(error){result.firstOutcome={deleted:false,code:error.code,errno:error.errno,syscall:error.syscall};}
   assert.equal(result.firstOutcome.code??null,expectedCode);await holder.release();result.releaseAcknowledged=true;
   if(expectedCode){const after=await fs.lstat(target,{bigint:true});assert.equal(after.dev,before.dev);assert.equal(after.ino,before.ino);assert.equal(after.size,before.size);await fs.unlink(target);result.sameIdentityBeforeReleasedUnlink=true;result.releasedUnlinkDeleted=true;}
   await assert.rejects(fs.lstat(target),error=>error.code==='ENOENT');result.absenceVerified=true;
  }finally{await holder.release();await fs.writeFile(path.join(repo,'.local/cleanup13-ci-evidence','node-unlink-'+path.basename(p.root)+'.json'),JSON.stringify(result)+'\n',{flag:'wx'});}
 }
});
test('a no-delete-sharing handle separately produces actual Node EBUSY and native sharing violation; explicit release permits handle-bound cleanup',async()=>{
 const p=await fixture(),holder=await hold(p,'no-delete-share');let releases=0;
 try{
  await assert.rejects(fs.unlink(path.join(p.stage,'node.exe')),error=>error.code==='EBUSY'&&error.syscall==='unlink');
  const result=await cleanup(p,{onObservation:async attempt=>{assert.equal(attempt.code,'delete-access-sharing-violation');releases++;await holder.release();}});
  assert.equal(result.outcome,'deleted-after-recorded-busy');assert.equal(result.firstFailure.code,'delete-access-sharing-violation');assert.equal(result.firstFailure.operation,'CreateFileW');assert.equal(result.firstFailure.win32Code,32);assert.equal(result.attempts[0].operation,'handle-bound-delete');assert.equal(releases,1);assert.equal(result.attempts.length,2);assert.equal(result.attempts[1].native.deleteAccessAcquired,true);assert.equal(result.attempts[1].native.identityMatched,true);assert.equal(result.attempts[1].native.sha256Matched,true);assert.equal(result.attempts[1].native.helperJoined,true);assert.equal(result.absenceVerified,true);assert(result.elapsedMs<cleanupBudgetMs13);assert.deepEqual(await receipt(p),result);
 }finally{await holder.release();}
});
for(const mode of ['delete-share','data-map'])test('an explicitly held '+mode+' permits first-attempt cleanup',async()=>{
 const p=await fixture(),holder=await hold(p,mode);try{const result=await cleanup(p);assert.equal(result.outcome,'deleted-first-attempt');assert.equal(result.firstFailure,null);assert.equal(result.attempts.length,1);assert.equal(result.attempts[0].native.identityMatched,true);assert.equal(result.attempts[0].native.sha256Matched,true);assert.equal(result.absenceVerified,true);assert.equal(holder.held.mappingHeld,mode==='data-map');assert.equal(holder.held.fileHandleClosed,mode==='data-map');}finally{await holder.release();}
});
test('a held image mapping produces EPERM after file-handle closure and fails without availability retries',async()=>{
 const p=await fixture(),holder=await hold(p,'image-map');try{await assert.rejects(fs.unlink(path.join(p.stage,'node.exe')),error=>error.code==='EPERM');await assert.rejects(cleanup(p),error=>error.code==='native-cleanup-refused');const result=await receipt(p);assert.equal(holder.held.fileHandleClosed,true);assert.equal(holder.held.mappingHeld,true);assert.equal(result.firstFailure.operation,'SetFileInformationByHandle');assert.notEqual(result.firstFailure.win32Code,0);assert.equal(result.attempts.length,1);assert.equal(result.outcome,'failed');assert.equal(result.absenceVerified,false);await fs.access(path.join(p.stage,'node.exe'));}finally{await holder.release();}
});
test('a persistent no-delete-sharing handle fails within the separate bound and retains exact copy plus all observations',async()=>{
 const p=await fixture(),holder=await hold(p,'no-delete-share');try{await assert.rejects(cleanup(p),error=>['cleanup-attempt-limit','cleanup-budget-exhausted'].includes(error.code));const result=await receipt(p);assert.equal(result.outcome,'failed');assert.equal(result.firstFailure.code,'delete-access-sharing-violation');assert.equal(result.firstFailure.operation,'CreateFileW');assert(result.attempts.length>1&&result.attempts.length<=cleanupMaximumAttempts13);for(const attempt of result.attempts){assert.equal(attempt.code,'delete-access-sharing-violation');assert.equal(attempt.native.win32Code,32);assert.equal(attempt.native.deleteAccessAcquired,false);assert.equal(attempt.native.dispositionAttempted,false);assert.equal(attempt.native.helperJoined,true);assert.deepEqual(attempt.observed,result.attempts[0].observed);}assert.equal(await fs.readFile(path.join(p.stage,'node.exe')).then(b=>createHash('sha256').update(b).digest('hex')),sha256);assert.equal(result.absenceVerified,false);}finally{await holder.release();}
});
test('identity drift after a recorded sharing violation fails before a subsequent mutation and retains the changed copy',async()=>{
 const p=await fixture(),holder=await hold(p,'no-delete-share');try{await assert.rejects(cleanup(p,{onObservation:async()=>{await holder.release();await fs.appendFile(path.join(p.stage,'node.exe'),Buffer.from([1]));}}),error=>error.code==='owned-runtime-identity-drift');const result=await receipt(p);assert.equal(result.firstFailure.code,'delete-access-sharing-violation');assert.equal(result.attempts.length,1);assert.equal(result.outcome,'failed');assert.equal((await fs.stat(path.join(p.stage,'node.exe'))).size,bytes.length+1);}finally{await holder.release();}
});
test('cleanup refuses unverified execution joins and records that no deletion was attempted',async()=>{
 const p=await fixture();await assert.rejects(cleanup(p,{execution:{supervisorJoined:true,workerJoined:false,profileDeletionVerified:true}}),/completed owned execution joins/);const result=await receipt(p);assert.equal(result.outcome,'failed');assert.equal(result.attempts.length,0);await fs.access(path.join(p.stage,'node.exe'));
});
test('cleanup rejects content drift and repeated use while preserving its first failed receipt',async()=>{
 const p=await fixture();await fs.appendFile(path.join(p.stage,'node.exe'),Buffer.from([1]));await assert.rejects(cleanup(p),error=>error.code==='owned-runtime-identity-drift');const original=await receipt(p);await assert.rejects(cleanup(p),/already consumed/);assert.deepEqual(await receipt(p),original);assert.equal(original.attempts.length,0);
});
test('native handle-bound disposition refuses an incorrect inode, last-write time and content digest',async()=>{
 const p=await fixture(),target=path.join(p.stage,'node.exe'),info=await fs.lstat(target,{bigint:true});
 for(const [ino,mtimeNs,digest]of [[info.ino+1n,info.mtimeNs,sha256],[info.ino,info.mtimeNs+100n,sha256],[info.ino,info.mtimeNs,'0'.repeat(64)]]){
  const child=spawn(helper,['delete-bound',target,String(info.dev),String(ino),String(info.size),String(mtimeNs),digest],{windowsHide:true,stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',b=>stderr+=b);const timer=setTimeout(()=>child.kill(),2000),code=await new Promise(resolve=>child.once('close',resolve));clearTimeout(timer);assert.equal(code,1);assert.match(stderr,/expected (identity|content) drift/);assert.deepEqual(await fs.readFile(target),bytes);
 }
});
test('omitted join evidence cannot claim no launch when a native consumed marker or result directory exists',async()=>{
 for(const name of ['consumed','result']){const p=await fixture();if(name==='result')await fs.mkdir(path.join(p.root,name));else await fs.writeFile(path.join(p.root,name),'original marker',{flag:'wx'});await assert.rejects(cleanup(p),error=>error.code==='unverified-execution-exists');const result=await receipt(p);assert.equal(result.outcome,'failed');assert.equal(result.attempts.length,0);await fs.access(path.join(p.stage,'node.exe'));}
});
test('a same-content runtime replacement before cleanup fails the preparation-time identity binding',async()=>{
 const p=await fixture(),target=path.join(p.stage,'node.exe');await fs.rename(target,path.join(p.stage,'retained-original.exe'));await fs.writeFile(target,bytes,{flag:'wx'});await assert.rejects(cleanup(p),error=>error.code==='owned-runtime-identity-drift');const result=await receipt(p);assert.equal(result.attempts.length,0);assert.equal(result.outcome,'failed');assert.deepEqual(await fs.readFile(target),bytes);assert.deepEqual(await fs.readFile(path.join(p.stage,'retained-original.exe')),bytes);
});
test('an explicitly held availability observation exhausts the fixed cleanup budget without relaunch or deletion',async()=>{
 const p=await fixture(),holder=await hold(p,'no-delete-share');try{await assert.rejects(cleanup(p,{onObservation:()=>delay(cleanupBudgetMs13+10)}),error=>error.code==='cleanup-budget-exhausted');const result=await receipt(p);assert.equal(result.firstFailure.operation,'CreateFileW');assert.equal(result.firstFailure.win32Code,32);assert.equal(result.attempts.length,1);assert.equal(result.outcome,'failed');assert(result.elapsedMs>=cleanupBudgetMs13);assert.equal(result.absenceVerified,false);await fs.access(path.join(p.stage,'node.exe'));const publication=JSON.parse(await fs.readFile(path.join(p.root,'cleanup13-publication.json'),'utf8'));assert.equal(publication.cleanupOutcome,'failed');assert.equal(publication.cleanupAcceptanceElapsedMs,result.elapsedMs);assert(publication.elapsedThroughBothReceiptPublicationsMs>=result.elapsedMs);assert(publication.localReceiptPublicationMs>=0&&publication.sanitizedReceiptPublicationMs>=0);}finally{await holder.release();}
});
