// One owned compute helper, one bounded request in flight. No game/audio APIs.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {isPreparedGpuGeometry01,preparedGpuSurfaceIdentity01} from './geometry.mjs';
export const gpuLimits=Object.freeze({segments:4096,surfaces:128,sceneSurfaces:4096,surfacePages:32,maximumMaskBytes:4096*32*16,header:32,maximumMetrics:8192,marginMetres:.005});
export const gpuMaskLayout='segment-page-uint4-v2';
export const gpuMaskWords=surfaceCount=>Math.ceil(surfaceCount/gpuLimits.surfaces)*4;
export const defaultGpuExecutable=fileURLToPath(new URL('../../../build/acoustic-gpu/RichAudio.AcousticGpu.exe',import.meta.url));
const check=(ok,why)=>{if(!ok)throw Error(why);};
const coordinate=v=>Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=512);
const littleEndian=new Uint8Array(new Uint32Array([0x01020304]).buffer)[0]===4;
const stageCpuStamp=()=>typeof process.threadCpuUsage==='function'?process.threadCpuUsage():process.cpuUsage();
const stageCpuMs=start=>{const end=stageCpuStamp();return (end.user-start.user+end.system-start.system)/1000;};
const stageCpuAccounting=typeof process.threadCpuUsage==='function'?'Node-thread-synchronous-stages':'Node-process-synchronous-stages-includes-other-threads';
const knownSoftwareNames=new Set(['microsoft basic render driver','microsoft basic display adapter','microsoft warp','microsoft warp adapter',
  'microsoft warp renderer','microsoft software rasterizer','microsoft reference rasterizer','warp','software adapter']);
const softwareAdapter=cap=>(Number.isInteger(cap.adapterFlags)&&(cap.adapterFlags&2)!==0)||
  (cap.vendorId===0x1414&&cap.deviceId===0x008c)||
  knownSoftwareNames.has(String(cap.device??'').replace(/\0+$/,'').trim().replace(/\s+/g,' ').toLowerCase());
