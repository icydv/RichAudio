import test from 'node:test';
import assert from 'node:assert/strict';
import {originalInstalledCache01} from './fixtures/InstalledStaticCache01.mjs';
import {InstalledStaticWorld01, installedStaticSceneMetadata01, encodeInstalledStaticScene01,
  decodeInstalledStaticScene01} from '../src/acoustics/world/installed-static-scene01.mjs';
import {candidatePaths, pathGeometry, solvePath} from '../src/acoustics/engine/paths.mjs';
import {trajectory} from '../src/acoustics/engine/contracts.mjs';
import {createTile} from '../src/acoustics/research/local-geometry.mjs';
import {sceneInput, patch} from './fixtures/acoustics-scenes.mjs';

// The north wall has an opening centred on its single-bounce point. Its two
// remaining panels support distinct bounces on a three-leg reflection train.
function street({northRight=true, blocker=false, clutter=false}={}) {
  const vertices=[], polygons=[];
  function panel(x0,x1,y0,y1,z0=0,z1=4) {
    const n=vertices.length;
    vertices.push([x0,y0,z0],[x1,y1,z0],[x1,y1,z1],[x0,y0,z1]);
    for (const indices of [[n,n+1,n+2],[n,n+2,n+3]])
      polygons.push({family:'Triangle',indices,materialSlot:0});
  }
  panel(-5,-2,3,3);
  if(northRight) panel(2,5,3,3);
  panel(-7,7,-3,-3);
  if(blocker) panel(-2,-2,-.5,.5);
  if(clutter) for(let i=0;i<18;i++) panel(-5,5,.4+i*.02,.4+i*.02,2.6,2.63);
  return originalInstalledCache01({mesh:{vertices,polygons}});
}
const source=[-6,0,1.1], listener=[6,0,1.1];
const request={listener,sources:[source],session:'b'.repeat(32),generation:1,durationMs:3000,
  radius:20,maximumSurfaces:128,engine:{order:2,maxReflectors:16,installedReflectionTrains:true}};
const centres=path=>path.surfaces.map(s=>Math.round(s.center[1])).join(',');

test('installed discovery finds finite intermediate walls absent from the single-bounce set',()=>{
  const cache=street(), world=new InstalledStaticWorld01(cache);
  try {
    const scene=world.window(request);
    const paths=candidatePaths(scene);
    assert.ok(!paths.some(p=>centres(p)==='3'),'single-bounce point lies in a real gap');
    const pair=paths.find(p=>centres(p)==='3,-3');
    assert.ok(pair,'north then south route survives without a north single');
    const p=pathGeometry(scene,source,listener,pair.surfaces);
    assert.equal(p.status,'clear');
    assert.deepEqual(p.points.map(q=>q.map(x=>Math.round(x*10)/10)),[[-3,3,1.1],[3,-3,1.1]]);
    assert.ok(Math.abs(p.distance-Math.hypot(12,12))<1e-8);
    const triple=paths.find(p=>centres(p)==='3,-3,3');
    assert.ok(triple,'one plane can participate twice on different finite faces');
    assert.equal(new Set(triple.surfaces.map(s=>s.id)).size,3);
    const q=pathGeometry(scene,source,listener,triple.surfaces);
    assert.equal(q.status,'clear');
    assert.deepEqual(q.points.map(p=>p.map(x=>Math.round(x*10)/10)),[[-4,3,1.1],[0,-3,1.1],[4,3,1.1]]);
    assert.ok(Math.abs(q.distance-Math.hypot(12,18))<1e-8);
    const [a,b,c]=triple.continuityId.slice(2).split('>');
    assert.equal(a,c); assert.notEqual(a,b);
    assert.ok(candidatePaths(scene,{maxReflectors:1}).every(p=>p.surfaces.length<2));
    const copy=decodeInstalledStaticScene01(encodeInstalledStaticScene01(scene),
      {...request,catalogSHA256:cache.catalogSHA256,geometryTimeMs:0});
    assert.deepEqual(candidatePaths(copy),paths);
    assert.ok(installedStaticSceneMetadata01(scene).reflectionSearch01.multiBounce.visibilitySegments>0);
    const original=world.window({...request,engine:{order:2,maxReflectors:16}});
    assert.ok(candidatePaths(original).every(p=>p.surfaces.length<2));
  } finally {world.close();cache.close();}
});

test('discovery withholds an unsupported last bounce and a blocked middle leg',()=>{
  for(const options of [{northRight:false},{blocker:true}]) {
    const cache=street(options),world=new InstalledStaticWorld01(cache);
    try {
      const scene=world.window(request),paths=candidatePaths(scene);
      assert.ok(paths.some(p=>centres(p)==='-3'),'an independent single remains available');
      assert.ok(!paths.some(p=>centres(p)==='3,-3,3'));
      if(options.blocker) assert.ok(paths.some(p=>centres(p)==='3,-3'),'different two-bounce path clears screen');
    } finally {world.close();cache.close();}
  }
});

test('a bounce on a shared triangle edge keeps one finite arrival with the same plane identity',()=>{
  const cache=street(),world=new InstalledStaticWorld01(cache);
  try {
    const ids=[];
    for(const z of [1.9,2,2.1]) {
      const emitter=[-6,0,z], receiver=[6,0,z];
      const scene=world.window({...request,sources:[emitter],listener:receiver});
      const support=candidatePaths(scene).filter(p=>centres(p)==='-3');
      assert.equal(support.length,1,'single arrival on the shared diagonal');
      assert.equal(pathGeometry(scene,emitter,receiver,support[0].surfaces).status,'clear');
      ids.push(support[0]);
    }
    assert.notEqual(ids[0].id,ids[2].id,'support crosses onto the adjacent finite triangle');
    assert.equal(ids[0].continuityId,ids[1].continuityId);
    assert.equal(ids[0].continuityId,ids[2].continuityId);
  } finally {world.close();cache.close();}
});

