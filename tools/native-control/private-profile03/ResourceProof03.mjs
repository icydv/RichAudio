import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectWav, identify} from '../private-profile/ResourceMarker.mjs';

export function baselines(a,b){
 const captures={baselineA:inspectWav(a),baselineB:inspectWav(b)};
 const values=Object.values(captures);
 const verdict=values.some(x=>x.state==='present')?'FAIL':values.every(x=>x.state==='absent-in-supplied-window')?'PASS':'INCONCLUSIVE';
 return {schema:'RichAudioPrivate03BaselineReview',verdict,captures,
  scope:'Both supplied baseline windows only. PASS permits manual attestation only after vehicle/event/capture provenance review; no automated game input or assignment.'};
}
export function contribution(a,b,target,control){
 const baseline=baselines(a,b),result=identify(a,target,control);
 const verdict=baseline.verdict==='FAIL'?'FAIL':baseline.verdict!=='PASS'?'INCONCLUSIVE':result.verdict;
 return {schema:'RichAudioPrivate03ConditionalSignalProof',verdict,baseline,result,
  scope:'Conditional signal evidence for one functional authored horn contribution, not full record registration or complete profile ownership.',
  experimentVerdict:'Requires independent exact-package, single-target native dispatch, A/B lifetime, horn-origin/video, normal-behaviour and capture-continuity review. External contamination/uncertain provenance remains INCONCLUSIVE; verified marker in untouched B is an isolation FAIL.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,...names]=process.argv.slice(2);let result;
 if(mode==='baselines'&&names.length===2)result=baselines(...names.map(n=>fs.readFileSync(n)));
 else if(mode==='contribution'&&names.length===4)result=contribution(...names.map(n=>fs.readFileSync(n)));
 else throw new Error('baselines <baselineA.wav> <baselineB.wav> | contribution <baselineA.wav> <baselineB.wav> <targetA.wav> <controlB.wav>');
 console.log(JSON.stringify(result,null,2));
}
