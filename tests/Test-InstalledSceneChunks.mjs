import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {deserialize, serialize} from 'node:v8';
import {createHash} from 'node:crypto';
import {digest} from '../src/acoustics/world/contracts.mjs';
import {originalInstalledCache01} from './fixtures/InstalledStaticCache01.mjs';
import {InstalledStaticWorld01, bindInstalledStaticSceneWorker01, encodeInstalledStaticScene01, prepareInstalledStaticSceneTransfer01}
  from '../src/acoustics/world/installed-static-scene01.mjs';
import {packInstalledSceneFaces, unpackInstalledSceneFaces} from '../src/acoustics/world/installed-scene-chunks.mjs';
import {InstalledSceneService01} from '../src/acoustics/world/installed-scene-service01.mjs';
import {registerPreparedSoundMapGeometry01} from '../src/acoustics/streaming/soundmap-telemetry.mjs';
import {CausalSimulation, StreamingRenderer} from '../src/acoustics/streaming/causal.mjs';
import {preparedGpuGeometry01} from '../src/acoustics/gpu/geometry.mjs';
import {querySegment} from '../src/acoustics/research/local-geometry.mjs';

// Two walls form a corridor. Additional small ground triangles exercise several
// transport chunks while leaving the finite wall-to-wall return unobstructed.
const vertices = [], polygons = [];
function triangle(a, b, c) {
  const i = vertices.length;
  vertices.push(a, b, c);
  polygons.push({family:'Triangle', indices:[i, i+1, i+2], materialSlot:0});
}
for (const y of [-3, 3]) {
  triangle([-8,y,0], [8,y,0], [8,y,4]);
  triangle([-8,y,0], [8,y,4], [-8,y,4]);
}
for (let i = 0; i < 509; i++) {
  const x = -6 + (i % 30) * .4, y = -2.5 + Math.floor(i / 30) * .25;
  triangle([x,y,0], [x+.15,y,0], [x,y+.15,0]);
}
const cache = originalInstalledCache01({mesh:{vertices,polygons}});
const request = {session:'d'.repeat(32), listener:[4,0,1], sources:[[-4,0,1]], generation:1,
  geometryTimeMs:0, durationMs:1000, radius:12, maximumSurfaces:1024, adaptiveRadius:false,
  engine:{order:2, maxReflectors:16, installedReflectionTrains:true}};
const world = new InstalledStaticWorld01(cache);
const original = prepareInstalledStaticSceneTransfer01(encodeInstalledStaticScene01(world.window(request)),
  {...request, catalogSHA256:cache.catalogSHA256});
test.after(() => { world.close(); cache.close(); });

function freshTransfer() {
  const packed = packInstalledSceneFaces(original);
  return structuredClone(packed, {transfer:packed.packedFaces.chunks.map(bytes=>bytes.buffer)});
}

test('transferred chunks recover the complete prepared scene without changing the input', async () => {
  const envelope = freshTransfer();
  let yieldedWhileReading = false;
  const reading = unpackInstalledSceneFaces(envelope);
  nextTurn().then(() => { yieldedWhileReading = true; });
  const {prepared,profile} = await reading;
  assert(yieldedWhileReading, 'another event-loop turn must run before the complete scene is available');
  assert.deepEqual(prepared, original);
  assert.equal(envelope.scene.tile.surfaces.length, 0);
  assert.equal(Object.keys(envelope.scene.materials).length, 0);
  assert.equal(prepared.scene.tile.surfaces.length, 513);
  assert.equal(profile.chunks, envelope.packedFaces.chunks.length);
  assert.equal(profile.bytes, envelope.packedFaces.bytes);
  assert(profile.maximumSliceMilliseconds >= 0 && profile.activeSliceMilliseconds >= profile.maximumSliceMilliseconds);
  assert(profile.elapsedMilliseconds >= profile.activeSliceMilliseconds);
  assert.equal(prepared.gpuGeometry.observationKey, prepared.scene.geometryKey);
  assert(Object.isFrozen(prepared.scene.tile.surfaces[0].center));
  assert(Object.isFrozen(prepared.scene.materials[prepared.scene.tile.surfaces[0].id].reflection));
});

