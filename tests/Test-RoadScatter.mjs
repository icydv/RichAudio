import assert from 'node:assert/strict';
import {test} from 'node:test';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {createTile} from '../src/acoustics/research/local-geometry.mjs';
import {CausalSimulation,StreamingRenderer} from '../src/acoustics/streaming/causal.mjs';
import {VehicleAcousticPipeline} from '../src/acoustics/vehicle/pipeline.mjs';
import {patch,sceneInput} from './fixtures/acoustics-scenes.mjs';

function wallScene({width=16,centre=0,missing=false}={}){
 const input=sceneInput();
 input.surfaces=[patch('wall',[centre,6,4],[0,-1,0],[1,0,0],[width,4])];
 if(missing)input.missingRegions=[{id:'unsurveyed',bounds:{min:[-19,-13,-1],max:[19,13,8]},reason:'not-observed'}];
 return acousticScene(createTile(input),{wall:{reflection:[.81,.64,.36],reference:'original-test-wall'}},{order:1});
}
const source={id:'motor',position:[0,-1,1],forward:[1,0,0],roadExhaust:true,roadScatter:true};
const listener={position:[-3,0,1],forward:[0,1,0]};
function render(scene,scattering){
 const s=new CausalSimulation(scene,{roadScattering:scattering});
 const renderer=new StreamingRenderer({sourceIds:['motor'],maxPathsPerSource:16,continuousRates:true});
 for(let frame=0;frame<16384;frame+=512){
  s.observe({session:'scatter-test',time:frame/48000,listener,sources:[source]});
  const control=s.update(frame/48000);
  renderer.accept(control);
  const samples=new Float32Array(512),left=samples.slice(),right=samples.slice();
  renderer.process({motor:samples},left,right);
  if(frame===15872)return control.paths;
 }
}
test('a scattered return follows finite geometry and shares reflected band energy',()=>{
 const baseline=render(wallScene(),false), withScatter=render(wallScene(),true);
 const early=withScatter.find(p=>p.order===1&&!p.scatter);
 const dry=withScatter.find(p=>!p.order);
 const scattered=withScatter.filter(p=>p.scatter);
 assert.equal(scattered.length,1);
 const late=scattered[0];
 const old=baseline.find(p=>p.order===1);
 assert.deepEqual(dry,baseline.find(p=>!p.order));
 assert(late.distance>early.distance&&late.emissionFrame<early.emissionFrame);
 assert(Math.abs(late.delay-late.distance/343)<1e-12);
 assert.notDeepEqual(late.arrivalDirection,early.arrivalDirection);
 assert.notEqual(late.arrivalDirection[0],0);
 for(let i=0;i<3;i++){
  assert(early.bands[i]**2+late.bands[i]**2<=old.bands[i]**2+1e-12);
  assert(early.bands[i]<old.bands[i]);
  assert(late.bands[i]>0);
 }
});
test('scatter does not cross an opening or unknown segment',()=>{
 const aperture=wallScene({width:.4,centre:-1.6});
 const before=render(aperture,false),after=render(aperture,true);
 assert(!after.some(p=>p.scatter));
 // Lost scatter leaves through the aperture. It does not reappear in the
 // sharp arrival when the finite collection point can no longer be traced.
 for(let band=0;band<3;band++)
  assert(after.find(p=>p.order===1).bands[band]<before.find(p=>p.order===1).bands[band]);
 assert(!render(wallScene({missing:true}),true).some(p=>p.scatter));
});

test('withdrawing scatter at the aperture releases its tap without a sample step',()=>{
 const s=new CausalSimulation(wallScene(),{roadScattering:true});
 const renderer=new StreamingRenderer({sourceIds:['motor'],maxPathsPerSource:16,
  masterGain:1,continuousRates:true,generationReleaseGuard:true});
 const dry=new Float32Array(512).fill(.25),left=new Float32Array(512),right=new Float32Array(512);
 const drop=42,levels=[],steps=[];
 let last=0;
 for(let block=0;block<drop+5;block++){
  const time=block*512/48000;
  if(block===drop)s.replaceScene(wallScene({width:.4,centre:-1.6}));
  s.observe({session:'scatter-fade',time,listener,sources:[source]});
  const c=s.update(time);
  const paths=c.paths.filter(p=>p.scatter);
  if(block===drop-1)assert.equal(paths.length,1);
  if(block>=drop)assert.equal(paths.length,0);
  renderer.accept({...c,paths});
  renderer.process({motor:dry},left,right);
  if(block>=drop-1)for(const sample of left){
   if(block>=drop)steps.push(Math.abs(sample-last));
   levels.push(Math.abs(sample));last=sample;
  }
 }
 const peak=Math.max(...levels.slice(0,512));
 assert(peak>1e-5,'qualified wet tap was nonzero on the meter');
 assert(Math.max(...steps)<peak/200,'release cannot drop the tap in one sample');
 assert(Math.max(...levels.slice(-512))===0);
 assert.equal(renderer.stats.limited,0);
});

