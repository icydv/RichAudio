import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

// The discard sink writes unit-gain Float32 stereo. Keep producer and sink
// coordinates separate and stop at the first missing sample, including when
// a concurrent admission supplies more frames later in that same callback.
export function verifyClockedContributors({host,callbacks,rows,frames,stereoAt,phases,admissions=[]}) {
  const frequency=host.publicationClockFrequency;
  if(!(frequency>0) || frames!==host.consumedFrames)throw Error('Sink clock or capture frame count differs');
  let nextSink=0,nextProducer=0;
  for(const c of callbacks){
    if(c.firstSinkFrame!==nextSink || c.firstProducerFrame!==nextProducer || c.requested!==960 ||
      !Number.isInteger(c.supplied) || c.supplied<0 || c.supplied>c.requested ||
      !Number.isSafeInteger(c.startQpc) || c.startQpc<=0 || c.endQpc<c.startQpc)
      throw Error('Incomplete clocked callback map');
    nextSink+=c.requested;
    nextProducer+=c.supplied;
  }
  if(nextSink!==frames)throw Error('Callback map does not cover the captured WAV');
  const cutoff=host.underflowFrames>0?host.firstUnderflowFrame:frames;
  if(!Number.isSafeInteger(cutoff)||cutoff<0||cutoff>frames)throw Error('Invalid first-underflow boundary');
  const identities=new Map(),maxima={active:0,reflectedPaths:0,installedMovingActive:0,installedMovingReflectedPaths:0,
    installedMovingNonzeroPathsByOrder:[0,0,0,0]};
  const admitted=new Map(admissions.map(a=>[a.block,a.admissionQpc]));
  let exactPacketSamples=0,sinkPcmMismatches=0,unboundSamples=0,witnessesOutsideQualifiedCapture=0;
  const fullyMovingMultiBounceSamplesByPopulation={};
  let fiveSamples=0,fiveInstalledMovingSamples=0,longestFiveSampleSequence=0,currentRun=0,previousFive=-2;
  let fiveExample=null,callbackIndex=0;
  for(let i=0;i<rows.length;i++){
    const row=rows[i];
    if(row.block!==i||row.frame!==i*512)throw Error('Noncontiguous producer witness');
    while(callbackIndex<callbacks.length && row.frame>=callbacks[callbackIndex].firstProducerFrame+callbacks[callbackIndex].supplied)callbackIndex++;
    const c=callbacks[callbackIndex];
    if(!c){witnessesOutsideQualifiedCapture++;continue;}
    const sink=c.firstSinkFrame+row.frame-c.firstProducerFrame;
    if(sink>=cutoff){witnessesOutsideQualifiedCapture++;continue;}
    const [left,right]=stereoAt(sink);
    if(!row.packetMatches || left!==row.packetLeft || right!==row.packetRight){sinkPcmMismatches++;continue;}
    exactPacketSamples++;
    if(row.unboundPaths){unboundSamples++;continue;}
    const moving=phases[i]?.movingVoices??phases[i]?.moving??0;
    const installedMoving=Boolean(phases[i]?.installed&&moving>0);
    maxima.active=Math.max(maxima.active,row.activeContributors);
    maxima.reflectedPaths=Math.max(maxima.reflectedPaths,row.reflectedPaths);
    if(installedMoving){
      maxima.installedMovingActive=Math.max(maxima.installedMovingActive,row.activeContributors);
      maxima.installedMovingReflectedPaths=Math.max(maxima.installedMovingReflectedPaths,row.reflectedPaths);
      row.nonzeroPathsByOrder?.forEach((value,order)=>{
        maxima.installedMovingNonzeroPathsByOrder[order]=Math.max(maxima.installedMovingNonzeroPathsByOrder[order],value);
      });
      const activeMoving=row.contributors.filter(v=>v.active&&v.present&&v.moving);
      if(activeMoving.length===row.activeContributors && activeMoving.some(v=>v.presentMultiBouncePaths>0))
        fullyMovingMultiBounceSamplesByPopulation[activeMoving.length]=(fullyMovingMultiBounceSamplesByPopulation[activeMoving.length]??0)+1;
    }
    if(row.activeContributors===5){
      fiveSamples++;
      if(installedMoving)fiveInstalledMovingSamples++;
      currentRun=previousFive===i-1?currentRun+1:1;
      longestFiveSampleSequence=Math.max(longestFiveSampleSequence,currentRun);
      previousFive=i;
      if(!fiveExample || (!fiveExample.installedMoving && installedMoving))
        fiveExample={block:i,sinkFrame:sink,installedMoving,movingVoices:moving,stereo:[left,right],contributors:row.contributors};
    }
    for(const v of row.contributors){
      const key=[v.id,v.generation,v.acquisition,v.rendererGeneration,v.slot].join('/');
      let item=identities.get(key);
      if(!item){
        item={id:v.id,generation:v.generation,acquisition:v.acquisition,rendererGeneration:v.rendererGeneration,
          slot:v.slot,model:v.model,context:v.context,firstSinkFrame:sink,lastSinkFrame:sink,activeSamples:0,
          releasedVoiceSamples:0,firstReleasedSinkFrame:null,discardSamples:0,reflectedPathSamples:0,
          unknownDryAgeSamples:0,dryDeadlinePassedAtCallbackStartSamples:0,dryDeadlineCrossedDuringCallbackSamples:0,
          strictFreshAtCallbackEndSamples:0,fullyTracedLimitingTapSamples:0,minimumSelectionMarginMs:null,worstLateTap:null,
          dryDeadlinePassedByPath:v.dryDeadlineByPath?{direct:0,reflected:0,release:0}:null,
          maximumOldestDryAgeAtCallbackEndMs:null};
        identities.set(key,item);
      }
      item.discardSamples++;
      item.lastSinkFrame=sink;
      if(v.active && v.present)item.activeSamples++;
      if(!v.active){
        item.releasedVoiceSamples++;
        item.firstReleasedSinkFrame??=sink;
      }
      if(v.reflectedPaths>0)item.reflectedPathSamples++;
      if(v.unknownDryTaps || v.earliestDryDeadlineQpc===null || v.oldestDryObservationQpc===null)item.unknownDryAgeSamples++;
      if(Number.isSafeInteger(v.earliestDryDeadlineQpc)){
        if(c.startQpc>=v.earliestDryDeadlineQpc)item.dryDeadlinePassedAtCallbackStartSamples++;
        else if(c.endQpc>=v.earliestDryDeadlineQpc)item.dryDeadlineCrossedDuringCallbackSamples++;
        else if(v.unknownDryTaps===0)item.strictFreshAtCallbackEndSamples++;
      }
      const tap=v.limitingTap,admitQpc=admitted.get(i);
      if(tap && Number.isFinite(tap.selectionMarginMs)){
        item.minimumSelectionMarginMs=Math.min(item.minimumSelectionMarginMs??Infinity,tap.selectionMarginMs);
        if(Number.isSafeInteger(admitQpc)&&admitQpc<=c.startQpc){
          item.fullyTracedLimitingTapSamples++;
          const pastDeadlineMs=(c.startQpc-tap.deadlineQpc)*1000/frequency;
          if(pastDeadlineMs>=0 && (!item.worstLateTap || pastDeadlineMs>item.worstLateTap.pastDeadlineMs)){
            item.worstLateTap={block:i,sinkFrame:sink,kind:tap.kind,pastDeadlineMs,selectionOlderBracketAgeMs:tap.selectionAgeMs,
              selectionMarginMs:tap.selectionMarginMs,modeledFlightMs:tap.flightFrames/48,
              observationToRingAdmissionMs:(admitQpc-tap.observedQpc)*1000/frequency,
              admissionToCallbackStartMs:(c.startQpc-admitQpc)*1000/frequency,
              observationToCallbackStartMs:(c.startQpc-tap.observedQpc)*1000/frequency};
          }
        }
      }
      if(item.dryDeadlinePassedByPath)for(const kind of ['direct','reflected','release']){
        const cutoff=v.dryDeadlineByPath[kind];
        if(cutoff!==null&&c.startQpc>=cutoff)item.dryDeadlinePassedByPath[kind]++;
      }
      if(Number.isSafeInteger(v.oldestDryObservationQpc)){
        const age=(c.endQpc-v.oldestDryObservationQpc)*1000/frequency;
        item.maximumOldestDryAgeAtCallbackEndMs=Math.max(item.maximumOldestDryAgeAtCallbackEndMs??-Infinity,age);
      }
    }
  }
  return {scope:'One actual post-delay stereo sample per 512-frame producer packet matched at unit gain to its captured pre-underflow callback frame. Deadlines describe dry-block control at emission. A delayed reflection or bounded release can legitimately carry earlier pressure.',
    exactPacketSamples,sinkPcmMismatches,unboundSamples,witnessesOutsideQualifiedCapture,firstExcludedSinkFrame:cutoff,
    durationSeconds:frames/48000,maximum:maxima,fullyMovingMultiBounceSamplesByPopulation,fiveSamples,fiveInstalledMovingSamples,longestFiveSampleSequence,fiveExample,
    identities:[...identities.values()]};
}

