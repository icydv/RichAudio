// Dedicated device-free fixture worker. No production gameplay import, endpoint,
// recording or native event acquisition. Kernel I/O/preparation ends before READY.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createLatency03Library} from '../src/acoustics/events/latency03-library.mjs';
import {AuthoredTransientDescriptorSource} from '../src/acoustics/events/contracts.mjs';
import {encodeTransientDescriptor,transientReadyPacket} from '../src/acoustics/events/wire.mjs';
process.on('uncaughtException',error=>{process.stderr.write(JSON.stringify({type:'authored-event-fixture-error',reason:String(error.message??error).slice(0,180)})+'\n');process.exit(1);});
const args=process.argv.slice(2),options={};
for(let n=0;n<args.length;n+=2){if(!['--prepared','--session'].includes(args[n])||!args[n+1]||Object.hasOwn(options,args[n]))throw Error('Explicit fixture preparation/session required');options[args[n]]=args[n+1];}
if(!options['--prepared']||!/^[a-f0-9]{32}$/.test(options['--session']??''))throw Error('Bound authored fixture preparation/session required');
const sha=b=>createHash('sha256').update(b).digest('hex'),preparation=path.resolve(options['--prepared']),root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if(fs.statSync(preparation).size>524288)throw Error('Preparation metadata bound');
const prepared=JSON.parse(fs.readFileSync(preparation,'utf8'));
if(prepared.experimentProfile!=='LATENCY-03'||!prepared.passed||prepared.kind!=='original-authored-fixed-transient-kernels-not-recording'||prepared.productionEnabled!==false||prepared.kernels?.length!==8||
  prepared.payload?.file!=='kernels.f32le'||!Array.isArray(prepared.sourcePins)||prepared.sourcePins.length>32||
  !Number.isSafeInteger(prepared.payload.bytes)||prepared.payload.bytes<8*512*8||prepared.payload.bytes>1536000)throw Error('Exact authored-only private preparation required');
for(const pin of prepared.sourcePins){if(typeof pin.file!=='string'||pin.file.includes('..')||!pin.file.startsWith('src/')&&!pin.file.startsWith('tools/')||
  sha(fs.readFileSync(path.join(root,pin.file)))!==pin.sha256)throw Error('Prepared source binding drift');}
const payloadPath=path.join(path.dirname(preparation),prepared.payload.file);if(fs.statSync(payloadPath).size!==prepared.payload.bytes)throw Error('Shared PCM size bound');
const payload=fs.readFileSync(payloadPath);
if(payload.length!==prepared.payload.bytes||sha(payload)!==prepared.payload.sha256)throw Error('Shared PCM binding drift');
// Reproduce once at startup, before any event may be admitted. This validates
// that the stored PCM/geometry metadata really came through the existing engine.
const library=createLatency03Library();
for(const item of library){const original=prepared.kernels[item.kernelSlot],k=item.kernel;
  if(original.kernelSlot!==item.kernelSlot||original.kernelGeneration!==1||original.sourceId!==item.sourceId||original.kernelId!==k.kernelId||
    original.pcmSha256!==k.pcmSha256||original.frames!==k.frames||original.firstNonzeroFrame!==k.firstNonzeroFrame||
    original.physicalDirectDelayFrames!==k.physicalDirectDelayFrames||original.bytes!==k.frames*8||
    !Number.isSafeInteger(original.offsetBytes)||original.offsetBytes<0||
    sha(payload.subarray(original.offsetBytes,original.offsetBytes+original.bytes))!==k.pcmSha256)throw Error('Prepared existing-engine kernel mismatch');
  for(const [field,value]of Object.entries(k))if(field!=='preparationMs'&&JSON.stringify(original[field])!==JSON.stringify(value))throw Error('Prepared kernel metadata mismatch: '+field);
}
let source=null,transportSequence=0,partial='',chunk=null,offset=0,inputEnded=false,pumping=false,blocked=false,failed=false,completed=false;
const free=Array.from({length:128},(_,i)=>i),buffers=free.map(()=>Buffer.alloc(144));let outstanding=0;
const writeStarted=new Float64Array(128),transportStats={maximumOutstanding:0,blockedWrites:0,poolWaits:0,maximumWriteCompletionMs:0,
  maximumChunkBytes:0,maximumPartialLineBytes:0};
