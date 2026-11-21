import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {CausalSimulation,StreamingRenderer} from '../src/acoustics/streaming/causal.mjs';
import {runProcessingWorkload10,compareProcessingPcm10} from '../tools/Profile-Processing10.mjs';
import {originalCase,observationAt} from '../tools/Measure-Acoustics07.mjs';

const parentCommit='85646ec65f2f88f0eb935374a79260a75e96b728';
const root=fileURLToPath(new URL('../',import.meta.url));
const moduleUrl=new URL('../src/acoustics/streaming/causal.mjs',import.meta.url);
// Import the exact reviewed Git parent renderer; dependencies retain their
// ordinary authored repository identity. No installed resources are consulted.
const parentSource=execFileSync('git',['show',parentCommit+':src/acoustics/streaming/causal.mjs'],{cwd:root,encoding:'utf8'});
const resolvedParent=parentSource.replace(/from "(\.\.\/[^";]+)"/g,(_,relative)=>'from '+JSON.stringify(new URL(relative,moduleUrl).href));
const ParentModule=await import('data:text/javascript;base64,'+Buffer.from(resolvedParent).toString('base64')),
 ParentRenderer=ParentModule.StreamingRenderer,ParentSimulation=ParentModule.CausalSimulation;
const typed=array=>Buffer.from(array.buffer,array.byteOffset,array.byteLength);

function renderSequence(Renderer,{continuousRates,pathCapacityPerSource}){
 const renderer=new Renderer({sourceIds:['engine','exhaust'],maxPathsPerSource:6,pathCapacityPerSource,
  continuousRates,continuousTransitions:true,historyDiagnostics:true,generationReleaseGuard:true,sourcePressureGains:{engine:1.3,exhaust:.8}});
 const rings=renderer.sourceList.map(source=>({bands:source.bands,frames:source.frames,generations:source.generations}));
 const bytes=renderer.ownedArrayBytes,left=new Float32Array(512),right=new Float32Array(512),inputs={engine:new Float32Array(512),exhaust:new Float32Array(512)};
 const stereo=createHash('sha256'),blocks=[],identities=new Set();let nonzeroBlocks=0;
 for(let block=0;block<288;block++){
  const frame=renderer.frame,frames=block%19===0?128:512,generation=block<42?1:block<192?2:3;
  for(let j=0;j<frames;j++){
   inputs.engine[j]=.11*Math.sin((frame+j)*.071)+.013*Math.cos((frame+j)*.31);
   inputs.exhaust[j]=.07*Math.cos((frame+j)*.027);
  }
  // Genuine absence, identity/geometry replacement, retirement and a new source
  // generation exercise both release banks and fractional source-history taps.
  const paths=[];
  if(block>=4&&!(block>=160&&block<192))for(const [sourceId,index] of [['engine',0],['exhaust',1]])for(let order=0;order<3;order++){
   const pan=.6*Math.sin(block*.023+index+order*.2),id=sourceId+':'+(order?'reflection'+order:'direct')+':g'+generation+(order?':geometry'+(block<96?1:2):'');
   identities.add(id);
   paths.push({id,sourceId,generation,emissionFrame:frame-1536-order*37.25-index*12.5,rate:1+.03*Math.sin(block*.019+order),
    bands:[.17/(order+1),.13/(order+1),.09/(order+1)],pan,
    ...(continuousRates?{panTrajectory:{frame,frames,basis:'arrived-observation-brackets',start:pan,end:.6*Math.sin((block+1)*.023+index+order*.2)}}:{})});
  }
  // Withhold controls long enough to exercise the existing stale-path release.
  if(block<116||block>=138)renderer.accept({frame,paths,sourceGenerations:{engine:generation,exhaust:generation}});
  if(block===60)renderer.setOutputPreferences({outputLevel:.4});
  if(block===80)renderer.setOutputPreferences({richAudioEnabled:false});
  if(block===92)renderer.setOutputPreferences({richAudioEnabled:true});
  renderer.process(inputs,left,right,frames);
  const digest=createHash('sha256').update(typed(left.subarray(0,frames))).update(typed(right.subarray(0,frames))).digest('hex');
  blocks.push(digest);stereo.update(digest);if(left.subarray(0,frames).some(value=>value!==0)||right.subarray(0,frames).some(value=>value!==0))nonzeroBlocks++;
  assert.equal(renderer.ownedArrayBytes,bytes,'no extra PCM storage appears');
  for(let i=0;i<rings.length;i++){
   assert.equal(renderer.sourceList[i].bands,rings[i].bands);assert.equal(renderer.sourceList[i].frames,rings[i].frames);assert.equal(renderer.sourceList[i].generations,rings[i].generations);
  }
 }
 return {stereoSha256:stereo.digest('hex'),blocks,stats:renderer.stats,history:renderer.historyDiagnostics,frame:renderer.frame,
  slots:renderer.slots.map(slot=>({...slot,source:slot.source?.id??null})),sources:renderer.sourceList.map(source=>({low:source.low,upper:source.upper,generation:source.generation,generationFrame:source.generationFrame,
   bands:source.bands.map(band=>createHash('sha256').update(typed(band)).digest('hex')),frames:createHash('sha256').update(typed(source.frames)).digest('hex'),generations:createHash('sha256').update(typed(source.generations)).digest('hex')})),
  identities:identities.size,nonzeroBlocks,bytes};
}