export class AcousticGpuClient {
  constructor({executable=defaultGpuExecutable,initializationDeadlineMs=5000}={}){
    check(typeof executable==='string'&&initializationDeadlineMs>=100&&initializationDeadlineMs<=10000,'GPU helper options');
    this.executable=executable;this.initializationDeadlineMs=initializationDeadlineMs;this.child=null;this.ready=null;this.cap=null;
    this.receiveStorage=Buffer.allocUnsafe(32+8192+gpuLimits.maximumMaskBytes);this.buffer=Buffer.alloc(0);this.geometryPayloads=new WeakMap();this.pending=null;this.nextId=0;this.closed=false;this.processClosure=null;
    this.stats={submitted:0,completed:0,rejected:0,deadlines:0,maximumRoundTripMs:0};
  }
  async capability(){
    if(this.cap)return this.cap;
    if(this.ready)return this.ready;
    if(this.closed||process.platform!=='win32'||!existsSync(this.executable))return this.cap={supported:false,hardware:false,reason:this.closed?'GPU client closed':process.platform!=='win32'?'Windows DirectCompute unavailable':'GPU helper not built'};
    this.ready=new Promise(resolve=>{
      this.resolveCapability=resolve;
      this.initialTimer=setTimeout(()=>this.fail('GPU initialization deadline'),this.initializationDeadlineMs);
      const closure=this.processClosure={pid:null,processStarted:false,exitObserved:false,exitCode:null,exitSignal:null,closeObserved:false,closeCode:null,closeSignal:null,spawnErrorCode:null,processErrorCode:null,launchFailedSynchronously:false};
      closure.done=new Promise(yes=>{closure.resolve= yes;});
      let child;try{child=this.child=spawn(this.executable,[],{stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false});closure.pid=child.pid??null;}
      catch(error){closure.spawnErrorCode=error.code??'unknown';closure.launchFailedSynchronously=true;closure.resolve();this.fail('GPU helper process unavailable');return;}
      child.once('spawn',()=>{closure.processStarted=true;closure.pid=child.pid??null;});
      child.stdout.on('data',b=>this.receive(b));
      // Diagnostic text is never a protocol substitute and cannot grow unbounded.
      let stderrBytes=0;child.stderr.on('data',b=>{stderrBytes+=b.length;if(stderrBytes>8192)this.fail('GPU diagnostic bound');});
      child.on('error',error=>{if(!closure.processStarted)closure.spawnErrorCode=error.code??'unknown';else closure.processErrorCode=error.code??'unknown';this.fail('GPU helper process unavailable');});
      child.once('exit',(code,signal)=>{closure.exitObserved=true;closure.exitCode=code;closure.exitSignal=signal;this.fail('GPU helper disconnected');});
      child.once('close',(code,signal)=>{closure.closeObserved=true;closure.closeCode=code;closure.closeSignal=signal;closure.resolve();this.fail('GPU helper disconnected');});
      child.stdin.on('error',()=>this.fail('GPU helper input unavailable'));
    });
    return this.ready;
  }
  receive(chunk){
    if(this.closed)return;
    const decodeStarted=stageCpuStamp(),decodingPending=this.pending;let decodeRecorded=false;
    try{
      check(this.buffer.length+chunk.length<=this.receiveStorage.length,'GPU response buffer bound');chunk.copy(this.receiveStorage,this.buffer.length);this.buffer=this.receiveStorage.subarray(0,this.buffer.length+chunk.length);
      const consume=bytes=>{const length=this.buffer.length-bytes;this.buffer.copy(this.receiveStorage,0,bytes);this.buffer=this.receiveStorage.subarray(0,length);};
      if(!this.cap){
        if(this.buffer.length<4)return;const n=this.buffer.readUInt32LE(0);check(n>0&&n<=8192,'GPU capability frame bound');if(this.buffer.length<4+n)return;
        const cap=JSON.parse(this.buffer.subarray(4,4+n).toString('utf8'));consume(4+n);
        check(cap&&cap.schemaVersion===1&&typeof cap.supported==='boolean'&&typeof cap.hardware==='boolean','GPU capability schema');
        check(!cap.supported||!softwareAdapter(cap),'GPU software adapter is not hardware acceleration');
        const legacy=cap.maximumSurfaces===128,extended=cap.maximumSurfaces===4096&&cap.visibilityProtocol===2&&cap.legacyVisibilityProtocol===1&&cap.surfacePageSize===128&&cap.maximumSurfacePages===32&&cap.maskLayout===gpuMaskLayout;
        check(!cap.supported||(cap.hardware&&cap.api==='Direct3D11-ComputeShader5'&&typeof cap.device==='string'&&cap.device.length<=128&&cap.maximumSegments===4096&&(legacy||extended)),'GPU hardware capability');
        this.cap=Object.freeze(cap);clearTimeout(this.initialTimer);this.resolveCapability(cap);this.resolveCapability=null;
      }
      while(this.buffer.length>=32){
        const h=this.buffer,n=h.readUInt32LE(20),j=h.readUInt32LE(24),pending=this.pending;
        const protocolVersion=h.readUInt32LE(4);
        check(h.readUInt32LE(0)===0x32384f52&&(protocolVersion===1||protocolVersion===2)&&h.readUInt32LE(28)===0&&n<=gpuLimits.maximumMaskBytes&&j>0&&j<=8192,'GPU response framing');
        if(this.buffer.length<32+n+j)return;
        check(pending&&h.readUInt32LE(8)===pending.id&&h.readUInt32LE(12)===pending.generation&&protocolVersion===(pending.protocolVersion??1),'GPU request/generation/protocol mismatch');
        const metrics=JSON.parse(this.buffer.subarray(32,32+j).toString('utf8')),status=h.readUInt32LE(16);
        const payload=this.buffer.subarray(32+j,32+j+n);
        const roundTripMs=performance.now()-pending.started;
        this.stats.maximumRoundTripMs=Math.max(this.stats.maximumRoundTripMs,roundTripMs);
        if(status!==0){clearTimeout(pending.timer);this.pending=null;this.stats.rejected++;if(status===1)this.stats.deadlines++;pending.reject(Error(metrics.reason??'GPU operation rejected'));this.close();return;}
        check(n===pending.maskBytes&&metrics.completedDispatch===true&&metrics.hardware===true,'GPU completion proof');
        check(metrics.segments===pending.segmentCount&&metrics.surfacePairs===pending.segmentCount*pending.surfaceCount&&
          ['submitMs','completionWaitMs','readbackMs','totalMs','helperCpuMs'].every(k=>Number.isFinite(metrics[k])&&metrics[k]>=0),'GPU result metrics/context');
        const words=pending.maskWordsPerSegment??4;
        if(protocolVersion===2)check(metrics.maskLayout===gpuMaskLayout&&metrics.surfaceCount===pending.surfaceCount&&metrics.maskWordsPerSegment===words&&metrics.surfacePages===words/4&&metrics.readbackCount===1&&metrics.readbackBytes===n,'GPU extended mask layout/context');
        // Copy away from the framing buffer; consumers may retain this generation.
        const masks=new Uint32Array(n/4);
        if(littleEndian)new Uint8Array(masks.buffer).set(payload);else for(let i=0;i<masks.length;i++)masks[i]=payload.readUInt32LE(i*4);
        consume(32+j+n);
        // Complete 32-bit words have no out-of-range bits. Only the partial
        // final word and page padding need inspection, even for a 2MiB mask.
        for(let i=0;i<pending.segmentCount;i++)for(let word=pending.surfaceCount>>>5;word<words;word++){
          const remaining=Math.max(0,Math.min(32,pending.surfaceCount-word*32));
          if(remaining<32)check((masks[i*words+word]>>>remaining)===0,'GPU out-of-range surface mask');
        }
        const nodeDecodeCpuMs=(pending.nodeDecodeCpuMs??0)+stageCpuMs(decodeStarted);decodeRecorded=true;
        const finalRoundTripMs=performance.now()-pending.started;
        this.stats.maximumRoundTripMs=Math.max(this.stats.maximumRoundTripMs,finalRoundTripMs);
        if(finalRoundTripMs>pending.deadlineMs){this.stats.deadlines++;throw Error('GPU completed after round-trip deadline');}
        clearTimeout(pending.timer);this.pending=null;const cpu=process.cpuUsage(pending.cpuStart);this.stats.completed++;
        pending.resolve({requestId:pending.id,generation:pending.generation,protocolVersion,maskWordsPerSegment:words,masks,metrics:{...metrics,roundTripMs:finalRoundTripMs,
          nodeSubmissionCpuMs:pending.nodeSubmissionCpuMs??0,nodeDecodeCpuMs,nodeStageCpuAccounting:stageCpuAccounting,
          // Compatibility only: this spans an await and can include unrelated
          // activity. Auto must use synchronous stage counters instead.
          nodeProcessCpuMs:(cpu.user+cpu.system)/1000}});
      }
    }catch(error){this.fail(error.message);}
    finally{if(!decodeRecorded&&decodingPending&&this.pending===decodingPending)decodingPending.nodeDecodeCpuMs=(decodingPending.nodeDecodeCpuMs??0)+stageCpuMs(decodeStarted);}
  }
  async dispatch({segments,surfaces,geometry=null,generation=0,deadlineMs=8,requestId}={}){
    const cap=await this.capability(),submissionStarted=stageCpuStamp();check(cap.supported&&!this.closed,'GPU unavailable: '+(cap.reason??'closed'));
    check(!this.pending,'GPU queue already occupied');check(Array.isArray(segments)&&segments.length>=1&&segments.length<=4096&&Array.isArray(surfaces)&&surfaces.length>=1&&surfaces.length<=Math.min(gpuLimits.sceneSurfaces,cap.maximumSurfaces??128),'GPU workload bound');
    check(geometry===null||isPreparedGpuGeometry01(geometry)&&geometry.surfaceCount===surfaces.length&&preparedGpuSurfaceIdentity01(geometry,surfaces),'GPU prepared geometry capability/count/identity');
    const protocolVersion=surfaces.length>128?2:1,maskWordsPerSegment=gpuMaskWords(surfaces.length);
    check(protocolVersion===1||cap.visibilityProtocol===2&&cap.maskLayout===gpuMaskLayout,'GPU extended mask protocol not negotiated');
    check(Number.isInteger(generation)&&generation>=0&&generation<=0xffffffff&&Number.isFinite(deadlineMs)&&deadlineMs>=1&&deadlineMs<=100,'GPU context/deadline');
    const id=requestId??this.nextId+1;check(Number.isInteger(id)&&id>this.nextId&&id<=0xffffffff,'GPU request order');this.nextId=id;
    const started=performance.now(),cpuStart=process.cpuUsage();
    const bytes=Buffer.alloc(32+segments.length*32+surfaces.length*64);
    bytes.writeUInt32LE(0x32384752,0);bytes.writeUInt32LE(protocolVersion,4);bytes.writeUInt32LE(id,8);bytes.writeUInt32LE(generation,12);bytes.writeUInt32LE(segments.length,16);bytes.writeUInt32LE(surfaces.length,20);bytes.writeFloatLE(deadlineMs,24);
    let at=32,target=bytes;const put=v=>{check(coordinate(v),'GPU local finite coordinates');for(const x of v){target.writeFloatLE(x,at);at+=4;}target.writeFloatLE(0,at);at+=4;};
    for(const segment of segments){put(segment.a??segment[0]);put(segment.b??segment[1]);}
    const surfaceAt=at;let packed=geometry?.bodyBytes??this.geometryPayloads.get(surfaces);
    if(!packed){target=packed=Buffer.alloc(surfaces.length*64);at=0;for(const surface of surfaces){put(surface.center);put(surface.normal);put(surface.min??surface.lo);put(surface.max??surface.hi);}
      if(Object.isFrozen(surfaces)&&surfaces.every(s=>Object.isFrozen(s)&&[s.center,s.normal,s.min??s.lo,s.max??s.hi].every(Object.isFrozen)))this.geometryPayloads.set(surfaces,packed);}
    bytes.set(packed,surfaceAt);
    this.stats.submitted++;
    return new Promise((resolve,reject)=>{
      const pending=this.pending={id,generation,protocolVersion,maskWordsPerSegment,segmentCount:segments.length,surfaceCount:surfaces.length,maskBytes:segments.length*maskWordsPerSegment*4,deadlineMs,resolve,reject,started,cpuStart,nodeDecodeCpuMs:0,
        timer:setTimeout(()=>{this.stats.deadlines++;this.fail('GPU round-trip deadline exceeded');},Math.max(1,deadlineMs-(performance.now()-started)))};
      try{this.child.stdin.write(bytes,error=>{if(error)this.fail('GPU request write failed');});}
      catch{this.fail('GPU request write failed');}
      finally{pending.nodeSubmissionCpuMs=stageCpuMs(submissionStarted);}
    });
  }
  fail(reason){
    if(this.closed)return;
    if(!this.cap){this.cap=Object.freeze({supported:false,hardware:false,reason});clearTimeout(this.initialTimer);this.resolveCapability?.(this.cap);this.resolveCapability=null;}
    if(this.pending){const p=this.pending;this.pending=null;clearTimeout(p.timer);this.stats.rejected++;p.reject(Error(reason));}
    this.close();
  }
  // An opt-in shutdown observer for controllers/tests. The render path keeps
  // synchronous close(); observing closure never extends a dispatch deadline,
  // closes a process, retries work, or claims CPU time that was not collected.
  // joined means an actual ChildProcess close event. A failed launch can emit
  // close without spawn/exit; processStarted and both observations stay separate.
  waitForClose({timeoutMs=5000}={}){
    check(Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=5000,'GPU close observation bound');
    const closure=this.processClosure,started=performance.now();
    const snapshot=state=>Object.freeze({state,launchAttempted:closure!==null,processStarted:closure?.processStarted??false,pid:closure?.pid??null,
      exitObserved:closure?.exitObserved??false,exitCode:closure?.exitCode??null,exitSignal:closure?.exitSignal??null,
      closeObserved:closure?.closeObserved??false,closeCode:closure?.closeCode??null,closeSignal:closure?.closeSignal??null,
      spawnErrorCode:closure?.spawnErrorCode??null,processErrorCode:closure?.processErrorCode??null,
      joined:state==='closed'?true:state==='join-timeout'?false:null,timeoutMs,elapsedMs:performance.now()-started,
      helperCpuMs:null,helperCpuReason:'Client close observation does not collect helper CPU'});
    if(!closure)return Promise.resolve(snapshot('not-started'));
    if(closure.closeObserved)return Promise.resolve(snapshot('closed'));
    if(closure.launchFailedSynchronously)return Promise.resolve(snapshot('launch-failed'));
    return new Promise(resolve=>{
      const timer=setTimeout(()=>resolve(snapshot('join-timeout')),timeoutMs);
      closure.done.then(()=>{clearTimeout(timer);resolve(snapshot(performance.now()-started>timeoutMs?'join-timeout':closure.closeObserved?'closed':'launch-failed'));});
    });
  }
  close(){if(this.closed)return;this.closed=true;clearTimeout(this.initialTimer);
    if(!this.cap)this.cap=Object.freeze({supported:false,hardware:false,reason:'GPU client closed'});
    const resolve=this.resolveCapability;this.resolveCapability=null;resolve?.(this.cap);
    if(this.pending){const p=this.pending;this.pending=null;clearTimeout(p.timer);p.reject(Error('GPU client closed'));}
    if(this.child){this.child.stdin.destroy();this.child.stdout.destroy();this.child.stderr.destroy();this.child.kill();this.child=null;}}
}
