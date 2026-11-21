// Original generated sound through the actual worker + RA07 producer; no device.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {replayGeometry,transitionBlocks} from './audio/geometry-replay.mjs';
import {wav} from '../src/acoustics/engine/signals.mjs';
import {privateStoragePath} from '../src/acoustics/research/research-private-storage.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
export async function renderRealtimeGeometry(destination='.local/realtime-geometry'){
  const out=privateStoragePath(root,path.resolve(root,destination));
  if(fs.existsSync(out))throw Error('fresh private demonstration directory required');
  fs.mkdirSync(out,{recursive:true});
  const results=[];
  for(const mode of ['observed','direct-reference','fixed-scene']){
    const r=await replayGeometry({mode});
    fs.writeFileSync(path.join(out,mode+'.wav'),wav([r.left,r.right]),{flag:'wx'});
    fs.writeFileSync(path.join(out,mode+'-trace.json'),JSON.stringify(r.traces,null,2),{flag:'wx'});
    results.push({mode,metrics:r.metrics,final:r.final});
  }
  const report={schemaVersion:1,source:'original generated harmonic beacon; not GTA stock audio',
    geometry:'controlled synthetic live feed, no historical recording promotion',
    scale:'10 model metres per native unit; unverified physical GTA scale',rate:48000,blockFrames:512,
    bridgeAcquisition:'not implemented by current RPH bridge',subjectiveListening:'not performed',
    comparison:'direct-reference is matched; fixed-scene is the existing compatibility reference with its own synthetic positions',
    transitionSeconds:Object.fromEntries(Object.entries(transitionBlocks).map(([k,v])=>[k,v*512/48000])),results};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2),{flag:'wx'});
  fs.writeFileSync(path.join(out,'listen.html'),`<!doctype html><meta charset="utf-8"><title>RichAudio real-time geometry</title><style>body{font:17px system-ui;background:#15202d;color:#f2f6fa;margin:32px}article{margin:28px 0}audio{width:500px;max-width:100%}</style><h1>Real-time geometry through RichAudio</h1><p>Original generated source; declared model scale and authored materials, not calibrated Los Santos acoustics. Manual playback only.</p><p>0.683 s: reflections introduced. 1.195 s: reflector replaced. 1.707 s: invalid input fades paths. 2.048 s: recovery. 3.047 s: lease expires. 3.413 s: reacquisition. Later sections exercise generation/session changes and emission stop.</p>${results.map(r=>`<article><h2>${r.mode}</h2><audio controls src="${r.mode}.wav"></audio><p>${r.metrics.blocks} actual RA07 blocks; peak ${r.metrics.peak.toFixed(6)}.</p></article>`).join('')}`,{flag:'wx'});
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const r=await renderRealtimeGeometry(process.argv[2]);console.log(JSON.stringify(r.results.map(x=>({mode:x.mode,...x.metrics})),null,2));
}