for(const continuousRates of [false,true])for(const pathCapacityPerSource of [6,64])test(`renderer ordered acceptance retains every PR92 parent PCM byte/state, continuous=${continuousRates}, capacity=${pathCapacityPerSource}`,()=>{
 const config={continuousRates,pathCapacityPerSource},parent=renderSequence(ParentRenderer,config),current=renderSequence(StreamingRenderer,config);
 assert.deepEqual(current,parent);
 assert(current.nonzeroBlocks>200);assert(current.identities>=18);assert(current.frame>120000,'retained source history actually wraps');
 assert(current.stats.panReconstructedFrames>0||!continuousRates);assert(current.stats.maximumControlAgeFrames>7200,'stale control release actually executes');
 assert.equal(current.stats.pathOverflow,0);assert.equal(current.stats.limited,0);
});

test('actual moving authored-wall full path and source lifecycle retain PR92 parent acceptance and PCM block for block',async()=>{
 const config={mode:'current-prepared',blocks:192,coldBlocks:24,profile:'fixed-cpu-balanced',scene:'walls',lifecycle:true,texture:true,instrumented:false};
 const currentProcess=StreamingRenderer.prototype.process,currentAccept=StreamingRenderer.prototype.accept;let parent;
 try{StreamingRenderer.prototype.process=ParentRenderer.prototype.process;StreamingRenderer.prototype.accept=ParentRenderer.prototype.accept;parent=await runProcessingWorkload10(config);}
 finally{StreamingRenderer.prototype.process=currentProcess;StreamingRenderer.prototype.accept=currentAccept;}
 const current=await runProcessingWorkload10(config),comparison=compareProcessingPcm10(parent,current);
 assert(Object.values(comparison).every(Boolean),JSON.stringify(comparison));
 assert.equal(current.continuity.sourceConstructions,2);assert(current.records.some(row=>row.reflectedPaths>0));
 assert.equal(current.continuity.historyAffectedFrames,0);assert.equal(current.continuity.limiterEvents,0);
 assert(current.records.every(row=>row.overBudget===(row.renderMs>512/48000*1000)));
 assert.equal(current.limits.pcmQueueFramesAdded,0);assert.equal(current.beforeRender.rendererFrame,0);
});

function compareRendererState(current,parent){
 // Retain the complete enumerable renderer contract, including every ring,
 // slot, index, preference and diagnostic rather than a PCM-only comparison.
 assert.deepEqual({...current},{...parent});
 assert.equal(current.frame,parent.frame);assert.equal(current.controlFrame,parent.controlFrame);
 assert.equal(current.activePaths,parent.activePaths);assert.equal(current.activeSlotCount,parent.activeSlotCount);
 assert.equal(current.ownedArrayBytes,parent.ownedArrayBytes);assert.equal(current.outputGain,parent.outputGain);
 assert.deepEqual(current.stats,parent.stats);assert.deepEqual(current.historyDiagnostics,parent.historyDiagnostics);
 assert.deepEqual(current.activeSlotIndices,parent.activeSlotIndices);
 const slots=renderer=>renderer.slots.map(slot=>({...slot,source:slot.source?.id??null}));
 assert.deepEqual(slots(current),slots(parent));
 // This includes complete low/mid/high rings, frame/generation tags, filter
 // memories, source generations and the exact latest dry input, not PCM alone.
 assert.deepEqual(current.sourceList,parent.sourceList);
}

