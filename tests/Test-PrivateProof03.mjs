import assert from 'node:assert/strict';
import {baselines,contribution} from '../tools/native-control/private-profile03/ResourceProof03.mjs';
import {synthesize,encodeWav} from '../tools/native-control/private-profile/ResourceMarker.mjs';
const plain=encodeWav(Float64Array.from({length:48000*4},(_,n)=>.08*Math.sin(2*Math.PI*350*n/48000)));
const pad=new Float64Array(48000*4);pad.set(synthesize(),12000);const marker=encodeWav(pad);
const silence=encodeWav(new Float64Array(48000*4));let cases=0;
function check(name,run){run();cases++;console.log('PASS '+name);}
check('both separate baselines required',()=>assert.equal(baselines(plain,silence).verdict,'INCONCLUSIVE'));
check('marker in B baseline blocks entry',()=>assert.equal(baselines(plain,marker).verdict,'FAIL'));
check('two usable negative baselines permit manual review',()=>assert.equal(baselines(plain,plain).verdict,'PASS'));
check('complete target-only marker supports conditional contribution',()=>assert.equal(contribution(plain,plain,marker,plain).verdict,'PASS'));
check('control marker rejects isolated attribution',()=>assert.equal(contribution(plain,plain,marker,marker).verdict,'FAIL'));
check('missing target remains inconclusive',()=>assert.equal(contribution(plain,plain,plain,plain).verdict,'INCONCLUSIVE'));
check('bad B baseline cannot be hidden by old three-window detector',()=>assert.equal(contribution(plain,silence,marker,plain).verdict,'INCONCLUSIVE'));
check('proof explicitly excludes complete ownership',()=>assert.match(contribution(plain,plain,marker,plain).scope,/not full record registration or complete profile ownership/));
console.log('PASS PRIVATE03 cases='+cases+'; authored in-memory WAVs; no endpoint or native execution');
