// Fixture-only cleanup after the unchanged supervised execution has completed.
// Each actual native API outcome is retained. Historical Node unlink EBUSY and
// controlled Node observations stay separate; no Win32 error is called Node EBUSY.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const repo=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const cleanupBudgetMs13=2000,cleanupPollMs13=25,cleanupMaximumAttempts13=16;
const recordMaximumBytes=16384,consumed=new Set();
function need(ok,reason){if(!ok)throw Error(reason);}
async function noLinks(file){for(let at=path.resolve(file);;at=path.dirname(at)){const s=await fs.lstat(at);need(!s.isSymbolicLink(),'linked cleanup path refused');if(at===path.dirname(at))break;}}
function id(s){return {dev:String(s.dev),ino:String(s.ino),size:String(s.size),mtimeNs:String(s.mtimeNs)};}
function same(a,b){return ['dev','ino','size','mtimeNs'].every(k=>a[k]===b[k]);}
async function identity(target){await noLinks(target);const s=await fs.lstat(target,{bigint:true});need(s.isFile()&&s.nlink===1n&&s.size>0n&&s.size<=134217728n,'bounded single-link owned runtime required');return id(s);}
async function hash(file,maximum=134217728){const handle=await fs.open(file,'r');try{const s=await handle.stat();need(s.isFile()&&s.nlink===1&&s.size>0&&s.size<=maximum,'bounded cleanup artifact required');const digest=createHash('sha256'),buffer=Buffer.alloc(65536);let total=0;for(;;){const read=await handle.read(buffer,0,buffer.length,null);if(!read.bytesRead)break;total+=read.bytesRead;need(total<=maximum,'cleanup artifact grew');digest.update(buffer.subarray(0,read.bytesRead));}need(total===s.size,'cleanup artifact changed length');return digest.digest('hex');}finally{await handle.close();}}
function failure(code,details={}){return Object.assign(Error('Owned runtime cleanup failed: '+code),{code,...details});}
async function boundDelete(helper,target,expected,deadline){
 const child=spawn(helper,['delete-bound',target,expected.dev,expected.ino,expected.size,expected.mtimeNs,expected.sha256],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR}});
 let stdout='',stderr='',overLimit=false,expired=false,error=null;
 const remainingMs=deadline-performance.now(),timer=setTimeout(()=>{expired=true;child.kill();},Math.max(1,Math.floor(remainingMs)));
 for(const [stream,name]of [[child.stdout,'stdout'],[child.stderr,'stderr']])stream.on('data',b=>{if(Buffer.byteLength(name==='stdout'?stdout:stderr)+b.length>4096){overLimit=true;child.kill();}else if(name==='stdout')stdout+=b;else stderr+=b;});
 const joined=await new Promise(resolve=>{child.once('error',e=>{error=e.code??'spawn-error';});child.once('close',(code,signal)=>resolve({code,signal}));});clearTimeout(timer);
 if(expired)throw failure('cleanup-budget-exhausted',{helperJoined:true});
 if(overLimit||error||joined.code!==0||stderr)throw failure('native-cleanup-refused',{helperJoined:true,nativeFailure:error??(stderr.includes('drift')?'identity-or-content-drift':'native-refused')});
 let result;try{result=JSON.parse(stdout);}catch{throw failure('native-cleanup-record-invalid',{helperJoined:true});}
 need(['deleted','unavailable','disposition-failed'].includes(result.state)&&Number.isInteger(result.win32Code),'native cleanup outcome required');return {...result,helperJoined:true};
}
export async function createRuntimeCleanup13({helper,evidenceDirectory=path.join(repo,'.local/cleanup13-ci-evidence')}={}){
 need(typeof helper==='string','explicit original cleanup fixture helper required');await noLinks(helper);
 const buildFile=path.join(path.dirname(helper),'build.json');await noLinks(buildFile);const buildBytes=await fs.readFile(buildFile);need(buildBytes.length<=4096,'bounded original cleanup build receipt');const build=JSON.parse(buildBytes);
 need(build.kind==='World13OriginalRuntimeCleanupFixtureBuild'&&build.syntheticOnly===true&&build.exeSHA256===await hash(helper,1048576)&&build.sourceSHA256===await hash(path.join(repo,'tests/fixtures/RuntimeCleanup13.cs'),65536),'original cleanup helper/source/build identity required');
 const evidence=path.resolve(evidenceDirectory);need(evidence===path.join(repo,'.local/cleanup13-ci-evidence'),'literal sanitized cleanup evidence directory required');await noLinks(path.join(repo,'.local'));await fs.mkdir(evidence,{recursive:true});await noLinks(evidence);
 const preparedCopies=new WeakMap();
 function ownedTarget(prepared){const root=path.resolve(prepared.root),target=path.resolve(prepared.stage,'node.exe');need(path.dirname(root)===path.join(repo,'.local')&&/^world041-contained-[A-Za-z0-9]{6}$/.test(path.basename(root))&&target===path.join(root,'stage/node.exe'),'literal owned runtime copy required');return {root,target};}
 async function registerPreparedCopy(prepared){
  need(!preparedCopies.has(prepared),'owned runtime copy already registered');const {target}=ownedTarget(prepared),observed=await identity(target);need(/^[a-f0-9]{64}$/.test(prepared.nodeSHA256),'expected copied runtime SHA-256 required');need(await hash(target)===prepared.nodeSHA256&&same(observed,await identity(target)),'owned runtime changed during preparation binding');preparedCopies.set(prepared,{...observed,sha256:prepared.nodeSHA256});return prepared;
 }
 const discardRuntimeCopy13=async function(prepared,{execution,onObservation}={}){
  const {root,target}=ownedTarget(prepared);
  need(!consumed.has(root),'cleanup attempt already consumed');consumed.add(root);
  const start=performance.now(),record={schema:1,kind:'World13OwnedRuntimeCleanup',target:'stage/node.exe',controller:process.version,helperSHA256:build.exeSHA256,helperSourceSHA256:build.sourceSHA256,workerDeadlineMs:prepared.timeoutMs,execution:execution?{supervisorJoined:execution.supervisorJoined===true,workerJoined:execution.workerJoined===true,profileDeletionVerified:execution.profileDeletionVerified===true}:{notLaunched:true},budgetMs:cleanupBudgetMs13,pollMs:cleanupPollMs13,maximumAttempts:cleanupMaximumAttempts13,attempts:[],firstFailure:null,outcome:'failed',absenceVerified:false};let primary;
  const elapsed=()=>performance.now()-start;
  try{
   if(execution)need(execution.supervisorJoined===true&&execution.workerJoined===true&&execution.profileDeletionVerified===true,'completed owned execution joins required before runtime cleanup');
   else{
    for(const name of ['consumed','result'])try{await fs.lstat(path.join(root,name));throw failure('unverified-execution-exists');}catch(error){if(error.code!=='ENOENT')throw error;}
    record.execution={notLaunched:true,basis:'native-consumed-marker-and-result-directory-absent'};
   }
   record.expected=preparedCopies.get(prepared);need(record.expected,'runtime copy must be registered before any owned worker launch');if(!same(record.expected,await identity(target)))throw failure('owned-runtime-identity-drift');need(await hash(target)===record.expected.sha256&&same(record.expected,await identity(target)),'owned runtime content or identity drift');
   for(let index=0;index<cleanupMaximumAttempts13;index++){
    if(elapsed()>=cleanupBudgetMs13)throw failure('cleanup-budget-exhausted');
    const observed=await identity(target);if(!same(record.expected,observed))throw failure('owned-runtime-identity-drift');
    const attempt={index,operation:'handle-bound-delete',observed,startedMs:elapsed()};record.attempts.push(attempt);
    let result;try{
     await noLinks(helper);need(await hash(helper,1048576)===build.exeSHA256,'cleanup helper executable drift');
     try{await fs.lstat(helper+'.config');throw failure('native-helper-configuration-refused');}catch(error){if(error.code!=='ENOENT')throw error;}
     if(elapsed()>=cleanupBudgetMs13)throw failure('cleanup-budget-exhausted');
     result=await boundDelete(helper,target,record.expected,start+cleanupBudgetMs13);
    }catch(error){attempt.state='failed';attempt.code=error.code??'native-cleanup-refused';attempt.helperJoined=error.helperJoined??null;attempt.finishedMs=elapsed();record.firstFailure??={attempt:index,code:attempt.code,operation:'native-helper',win32Code:null};throw error;}
    attempt.native=result;attempt.state=result.state==='deleted'?'deleted':'failed';attempt.code=result.state==='unavailable'&&result.win32Code===32?'delete-access-sharing-violation':result.state==='deleted'?null:'native-cleanup-refused';
    attempt.finishedMs=elapsed();if(attempt.code!==null)record.firstFailure??={attempt:index,code:attempt.code,operation:attempt.native.operation,win32Code:attempt.native.win32Code};
    if(attempt.state==='deleted'){
     try{await fs.lstat(target);throw failure('runtime-absence-not-observed');}catch(error){if(error.code!=='ENOENT')throw error;}
     record.absenceVerified=true;if(elapsed()>=cleanupBudgetMs13)throw failure('cleanup-budget-exhausted');record.outcome=record.firstFailure?'deleted-after-recorded-busy':'deleted-first-attempt';break;
    }
    if(attempt.code!=='delete-access-sharing-violation')throw failure(attempt.code);
    if(onObservation)await onObservation(attempt);
    if(index+1>=cleanupMaximumAttempts13)throw failure('cleanup-attempt-limit');
    const remaining=cleanupBudgetMs13-elapsed();if(remaining<=cleanupPollMs13)throw failure('cleanup-budget-exhausted');
    // A sharing violation is an observed availability state, not an execution
    // failure retry. Its separately bounded polling never relaunches a worker.
    await delay(cleanupPollMs13);
   }
  }catch(error){primary=error;record.failure={code:error.code??'cleanup-precondition-refused',helperJoined:error.helperJoined??null,nativeFailure:error.nativeFailure??null};}
  record.elapsedMs=elapsed();record.elapsedMsScope='validation-hash-native-dispatch-disposition-close-polls-absence-before-terminal-publication';record.terminalEvidencePublicationExcludedFromAcceptance=true;
  const bytes=Buffer.from(JSON.stringify(record)+'\n');need(bytes.length<=recordMaximumBytes,'bounded cleanup record exceeded');
  try{
   const publicationStart=performance.now();await fs.writeFile(path.join(root,'cleanup13.json'),bytes,{flag:'wx'});const localPublished=performance.now();await fs.writeFile(path.join(evidence,path.basename(root)+'.json'),bytes,{flag:'wx'});const ciPublished=performance.now();
   const publication=Buffer.from(JSON.stringify({schema:1,kind:'World13RuntimeCleanupPublication',cleanupRecordSHA256:createHash('sha256').update(bytes).digest('hex'),controller:process.version,cleanupAcceptanceElapsedMs:record.elapsedMs,cleanupOutcome:record.outcome,localReceiptPublicationMs:localPublished-publicationStart,sanitizedReceiptPublicationMs:ciPublished-localPublished,elapsedThroughBothReceiptPublicationsMs:ciPublished-start,publicationReceiptOwnWriteExcluded:true})+'\n');
   need(publication.length<=recordMaximumBytes,'bounded publication receipt exceeded');await fs.writeFile(path.join(root,'cleanup13-publication.json'),publication,{flag:'wx'});await fs.writeFile(path.join(evidence,path.basename(root)+'-publication.json'),publication,{flag:'wx'});
  }catch(error){if(primary)throw new AggregateError([primary,error],'Cleanup and bounded evidence publication failed');throw error;}
  if(primary)throw Object.assign(primary,{cleanupRecord:record});return record;
 };
 return Object.assign(discardRuntimeCopy13,{registerPreparedCopy});
}