test('ordered acceptance keeps first-match/free-slot choice, replacement overflow and deep history at every block',()=>{
 const config={sourceIds:['engine','exhaust'],maxPathsPerSource:3,pathCapacityPerSource:3,
  continuousRates:true,continuousTransitions:true,generationReleaseGuard:true,historyDiagnostics:true};
 const current=new StreamingRenderer(config),parent=new ParentRenderer(config),inputs={engine:new Float32Array(512),exhaust:new Float32Array(512)},
  currentLeft=new Float32Array(512),currentRight=new Float32Array(512),parentLeft=new Float32Array(512),parentRight=new Float32Array(512);
 for(let block=0;block<48;block++){
  const frame=current.frame,frames=128,generation=1,identityGeneration=1+Math.floor(block/2),paths=[];
  for(let j=0;j<frames;j++){inputs.engine[j]=.11*Math.sin((frame+j)*.02);inputs.exhaust[j]=.07*Math.cos((frame+j)*.03);}
  if(block<32||block>=40)for(const sourceId of config.sourceIds)for(let order=0;order<3;order++)paths.push({id:`${sourceId}:path${order}:g${identityGeneration}:geometry${block%3}`,
   sourceId,generation,emissionFrame:frame-96-order*3.25,rate:.99+order*.002,bands:[.2/(order+1),.15/(order+1),.1/(order+1)],pan:order*.2-.2});
  if(block%2)paths.reverse();
  const control={frame,paths,sourceGenerations:{engine:generation,exhaust:generation,unknown:1}};
  current.accept(control);parent.accept(control);compareRendererState(current,parent);
  current.process(inputs,currentLeft,currentRight,frames);parent.process(inputs,parentLeft,parentRight,frames);
  assert.deepEqual(typed(currentLeft),typed(parentLeft));assert.deepEqual(typed(currentRight),typed(parentRight));
  compareRendererState(current,parent);
 }
 assert(current.stats.pathOverflow>0,'the first-free exhausted-bank branch executes');
 assert(current.slots.some(slot=>slot.attackTotal===960),'the reflected/source replacement attack executes');
});

test('ordered acceptance preserves validation errors and partial-state behavior',()=>{
 const config={sourceIds:['engine','exhaust'],maxPathsPerSource:3,pathCapacityPerSource:64,continuousRates:true,continuousTransitions:true,historyDiagnostics:true},
  current=new StreamingRenderer(config),parent=new ParentRenderer(config),base={id:'engine:reflection:g1:geometry1',sourceId:'engine',generation:1,emissionFrame:0,rate:1,bands:[.1,.2,.3],pan:0};
 const valid={frame:0,paths:[base],sourceGenerations:{engine:1,exhaust:1}};
 current.accept(valid);parent.accept(valid);
 const failures=[
  {...valid,paths:[base,{...base}]},
  {...valid,paths:[{...base,sourceId:'unknown'}]},
  {...valid,paths:[base,{...base,id:'engine:second:g1',bands:[.1,NaN,.3]}]},
  {...valid,paths:[{...base,panTrajectory:{frame:0,frames:512,basis:'invalid',start:0,end:.2}}]},
  {...valid,frame:1},
  {...valid,frame:-1},
 ];
 for(const control of failures){
  let parentMessage,currentMessage;
  try{parent.accept(control);}catch(error){parentMessage=error.message;}
  try{current.accept(control);}catch(error){currentMessage=error.message;}
  assert(parentMessage,'the invalid authored control must fail');assert.equal(currentMessage,parentMessage);
  compareRendererState(current,parent);
 }
 current.setPathBudget(1);parent.setPathBudget(1);current.accept(valid);parent.accept(valid);compareRendererState(current,parent);
});