test('face order remains bound to the transported spatial index', async () => {
  const envelope = freshTransfer(), header = envelope.packedFaces;
  const last = header.chunks.length - 1, data = deserialize(header.chunks[last]);
  [data.rows[0],data.rows[1]] = [data.rows[1],data.rows[0]];
  const replacement = Uint8Array.from(serialize(data));
  header.bytes += replacement.byteLength - header.chunks[last].byteLength;
  header.chunks[last] = replacement;
  header.chunkDigests[last] = createHash('sha256').update(replacement).digest('hex');
  await assert.rejects(() => unpackInstalledSceneFaces(envelope));
  assert.equal(envelope.scene.tile.surfaces.length, 0);
});

test('losing the request between chunks discards all partial work', async () => {
  const envelope = freshTransfer();
  let turns = 0;
  const result = await unpackInstalledSceneFaces(envelope, {
    isCurrent: () => turns < 2,
    yieldTurn: async () => { turns++; await nextTurn(); },
  });
  assert.equal(result, null);
  assert.equal(turns, 2);
  assert.equal(envelope.scene.tile.surfaces.length, 0);
  assert.deepEqual(envelope.scene.materials, {});
  assert.equal(envelope.packedFaces.count, original.metadata.activeSurfaces);
});

test('invalid chunk framing or scene identity cannot yield a partial scene', async () => {
  for (const mutate of [
    data => { data.schema++; },
    data => { data.count--; },
    data => { data.chunks.pop(); },
    data => { data.bytes++; },
    data => { data.bytes = 16 * 1024 * 1024 + 1; },
    data => { data.chunks[0] = new Uint8Array(2 * 1024 * 1024 + 1); },
    data => { data.chunks[0] = data.chunks[0].subarray(1); },
    data => {
      const shared = new Uint8Array(new SharedArrayBuffer(data.chunks[0].byteLength));
      shared.set(data.chunks[0]);
      data.chunks[0] = shared;
    },
    data => { data.packetDigest = '0'.repeat(64); },
    data => { data.observationKey = '0'.repeat(64); },
    data => { data.chunks.at(-1).fill(0); },
  ]) {
    const envelope = freshTransfer();
    mutate(envelope.packedFaces);
    await assert.rejects(() => unpackInstalledSceneFaces(envelope));
    assert.deepEqual(envelope.scene.tile.surfaces, []);
    assert.deepEqual(envelope.scene.materials, {});
  }
});

test('a face group over its transfer budget falls back to the original envelope', () => {
  const prepared = structuredClone(original);
  prepared.scene.materials[prepared.scene.tile.surfaces[0].id].reference = 'x'.repeat(2 * 1024 * 1024);
  assert.equal(packInstalledSceneFaces(prepared), prepared);
});

function renderReturns(scene) {
  const simulation = new CausalSimulation(scene);
  const renderer = new StreamingRenderer({sourceIds:['tone'], masterGain:.175, continuousRates:true});
  const dry = new Float32Array(512), left = new Float32Array(512), right = new Float32Array(512);
  const pcm = createHash('sha256'), geometry = [];
  let highestOrder = 0;
  for (let block = 0; block < 24; block++) {
    const time = block * 512 / 48000;
    simulation.observe({time, session:request.session, generation:1, listener:{position:request.listener},
      sources:[{id:'tone', position:request.sources[0]}]});
    const control = simulation.update(time, {geometryTimeMs:time * 1000});
    geometry.push(control.paths.map(p => [p.candidateId, p.delay, p.pan, p.bands]));
    for (const route of control.paths) highestOrder = Math.max(highestOrder, route.order);
    for (let i = 0; i < 512; i++) dry[i] = Math.sin((block * 512 + i) * .08) * .1;
    renderer.accept(control);
    renderer.process({tone:dry}, left, right, 512);
    pcm.update(left).update(right);
  }
  assert(renderer.stats.sumSquares > 0 && highestOrder >= 2);
  return {geometry, pcm:pcm.digest('hex')};
}

