// Private evidence writer. All disk work runs in the standalone service process.
import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

export const LIMITS = Object.freeze({frameBytes:1048576, pcmBytes:1048576, maxBytes:256*1024*1024,
  defaultBytes:64*1024*1024, maxDurationSeconds:600, defaultDurationSeconds:120, totalBytes:1024*1024*1024});
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function privateDirectory(root) {
  const local=path.resolve(root,'.local'), target=path.join(local,'soundmap');
  for(let current=target;;current=path.dirname(current)) {
    if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('Linked private directory rejected');
    if(path.dirname(current)===current)break;
  }
  fs.mkdirSync(target,{recursive:true}); return target;
}
export class SessionRecorder {
  constructor(root,{now=Date.now}={}) {this.root=root;this.now=now;this.active=null;}
  usage() {let bytes=0;for(const dir of fs.readdirSync(this.root,{withFileTypes:true}))if(dir.isDirectory()&&!dir.isSymbolicLink())for(const file of fs.readdirSync(path.join(this.root,dir.name),{withFileTypes:true}))if(file.isFile())bytes+=fs.statSync(path.join(this.root,dir.name,file.name)).size;return bytes;}
  start({maxDurationSeconds=LIMITS.defaultDurationSeconds,maxBytes=LIMITS.defaultBytes}={}) {
    if(this.active)throw Error('Recording already active');
    if(this.list().length>=128)throw Error('Private recording count cap; archive or delete explicitly');
    if(!Number.isFinite(maxDurationSeconds)||maxDurationSeconds<.1||maxDurationSeconds>LIMITS.maxDurationSeconds||!Number.isSafeInteger(maxBytes)||maxBytes<65536||maxBytes>LIMITS.maxBytes)throw Error('Recording bounds');
    if(this.usage()+maxBytes>LIMITS.totalBytes)throw Error('Private storage cap; archive or delete existing recordings explicitly');
    const id='session-'+this.now()+'-'+randomUUID(),dir=path.join(this.root,id);fs.mkdirSync(dir);
    const manifest={schemaVersion:1,id,state:'recording',startedUnixMs:this.now(),durationMs:0,bytes:0,maxBytes,maxDurationSeconds,
      timelineClock:'Replay uses original engine audioFrame/48000 and actual host producer-frame lineage. Service receipt offsets, original observations and QPC anchors remain preserved separately.',
      telemetryScope:'Bounded sampled solver trace; producer.unsampledBlocksSinceLastFrame and transport drop counters disclose omitted states. Not an exhaustive every-block trace.',
      propagationStates:[],
      audio:{kind:'RichAudio-owned-post-gain-WASAPI-submission',sampleRate:48000,channels:2,format:'f32le',file:'owned-output.f32le',index:'audio-index.jsonl',capturedFrames:0,gaps:[],
        claim:'Exact submitted owned samples; not microphone, desktop mix, endpoint loopback or proof of physical audibility'},
      integrity:{complete:false,files:{}},terminationReason:null};
    const files={};for(const name of ['timeline.jsonl','events.jsonl','audio-index.jsonl','owned-output.f32le'])files[name]=fs.openSync(path.join(dir,name),'wx');
    this.active={manifest,dir,files,expectedFrame:null,lastHost:null,geometry:new Set()};this.persist();this.event('recording-start');return this.status();
  }
  persist(){if(this.active)fs.writeFileSync(path.join(this.active.dir,'manifest.json'),JSON.stringify(this.active.manifest,null,2));}
  status(){if(!this.active)return null;const m=this.active.manifest;return {id:m.id,state:m.state,bytes:m.bytes,durationMs:Math.max(0,this.now()-m.startedUnixMs),terminationReason:m.terminationReason};}
  write(name,data) {
    if(!this.active)return false;const a=this.active,m=a.manifest;const bytes=Buffer.isBuffer(data)?data:Buffer.from(data);
    if(this.now()-m.startedUnixMs>=m.maxDurationSeconds*1000){this.stop('duration-limit');return false;}
    // Reserve space for final manifest, events and integrity evidence within cap.
    if(m.bytes+bytes.length>m.maxBytes-32768){this.stop('byte-limit');return false;}
    try {const written=fs.writeSync(a.files[name],bytes);m.bytes+=written;if(written!==bytes.length){this.stop('storage-error:partial-write');return false;}return true;}catch(error){this.stop('storage-error:'+error.code);return false;}
  }
  event(type,detail={}) {if(!this.active)return;const m=this.active.manifest;this.write('events.jsonl',JSON.stringify({timeMs:this.now()-m.startedUnixMs,type,detail})+'\n');}
  frame(frame,geometry,receivedUnixMs=this.now(),cachedContext=false) {
    if(!this.active)return;const a=this.active;
    // Retain the explicit conditional-clear assumption alongside original frame
    // evidence; no inference of unobstructed world geometry is made by capture.
    if(frame.readiness){const state={mode:['listener-only-conditional-direct','conditional-observed-geometry','observed-geometry','unavailable'].includes(frame.readiness.mode)?frame.readiness.mode:'unrecognised',
      visibilityAssumption:frame.readiness.visibilityAssumption==='unobserved-space-assumed-clear'?'unobserved-space-assumed-clear':null,
      genuineGeometryPresent:frame.readiness.genuineGeometryPresent===true};
      if(!a.manifest.propagationStates.some(s=>JSON.stringify(s)===JSON.stringify(state))&&a.manifest.propagationStates.length<16){
        a.manifest.propagationStates.push(state);this.event('propagation-state',state);
      }}
    if(geometry&&!a.geometry.has(geometry.generation)){if(!this.write('timeline.jsonl',JSON.stringify({type:'geometry',timeMs:receivedUnixMs-a.manifest.startedUnixMs,geometry})+'\n'))return;a.geometry.add(geometry.generation);this.event('geometry-generation',{generation:geometry.generation});}
    this.write('timeline.jsonl',JSON.stringify({type:'frame',timeMs:receivedUnixMs-a.manifest.startedUnixMs,receivedUnixMs,cachedContext,frame})+'\n');
  }
  gap(gap){if(!this.active)return;const audio=this.active.manifest.audio;if(audio.gaps.length<64)audio.gaps.push(gap);else audio.omittedGapDetails=(audio.omittedGapDetails??0)+1;}
  pcm(metadata,pcm) {
    if(!this.active||!Buffer.isBuffer(pcm)||pcm.length!==metadata.frames*8||!Number.isSafeInteger(metadata.submittedFrame)||!Number.isSafeInteger(metadata.frames)||metadata.frames<1||metadata.frames>131072)throw Error('Invalid owned PCM chunk');
    const a=this.active,m=a.manifest;if(metadata.recordingId!==m.id)return false;
    if(typeof metadata.hostId!=='string'||metadata.hostId.length>96||!Number.isFinite(metadata.qpcFrequency)||metadata.qpcFrequency<=0||!Number.isFinite(metadata.anchorUnixMs)||!Number.isFinite(metadata.anchorQpcTicks)||!Array.isArray(metadata.submissions)||metadata.submissions.length<1||metadata.submissions.length>16)throw Error('PCM clock/lineage required');
    let next=metadata.submittedFrame;for(const s of metadata.submissions){if(s.submittedFrame!==next||!Number.isSafeInteger(s.frames)||s.frames<1||!Number.isSafeInteger(s.qpcTicks)||!Number.isSafeInteger(s.consumedFrame))throw Error('PCM submission lineage');next+=s.frames;}
    if(next!==metadata.submittedFrame+metadata.frames)throw Error('PCM submission total');
    for(const s of metadata.submissions)if(s.underflowFrames>0||s.endSilenceFrames>0)this.event('audio-discontinuity',{submittedFrame:s.submittedFrame,producerFrameStart:s.producerFrameStart,suppliedFrames:s.suppliedFrames,underflowFrames:s.underflowFrames,endSilenceFrames:s.endSilenceFrames,explanation:'Actual submitted silence retained; producer timeline unavailable beyond supplied prefix'});
    if(m.audio.capturedFrames===0){m.audio.startTimeMs=metadata.anchorUnixMs+(metadata.submissions[0].qpcTicks-metadata.anchorQpcTicks)*1000/metadata.qpcFrequency-m.startedUnixMs;m.audio.clockUncertainty='Approximate host UTC/QPC anchor mapping; retain original QPC and submitted/consumed frame lineage. Not speaker presentation time.';}
    if(a.expectedFrame!==null&&(a.lastHost!==metadata.hostId||a.expectedFrame!==metadata.submittedFrame)) {
      const gap={expectedFrame:a.expectedFrame,actualFrame:metadata.submittedFrame,hostId:metadata.hostId,reason:a.lastHost!==metadata.hostId?'host-change':'missing-submissions'};
      this.gap(gap);this.event('audio-gap',gap);
    }
    const offset=m.audio.capturedFrames*8,index={...metadata,byteOffset:offset,bytes:pcm.length,timeMs:this.now()-m.startedUnixMs};
    if(m.bytes+pcm.length+Buffer.byteLength(JSON.stringify(index))+1>m.maxBytes-32768){this.stop('byte-limit');return false;}
    if(!this.write('owned-output.f32le',pcm))return false;
    if(!this.write('audio-index.jsonl',JSON.stringify(index)+'\n'))return false;
    m.audio.capturedFrames+=metadata.frames;a.expectedFrame=metadata.submittedFrame+metadata.frames;a.lastHost=metadata.hostId;return true;
  }
  tick(){if(this.active&&this.now()-this.active.manifest.startedUnixMs>=this.active.manifest.maxDurationSeconds*1000)this.stop('duration-limit');}
  stop(reason='user-stop') {
    if(!this.active)return null;const a=this.active,m=a.manifest;
    // Final evidence bypasses ordinary writing so a reached cap cannot recurse.
    const end=JSON.stringify({timeMs:this.now()-m.startedUnixMs,type:'recording-stop',detail:{reason}})+'\n';
    const finalizationErrors=[];
    try {const written=fs.writeSync(a.files['events.jsonl'],end);m.bytes+=written;if(written!==Buffer.byteLength(end))finalizationErrors.push('partial-final-event');}catch(error){finalizationErrors.push('final-event:'+error.code);}
    for(const fd of Object.values(a.files)){try{fs.fsyncSync(fd);}catch(error){finalizationErrors.push('flush:'+error.code);}try{fs.closeSync(fd);}catch(error){finalizationErrors.push('close:'+error.code);}}
    m.state='stopped';m.durationMs=this.now()-m.startedUnixMs;m.terminationReason=reason;
    m.integrity.complete=!reason.startsWith('storage-error')&&!reason.includes('shutdown-timeout')&&!reason.includes('flush-timeout')&&finalizationErrors.length===0;
    m.integrity.finalizationErrors=finalizationErrors;
    if(reason!=='user-stop')this.gap({reason:'recording-cutoff',terminationReason:reason,tailConfirmed:false});
    for(const name of Object.keys(a.files))m.integrity.files[name]={sha256:sha(path.join(a.dir,name)),bytes:fs.statSync(path.join(a.dir,name)).size};
    m.audio.unindexedBytes=m.integrity.files['owned-output.f32le'].bytes-m.audio.capturedFrames*8;
    if(m.audio.unindexedBytes){m.integrity.complete=false;this.gap({reason:'unindexed-PCM-bytes',bytes:m.audio.unindexedBytes});}
    const contentBytes=Object.values(m.integrity.files).reduce((n,f)=>n+f.bytes,0);m.bytes=contentBytes;
    for(let i=0;i<3;i++)m.bytes=contentBytes+Buffer.byteLength(JSON.stringify(m,null,2));
    if(m.bytes>m.maxBytes)throw Error('Final recording metadata exceeded reserved bound');
    this.persist();let manifestFd;
    try{manifestFd=fs.openSync(path.join(a.dir,'manifest.json'),'r+');fs.fsyncSync(manifestFd);}catch(error){m.integrity.complete=false;m.integrity.finalizationErrors.push('manifest-flush:'+error.code);for(let i=0;i<3;i++)m.bytes=contentBytes+Buffer.byteLength(JSON.stringify(m,null,2));this.persist();}finally{if(manifestFd!==undefined)fs.closeSync(manifestFd);}
    this.active=null;return {id:m.id,state:m.state,durationMs:m.durationMs,bytes:m.bytes,terminationReason:reason};
  }
  list(){return fs.readdirSync(this.root,{withFileTypes:true}).filter(d=>d.isDirectory()&&!d.isSymbolicLink()&&d.name.startsWith('session-')).map(d=>{try{const m=JSON.parse(fs.readFileSync(path.join(this.root,d.name,'manifest.json')));return {id:m.id,state:m.state,durationMs:m.durationMs,bytes:m.bytes,hasAudio:m.audio.capturedFrames>0,terminationReason:m.terminationReason};}catch{return null;}}).filter(Boolean).sort((a,b)=>b.id.localeCompare(a.id));}
  open(id){
    if(typeof id!=='string'||!/^session-[0-9]+-[a-f0-9-]{36}$/.test(id))throw Error('Invalid recording ID');
    const dir=path.join(this.root,id);if(fs.lstatSync(dir).isSymbolicLink())throw Error('Linked recording rejected');
    const manifestPath=path.join(dir,'manifest.json');if(fs.lstatSync(manifestPath).isSymbolicLink()||fs.statSync(manifestPath).size>32768)throw Error('Manifest safety bound');
    const manifest=JSON.parse(fs.readFileSync(manifestPath));
    if(manifest.state!=='stopped')throw Error('Recording unfinished; preserve evidence and inspect manifest');
    for(const [name,hash]of Object.entries(manifest.integrity.files)){if(!['timeline.jsonl','events.jsonl','audio-index.jsonl','owned-output.f32le'].includes(name)||fs.lstatSync(path.join(dir,name)).isSymbolicLink()||fs.statSync(path.join(dir,name)).size!==hash.bytes||sha(path.join(dir,name))!==hash.sha256)throw Error('Recording integrity mismatch');}
    const lines=name=>fs.readFileSync(path.join(dir,name),'utf8').split('\n').filter(Boolean).map(JSON.parse);
    const timeline=lines('timeline.jsonl'),frames=timeline.filter(x=>x.type==='frame'),geometries=new Map(timeline.filter(x=>x.type==='geometry').map(x=>[x.geometry.generation,x.geometry]));
    const events=lines('events.jsonl'),audioIndex=lines('audio-index.jsonl');
    // Audio's original producer-frame start anchors visual replay, independently
    // of HTTP arrival latency. No frame or missing sample is interpolated.
    const firstAudio=audioIndex[0]?.submissions[0],firstFrame=frames.find(f=>!f.cachedContext)??frames[0];
    const originFrame=firstAudio?(firstAudio.producerFrameStart??firstAudio.consumedFrame-firstAudio.frames):(firstFrame?.frame.audioFrame??0);
    const canonical=frames.map(row=>({...row,receivedOffsetMs:row.timeMs,timeMs:(row.frame.audioFrame-originFrame)/48})).sort((a,b)=>a.timeMs-b.timeMs);
    const wallOffset=firstAudio?(manifest.audio.startTimeMs??0):(firstFrame?.receivedOffsetMs??firstFrame?.timeMs??0);
    const canonicalEvents=events.map(e=>({...e,receivedOffsetMs:e.timeMs,timeMs:Math.max(0,e.timeMs-wallOffset),clockBasis:'host-QPC/UTC approximate event alignment; solver frames use exact original sample index'}));
    let indexedBytes=0;for(const chunk of audioIndex){if(chunk.byteOffset!==indexedBytes||chunk.bytes!==chunk.frames*8)throw Error('Audio index integrity');indexedBytes+=chunk.bytes;}
    const audioPlayable=manifest.integrity.complete&&manifest.audio.gaps.length===0&&indexedBytes===manifest.audio.capturedFrames*8&&indexedBytes===manifest.integrity.files['owned-output.f32le'].bytes;
    const durationMs=Math.max(0,...canonical.map(f=>f.timeMs),manifest.audio.capturedFrames/48,manifest.durationMs-wallOffset);
    return {id,dir,manifest,frames:canonical,geometries,events:canonicalEvents,audioIndex,durationMs,originFrame,audioPlayable,audioStartTimeMs:0};
  }
}
export function replayFrame(replay,timeMs) {
  if(!Number.isFinite(timeMs)||timeMs<0||timeMs>replay.durationMs+1)throw Error('Replay time outside recording');
  let lo=0,hi=replay.frames.length-1,index=-1;while(lo<=hi){const mid=(lo+hi)>>1;if(replay.frames[mid].timeMs<=timeMs){index=mid;lo=mid+1;}else hi=mid-1;}
  const row=index<0?null:replay.frames[index];return {mode:'replay',playbackTimeMs:timeMs,frame:row?.frame??null,geometry:row?replay.geometries.get(row.frame.geometryGeneration)??null:null,status:{connected:false,historical:true,originalFrameTimeMs:row?.timeMs??null,ageMs:row?timeMs-row.timeMs:null}};
}
