// Private discard-host evidence. It consumes the real renderer's measurements
// and RA07 bytes. Disk writes, sorting and WAV formatting occur after stop.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {performance,PerformanceObserver} from 'node:perf_hooks';

const maximumBlocks=16384,frames=512,deadline=frames/48;
const renderStageFields=['admissionMs','sourceSelectionMs','stockSynthesisMs','propagationMs','pcmMs','bookkeepingMs'];
const fields=['completeRenderMs',...renderStageFields,'framingMs','producerWakeMs','controlIngressMs'];
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
  this.population=new Uint8Array(maximumBlocks);
  this.nonzero=new Uint8Array(maximumBlocks);
  this.pathCount=new Uint16Array(maximumBlocks);
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
 credit(blocks,at){
  for(let i=0;i<blocks;i++)this.creditTimes[this.creditWrite++%8]=at;
  this.creditHighWater=Math.max(this.creditHighWater,this.creditWrite-this.creditRead);
 }
 begin(at){this.wakeMs=at-this.creditTimes[this.creditRead++%8];}
 block(engine,framingMs,controlIngressMs,nonzero,packet){
  if(this.blocks===maximumBlocks){this.excess++;return;}
  const index=this.blocks++,stages=engine.lastRenderStages01;
  this.data.completeRenderMs[index]=engine.lastCompleteRenderMs;
  this.data.framingMs[index]=framingMs;
  this.data.producerWakeMs[index]=this.wakeMs;
  this.data.controlIngressMs[index]=controlIngressMs;
  for(const field of renderStageFields)this.data[field][index]=stages?.[field]??0;
  const population=engine.fleetPopulation?.discovered??engine.snapshots.at(-1)?.frame.vehicles.length??0;
  this.population[index]=population;
  this.nonzero[index]=Number(nonzero);
  this.pathCount[index]=engine.pipeline.lastControl.paths.length;
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
  const groups=new Map();
  for(let i=0;i<this.blocks;i++){
   const key=this.population[i];
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(i);
  }
  const byPopulation=Object.fromEntries([...groups].map(([count,indices])=>[count,{
   blocks:indices.length,nonzeroBlocks:indices.filter(i=>this.nonzero[i]).length,
   maximumPaths:indices.reduce((n,i)=>Math.max(n,this.pathCount[i]),0),
   hardMisses:indices.filter(i=>this.data.completeRenderMs[i]>deadline).length,
   stages:Object.fromEntries(fields.map(f=>[f,summary(indices.map(i=>this.data[f][i]))]))
  }]));
  const all=Array.from(this.data.completeRenderMs.subarray(0,this.blocks)),pcm=this.excerpt.subarray(0,this.excerptBytes);
  const withGc=row=>{if(!row)return null;
   const start=row.tail?.renderStartedAt??row.at-row.completeRenderMs,end=start+row.completeRenderMs;
   return {...row,gcOverlapMs:this.gcIntervals.reduce((ms,g)=>ms+Math.max(0,Math.min(end,g.startTime+g.duration)-Math.max(start,g.startTime)),0)};
  };
  const output={schema:1,scope:'authored inputs through normal clocked discard producer',node:process.version,reason,error:error?.message??null,
   deadlineMs:deadline,blocks:this.blocks,overflowBlocks:this.excess,nonzeroBlocks:this.nonzero.reduce((a,b)=>a+b,0),
   processingMs:summary(all),hardMisses:all.filter(ms=>ms>deadline).length,byPopulation,
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
 }
}
