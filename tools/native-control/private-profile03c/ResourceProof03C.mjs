// Conservative evidence admission only. Original full-word detector stays unchanged.
// No game, audio endpoint, capture, assignment, network or machine-learning API.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {recipe,decodeWav,inspectWav} from '../private-profile/ResourceMarker.mjs';

export const fragmentParameters=Object.freeze({
 schema:'RichAudioPrivate03CFragmentReview01',
 sampleRate:48000,hopSamples:480,windowSamples:1920,symbolSpacingHops:8,
 minimumConsecutiveSymbols:12,minimumToneTransitions:3,
 minimumPower:.00000225,minimumToneRatio:4,minimumToneCoherence:.55,
 frequenciesHz:Object.freeze([660,880]),code:recipe.code,
 pitchFitting:false,timingFitting:false,wordDistanceRelaxation:false,
 policy:'A matching fragment triggers INCONCLUSIVE review only. It is never a new positive marker identity or an authenticated control isolation failure.',
});

export function reviewFragments(bytes){
 let wav;try{wav=decodeWav(bytes);}catch(error){return {state:'unavailable',reason:error.message};}
 const p=fragmentParameters,size=p.windowSamples,hop=p.hopSamples;
 const window=Float64Array.from({length:size},(_,n)=>.5-.5*Math.cos(2*Math.PI*n/(size-1))),sum=window.reduce((a,b)=>a+b,0);
 const basis=p.frequenciesHz.map(f=>({cos:window.map((w,n)=>w*Math.cos(2*Math.PI*f*n/wav.sampleRate)),sin:window.map((w,n)=>w*Math.sin(2*Math.PI*f*n/wav.sampleRate))}));
 const subsequences=[];
 for(let offset=0;offset+p.minimumConsecutiveSymbols<=p.code.length;offset++){
  const word=p.code.slice(offset,offset+p.minimumConsecutiveSymbols);let transitions=0;
  for(let n=1;n<word.length;n++)if(word[n]!==word[n-1])transitions++;
  if(transitions>=p.minimumToneTransitions)subsequences.push({offset,word,transitions});
 }
 const matches=[];
 for(let channel=0;channel<wav.channels.length;channel++){
  const samples=wav.channels[channel],features=[];
  for(let start=0;start+size<=samples.length;start+=hop){
   let power=0;const re=[0,0],im=[0,0];
   for(let n=0;n<size;n++){
    const x=samples[start+n];power+=x*x*window[n];
    for(let f=0;f<2;f++){re[f]+=x*basis[f].cos[n];im[f]+=x*basis[f].sin[n];}
   }
   power/=sum;const energy=re.map((v,f)=>2*(v*v+im[f]*im[f])/(sum*sum));
   features.push(energy.map((value,f)=>power>=p.minimumPower&&value/Math.max(energy[1-f],1e-12)>=p.minimumToneRatio&&value/Math.max(power,1e-12)>=p.minimumToneCoherence));
  }
  for(let start=0;start+(p.minimumConsecutiveSymbols-1)*p.symbolSpacingHops<features.length;start++){
   for(const sequence of subsequences){
    let complete=true;for(let k=0;k<sequence.word.length;k++)if(!features[start+k*p.symbolSpacingHops][Number(sequence.word[k])]){complete=false;break;}
    if(complete){matches.push({channel,seconds:start*hop/wav.sampleRate,codeOffset:sequence.offset,symbols:sequence.word.length,transitions:sequence.transitions});if(matches.length>=32)return {state:'review-required',parameters:p,matches,matchLimitReached:true};}
   }
  }
 }
 return {state:matches.length?'review-required':'no-qualified-fragment-in-supplied-window',parameters:p,matches,
  limits:'Fixed-frequency, fixed-time fragment review over this supplied PCM only. Shorter, shifted, quiet, masked or distorted contamination can remain undetected. This is not proof that a recording contains no marker material.'};
}

export function inspectEvidence(bytes){
 const original=inspectWav(bytes);
 if(original.state!=='absent-in-supplied-window')return {...original,fragmentReview:{state:'not-needed',reason:'Original full-marker/quality verdict governs'}};
 const fragmentReview=reviewFragments(bytes);
 return fragmentReview.state==='review-required'
  ? {...original,state:'inconclusive',originalState:original.state,reason:'A coherent marker-like temporal fragment prevents negative baseline/control admission',fragmentReview}
  : {...original,fragmentReview};
}

export function baselines(a,b){
 const captures={baselineA:inspectEvidence(a),baselineB:inspectEvidence(b)},values=Object.values(captures);
 const verdict=values.some(x=>x.state==='present')?'FAIL':values.every(x=>x.state==='absent-in-supplied-window')?'PASS':'INCONCLUSIVE';
 return {schema:'RichAudioPrivate03CBaselineReview',verdict,captures,
  scope:'Conditional signal admission after full-word and conservative fragment checks only. PASS still requires independent video/horn activation, exact A/B identity, complete event capture and absence of known contamination. No operation or manual attestation is automated.'};
}

export function contribution(a,b,target,control){
 const baseline=baselines(a,b),targetCapture=inspectWav(target),controlCapture=inspectEvidence(control);
 let verdict='INCONCLUSIVE',reason='Usable full-word target and admissible baseline/control evidence required';
 if(baseline.verdict==='FAIL'||controlCapture.state==='present'){verdict='FAIL';reason='Complete marker in baseline/control prevents isolated target signal attribution; provenance still distinguishes actual control origin from contamination';}
 else if(baseline.verdict==='PASS'&&targetCapture.state==='present'&&controlCapture.state==='absent-in-supplied-window'){verdict='PASS';reason='Full original 31-symbol marker in target with no complete marker or qualified fragment in supplied baseline/control windows';}
 return {schema:'RichAudioPrivate03CConditionalSignalProof',verdict,reason,baseline,target:targetCapture,control:controlCapture,
  scope:'Conditional evidence for one functional authored private horn contribution, not complete profile identity, whole native ownership, engine/exhaust suppression, independent recovery or production compatibility.',
  experimentVerdict:'Independent package/native-dispatch/A/B lifetime/video-horn-origin/behavior/capture-continuity review remains mandatory. A fragment alone is INCONCLUSIVE, never an authenticated isolation FAIL. Known contamination cannot be overruled by PASS.'};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,...names]=process.argv.slice(2);let result;
 if(mode==='baselines'&&names.length===2)result=baselines(...names.map(n=>fs.readFileSync(n)));
 else if(mode==='contribution'&&names.length===4)result=contribution(...names.map(n=>fs.readFileSync(n)));
 else throw new Error('baselines <baselineA.wav> <baselineB.wav> | contribution <baselineA.wav> <baselineB.wav> <targetA.wav> <controlB.wav>');
 console.log(JSON.stringify(result,null,2));
}
