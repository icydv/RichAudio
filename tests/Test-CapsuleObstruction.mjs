import test from 'node:test';
import assert from 'node:assert/strict';
import { originalInstalledCache01 } from './fixtures/InstalledStaticCache01.mjs';
import { decodeInstalledStaticScene01, encodeInstalledStaticScene01, InstalledStaticWorld01 } from '../src/acoustics/world/installed-static-scene01.mjs';
import { trajectory } from '../src/acoustics/engine/contracts.mjs';
import { candidatePaths, solvePath } from '../src/acoustics/engine/paths.mjs';

const track = (position) => trajectory([{time:0,position,forward:[1,0,0]}, {time:2,position,forward:[1,0,0]}]);
const direct = (scene, source, listener) => solvePath(scene, {track:track(source),directivity:0}, track(listener), 1, candidatePaths(scene)[0]);
const request = {listener:[-4,.037,1.43],sources:[[4,.037,1.43]],session:'1'.repeat(32),generation:1,
  radius:12,geometryTimeMs:0,durationMs:2000,engine:{order:0,smallCapsuleObstruction:true}};

test('a small decoded capsule preserves low-band direct continuity through the installed scene', () => {
  const fixture = originalInstalledCache01({mesh:{
    vertices:[[0,0,.2],[0,0,3.2],[1,.8,.1],[1,3.2,.1],[1,3.2,3.9],[1,.8,3.9],[-8,-2,-.4],[8,4,4.4]],
    polygons:[{family:'Capsule',indices:[0,1],radius:.22,materialSlot:0},
      {family:'Triangle',indices:[2,3,4],materialSlot:0},{family:'Triangle',indices:[2,4,5],materialSlot:0}],
  }});
  const world = new InstalledStaticWorld01(fixture);
  try {
    const installed = world.window(request);
    const disabled = world.window({...request,engine:{order:0,smallCapsuleObstruction:false}});
    assert.equal(direct(disabled,request.sources[0],request.listener).status,'blocked-no-modelled-path');
    const transported = decodeInstalledStaticScene01(encodeInstalledStaticScene01(installed),{
      ...request,catalogSHA256:fixture.catalogSHA256,
    });
    for (const scene of [installed,transported]) {
      const through = y => direct(scene,[4,y,1.43],[-4,y,1.43]);
      const centre = through(.037), grazing = through(.201), clear = through(.24);
      assert.equal(centre.status,'renderable');
      assert.equal(centre.visibility,'modelled-small-capsule-obstruction');
      assert.equal(centre.delay,clear.delay);
      assert(centre.bands[0] > clear.bands[0]*.55 && centre.bands[0] < clear.bands[0]*.95);
      assert(centre.bands[2]/clear.bands[2] < centre.bands[0]/clear.bands[0]*.6);
      assert(grazing.bands[0] > centre.bands[0] && grazing.bands[0] > clear.bands[0]*.95);
      assert.equal(direct(scene,[4,2.32,1.43],[-4,2.32,1.43]).status,'blocked-no-modelled-path');
      assert.equal(direct(scene,[4,3.98,1.43],[-4,-3.91,1.43]).status,'blocked-no-modelled-path',
        'the direct path must still be withheld when a wall is behind the capsule');
    }
  } finally {
    world.close();
    fixture.close();
  }
});