// The capture is exactly LosslessWaveWriter.FloatStereo(). Read its two
// required chunks without expanding the 180-second limit into doubled PCM.
function readClockedOutput(file) {
  const size=fs.statSync(file).size;
  if(size<44 || size>48000*180*8+1024)throw Error('Clocked capture size');
  const bytes=fs.readFileSync(file);
  if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE'||bytes.readUInt32LE(4)+8!==bytes.length)
    throw Error('Incomplete clocked capture');
  let format=false,data=null;
  for(let p=12;p+8<=bytes.length;){
    const n=bytes.readUInt32LE(p+4),end=p+8+n;
    if(end>bytes.length)throw Error('Partial WAV chunk');
    const id=bytes.toString('ascii',p,p+4);
    if(id==='fmt '&&n>=16) format=bytes.readUInt16LE(p+8)===3&&bytes.readUInt16LE(p+10)===2&&
      bytes.readUInt32LE(p+12)===48000&&bytes.readUInt16LE(p+20)===8&&bytes.readUInt16LE(p+22)===32;
    if(id==='data')data=bytes.subarray(p+8,end);
    p=end+(n&1);
  }
  if(!format||!data||data.length%8)throw Error('Expected 48 kHz Float32 stereo');
  return {frames:data.length/8,sha256:createHash('sha256').update(bytes).digest('hex'),
    stereoAt:i=>[data.readFloatLE(i*8),data.readFloatLE(i*8+4)]};
}