const keys=new Set(['eventId','sourceId','sourceGeneration','kernelSlot','kernelGeneration','sceneGeneration','listenerGeneration','sourceEventSequence','priority',
  'extraClockUncertaintyFrames','maximumSoftwareLatenessFrames','timing','origin','sourcePose','listenerPose','session','authority','eventKind']);
function fail(error){if(failed)return;failed=true;process.stderr.write(JSON.stringify({type:'authored-event-fixture-error',reason:String(error.message??error).slice(0,180)})+'\n');process.exitCode=1;process.stdin.destroy();}
function submit(line){
  if(!line.trim())throw Error('empty event line');const event=JSON.parse(line);if(!event||typeof event!=='object'||Array.isArray(event)||Object.keys(event).some(k=>!keys.has(k)))throw Error('unknown event envelope fields');
  const entry=library[event.kernelSlot];if(!entry||entry.kernelSlot!==event.kernelSlot)throw Error('unregistered fixture kernel');
  if(event.origin!==undefined&&JSON.stringify(event.origin)!==JSON.stringify(entry.kernel.sourcePose.position))throw Error('origin differs from authored registered pose');
  source??=new AuthoredTransientDescriptorSource({library,session:options['--session'],qpcFrequency:event.timing?.qpcFrequency,mode:'authored-fixture'});
  const result=source.admit({...event,sourcePose:event.sourcePose??entry.kernel.sourcePose,listenerPose:event.listenerPose??entry.kernel.listenerPose});
  if(!result.admitted)throw Error(result.reason);
  const index=free.pop(),buffer=buffers[index];encodeTransientDescriptor(result.descriptor,{session:options['--session'],transportSequence:transportSequence++,
    priority:event.priority??0,extraClockUncertaintyFrames:event.extraClockUncertaintyFrames??0,maximumSoftwareLatenessFrames:event.maximumSoftwareLatenessFrames??960},buffer);
  outstanding++;transportStats.maximumOutstanding=Math.max(transportStats.maximumOutstanding,outstanding);writeStarted[index]=performance.now();
  if(!process.stdout.write(buffer,()=>{transportStats.maximumWriteCompletionMs=Math.max(transportStats.maximumWriteCompletionMs,performance.now()-writeStarted[index]);outstanding--;free.push(index);pump();})){
    blocked=true;transportStats.blockedWrites++;process.stdout.once('drain',()=>{blocked=false;pump();});}
}
function pump(){
  if(pumping||failed||completed)return;pumping=true;
  try{while(!blocked&&free.length){
    if(chunk===null){chunk=process.stdin.read(Math.min(16384,process.stdin.readableLength||16384));offset=0;if(chunk===null)break;transportStats.maximumChunkBytes=Math.max(transportStats.maximumChunkBytes,chunk.length);}
    while(offset<chunk.length&&!blocked&&free.length){const value=chunk[offset++];if(value===10){const line=partial.endsWith('\r')?partial.slice(0,-1):partial;partial='';submit(line);}
      else{if(value<32&&value!==13||value>126)throw Error('event JSON must be bounded ASCII');partial+=String.fromCharCode(value);transportStats.maximumPartialLineBytes=Math.max(transportStats.maximumPartialLineBytes,partial.length);if(partial.length>4096)throw Error('event line size');}}
    if(offset===chunk.length)chunk=null;
  }
  if(!free.length)transportStats.poolWaits++;
  if(inputEnded&&chunk===null&&!blocked&&free.length){if(partial){const line=partial;partial='';submit(line);}
    if(outstanding===0){completed=true;process.stderr.write(JSON.stringify({type:'authored-event-fixture-completed',transportDescriptors:transportSequence,statistics:source?.stats??null,transportStatistics:transportStats,
      runtimeKernelPcmWrites:0,runtimeGeometryWork:0,endpointOpened:false,nativeEventAcquired:false})+'\n');}}
  }catch(error){fail(error);}finally{pumping=false;}
}
process.stdin.on('readable',pump);process.stdin.on('end',()=>{inputEnded=true;pump();});process.stdin.on('error',fail);process.stdout.on('error',fail);
process.stdout.write(transientReadyPacket(8),pump);
