// Numeric-only, private WAV analysis. No playback, game access or asset export.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {decodeWav} from '../src/offline-audio/stock-source.mjs';
import {privatePath,noLinks} from './audio/private-files.mjs';
import {hash} from './Inspect-Deceleration.mjs';import {analyse} from './Analyse-ResponsiveEngine.mjs';
import {exactWavePeriods,lagComparison} from './audio/wave-recurrence.mjs';
export function analyseRecurrence(directory,outputDirectory){
  const root=privatePath(directory),out=privatePath(outputDirectory);
  const report=analyse(root,out),source=JSON.parse(fs.readFileSync(path.join(root,'analysis.json'),'utf8'));
  const waves={};for(const name of ['engine.wav','exhaust.wav','mix_exhaust_led.wav','mix_reference_gain.wav']){
    const file=path.join(root,name);noLinks(file);const bytes=fs.readFileSync(file);if(hash(bytes)!==source.outputs[name].sha256)throw Error('wave fingerprint');
    const a=decodeWav(bytes);waves[name]={independent:exactWavePeriods(a.data),oldLag:lagComparison(a.data,32000)};
  }
  const s=source.diagnostics.schedule,frequency={},reuse=[];const last=new Map();
  for(let i=0;i<s.length;i++){const id=s[i].index;frequency[id]=(frequency[id]??0)+1;if(last.has(id))reuse.push(s[i].start-s[last.get(id)].start);last.set(id,i);}
  const motifs={};for(const size of [2,3,4,7,14]){const counts=new Map();for(let i=0;i+size<=s.length;i++){const key=s.slice(i,i+size).map(v=>v.index).join(',');counts.set(key,(counts.get(key)??0)+1);}motifs[size]={unique:counts.size,windows:s.length-size+1,maxOccurrences:Math.max(...counts.values())};}
  const result={schemaVersion:1,selection:source.diagnostics.selection,summary:report,waves,frequency,motifs,
    meanReuseFrames:reuse.reduce((a,b)=>a+b,0)/reuse.length,meanReuseSeconds:reuse.reduce((a,b)=>a+b,0)/reuse.length/48000,
    immediateReuse:s.slice(1).filter((r,i)=>r.index===s[i].index).length,
    limitation:'Exact global recurrence searched only from one sample through two seconds, excluding 100 ms edges. Harmonic periodicity and recurring local motifs can remain.'};
  fs.writeFileSync(path.join(out,'recurrence.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==4)throw Error('Usage: node tools/Analyse-CycleRecurrence.mjs PRIVATE_RENDER NEW_PRIVATE_DIAGNOSIS');const r=analyseRecurrence(...process.argv.slice(2));console.log(JSON.stringify({selection:r.selection,waves:r.waves,frequency:r.frequency,motifs:r.motifs}));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
