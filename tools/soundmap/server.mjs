import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {SessionRecorder,privateDirectory,replayFrame,LIMITS} from './recorder.mjs';
import {PassiveListener} from './passive.mjs';

const ui=path.join(path.dirname(fileURLToPath(import.meta.url)),'ui');
const equal=(a,b)=>typeof a==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
async function body(req,limit){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw Error('Request byte bound');chunks.push(chunk);}return Buffer.concat(chunks);}
export async function startSoundMap({root=path.resolve('.'),port=17833,now=Date.now,ownerId=null}={}) {
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('Port bound');
  const privateRoot=privateDirectory(root),token=randomBytes(32).toString('hex'),recorder=new SessionRecorder(privateRoot,{now});
  if(ownerId!==null&&(typeof ownerId!=='string'||!/^[a-f0-9]{32}$/.test(ownerId)))throw Error('Owner identity bound');
  const passive=new PassiveListener(now);let requestClose;
  let frame=null,receivedAt=0,sessionId=null,streamId=null,sequence=-1,replay=null,lastHost=null,stopping=null;
  const geometry=new Map(),stats={accepted:0,droppedUpdates:0,invalidUpdates:0,sessionChanges:0,geometryCacheEvictions:0};
  let boundPort;
  const status=()=>({connected:!!frame&&now()-receivedAt<=1500,sessionId,streamId,ageMs:frame?now()-receivedAt:null,...stats,
    passive:passive.status(),recording:recorder.status(),replay:replay?{id:replay.id,durationMs:replay.durationMs}:null,
    audio:{hostConnected:!!lastHost&&now()-lastHost.receivedAt<1500,host:lastHost?.info??null}});
  const server=http.createServer(async(req,res)=>{
    const origin='http://127.0.0.1:'+boundPort;
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'");
    const send=(value,code=200)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
    try {
      const url=new URL(req.url,origin),route=url.pathname;
      if(req.headers.host!=='127.0.0.1:'+boundPort||req.headers.origin&&req.headers.origin!==origin||route.startsWith('/api/')&&req.headers['sec-fetch-site']==='cross-site'){send({error:'Same-origin localhost only'},403);return;}
      if(route==='/api/session'&&req.method==='GET'){send({token});return;}
      if(route.startsWith('/api/')&&!equal(req.headers['x-richaudio-token'],token)){send({error:'Session capability required'},403);return;}
      let value=null;
      if(req.method==='POST'&&route!=='/api/host/pcm'){
        if(!String(req.headers['content-type']).startsWith('application/json'))throw Error('JSON content type required');
        value=JSON.parse((await body(req,LIMITS.frameBytes)).toString('utf8')||'{}');
      }
      if(route==='/api/status'&&req.method==='GET')send(status());
      else if(route==='/api/frame'&&req.method==='GET'){
        const g=frame?geometry.get(frame.geometryGeneration):null;
        send({mode:'live',frame,passive:passive.snapshot(),geometry:g&&url.searchParams.get('geometryGeneration')!==g.generation?g:null,status:status()});
      }else if(route==='/api/passive'&&req.method==='POST'){
        send(passive.accept(value));
      }else if(route==='/api/service/stop'&&req.method==='POST'){
        if(ownerId===null||!equal(value.ownerId,ownerId)){send({error:'Owned service required'},403);return;}
        send({stopping:true});setImmediate(()=>requestClose());
      }else if(route==='/api/telemetry'&&req.method==='POST'){
        const f=value.frame,g=value.geometry;
        if(!f||f.schemaVersion!==1||typeof f.sessionId!=='string'||f.sessionId.length>256||f.streamId!==undefined&&(typeof f.streamId!=='string'||f.streamId.length>128)||!Number.isSafeInteger(f.audioFrame)||f.audioFrame<0||!Number.isSafeInteger(f.sequence)||!Array.isArray(f.paths)||f.paths.length>512)throw Error('Telemetry schema/bounds');
        if(f.sessionId!==sessionId||(f.streamId??null)!==streamId){
          const initialQualification=sessionId==='uninitialised'&&frame?.listenerSessionId===null&&(f.streamId??null)===streamId&&f.sessionId!=='uninitialised'&&typeof f.listenerSessionId==='string';
          if(initialQualification&&f.sequence<=sequence){stats.droppedUpdates++;recorder.event('stale-telemetry',{sessionId:f.sessionId,sequence:f.sequence,lastAccepted:sequence});send({accepted:false,reason:'old-sequence'});return;}
          const reason=initialQualification?'listener-initialised':sessionId!==null&&(f.streamId??null)!==streamId?'stream-change':'session-change';
          recorder.event(reason,{previous:sessionId,current:f.sessionId,previousStreamId:streamId,streamId:f.streamId??null});
          if(!initialQualification&&sessionId!==null&&recorder.active)recorder.stop(reason);
          geometry.clear();sessionId=f.sessionId;streamId=f.streamId??null;if(!initialQualification)sequence=-1;stats.sessionChanges++;
        }
        if(f.sequence<=sequence){stats.droppedUpdates++;recorder.event('stale-telemetry',{sessionId:f.sessionId,sequence:f.sequence,lastAccepted:sequence});send({accepted:false,reason:'old-sequence'});return;}
        if(sequence>=0&&f.sequence>sequence+1)stats.droppedUpdates+=f.sequence-sequence-1;
        if(g){if(g.schemaVersion!==1||g.sessionId!==sessionId||typeof g.generation!=='string'||!Array.isArray(g.surfaces)||g.surfaces.length>4096)throw Error('Geometry schema/bounds');
          if(geometry.has(g.generation)&&JSON.stringify(geometry.get(g.generation))!==JSON.stringify(g))throw Error('Immutable geometry generation changed');
          geometry.set(g.generation,g);while(geometry.size>16){geometry.delete(geometry.keys().next().value);stats.geometryCacheEvictions++;}}
        if(frame?.sessionId===f.sessionId){
          if(JSON.stringify(frame.sources?.map(s=>[s.id,s.generation]))!==JSON.stringify(f.sources?.map(s=>[s.id,s.generation])))recorder.event('source-generation',{sources:f.sources?.map(s=>({id:s.id,generation:s.generation}))});
          if(frame.paths?.map(p=>p.id+':'+p.status).join('|')!==f.paths.map(p=>p.id+':'+p.status).join('|'))recorder.event('path-change',{sequence:f.sequence});
        }
        frame=f;sequence=f.sequence;receivedAt=now();stats.accepted++;
        recorder.frame(f,g??geometry.get(f.geometryGeneration),receivedAt);
        if(f.diagnostics?.audioDeadlineFailures||f.diagnostics?.missingHistorySinceLastSample||(f.performance?.workerTotalMs??0)>512/48)recorder.event('diagnostic',{performance:f.performance,diagnostics:f.diagnostics,audioFrame:f.audioFrame});
        send({accepted:true});
      }else if(route==='/api/producer/event'&&req.method==='POST'){recorder.event(value.type??'producer-event',value);send({accepted:true});}
      else if(route==='/api/record/start'&&req.method==='POST'){
        const recording=recorder.start(value);stopping=null;
        recorder.event('initial-settings',{settings:frame?.settings??null});if(frame)recorder.frame(frame,geometry.get(frame.geometryGeneration),receivedAt,true);
        send({recording});
      }else if(route==='/api/record/stop'&&req.method==='POST'){
        if(value.id&&value.id!==recorder.active?.manifest.id)throw Error('Recording changed; refresh status before stopping');
        if(recorder.active&&lastHost&&now()-lastHost.receivedAt<1500){stopping={id:recorder.active.manifest.id,at:now()};recorder.active.manifest.state='stopping';recorder.event('recording-stop-request');send({recording:recorder.status()});}
        else {if(recorder.active?.hostCaptureStarted&&!recorder.active.hostCaptureStopped)recorder.gap({reason:'host-disconnected-tail-unconfirmed'});send({recording:recorder.stop('user-stop')});}
      }else if(route==='/api/host/control'&&req.method==='POST'){
        lastHost={receivedAt:now(),info:value};send({recording:recorder.active&&!stopping?recorder.status():null});
      }else if(route==='/api/host/event'&&req.method==='POST'){
        recorder.event(value.type??'host-event',value);
        if(recorder.active&&value.recordingId===recorder.active.manifest.id){
          const a=recorder.active;if(value.type==='owned-capture-start'){a.hostStartDropped=value.metrics?.droppedFrames??0;a.hostCaptureStarted=true;a.hostCaptureStopped=false;}
          if(value.type==='host-capture-stop')a.hostCaptureStopped=true;
          if(value.type==='host-capture-stop'&&typeof value.terminalFailure==='string'&&value.terminalFailure.length){recorder.event('host-terminal-failure',{reason:value.terminalFailure.slice(0,256)});recorder.gap({reason:'host-terminal-failure',tailConfirmed:false,explanation:'Captured prefix is retained; failed host does not establish a complete listening session'});}
          if(['recording-flushed','host-capture-stop'].includes(value.type)&&value.metrics?.droppedFrames>(a.hostStartDropped??0))recorder.gap({reason:'host-reported-dropped-frames',frames:value.metrics.droppedFrames-(a.hostStartDropped??0)});
          if(value.queuedTailChunks>0||value.callbackInFlight)recorder.gap({reason:'unflushed-tail',chunks:value.queuedTailChunks,callbackInFlight:value.callbackInFlight});
          if(value.captureSuspensions>0)recorder.gap({reason:'capture-suspended',count:value.captureSuspensions,explanation:'Capture disabled during active recording after a service/control failure; missing interval is not repaired'});
        }
        if(value.type==='recording-flushed'&&stopping&&value.recordingId===stopping.id){recorder.stop('user-stop');stopping=null;}
        if(value.type==='host-capture-stop')lastHost=null;
        send({accepted:true});
      }else if(route==='/api/host/pcm'&&req.method==='POST'){
        const bytes=await body(req,LIMITS.pcmBytes+16384);if(bytes.length<4)throw Error('PCM envelope');const length=bytes.readUInt32LE(0);if(length>16384||length+4>bytes.length)throw Error('PCM metadata bound');
        const metadata=JSON.parse(bytes.subarray(4,length+4).toString('utf8')),pcm=bytes.subarray(length+4);
        const accepted=recorder.active?recorder.pcm(metadata,pcm):false;send({accepted});
      }else if(route==='/api/recordings'&&req.method==='GET')send({recordings:recorder.list()});
      else if(route==='/api/replay/open'&&req.method==='POST'){
        replay=recorder.open(value.id);send({id:replay.id,durationMs:replay.durationMs,startTimeMs:0,events:replay.events,
          timeline:{basis:'original-engine-audioFrame',originFrame:replay.originFrame,sampleRate:48000},audio:{available:replay.manifest.audio.capturedFrames>0&&replay.audioPlayable,url:'/api/replay/audio',sampleRate:48000,channels:2,format:'wav-float32',gaps:replay.manifest.audio.gaps,startTimeMs:replay.audioStartTimeMs,clockUncertainty:replay.manifest.audio.clockUncertainty},manifest:replay.manifest});
      }else if(route==='/api/replay/frame'&&req.method==='GET'){
        if(!replay)throw Error('Open a recording first');const result=replayFrame(replay,Number(url.searchParams.get('timeMs')??0));
        if(result.geometry?.generation===url.searchParams.get('geometryGeneration'))result.geometry=null;send(result);
      }else if(route==='/api/replay/close'&&req.method==='POST'){replay=null;send({closed:true});}
      else if(route==='/api/replay/audio'&&req.method==='GET'){
        if(!replay||!replay.manifest.audio.capturedFrames)throw Error('No recorded owned PCM');
        if(!replay.audioPlayable){send({error:'Recording contains gaps or incomplete PCM/index evidence. No repaired WAV produced.',gaps:replay.manifest.audio.gaps},409);return;}
        const bytes=fs.statSync(path.join(replay.dir,'owned-output.f32le')).size,header=Buffer.alloc(44);
        header.write('RIFF');header.writeUInt32LE(bytes+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(3,20);header.writeUInt16LE(2,22);header.writeUInt32LE(48000,24);header.writeUInt32LE(384000,28);header.writeUInt16LE(8,32);header.writeUInt16LE(32,34);header.write('data',36);header.writeUInt32LE(bytes,40);
        res.setHeader('Content-Type','audio/wav');res.setHeader('Content-Disposition','attachment; filename="owned-output.wav"');res.write(header);fs.createReadStream(path.join(replay.dir,'owned-output.f32le')).pipe(res);
      }else if(req.method==='GET'&&!route.startsWith('/api/')){
        const relative=route==='/'?'index.html':decodeURIComponent(route.slice(1));
        if(relative.includes('..')||relative.includes('\\')||path.isAbsolute(relative))throw Error('Static path rejected');
        const file=path.join(ui,relative);if(!fs.existsSync(file)||!fs.statSync(file).isFile()){send({error:'Not found'},404);return;}
        res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]??'application/octet-stream');fs.createReadStream(file).pipe(res);
      }else send({error:'Not found'},404);
    }catch(error){stats.invalidUpdates++;recorder.event('diagnostic-failure',{route:String(req.url).slice(0,128),reason:error.message});send({error:error.message},400);}
  });
  server.requestTimeout=3000;server.headersTimeout=3000;server.maxConnections=16;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});boundPort=server.address().port;
  const descriptor={schemaVersion:1,url:'http://127.0.0.1:'+boundPort,token,ownerId};
  const descriptorFile=path.join(privateRoot,'service.json');if(fs.existsSync(descriptorFile)&&fs.lstatSync(descriptorFile).isSymbolicLink()){server.close();throw Error('Linked service descriptor rejected');}
  const temporary=path.join(privateRoot,'service-'+randomBytes(8).toString('hex')+'.tmp');fs.writeFileSync(temporary,JSON.stringify(descriptor),{flag:'wx'});fs.renameSync(temporary,descriptorFile);
  const tick=setInterval(()=>{recorder.tick();if(stopping&&now()-stopping.at>1500){recorder.event('audio-tail-unconfirmed',{reason:'host-flush-timeout'});recorder.stop('host-flush-timeout');stopping=null;}},100);tick.unref();
  let closing=null;
  const close=()=>closing??=(async()=>{clearInterval(tick);recorder.stop('service-shutdown');await new Promise(resolve=>server.close(resolve));})();
  requestClose=close;
  return {server,descriptor,recorder,status,privateRoot,close};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  let root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),port=17833,ownerId=null;
  for(let i=2;i<process.argv.length;i+=2){if(process.argv[i]==='--root')root=path.resolve(process.argv[i+1]);else if(process.argv[i]==='--port')port=Number(process.argv[i+1]);else if(process.argv[i]==='--owner')ownerId=process.argv[i+1];else throw Error('Unknown SoundMap option');}
  const service=await startSoundMap({root,port,ownerId});console.log('SoundMap '+service.descriptor.url+' (private configuration: .local/soundmap/service.json)');
  const close=()=>service.close().then(()=>process.exit(0));process.on('SIGINT',close);process.on('SIGTERM',close);
}
