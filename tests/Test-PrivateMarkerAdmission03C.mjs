// Additional frozen admission/loss sensitivity tests. No device or target process access.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {sha256,decodeWav,encodeWav,inspectWav} from '../tools/native-control/private-profile/ResourceMarker.mjs';
import {inspectEvidence,baselines,contribution} from '../tools/native-control/private-profile03c/ResourceProof03C.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'.local/gate-a-shvdne-private-03c/marker');
const source=fileURLToPath(import.meta.url),wrapper=path.join(root,'tools/native-control/private-profile03c/ResourceProof03C.mjs'),original=path.join(root,'.local/gate-a-shvdne-private-01/resource/original-marker/marker.wav');
const pin=p=>({path:p,bytes:fs.statSync(p).size,sha256:sha256(fs.readFileSync(p))}),fresh=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const policy={noiseSnrDb:[20,10,0,-10],noiseSeed:0x3c89a11,checks:['partial-target-not-promoted','baseline-A-fragment-blocked','stereo-control-fragment-blocked','shorter-than-review-span-disclosed','quiet-control-inconclusive','clipped-control-inconclusive','invalid-control-inconclusive','full-negative-and-target-control-contract'],thresholdChanges:false};
const [command]=process.argv.slice(2);
if(command==='freeze'){fresh('admission-freeze.json',{schema:'RichAudioPrivate03CAdmissionFreeze',frozenBeforeEvaluation:true,utc:new Date().toISOString(),runner:pin(source),wrapper:pin(wrapper),original:pin(original),policy});console.log(JSON.stringify(pin(path.join(out,'admission-freeze.json')),null,2));}
else if(command==='evaluate'){
 const frozen=JSON.parse(fs.readFileSync(path.join(out,'admission-freeze.json'),'utf8'));for(const x of [frozen.runner,frozen.wrapper,frozen.original])assert.equal(pin(x.path).sha256,x.sha256);
 const pcm=decodeWav(fs.readFileSync(original)).channels[0],rate=48000,frames=rate*4;
 const pad=(gain=1)=>{const a=new Float64Array(frames);for(let n=0;n<pcm.length;n++)a[12000+n]=pcm[n]*gain;return a;},tone=Float64Array.from({length:frames},(_,n)=>.06*Math.sin(2*Math.PI*310*n/rate)),plain=encodeWav(tone),full=encodeWav(pad());
 const fragment=pad();fragment.fill(0,Math.round((.25+.16+15*.08)*rate));const partial=encodeWav(fragment);let cases=0;
 const check=(name,body)=>{body();cases++;};
 check('partial-target-not-promoted',()=>assert.equal(contribution(plain,plain,partial,plain).verdict,'INCONCLUSIVE'));
 check('baseline-A-fragment-blocked',()=>assert.equal(baselines(partial,plain).verdict,'INCONCLUSIVE'));
 check('stereo-control-fragment-blocked',()=>assert.equal(contribution(plain,plain,full,encodeWav([tone,fragment])).verdict,'INCONCLUSIVE'));
 const shortFragment=pad();shortFragment.fill(0,Math.round((.25+.16+8*.08)*rate));const shortResult=inspectEvidence(encodeWav(shortFragment));
 check('shorter-than-review-span-disclosed',()=>{assert.equal(shortResult.state,'absent-in-supplied-window');assert.match(shortResult.fragmentReview.limits,/Shorter, shifted, quiet, masked or distorted/);});
 check('quiet-control-inconclusive',()=>assert.equal(contribution(plain,plain,full,encodeWav(pad(.01))).verdict,'INCONCLUSIVE'));
 const clipped=pad();clipped[0]=1;
 check('clipped-control-inconclusive',()=>assert.equal(contribution(plain,plain,full,encodeWav(clipped)).verdict,'INCONCLUSIVE'));
 check('invalid-control-inconclusive',()=>assert.equal(contribution(plain,plain,full,full.subarray(0,full.length-1)).verdict,'INCONCLUSIVE'));
 check('full-negative-and-target-control-contract',()=>{assert.equal(contribution(plain,plain,full,plain).verdict,'PASS');assert.equal(contribution(plain,plain,full,full).verdict,'FAIL');});
 let seed=frozen.policy.noiseSeed;const noise=Float64Array.from({length:frames},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296-.5;});
 const signal=pad(.45),rms=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length),signalRms=rms(signal),noiseRms=rms(noise),sensitivity=[];
 for(const snrDb of frozen.policy.noiseSnrDb){const gain=signalRms/(noiseRms*Math.pow(10,snrDb/20)),mixed=signal.map((v,n)=>v+noise[n]*gain),bytes=encodeWav(mixed);const result=inspectWav(bytes);sensitivity.push({snrDb,signalRms,addedNoiseRms:noiseRms*gain,wavSha256:sha256(bytes),fullMarkerState:result.state,best:result.best,reason:result.reason});cases++;}
 const result={schema:'RichAudioPrivate03CAdmissionQualification',passed:true,freeze:pin(path.join(out,'admission-freeze.json')),cases,checks:frozen.policy.checks,shortFragmentRemainingLimit:{symbols:8,state:shortResult.state,reason:'Below the fixed12-symbol review span; no-complete-word/no-qualified-fragment is not proof of marker-free material. Independent complete-window provenance and known-contamination rejection remain mandatory.'},sensitivity,scope:'Deterministic additive-noise sensitivity only. No thresholds retuned, no SNR guarantee inferred, and no physical/gameplay/recording noise measurement.'};fresh('admission-qualification.json',result);console.log(JSON.stringify({passed:true,cases,sensitivity:sensitivity.map(x=>({snrDb:x.snrDb,fullMarkerState:x.fullMarkerState})),shortFragmentState:shortResult.state},null,2));
}else throw new Error('freeze | evaluate');
