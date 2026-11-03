// Offline outer-attempt contract. This module opens ONLY its own result files.
// Fixture callbacks do not receive file handles, key material or an IO adapter.
// It cannot authorize or execute a protected installation/private-input test.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {byteDigest,canonical,decodeCanonical,digest,fields,freeze,identifier,requireWorld} from './contracts.mjs';
import {boundedStartupMetadata06} from './startup-catalogue06.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url)),plans=new WeakMap(),gates=new WeakMap(),attempted=new WeakSet();
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const validationPhases09=freeze([
 {id:'initialization-metadata',readerInvocations:1,maximumReadBytes:8388608},
 {id:'placements',readerInvocations:1,maximumReadBytes:16777216},
 {id:'collision',readerInvocations:1,maximumReadBytes:16777216},
 {id:'admission',readerInvocations:0,maximumReadBytes:0},
 {id:'tile',readerInvocations:0,maximumReadBytes:0},
 {id:'cache-reuse',readerInvocations:0,maximumReadBytes:0},
 {id:'soundmap',readerInvocations:0,maximumReadBytes:0}
]);
export const validationSessionLimits09=freeze({planBytes:65536,closureEntries:32,artifactBytes:65536,phaseWorkMs:30000,totalWorkMs:120000,totalReadBytes:41943040,totalOutputBytes:458752,callbackJoinMs:100});
const gateBefore=new Set(['placements','collision','admission']);
function exact(o,keys){fields(o,keys);requireWorld(keys.every(k=>Object.hasOwn(o,k)),'complete validation fields');}
function list(value,maximum){requireWorld(Array.isArray(value)&&value.length<=maximum,'bounded validation list');}
function ids(value,known){list(value,32);requireWorld(new Set(value).size===value.length&&value.every(id=>typeof id==='string'&&known.has(id)),'exact declared validation inputs');}
function closure09(value){
 list(value,validationSessionLimits09.closureEntries);const known=new Set();
 for(const entry of value){
  exact(entry,['id','sourceId','operation','path','offset','bytes','sha256','identitySHA256']);identifier(entry.id);identifier(entry.sourceId);
  requireWorld(!known.has(entry.id)&&['initialize','metadata','ymap','ytyp','ybn'].includes(entry.operation),'unique validation range operation');known.add(entry.id);
  requireWorld(typeof entry.path==='string'&&entry.path.length>0&&entry.path.length<=512&&!/[\x00-\x1f\x7f]/.test(entry.path)&&Number.isSafeInteger(entry.offset)&&entry.offset>=0&&Number.isSafeInteger(entry.bytes)&&entry.bytes>0&&entry.bytes<=16777216&&Number.isSafeInteger(entry.offset+entry.bytes)&&hex(entry.sha256)&&hex(entry.identitySHA256),'exact validation source path/range/hash identity');
 }
 return known;
}
export function pinValidationSessionPlan09(bytes,{expectedSHA256}={}){
 requireWorld(Buffer.isBuffer(bytes)&&bytes.length<=validationSessionLimits09.planBytes&&hex(expectedSHA256)&&byteDigest(bytes)===expectedSHA256,'independently pinned validation plan');
 const p=decodeCanonical(bytes,validationSessionLimits09.planBytes);
 exact(p,['schema','kind','candidateId','sourceAuthority','proposalSHA256','accessReviewSHA256','runtimeSHA256','closure','phases','totals','missingPrerequisites']);
 requireWorld(p.schema===1&&p.kind==='RichAudioValidationSession09'&&/^[a-f0-9]{32}$/.test(p.candidateId)&&['original-authored-fixture','future-protected-read-only'].includes(p.sourceAuthority)&&[p.proposalSHA256,p.accessReviewSHA256,p.runtimeSHA256].every(hex),'validation identity and authority');
 list(p.missingPrerequisites,16);requireWorld(p.missingPrerequisites.every(s=>typeof s==='string'&&s.length>0&&s.length<=160),'bounded missing validation prerequisites');
 const known=closure09(p.closure);list(p.phases,7);requireWorld(p.phases.length===validationPhases09.length,'one exact finite validation phase schedule');
 let workMs=0,readBytes=0,outputBytes=0,readerInvocations=0;
 for(let i=0;i<p.phases.length;i++){
  const phase=p.phases[i],fixed=validationPhases09[i];exact(phase,['id','inputs','workMs','readBytes','outputBytes','readerInvocations']);
  requireWorld(phase.id===fixed.id&&phase.readerInvocations===fixed.readerInvocations&&Number.isInteger(phase.workMs)&&phase.workMs>0&&phase.workMs<=validationSessionLimits09.phaseWorkMs&&Number.isInteger(phase.readBytes)&&phase.readBytes>=0&&phase.readBytes<=fixed.maximumReadBytes&&Number.isInteger(phase.outputBytes)&&phase.outputBytes>0&&phase.outputBytes<=validationSessionLimits09.artifactBytes,'fixed finite validation phase budgets');ids(phase.inputs,known);
  const operations=new Set(p.closure.filter(c=>phase.inputs.includes(c.id)).map(c=>c.operation));
  // Each actual reader starts Core again: explicitly reserve its repeated
  // initialization/directory reads. The final collision run may reread the
  // frozen YMAP/YTYP so EXISTING provider admission receives one joined batch.
  requireWorld(phase.id==='initialization-metadata'?operations.has('metadata')&&[...operations].every(x=>['initialize','metadata'].includes(x)):phase.id==='placements'?operations.has('ymap')&&operations.has('ytyp')&&[...operations].every(x=>['initialize','metadata','ymap','ytyp'].includes(x)):phase.id==='collision'?operations.has('ybn')&&[...operations].every(x=>['initialize','metadata','ymap','ytyp','ybn'].includes(x)):phase.inputs.length===0,'phase cannot silently acquire another source kind');
  requireWorld(phase.readBytes>=p.closure.filter(c=>phase.inputs.includes(c.id)).reduce((n,c)=>n+c.bytes,0),'phase reserves its entire exact input closure before callbacks');
  workMs+=phase.workMs;readBytes+=phase.readBytes;outputBytes+=phase.outputBytes;readerInvocations+=phase.readerInvocations;
 }
 exact(p.totals,['workMs','readBytes','outputBytes','readerInvocations']);
 requireWorld(canonical(p.totals)===canonical({workMs,readBytes,outputBytes,readerInvocations})&&workMs<=validationSessionLimits09.totalWorkMs&&readBytes<=validationSessionLimits09.totalReadBytes&&outputBytes<=validationSessionLimits09.totalOutputBytes&&readerInvocations===3,'exact aggregate validation budgets');
 const token=freeze({kind:'PinnedValidationSession09',planSHA256:expectedSHA256});plans.set(token,freeze(p));return token;
}
export function pinValidationGate09(bytes,{expectedSHA256}={}){
 requireWorld(Buffer.isBuffer(bytes)&&bytes.length<=4096&&hex(expectedSHA256)&&byteDigest(bytes)===expectedSHA256,'independently pinned validation gate');const g=decodeCanonical(bytes,4096);
 exact(g,['schema','kind','purpose','candidateId','planSHA256','beforePhase','afterArtifactSHA256','closureSHA256','reviewSHA256','explicitApprovalSHA256']);
 requireWorld(g.schema===1&&g.kind==='RichAudioValidationGate09'&&g.purpose==='original-fixture-contract-only'&&/^[a-f0-9]{32}$/.test(g.candidateId)&&gateBefore.has(g.beforePhase)&&[g.planSHA256,g.afterArtifactSHA256,g.closureSHA256,g.reviewSHA256,g.explicitApprovalSHA256].every(hex),'separate exact review and explicit approval gate; no elapsed approval');
 const token=freeze({kind:'PinnedValidationGate09',gateSHA256:expectedSHA256});gates.set(token,freeze(g));return token;
}
export function validationSessionStatus09(token){
 const plan=plans.get(token);requireWorld(plan,'branded validation plan');
 return freeze({planSHA256:token.planSHA256,sourceAuthority:plan.sourceAuthority,canExecute:plan.sourceAuthority==='original-authored-fixture'&&plan.missingPrerequisites.length===0,protectedAccessAvailable:false,missingPrerequisites:[...plan.missingPrerequisites],phaseCount:plan.phases.length,totals:{...plan.totals}});
}
async function noLinks(directory){for(let at=directory;;at=path.dirname(at)){requireWorld(!(await fs.lstat(at)).isSymbolicLink(),'owned validation result path cannot follow links');if(at===path.dirname(at))break;}}
async function createNew(directory,name,value){const file=path.join(directory,name),bytes=Buffer.from(canonical(value)),handle=await fs.open(file,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}return byteDigest(bytes);}
function closureFor(plan,phase){return plan.closure.filter(c=>phase.inputs.includes(c.id));}
function pending(phase,closure,reason,afterArtifactSHA256=null){return {beforePhase:phase.id,reason,afterArtifactSHA256,closureSHA256:digest(closure),requestedClosure:closure,newCandidateAndExplicitApprovalRequired:true,elapsedTimeCanApprove:false};}
async function invokeFixture(callback,context,workMs){
 const controller=new AbortController(),started=performance.now();let timer,joinTimer;
 const settled=Promise.resolve().then(()=>callback({...context,signal:controller.signal})).then(value=>({settled:true,value}),()=>({settled:true,failed:true}));
 try{
  const first=await Promise.race([settled,new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({deadline:true});},workMs);})]);
  if(!first.deadline){
   // A synchronous callback or a promise microtask can prevent the timer from
   // running. Qualification still rejects its settled result by measured wall
   // time; JavaScript cannot preempt the blocked callback at the deadline.
   const elapsedMs=performance.now()-started,deadline=elapsedMs>=workMs;if(deadline)controller.abort();
   return {...first,deadline,elapsedMs,deadlineBasis:deadline?'measured-settlement-over-budget':null};
  }
  const joined=await Promise.race([settled,new Promise(resolve=>{joinTimer=setTimeout(()=>resolve({settled:false}),validationSessionLimits09.callbackJoinMs);})]);return {...joined,deadline:true,elapsedMs:performance.now()-started,deadlineBasis:'timer-expiry'};
 }finally{clearTimeout(timer);clearTimeout(joinTimer);}
}
export async function runValidationSession09(token,options={}){
 const plan=plans.get(token);requireWorld(plan&&!attempted.has(token),'single-use branded outer validation attempt');attempted.add(token);
 const status=validationSessionStatus09(token);requireWorld(status.canExecute,'protected/private validation remains unsealed; fixture callbacks only');
 // No user callback, source/capability staging, runtime loading or input-file IO
 // occurs before this durable create-new marker. Its path depends only on the
 // pinned candidate ID, so a freshly pinned copy cannot reuse the attempt.
 const local=path.join(repo,'.local');await fs.mkdir(local,{recursive:true});await noLinks(local);
 const directory=path.join(local,'world09-session-'+plan.candidateId);await fs.mkdir(directory,{recursive:false});await noLinks(directory);
 const marker={schema:1,kind:'ConsumedValidationSession09',candidateId:plan.candidateId,planSHA256:token.planSHA256,proposalSHA256:plan.proposalSHA256,accessReviewSHA256:plan.accessReviewSHA256,runtimeSHA256:plan.runtimeSHA256,closureSHA256:digest(plan.closure),totals:plan.totals,retryAllowed:false};
 const markerSHA256=await createNew(directory,'consumed.json',marker),receipts=[];let state='failed',reason='invalid-fixture-callback-contract',pendingGate=null,phaseFailure=null,callbackJoined=true;
 const finish=async()=>{const result=freeze({schema:1,kind:'RichAudioValidationSessionResult09',candidateId:plan.candidateId,planSHA256:token.planSHA256,markerSHA256,state,reason,pendingGate,phaseFailure,callbackJoined,phases:receipts,consumed:true,retryAllowed:false,sourceAuthority:plan.sourceAuthority,protectedInputsRead:false,installedWorldVerified:false,genuineCollisionQualified:false,gameLaunched:false,endpointOpened:false,providerOrCacheReplaced:false});await createNew(directory,'result.json',result);return result;};
 try{
  requireWorld(options&&Object.getPrototypeOf(options)===Object.prototype,'plain original fixture execution options');
  const callbackDescriptor=Object.getOwnPropertyDescriptor(options,'callbacks'),gateDescriptor=Object.getOwnPropertyDescriptor(options,'approvalGates');
  requireWorld(callbackDescriptor&&Object.hasOwn(callbackDescriptor,'value')&&(!gateDescriptor||Object.hasOwn(gateDescriptor,'value')),'data-only fixture options after consumption');
  const suppliedCallbacks=callbackDescriptor.value,suppliedGates=gateDescriptor?.value??[],callbacks=Object.create(null),gateBodies=[];
  requireWorld(suppliedCallbacks&&Object.getPrototypeOf(suppliedCallbacks)===Object.prototype&&Reflect.ownKeys(suppliedCallbacks).length===validationPhases09.length,'exact original fixture callbacks');
  for(const {id} of validationPhases09){const descriptor=Object.getOwnPropertyDescriptor(suppliedCallbacks,id);requireWorld(descriptor?.enumerable&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='function','data-only original fixture callback');callbacks[id]=descriptor.value;}
  Object.freeze(callbacks);
  list(suppliedGates,3);const gateCount=Object.getOwnPropertyDescriptor(suppliedGates,'length')?.value;
  requireWorld(Object.getPrototypeOf(suppliedGates)===Array.prototype&&Number.isInteger(gateCount)&&Reflect.ownKeys(suppliedGates).length===gateCount+1,'dense data-only gate token array');
  for(let i=0;i<gateCount;i++){const descriptor=Object.getOwnPropertyDescriptor(suppliedGates,String(i));requireWorld(descriptor?.enumerable&&Object.hasOwn(descriptor,'value')&&gates.has(descriptor.value),'separately pinned gate token data');gateBodies.push(gates.get(descriptor.value));}
  const approvalGates=Object.freeze(gateBodies);
  let previousArtifact=null,previousReceiptSHA256=markerSHA256;
  for(const phase of plan.phases){
   const closure=closureFor(plan,phase),closureSHA256=digest(closure);
   if(gateBefore.has(phase.id)){
    const accepted=approvalGates.find(g=>g.candidateId===plan.candidateId&&g.planSHA256===marker.planSHA256&&g.beforePhase===phase.id&&g.afterArtifactSHA256===previousArtifact&&g.closureSHA256===closureSHA256);
    if(!accepted){state='pendingGate';reason='exact-internal-freeze-review-and-explicit-approval-required';pendingGate=pending(phase,closure,reason,previousArtifact);return await finish();}
   }
   const started=performance.now(),execution=await invokeFixture(callbacks[phase.id],freeze({phase,planSHA256:token.planSHA256,closure,closureSHA256,previousReceiptSHA256}),phase.workMs);callbackJoined=execution.settled;
   const settledElapsedMs=performance.now()-started;
   if(execution.deadline||settledElapsedMs>=phase.workMs){state='failed';reason=callbackJoined?'phase-deadline-exceeded-joined':'phase-deadline-exceeded-callback-unjoined';phaseFailure=freeze({phase:phase.id,workMs:phase.workMs,elapsedMs:settledElapsedMs,callbackJoined,deadlineBasis:execution.deadlineBasis??'measured-settlement-over-budget',hardPreemptionAvailable:false});return await finish();}
   requireWorld(!execution.failed,'original fixture callback failed');
   const output=decodeCanonical(boundedStartupMetadata06(execution.value,phase.outputBytes),phase.outputBytes);
   exact(output,['kind','phase','planSHA256','closureSHA256','readBytes','readerInvocations','joined','artifactSHA256','discoveredClosure','qualified']);
   requireWorld(output.kind==='OriginalValidationPhase09'&&output.phase===phase.id&&output.planSHA256===token.planSHA256&&output.closureSHA256===closureSHA256&&output.joined===true&&typeof output.qualified==='boolean'&&hex(output.artifactSHA256)&&Number.isInteger(output.readBytes)&&output.readBytes>=0&&output.readBytes<=phase.readBytes&&output.readerInvocations===phase.readerInvocations,'fixture phase identity, joins and reserved budgets');closure09(output.discoveredClosure);
   const outside=output.discoveredClosure.filter(c=>!plan.closure.some(p=>canonical(p)===canonical(c)));
   const receipt=freeze({phase:phase.id,closureSHA256,artifactSHA256:output.artifactSHA256,outputSHA256:digest(output),previousReceiptSHA256,readBytes:output.readBytes,readerInvocations:output.readerInvocations,elapsedMs:performance.now()-started,qualified:output.qualified,joined:true});
   previousReceiptSHA256=await createNew(directory,'phase-'+phase.id+'.json',receipt);receipts.push(freeze({...receipt,receiptSHA256:previousReceiptSHA256}));previousArtifact=output.artifactSHA256;
   if(outside.length){state='pendingGate';reason='new-source-path-range-or-hash-requires-new-reviewed-candidate';pendingGate=pending(phase,outside,reason,previousArtifact);return await finish();}
   if(!output.qualified){state='unqualified';reason='fixture-phase-unqualified';return await finish();}
  }
  state='completed-original-fixture';reason=null;return await finish();
 }catch{reason='fixture-contract-or-owned-result-failure';return await finish();}
}
