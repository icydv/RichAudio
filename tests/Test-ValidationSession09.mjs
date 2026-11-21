import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {pinValidationSessionPlan09,pinValidationGate09,runValidationSession09,validationSessionStatus09,validationPhases09} from '../src/acoustics/world/validation-session09.mjs';
import {canonical,byteDigest,digest} from '../src/acoustics/world/contracts.mjs';
import {startupWorld06} from './fixtures/StartupWorld06.mjs';
import {startupHarness06} from './fixtures/StartupHarness06.mjs';
import {loadWorldCoverageInspection06,createWorldCoverageSolver06} from '../tools/soundmap/worldcoverage06.mjs';
import {prepareProviderProcess08,runProviderProcess08} from '../src/acoustics/world/provider-supervisor08.mjs';
import {pinOriginalArchiveEvidence08,buildProviderCatalogue08,createProviderStartup08} from '../src/acoustics/world/codewalker-provider08.mjs';
import {inspectProviderTile08,solveProviderInspection08} from '../tools/soundmap/provider08.mjs';
import {originalProviderRequest08} from './fixtures/ProviderWorld08.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url)),sha=s=>digest(s),pin=(fn,p)=>{const bytes=Buffer.from(canonical(p));return fn(bytes,{expectedSHA256:byteDigest(bytes)});};
function fixture(change=()=>{}){
 const candidateId=randomBytes(16).toString('hex'),closure=['metadata','ymap','ytyp','ybn'].map((operation,i)=>({id:operation,sourceId:'original',operation,path:'authored/original.rpf/'+operation,offset:i*16,bytes:16,sha256:sha(operation),identitySHA256:sha('original fixture')}));
 const phases=validationPhases09.map(p=>({id:p.id,inputs:p.id==='initialization-metadata'?['metadata']:p.id==='placements'?['ymap','ytyp']:p.id==='collision'?['ybn']:[],workMs:1000,readBytes:p.readerInvocations?64:0,outputBytes:4096,readerInvocations:p.readerInvocations}));
 const plan={schema:1,kind:'RichAudioValidationSession09',candidateId,sourceAuthority:'original-authored-fixture',proposalSHA256:sha('original proposal'),accessReviewSHA256:sha('original review'),runtimeSHA256:sha('original runtime'),closure,phases,totals:{workMs:7000,readBytes:192,outputBytes:28672,readerInvocations:3},missingPrerequisites:[]};change(plan);
 const token=pin(pinValidationSessionPlan09,plan),directory=path.join(repo,'.local','world09-session-'+candidateId),called=[];
 const callbacks=Object.fromEntries(phases.map(phase=>[phase.id,async context=>{
  const marker=JSON.parse(await fs.readFile(path.join(directory,'consumed.json'),'utf8'));assert.equal(marker.planSHA256,token.planSHA256,'durable outer marker precedes first fixture callback/input access');
  assert(Object.isFrozen(context.phase)&&Object.isFrozen(context.closure));called.push(phase.id);
  return {kind:'OriginalValidationPhase09',phase:phase.id,planSHA256:token.planSHA256,closureSHA256:context.closureSHA256,readBytes:phase.readBytes,readerInvocations:phase.readerInvocations,joined:true,artifactSHA256:sha(phase.id),discoveredClosure:[],qualified:true};
 }]));
 const approvalGates=['placements','collision','admission'].map(beforePhase=>{const i=phases.findIndex(p=>p.id===beforePhase),p=phases[i];return pin(pinValidationGate09,{schema:1,kind:'RichAudioValidationGate09',purpose:'original-fixture-contract-only',candidateId,planSHA256:token.planSHA256,beforePhase,afterArtifactSHA256:sha(phases[i-1].id),closureSHA256:digest(plan.closure.filter(c=>p.inputs.includes(c.id))),reviewSHA256:sha('independent fixture review '+beforePhase),explicitApprovalSHA256:sha('explicit fixture approval '+beforePhase)});});
 return {plan,token,directory,called,callbacks,approvalGates,async close(){const absolute=path.resolve(directory),parent=path.resolve(repo,'.local');assert.equal(path.dirname(absolute),parent);assert.match(path.basename(absolute),/^world09-session-[a-f0-9]{32}$/);await fs.rm(absolute,{recursive:true,force:true});}};
}
test('one outer consumed attempt seals exactly the finite phase schedule and never grants genuine resource authority',async()=>{
 const f=fixture();try{
  const result=await runValidationSession09(f.token,f);assert.equal(result.state,'completed-original-fixture');assert.deepEqual(f.called,validationPhases09.map(p=>p.id));assert.equal(result.phases.reduce((n,p)=>n+p.readerInvocations,0),3);assert.equal(result.genuineCollisionQualified,false);assert.equal(result.protectedInputsRead,false);assert.equal(result.providerOrCacheReplaced,false);assert.equal(result.callbackJoined,true);assert(Object.isFrozen(result.phases[0]));
  let previous=result.markerSHA256;for(const receipt of result.phases){assert.equal(receipt.previousReceiptSHA256,previous);const bytes=await fs.readFile(path.join(f.directory,'phase-'+receipt.phase+'.json'));assert.equal(byteDigest(bytes),receipt.receiptSHA256);previous=receipt.receiptSHA256;}
  await assert.rejects(runValidationSession09(f.token,f),/single-use/);const copy=pin(pinValidationSessionPlan09,f.plan);await assert.rejects(runValidationSession09(copy,f),/EEXIST/);assert.equal(f.called.length,7,'re-pinning cannot repeat a consumed candidate');
 }finally{await f.close();}
});
test('missing internal review or explicit approval stops before newly selected resource callback and remains consumed',async()=>{
 const f=fixture();try{const r=await runValidationSession09(f.token,{callbacks:f.callbacks});assert.equal(r.state,'pendingGate');assert.equal(r.pendingGate.beforePhase,'placements');assert.equal(r.pendingGate.elapsedTimeCanApprove,false);assert.equal(r.pendingGate.newCandidateAndExplicitApprovalRequired,true);assert.deepEqual(f.called,['initialization-metadata']);await assert.rejects(runValidationSession09(f.token,f),/single-use/);}finally{await f.close();}
});
test('discovered new path, changed range or changed hash cannot expand the frozen closure even with all original gate tokens',async()=>{
 for(const mutation of [c=>c.path+='-new-source',c=>c.offset++,c=>c.sha256=sha('different bytes')]){
  const f=fixture();try{const original=f.callbacks['initialization-metadata'],unreviewed=structuredClone(f.plan.closure[0]);mutation(unreviewed);f.callbacks['initialization-metadata']=async c=>({...await original(c),discoveredClosure:[unreviewed]});const r=await runValidationSession09(f.token,f);assert.equal(r.state,'pendingGate');assert.equal(r.pendingGate.reason,'new-source-path-range-or-hash-requires-new-reviewed-candidate');assert.deepEqual(r.pendingGate.requestedClosure,[unreviewed]);assert.deepEqual(f.called,['initialization-metadata']);assert(Object.isFrozen(r.pendingGate.requestedClosure[0]));}finally{await f.close();}
 }
});
test('a gate pinned for another plan or prior artifact cannot become elapsed or self-approved authority',async()=>{
 const f=fixture(),other=fixture();try{const r=await runValidationSession09(f.token,{callbacks:f.callbacks,approvalGates:other.approvalGates});assert.equal(r.state,'pendingGate');assert.equal(r.pendingGate.beforePhase,'placements');assert.deepEqual(f.called,['initialization-metadata']);}finally{await f.close();await other.close();}
});
test('fixture failure, resource overrun and unqualified geometry stop the attempt without substitution or retry',async()=>{
 for(const mode of ['throws','over-budget','not-joined','unqualified']){
  const f=fixture();try{const original=f.callbacks.collision;f.callbacks.collision=async c=>{if(mode==='throws')throw Error('sensitive private-looking text must never leak');const output=await original(c);if(mode==='over-budget')output.readBytes++;if(mode==='not-joined')output.joined=false;if(mode==='unqualified')output.qualified=false;return output;};const r=await runValidationSession09(f.token,f);assert.equal(r.state,mode==='unqualified'?'unqualified':'failed');assert(!r.reason.includes('sensitive'));assert(!f.called.includes('admission'));assert.equal(r.retryAllowed,false);assert.equal(r.consumed,true);}finally{await f.close();}
 }
});
test('deadline aborts and joins a cooperative fixture; an unjoined callback stays explicit and never advances',async()=>{
 for(const cooperative of [true,false]){
  const f=fixture(p=>{p.phases[0].workMs=5;p.totals.workMs-=995;});try{f.callbacks['initialization-metadata']=({signal})=>cooperative?new Promise(resolve=>signal.addEventListener('abort',()=>resolve(null),{once:true})):new Promise(()=>{});const r=await runValidationSession09(f.token,f);assert.equal(r.state,'failed');assert.equal(r.callbackJoined,cooperative);assert.equal(r.reason,cooperative?'phase-deadline-exceeded-joined':'phase-deadline-exceeded-callback-unjoined');assert.equal(r.phases.length,0);}finally{await f.close();}
 }
});
test('a synchronous or microtask callback settling after its work budget cannot beat the timer and qualify',async()=>{
 for(const microtask of [false,true]){
  const f=fixture(p=>{p.phases[0].workMs=5;p.totals.workMs-=995;});try{
   let signal;const block=context=>{signal=context.signal;f.called.push(context.phase.id);const started=performance.now();while(performance.now()-started<35){}return {kind:'OriginalValidationPhase09',phase:context.phase.id,planSHA256:f.token.planSHA256,closureSHA256:context.closureSHA256,readBytes:16,readerInvocations:1,joined:true,artifactSHA256:sha(context.phase.id),discoveredClosure:[],qualified:true};};
   f.callbacks['initialization-metadata']=microtask?context=>Promise.resolve().then(()=>block(context)):block;
   const result=await runValidationSession09(f.token,f);assert.equal(result.state,'failed');assert.equal(result.reason,'phase-deadline-exceeded-joined');assert.equal(result.callbackJoined,true);assert.equal(signal.aborted,true);assert.equal(result.phaseFailure.workMs,5);assert(result.phaseFailure.elapsedMs>=35);assert.equal(result.phaseFailure.deadlineBasis,'measured-settlement-over-budget');assert.equal(result.phaseFailure.hardPreemptionAvailable,false);assert.deepEqual(f.called,['initialization-metadata']);assert.equal(result.phases.length,0,'an already late result receives no qualifying phase receipt');assert.equal(result.pendingGate,null);
  }finally{await f.close();}
 }
});
test('callbacks and gate bodies are privately snapshotted before first callback can mutate caller objects',async()=>{
 const f=fixture();try{
  const original=f.callbacks['initialization-metadata'];let callbackGetterCalls=0,gateGetterCalls=0;
  f.callbacks['initialization-metadata']=async context=>{
   Object.defineProperty(f.callbacks,'placements',{enumerable:true,configurable:true,get(){callbackGetterCalls++;throw Error('mutated callback getter must never execute');}});
   f.callbacks.collision=()=>{throw Error('mutated replacement callback must never execute');};
   const suppliedGates=f.approvalGates;suppliedGates.length=0;Object.defineProperty(suppliedGates,'0',{enumerable:true,configurable:true,get(){gateGetterCalls++;throw Error('mutated gate getter must never execute');}});
   f.callbacks={};f.approvalGates=[];return original(context);
  };
  const result=await runValidationSession09(f.token,f);assert.equal(result.state,'completed-original-fixture');assert.equal(result.phases.length,7);assert.deepEqual(f.called,validationPhases09.map(p=>p.id));assert.equal(callbackGetterCalls,0);assert.equal(gateGetterCalls,0);
 }finally{await f.close();}
 const g=fixture();try{const approved=[...g.approvalGates],original=g.callbacks['initialization-metadata'];g.approvalGates.length=0;g.callbacks['initialization-metadata']=async context=>{g.approvalGates.push(...approved);return original(context);};const result=await runValidationSession09(g.token,g);assert.equal(result.state,'pendingGate');assert.equal(result.pendingGate.beforePhase,'placements');assert.deepEqual(g.called,['initialization-metadata'],'callbacks cannot insert approval into the already frozen gate snapshot');}finally{await g.close();}
});
test('callback getters and oversized outputs are rejected after consumption without getter execution',async()=>{
 const outer=fixture();try{let accessed=false;const options={get callbacks(){accessed=true;throw Error('must not run');}};const r=await runValidationSession09(outer.token,options);assert.equal(r.state,'failed');assert.equal(accessed,false);assert.equal(r.consumed,true);}finally{await outer.close();}
 const f=fixture();try{let accessed=false;Object.defineProperty(f.callbacks,'placements',{enumerable:true,get(){accessed=true;throw Error('must not run');}});const r=await runValidationSession09(f.token,f);assert.equal(r.state,'failed');assert.equal(accessed,false);assert.equal(r.consumed,true);assert.equal(f.called.length,0);}finally{await f.close();}
 const g=fixture();try{g.callbacks['initialization-metadata']=()=>({get payload(){throw Error('must not run');}});const r=await runValidationSession09(g.token,g);assert.equal(r.state,'failed');assert.equal(r.consumed,true);}finally{await g.close();}
});
test('private plans remain inspectable and non-executable even with supplied hashes and removed prerequisite labels',async()=>{
 const f=fixture(p=>{p.sourceAuthority='future-protected-read-only';p.missingPrerequisites=['private initialization source identity','native denied read/write/network qualification'];});try{const s=validationSessionStatus09(f.token);assert.equal(s.canExecute,false);assert.equal(s.protectedAccessAvailable,false);assert.equal(s.missingPrerequisites.length,2);await assert.rejects(runValidationSession09(f.token,f),/unsealed/);assert.equal(f.called.length,0);await assert.rejects(fs.stat(f.directory),e=>e.code==='ENOENT');}finally{await f.close();}
 const g=fixture(p=>p.sourceAuthority='future-protected-read-only');try{assert.equal(validationSessionStatus09(g.token).canExecute,false);}finally{await g.close();}
});
test('phase schedule, exact aggregate budgets and pinned closure cannot be silently widened',()=>{
 for(const mutation of [p=>p.phases.reverse(),p=>p.phases[1].inputs.push('ybn'),p=>p.phases[0].readerInvocations++,p=>p.totals.readBytes++,p=>p.closure[0].sha256=null,p=>p.phases[1].readBytes=16])assert.throws(()=>fixture(mutation));
});
test('the fixture coordinator can wrap existing finite cache, restart reuse and actual solver SoundMap paths without a new provider',async()=>{
 const f=fixture(p=>{for(const phase of p.phases)phase.workMs=10000;p.totals.workMs=70000;}),h=await startupHarness06(),world=startupWorld06();world.pages=world.pages.slice(0,1);let first,restart,built,inspection,solver;
 try{
  const tile=f.callbacks.tile,reuse=f.callbacks['cache-reuse'],soundmap=f.callbacks.soundmap;
  f.callbacks.tile=async c=>{first=h.create(world);built=await first.run();assert.equal(built.completedEligibleTiles,4);assert.equal(built.workersStarted,4);await first.close();return tile(c);};
  f.callbacks['cache-reuse']=async c=>{restart=h.create(world,{trustedCheckpointSHA256:built.checkpointSHA256});const r=await restart.run();assert.equal(r.cacheHits,4);assert.equal(r.workersStarted,0);return reuse(c);};
  f.callbacks.soundmap=async c=>{inspection=await loadWorldCoverageInspection06({coordinator:restart,pageId:'page-0',tileId:'declared-00',inventory:world.pages[0].inventory});assert.equal(inspection.state,'prepared-cache-hit');solver=createWorldCoverageSolver06({inspection,source:[-.4,2,.6],listener:[.4,2,.6]});assert(solver.sample.control.paths.some(p=>p.order>0));assert(solver.sample.soundMapFrame.paths.some(p=>p.order>0));assert.equal(solver.geometry.paths.length,0,'geometry display never invents solver paths');return soundmap(c);};
  const result=await runValidationSession09(f.token,f);assert.equal(result.state,'completed-original-fixture');assert.equal(result.installedWorldVerified,false);
 }finally{solver?.close();await first?.close();await restart?.close();await h.close();await f.close();}
});

