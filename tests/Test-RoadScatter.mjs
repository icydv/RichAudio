import assert from 'node:assert/strict';
import {test} from 'node:test';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {createTile} from '../src/acoustics/research/local-geometry.mjs';
import {CausalSimulation,StreamingRenderer} from '../src/acoustics/streaming/causal.mjs';
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