function numericRows(csv) {
  const [first,...lines]=csv.trim().split(/\r?\n/),keys=first.split(',');
  return lines.map(line=>Object.fromEntries(line.split(',').map((s,i)=>[keys[i],s===''?null:Number(s)])));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const dir=path.resolve(process.argv[2]??'');
  if(!dir.split(path.sep).includes('.local'))throw Error('Provide a private clocked gameplay session directory');
  const read=name=>fs.readFileSync(path.join(dir,name),'utf8');
  const host=JSON.parse(read('host.json'));
  if(!host.fixture||host.endpointOpened||host.outputSink!=='environment-observation'||host.session!==path.basename(dir))
    throw Error('Session is not a device-free fleet capture');
  const rows=read('clocked-contributors.jsonl').trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const wav=readClockedOutput(path.join(dir,'clocked-output.wav'));
  const admissions=fs.existsSync(path.join(dir,'clocked-admissions.csv'))?numericRows(read('clocked-admissions.csv')):[];
  const result=verifyClockedContributors({host,rows,callbacks:numericRows(read('clocked-callbacks.csv')),
    phases:numericRows(read('clocked-blocks.csv')),admissions,...wav});
  result.session=host.session;
  result.wavSha256=wav.sha256;
  const resultPath=path.join(dir,'clocked-contributor-result.json'),bytes=JSON.stringify(result,null,2)+'\n';
  if(fs.existsSync(resultPath)){
    if(fs.readFileSync(resultPath,'utf8')!==bytes)throw Error('A different contributor result already exists in this session');
  }else fs.writeFileSync(resultPath,bytes,{flag:'wx'});
  console.log(JSON.stringify({session:host.session,matched:result.exactPacketSamples,mismatches:result.sinkPcmMismatches,
    fiveSamples:result.fiveSamples,fiveInstalledMovingSamples:result.fiveInstalledMovingSamples}));
}