test('the owned worker publishes the same finite routes, stereo PCM and viewer geometry', async () => {
  const delivery = Promise.withResolvers();
  const service = new InstalledSceneService01({session:request.session, config:cache,
    onScene(scene, receipt) { delivery.resolve({scene, receipt}); },
    onStatus(status) { if (status.worker?.failed) delivery.reject(Error(status.worker.failure)); }});
  const probe = bindInstalledStaticSceneWorker01(service.worker, {session:request.session});
  let raw;
  service.worker.on('message', message => {
    if (message.type === 'scene') raw = message;
  });
  const timeout = setTimeout(() => delivery.reject(Error('Timed out waiting for the installed scene')), 5000);
  try {
    service.updateWindow({...request, prepareSoundMapGeometry01:true});
    const {scene, receipt} = await delivery.promise;
    assert.equal(receipt.lifecycle01.workerProfile01.transfer.packedFaces, 513);
    assert.deepEqual(scene.tile, original.scene.tile);
    assert.deepEqual(scene.materials, original.scene.materials);
    assert.deepEqual(scene.observationModel, original.scene.observationModel);
    assert.deepEqual(preparedGpuGeometry01(scene.tile).bodyBytes, original.gpuGeometry.bodyBytes);
    for (const [a,b] of [[[0,-4,1],[0,4,1]], [[0,0,-1],[0,0,2]], [[-4,0,1],[4,0,1]]])
      assert.deepEqual(querySegment(scene.tile, a, b), querySegment(original.scene.tile, a, b));
    assert.deepEqual(renderReturns(scene), renderReturns(original.scene));
    assert(registerPreparedSoundMapGeometry01(scene, receipt.preparedSoundMapGeometry, receipt).registered);
    assert.throws(() => registerPreparedSoundMapGeometry01(scene, receipt.preparedSoundMapGeometry,
      {...receipt, requestId:receipt.requestId+1}), /binding/);
    const expected = {...request, ...receipt};
    await assert.rejects(probe.unpack(structuredClone(raw), expected, () => true), /capability/);
    await assert.rejects(probe.unpack(raw, {...expected, requestId:receipt.requestId+1}, () => true), /admission request/);
    await assert.rejects(probe.unpack(raw, expected, () => true), /capability/);
  } finally {
    clearTimeout(timeout);
    probe.close();
    await service.close();
  }
});

