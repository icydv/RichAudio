import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acousticScene, trajectory } from '../src/acoustics/engine/contracts.mjs';
import * as pathSolver from '../src/acoustics/engine/paths.mjs';
import { createTile } from '../src/acoustics/research/local-geometry.mjs';
import { patch, sceneInput } from './fixtures/acoustics-scenes.mjs';

function wallScene(width) {
  const wall = patch('wall',[0,6,4],[0,-1,0],[1,0,0],[width,4]);
  return acousticScene(createTile({...sceneInput(),surfaces:[wall]}),{
    wall:{reflection:[.81,.64,.36],reference:'original-test-wall'},
  },{order:1});
}

const track = position => trajectory([
  {time:0,position,forward:[0,1,0]},
  {time:2,position,forward:[0,1,0]},
]);
function solveFacade(width, maximumDelay) {
  const scene=wallScene(width), source={track:track([0,-1,1]),directivity:0};
  const listener=track([-3,0,1]), facade=pathSolver.candidatePaths(scene).find(p=>p.surfaces.length===1);
  const plan=pathSolver.preparePath(scene,source,listener,.5,facade);
  const specular=pathSolver.finishPath(plan), stats={queries:0,surfaceTests:0};
  const nearby=pathSolver.roadScatterFromReflection(plan,specular,stats,maximumDelay);
  const later=pathSolver.roadScatterLaterFromReflection(plan,specular,stats,maximumDelay);
  return {specular,nearby:nearby?.response,later:later?.response};
}

test('a farther façade tap has its own delay and direction and needs finite support',()=>{
  const {specular,nearby,later}=solveFacade(16,.2);
  assert(nearby&&later,'the same wall supports near and farther scatter');
  assert(later.delay-specular.delay >= .024);
  assert(later.delay>nearby.delay);
  assert.notDeepEqual(later.arrivalDirection,nearby.arrivalDirection);
  assert(later.bands.every((p,i)=>p>0&&p<specular.bands[i]));
  assert.equal(solveFacade(6,.2).later,undefined,'a short wall has no farther finite contact');
  assert.equal(solveFacade(16,.05).later,undefined,'insufficient travel window withholds the farther return');
});
