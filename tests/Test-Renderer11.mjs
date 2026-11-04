import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {StreamingRenderer} from '../src/acoustics/streaming/causal.mjs';
import {runProcessingWorkload10,compareProcessingPcm10} from '../tools/Profile-Processing10.mjs';

const parentCommit='f612bfc5f9f8ecce5565cb9853b1aacfe8179cba';
const root=fileURLToPath(new URL('../',import.meta.url));
const moduleUrl=new URL('../src/acoustics/streaming/causal.mjs',import.meta.url);
// Import the exact reviewed Git parent renderer; dependencies retain their
// ordinary authored repository identity. No installed resources are consulted.
const parentSource=execFileSync('git',['show',parentCommit+':src/acoustics/streaming/causal.mjs'],{cwd:root,encoding:'utf8'});
const resolvedParent=parentSource.replace(/from "(\.\.\/[^";]+)"/g,(_,relative)=>'from '+JSON.stringify(new URL(relative,moduleUrl).href));
const ParentRenderer=(await import('data:text/javascript;base64,'+Buffer.from(resolvedParent).toString('base64'))).StreamingRenderer;
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

for(const continuousRates of [false,true])for(const pathCapacityPerSource of [6,64])test(`renderer reference cache retains every parent PCM byte/state, continuous=${continuousRates}, capacity=${pathCapacityPerSource}`,()=>{
 const config={continuousRates,pathCapacityPerSource},parent=renderSequence(ParentRenderer,config),current=renderSequence(StreamingRenderer,config);
 assert.deepEqual(current,parent);
 assert(current.nonzeroBlocks>200);assert(current.identities>=18);assert(current.frame>120000,'retained source history actually wraps');
 assert(current.stats.panReconstructedFrames>0||!continuousRates);assert(current.stats.maximumControlAgeFrames>7200,'stale control release actually executes');
 assert.equal(current.stats.pathOverflow,0);assert.equal(current.stats.limited,0);
});

test('actual moving authored-wall full path and source lifecycle retain parent renderer PCM block for block',async()=>{
 const config={mode:'current-prepared',blocks:192,coldBlocks:24,profile:'fixed-cpu-balanced',scene:'walls',lifecycle:true,texture:true,instrumented:false};
 const currentProcess=StreamingRenderer.prototype.process;let parent;
 try{StreamingRenderer.prototype.process=ParentRenderer.prototype.process;parent=await runProcessingWorkload10(config);}
 finally{StreamingRenderer.prototype.process=currentProcess;}
 const current=await runProcessingWorkload10(config),comparison=compareProcessingPcm10(parent,current);
 assert(Object.values(comparison).every(Boolean),JSON.stringify(comparison));
 assert.equal(current.continuity.sourceConstructions,2);assert(current.records.some(row=>row.reflectedPaths>0));
 assert.equal(current.continuity.historyAffectedFrames,0);assert.equal(current.continuity.limiterEvents,0);
 assert(current.records.every(row=>row.overBudget===(row.renderMs>512/48000*1000)));
 assert.equal(current.limits.pcmQueueFramesAdded,0);assert.equal(current.beforeRender.rendererFrame,0);
});
