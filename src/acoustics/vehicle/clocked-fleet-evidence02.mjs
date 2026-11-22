// Private discard-host evidence. It consumes the real renderer's measurements
// and RA07 bytes. Disk writes, sorting and WAV formatting occur after stop.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {performance,PerformanceObserver} from 'node:perf_hooks';

const maximumBlocks=16384,frames=512,deadline=frames/48;
const renderStageFields=['admissionMs','sourceSelectionMs','stockSynthesisMs','propagationMs','pcmMs','bookkeepingMs'];
const pathStageFields=['candidatePreparationMs','visibilityMs','pathSelectionMs','pathApplicationMs','stereoMixMs'];
const fields=['completeRenderMs',...renderStageFields,...pathStageFields,'framingMs','producerWakeMs','controlIngressMs','throughPipeWriteMs'];
const counts=['active','moving','installed','proposed','segments','eligible','selected','applied','releasing',
 'reflectedVoices','order1','order2','order3Plus','added','removed'];
const summary=values=>{
 const sorted=values.sort((a,b)=>a-b);
 if(!sorted.length)return null;
 const at=q=>sorted[Math.ceil(q*sorted.length)-1];
 return {p50:at(.5),p95:at(.95),p99:at(.99),max:at(1)};
};

export class ClockedFleetEvidence02 {
 constructor(root,session){
  if(!/^[a-f0-9]{32}$/.test(session)||!root.split(path.sep).includes('.local'))throw Error('Private clocked evidence path required');
  this.directory=path.join(root,'.local','gameplay',session);
  this.began=performance.now();
  this.data=Object.fromEntries(fields.map(f=>[f,new Float64Array(maximumBlocks)]));
  this.data.throughPipeWriteMs.fill(NaN);
  this.counts=Object.fromEntries(counts.map(f=>[f,new Uint32Array(maximumBlocks)]));
  this.playerPositions=new Float64Array(3*maximumBlocks).fill(NaN);
  this.previousPaths=new Set();
  this.gpuSamples=[];
  this.gpuSampleCount=0;
  this.sceneCandidates=[];
  this.sceneCandidatesOmitted=0;
  this.population=new Uint8Array(maximumBlocks);
  this.nonzero=new Uint8Array(maximumBlocks);
  this.pathCount=new Uint16Array(maximumBlocks);
  this.activeWithReflection=new Uint8Array(maximumBlocks);
  this.mappedWithReflection=new Uint8Array(maximumBlocks);
  this.reflectionCount=new Uint16Array(maximumBlocks);
  this.selectedWall=new Uint8Array(maximumBlocks);
  const poseFile=path.join(root,'installed-wall-drive.json');
  this.expectedSurfaceId=fs.existsSync(poseFile)?JSON.parse(fs.readFileSync(poseFile,'utf8')).surfaceId:null;
  this.blocks=0;
  this.excess=0;
  this.creditHighWater=0;
  this.creditTimes=new Float64Array(8);
  this.creditRead=0;
  this.creditWrite=0;
  this.misses=[];
  this.worst=null;
  this.maxRss=process.memoryUsage.rss();
  this.excerpt=Buffer.alloc(375*frames*8);
  this.excerptBytes=0;
  this.gc={count:0,totalMs:0,maxMs:0};
  this.gcIntervals=[];
  this.gcObserver=new PerformanceObserver(list=>{
   for(const {startTime,duration} of list.getEntries()){
    this.gc.count++;
    this.gc.totalMs+=duration;
    this.gc.maxMs=Math.max(this.gc.maxMs,duration);
    if(this.gcIntervals.length<4096)this.gcIntervals.push({startTime,duration});
   }
  });
  this.gcObserver.observe({entryTypes:['gc']});
 }
 ready(preparation){this.preparation=preparation;this.readyAt=performance.now();}
 sceneCandidate(receipt,discovery){
  if(this.sceneCandidates.length===1024){this.sceneCandidatesOmitted++;return;}
  const profile=receipt.lifecycle01.workerProfile01;
  this.sceneCandidates.push({requestId:receipt.requestId,block:this.blocks,
   workerPreparationMs:receipt.workerPreparationMilliseconds,
   workerReflectionSelectionMs:profile?.world?.reflectionSelectionMs??null,
   workerTransportMs:receipt.lifecycle01.workerTransportMilliseconds,
   producerValidationMs:receipt.validationMs,requestToAdmissionMs:receipt.admissionMs,
   discovery:discovery??null});
 }
 credit(blocks,at){
  for(let i=0;i<blocks;i++)this.creditTimes[this.creditWrite++%8]=at;
  this.creditHighWater=Math.max(this.creditHighWater,this.creditWrite-this.creditRead);
 }
 begin(at){this.blockBegan=at;this.wakeMs=at-this.creditTimes[this.creditRead++%8];}
 delivered(at){
  if(this.blocks>0&&!this.excess)this.data.throughPipeWriteMs[this.blocks-1]=at-this.blockBegan;
 }
 block(engine,framingMs,controlIngressMs,nonzero,packet){
  this.staleContributors=engine.staleContributors;
  if(this.blocks===maximumBlocks){this.excess++;return;}
  const index=this.blocks++,stages=engine.lastRenderStages01;
  this.data.completeRenderMs[index]=engine.lastCompleteRenderMs;
  this.data.framingMs[index]=framingMs;
  this.data.producerWakeMs[index]=this.wakeMs;
  this.data.controlIngressMs[index]=controlIngressMs;
  for(const field of renderStageFields)this.data[field][index]=stages?.[field]??0;
  const profiled=engine.pipeline.clockedStages,c=this.counts;
  const backend=this.backend=engine.pipeline.backend;
  for(const [kind,record] of [['calibration',backend.lastCalibration],['rejected',backend.lastRejectedAttempt],
   ['applied',backend.active==='gpu'?backend.last:null]]){
   if(record&&record!==this[kind]){
    this[kind]=record;this.gpuSampleCount++;
    if(this.gpuSamples.length<128)this.gpuSamples.push({block:index,kind,...record});
   }
  }
  for(const field of pathStageFields)this.data[field][index]=profiled?.[field]??0;
  for(const field of ['proposed','segments','eligible','selected'])c[field][index]=profiled?.[field]??0;
  const population=engine.fleetPopulation?.discovered??engine.snapshots.at(-1)?.frame.vehicles.length??0;
  this.population[index]=population;
  this.nonzero[index]=Number(nonzero);
  this.pathCount[index]=engine.pipeline.lastControl.paths.length;
  const current=new Set(),renderer=engine.pipeline.renderer;
  for(const slot of engine.slots)if(slot.source){
   c.active[index]++;
   if(slot.vehicle?.context==='player')this.playerPositions.set(slot.vehicle.position,index*3);
   if(slot.vehicle?.velocity?.some(component=>Math.abs(component)>.00001))c.moving[index]=1;
  }
  const byVoice=new Set(),byId=new Map(engine.pipeline.lastControl.paths.map(p=>[p.id,p]));
  for(let i=0;i<renderer.activeSlotCount;i++){
   const slot=renderer.slots[renderer.activeSlotIndices[i]];
   if(!slot.active)continue;
   if(!slot.present){c.releasing[index]++;continue;}
   const applied=byId.get(slot.id);
   if(!applied)throw Error('Occupied current mixer path missing its control');
   current.add(slot.id);c.applied[index]++;
   if(applied.order){
    byVoice.add(applied.sourceId.split(':')[1]);
    c[applied.order===1?'order1':applied.order===2?'order2':'order3Plus'][index]++;
   }
   if(!this.previousPaths.has(slot.id))c.added[index]++;
  }
  c.reflectedVoices[index]=byVoice.size;
  for(const id of this.previousPaths)if(!current.has(id))c.removed[index]++;
  this.previousPaths=current;
  if(engine.pipeline.simulation.scene.observationModel?.kind==='conditional-installed-static-model'){
   c.installed[index]=1;
   let reflections=0,mapped=0;
   for(const propagation of engine.pipeline.lastControl.paths){
    const slot=/^stock:slot([0-4]):/.exec(propagation.sourceId);
    if(slot&&engine.slots[Number(slot[1])]?.source)mapped|=1<<Number(slot[1]);
    if(propagation.order>0){
     reflections++;
     if(this.expectedSurfaceId&&(propagation.candidateId??propagation.id).includes(this.expectedSurfaceId))this.selectedWall[index]=1;
    }
   }
   if(reflections){
    this.activeWithReflection[index]=engine.slots.filter(slot=>slot.source).length;
    this.reflectionCount[index]=reflections;
    for(;mapped;mapped&=mapped-1)this.mappedWithReflection[index]++;
   }
  }
  if(index%128===0)this.maxRss=Math.max(this.maxRss,process.memoryUsage.rss());
  const slow=engine.lastCompleteRenderMs>deadline&&this.misses.length<256;
  const worst=!this.worst||engine.lastCompleteRenderMs>this.worst.completeRenderMs;
  if(slow||worst){
   const row={index,at:performance.now(),population,nonzero,active:engine.slots.filter(s=>s.source).length,
    paths:this.pathCount[index],completeRenderMs:engine.lastCompleteRenderMs,stages,tail:engine.lastTailLatency04??null};
   if(slow)this.misses.push(row);
   if(worst)this.worst=row;
  }
  if(this.excerptBytes<this.excerpt.length&&(this.excerptBytes>0||nonzero&&engine.slots.filter(s=>s.source).length>=2)){
   packet.copy(this.excerpt,this.excerptBytes,16);
   this.excerptBytes+=frames*8;
  }
 }
 close(reason,error){
  this.gcObserver.disconnect();
  const groups=new Map(),reflectedGroups=new Map();
  for(let i=0;i<this.blocks;i++){
   const key=this.population[i];
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(i);
   const reflected=this.activeWithReflection[i];
   if(reflected){
    if(!reflectedGroups.has(reflected))reflectedGroups.set(reflected,[]);
    reflectedGroups.get(reflected).push(i);
   }
  }
  const stagesFor=indices=>Object.fromEntries(fields.map(f=>[f,summary(indices.map(i=>this.data[f][i]).filter(Number.isFinite))]));
  const byPopulation=Object.fromEntries([...groups].map(([count,indices])=>[count,{
   blocks:indices.length,nonzeroBlocks:indices.filter(i=>this.nonzero[i]).length,
   maximumPaths:indices.reduce((n,i)=>Math.max(n,this.pathCount[i]),0),
   hardMisses:indices.filter(i=>this.data.completeRenderMs[i]>deadline).length,
   stages:stagesFor(indices)
  }]));
  const byActiveWithReflection=Object.fromEntries([...reflectedGroups].map(([count,indices])=>[count,{
   blocks:indices.length,nonzeroBlocks:indices.filter(i=>this.nonzero[i]).length,
   mappedVoiceCounts:Object.fromEntries(Array.from({length:count+1},(_,mapped)=>[
    mapped,indices.filter(i=>this.mappedWithReflection[i]===mapped).length])),
   maximumReflectedPaths:indices.reduce((n,i)=>Math.max(n,this.reflectionCount[i]),0),
   ...(this.expectedSurfaceId?{selectedWallBlocks:indices.filter(i=>this.selectedWall[i]).length}:{}),
   hardMisses:indices.filter(i=>this.data.completeRenderMs[i]>deadline).length,
   stages:stagesFor(indices)
  }]));
  const all=Array.from(this.data.completeRenderMs.subarray(0,this.blocks)),pcm=this.excerpt.subarray(0,this.excerptBytes);
  const indices=Array.from({length:this.blocks},(_,i)=>i),c=this.counts;
  const phaseSummary=rows=>({
   blocks:rows.length,renderMisses:rows.filter(i=>this.data.completeRenderMs[i]>deadline).length,
   throughPipeWriteMisses:rows.filter(i=>this.data.throughPipeWriteMs[i]>deadline).length,
   deliveredBlocks:rows.filter(i=>Number.isFinite(this.data.throughPipeWriteMs[i])).length,
   changedSelections:rows.filter(i=>c.added[i]+c.removed[i]>0).length,
   multiBounceBlocks:rows.filter(i=>c.order2[i]+c.order3Plus[i]>0).length,
   counts:Object.fromEntries(counts.filter(k=>!['active','moving','installed'].includes(k)).map(k=>[
    k,{total:rows.reduce((s,i)=>s+c[k][i],0),max:rows.reduce((s,i)=>Math.max(s,c[k][i]),0)}])),
   stages:stagesFor(rows)
  });
  const installedByActive=Object.fromEntries([...new Set(indices.filter(i=>c.installed[i]).map(i=>c.active[i]))].map(active=>{
   const rows=indices.filter(i=>c.installed[i]&&c.active[i]===active);
   return [active,{stationary:phaseSummary(rows.filter(i=>!c.moving[i])),moving:phaseSummary(rows.filter(i=>c.moving[i]))}];
  }));
  const withGc=row=>{if(!row)return null;
   const start=row.tail?.renderStartedAt??row.at-row.completeRenderMs,end=start+row.completeRenderMs;
   return {...row,gcOverlapMs:this.gcIntervals.reduce((ms,g)=>ms+Math.max(0,Math.min(end,g.startTime+g.duration)-Math.max(start,g.startTime)),0)};
  };
  const output={schema:1,scope:'authored inputs through normal clocked discard producer',node:process.version,reason,error:error?.message??null,
   deadlineMs:deadline,blocks:this.blocks,overflowBlocks:this.excess,nonzeroBlocks:this.nonzero.reduce((a,b)=>a+b,0),
   processingMs:summary(all),hardMisses:all.filter(ms=>ms>deadline).length,byPopulation,byActiveWithReflection,
   installedByActive,allBlocks:phaseSummary(indices),blockTimesFile:'clocked-blocks.csv',
   acceleration:this.backend?.diagnostics(),gpuSamples:this.gpuSamples,gpuSamplesOmitted:this.gpuSampleCount-this.gpuSamples.length,
   sceneCandidates:this.sceneCandidates,sceneCandidatesOmitted:this.sceneCandidatesOmitted,
   timingBasis:'Complete render encloses synthesis, propagation, stereo processing and bookkeeping. Candidate preparation includes history sampling, retarded-time and finite-face geometry. Visibility is the awaited backend query. Selection includes finishing routes and per-source ranking. Application includes headroom filtering and mixer slot updates. Through-pipe time includes ingress, render, framing, diagnostics and write completion. Producer wake is measured separately.',
   expectedSurfaceId:this.expectedSurfaceId,
   ...(this.staleContributors?{staleContributors:{...this.staleContributors}}:{}),
   missSamples:this.misses.map(withGc),worst:withGc(this.worst),gcIntervalsOmitted:Math.max(0,this.gc.count-this.gcIntervals.length),
   lifecycleMs:performance.now()-this.began,preCreditMs:this.readyAt-this.began,preparation:this.preparation,
   creditHighWater:this.creditHighWater,maxSampledRssBytes:this.maxRss,cpu:process.cpuUsage(),gc:this.gc,
   excerptFrames:pcm.length/8,excerptSha256:pcm.length?createHash('sha256').update(pcm).digest('hex'):null};
  if(pcm.length){
   const wav=Buffer.alloc(44);
   wav.write('RIFF');wav.writeUInt32LE(pcm.length+36,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
   wav.writeUInt16LE(3,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(384000,28);
   wav.writeUInt16LE(8,32);wav.writeUInt16LE(32,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);
   fs.writeFileSync(path.join(this.directory,'authored-fleet-excerpt.wav'),Buffer.concat([wav,pcm]),{flag:'wx'});
  }
  fs.writeFileSync(path.join(this.directory,'clocked-fleet-producer.json'),JSON.stringify(output,null,2),{flag:'wx'});
  const columns=['block','nonzero','playerX','playerY','playerZ',...counts,...fields];
  const csv=indices.map(i=>[i,this.nonzero[i],...[0,1,2].map(axis=>{
   const p=this.playerPositions[3*i+axis];return Number.isFinite(p)?p.toFixed(6):'';
  }),...counts.map(k=>c[k][i]),...fields.map(k=>Number.isFinite(this.data[k][i])?this.data[k][i].toFixed(6):'')].join(','));
  fs.writeFileSync(path.join(this.directory,'clocked-blocks.csv'),[columns.join(','),...csv,''].join('\n'),{flag:'wx'});
 }
}
