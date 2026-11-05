// Original finite supports only. Product-size indexing must preserve every
// exact contact, opening, ambiguity and unknown region of the existing solver.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTile,querySegment,coordinateSpace,timeUnit,maximumIndexedSurfaces} from '../src/acoustics/research/local-geometry.mjs';
import {AcousticAcceleration} from '../src/acoustics/streaming/acoustic-backend.mjs';
function input(count=1024){return {schemaVersion:1,id:'indexed-original-world01',coordinateSpace,timeUnit,
 bounds:{min:[-128,-128,-8],max:[128,128,8]},listenerAnchor:[0,0,1],coverage:'complete-synthetic',
 surfaces:Array.from({length:count},(_,i)=>({id:'surface-'+i.toString().padStart(5,'0'),coordinateSpace,
  center:[(i%32-15.5)*6,(Math.floor(i/32)-15.5)*6,0],normal:i%7===0?[1,0,0]:[0,0,1],u:i%7===0?[0,1,0]:[1,0,0],half:[1,1],
  motion:'static',reflectiveSide:'both',provenance:{kind:'synthetic',reference:'original-indexed-world01'},confidence:1,version:1,observedAt:0,validUntil:60000,
  ...(i===1?{openings:[{min:[-.2,-.2],max:[.2,.2]}]}:{}),...(i===2?{footprint:[[-1,-1],[1,-1],[0,1]]}:{} )})),
 missingRegions:[{id:'explicit-unknown',bounds:{min:[-2,-2,-2],max:[2,2,2]},reason:'original-unknown-region'}],
 version:1,createdAt:0,validUntil:60000,build:'original-v1',session:'indexed-world01',interior:'outside',dynamicEpoch:0};}
const exact=({surfaceTests,...rest})=>rest;
test('large spatial worksets preserve exact predicates while the research default remains bounded',()=>{
 const original=input();assert.throws(()=>createTile(original),/surface limit/);assert.throws(()=>createTile(original,{maximumSurfaces:maximumIndexedSurfaces+1}));
 const tile=createTile(original,{maximumSurfaces:2048}),all=tile.surfaces.map((_,i)=>i),segments=[];
 let seed=37;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(let i=0;i<240;i++)segments.push({a:[rand()*240-120,rand()*240-120,rand()*12-6],b:[rand()*240-120,rand()*240-120,rand()*12-6]});
 for(const s of tile.surfaces.slice(0,50)){
  segments.push({a:s.center.map((x,i)=>x-s.normal[i]*2),b:s.center.map((x,i)=>x+s.normal[i]*2)});
  segments.push({a:s.corners[0],b:s.corners[1]});
  segments.push({a:s.center.map((x,i)=>x-s.normal[i]*1e-9),b:s.center.map((x,i)=>x+s.normal[i]*2)});
 }
 let indexedTests=0;for(const ray of segments){const got=querySegment(tile,ray.a,ray.b),reference=querySegment(tile,ray.a,ray.b,{surfaceIndices:all});assert.deepEqual(exact(got),exact(reference));indexedTests+=got.surfaceTests;}
 assert.ok(indexedTests<segments.length*tile.surfaces.length*.1,'index must avoid most exact finite-surface tests without losing contacts');
 assert.equal(Object.isFrozen(tile),true);assert.equal(tile.surfaces.length,1024);
});
test('a legacy hardware helper never receives an oversized mask or a truncated large workset',async()=>{
 let dispatches=0;const client={closed:false,async capability(){return {supported:true,hardware:true,maximumSurfaces:128,visibilityProtocol:1};},async dispatch(request){if(request.generation===0){assert.equal(request.surfaces.length,1);return {masks:new Uint32Array([1,0,0,0]),metrics:{roundTripMs:0}};}dispatches++;throw Error('no oversized submission');},close(){this.closed=true;}};
 const tile=createTile(input(),{maximumSurfaces:2048}),backend=new AcousticAcceleration({mode:'gpu',clientFactory:()=>client});await backend.ready();
 const rays=[{a:[-100,-100,-4],b:[100,100,4]}];
 try{const got=await backend.query(tile,rays,{generation:1});assert.deepEqual(got,rays.map(r=>querySegment(tile,r.a,r.b)));assert.equal(tile.surfaces.length,1024);assert.equal(dispatches,0);assert.equal(backend.diagnostics().activeAcceleration,'cpu');assert.match(backend.diagnostics().fallbackReason,/extended-global-mask/);}finally{backend.close();}
});
