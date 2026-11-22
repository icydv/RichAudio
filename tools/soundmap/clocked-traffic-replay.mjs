import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {checkFrame,checkGeometry} from './ui/model.mjs';

const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const need = (ok, reason) => { if (!ok) throw Error(reason); };
const cap = 128 * 1024 * 1024;
export const clockedFiles = ['clocked-output.wav','clocked-soundmap.jsonl','clocked-contributors.jsonl','clocked-callbacks.csv','host.json'];

async function bytes(root, name, maximum = cap) {
  const file = path.join(root,name), stat = await fs.lstat(file);
  need(stat.isFile() && !stat.isSymbolicLink() && stat.size <= maximum,'Invalid clocked replay file ' + name);
  return fs.readFile(file);
}
function waveData(wav) {
  need(wav.toString('ascii',0,4)==='RIFF' && wav.readUInt32LE(4)+8===wav.length &&
    wav.toString('ascii',8,12)==='WAVE','Incomplete clocked capture');
  let format, pcm;
  for (let p=12;p+8<=wav.length;) {
    const size=wav.readUInt32LE(p+4),end=p+8+size, id=wav.toString('ascii',p,p+4);
    need(end<=wav.length,'Truncated clocked WAV chunk');
    if(id==='fmt ') format=size>=16 && wav.readUInt16LE(p+8)===3 && wav.readUInt16LE(p+10)===2 &&
      wav.readUInt32LE(p+12)===48000 && wav.readUInt32LE(p+16)===384000 &&
      wav.readUInt16LE(p+20)===8 && wav.readUInt16LE(p+22)===32;
    if(id==='data') { need(!pcm,'Multiple clocked WAV data chunks'); pcm=wav.subarray(p+8,end); }
    p=end+(size&1);
  }
  need(format && pcm?.length>0 && pcm.length%8===0,'Expected 48 kHz stereo Float32 clocked capture');
  return pcm;
}
function callbackPrefix(text, host, extent) {
  const [header,...rows] = text.trim().split(/\r?\n/);
  need(header==='firstSinkFrame,firstProducerFrame,requested,supplied,startQpc,endQpc','Original callback map required');
  let sink=0, producer=0, limit=extent;
  for(const row of rows){
    const [s,p,asked,supplied,began,ended]=row.split(',').map(Number);
    need(s===sink&&p===producer&&asked===960&&Number.isInteger(supplied)&&supplied>=0&&supplied<=asked&&
      Number.isSafeInteger(began)&&Number.isSafeInteger(ended)&&began>0&&ended>=began,'Discontinuous discard callback map');
    if(asked!==supplied) limit=Math.min(limit,sink+supplied);
    sink+=asked; producer+=supplied;
  }
  need(sink===extent&&sink===host.consumedFrames,'Callback map differs from the captured file');
  if(host.underflowFrames){
    need(Number.isSafeInteger(host.firstUnderflowFrame)&&host.firstUnderflowFrame>=0&&host.firstUnderflowFrame<extent,
      'Invalid first underflow sample');
    limit=Math.min(limit,host.firstUnderflowFrame);
  }
  return limit;
}
const parseLines = text => text.toString('utf8').trim().split(/\r?\n/).filter(Boolean).map(row=>JSON.parse(row));

