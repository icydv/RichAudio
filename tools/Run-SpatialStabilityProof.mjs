// Focused device-free regression of the actual producer, worker, propagation,
// causal renderer, guard and RA07 framing. Native integration is run separately
// by Test-SpatialStability.ps1. No audio endpoint or playback is constructed.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {spatialCases,spatialDuration,spatialEvents,spatialPose} from '../tests/fixtures/SpatialTrajectories.mjs';

const FS=48000,BLOCK=512,hash=b=>createHash('sha256').update(b).digest('hex');
const root=fileURLToPath(new URL('../',import.meta.url));
function writeNew(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2),{flag:'wx'});}
export function writeSpatialWav(file,pcm,gain=.20){
  const data=Buffer.alloc(pcm.length),header=Buffer.alloc(44);for(let i=0;i<pcm.length;i+=4)data.writeFloatLE(Math.fround(pcm.readFloatLE(i)*Math.fround(gain)),i);
  header.write('RIFF');header.writeUInt32LE(data.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(3,20);header.writeUInt16LE(2,22);header.writeUInt32LE(FS,24);header.writeUInt32LE(FS*8,28);header.writeUInt16LE(8,32);header.writeUInt16LE(32,34);header.write('data',36);header.writeUInt32LE(data.length,40);fs.writeFileSync(file,Buffer.concat([header,data]),{flag:'wx'});
}
const quantile=(a,p)=>{const sorted=a.filter(Number.isFinite).sort((x,y)=>x-y);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]??null;};
export function spatialPcmMetrics(pcm,trace,final){
  let peak=0,sum=0,step=0,boundaryStep=0,nonfinite=0,clipped=0,boundarySecond=0,interiorSecond=0,nb=0,ni=0;
  const balances=[],windows=240,periods=[];let lastCross=null;
  for(let at=0;at<pcm.length;at+=4){const x=pcm.readFloatLE(at);if(!Number.isFinite(x)){nonfinite++;continue;}peak=Math.max(peak,Math.abs(x));sum+=x*x;if(Math.abs(x)>=.5+1e-7)clipped++;if(at>=8){const d=Math.abs(x-pcm.readFloatLE(at-8));step=Math.max(step,d);if((at>>3)%BLOCK===0)boundaryStep=Math.max(boundaryStep,d);}if(at>=16){const d=x-2*pcm.readFloatLE(at-8)+pcm.readFloatLE(at-16);if((at>>3)%BLOCK<2){boundarySecond+=d*d;nb++;}else{interiorSecond+=d*d;ni++;}}}
  for(let frame=0;(frame+windows)*8<=pcm.length;frame+=windows){let l=0,r=0;for(let j=0;j<windows;j++){l+=pcm.readFloatLE((frame+j)*8)**2;r+=pcm.readFloatLE((frame+j)*8+4)**2;}balances.push({time:(frame+windows/2)/FS,balance:l+r>1e-15?(r-l)/(r+l):null,rms:Math.sqrt((l+r)/(2*windows))});}
  for(let i=1;i<pcm.length/8;i++){const a=pcm.readFloatLE((i-1)*8)+pcm.readFloatLE((i-1)*8+4),b=pcm.readFloatLE(i*8)+pcm.readFloatLE(i*8+4);if(a<0&&b>=0&&b-a>1e-10){const crossing=i-1-a/(b-a);if(lastCross!==null&&crossing-lastCross>40&&crossing-lastCross<160)periods.push({time:crossing/FS,hz:FS/(crossing-lastCross)});lastCross=crossing;}}
  const controls=trace.filter(t=>Number.isFinite(t.pan)),panSteps=controls.slice(1).map((t,i)=>Math.abs(t.pan-controls[i].pan));
  const gainSteps=controls.slice(1).map((t,i)=>Math.max(...(t.pathPresentation.find(p=>p.order===0)?.bands??[0]).map((v,k)=>Math.abs(v-(controls[i].pathPresentation.find(p=>p.order===0)?.bands[k]??0)))));
  const rates=controls.map(t=>t.pathPresentation.find(p=>p.order===0)?.rate).filter(Number.isFinite),rateSteps=rates.slice(1).map((v,i)=>Math.abs(v-rates[i]));
  const stageAge=trace.map(t=>t.listenerTiming?.spatialDelayMs??(t.frame/FS-t.targetTime)*1000);
  const core=trace.map(t=>(t.dspMilliseconds??0)+(t.simulationMilliseconds??0));
  const cpu=trace.map(t=>t.processingMilliseconds).filter(Number.isFinite);
  let balanceSteps=[];for(let i=1;i<balances.length;i++)if(balances[i].balance!==null&&balances[i-1].balance!==null)balanceSteps.push(Math.abs(balances[i].balance-balances[i-1].balance));
  const levelSteps=[];for(let i=1;i<balances.length;i++)if(balances[i].time>.5&&balances[i].time<pcm.length/8/FS-.6)levelSteps.push(Math.abs(balances[i].rms-balances[i-1].rms));
  const pitches=periods.filter(p=>p.time>.5&&p.time<pcm.length/8/FS-.6),pitchJumps=pitches.slice(1).map((p,i)=>Math.abs(p.hz-pitches[i].hz));
  const spectral={};const start=FS*.6,end=Math.min(FS*.9,pcm.length/8);for(const hz of [600,1200,1800]){let re=0,im=0;for(let i=start;i<end;i++){const x=pcm.readFloatLE(i*8)+pcm.readFloatLE(i*8+4),a=2*Math.PI*hz*i/FS;re+=x*Math.cos(a);im-=x*Math.sin(a);}spectral[hz]=2*Math.hypot(re,im)/Math.max(1,end-start);}
  return {frames:pcm.length/8,seconds:pcm.length/8/FS,peak,rms:Math.sqrt(sum/Math.max(1,pcm.length/4)),headroomToGuard:.5-peak,nonfiniteSamples:nonfinite,overCeilingSamples:clipped,maximumSampleStep:step,maximumBlockBoundaryStep:boundaryStep,blockBoundarySecondDifferenceRms:Math.sqrt(boundarySecond/Math.max(1,nb)),interiorSecondDifferenceRms:Math.sqrt(interiorSecond/Math.max(1,ni)),maximumFiveMsStereoBalanceStep:Math.max(0,...balanceSteps),maximumFiveMsRmsStep:Math.max(0,...levelSteps),pitchZeroCrossing:{samples:pitches.length,minimumHz:quantile(pitches.map(p=>p.hz),0),maximumHz:quantile(pitches.map(p=>p.hz),1),maximumCycleFrequencyJumpHz:Math.max(0,...pitchJumps),method:'positive-going zero crossings of unnormalised L+R PCM; no pitch fitting or source-rate substitution'},maximumControlPanStep:Math.max(0,...panSteps),maximumControlGainStep:Math.max(0,...gainSteps),maximumControlRateStep:Math.max(0,...rateSteps),spatialControlDelayMs:{median:quantile(stageAge,.5),p95:quantile(stageAge,.95),maximum:quantile(stageAge,1)},matchedCoreWorkMs:{median:quantile(core,.5),p95:quantile(core,.95),maximum:quantile(core,1),scope:'DSP method plus worker simulation method, identical measured stages in both implementations'},processingMs:{samples:cpu.length,median:quantile(cpu,.5),p95:quantile(cpu,.95),maximum:quantile(cpu,1),scope:'New completed block pipeline including worker roundtrip and stdout; unavailable in original, not compared against core work'},harmonicAmplitudeFixedWindow:spectral,missingHistory:final?.dsp?.missingHistory??null,cursorResets:final?.dsp?.cursorResets??null,qualityDeadlineMisses:final?.acousticSettings?.qualityDeadlineMisses??null,trimRejectedBlocks:final?.outputTrim?.rejectedBlocks??null,actualSampleEvolution:{maximumPanStep:final?.dsp?.maximumPanStep??null,maximumGainStep:final?.dsp?.maximumGainStep??null,maximumRateStep:final?.dsp?.maximumRateStep??null},balances};
}
export function authoredMotionPan(name,time){
 const p=spatialPose(name,Math.max(0,time)),s=p.source?.positionNative??[99.7,200.1,3.8],delta=s.map((x,i)=>x-p.position[i]),n=Math.hypot(...delta);
 return n>1e-9?(delta[0]*p.forward[1]-delta[1]*p.forward[0])/n:0;
}
export function authoredMaximumFiveMsStep(name){
 name=name.replace(/-normal$/,'');if(!['slow-rotation','rapid-rotation'].includes(name))return null;
 const p=spatialPose(name,0),d=[99.7,200.1,3.8].map((x,i)=>x-p.position[i]),horizontal=Math.hypot(d[0],d[1])/Math.hypot(...d),omega=name==='rapid-rotation'?Math.PI/.15:Math.PI;
 return 2*horizontal*Math.sin(omega*.005/2);
}
export function spatialIncrementMetrics(values,ideal,valueKey='balance'){
 let maximumDirectionErrorAfterLatency=0,maximumDerivativeResidual=0,maximumExcessIncrement=0,energy=0;
 for(let i=0;i<values.length;i++){
  const b=values[i];maximumDirectionErrorAfterLatency=Math.max(maximumDirectionErrorAfterLatency,Math.abs(b[valueKey]-ideal(b.time)));
  if(i){const a=values[i-1],actual=b[valueKey]-a[valueKey],expected=ideal(b.time)-ideal(a.time),residual=actual-expected;
   maximumDerivativeResidual=Math.max(maximumDerivativeResidual,Math.abs(residual));maximumExcessIncrement=Math.max(maximumExcessIncrement,Math.abs(actual)-Math.abs(expected));energy+=residual*residual;
  }
 }
 return {maximumDirectionErrorAfterLatency,maximumDerivativeResidual,maximumExcessIncrement,derivativeResidualRms:Math.sqrt(energy/Math.max(1,values.length-1))};
}
export function motionResponse(name,metrics,trace){
 name=name.replace(/-normal$/,'');
 if(!['slow-rotation','rapid-rotation','orbit','close-pass'].includes(name))return null;
 const ideal=time=>authoredMotionPan(name,time);
 const fit=(values,valueKey)=>{let best=null;for(let lagMs=0;lagMs<=250;lagMs++){let sum=0,count=0;for(const value of values){if(value.time<1||value.time>Math.min(3.3,metrics.seconds-.6)||!Number.isFinite(value[valueKey]))continue;sum+=(value[valueKey]-ideal(value.time-lagMs/1000))**2;count++;}const rms=Math.sqrt(sum/Math.max(1,count));if(!best||rms<best.trackingRms)best={lagMs,trackingRms:rms,samples:count};}const filtered=values.filter(v=>v.time>1.1&&v.time<Math.min(3.2,metrics.seconds-.6)&&Number.isFinite(v[valueKey]));return {...best,...spatialIncrementMetrics(filtered,time=>ideal(time-best.lagMs/1000),valueKey)};};
 const stopped=metrics.balances.filter(v=>v.time>=1.65&&v.time<=2.2&&v.balance!==null),opposite=name==='rapid-rotation'?Math.max(0,-Math.min(...stopped.map(v=>v.balance))):null;
 const lastOutside=name==='rapid-rotation'?stopped.findLast(v=>Math.abs(v.balance)>.02):null;
 const pcmFit=fit(metrics.balances,'balance'),controlFit=fit(trace.map(t=>({time:t.observationRelativeTimeSeconds??t.frame/FS,pan:t.pan})),'pan');if(name==='orbit'){pcmFit.lagMs=null;controlFit.lagMs=null;pcmFit.lagIdentifiable=false;controlFit.lagIdentifiable=false;}
 return {method:'fixed gain5ms stereo energy balance and solver pan versus exact authored direction; lag grid0..250ms,1ms spacing; no fitted gain or file shift',pcm:pcmFit,controls:controlFit,rapidStop:name==='rapid-rotation'?{authoredRotationStopsAtSeconds:1.65,oppositeSideStereoBalanceOvershoot:opposite,settledWithinBalance002AfterMs:lastOutside?(lastOutside.time+.0025-1.65)*1000:0,scope:'Original and corrected unnormalised PCM; poststop opposite side excursion is not requested by the authored camera'}:null,orbitDirectionExpected:name==='orbit'?'Camera always faces source: expected direct pan zero; lag fit is not identifiable for this constant direction':null,uncertaintyMs:3.5,uncertaintyScope:'Window-center and lag-grid resolution only; scheduler and endpoint latency uncertainty are separate',scope:'controllable replay response, not speaker-to-ear latency'};
}
export function motionAcceptance(results){
 const rows=[];for(const row of results){const a=row.baseline?.metrics,b=row.corrected.metrics,checks=[];if(!a||!b.motionResponse)continue;
  if(row.name.includes('rotation')){
   checks.push({name:'authored-continuous-five-ms-step-bound',passed:b.maximumFiveMsStereoBalanceStep<=authoredMaximumFiveMsStep(row.name)+.002,authoredMaximumStep:authoredMaximumFiveMsStep(row.name),toleranceAbsoluteBalance:.002});
   checks.push({name:'pointwise-increment-error-nonregression',passed:b.motionResponse.pcm.maximumDerivativeResidual<=a.motionResponse.pcm.maximumDerivativeResidual+.002,toleranceAbsoluteBalance:.002});
   checks.push({name:'direction-derivative-continuity',passed:b.motionResponse.pcm.derivativeResidualRms<=a.motionResponse.pcm.derivativeResidualRms+.0015,toleranceRmsBalance:.0015});
   checks.push({name:'direction-tracking-nonregression',passed:b.motionResponse.pcm.trackingRms<=a.motionResponse.pcm.trackingRms+.0015,toleranceRmsBalance:.0015});
  }
  if(row.name.endsWith('-normal')){
   const improvement=a.motionResponse.pcm.lagMs-b.motionResponse.pcm.lagMs,uncertainty=b.motionResponse.uncertaintyMs;
   checks.push({name:'resolved-material-nominal-latency-reduction',passed:Number.isFinite(improvement)&&improvement>2*uncertainty&&improvement/a.motionResponse.pcm.lagMs>=.15,improvementMs:improvement,measurementUncertaintyMs:uncertainty,minimumRelativeReduction:.15});
  }
  if(row.name.startsWith('rapid-rotation'))checks.push({name:'no-uncommanded-opposite-side-rotation-stop',passed:b.motionResponse.rapidStop.oppositeSideStereoBalanceOvershoot<=a.motionResponse.rapidStop.oppositeSideStereoBalanceOvershoot+.01,toleranceAbsoluteBalance:.01});
  if(row.name==='orbit')checks.push({name:'coherent-source-facing-orbit',passed:b.motionResponse.pcm.maximumDirectionErrorAfterLatency<=.001,toleranceAbsoluteBalance:.001});
  if(checks.length)rows.push({name:row.name,passed:checks.every(c=>c.passed),checks,...(row.name.includes('rotation')?{formerRawMaximumStepHeuristic:{passed:b.maximumFiveMsStereoBalanceStep<=a.maximumFiveMsStereoBalanceStep+.002,toleranceAbsoluteBalance:.002,governing:false,reason:'A blurred baseline can have a smaller commanded-motion peak; compare authored continuous bound and pointwise increment error instead'}}:{})});
 }return {scope:'Numeric unnormalised actual PCM criteria; subjective smoothness and speaker latency remain unverified',passed:rows.every(r=>r.passed),cases:rows};
}
export async function runSpatialCase(sourceRoot,name,destination){
  fs.mkdirSync(destination,{recursive:true});const events=spatialEvents(name),frames=Math.ceil(spatialDuration(name)*FS/BLOCK)*BLOCK;
  writeNew(path.join(destination,'input.json'),{schemaVersion:1,name,profile:{frequencyHz:600,level:.44,trimDb:12,hostGain:.20,quality:'balanced',acceleration:'auto',sampleRate:FS,blockFrames:BLOCK},events});
  const args=[path.join(sourceRoot,'tools','Run-Acoustics07.mjs'),'--headless-clock','audio','--trace-blocks','yes','--history-diagnostics','yes','--listener-input','required','--geometry-input','required','--acoustic-quality','balanced','--acoustic-acceleration','auto','--beacon-frequency-hz','600','--beacon-level','0.44','--beacon-output-trim-db','12'];
  const child=spawn(process.execPath,args,{cwd:sourceRoot,windowsHide:true,stdio:['pipe','pipe','pipe']});let pending=Buffer.alloc(0),text='',stderr='',chunks=[],traces=[],final=null,failure=null,closed=false,exitCode=null,notify=null,index=0,blocks=0;
  child.stdin.on('error',()=>{});child.on('error',e=>{failure=e;notify?.();});child.on('close',code=>{closed=true;exitCode=code;notify?.();});
  child.stdout.on('data',chunk=>{try{pending=Buffer.concat([pending,chunk]);if(pending.length>65536)throw Error('Bounded PCM framing');while(pending.length>=4112){assert.equal(pending.toString('ascii',0,4),'RA07');assert.equal(pending.readUInt32LE(4),blocks);assert.equal(pending.readUInt32LE(8),BLOCK);assert.equal(pending.readUInt32LE(12),0);chunks.push(Buffer.from(pending.subarray(16,4112)));pending=pending.subarray(4112);blocks++;}notify?.();}catch(e){failure=e;notify?.();}});
  child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{stderr+=chunk;text+=chunk;try{if(stderr.length>64*1024*1024)throw Error('Bounded60-second trajectory trace');let at;while((at=text.indexOf('\n'))>=0){const line=text.slice(0,at);text=text.slice(at+1);if(!line.trim())continue;const e=JSON.parse(line);if(e.type==='block')traces.push(e);if(e.type==='final')final=e;}notify?.();}catch(e){failure=e;notify?.();}});
  const wait=async predicate=>{const deadline=performance.now()+10000;while(!predicate()&&!failure){if(performance.now()>deadline)throw Error('Actual producer bounded response');await new Promise(resolve=>{const timer=setTimeout(resolve,25);notify=()=>{clearTimeout(timer);resolve();};});}if(failure)throw failure;};
  const send=m=>child.stdin.write(JSON.stringify(m)+'\n');
  try{send({type:'control',command:'start'});while(blocks*BLOCK<frames&&!closed){const now=blocks*BLOCK/FS;while(index<events.length&&events[index].receipt<=now+1e-10){const e=events[index++],m=structuredClone(e.message);if(m.type==='listener')m.receiptAgeMs=(now-e.observation)*1000;send(m);}const target=blocks+1;send({type:'credit',blocks:1});await wait(()=>blocks>=target||closed);}if(!closed)send({type:'control',command:'stop'});await wait(()=>closed);assert.equal(pending.length,0,'complete accepted PCM frames');assert.ok(final,'producer retained actual terminal evidence');}
  catch(e){failure=e;}
  finally{if(!closed){child.stdin.end();child.kill();await wait(()=>closed).catch(()=>{});}}
  const pcm=Buffer.concat(chunks);fs.writeFileSync(path.join(destination,'pre-host.f32le'),pcm,{flag:'wx'});writeNew(path.join(destination,'producer.jsonl'),stderr);writeSpatialWav(path.join(destination,'comparison.wav'),pcm);
  const metrics=spatialPcmMetrics(pcm,traces,final);metrics.motionResponse=motionResponse(name,metrics,traces);
  const validation=[];if(exitCode!==0||final?.error)validation.push('normal-terminal');if(metrics.frames!==frames)validation.push('complete-authored-duration');if(metrics.nonfiniteSamples||metrics.overCeilingSamples||final?.outputTrim?.rejectedBlocks||final?.dsp?.limited)validation.push('finite-guarded-unclipped');if(final?.dsp?.missingHistory||final?.historyDiagnostics?.affectedFrames||final?.dsp?.cursorResets)validation.push('source-history-continuity');if(final?.simulation?.resets!==(name==='discontinuity'||name==='full-session'?2:1))validation.push('only-declared-context-resets');if(!(metrics.rms>1e-5))validation.push('nonzero-actual-audio');
  if(metrics.motionResponse&&(metrics.motionResponse.pcm.samples<100||metrics.motionResponse.controls.samples<30||metrics.pitchZeroCrossing.samples<500))validation.push('identifiable-actual-motion-pcm');
  let tailPeak=0;for(let at=Math.max(0,pcm.length-20*4096);at<pcm.length;at+=4)tailPeak=Math.max(tailPeak,Math.abs(pcm.readFloatLE(at)));if(tailPeak>1e-7)validation.push('explicit-emission-stop-settled');
  if(['geometry-expiry','close-reflection-transition','full-session'].includes(name)&&(!traces.some(t=>t.pathPresentation.some(p=>p.order>0))||!traces.some(t=>t.geometry?.geometryMode==='expired')))validation.push('genuine-reflections-and-expiry');
  metrics.terminalTailPeak=tailPeak;const report={schemaVersion:1,name,sourceRoot,exitCode,driverFailure:failure?.message??null,pcmSHA256:hash(pcm),profileUnchanged:true,endpointOpened:false,clock:'exact512-frame credit timeline; original observations and jittered receipt times retained',validation:{passed:validation.length===0,failedPredicates:validation},metrics,final};
  writeNew(path.join(destination,'analysis.json'),report);if(failure)throw failure;return report;
}
export async function runSpatialProof({output,baselineRoot,sourceRoot=root,cases=spatialCases}){
  sourceRoot=path.resolve(sourceRoot);baselineRoot=baselineRoot?path.resolve(baselineRoot):null;
  const local=path.resolve(root,'.local')+path.sep;if(!path.resolve(output).startsWith(local))throw Error('Private repository .local evidence required');
  fs.mkdirSync(output,{recursive:false});const report={schemaVersion:1,baselineCommit:'247e7ff2af8f1670ba454ae303ba56cb4f16fb19',gameLaunched:false,audioEndpointOpened:false,independentNormalization:false,results:[],limitations:['Device-free PCM proves no subjective audibility or speaker-to-ear latency.','Native host pacing and owned recorder evidence are separate from the deterministic trajectory replay.']};
  try{for(const name of cases){let baseline=null;if(baselineRoot)baseline=await runSpatialCase(baselineRoot,name,path.join(output,'original',name));const corrected=await runSpatialCase(sourceRoot,name,path.join(output,'corrected',name));report.results.push({name,baseline,corrected});writeNew(path.join(output,name+'-comparison.json'),{name,original:baseline?.metrics??null,corrected:corrected.metrics});}report.motionAcceptance=motionAcceptance(report.results);writeNew(path.join(output,'result.json'),report);writeNew(path.join(output,'listen.html'),'<!doctype html><meta charset="utf-8"><title>RichAudio original and corrected PCM</title><h1>Unnormalised original and corrected owned PCM</h1><p>Actual guarded producer output with the same fixed0.20 host gain. Original failures retain only their valid prefix. No audio plays automatically.</p>'+['slow-rotation','rapid-rotation','close-pass'].filter(name=>cases.includes(name)).map(name=>'<h2>'+name+'</h2>'+['original','corrected'].filter(side=>side!=='original'||baselineRoot).map(side=>'<p>'+side+'</p><audio controls preload="none" src="'+side+'/'+name+'/comparison.wav"></audio>').join('')).join(''));const failures=report.results.filter(r=>!r.corrected.validation.passed);if(failures.length)throw Error('Actual producer trajectory failures: '+failures.map(r=>r.name+':'+r.corrected.validation.failedPredicates.join('|')).join(', '));if(!report.motionAcceptance.passed)throw Error('Actual PCM motion criteria failed; original metrics and WAVs retained');return report;}
  catch(error){writeNew(path.join(output,'proof-failure.json'),{error:error.stack,results:report.results,gameLaunched:false,audioEndpointOpened:false});throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [output,baselineRoot,...cases]=process.argv.slice(2);if(!output)throw Error('Private output path required');runSpatialProof({output:path.resolve(output),baselineRoot:baselineRoot||null,cases:cases.length?cases:spatialCases}).then(report=>console.log(JSON.stringify({output,cases:report.results.map(r=>({name:r.name,oldExit:r.baseline?.exitCode,newExit:r.corrected.exitCode,oldPeak:r.baseline?.metrics.peak,newPeak:r.corrected.metrics.peak,newError:r.corrected.final?.error}))},null,2))).catch(error=>{console.error(error);process.exitCode=1;});
}
