import {imageDistance,preparePathGeometry} from './paths.mjs';
import {onPatch} from '../research/local-geometry.mjs';

// An explicit lower-work fleet mode. This shortlist grants no visibility or
// playback authority. Each proposed route still needs its own retarded source
// time, finite support, material response and exact visibility on every leg.
const limits=[1,2,2,1];
const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])<=.1;

export function fleetReflectionSelector(scene,candidates){
  const groups=[[],[],[],[]],recent=new Map();
  for(const candidate of candidates){
    const order=candidate.surfaces.length;
    if(order<1||order>3)continue;
    const bands=[1,1,1];
    for(const face of candidate.surfaces){
      const material=scene.materials[face.id];
      for(let i=0;i<3;i++)bands[i]*=Math.sqrt(material?.reflection[i]??0);
    }
    groups[order].push({candidate,bands});
  }
  return (id,generation,source,listener,now)=>{
    const held=recent.get(id);
    if(held&&held.generation===generation&&now>=held.time&&now-held.time<=.05&&
       near(source,held.source)&&near(listener,held.listener))return held.selected;
    const selected=new Set([candidates[0]]);
    for(let order=1;order<=3;order++){
      const group=groups[order],limit=limits[order];
      if(group.length<=limit){for(const row of group)selected.add(row.candidate);continue;}
      const ranked=group.map(({candidate,bands})=>{
        const distance=imageDistance(source,candidate.surfaces,listener);
        const energy=Math.max(...bands.map((band,i)=>band*10**(-scene.config.airDbPerMetre[i]*distance/20)));
        return {candidate,strength:energy/Math.max(scene.config.referenceDistance,distance)};
      }).sort((a,b)=>b.strength-a.strength);
      let admitted=0;
      const supports=new Set();
      for(const {candidate} of ranked){
        const {surfaces,adjacentFaces,continuityId}=candidate;
        if(supports.has(continuityId))continue;
        const faceAtPoint=adjacentFaces?(i,p)=>onPatch(surfaces[i],p)?surfaces[i]:adjacentFaces[i].find(f=>onPatch(f,p)):null;
        if(preparePathGeometry(scene,source,listener,surfaces,faceAtPoint).status!=='prepared-geometry')continue;
        selected.add(candidate);supports.add(continuityId);
        if(++admitted===limit)break;
      }
    }
    const ordered=candidates.filter(c=>selected.has(c));
    if(!held&&recent.size>=16)recent.clear();
    recent.set(id,{generation,source:[...source],listener:[...listener],time:now,selected:ordered});
    return ordered;
  };
}