test('acceptance clears all inactive three-band targets, including valid negative zero',()=>{
 const config={sourceIds:['engine'],maxPathsPerSource:1,pathCapacityPerSource:64},current=new StreamingRenderer(config),parent=new ParentRenderer(config),
  control={frame:0,paths:[{id:'engine:direct:g1',sourceId:'engine',generation:1,emissionFrame:0,rate:1,bands:[-0,0,-0],pan:0}],sourceGenerations:{engine:1}},
  input={engine:new Float32Array(1)},left=new Float32Array(1),right=new Float32Array(1);
 current.accept(control);parent.accept(control);current.process(input,left,right);parent.process(input,left,right);
 assert.equal(current.slots[0].active,false);assert(Object.is(current.slots[0].target[0],-0));
 current.accept({frame:1,paths:[]});parent.accept({frame:1,paths:[]});compareRendererState(current,parent);
 assert(Object.is(current.slots[0].target[0],0));assert(Object.is(current.slots[0].target[2],0));
});

for(const capacity of [6,64])test(`occupied PCM keeps exact PR92 state through overlapping attack/release and failed inputs, capacity=${capacity}`,()=>{
 const options={sourceIds:['engine','exhaust'],maxPathsPerSource:3,pathCapacityPerSource:capacity,continuousRates:true,
  continuousTransitions:true,generationReleaseGuard:true,historyDiagnostics:true,sourcePressureGains:{engine:1.3,exhaust:.8}},
  current=new StreamingRenderer(options),parent=new ParentRenderer(options),left=new Float32Array(512),right=new Float32Array(512),
  parentLeft=new Float32Array(512),parentRight=new Float32Array(512),input={engine:new Float32Array(512),exhaust:new Float32Array(512)};
 let attacks=0,releases=0,unoccupied=0;
 for(let block=0;block<64;block++){
  const frame=current.frame,paths=[],generation=block<25?1:2,active=block>=2&&block<45;
  for(let i=0;i<512;i++){input.engine[i]=.12*Math.sin((frame+i)*.021);input.exhaust[i]=.07*Math.cos((frame+i)*.034);}
  if(active)for(const sourceId of options.sourceIds)for(let order=0;order<3;order++){
   const pan=.4*Math.sin(block*.07+order),identity=block<12?1:block<14?2:3;
   paths.push({id:`${sourceId}:${order?'reflection'+order:'direct'}:g${generation}:geometry${identity}`,sourceId,generation,
    emissionFrame:frame-256-order*13.25,rate:1+.01*Math.sin(block*.03+order),bands:[.13/(order+1),.08/(order+1),.05/(order+1)],pan,
    panTrajectory:{frame,frames:512,basis:'arrived-observation-brackets',start:pan,end:.4*Math.sin((block+1)*.07+order)}});
  }
  const control={frame,paths,sourceGenerations:{engine:generation,exhaust:generation}};
  current.accept(control);parent.accept(control);compareRendererState(current,parent);
  attacks+=current.slots.filter(s=>s.active&&s.attackLeft>0).length;releases+=current.slots.filter(s=>s.active&&s.releaseLeft>0).length;
  if(!current.activePaths)unoccupied++;
  if(block===18){
   // Failure occurs after genuine state/PCM writes within this block. Preserve
   // the exact partial mutation and retain the following successful suffix.
   input.engine[127]=NaN;let currentError,parentError;
   try{current.process(input,left,right);}catch(error){currentError=error.message;}
   try{parent.process(input,parentLeft,parentRight);}catch(error){parentError=error.message;}
   assert.equal(currentError,parentError);assert(currentError);compareRendererState(current,parent);
   assert.deepEqual(typed(left),typed(parentLeft));assert.deepEqual(typed(right),typed(parentRight));input.engine[127]=.03;
  }
  if(block===30){current.setOutputPreferences({outputLevel:.4});parent.setOutputPreferences({outputLevel:.4});}
  if(block===35){current.setOutputPreferences({richAudioEnabled:false});parent.setOutputPreferences({richAudioEnabled:false});}
  current.process(input,left,right);parent.process(input,parentLeft,parentRight);compareRendererState(current,parent);
  assert.deepEqual(typed(left),typed(parentLeft));assert.deepEqual(typed(right),typed(parentRight));
 }
 assert(attacks>0);assert(releases>0);assert(unoccupied>2);assert.equal(current.ownedArrayBytes,parent.ownedArrayBytes);
});

