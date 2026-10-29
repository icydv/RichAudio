// Original bounded metric fixtures for like-for-like CPU/GPU comparisons.
// These are authored scenes, not GTA observations or measured material data.
import {fixture} from './acoustics-06-scenes.mjs';
import {createTile,coordinateSpace,timeUnit} from '../src/acoustics/research/local-geometry.mjs';
import {acousticScene,material} from '../src/acoustics/engine/contracts.mjs';

const lifetime=120000;
function patch(id,center,normal,u,half){return {
  id,coordinateSpace,center,normal,u,half,motion:'static',reflectiveSide:'front',
  provenance:{kind:'synthetic',reference:'authored-acoustics082-comparison'},confidence:1,
  version:1,observedAt:0,validUntil:lifetime,
  material:{observedId:null,observedConfidence:null,acoustic:null},
};}

function demandingScene(){
  const radius=12,wallCount=14,height=8,halfWidth=radius*Math.tan(Math.PI/wallCount),surfaces=[
    patch('a-reflector-00-ground',[0,0,0],[0,0,1],[1,0,0],[14,14]),
    patch('a-reflector-01-ceiling',[0,0,height],[0,0,-1],[1,0,0],[14,14]),
  ];
  // A finite fourteen-sided prism supplies sixteen selected reflecting faces.
  // Wall endpoints meet at genuine polygon vertices; no coincident duplicate
  // surfaces or artificial echoes are used to inflate the valid-path count.
  for(let i=0;i<wallCount;i++){
    const angle=2*Math.PI*(i+.5)/wallCount,c=Math.cos(angle),s=Math.sin(angle);
    surfaces.push(patch(`a-reflector-${String(i+2).padStart(2,'0')}-wall`,
      [radius*c,radius*s,height/2],[-c,-s,0],[-s,c,0],[halfWidth,height/2]));
  }
  // Peripheral finite panels model bounded architectural clutter. They remain
  // visibility geometry, but the first sixteen IDs alone are reflection
  // candidates. Every path still checks the full represented world on CPU or
  // the conservative GPU screen plus the original exact CPU predicates.
  let clutter=0;
  for(let row=0;row<8&&clutter<112;row++)for(let column=0;column<16&&clutter<112;column++){
    const x=(column-7.5)*14,y=(row-3.5)*22;
    if(Math.hypot(x,y)<35)continue;
    const normal=clutter%2?[1,0,0]:[0,1,0],u=clutter%2?[0,1,0]:[1,0,0];
    surfaces.push(patch(`z-clutter-${String(clutter++).padStart(3,'0')}`,[x,y,2],normal,u,[1.5,2]));
  }
  if(surfaces.length!==128)throw Error('Bounded demanding fixture construction');
  const tile=createTile({schemaVersion:1,id:'authored-acoustics082-dense',coordinateSpace,timeUnit,
    bounds:{min:[-120,-120,-2],max:[120,120,16]},listenerAnchor:[3,.3,1.6],
    coverage:'complete-synthetic',surfaces,missingRegions:[],version:1,createdAt:0,validUntil:lifetime,
    build:'synthetic-v1',session:'authored-acoustics082',interior:'authored-prism',dynamicEpoch:0});
  const hard=material({reflection:[.86,.66,.4],transmission:[.01,.005,.001],reference:'authored-acoustics082-hard'});
  const ground=material({reflection:[.7,.48,.25],reference:'authored-acoustics082-ground'});
  return acousticScene(tile,Object.fromEntries(surfaces.map(s=>[s.id,s.id.endsWith('ground')?ground:hard])),
    {order:2,maxPaths:64,maxReflectors:16});
}

export function scenario(name,{sources=1}={}){
  if(!['small','open-road','enclosure','demanding'].includes(name)||!Number.isInteger(sources)||sources<1||sources>16)
    throw Error('Acoustic comparison scenario/source bound');
  let scene;
  if(name==='demanding')scene=demandingScene();
  else{
    const original=fixture(name==='enclosure'?'enclosure':'open-road').scene;
    scene=acousticScene(original.tile,original.materials,{...original.config,maxPaths:64,maxReflectors:16});
  }
  const sourceIds=Object.freeze(Array.from({length:sources},(_,i)=>'beacon-'+i));
  const positions=sourceIds.map((_,i)=>[-4+(i%4)*.8,-1.2+Math.floor(i/4)*.8,1.15+(i%3)*.12]);
  return Object.freeze({scene,sourceIds,
    description:name==='demanding'
      ?'Original 128-surface metric scene: finite fourteen-wall prism plus ground/ceiling and 112 peripheral visibility panels; sixteen selectable reflectors, first/second order only.'
      :'Original '+(name==='enclosure'?'six-surface enclosure':'one-surface open-road')+' metric scene; first/second order only.',
    snapshot(time){
      if(!Number.isFinite(time)||time<0||time>60)throw Error('Acoustic comparison time bound');
      const phase=.35*time,angle=Math.PI+.22*time;
      return {time,session:'acoustics082-comparison',generation:1,paused:false,emitting:true,
        listener:{position:[3+.3*Math.cos(phase),.3*Math.sin(phase),1.6+.05*Math.sin(.2*time)],
          velocity:[-.105*Math.sin(phase),.105*Math.cos(phase),.01*Math.cos(.2*time)],
          forward:[Math.cos(angle),Math.sin(angle),0],up:[0,0,1],generation:1,valid:true,
          coordinates:'synthetic-metric',units:'metres'},
        sources:sourceIds.map((id,i)=>({id,position:[...positions[i]],velocity:[0,0,0],
          forward:[1,0,0],up:[0,0,1],generation:1,valid:true,emitting:true,directivity:.2}))};
    },
  });
}
