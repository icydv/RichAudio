// Frozen conservative fragment-admission regression; no endpoint/game/capture access.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {recipe,sha256,decodeWav,encodeWav,inspectWav} from '../tools/native-control/private-profile/ResourceMarker.mjs';
import {fragmentParameters,inspectEvidence,baselines,contribution} from '../tools/native-control/private-profile03c/ResourceProof03C.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'.local/gate-a-shvdne-private-03c/marker');
const implementation=path.join(root,'tools/native-control/private-profile03c/ResourceProof03C.mjs'),original=path.join(root,'.local/gate-a-shvdne-private-01/resource/original-marker/marker.wav'),oldDetector=path.join(root,'tools/native-control/private-profile/ResourceMarker.mjs');
const pin=p=>({path:p,bytes:fs.statSync(p).size,sha256:sha256(fs.readFileSync(p))});
const fresh=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const sampleRate=48000,frames=sampleRate*4;
const cases=[
 ...[3,5,8,11,14,17].map((start,n)=>({id:'heldout-fragment-'+start,start,symbols:[12,14,13,15,12,14][n],gain:[.13,.23,.41,.67,.83,1][n],kind:'fragment'})),
 {id:'heldout-fragment-stereo',start:4,symbols:15,gain:.43,stereo:true,kind:'fragment'},
 ...[290,440,550,660,880,1320].map(frequency=>({id:'heldout-tone-'+frequency,kind:'negative',frequency})),
 {id:'heldout-synthetic-engine',kind:'negative',engine:true},
 {id:'heldout-pinkish-noise',kind:'negative',noise:true,seed:0x3c123456},
 ...Array.from({length:16},(_,n)=>({id:'heldout-unrelated-word-'+n,kind:'unrelated-word',seed:0x3c012a+n*7919})),
 ...[.07,.19,.37,.63].map(gain=>({id:'heldout-target-gain-'+gain,kind:'positive',gain})),
];
const [command]=process.argv.slice(2);
if(command==='freeze'){
 const f={schema:'RichAudioPrivate03CFragmentFreeze',utc:new Date().toISOString(),frozenBeforeDisjointEvaluation:true,implementation:pin(implementation),runner:pin(fileURLToPath(import.meta.url)),original:pin(original),oldDetector:pin(oldDetector),parameters:fragmentParameters,
  policy:'Twelve consecutive same-threshold temporal symbols, at least three tone transitions, cause review only. Full positive detection is unchanged. Marker-like random words may cause conservative ambiguity; report the burden, never retune after held-out evaluation.',cases,developmentDemonstration:'Original90-case qualification exposed first/last half and30-symbol contamination. Those cases are development regressions, not held-out qualification.'};fresh('fragment-freeze.json',f);console.log(JSON.stringify(pin(path.join(out,'fragment-freeze.json')),null,2));
}else if(command==='evaluate'){
 const frozen=JSON.parse(fs.readFileSync(path.join(out,'fragment-freeze.json'),'utf8'));
 for(const x of [frozen.implementation,frozen.runner,frozen.original,frozen.oldDetector])assert.equal(pin(x.path).sha256,x.sha256);
 const pcm=decodeWav(fs.readFileSync(original)).channels[0];const pad=(gain=1)=>{const a=new Float64Array(frames);for(let n=0;n<pcm.length;n++)a[Math.round(.293*sampleRate)+n]=pcm[n]*gain;return a;};
 const tone=f=>Float64Array.from({length:frames},(_,n)=>.07*Math.sin(2*Math.PI*f*n/sampleRate));
 const full=encodeWav(pad()),plain=encodeWav(tone(290));
 const rand=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const synthWord=word=>{const a=new Float64Array(frames),lead=Math.round(.453*sampleRate);for(let k=0;k<31;k++)for(let n=0;n<2880;n++){const edge=Math.min(1,n/288,(2879-n)/288);a[lead+k*3840+n]=.07*(1-Math.cos(Math.PI*edge))/2*Math.sin(2*Math.PI*recipe.frequenciesHz[Number(word[k])]*n/sampleRate);}return a;};
 const records=[];
 for(const entry of frozen.cases){let a;
  if(entry.kind==='fragment'){a=pad(entry.gain);const start=Math.round((.293+.16+entry.start*.08)*sampleRate),stop=start+entry.symbols*3840;a.fill(0,0,start);a.fill(0,stop);}
  else if(entry.kind==='positive')a=pad(entry.gain);
  else if(entry.frequency)a=tone(entry.frequency);
  else if(entry.engine)a=Float64Array.from({length:frames},(_,n)=>{const t=n/sampleRate;return .03*Math.sin(2*Math.PI*95*t)+.02*Math.sin(2*Math.PI*190*t)+.01*Math.sin(2*Math.PI*380*t);});
  else if(entry.noise){const random=rand(entry.seed);let last=0;a=Float64Array.from({length:frames},()=>last=.8*last+(random()-.5)*.035);}
  else {const random=rand(entry.seed);a=synthWord(Array.from({length:31},()=>random()<.5?'0':'1').join(''));}
  const bytes=entry.stereo?encodeWav([tone(290),a]):encodeWav(a),signal=inspectEvidence(bytes),baseline=baselines(plain,bytes),proof=contribution(plain,plain,full,bytes);
  if(entry.kind==='fragment'){assert.equal(signal.state,'inconclusive',entry.id);assert.equal(baseline.verdict,'INCONCLUSIVE',entry.id);assert.equal(proof.verdict,'INCONCLUSIVE',entry.id);}
  if(entry.kind==='positive'){assert.equal(inspectWav(bytes).state,'present');assert.equal(signal.state,'present');assert.equal(proof.verdict,'FAIL');}
  if(entry.kind==='negative'){assert.equal(signal.state,'absent-in-supplied-window',entry.id);assert.equal(baseline.verdict,'PASS');}
  if(entry.kind==='unrelated-word')assert.notEqual(signal.state,'present',entry.id);
  records.push({...entry,wavSha256:sha256(bytes),signal,baselineVerdict:baseline.verdict,controlContributionVerdict:proof.verdict});
 }
 const development=JSON.parse(fs.readFileSync(path.join(out,'qualification.json'),'utf8')),regressions=[];
 for(const x of development.attribution){const id=x.id.replace(/^(control|baselineB)-/,''),bytes=fs.readFileSync(path.join(out,'fixtures',id+'.wav'));const result=x.id.startsWith('control-')?contribution(plain,plain,full,bytes):contribution(plain,bytes,full,plain);assert.notEqual(result.verdict,'PASS');regressions.push({id:x.id,oldVerdict:x.contribution.verdict,newVerdict:result.verdict});}
 const falseFragmentReviewBurden=records.filter(x=>x.kind==='unrelated-word'&&x.signal.state==='inconclusive').map(x=>x.id);
 const positiveMisses=records.filter(x=>x.kind==='positive'&&x.signal.state!=='present').map(x=>x.id),negativeFalseMarkerPositives=records.filter(x=>['negative','unrelated-word'].includes(x.kind)&&x.signal.state==='present').map(x=>x.id);
 assert.equal(contribution(plain,plain,full,plain).verdict,'PASS');
 const result={schema:'RichAudioPrivate03CFragmentQualification',passed:true,freeze:pin(path.join(out,'fragment-freeze.json')),heldoutCases:records.length,developmentRegressions:regressions.length,positiveMisses,negativeFalseMarkerPositives,falseFragmentReviewBurden,records,regressions,originalDetectorUnchanged:true,thresholdsRetuned:false,scope:'Authored offline signals only. Fragment flag is conservative ambiguity, not a marker-positive or isolation-failure verdict. Known partial contamination below these fixed thresholds remains an external provenance/admission responsibility.'};fresh('fragment-qualification.json',result);console.log(JSON.stringify({passed:true,heldoutCases:records.length,developmentRegressions:regressions.length,positiveMisses,negativeFalseMarkerPositives,falseFragmentReviewBurden},null,2));
}else throw new Error('freeze | evaluate');
