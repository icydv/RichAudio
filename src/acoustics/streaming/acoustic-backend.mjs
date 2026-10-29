// Acoustic visibility acceleration only. The exact finite-path/material solver
// and PCM renderer remain shared. A GPU mask may remove only definitely-clear
// surface tests; candidate contacts still use the original double-precision CPU
// geometry, openings, uncertainty and missing-region rules.
import {performance} from 'node:perf_hooks';
import {querySegment} from '../research/local-geometry.mjs';
import {AcousticGpuClient,gpuLimits} from '../gpu/client.mjs';
const modes=['auto','cpu','gpu'];
const cpuStamp=()=>typeof process.threadCpuUsage==='function'?process.threadCpuUsage():process.cpuUsage();
const cpuMs=(start)=>{const end=cpuStamp();return (end.user-start.user+end.system-start.system)/1000;};
const measure=fn=>{const start=performance.now(),cpu=cpuStamp(),value=fn();return {value,wallMs:performance.now()-start,cpuMs:cpuMs(cpu)};};
const ewma=(old,n)=>old===null?n:old*.8+n*.2;

export class AcousticAcceleration {
  constructor({mode='cpu',clientFactory=()=>new AcousticGpuClient(),now=()=>performance.now(),deadlineMs=8,
    minimumPairs=2048,cooldownMs=2000}={}){
    if(!modes.includes(mode)||typeof clientFactory!=='function'||typeof now!=='function'||
      !Number.isFinite(deadlineMs)||deadlineMs<1||deadlineMs>10||!Number.isInteger(minimumPairs)||minimumPairs<1||
      !Number.isFinite(cooldownMs)||cooldownMs<100)throw Error('Acoustic acceleration policy');
    this.requested=mode;this.factory=clientFactory;this.now=now;this.deadlineMs=deadlineMs;this.minimumPairs=minimumPairs;this.cooldownMs=cooldownMs;
    this.client=null;this.capability=null;this.initializing=null;this.initializationMs=null;this.warmupMs=null;
    this.attempts=0;this.closed=false;this.busy=false;this.active='cpu';this.fallbackReason=mode==='cpu'?null:'gpu-initializing';
    this.cooldownUntil=0;this.nextProbeAt=0;this.probeAttempts=0;this.autoGpu=false;this.lastSwitch=-Infinity;this.wins=0;this.losses=0;this.samples=new Map();this.lastHelperCpu=null;
    this.totals={requests:0,gpuAcousticDispatches:0,gpuCompletedBatches:0,gpuResultsApplied:0,calibrationCpuSurfaceTests:0,cpuFallbacks:0,deadlineMisses:0,
      droppedResults:0,invalidResults:0,cpuSurfaceTests:0,gpuSurfaceTests:0,avoidedCpuSurfaceTests:0,backendChanges:0};
    this.revision=0;this.last={};this.lastCalibration=null;this.lastRejectedAttempt=null;if(mode==='gpu')this.start();
  }
  start(){
    if(this.requested==='cpu'||this.closed||this.initializing||this.client||this.attempts>=3||this.now()<this.cooldownUntil)return this.initializing;
    this.attempts++;let client;const started=performance.now();
    try{client=this.client=this.factory();}catch(error){this.capability={supported:false,hardware:false,reason:error.message};
      this.fallbackReason='GPU client initialization failed: '+error.message;this.cooldownUntil=this.now()+this.cooldownMs;return null;}
    this.initializing=(async()=>{
      try{
        const cap=await client.capability();this.capability=cap;this.initializationMs=performance.now()-started;
        if(!cap.supported||!cap.hardware){this.fallbackReason=cap.reason??'hardware-compute-unavailable';return;}
        // Shader/device cold initialization is not acoustic output and does not
        // count as a completed acoustic dispatch. Production continues on CPU.
        const warm=await client.dispatch({segments:[{a:[-1,0,0],b:[1,0,0]}],
          surfaces:[{center:[0,0,0],normal:[1,0,0],min:[0,-1,-1],max:[0,1,1]}],generation:0,deadlineMs:100});
        if(warm.masks[0]!==1)throw Error('GPU warmup correctness failure');
        this.warmupMs=warm.metrics.roundTripMs;this.lastHelperCpu=warm.metrics.helperCumulativeCpuMs??null;this.fallbackReason=null;
      }catch(error){this.fallbackReason=error.message;client.close();if(this.client===client)this.client=null;this.cooldownUntil=this.now()+this.cooldownMs;}
      finally{this.initializing=null;}
    })();return this.initializing;
  }
  async ready(){this.start();if(this.initializing)await this.initializing;return this.capability;}
  setMode(mode){if(!modes.includes(mode))throw Error('Acoustic acceleration value');if(mode===this.requested)return;
    this.revision++;this.requested=mode;this.autoGpu=false;this.wins=this.losses=this.probeAttempts=0;this.nextProbeAt=0;this.lastSwitch=this.now();
    if(mode==='gpu')this.start();else if(mode==='cpu')this.fallbackReason=null;}
  cpu(tile,segments){return measure(()=>segments.map(s=>querySegment(tile,s.a,s.b)));}
  recordCpu(key,m){let sample=this.samples.get(key);if(!sample){sample={cpuWall:null,cpuCpu:null,gpuWall:null,gpuCpu:null,gpuSamples:0,gpuCpuTotal:0};this.samples.set(key,sample);}
    sample.cpuWall=ewma(sample.cpuWall,m.wallMs);sample.cpuCpu=ewma(sample.cpuCpu,m.cpuMs);return sample;}
  useCpu(tile,segments,reason,key){const m=this.cpu(tile,segments);this.recordCpu(key,m);this.active='cpu';this.fallbackReason=reason;
    if(this.requested==='gpu')this.totals.cpuFallbacks++;this.last={queryWallMs:m.wallMs,queryCpuMs:m.cpuMs,cpuTaskWallMs:m.wallMs,cpuTaskCpuMs:m.cpuMs,taskWallMs:m.wallMs,
      taskCpuMs:m.cpuMs,segments:segments.length,surfaces:tile.surfaces.length};
    this.totals.cpuSurfaceTests+=segments.length*tile.surfaces.length;return m.value;}
  async query(tile,segments,{generation=0}={}){
    if(!Array.isArray(segments)||segments.length>16384||!Number.isInteger(generation)||generation<0||generation>0xffffffff)
      throw Error('Bounded acoustic visibility batch');
    const pairs=segments.length*tile.surfaces.length,key=Math.floor(Math.log2(Math.max(1,pairs)));
    this.totals.requests++;
    if(this.closed||this.requested==='cpu')return this.useCpu(tile,segments,this.closed?'backend-closed':null,key);
    if(!pairs)return this.useCpu(tile,segments,'no-visibility-work',key);
    if(this.requested==='auto'&&pairs<this.minimumPairs)return this.useCpu(tile,segments,'small-workload-prefers-cpu',key);
    if(this.requested==='auto'&&!this.autoGpu&&this.now()<this.nextProbeAt)return this.useCpu(tile,segments,'cpu-measured-faster-probe-cooldown',key);
    this.start();
    if(this.initializing||!this.client||!this.capability?.supported||this.client.closed){
      const why=this.initializing?'gpu-initializing':this.fallbackReason??'hardware-compute-unavailable';
      return this.useCpu(tile,segments,why,key);
    }
    if(this.busy)return this.useCpu(tile,segments,'bounded-gpu-queue-occupied',key);
    if(this.now()<this.cooldownUntil)return this.useCpu(tile,segments,'gpu-deadline-cooldown',key);
    const sample=this.samples.get(key);
    if(this.requested==='auto'&&this.autoGpu&&!sample){this.autoGpu=false;this.wins=this.losses=0;this.lastSwitch=this.now();this.totals.backendChanges++;}
    const probe=this.requested==='auto'&&!this.autoGpu,selectionRevision=this.revision;
    // Auto probes real equal-work inputs. Calibration's duplicate work is
    // explicit; the returned control is CPU until repeated GPU wins are proved.
    let reference=probe?this.cpu(tile,segments):null;
    if(reference){this.recordCpu(key,reference);this.totals.calibrationCpuSurfaceTests+=pairs;}
    this.busy=true;const started=performance.now(),cpu=cpuStamp(),client=this.client,attemptMetrics=[];
    const execute=async()=>{try{
      let ownCpuMs=0,stageCpu=cpuStamp();
      const origin=tile.bounds.min.map((x,i)=>(x+tile.bounds.max[i])/2);
      const local=p=>p.map((x,i)=>x-origin[i]);
      const surfaces=tile.surfaces.map(s=>({center:local(s.center),normal:s.normal,
        min:local([0,1,2].map(i=>Math.min(...s.corners.map(p=>p[i])))),
        max:local([0,1,2].map(i=>Math.max(...s.corners.map(p=>p[i]))))}));
      ownCpuMs+=cpuMs(stageCpu);
      const results=[],metrics=[];let exactTests=0;
      for(let start=0;start<segments.length;start+=gpuLimits.segments){
        stageCpu=cpuStamp();
        const batch=segments.slice(start,start+gpuLimits.segments),remaining=this.deadlineMs-(performance.now()-started);
        if(remaining<1)throw Error('GPU acoustic deadline exceeded');
        const localized=batch.map(s=>({a:local(s.a),b:local(s.b)}));ownCpuMs+=cpuMs(stageCpu);
        const result=await client.dispatch({segments:localized,surfaces,generation,deadlineMs:remaining});
        ownCpuMs+=(result.metrics?.nodeSubmissionCpuMs??0)+(result.metrics?.nodeDecodeCpuMs??0);stageCpu=cpuStamp();
        if(result.generation!==generation||!(result.masks instanceof Uint32Array)||result.masks.length!==batch.length*4||
          result.metrics?.completedDispatch!==true||result.metrics?.hardware!==true)throw Error('GPU acoustic context or completion mismatch');
        this.totals.gpuAcousticDispatches++;this.totals.gpuCompletedBatches++;metrics.push(result.metrics);attemptMetrics.push(result.metrics);
        for(let i=0;i<batch.length;i++){
          const indices=[];
          for(let word=0;word<4;word++){let bits=result.masks[i*4+word]>>>0;
            const available=Math.max(0,Math.min(32,surfaces.length-word*32)),allowed=available===32?0xffffffff:2**available-1;
            if((bits&~allowed)!==0)throw Error('GPU mask outside finite scene');
            while(bits){const bit=31-Math.clz32((bits&-bits)>>>0);indices.push(word*32+bit);bits=(bits&(bits-1))>>>0;}}
          const q=querySegment(tile,batch[i].a,batch[i].b,{surfaceIndices:indices});exactTests+=q.surfaceTests;results.push(q);
        }
        ownCpuMs+=cpuMs(stageCpu);
      }
      if(selectionRevision!==this.revision||this.closed)throw Error('GPU result superseded by backend selection');
      const taskWallMs=performance.now()-started,taskCpuMs=ownCpuMs,helperTotal=metrics.at(-1)?.helperCumulativeCpuMs??null;
      const helperCpuMs=helperTotal!==null&&this.lastHelperCpu!==null?Math.max(0,helperTotal-this.lastHelperCpu):metrics.reduce((n,m)=>n+(m.helperCpuMs??0),0);
      this.lastHelperCpu=helperTotal;
      if(taskWallMs>this.deadlineMs)throw Error('GPU acoustic deadline exceeded');
      if(reference){
        for(let i=0;i<results.length;i++)if(JSON.stringify({hits:results[i].hits,ambiguous:results[i].ambiguous,unknown:results[i].unknown})!==
          JSON.stringify({hits:reference.value[i].hits,ambiguous:reference.value[i].ambiguous,unknown:reference.value[i].unknown}))throw Error('GPU conservative mask disagrees with CPU reference');
      }
      this.totals.cpuSurfaceTests+=exactTests;this.totals.gpuSurfaceTests+=pairs;this.totals.avoidedCpuSurfaceTests+=pairs-exactTests;
      const gpuTimingValid=metrics.every(m=>m.gpuTimingValid===true&&[m.gpuExecutionMs,m.gpuUploadMs,m.gpuCopyMs].every(Number.isFinite));
      const aggregate={gpuTimingValid,gpuSubmitMs:metrics.reduce((n,m)=>n+(m.submitMs??0),0),gpuExecutionMs:gpuTimingValid?metrics.reduce((n,m)=>n+m.gpuExecutionMs,0):null,
        gpuTransferMs:gpuTimingValid?metrics.reduce((n,m)=>n+m.gpuUploadMs+m.gpuCopyMs,0):null,gpuReadbackMs:metrics.reduce((n,m)=>n+(m.readbackMs??0),0),
        gpuRoundTripMs:metrics.reduce((n,m)=>n+(m.roundTripMs??0),0),helperCpuMs,helperCumulativeCpuMs:metrics.at(-1)?.helperCumulativeCpuMs??null,
        gpuOwnedBytes:metrics.at(-1)?.ownedBufferBytes??null,gpuDeviceUsageBytes:metrics.at(-1)?.processVideoMemoryBytes??null,
        helperWorkingSetBytes:metrics.at(-1)?.processWorkingSetBytes??null};
      const diagnostic={...aggregate,queryWallMs:taskWallMs,queryCpuMs:taskCpuMs,taskWallMs,taskCpuMs,cpuReferenceWallMs:reference?.wallMs??sample?.cpuWall??null,
        cpuReferenceCpuMs:reference?.cpuMs??sample?.cpuCpu??null,segments:segments.length,surfaces:surfaces.length,exactCpuSurfaceTests:exactTests};
      if(probe)this.lastCalibration=diagnostic;else this.last=diagnostic;
      if(this.requested==='auto'){
        const baseline=this.samples.get(key);baseline.gpuWall=ewma(baseline.gpuWall,taskWallMs);baseline.gpuCpuTotal+=taskCpuMs+helperCpuMs;baseline.gpuSamples++;
        baseline.gpuCpu=baseline.gpuCpuTotal/baseline.gpuSamples;
        const wins=baseline.gpuWall<baseline.cpuWall*.8&&baseline.gpuCpu<baseline.cpuCpu*.9;
        if(probe){this.probeAttempts++;this.wins=wins?this.wins+1:0;if(this.wins>=3&&this.now()-this.lastSwitch>=this.cooldownMs){this.autoGpu=true;this.lastSwitch=this.now();this.totals.backendChanges++;}
          else if(this.probeAttempts>=3){this.nextProbeAt=this.now()+this.cooldownMs;this.probeAttempts=0;}}
        else{this.losses=wins?0:this.losses+1;if(this.losses>=3&&this.now()-this.lastSwitch>=this.cooldownMs){this.autoGpu=false;this.cooldownUntil=this.now()+this.cooldownMs;this.lastSwitch=this.now();this.totals.backendChanges++;}}
      }
      if(probe)return reference.value;
      this.active='gpu';this.fallbackReason=null;this.totals.gpuResultsApplied++;return results;
    }catch(error){
      this.lastRejectedAttempt={reason:error.message,wallMs:performance.now()-started,completedBatches:attemptMetrics.length,
        gpuExecutionMs:attemptMetrics.length&&attemptMetrics.every(m=>Number.isFinite(m.gpuExecutionMs))?attemptMetrics.reduce((n,m)=>n+m.gpuExecutionMs,0):null,
        helperCpuMs:null,helperCpuReason:'Late or rejected helper work is not attributed as zero CPU'};
      this.totals.droppedResults++;if(/deadline/.test(error.message))this.totals.deadlineMisses++;else this.totals.invalidResults++;
      this.autoGpu=false;this.wins=this.losses=0;this.cooldownUntil=this.now()+this.cooldownMs;this.fallbackReason=error.message;
      if(this.client?.closed)this.client=null;
      if(reference){this.lastCalibration={failed:true,reason:error.message,taskWallMs:performance.now()-started};this.totals.cpuFallbacks++;return reference.value;}
      const value=this.useCpu(tile,segments,error.message,key);this.last.queryWallMs=performance.now()-started;this.last.queryCpuMs=cpuMs(cpu);return value;
    }finally{this.busy=false;}};
    const pending=execute();
    if(probe){
      this.active='cpu';this.fallbackReason='measuring-cpu-gpu-crossover';this.last={cpuTaskWallMs:reference.wallMs,cpuTaskCpuMs:reference.cpuMs,
        taskWallMs:reference.wallMs,taskCpuMs:reference.cpuMs,segments:segments.length,surfaces:tile.surfaces.length};
      // The already-computed CPU result is not held waiting for shadow GPU
      // calibration. At most one shadow exists and its result cannot render.
      void pending;return reference.value;
    }
    return pending;
  }
  diagnostics(){return {requestedAcceleration:this.requested,activeAcceleration:this.active,gpuDevice:this.capability?.device??null,
    gpuCapability:!this.capability?'unverified':this.capability.supported&&this.capability.hardware?'hardware-directcompute':'unsupported',
    gpuApi:this.capability?.api??null,usesHardwareRayTracing:false,rayTracingCapability:'not-probed',rayTracingBackend:'not-implemented',helperCumulativeCpuMs:this.lastHelperCpu,
    fallbackReason:this.fallbackReason,initializationMs:this.initializationMs,warmupMs:this.warmupMs,initializationAttempts:this.attempts,
    accelerationDeadlineMs:this.deadlineMs,autoMinimumPairs:this.minimumPairs,autoGpuQualified:this.autoGpu,lastCalibration:this.lastCalibration,lastRejectedGpuAttempt:this.lastRejectedAttempt,...this.totals,...this.last,
    cpuAccounting:typeof process.threadCpuUsage==='function'?'Node thread CPU plus helper request CPU':'Node process CPU plus helper request CPU',
    cpuAccountingNote:'Per-task counters may be quantized; use aggregate Node plus helper CPU deltas for savings'};}
  close(){this.closed=true;this.client?.close();this.client=null;}
}
