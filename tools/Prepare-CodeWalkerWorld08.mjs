// Integrated prelaunch control host. An exact independently supplied plan is
// required; it never discovers keys, launches GTA or opens an audio endpoint.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {constants} from 'node:fs';
import {prepareProviderProcess08,runProviderProcess08} from '../src/acoustics/world/provider-supervisor08.mjs';
import {buildProviderCatalogue08,admitProviderCatalogue08,pinOriginalArchiveEvidence08,createProviderStartup08,providerPreparationStatus08,bindNativeReviewToRun08} from '../src/acoustics/world/codewalker-provider08.mjs';
import {pinNativeReview08,nativeConversionWitness08} from '../src/acoustics/world/native-evidence08.mjs';
import {StartupCheckpointStore06} from '../src/acoustics/world/startup-checkpoint06.mjs';
import {StartupTileStoreRouter06} from '../src/acoustics/world/startup-tile-store06.mjs';
import {boundedStartupMetadata06} from '../src/acoustics/world/startup-catalogue06.mjs';
import {byteDigest,requireWorld,freeze} from '../src/acoustics/world/contracts.mjs';
import {startPrelaunchProgress08} from './prelaunch08.mjs';

export async function prepareCodeWalkerWorld08({processOptions,materialTable,fixtureEvidence,nativeAdmissions=[],nativeReviews=[],cacheRoot,session,trustedCheckpointSHA256=null,signal,onProgress=()=>{}}={}){
 requireWorld(typeof cacheRoot==='string'&&path.isAbsolute(cacheRoot)&&/^[a-f0-9]{32}$/.test(session),'explicit preparation cache/session');
 let latest={stage:'discovering-resources',percent:null,readiness:'not-ready',loading:{text:'Discovering acoustic resources…',percent:null},provider:{stage:'starting-companion',completed:0,total:null,unknownCount:null}},coordinator=null,router=null;
 const emit=()=>{try{onProgress(freeze(structuredClone(latest)));}catch{}};emit();
 const prepared=await prepareProviderProcess08(processOptions),run=await runProviderProcess08(prepared,{signal,onProgress:p=>{latest={...latest,provider:{...p,unknownCount:p.unknownCount??null}};emit();}});
 if(run.state!=='completed'){latest={...latest,stage:run.state,readiness:'not-ready'};emit();return {run,provider:null,coordinator:null,result:null,status:()=>latest,close:async()=>{}};}
 const admissions=[...nativeAdmissions,...nativeReviews.map(r=>bindNativeReviewToRun08({run,conversion:r.conversion,reviewPolicy:r.reviewPolicy}))];
 const provider=admissions.length?admitProviderCatalogue08({run,admissions}):buildProviderCatalogue08({run,materialTable,fixtureEvidence});
 if(!provider.catalogue){latest=providerPreparationStatus08(provider);emit();return {run,provider,coordinator:null,result:null,status:()=>latest,close:async()=>{}};}
 const local=path.join(cacheRoot,'.local');await fs.mkdir(path.join(local,'checkpoint'),{recursive:true});await fs.mkdir(path.join(local,'tiles'),{recursive:true});
 const checkpoint=new StartupCheckpointStore06({root:cacheRoot,directory:path.join(local,'checkpoint')});router=new StartupTileStoreRouter06({root:cacheRoot,directory:path.join(local,'tiles')});
 coordinator=createProviderStartup08({provider,checkpoint,storeForPage:async()=>router,session,trustedCheckpointSHA256,onProgress:()=>{latest=providerPreparationStatus08(provider,coordinator);emit();}});
 const close=async()=>{const errors=[];try{await coordinator.close();}catch(error){errors.push(error);}try{await router.close();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Preparation control/cache closure failed');};
 try{const result=await coordinator.run({signal,budgetMilliseconds:3600000});latest=providerPreparationStatus08(provider,coordinator);emit();return {run,provider,coordinator,result,status:()=>latest,close};}catch(error){await close();throw error;}
}
async function readInput(file,{bytes,sha256,maximum=33554432}={}){
 requireWorld(typeof file==='string'&&path.isAbsolute(file),'exact absolute planned source file');requireWorld(Number.isSafeInteger(maximum)&&maximum>0&&maximum<=33554432&&Number.isSafeInteger(bytes)&&bytes>0&&bytes<=maximum&&typeof sha256==='string'&&/^[a-f0-9]{64}$/.test(sha256),'bounded planned input allocation');for(let at=file;;at=path.dirname(at)){requireWorld(!(await fs.lstat(at)).isSymbolicLink(),'planned source link refused');if(at===path.dirname(at))break;}
 const before=await fs.lstat(file);requireWorld(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1,'regular planned source');const h=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const s=await h.stat();requireWorld(s.isFile()&&s.nlink===1&&s.size===bytes&&s.size<=maximum&&s.ino===before.ino&&s.dev===before.dev&&s.mtimeMs===before.mtimeMs,'bounded exact planned source');const data=Buffer.alloc(bytes+1);let used=0;for(;;){const r=await h.read(data,used,data.length-used,used);used+=r.bytesRead;if(!r.bytesRead||used===data.length)break;}const after=await h.stat(),current=await fs.lstat(file);requireWorld(used===bytes&&after.isFile()&&after.nlink===1&&after.ino===s.ino&&after.dev===s.dev&&after.size===s.size&&after.mtimeMs===s.mtimeMs&&current.isFile()&&!current.isSymbolicLink()&&current.nlink===1&&current.ino===s.ino&&current.dev===s.dev&&current.size===s.size&&current.mtimeMs===s.mtimeMs&&byteDigest(data.subarray(0,used))===sha256,'planned source changed or digest differs');for(let at=file;;at=path.dirname(at)){requireWorld(!(await fs.lstat(at)).isSymbolicLink(),'planned source link after read');if(at===path.dirname(at))break;}return data.subarray(0,used);}finally{await h.close();}
}
export async function runPreparationPlan08(plan,{showUi=true,signal}={}){
 boundedStartupMetadata06(plan,1048576);requireWorld(plan?.schema===1&&plan.kind==='RichAudioPreparationPlan08'&&Array.isArray(plan.inputs)&&plan.inputs.length<=10&&Array.isArray(plan.nativeReviews)&&plan.nativeReviews.length<=256,'bounded externally pinned preparation plan');
 let plannedBytes=0;for(const item of plan.inputs){requireWorld(Number.isSafeInteger(item.bytes)&&item.bytes>0&&item.bytes<=33554432&&(item.maximum===undefined||Number.isSafeInteger(item.maximum)&&item.maximum>0&&item.maximum<=33554432)&&(plannedBytes+=item.bytes)<=33554432,'bounded planned source aggregate before reads');}
 const inputs=[];for(const input of plan.inputs)inputs.push({path:input.path,bytes:await readInput(input.file,input)});
 const fixtureEvidence=plan.fixtureEvidence?pinOriginalArchiveEvidence08(Buffer.from(plan.fixtureEvidence.base64,'base64'),{expectedSHA256:plan.fixtureEvidence.sha256}):undefined;
 const nativeReviews=plan.nativeReviews.map(r=>({conversion:nativeConversionWitness08(r.conversion??r.witness),reviewPolicy:pinNativeReview08(Buffer.from(r.policyBase64,'base64'),{expectedSHA256:r.policySHA256})}));
 const controller=new AbortController(),abort=()=>controller.abort();if(signal){if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});}
 let state={stage:'discovering-resources',percent:null,readiness:'not-ready',loading:{text:'Discovering acoustic resources…',percent:null}},pipeline=null,ui=null;
 try{if(showUi){ui=await startPrelaunchProgress08({readStatus:()=>state,cancel:abort,continuePartially:()=>pipeline?.coordinator?.continuePartially()});process.stdout.write('RichAudio preparation UI: '+ui.url+'\n');}
  pipeline=await prepareCodeWalkerWorld08({processOptions:{packageRoot:plan.packageRoot,request:plan.request,inputs,directSources:plan.directSources??[],workingRoot:plan.cacheRoot},materialTable:plan.materialTable,fixtureEvidence,nativeReviews,cacheRoot:plan.cacheRoot,session:plan.session,trustedCheckpointSHA256:plan.trustedCheckpointSHA256??null,signal:controller.signal,onProgress:p=>{state=p;}});
  return {state:pipeline.result?.readiness??pipeline.run.state,checkpointSHA256:pipeline.result?.checkpointSHA256??null,providerState:pipeline.provider?.state??null,completedEligibleTiles:pipeline.result?.completedEligibleTiles??0,installedWorldVerified:false,gameLaunched:false,endpointOpened:false};
 }finally{if(signal)signal.removeEventListener('abort',abort);const results=await Promise.allSettled([Promise.resolve().then(()=>pipeline?.close()),Promise.resolve().then(()=>ui?.close())]);const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason);if(errors.length)throw new AggregateError(errors,'Preparation/UI closure failed');}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);requireWorld(args.length===4&&args[0]==='--plan'&&args[2]==='--sha256'&&/^[a-f0-9]{64}$/.test(args[3]),'Use --plan <exact reviewed JSON plan> --sha256 <independent plan hash>');const p=path.resolve(args[1]),s=await fs.lstat(p);requireWorld(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size<=1048576,'regular bounded plan');const bytes=await readInput(p,{bytes:s.size,sha256:args[3],maximum:1048576}),plan=JSON.parse(bytes.toString('utf8'));boundedStartupMetadata06(plan,1048576);process.stdout.write(JSON.stringify(await runPreparationPlan08(plan))+'\n');}
 catch(error){process.stderr.write(String(error.message)+'\n');process.exitCode=1;}
}