test('repeated control settings preserve exact PR92 preparation, paths, supersession and complete simulation state',()=>{
 const fixture=originalCase('ground'),replacement=originalCase('canyon'),current=new CausalSimulation(fixture.scene),parent=new ParentSimulation(fixture.scene);
 const compare=()=>assert.deepEqual({...current},{...parent});
 let reflected=0,terminal=0;
 for(let block=0;block<48;block++){
  const time=block/48,settings={pathBudget:block<16?12:block<24?6:12,maxReflectors:block<32?8:16,earlyReflections:block<20||block>=28};
  for(let repeat=0;repeat<3;repeat++){current.setProcessingSettings(settings);parent.setProcessingSettings(settings);compare();}
  if(block===12||block===15){const scene=block===12?replacement.scene:fixture.scene;current.replaceScene(scene);parent.replaceScene(scene);compare();}
  const snapshot=observationAt(fixture,time);if(block>=36)snapshot.session='new-authored-session';if(block>=20)snapshot.sources[0].generation=2;
  if(block===8||block===9)snapshot.paused=true;if(block===40)snapshot.sources=[];
  current.observe(snapshot);parent.observe(snapshot);compare();
  const currentPrepared=current.prepareUpdate(time),parentPrepared=parent.prepareUpdate(time);assert.deepEqual(currentPrepared,parentPrepared);compare();
  // Equal settings must not invalidate an already prepared frame. A genuine
  // setting change retains the existing supersession rejection instead.
  current.setProcessingSettings(settings);parent.setProcessingSettings(settings);compare();
  const a=current.completeUpdate(currentPrepared),b=parent.completeUpdate(parentPrepared);assert.deepEqual(a,b);compare();
  reflected+=a.paths.filter(path=>path.order>0).length;if(currentPrepared.terminal)terminal++;
  if(block===18){
   const ca=current.prepareUpdate(time),pa=parent.prepareUpdate(time),changed={...settings,pathBudget:3};
   current.setProcessingSettings(changed);parent.setProcessingSettings(changed);compare();
   assert.throws(()=>current.completeUpdate(ca),/superseded/);assert.throws(()=>parent.completeUpdate(pa),/superseded/);compare();
  }
 }
 assert(reflected>0);assert(terminal>0);
 for(const settings of [{pathBudget:0,maxReflectors:8},{pathBudget:12,maxReflectors:17},{pathBudget:12,maxReflectors:8,earlyReflections:0}]){
  assert.throws(()=>current.setProcessingSettings(settings),/bounded acoustic processing settings/);
  assert.throws(()=>parent.setProcessingSettings(settings),/bounded acoustic processing settings/);compare();
 }
});

test('equal control updates preserve PR92 detached-settings reference semantics',()=>{
 const current=new CausalSimulation(null,{allowMissingScene:true}),parent=new ParentSimulation(null,{allowMissingScene:true}),
  settings={pathBudget:12,maxReflectors:16,earlyReflections:true};
 current.setProcessingSettings(settings);parent.setProcessingSettings(settings);
 const retainedCurrent=current.processingSettings,retainedParent=parent.processingSettings;
 current.setProcessingSettings(settings);parent.setProcessingSettings(settings);
 // A previously exposed settings object is detached by the next setter call.
 // Reusing it would silently let a retained caller reference change live quality.
 retainedCurrent.pathBudget=1;retainedParent.pathBudget=1;retainedCurrent.earlyReflections=false;retainedParent.earlyReflections=false;
 assert.deepEqual({...current},{...parent});assert.equal(current.processingSettings.pathBudget,12);
 assert.equal(current.processingSettings.earlyReflections,true);
});
