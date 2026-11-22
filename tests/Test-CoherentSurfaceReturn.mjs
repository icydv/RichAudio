import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acousticScene, trajectory } from '../src/acoustics/engine/contracts.mjs';
import { candidatePaths, solvePath } from '../src/acoustics/engine/paths.mjs';
import { scene } from './fixtures/acoustics-scenes.mjs';

const tile = scene('urban-street').tile;
const materials = Object.fromEntries(tile.surfaces.map(s => [s.id, {
  reflection: [.8,.65,.45], transmission: [0,0,0], basis: 'authored-assumption', reference: 'rough-wall-fixture'
}]));
function solve(options, sourcePosition, listenerPosition, order) {
  const model = acousticScene(tile, materials, {order:2,maxPaths:32,...options});
  const track = position => trajectory([{time:0,position}]);
  const path = candidatePaths(model).find(p => p.id === (order===0?'direct':order===1?'r:north-wall':'r:north-wall>south-wall'));
  return solvePath(model, {track:track(sourcePosition),directivity:0}, track(listenerPosition), .7, path);
}

test('unresolved height variation reduces coherent reflected pressure per finite bounce', () => {
  const src=[-3,0,1], dst=[3,0,1], sigma=.008;
  for(const order of [0,1,2]){
    const a=solve({},src,dst,order);
    const b=solve({surfaceRoughnessRmsMetres:sigma},src,dst,order);
    assert.equal(a.status,'renderable');
    assert.equal(b.status,'renderable');
    assert.deepEqual(b.points,a.points);
    assert.equal(b.delay,a.delay);
    assert.equal(b.pan,a.pan);
    const metresAcross=order*12;
    const cos2=metresAcross**2/(metresAcross**2+36);
    for(const [i,f] of [200,1600,6400].entries()){
      const factor=Math.exp(-2*order*cos2*(2*Math.PI*f*sigma/343)**2);
      assert.ok(Math.abs(b.bands[i]/a.bands[i]-factor)<1e-10,'coherent band gain');
    }
    assert.deepEqual(solve({surfaceRoughnessRmsMetres:0},src,dst,order),a);
  }
});
test('roughness requires a finite nonnegative RMS height',()=>{
  for(const value of [-.01,Infinity,NaN,'0.01'])assert.throws(()=>acousticScene(tile,materials,{surfaceRoughnessRmsMetres:value}),/roughness/);
});