export async function openClockedTrafficReplay(root) {
  const binding=JSON.parse(await bytes(root,'clocked-replay.json',16384));
  need(binding.schema===1&&/^[a-f0-9]{32}$/.test(binding.session),'Clocked replay identity missing');
  const files={};
  for(const name of clockedFiles) {
    const input=await bytes(root,name);
    need(hash(input)===binding.files[name],'Clocked replay digest differs for '+name);
    files[name]=input;
  }
  const host=JSON.parse(files['host.json']), wav=files['clocked-output.wav'], pcm=waveData(wav), extent=pcm.length/8;
  need(host.session===binding.session && host.fixture===true && host.endpointOpened===false &&
    host.hostState==='stopped' && host.outputSink==='environment-observation','Completed device-free host receipt required');
  const limit=callbackPrefix(files['clocked-callbacks.csv'].toString('utf8'),host,extent);
  const witnesses=parseLines(files['clocked-contributors.jsonl']), contributions=[];
  for(const [i,row] of witnesses.entries()){
    const at=i*512;
    need(row.block===i&&row.frame===at,'Discontinuous contribution samples');
    if(at>=limit) continue;
    need(row.packetMatches&&row.packetLeft===pcm.readFloatLE(at*8)&&row.packetRight===pcm.readFloatLE(at*8+4),
      'Contributor sample differs from the clocked WAV');
    contributions[i]={sampleFrame:at,sampled:true,uncertain:row.unboundPaths>0,voices:row.contributors.map(v=>({
      vehicle:v.id,generation:v.generation,renderGeneration:v.rendererGeneration%4294967296,engine:'stock:slot'+v.slot+':engine',
      releasing:!v.active||!v.present,retired:!v.active,pcmPeak:Math.max(Math.abs(v.left),Math.abs(v.right))}))};
  }
  const frames=[],geometries=new Map(),events=[],paths=new Map(),passageRoutes=new Map(),overlap=[],releases=[];
  let stream,previous=-1,previousSequence=-1;
  for(const packet of parseLines(files['clocked-soundmap.jsonl'])){
    const {block,frame,geometry,renderedVoices,appliedPaths}=packet,at=block*512;
    need(Number.isSafeInteger(block)&&block>previous&&frame.sequence>previousSequence&&frame.audioFrame===at&&packet.session===host.session&&
      (frame.sessionId===host.session||frame.sessionId.startsWith(host.session+':')),'Clocked map/producer identity differs');
    previous=block;
    previousSequence=frame.sequence;
    stream??=frame.streamId;
    need(frame.streamId===stream,'Clocked map changed producer stream');
    if(at+512>limit)continue;
    need(hash(pcm.subarray(at*8,(at+512)*8))===packet.pcmSHA256,'Mapped block differs from the consumed stereo packet');
    if(geometry){
      const g=checkGeometry(geometry);
      need(g.generation===frame.geometryGeneration&&g.streamId===frame.streamId&&g.sessionId===frame.sessionId,'Clocked map geometry identity differs');
      geometries.set(g.generation,g);
    }
    need(!frame.geometryGeneration||geometries.has(frame.geometryGeneration),'Clocked map lost its source geometry');
    const mapped=checkFrame({...frame,take:'clocked',takeSampleFrame:at,comparisonSampleFrame:at,renderedVoices,appliedPaths});
    const witness=contributions[block];
    need(witness,'No consumed packet sample for the map observation');
    for(const voice of witness.voices.filter(v=>!v.retired))
      need(renderedVoices.some(v=>v.vehicle===voice.vehicle&&v.engine===voice.engine&&v.observedGeneration===voice.generation&&
        v.renderGeneration===voice.renderGeneration),'Clocked PCM and map vehicle lifetime differ');
    need(appliedPaths.every(t=>t.atFrame===at+512&&Number.isFinite(t.pan)&&Array.isArray(t.gainBands)&&
      t.gainBands.every(Number.isFinite)), 'Mixer data differs from the captured block');
    const row={timeMs:at/48,frame:mapped};
    frames.push(row);
    if(!witness.uncertain&&mapped.geometryGeneration&&witness.voices.filter(v=>!v.releasing).length===5) overlap.push(row);
    if(witness.voices.some(v=>v.retired)&&witness.voices.some(v=>!v.releasing))releases.push(row);
    const faces=new Map(geometries.get(mapped.geometryGeneration)?.surfaces.map(s=>[s.id,s]));
    for(const ray of mapped.paths){
      const tap=appliedPaths.find(t=>t.id===ray.id&&t.sourceId===ray.sourceId&&t.generation===ray.generation);
      if(ray.status!=='selected'||!tap||!ray.surfaceIds?.length||!ray.surfaceIds.every(id=>faces.has(id)))continue;
      const voice=witness.voices.find(v=>!v.releasing&&v.renderGeneration===tap.generation%4294967296&&
        (ray.sourceId===v.engine||ray.sourceId===v.engine.replace(':engine',':exhaust')));
      if (!voice) continue;
      const gain=Math.max(...tap.gainBands);
      if(gain>(paths.get(ray.order)?.gain??0)) paths.set(ray.order,{row,ray,gain});
      const player=mapped.renderedVoices.find(v=>v.context==='player'&&v.vehicle===voice.vehicle);
      if(!player||!mapped.sources.find(s=>s.id===player.engine)?.velocity?.some(x=>Math.abs(x)>.00001))continue;
      const normals=ray.surfaceIds.map(id=>faces.get(id).normal), first=normals[0],last=normals.at(-1);
      if(!first||!last||Math.abs(first[2])>=.5||Math.abs(last[2])>=.5||first.reduce((sum,x,i)=>sum+x*last[i],0)>-.8)continue;
      let label;
      if(ray.order===2&&ray.sourceId===player.engine&&tap.pan>0)label='Engine via two walls on the right';
      if(ray.order===3&&ray.sourceId===player.exhaust&&normals[1]?.[2]<-.65)label='Exhaust via wall, canopy and opposite wall';
      if(label&&gain>(passageRoutes.get(ray.order)?.gain??0))passageRoutes.set(ray.order,{row,ray,gain,label});
    }
  }
  need(frames.length>0,'No original SoundMap observations matched complete consumed packets');
  const event=(row,type,fields={})=>events.push({type,timeMs:row.timeMs,detail:{take:'clocked',sampleFrame:row.frame.takeSampleFrame,
    sequence:row.frame.sequence,streamId:row.frame.streamId,...fields}});
  if(overlap.length)event(overlap[Math.floor(overlap.length/2)],'Five sampled PCM contributors');
  for(const [order,entry] of paths)if(order>=2){
    const {row,ray,label}=passageRoutes.get(order)??entry;
    event(row,label??order+'-bounce mixer route',{pathId:ray.id,sourceId:ray.sourceId,surfaceIds:ray.surfaceIds,vertices:ray.vertices});
  }
  const tail=contributions.find(block=>block&&!block.uncertain&&block.voices.some(v=>v.retired)&&block.voices.some(v=>!v.releasing));
  if(tail){
    if(releases.length) event(releases[0],'Retired vehicle release');
    else events.push({type:'Retired vehicle release · PCM sample',timeMs:tail.sampleFrame/48,
      detail:{take:'clocked',sampleFrame:tail.sampleFrame,pcmOnly:true}});
    const newLife=frames.find(row=>row.frame.audioFrame>tail.sampleFrame&&contributions[row.frame.audioFrame/512].voices.some(v=>
      !v.releasing&&tail.voices.some(prior=>prior.retired&&prior.vehicle===v.vehicle&&prior.engine===v.engine&&
        prior.generation!==v.generation&&prior.renderGeneration!==v.renderGeneration)));
    if(newLife)event(newLife,'Recycled slot · new vehicle lifetime');
  }
  if(!events.length)event(frames[0],'First matched map observation');
  events.sort((a,b)=>a.timeMs-b.timeMs);
  const id='drive-clocked-'+binding.files['clocked-output.wav'].slice(0,16),durationMs=extent/48;
  return {id,frames,contributions,geometries,events,durationMs,originFrame:0,audioStartTimeMs:0,wav,audioPlayable:true,
    mapPrefixFrames:limit,manifest:{id,session:host.session,title:'Clocked traffic in the passage',mixerPathsRecorded:true,
    state:'stopped',timelineBasis:'clocked-discard-output',durationMs,originalMapFrames:frames.length,mapPrefixFrames:limit,
    audio:{kind:'clocked-discard-file',sampleRate:48000,channels:2,format:'wav-float32',capturedFrames:extent,
      sha256:binding.files['clocked-output.wav'],gaps:host.underflowFrames?[{firstFrame:host.firstUnderflowFrame,frames:host.underflowFrames}]:[],
      clockUncertainty:'Actual unit-gain discard callbacks. Geometry and rays apply only to matched original producer packets.'},
    takes:[{take:'clocked',firstFrame:0,frames:extent,wavSHA256:binding.files['clocked-output.wav']}]}};
}
