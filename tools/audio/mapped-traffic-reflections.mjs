import assert from 'node:assert/strict';
import path from 'node:path';
import {replayMappedPaths} from './mapped-drive-render.mjs';
import {writeStereoWave} from './powertrain-drive.mjs';

export function measureTrafficReflections(take,directory,{requireBoth=true}={}) {
 const lead = take.receipt.voices['lead-pass@1'];
 const candidates = {}, eligible = {};
 let faces;
 for (const row of take.rows) {
  if (row.soundMapGeometry) faces = new Map(row.soundMapGeometry.surfaces.map(s=>[s.id,s]));
  if (!faces || row.sampleFrame < 48000*.65) continue;
  const block = take.records[row.sampleFrame/512];
  for (const ray of row.soundMapFrame.paths.filter(p=>p.status==='selected' && p.order>=2 && lead.source.includes(p.sourceId))) {
   const normals = ray.surfaceIds.map(id=>faces.get(id)?.normal);
   const wall = n=>n && Math.abs(n[2])<.5;
   if (!wall(normals[0]) || !wall(normals.at(-1))) continue;
   const opposed = normals[0].reduce((sum,x,i)=>sum+x*normals.at(-1)[i],0);
   if (opposed>-.8) continue;
   const pair = ray.order===2 && ray.sourceId===lead.source[0] && ray.pan>0;
   const triple = ray.order===3 && ray.sourceId===lead.source[1] && normals[1]?.[2]<-.65;
   if (!pair && !triple) continue;
   const kind = pair ? 'right-hand-two-wall-engine' : 'wall-canopy-opposite-wall-exhaust';
   const slot = row.appliedPaths.find(p=>p.present && p.id===ray.id);
   if (!slot) continue;
   const proxy = Math.max(...slot.gainBands)*block.dryLevels[ray.sourceId];
   const direct = row.soundMapFrame.paths.find(p=>p.status==='selected' && p.order===0 && p.sourceId===ray.sourceId);
   if (!direct) continue;
   const candidate={sampleFrame:row.sampleFrame,ray,slot,proxy,normals,excessDelayMs:1000*(ray.delay-direct.delay)};
   (eligible[kind]??=[]).push(candidate);
   if (!candidates[kind] || candidates[kind].proxy<proxy) candidates[kind]=candidate;
  }
 }
 if(requireBoth) assert.equal(Object.keys(candidates).length,2,'Retain both distinct multi-wall routes on the primary vehicle');
 const result = {};
 for (const [kind,chosen] of Object.entries(candidates)) {
  const id=chosen.ray.id;
  const isolated = replayMappedPaths(take,null,null,p=>p.id===id,{save:false});
  const omitted = replayMappedPaths(take,null,null,p=>p.id!==id,{save:false});
  let strongest=chosen, maxEnergy=-1;
  for (const candidate of eligible[kind].filter(item=>item.ray.id===id)) {
   let power=0;
   for (const channel of isolated.channels) for (let i=candidate.sampleFrame;i<candidate.sampleFrame+512;i++) power+=channel[i]**2;
   if (power>maxEnergy) {maxEnergy=power;strongest=candidate;}
  }
  const {sampleFrame,ray,slot,normals,excessDelayMs}=strongest;
  const rms=[0,0],peak=[0,0];
  let nullPeak=0;
  for (let side=0;side<2;side++) {
   for (let i=0;i<take.channels[side].length;i++) {
    const x=isolated.channels[side][i];
    nullPeak=Math.max(nullPeak,Math.abs((take.channels[side][i]-omitted.channels[side][i])-x));
    if (i>=sampleFrame && i<sampleFrame+512) {
     rms[side]+=x*x;
     peak[side]=Math.max(peak[side],Math.abs(x));
    }
   }
   rms[side]=Math.sqrt(rms[side]/512);
  }
  assert(Math.max(...peak)>1e-8 && nullPeak<1e-7);
  if (kind==='right-hand-two-wall-engine') assert(rms[1]>rms[0]);
  const file='stems/'+kind+'.wav';
  result[kind]={sampleFrame,seconds:sampleFrame/48000,source:ray.sourceId,order:ray.order,pathId:ray.id,surfaceIds:ray.surfaceIds,
   bouncePoints:ray.points,normals,gainBands:slot.gainBands,pan:slot.pan,excessDelayMs,rms,peak,nullPeak,file,
   sha256:writeStereoWave(path.join(directory,file),isolated.channels)};
 }
 return result;
}

export function measureTrafficExit(take) {
 const lead=take.receipt.voices['lead-pass@1'];
 const owns=p=>lead.source.includes(p.sourceId) && p.generation%4294967296===lead.renderGeneration;
 const higher=replayMappedPaths(take,null,null,p=>owns(p)&&p.order>=2,{save:false});
 const direct=replayMappedPaths(take,null,null,p=>owns(p)&&p.order===0,{save:false});
 let lastHigher=-1,lastDirect=-1;
 for(let i=0;i<take.channels[0].length;i++){
  if(higher.channels.some(c=>c[i]!==0))lastHigher=i;
  if(direct.channels.some(c=>c[i]!==0))lastDirect=i;
 }
 assert(lastHigher>0 && lastDirect-lastHigher>48000,'The lead must continue after its last higher-order return');
 return {vehicle:lead.vehicle,lastHigherOrderFrame:lastHigher,lastHigherOrderSeconds:lastHigher/48000,
  lastDirectFrame:lastDirect,lastDirectSeconds:lastDirect/48000};
}