test('nearby slivers leave room for larger supporting walls in the bounded train search',()=>{
  const cache=street({clutter:true}),world=new InstalledStaticWorld01(cache);
  try {
    const scene=world.window(request),paths=candidatePaths(scene);
    assert.ok(paths.some(p=>centres(p)==='3,-3,3'));
  } finally {world.close();cache.close();}
});

test('one worker pose follows a retarded bounce across a shared edge during the same lease',()=>{
  const cache=originalInstalledCache01({distantWall:true}),world=new InstalledStaticWorld01(cache);
  try {
    const receiver=[2,-2,2], start=[-2,-2,1.75], end=[-2,-2,2.25];
    const sceneAt=maxReflectors=>world.window({...request,listener:receiver,sources:[start],radius:32,
      engine:{...request.engine,maxReflectors}});
    const track=position=>trajectory([{time:0,position}]);
    const solve=(scene,position)=>{
      const seed=candidatePaths(scene).find(c=>c.surfaces.length===1);
      return solvePath(scene,{track:track(position),directivity:0},track(receiver),1,seed);
    };
    const scene=sceneAt(2), before=solve(scene,start), after=solve(scene,end);
    assert.equal(before.status,'renderable');
    assert.equal(after.status,'renderable','the renderer can reach the adjacent face before the next worker window');
    assert.notEqual(before.id,after.id);
    assert.equal(after.id,'r:'+after.materialBasis[0].surface);
    assert.deepEqual(after.points,[[0,0,2.125]]);
    assert.ok(Math.abs(after.delay-Math.hypot(4,4,.25)/343)<1e-10);
    assert.equal(candidatePaths(scene).length,2,'one reflection work item before and after the crossing');
    assert.equal(solve(sceneAt(1),end).status,'outside-finite-patch-or-opening','respects a one-face quality budget');
    assert.equal(solve(scene,[24,-2,2]).status,'outside-finite-patch-or-opening','disconnected coplanar panels are separate');
  } finally {world.close();cache.close();}
});

test('a second face at a bounce blocks the reflection unless the contact is on their shared edge',()=>{
  const tilt=4e-7;
  for(const [centre,normal,tangent,half,bounceX] of [
    [[0,0,1],[Math.sin(tilt),Math.cos(tilt),0],[Math.cos(tilt),-Math.sin(tilt),0],[3,2],0],
    [[.5,0,1],[0,1,0],[1,0,0],[3,2],0],
    [[.5,0,1],[0,1,0],[1,0,0],[3,2],-2.5],
  ]) {
    const surfaces=[patch('first',[0,0,1],[0,1,0],[1,0,0],[2.5,2]),
      patch('crossing',centre,normal,tangent,half)];
    const tile=createTile({...sceneInput(),surfaces});
    const scene={tile,config:{installedReflectionTrains:true}}, first=tile.surfaces.find(s=>s.id==='first');
    const path=pathGeometry(scene,[bounceX-2,2,1],[bounceX+2,2,1],[first]);
    assert.equal(path.status,'blocked-reflection');
    assert.ok(path.hits.every(h=>h.id==='crossing'));
  }
});

test('the installed search reports each obstacle against the corresponding order of proposals',()=>{
  const cache=street({blocker:true}),world=new InstalledStaticWorld01(cache);
  try {
    const report=installedStaticSceneMetadata01(world.window(request)).reflectionSearch01;
    assert.equal(report.knownHit,report.testedCandidates-report.qualified);
    assert.ok(report.multiBounce.knownHit[3]>0,'the screen obstructs the middle of a triple');
  } finally {world.close();cache.close();}
});

test('a moving exterior emitter retains room inside an adaptive multiwall workset',()=>{
  const vertices=[],polygons=[];
  for(let x=0;x<10;x++)for(let z=0;z<8;z++){
    const at=vertices.length, left=x*.2, bottom=z*.2;
    vertices.push([left,1,bottom],[left+.19,1,bottom],[left,1,bottom+.19]);
    polygons.push({family:'Triangle',indices:[at,at+1,at+2],materialSlot:0});
  }
  const cache=originalInstalledCache01({mesh:{vertices,polygons}}), world=new InstalledStaticWorld01(cache);
  try{
    const window=(distance,{radius=32,trains=true}={})=>world.window({...request,
      listener:[0,-1,1],sources:[[distance,-1,1]],radius,maximumSurfaces:128,localSurfaceTarget01:64,
      surroundingWorkset01:true,engine:{...request.engine,installedReflectionTrains:trains}});
    const first=window(9.1), next=window(9.5);
    assert.equal(installedStaticSceneMetadata01(first).activeRadius,16);
    assert.equal(installedStaticSceneMetadata01(next).activeRadius,16);
    assert.deepEqual(first.tile.surfaces.map(s=>s.id),next.tile.surfaces.map(s=>s.id));
    assert.equal(installedStaticSceneMetadata01(window(9.5,{radius:10})).activeRadius,10);
    assert.equal(installedStaticSceneMetadata01(window(9.5,{trains:false})).activeRadius,9.5);
  }finally{world.close();cache.close();}
});
