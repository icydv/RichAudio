// One owned compute helper, one bounded request in flight. No game/audio APIs.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
export const gpuLimits=Object.freeze({segments:4096,surfaces:128,header:32,maximumMetrics:8192,marginMetres:.005});
export const defaultGpuExecutable=fileURLToPath(new URL('../../../build/acoustic-gpu/RichAudio.AcousticGpu.exe',import.meta.url));
const check=(ok,why)=>{if(!ok)throw Error(why);};
const coordinate=v=>Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=512);
const stageCpuStamp=()=>typeof process.threadCpuUsage==='function'?process.threadCpuUsage():process.cpuUsage();
const stageCpuMs=start=>{const end=stageCpuStamp();return (end.user-start.user+end.system-start.system)/1000;};
const stageCpuAccounting=typeof process.threadCpuUsage==='function'?'Node-thread-synchronous-stages':'Node-process-synchronous-stages-includes-other-threads';
export class AcousticGpuClient {
  constructor({executable=defaultGpuExecutable,initializationDeadlineMs=5000}={}){
    check(typeof executable==='string'&&initializationDeadlineMs>=100&&initializationDeadlineMs<=10000,'GPU helper options');
    this.executable=executable;this.initializationDeadlineMs=initializationDeadlineMs;this.child=null;this.ready=null;this.cap=null;this.buffer=Buffer.alloc(0);this.pending=null;this.nextId=0;this.closed=false;
    this.stats={submitted:0,completed:0,rejected:0,deadlines:0,maximumRoundTripMs:0};
  }
  async capability(){
    if(this.cap)return this.cap;
    if(this.ready)return this.ready;
    if(this.closed||process.platform!=='win32'||!existsSync(this.executable))return this.cap={supported:false,hardware:false,reason:this.closed?'GPU client closed':process.platform!=='win32'?'Windows DirectCompute unavailable':'GPU helper not built'};
    this.ready=new Promise(resolve=>{
      this.resolveCapability=resolve;
      this.initialTimer=setTimeout(()=>this.fail('GPU initialization deadline'),this.initializationDeadlineMs);
      const child=this.child=spawn(this.executable,[],{stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false});
      child.stdout.on('data',b=>this.receive(b));
      // Diagnostic text is never a protocol substitute and cannot grow unbounded.
      let stderrBytes=0;child.stderr.on('data',b=>{stderrBytes+=b.length;if(stderrBytes>8192)this.fail('GPU diagnostic bound');});
      child.on('error',()=>this.fail('GPU helper process unavailable'));
      child.on('exit',()=>this.fail('GPU helper disconnected'));
      child.stdin.on('error',()=>this.fail('GPU helper input unavailable'));
    });
    return this.ready;
  }
  receive(chunk){
    if(this.closed)return;
    const decodeStarted=stageCpuStamp(),decodingPending=this.pending;let decodeRecorded=false;
    try{
      check(this.buffer.length+chunk.length<=32+8192+4096*16,'GPU response buffer bound');this.buffer=Buffer.concat([this.buffer,chunk]);
      if(!this.cap){
        if(this.buffer.length<4)return;const n=this.buffer.readUInt32LE(0);check(n>0&&n<=8192,'GPU capability frame bound');if(this.buffer.length<4+n)return;
        const cap=JSON.parse(this.buffer.subarray(4,4+n).toString('utf8'));this.buffer=this.buffer.subarray(4+n);
        check(cap&&cap.schemaVersion===1&&typeof cap.supported==='boolean'&&typeof cap.hardware==='boolean','GPU capability schema');
        check(!cap.supported||(cap.hardware&&cap.api==='Direct3D11-ComputeShader5'&&typeof cap.device==='string'&&cap.device.length<=128&&cap.maximumSegments===4096&&cap.maximumSurfaces===128),'GPU hardware capability');
        this.cap=Object.freeze(cap);clearTimeout(this.initialTimer);this.resolveCapability(cap);this.resolveCapability=null;
      }
      while(this.buffer.length>=32){
        const h=this.buffer,n=h.readUInt32LE(20),j=h.readUInt32LE(24),pending=this.pending;
        check(h.readUInt32LE(0)===0x32384f52&&h.readUInt32LE(4)===1&&h.readUInt32LE(28)===0&&n<=4096*16&&j>0&&j<=8192,'GPU response framing');
        if(this.buffer.length<32+n+j)return;
        check(pending&&h.readUInt32LE(8)===pending.id&&h.readUInt32LE(12)===pending.generation,'GPU request/generation mismatch');
        const metrics=JSON.parse(this.buffer.subarray(32,32+j).toString('utf8')),status=h.readUInt32LE(16);
        const payload=this.buffer.subarray(32+j,32+j+n);this.buffer=this.buffer.subarray(32+j+n);
        const roundTripMs=performance.now()-pending.started;
        this.stats.maximumRoundTripMs=Math.max(this.stats.maximumRoundTripMs,roundTripMs);
        if(status!==0){clearTimeout(pending.timer);this.pending=null;this.stats.rejected++;if(status===1)this.stats.deadlines++;pending.reject(Error(metrics.reason??'GPU operation rejected'));this.close();return;}
        check(n===pending.maskBytes&&metrics.completedDispatch===true&&metrics.hardware===true,'GPU completion proof');
        check(metrics.segments===pending.segmentCount&&metrics.surfacePairs===pending.segmentCount*pending.surfaceCount&&
          ['submitMs','completionWaitMs','readbackMs','totalMs','helperCpuMs'].every(k=>Number.isFinite(metrics[k])&&metrics[k]>=0),'GPU result metrics/context');
        // Copy away from the framing buffer; consumers may retain this generation.
        const masks=new Uint32Array(n/4);for(let i=0;i<masks.length;i++)masks[i]=payload.readUInt32LE(i*4);
        for(let i=0;i<pending.segmentCount;i++)for(let word=0;word<4;word++){
          const remaining=Math.max(0,Math.min(32,pending.surfaceCount-word*32));
          if(remaining<32)check((masks[i*4+word]>>>remaining)===0,'GPU out-of-range surface mask');
        }
        const nodeDecodeCpuMs=(pending.nodeDecodeCpuMs??0)+stageCpuMs(decodeStarted);decodeRecorded=true;
        const finalRoundTripMs=performance.now()-pending.started;
        this.stats.maximumRoundTripMs=Math.max(this.stats.maximumRoundTripMs,finalRoundTripMs);
        if(finalRoundTripMs>pending.deadlineMs){this.stats.deadlines++;throw Error('GPU completed after round-trip deadline');}
        clearTimeout(pending.timer);this.pending=null;const cpu=process.cpuUsage(pending.cpuStart);this.stats.completed++;
        pending.resolve({requestId:pending.id,generation:pending.generation,masks,metrics:{...metrics,roundTripMs:finalRoundTripMs,
          nodeSubmissionCpuMs:pending.nodeSubmissionCpuMs??0,nodeDecodeCpuMs,nodeStageCpuAccounting:stageCpuAccounting,
          // Compatibility only: this spans an await and can include unrelated
          // activity. Auto must use synchronous stage counters instead.
          nodeProcessCpuMs:(cpu.user+cpu.system)/1000}});
      }
    }catch(error){this.fail(error.message);}
    finally{if(!decodeRecorded&&decodingPending&&this.pending===decodingPending)decodingPending.nodeDecodeCpuMs=(decodingPending.nodeDecodeCpuMs??0)+stageCpuMs(decodeStarted);}
  }
  async dispatch({segments,surfaces,generation=0,deadlineMs=8,requestId}={}){
    const cap=await this.capability(),submissionStarted=stageCpuStamp();check(cap.supported&&!this.closed,'GPU unavailable: '+(cap.reason??'closed'));
    check(!this.pending,'GPU queue already occupied');check(Array.isArray(segments)&&segments.length>=1&&segments.length<=4096&&Array.isArray(surfaces)&&surfaces.length>=1&&surfaces.length<=128,'GPU workload bound');
    check(Number.isInteger(generation)&&generation>=0&&generation<=0xffffffff&&Number.isFinite(deadlineMs)&&deadlineMs>=1&&deadlineMs<=100,'GPU context/deadline');
    const id=requestId??this.nextId+1;check(Number.isInteger(id)&&id>this.nextId&&id<=0xffffffff,'GPU request order');this.nextId=id;
    const started=performance.now(),cpuStart=process.cpuUsage();
    const bytes=Buffer.alloc(32+segments.length*32+surfaces.length*64);
    bytes.writeUInt32LE(0x32384752,0);bytes.writeUInt32LE(1,4);bytes.writeUInt32LE(id,8);bytes.writeUInt32LE(generation,12);bytes.writeUInt32LE(segments.length,16);bytes.writeUInt32LE(surfaces.length,20);bytes.writeFloatLE(deadlineMs,24);
    let at=32;const put=v=>{check(coordinate(v),'GPU local finite coordinates');for(const x of v){bytes.writeFloatLE(x,at);at+=4;}bytes.writeFloatLE(0,at);at+=4;};
    for(const segment of segments){put(segment.a??segment[0]);put(segment.b??segment[1]);}
    for(const surface of surfaces){put(surface.center);put(surface.normal);put(surface.min??surface.lo);put(surface.max??surface.hi);}
    this.stats.submitted++;
    return new Promise((resolve,reject)=>{
      const pending=this.pending={id,generation,segmentCount:segments.length,surfaceCount:surfaces.length,maskBytes:segments.length*16,deadlineMs,resolve,reject,started,cpuStart,nodeDecodeCpuMs:0,
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
  close(){if(this.closed)return;this.closed=true;clearTimeout(this.initialTimer);if(this.pending){const p=this.pending;this.pending=null;clearTimeout(p.timer);p.reject(Error('GPU client closed'));}if(this.child){this.child.stdin.destroy();this.child.stdout.destroy();this.child.stderr.destroy();this.child.kill();this.child=null;}}
}