test('a qualified farther facade uses opt-in scatter travel time and reaches the proper side of stereo', async()=>{
 const face=patch('facade',[48,0,5],[-1,0,0],[0,1,0],[36,5]);
 const scene=acousticScene(createTile({...sceneInput(),bounds:{min:[-20,-42,-2],max:[64,42,16]},
  surfaces:[face]}),{facade:{reflection:[.81,.64,.36],reference:'original-test-facade'}},{order:1});
 const distant={id:'motor',position:[-8,14,1],forward:[0,1,0],roadScatter:true};
 const pedestrian={position:[0,0,1],forward:[0,1,0]};
 const pulseFrame=8192;
 async function playback(scatteredReflectionDelay, stem){
  let selected=null;
  const within=path=>stem==='direct'?path.order===0:path.scatter;
  const pipeline=new VehicleAcousticPipeline({scene,sourceIds:['motor'],masterGain:1,roadScattering:true,
   scatteredReflectionDelay,continuousRates:true,controlFilter(control){
    const paths=control.paths.filter(within);
    if(paths.length)selected=paths[0];
    return {...control,paths};
   }});
  const block=new Float32Array(512),left=new Float32Array(32768),right=new Float32Array(32768);
  try{
   for(let frame=0;frame<left.length;frame+=512){
    await pipeline.prepare({session:'facade-stereo',time:frame/48000,listener:pedestrian,sources:[distant]});
    block.fill(0);
    if(frame===pulseFrame)block[0]=.4;
    pipeline.process({motor:block},left.subarray(frame,frame+512),right.subarray(frame,frame+512));
   }
  }finally{await pipeline.close();}
  const first=left.findIndex((v,i)=>Math.max(Math.abs(v),Math.abs(right[i]))>1e-7);
  const channelEnergy=channel=>channel.reduce((sum,v)=>sum+v*v,0);
  return {selected,first,left:channelEnergy(left),right:channelEnergy(right)};
 }
 const restricted=await playback(undefined,'scatter');
 assert.equal(restricted.first,-1,'the existing near-space scatter cap withholds this return');
 const direct=await playback(.36,'direct');
 const late=await playback(.36,'scatter');
 assert(late.selected?.delay>.13&&late.selected.delay<.36,'qualified far return should survive the longer cap');
 assert.equal(direct.selected.order,0);
 assert(late.selected.distance>100);
 for(const stem of [direct,late])assert(Math.abs(stem.first-(pulseFrame+stem.selected.delay*48000))<=2);
 assert(direct.left>2*direct.right,'leftward direct source');
 assert(late.right>8*late.left,'rightward finite contact');
});

test('the extended flight window finds an intermediate contact on a finite facade',()=>{
 const face=patch('short-facade',[10,2,4],[-1,0,0],[0,1,0],[1.9,4]);
 const scene=acousticScene(createTile({...sceneInput(),bounds:{min:[-32,-6,-2],max:[20,8,12]},
  surfaces:[face]}),{[face.id]:{reflection:[.81,.64,.36],reference:'original-short-facade'}},{order:1});
 const source={id:'motor',position:[-30,3,1],forward:[0,1,0],roadScatter:true};
 const listener={position:[0,0,1],forward:[0,1,0]};
 function solve(scatteredReflectionDelay){
  const simulation=new CausalSimulation(scene,{roadScattering:true,scatteredReflectionDelay});
  for(const time of [0,.2,.4])simulation.observe({session:'finite-facade',time,listener,sources:[source]});
  return simulation.update(.4).paths;
 }
 const newer=solve(.36);
 const older=solve(undefined);
 const specular=newer.find(p=>p.order===1&&!p.scatter);
 const scattered=newer.find(p=>p.scatter);
 assert(specular&&older.find(p=>p.order===1));
 assert(!older.some(p=>p.scatter));
 assert(scattered&&scattered.delay>.13,'an intermediate finite contact supports the later return');
 assert(scattered.distance-specular.distance>.25);
});
