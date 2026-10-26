// Diagnostic-only bounded reconstruction contract. Never schedules events or renders files.
import {createHash} from 'node:crypto';
import {decodeWav,sample} from '../../src/offline-audio/stock-source.mjs';
const sources=new WeakMap(),RATE=48000;
const digest=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
export const supportContract=Object.freeze({id:'scheduled-interval-bounded-support-v1',
  selection:'Unchanged 2% scheduled-interval state tolerance, both rounded-period rates and actual read rate 0.95–1.05, source margins and event clock',
  support:'All 24 loads must preserve authenticated original-stream identity and unit-stride absolute source mapping, within known contiguous provenance and bounds. Metadata markers do not independently schedule filter taps.',
  ownership:'Not evaluated or changed',transition:'Not evaluated or changed; a separate continuation read head is not authorised merely as interpolation support',
  scope:'Opt-in interpretation for the existing linear FIR sampler, not native Rockstar scheduling or a trajectory pass'});
export function bindPcmSource(wavBytes,expected){
  if(!expected||typeof expected.streamId!=='string'||!expected.streamId||digest(wavBytes)!==expected.wavSha256)throw Error('source identity/fingerprint');
  const audio=decodeWav(wavBytes);if(audio.rate!==RATE||audio.channels!==1||audio.data.length>RATE*30)throw Error('48k mono bounded source required');
  let payload;for(let p=12;p<wavBytes.length;){const n=wavBytes.readUInt32LE(p+4);if(wavBytes.toString('ascii',p,p+4)==='data')payload=wavBytes.subarray(p+8,p+8+n);p+=8+n+n%2;}
  if(!payload||digest(payload)!==expected.pcmSha256)throw Error('original PCM payload fingerprint');
  const spans=expected.spans??[];if(!Array.isArray(spans)||spans.length>32)throw Error('provenance span bound');
  for(let i=0;i<spans.length;i++){const s=spans[i];if(!Number.isSafeInteger(s.start)||!Number.isSafeInteger(s.end)||!Number.isSafeInteger(s.originalStart)||!Number.isSafeInteger(s.originalStart+s.end-s.start)||s.start<0||s.end<=s.start||s.end>audio.data.length||s.originalStart<0||typeof s.asset!=='string'||!s.asset||i&&s.start<spans[i-1].end)throw Error('invalid provenance spans');}
  const source=Object.freeze({sourceKey:expected.wavSha256,pcmSha256:expected.pcmSha256,streamId:expected.streamId,frames:audio.data.length,rate:RATE,channels:1});
  sources.set(source,{audio,spans:spans.map(s=>Object.freeze({...s}))});return source;
}
export function kernelWeights(position,rate){
  if(!Number.isFinite(position)||position<0||!Number.isSafeInteger(Math.floor(position))||!Number.isFinite(rate)||rate<.95||rate>1.05)throw Error('kernel query outside existing rate limits');
  const base=Math.floor(position),phase=Math.min(127,Math.floor((position-base)*128)),data=new Float64Array(64),weights=[];
  // The unchanged sampler is linear and its table depends only on phase/rate.
  // Original unit impulses recover its coefficients; this is not another kernel.
  for(let k=0;k<24;k++){if(k)data[20+k]=0;data[21+k]=1;weights.push(sample({rate:RATE,channels:1,data},32+phase/128,0,rate));}
  return {base,phase,rateBucket:Math.round(rate*128),indices:weights.map((_,k)=>base-11+k),weights};
}
function mapping(spans,n){const s=spans.find(s=>s.start<=n&&n<s.end);return s?{asset:s.asset,originalIndex:s.originalStart+n-s.start}:null;}
function continuousRange(spans,start,end,anchor){
  if(!anchor)return false;let n=start;while(n<end){const s=spans.find(s=>s.start<=n&&n<s.end);if(!s||s.asset!==anchor.asset||s.originalStart+n-s.start!==anchor.originalIndex+n-anchor.decodedIndex)return false;n=Math.min(end,s.end);}return true;
}
export function assessScheduled(source,catalogue,event){
  if(!sources.has(source))throw Error('unverified source object');const reasons=[],row=catalogue.rows.find(r=>r.index===event.interval);
  if(event.sourceKey!==source.sourceKey||catalogue.sourceFrames!==source.frames)reasons.push('source_identity');
  if(!row)return {passed:false,reasons:['missing_interval']};
  if(!Number.isSafeInteger(row.start)||!Number.isSafeInteger(row.end)||row.start<0||row.end<=row.start||row.end>source.frames||row.frames!==row.end-row.start||!Number.isFinite(row.state)||row.state<14||row.state>28)reasons.push('invalid_interval_metadata');
  const values=event.stateRange;if(!Array.isArray(values)||values.length!==2||values.some(v=>!Number.isFinite(v))||values[0]>values[1]||values[0]<21||values[1]>27)reasons.push('unsupported_state_range');
  if(!Number.isSafeInteger(event.start)||!Number.isSafeInteger(event.end)||event.start<0||event.end<=event.start||!Number.isFinite(event.clockStart)||!Number.isFinite(event.clockEnd)||!Number.isFinite(event.requestedState)||event.requestedState<=0||Math.round(event.clockStart)!==event.start||Math.round(event.clockEnd)!==event.end||!Object.is(event.clockEnd,event.clockStart+RATE/event.requestedState))reasons.push('event_clock');
  if(event.sourceStart!==row.start||event.sourceEnd!==row.end)reasons.push('source_cursor_or_selection');
  if(!Number.isFinite(event.rate)||event.rate<.95||event.rate>1.05||!Object.is(event.rate,row.frames/(event.end-event.start)))reasons.push('actual_read_rate');
  let stateError=null,periodRates=null;
  if(!reasons.includes('unsupported_state_range')){if(event.requestedState<values[0]||event.requestedState>values[1])reasons.push('requested_state_outside_declared_range');stateError=Math.max(Math.abs(row.state-values[0])/values[0],Math.abs(row.state-values[1])/values[1]);periodRates=[row.frames/Math.floor(RATE/values[1]),row.frames/Math.ceil(RATE/values[0])];if(!Number.isFinite(stateError)||stateError>.02)reasons.push('scheduled_state_tolerance');if(periodRates.some(r=>r<.95||r>1.05))reasons.push('rounded_period_rates');if(!row.band||values[0]<row.band.lo||values[1]>row.band.hi)reasons.push('conservative_eligibility_band');}
  if(row.start<16||row.end+96*1.05+16>=source.frames)reasons.push('existing_source_margins');
  const state=sources.get(source),origin=mapping(state.spans,row.start),anchor=origin?{...origin,decodedIndex:row.start}:null;
  if(!continuousRange(state.spans,row.start,row.end,anchor)||anchor?.asset!==source.streamId)reasons.push('scheduled_original_mapping');
  return {passed:!reasons.length,reasons,interval:row.index,stateError,periodRates,anchor};
}
export function inspectBoundarySupport(source,catalogue,event,queries){
  if(!Array.isArray(queries)||!queries.length||queries.length>16)throw Error('bounded diagnostic queries required');
  const selection=assessScheduled(source,catalogue,event),state=sources.get(source),points=[];
  for(const q of queries){
    if(!Number.isSafeInteger(q.frame)||q.frame<event.start||q.frame>=event.end||!Number.isFinite(q.position)||!Number.isFinite(q.gain)||q.gain<0||q.gain>1||!Number.isFinite(q.mixWeight)||q.mixWeight<0||q.mixWeight>1||typeof q.retained!=='boolean'||!Number.isSafeInteger(q.fadeFrames)||q.fadeFrames<1||!Number.isSafeInteger(q.presentationStart)||!Number.isSafeInteger(q.presentationEnd)||q.presentationStart<0||q.presentationStart>q.frame||q.presentationEnd<=q.frame)throw Error('invalid diagnostic query');
    const reasons=[...selection.reasons],expected=event.sourceStart+(q.frame-event.start)*event.rate;
    if(!Object.is(q.position,expected))reasons.push('changed_cursor');
    if(q.kind!=='target')reasons.push('separate_read_head_requires_authorisation');
    if(!selection.passed||!Number.isFinite(event.rate)||event.rate<.95||event.rate>1.05){points.push({frame:q.frame,passed:false,reasons});continue;}
    const kernel=kernelWeights(q.position,event.rate),first=kernel.indices[0],last=kernel.indices.at(-1);
    if(first<0||last>=source.frames)reasons.push('out_of_bounds_or_modulo_wrap');
    if(!continuousRange(state.spans,first,last+1,selection.anchor))reasons.push('unknown_or_discontinuous_reconstruction_support');
    if(reasons.length){points.push({frame:q.frame,passed:false,reasons,kernel});continue;}
    const fade=Math.min(1,(q.frame-q.presentationStart)/q.fadeFrames,(q.presentationEnd-1-q.frame)/q.fadeFrames),finalGain=q.retained?q.gain*q.mixWeight*fade:0;
    const taps=kernel.indices.map((index,k)=>{const origin=mapping(state.spans,index),value=state.audio.data[index],coefficient=kernel.weights[k],provider=catalogue.rows.find(r=>r.start<=index&&index<r.end);
      return {index,originalIndex:origin.originalIndex,originalAsset:origin.asset,providerInterval:provider?.index??null,role:index<event.sourceStart||index>=event.sourceEnd?'reconstruction_only':'inside_scheduled_interval',coefficient,pcmValue:value,term:value*coefficient,effectiveCoefficient:coefficient*finalGain,finalTerm:value*coefficient*finalGain};});
    const reconstructed=taps.reduce((s,t)=>s+t.term,0),existing=sample(state.audio,q.position,0,event.rate),agreement=Math.abs(reconstructed-existing);
    if(agreement>16*Number.EPSILON*Math.max(1,Math.abs(existing)))throw Error('diagnostic coefficient accounting differs from original sampler');
    points.push({frame:q.frame,passed:true,reasons:[],position:q.position,rate:event.rate,kernel,fade,finalGain,retained:q.retained,memoryReads:24,numericallyNonzeroWeights:taps.filter(t=>t.coefficient!==0).length,nonzeroActualTerms:taps.filter(t=>t.term!==0).length,finalNonzeroWeights:taps.filter(t=>t.effectiveCoefficient!==0).length,finalNonzeroTerms:taps.filter(t=>t.finalTerm!==0).length,taps,reconstructed,existingSamplerAgreement:agreement,finalValue:reconstructed*finalGain});
  }
  return {contract:supportContract,selection,points,passed:selection.passed&&points.every(p=>p.passed),ownership:'NOT EVALUATED',transition:'NOT EVALUATED',productionOrPlannerIntegration:false};
}
