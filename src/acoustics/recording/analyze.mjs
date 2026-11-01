// Offline measurements only: never opens audio devices, records or uploads.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const db=value=>value>0?20*Math.log10(value):-180;
const percentile=(values,p)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*p)];};
export function readWave(file){
  const stat=fs.statSync(file);if(stat.size>268435456||stat.size<44)throw Error('Bounded WAV required');
  const b=fs.readFileSync(file);if(b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE'||b.readUInt32LE(4)+8!==b.length)throw Error('Incomplete RIFF/WAVE');
  let fmt,data;for(let at=12;at+8<=b.length;){const size=b.readUInt32LE(at+4),end=at+8+size;if(end>b.length)throw Error('Truncated WAV chunk');const kind=b.toString('ascii',at,at+4);if(kind==='fmt ')fmt=b.subarray(at+8,end);if(kind==='data')data=b.subarray(at+8,end);at=end+(size&1);}
  if(!fmt||fmt.length<16||!data)throw Error('WAV format/data missing');
  let codec=fmt.readUInt16LE(0);const channels=fmt.readUInt16LE(2),sampleRate=fmt.readUInt32LE(4),align=fmt.readUInt16LE(12),bits=fmt.readUInt16LE(14);
  if(codec===65534){if(fmt.length!==40||fmt.readUInt16LE(16)!==22)throw Error('Extensible format');const guid=fmt.subarray(24,40).toString('hex');codec=guid==='0300000000001000800000aa00389b71'?3:guid==='0100000000001000800000aa00389b71'?1:0;}
  if(channels<1||channels>8||sampleRate<8000||sampleRate>192000||align!==channels*bits/8||data.length%align||!(codec===3&&bits===32||codec===1&&[16,24,32].includes(bits)))throw Error('Unsupported lossless mix format');
  const count=data.length/(bits/8),frames=data.length/align;if(frames>sampleRate*120||count*8>268435456)throw Error('Decoded duration/memory budget exceeds120s/256MiB');
  const samples=new Float64Array(count);for(let i=0;i<samples.length;i++){const at=i*bits/8;samples[i]=codec===3?data.readFloatLE(at):bits===16?data.readInt16LE(at)/32768:bits===24?data.readIntLE(at,3)/8388608:data.readInt32LE(at)/2147483648;}
  return {sampleRate,channels,samples,frames,codec,bits,decodedPrecision:'Float64 preserves normalized PCM32 low bits',sha256:createHash('sha256').update(b).digest('hex')};
}
function pcmContract(value){return value&&(value.samples instanceof Float32Array||value.samples instanceof Float64Array)&&Number.isInteger(value.channels)&&value.channels>=1&&value.channels<=8&&Number.isInteger(value.sampleRate)&&value.sampleRate>=8000&&value.sampleRate<=192000&&value.samples.length%value.channels===0&&value.samples.length/value.channels<=value.sampleRate*120&&value.samples.byteLength<=268435456;}
function spectralSummary(samples,channels,rate){
  const frames=samples.length/channels;if(frames<64)return {available:false,reason:'Insufficient samples'};
  const n=2**Math.floor(Math.log2(Math.min(4096,frames))),re=new Float64Array(n),im=new Float64Array(n);let at=0;while(at<frames-n&&Math.abs(samples[at*channels])<.001)at++;
  for(let i=0;i<n;i++)re[i]=samples[(at+i)*channels]*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
  for(let size=2;size<=n;size*=2)for(let base=0;base<n;base+=size)for(let i=0;i<size/2;i++){const angle=-2*Math.PI*i/size,other=base+i+size/2,wr=Math.cos(angle),wi=Math.sin(angle),a=re[other]*wr-im[other]*wi,b=re[other]*wi+im[other]*wr;re[other]=re[base+i]-a;im[other]=im[base+i]-b;re[base+i]+=a;im[base+i]+=b;}
  let energy=0,weighted=0,max=0,dominant=0;const bands=[{lowHz:20,highHz:200,energy:0},{lowHz:200,highHz:2000,energy:0},{lowHz:2000,highHz:Math.min(20000,rate/2),energy:0}];
  for(let k=1;k<n/2;k++){const power=re[k]*re[k]+im[k]*im[k],hz=k*rate/n;energy+=power;weighted+=power*hz;if(power>max){max=power;dominant=hz;}for(const band of bands)if(hz>=band.lowHz&&hz<band.highHz)band.energy+=power;}
  return {available:energy>0,channel:0,startFrame:at,windowFrames:n,window:'Hann',frequencyResolutionHz:rate/n,centroidHz:energy>0?weighted/energy:null,dominantBinHz:energy>0?dominant:null,bands:bands.map(b=>({lowHz:b.lowHz,highHz:b.highHz,energyFraction:energy>0?b.energy/energy:0})),interpretation:'One bounded active-window spectrum; not an engine/source identity or perceptual-quality verdict'};
}
function correlation(a,b){if(a.length!==b.length||a.length<2)return null;let x=0,y=0,xx=0,yy=0,xy=0;for(let i=0;i<a.length;i++){x+=a[i];y+=b[i];xx+=a[i]*a[i];yy+=b[i]*b[i];xy+=a[i]*b[i];}const n=a.length,den=Math.sqrt(Math.max(0,xx-x*x/n)*Math.max(0,yy-y*y/n));return den>1e-20?(xy-x*y/n)/den:null;}
function pitchAt(samples,channels,start,rate){
  const skip=Math.max(1,Math.floor(rate/12000)),count=512,effective=rate/skip;if(start+(count-1)*skip>=samples.length/channels)return null;
  const values=new Float64Array(count);let energy=0;for(let i=0;i<count;i++){values[i]=samples[(start+i*skip)*channels];energy+=values[i]*values[i];}if(energy/count<1e-8)return null;
  const lo=Math.max(2,Math.floor(effective/2000)),hi=Math.min(240,Math.ceil(effective/50)),scores=[];
  for(let lag=lo;lag<=hi;lag++){let dot=0,a=0,b=0;for(let i=0;i<count-lag;i++){dot+=values[i]*values[i+lag];a+=values[i]*values[i];b+=values[i+lag]*values[i+lag];}scores.push({lag,score:a*b>1e-20?dot/Math.sqrt(a*b):0});}
  const maximum=Math.max(...scores.map(s=>s.score));if(maximum<.8)return null;
  const peak=scores.find((s,i)=>i>0&&i<scores.length-1&&s.score>=maximum*.98&&s.score>=scores[i-1].score&&s.score>=scores[i+1].score);if(!peak)return null;
  return {frequencyHz:effective/peak.lag,confidence:peak.score};
}
export function analyzePcm({samples,channels=2,sampleRate=48000},options={}){
  if(!pcmContract({samples,channels,sampleRate}))throw Error('Bounded Float32/Float64 PCM format');
  const frames=samples.length/channels;if(frames>sampleRate*120)throw Error('120-second analysis bound');
  const sum=new Float64Array(channels),squares=new Float64Array(channels),peaks=new Float64Array(channels);let nonfinite=0,nearFullScale=0,overFullScale=0,clickCount=0,silenceAt=-1;const silence=[],clicks=[],envelope=[],pan=[];
  const binFrames=Math.max(1,Math.round(sampleRate*.01));let binEnergy=0,binLeft=0,binRight=0,binSamples=0;
  for(let frame=0;frame<frames;frame++){
    let quiet=true;for(let channel=0;channel<channels;channel++){
      const value=samples[frame*channels+channel];if(!Number.isFinite(value)){nonfinite++;quiet=false;continue;}if(Math.abs(value)>3.5e38)throw Error('Unsupported PCM numeric magnitude');
      const absolute=Math.abs(value);sum[channel]+=value;squares[channel]+=value*value;peaks[channel]=Math.max(peaks[channel],absolute);if(absolute>=.9999)nearFullScale++;if(absolute>1)overFullScale++;if(absolute>1e-6)quiet=false;
      binEnergy+=value*value;binSamples++;if(channel===0)binLeft+=value*value;if(channel===1)binRight+=value*value;
      if(frame&&Math.abs(value-samples[(frame-1)*channels+channel])>(options.clickStep??.5)){clickCount++;if(clicks.length<64)clicks.push({frame,channel,delta:value-samples[(frame-1)*channels+channel]});}
    }
    if(quiet&&silenceAt<0)silenceAt=frame;
    if(!quiet&&silenceAt>=0){if(frame-silenceAt>=sampleRate*.02&&silence.length<64)silence.push({startFrame:silenceAt,frames:frame-silenceAt});silenceAt=-1;}
    if((frame+1)%binFrames===0||frame===frames-1){const rms=Math.sqrt(binEnergy/Math.max(1,binSamples));envelope.push({startFrame:Math.floor(frame/binFrames)*binFrames,rms});if(channels===2){const l=Math.sqrt(binLeft),r=Math.sqrt(binRight);pan.push(l+r>0?(r-l)/(l+r):0);}binEnergy=binLeft=binRight=binSamples=0;}
  }
  if(silenceAt>=0&&frames-silenceAt>=sampleRate*.02&&silence.length<64)silence.push({startFrame:silenceAt,frames:frames-silenceAt});
  const rms=Array.from(squares,x=>Math.sqrt(x/Math.max(1,frames))),overall=Math.sqrt(squares.reduce((a,b)=>a+b,0)/Math.max(1,frames*channels)),peak=Math.max(...peaks);
  const pitch=[],pitchJumps=[];for(let at=0;at<frames&&pitch.length<512;at+=Math.round(sampleRate*.25)){const estimate=pitchAt(samples,channels,at,sampleRate);if(estimate){const point={frame:at,...estimate},previous=pitch.at(-1);if(previous&&at-previous.frame<=sampleRate*.5){const semitones=12*Math.log2(point.frequencyHz/previous.frequencyHz);if(Math.abs(semitones)>3)pitchJumps.push({frame:at,semitones});}pitch.push(point);}}
  let stereo={available:false,reason:'Requires stereo channel identity'};
  if(channels===2){let dot=0,mono=0;for(let i=0;i<frames;i++){const a=samples[i*2],b=samples[i*2+1];if(Number.isFinite(a)&&Number.isFinite(b)){dot+=a*b;mono+=(a+b)*(a+b);}}const energy=squares[0]+squares[1],den=Math.sqrt(squares[0]*squares[1]);stereo={available:true,leftRightEnergyCorrelation:den>0?dot/den:null,leftRightRmsDb:rms[0]>0&&rms[1]>0?db(rms[0]/rms[1]):null,monoSumEnergyRelativeDb:energy>0?10*Math.log10(Math.max(mono/energy,1e-18)):null,maximum10msBalanceStep:pan.length>1?Math.max(...pan.slice(1).map((x,i)=>Math.abs(x-pan[i]))):0,physicalSpatialCorrectnessEstablished:false};}
  const levels=envelope.map(e=>db(e.rms));
  return {schema:1,sampleRate,channels,frames,durationSeconds:frames/sampleRate,sampleIntegrity:nonfinite===0,nonfiniteSamples:nonfinite,peak,rms:overall,perChannelRms:rms,crestDb:overall>0?db(peak/overall):null,nearFullScaleSamples:nearFullScale,overFullScaleSamples:overFullScale,windowRmsDynamicRangeDb:levels.length?percentile(levels,.95)-percentile(levels,.05):null,silenceRuns:silence,silenceInterpretation:'Measured silence, not automatically a dropout; expected activity and recorded underflow/index evidence are required',candidateDiscontinuityEdges:clicks,candidateDiscontinuityEdgeCount:clickCount,pitchEstimates:pitch,pitchJumpCandidates:pitchJumps,pitchInterpretation:'Autocorrelation of recorded channel0; harmonic/octave ambiguity and real gear changes can produce candidates, not automatic unnatural-pitch findings',spectral:nonfinite===0?spectralSummary(samples,channels,sampleRate):{available:false,reason:'Invalid samples'},stereo,envelope,engineExhaustPhase:{available:false,reason:'Final stereo mix cannot identify engine/exhaust components; exact aligned stems are required'},physicalRpmEstablished:false,subjectiveQualityEstablished:false};
}
export function analyzeAlignedComponents(a,b){
  if(!pcmContract(a)||!pcmContract(b))throw Error('Bounded component PCM required');
  if(!Number.isSafeInteger(a.startFrame)||a.startFrame<0||!Number.isSafeInteger(b.startFrame)||b.startFrame<0||typeof a.recordingId!=='string'||!a.recordingId||a.recordingId!==b.recordingId||typeof a.timelineId!=='string'||!a.timelineId||a.timelineId!==b.timelineId||a.alignmentUncertaintyFrames!==0||b.alignmentUncertaintyFrames!==0||a.sampleRate!==b.sampleRate||a.channels!==b.channels||a.startFrame!==b.startFrame||a.samples.length!==b.samples.length)return {available:false,reason:'Explicit matching recording/timeline/sample alignment required'};
  let ea=0,eb=0,combined=0;for(let i=0;i<a.samples.length;i++){if(!Number.isFinite(a.samples[i])||!Number.isFinite(b.samples[i]))return {available:false,reason:'Nonfinite component samples'};ea+=a.samples[i]**2;eb+=b.samples[i]**2;combined+=(a.samples[i]+b.samples[i])**2;}const relative=ea+eb>0?10*Math.log10(Math.max(combined/(ea+eb),1e-18)):null;return {available:true,correlation:correlation(a.samples,b.samples),sumEnergyRelativeDb:relative,destructiveCancellationCandidate:relative!==null&&relative< -12,interpretation:'Measured aligned-stem interaction, not inferred from the final mix or a perceptual verdict'};
}
export function estimateEnvelopeDelay(reference,mix,{maximumLagMs=500,clockUncertaintyMs=null}={}){
  if(!Number.isFinite(maximumLagMs)||maximumLagMs<0||maximumLagMs>1000)throw Error('Bounded0..1000ms lag required');
  const a=reference.envelope.map(e=>e.rms),b=mix.envelope.map(e=>e.rms);if(a.length<20||b.length<20||a.length>12001||b.length>12001||[...a,...b].some(x=>!Number.isFinite(x)))return {available:false,reason:'Insufficient or invalid bounded envelope activity'};
  let best=null;const minimumOverlap=Math.max(20,Math.ceil(Math.max(a.length,b.length)*.5));for(let lag=-Math.floor(maximumLagMs/10);lag<=Math.floor(maximumLagMs/10);lag++){const x=[],y=[];for(let i=0;i<a.length;i++){const j=i+lag;if(j>=0&&j<b.length){x.push(a[i]);y.push(b[j]);}}if(x.length<minimumOverlap)continue;const score=correlation(x,y);if(score!==null&&(!best||score>best.correlation))best={lagMs:lag*10,correlation:score,overlapBins:x.length};}
  if(!best||best.correlation<.8)return {available:false,reason:'Endpoint mix differs or has insufficient shared envelope activity'};
  return {available:true,...best,minimumResolutionUncertaintyMs:10,clockUncertaintyMs,absolutePlaybackLatencyEstablished:false,interpretation:'Envelope-similarity lag only; unrelated endpoint audio, processing, start offsets and unknown clock mapping can bias it. No physical speaker latency is measured'};
}
export function responseDelay(envelope,changes,{alignmentEstablished=false,clockUncertaintyMs=null,maximumResponseFrames=48000}={}){
  if(!alignmentEstablished)return {available:false,reason:'Explicit source-clock to recorded-audio frame alignment is required'};
  if(!Number.isSafeInteger(maximumResponseFrames)||maximumResponseFrames<1||maximumResponseFrames>192000)throw Error('Response search bound');
  const responses=[];for(const change of changes){if(!Number.isInteger(change.audioFrame)||change.audioFrame<0)throw Error('Mapped audio frame required');const before=envelope.filter(e=>e.startFrame<change.audioFrame).slice(-10);const baseline=percentile(before.map(e=>e.rms),.5);const after=before.length>=2?envelope.find(e=>e.startFrame>=change.audioFrame&&e.startFrame<=change.audioFrame+maximumResponseFrames&&Math.abs(e.rms-baseline)>.01):null;responses.push({audioFrame:change.audioFrame,responseFrame:after?.startFrame??null,delayFrames:after?after.startFrame-change.audioFrame:null,baselineAvailable:before.length>=2});}return {available:true,clockUncertaintyMs,responses,absoluteLatencyEstablished:false};
}
export function summarizeRecordedFacts(ownedIndex=null,loopbackIndex=null,events=null){
  for(const rows of [ownedIndex,loopbackIndex,events])if(rows!==null&&(!Array.isArray(rows)||rows.length>65536))throw Error('Bounded recorded diagnostics required');
  let expected=null,gaps=0,underflow=0,endSilence=0,badTiming=0,indexedFrames=0;for(const row of ownedIndex??[]){if(!Number.isSafeInteger(row.submittedFrame)||!Number.isSafeInteger(row.frames)||row.frames<1||row.frames>2048||!Number.isSafeInteger(row.underflowFrames)||row.underflowFrames<0)throw Error('Recorded submission contract');if(expected!==null&&row.submittedFrame!==expected)gaps++;expected=row.submittedFrame+(row.originalFrames??row.frames);underflow+=row.underflowFrames;indexedFrames+=row.frames;endSilence+=row.endSilenceFrames??0;if(!(row.preparedBeforeQpc<=row.copiedAfterQpc&&row.copiedAfterQpc<=row.committedAfterQpc))badTiming++;}
  const timing=(events??[]).filter(e=>e.type==='processing-timing'&&Number.isFinite(e.payload?.elapsedMs)&&Number.isFinite(e.payload?.deadlineMs));
  return {owned:{available:(ownedIndex?.length??0)>0,submissions:ownedIndex?.length??null,indexedFrames:ownedIndex?indexedFrames:null,recordedUnderflowFrames:ownedIndex?underflow:null,recordedEndSilenceFrames:ownedIndex?endSilence:null,submittedFrameDiscontinuities:ownedIndex?gaps:null,invalidSubmissionClockOrder:ownedIndex?badTiming:null},loopback:{available:(loopbackIndex?.length??0)>0,packets:loopbackIndex?.length??null,discontinuityFlags:loopbackIndex?loopbackIndex.filter(r=>(r.flags&1)!==0).length:null,timestampErrorFlags:loopbackIndex?loopbackIndex.filter(r=>(r.flags&4)!==0).length:null,explicitSilentPackets:loopbackIndex?loopbackIndex.filter(r=>(r.flags&2)!==0).length:null},processing:{available:timing.length>0,recordedTimingEvents:timing.length,recordedOverruns:timing.length?timing.filter(e=>e.payload.elapsedMs>e.payload.deadlineMs).length:null},interpretation:'Only recorded counters and events are measured. Missing instrumentation is unavailable, not evidence of zero starvation/overruns; source clocks remain separate without measured anchors'};
}
function readIndex(file){if(!file)return null;if(fs.statSync(file).size>16777216)throw Error('Bounded diagnostic file required');const rows=fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean);if(rows.length>65536||rows.some(line=>Buffer.byteLength(line)>4096))throw Error('Diagnostic row budget');return rows.map(JSON.parse);}
function cli(){
  const args=process.argv.slice(2),value=name=>{const at=args.indexOf(name);return at<0?null:args[at+1];},owned=value('--owned'),loopback=value('--loopback'),output=value('--output');if(!owned||!output)throw Error('Use --owned <lossless WAV> [--loopback <WAV>] --output <new private JSON>');
  const repo=path.dirname(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))),out=path.resolve(output);if(!['.local','build'].some(name=>out.startsWith(path.join(repo,name)+path.sep)))throw Error('Private repository output required');for(let at=path.dirname(out);;at=path.dirname(at)){if(fs.existsSync(at)&&fs.lstatSync(at).isSymbolicLink())throw Error('Linked output parent');if(path.dirname(at)===at)break;}
  const input=readWave(owned),analysis=analyzePcm(input);const facts=summarizeRecordedFacts(readIndex(value('--index')),readIndex(value('--loopback-index')),readIndex(value('--events')));const result={schema:1,origin:'Recorded-file analysis only; provenance and live acceptance are not inferred',owned:{sha256:input.sha256,...analysis},loopback:null,alignment:null,recordedFacts:facts,ownedIndexFrameCountMatchesWave:facts.owned.available?facts.owned.indexedFrames===input.frames:null};if(loopback){const wav=readWave(loopback),mix=analyzePcm(wav);result.loopback={sha256:wav.sha256,...mix};result.alignment=estimateEnvelopeDelay(analysis,mix);}
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log('Measured recording diagnostics; physical latency, source-component phase and subjective quality remain conditional.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)cli();
