import {vector,sub,add,scale,dot,length,unit,onPatch,querySegment,cacheStatus,inBox,limits} from './local-geometry.mjs';
const E=limits.epsilon;
export function solveFirstReflections(tile,source,listener,{context,speedOfSound=343,referenceDistance=1}={}){
  source=vector(source);listener=vector(listener);if(!inBox(source,tile.bounds)||!inBox(listener,tile.bounds))throw Error('source/listener outside tile');
  if(!context||JSON.stringify(context.listener)!==JSON.stringify(listener)||!cacheStatus(tile,context).valid)throw Error('invalid or stale tile/query context');
  if(!Number.isFinite(speedOfSound)||speedOfSound<250||speedOfSound>450||!Number.isFinite(referenceDistance)||referenceDistance<=0||referenceDistance>10)throw Error('research propagation bounds');
  const d=length(sub(listener,source));if(d<=E)throw Error('coincident source/listener');
  const visibility=querySegment(tile,source,listener),spread=l=>Math.min(1,referenceDistance/l),direct={distance:d,arrivalSeconds:d/speedOfSound,arrivalDirection:unit(sub(source,listener)),visibility:visibility.visibility,query:visibility,pressureGain:visibility.visibility==='clear'?spread(d):null,energyGain:visibility.visibility==='clear'?spread(d)**2:null};
  const candidates=[];let segmentQueries=1,surfaceTests=visibility.surfaceTests;
  for(const wall of tile.surfaces){
    const a=dot(sub(source,wall.center),wall.normal),b=dot(sub(listener,wall.center),wall.normal),candidate={surfaceId:wall.id,status:'rejected',reason:null,point:null};
    if(Math.abs(a)<=E||Math.abs(b)<=E){candidate.reason='endpoint_on_reflector';candidates.push(candidate);continue;}
    if(a*b<=0||(wall.reflectiveSide==='front'&&(a<=0||b<=0))){candidate.reason='not_same_reflecting_side';candidates.push(candidate);continue;}
    const image=add(source,scale(wall.normal,-2*a)),toImage=sub(image,listener),den=dot(toImage,wall.normal);
    if(Math.abs(den)<=E){candidate.reason='parallel_image_ray';candidates.push(candidate);continue;}
    const t=-b/den,point=add(listener,scale(toImage,t));candidate.point=point;candidate.image=image;
    if(t<=0||t>=1||!onPatch(wall,point)){candidate.reason='outside_finite_patch_or_opening';candidates.push(candidate);continue;}
    const first=querySegment(tile,source,point,{reflectorId:wall.id}),second=querySegment(tile,point,listener,{reflectorId:wall.id});segmentQueries+=2;surfaceTests+=first.surfaceTests+second.surfaceTests;
    const distance=length(sub(source,point))+length(sub(point,listener)),energyReflection=wall.material.acoustic?.energyReflection??null;
    Object.assign(candidate,{distance,arrivalSeconds:distance/speedOfSound,excessDelaySeconds:Math.max(0,(distance-d)/speedOfSound),arrivalDirection:unit(sub(point,listener)),segments:[first,second],energyReflection,materialBasis:wall.material.acoustic?.kind??'unknown',geometricPressure:spread(distance),geometricEnergy:spread(distance)**2,pressureGain:null,energyGain:null});
    if(distance+E<d)throw Error('reflection shorter than direct geometric separation');
    if(first.visibility==='blocked'||second.visibility==='blocked')candidate.reason='blocked_segment';
    else if(first.visibility!=='clear'||second.visibility!=='clear'){candidate.status='uncertain';candidate.reason='incomplete_or_ambiguous_geometry';}
    else {candidate.status='valid';candidate.reason=null;if(energyReflection!==null){candidate.pressureGain=spread(distance)*Math.sqrt(energyReflection);candidate.energyGain=spread(distance)**2*energyReflection;}}
    candidates.push(candidate);
  }
  return {schemaVersion:1,tileId:tile.id,tileVersion:tile.version,source,listener,speedOfSound,referenceDistance,direct,candidates,counts:{surfaces:tile.surfaces.length,candidates:candidates.length,valid:candidates.filter(c=>c.status==='valid').length,rejected:candidates.filter(c=>c.status==='rejected').length,uncertain:candidates.filter(c=>c.status==='uncertain').length,segmentQueries,surfaceTests},scope:'First-order geometric paths; no diffraction, transmission, audio, native integration or total-energy certification'};
}