test('ten moving emitters renew an identical street cube from the admitted supports', async () => {
  let delivery, lastStatus;
  const service = new InstalledSceneService01({session:request.session, config:cache,
    unmanagedIntervalMs01:150, includeStatusHistory:false,
    onScene(scene, receipt) { delivery.resolve({scene, receipt}); },
    onStatus(status) { lastStatus=status; if (status.worker?.failed) delivery.reject(Error(status.worker.failure)); }});
  const read = async (i, options = {}) => {
    const current = {...request, surroundingWorkset01:true, localSurfaceTarget01:640,
      sources:Array.from({length:10}, (_,j)=>[-4 + i * .2, j * .09, 1]), geometryTimeMs:i * 160,
      sourceLayout:Array.from({length:10},(_,j)=>'car-'+Math.floor(j/2)+'-'+(j%2?'exhaust':'engine')),
      prepareSoundMapGeometry01:true, ...options};
    delivery = Promise.withResolvers();
    const timeout = setTimeout(() => delivery.reject(Error('No fresh workset')), 4500);
    try {
      service.updateWindow(current);
      const {scene, receipt} = await delivery.promise;
      const reference = world.window(current);
      assert.deepEqual(scene, reference);
      const packet=encodeInstalledStaticScene01(reference);
      const {packetDigest,...body}=packet;
      assert.equal(packetDigest,digest(body));
      assert.deepEqual(preparedGpuGeometry01(scene.tile).bodyBytes,
        prepareInstalledStaticSceneTransfer01(packet,
          {...current,catalogSHA256:cache.catalogSHA256}).gpuGeometry.bodyBytes);
      assert(registerPreparedSoundMapGeometry01(scene, receipt.preparedSoundMapGeometry, receipt).registered);
      for (const [a,b] of [[[0,0,-1],[0,0,2]], [[-4,0,1],[4,0,1]]])
        assert.deepEqual(querySegment(scene.tile,a,b),querySegment(reference.tile,a,b));
      return {scene,receipt};
    } finally { clearTimeout(timeout); }
  };
  try {
    const first = await read(0);
    const layout=Array.from({length:10},(_,j)=>'car-'+Math.floor(j/2)+'-'+(j%2?'exhaust':'engine'));
    const poses=Array.from({length:10},(_,j)=>[-4,j*.09,1]);
    const inputs={...request,surroundingWorkset01:true,localSurfaceTarget01:640,
      sourceLayoutKey:digest(layout),sources:poses,prepareSoundMapGeometry01:true};
    const moving=(options={})=>{
      const value={...inputs,...options};
      return service.adopter.retainedTransfer(value,true,digest(value.sources));
    };
    const originalCost=moving(), changedPose=moving({sources:poses.map(([x,y,z])=>[x-.5,y,z])});
    assert.equal(originalCost.key,changedPose.key);
    assert.notEqual(originalCost.movingPoseKey,changedPose.movingPoseKey);
    assert.notEqual(service.adopter.retainedTransfer(inputs,false,digest(poses)).key,originalCost.key);
    for(const changes of [
      {sourceLayoutKey:digest([...layout].reverse())},
      {sourceLayoutKey:digest([...layout.slice(0,-1),'car-4-aero'])},
      {sources:poses.slice(0,-1),sourceLayoutKey:digest(layout.slice(0,-1))},
      {engine:{...inputs.engine,maxReflectors:8}},{prepareSoundMapGeometry01:false}
    ])assert.notEqual(moving(changes).key,originalCost.key);
    for(const changes of [{radius:10},{maximumSurfaces:513},{listener:[4.01,0,1]},
      {generation:2},{localSurfaceTarget01:512},{interiorActivation01:{}}])assert.equal(moving(changes),null);
    const next = await read(1);
    assert.equal(first.receipt.lifecycle01.workerProfile01.transfer.packedFaces, 513);
    assert.equal(next.receipt.lifecycle01.workerProfile01.transfer.reusedFaces, 513);
    assert.notEqual(next.scene.geometryKey, first.scene.geometryKey);
    assert.notEqual(next.scene.tile.surfaces[0], first.scene.tile.surfaces[0]);
    assert.equal(next.scene.tile.surfaces[0].footprint, first.scene.tile.surfaces[0].footprint);
    assert.equal(next.scene.materials, first.scene.materials);
    assert.equal(first.scene.tile.surfaces[0].validUntil, 1000);
    assert.equal(next.scene.tile.surfaces[0].validUntil, 1160);
    const moved = await read(2, {listener:[4.1,0,1]});
    assert.equal(moved.receipt.lifecycle01.workerProfile01.transfer.packedFaces, 513);
    const generation = await read(3, {listener:[4.1,0,1], generation:2});
    assert.equal(generation.receipt.lifecycle01.workerProfile01.transfer.packedFaces, 513);
    assert.equal(lastStatus.worker.publications,4);
    assert.equal(lastStatus.sceneDeliveryDiagnostics01,undefined);
    assert(service.snapshot().sceneDeliveryDiagnostics01.recent.some(row=>row.outcome==='published'));
  } finally { await service.close(); }
});