const packageRoot=process.env.RICHAUDIO_PROVIDER08_PACKAGE,fixtureRoot=process.env.RICHAUDIO_PROVIDER08_FIXTURES,native=process.platform==='win32'&&packageRoot&&fixtureRoot;
test('three actual contained original reader passes retain exact closure and feed the same provider/cache/SoundMap without another reader',{skip:!native},async()=>{
 // These factory-authored inputs are independently sealed BEFORE the attempt;
 // no private input, installed archive or executable is inspected here.
 const archivePath=path.join(fixtureRoot,'original.rpf'),archive=await fs.readFile(archivePath),proofBytes=await fs.readFile(path.join(fixtureRoot,'proof.json')),proof=JSON.parse(proofBytes),build=JSON.parse(await fs.readFile(path.join(packageRoot,'provider-build08.json')));
 assert.equal(byteDigest(archive),proof.archiveSHA256);assert.equal(build.parserSHA256,proof.parserSHA256);
 const count=archive.readUInt32LE(4),names=archive.readUInt32LE(8),nameStart=16+count*16,identitySHA256=sha({factoryArchiveSHA256:proof.archiveSHA256,bytes:archive.length});
 const entry=(id,operation,offset,bytes)=>({id,sourceId:'original',operation,path:archivePath,offset,bytes,sha256:byteDigest(archive.subarray(offset,offset+bytes)),identitySHA256});
 const closure=[entry('full-fixture-binding','initialize',0,archive.length),entry('directory','metadata',0,nameStart+names)],members=new Map();
 for(let i=1;i<count;i++){const at=16+i*16,start=nameStart+archive.readUInt16LE(at),end=archive.indexOf(0,start),name=archive.toString('ascii',start,end),resource=(archive.readUIntLE(at+5,3)&0x800000)!==0,offset=(archive.readUIntLE(at+5,3)&0x7fffff)*512,bytes=resource?archive.readUIntLE(at+2,3):archive.readUInt32LE(at+8),kind=resource?name.split('.').at(-1):'metadata',id=resource?kind:'metadata-'+i;const range=entry(id,kind,offset,bytes);closure.push(range);members.set(name,range);}
 const f=fixture(p=>{p.closure=closure;for(const phase of p.phases){phase.workMs=10000;phase.readBytes=phase.readerInvocations?archive.length*4:0;phase.inputs=phase.id==='initialization-metadata'?closure.filter(c=>['initialize','metadata'].includes(c.operation)).map(c=>c.id):phase.id==='placements'?['full-fixture-binding','directory','ymap','ytyp']:phase.id==='collision'?['full-fixture-binding','directory','ymap','ytyp','ybn']:[];}p.totals={workMs:70000,readBytes:archive.length*12,outputBytes:28672,readerInvocations:3};});
 const h=await startupHarness06(),materialTable={7:{reflection:[.64,.49,.25],transmission:[0,0,0],basis:'authored-assumption',reference:'original-session09-material'}},reference=Buffer.from(canonical({kind:'OriginalBinaryArchiveEvidence08',archiveSHA256s:[proof.archiveSHA256],collisionFrame:proof.collisionFrame,units:'metres',factorySourceSHA256:byteDigest(await fs.readFile(new URL('./CodeWalkerProviderFixtures08.cs',import.meta.url))),fixtureReceiptSHA256:byteDigest(proofBytes)})),evidence=pinOriginalArchiveEvidence08(reference,{expectedSHA256:byteDigest(reference)});
 let placements,collision,provider,first,restart,built,solver,readerCount=0;
 const expectedArtifact=phase=>sha({kind:'ReviewedOriginalFactoryArtifact09',phase,archiveSHA256:proof.archiveSHA256,factoryEvidenceSHA256:byteDigest(reference),closureSHA256:digest(closure.filter(c=>f.plan.phases.find(p=>p.id===phase).inputs.includes(c.id)))});
 // Original factory artifacts are independently known, so this fixture can
 // preseal its gates. Unknown private decoder artifacts cannot use this lane.
 f.approvalGates=['placements','collision','admission'].map(beforePhase=>{const i=f.plan.phases.findIndex(p=>p.id===beforePhase),phase=f.plan.phases[i];return pin(pinValidationGate09,{schema:1,kind:'RichAudioValidationGate09',purpose:'original-fixture-contract-only',candidateId:f.plan.candidateId,planSHA256:f.token.planSHA256,beforePhase,afterArtifactSHA256:expectedArtifact(f.plan.phases[i-1].id),closureSHA256:digest(closure.filter(c=>phase.inputs.includes(c.id))),reviewSHA256:sha({factoryEvidenceSHA256:byteDigest(reference),beforePhase}),explicitApprovalSHA256:sha('original factory phase approval '+beforePhase)});});
 const report=(phase,result,context)=>({kind:'OriginalValidationPhase09',phase,planSHA256:f.token.planSHA256,closureSHA256:context.closureSHA256,readBytes:result?result.workerResult.stats.sourceReadBytes+archive.length:0,readerInvocations:result?1:0,joined:true,artifactSHA256:expectedArtifact(phase),discoveredClosure:[],qualified:true});
 const read=async(phase,selection)=>{
  // Staging, package/runtime loading and the actual contained reader all start
  // only inside a fixture callback, after the outer durable consumed marker.
  const request=originalProviderRequest08({parserSHA256:build.parserSHA256,bytes:archive.length,sha256:proof.archiveSHA256,phase,selection,discovery:phase==='metadata'?{offset:0,maximum:16}:undefined}),prepared=await prepareProviderProcess08({packageRoot,workingRoot:h.root,request,inputs:[{path:'input/original.rpf',bytes:archive}]});readerCount++;const run=await runProviderProcess08(prepared);assert.equal(run.state,'completed',JSON.stringify({state:run.state,stderr:run.supervisorStderr}));assert.equal(run.workerJoined,true);assert.equal(run.receipt.sourceBindings[0].fullSHA256,proof.archiveSHA256);return run;
 };
 const selection=kinds=>[...members].filter(([,r])=>kinds.includes(r.operation)).map(([logicalMember])=>({logicalArchive:'original/base.rpf',logicalMember}));
 try{
  f.callbacks['initialization-metadata']=async context=>{const run=await read('metadata');assert.equal(run.workerResult.resources.length,0);assert.equal(run.workerResult.metadata.length,5);assert.equal(run.workerResult.candidates.length,3);for(const candidate of run.workerResult.candidates){const range=members.get(candidate.logicalMember);assert.equal(candidate.offset,range.offset);assert.equal(candidate.storedBytes,range.bytes);}return report('initialization-metadata',run,context);};
  f.callbacks.placements=async context=>{placements=await read('resources',selection(['ymap','ytyp']));assert.deepEqual(placements.workerResult.resources.map(r=>r.kind),['ymap','ytyp']);return report('placements',placements,context);};
  f.callbacks.collision=async context=>{collision=await read('resources',selection(['ymap','ytyp','ybn']));assert.equal(collision.workerResult.resources.length,3);for(const resource of collision.workerResult.resources){const range=members.get(resource.logicalPath);assert.equal(resource.source.offset,range.offset);assert.equal(resource.source.storedBytes,range.bytes);assert.equal(resource.source.storedSHA256,range.sha256);assert.equal(resource.source.archiveSHA256,proof.archiveSHA256);const prior=placements.workerResult.resources.find(r=>r.logicalPath===resource.logicalPath);if(prior){assert.equal(resource.packet.decodedSHA256,prior.packet.decodedSHA256);assert.equal(resource.source.parserBufferSHA256,prior.source.parserBufferSHA256);assert.equal(resource.source.storedSHA256,prior.source.storedSHA256);assert.equal(resource.source.headerSHA256,prior.source.headerSHA256);assert.equal(resource.source.tableSHA256,prior.source.tableSHA256);}}return report('collision',collision,context);};
  f.callbacks.admission=async context=>{provider=buildProviderCatalogue08({run:collision,fixtureEvidence:evidence,materialTable});assert.equal(provider.pages.length,1);assert.equal(provider.sourceBindings.length,3);assert.equal(provider.unknown.length,0);return report('admission',null,context);};
  f.callbacks.tile=async context=>{first=createProviderStartup08({provider,checkpoint:h.checkpoint,storeForPage:async()=>h.router,session:'9'.repeat(32)});built=await first.run();assert.equal(built.completedEligibleTiles,1);assert.equal(built.workersStarted,1);assert.equal(built.workersJoined,1);await first.close();return report('tile',null,context);};
  f.callbacks['cache-reuse']=async context=>{restart=createProviderStartup08({provider,checkpoint:h.checkpoint,storeForPage:async()=>h.router,session:'9'.repeat(32),trustedCheckpointSHA256:built.checkpointSHA256});const r=await restart.run();assert.equal(r.cacheHits,1);assert.equal(r.workersStarted,0);return report('cache-reuse',null,context);};
  f.callbacks.soundmap=async context=>{const tileId=provider.pages[0].inventory.tilePlans[0].tileId,inspection=await inspectProviderTile08({provider,coordinator:restart,tileId});assert.equal(inspection.state,'prepared-cache-hit');assert.equal(inspection.tile.engineTile.surfaces.length,2);const vertices=inspection.geometry.tiles[0].surfaces.flatMap(s=>s.vertices);for(const expected of proof.expectedWorldVertices)assert(vertices.some(actual=>actual.every((v,i)=>Math.abs(v-expected[i])<1e-4)));solver=solveProviderInspection08({inspection,source:[-.4,2,.6],listener:[.4,2,.6]});assert(solver.sample.control.paths.some(p=>p.order>0));assert(solver.sample.soundMapFrame.paths.some(p=>p.order>0));return report('soundmap',null,context);};
  const result=await runValidationSession09(f.token,f);assert.equal(result.state,'completed-original-fixture',JSON.stringify(result));assert.equal(readerCount,3);assert.equal(result.phases.reduce((n,r)=>n+r.readerInvocations,0),3);assert.equal(result.genuineCollisionQualified,false);
 }finally{solver?.close();await first?.close();await restart?.close();await h.close();await f.close();}
});
