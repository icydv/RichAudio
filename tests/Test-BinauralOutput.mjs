import assert from 'node:assert/strict';
import test from 'node:test';
import { StreamingRenderer } from '../src/acoustics/streaming/causal.mjs';
import { conditionalStockScene } from '../src/acoustics/engine/contracts.mjs';
import { VehicleAcousticPipeline } from '../src/acoustics/vehicle/pipeline.mjs';

const impulseFrame = 2048;
const blockFrames = 512;
const direct = { id: 'direct', pan: 1, arrivalHeadDirection: [1, 0, 0], order: 0, delay: 0 };
const wall = { id: 'wall', pan: -1, arrivalHeadDirection: [-1, 0, 0], order: 1, delay: .004 };

function render(spatialOutput, paths, { mixHead = null, rate = 1 } = {}) {
  const renderer = new StreamingRenderer({ spatialOutput });
  const left = new Float32Array(4096), right = new Float32Array(left.length);
  const dry = new Float32Array(blockFrames), outLeft = new Float32Array(blockFrames), outRight = new Float32Array(blockFrames);
  for (let frame = 0; frame < left.length; frame += blockFrames) {
    const arrived = paths.filter(p => Math.round(p.delay * 48000) <= frame);
    renderer.accept({ frame, sourceGenerations: { beacon: 1 }, paths: arrived.map(p => ({
      ...p, ...(mixHead && frame >= impulseFrame ? mixHead(p) : {}), sourceId: 'beacon', generation: 1,
      emissionFrame: frame - p.delay * 48000, rate, bands: [.35, .35, .35],
    })) });
    dry.fill(0);
    if (frame === impulseFrame || mixHead && frame === impulseFrame + blockFrames) dry[0] = .5;
    renderer.process({ beacon: dry }, outLeft, outRight);
    left.set(outLeft, frame);
    right.set(outRight, frame);
  }
  return { left, right };
}
function peak(samples, start, stop) {
  let amplitude = 0, at = -1;
  for (let i = start; i < stop; i++) {
    if (Math.abs(samples[i]) <= amplitude) continue;
    amplitude = Math.abs(samples[i]);
    at = i;
  }
  return { amplitude, at };
}
test('a right-hand direct impulse and its left-hand wall answer arrive separately in both ears', () => {
  const afterWall = impulseFrame + 192;
  const { left, right } = render('binaural-reference', [direct, wall]);
  const nearDirect = peak(right, impulseFrame, afterWall);
  const farDirect = peak(left, impulseFrame, afterWall);
  const nearWall = peak(left, afterWall, afterWall + 140);
  const farWall = peak(right, afterWall, afterWall + 140);
  for (const [near, far] of [[nearDirect, farDirect], [nearWall, farWall]]) {
    assert.ok(near.amplitude > .025);
    assert.ok(far.amplitude > .002);
    assert.ok(near.amplitude > 2 * far.amplitude);
    assert.ok(far.at - near.at >= 20 && far.at - near.at <= 42, JSON.stringify({ near, far }));
  }
  assert.equal(nearWall.at - nearDirect.at, 192);
  assert.equal(farWall.at - farDirect.at, 192);
});
test('speaker output retains the previous two-channel pan', () => {
  const { left, right } = render('speakers', [direct]);
  assert.equal(peak(left, impulseFrame, impulseFrame + 140).amplitude, 0);
  assert.equal(peak(right, impulseFrame, impulseFrame + 140).at, impulseFrame);
});
test('a turning listener reverses the near ear once the receiving head turns', () => {
  const { left, right } = render('binaural', [direct], {
    mixHead: () => ({ pan: 1, arrivalHeadDirection: [-1, 0, 0] }),
  });
  const second = impulseFrame + blockFrames;
  const near = peak(left, second, second + 140), far = peak(right, second, second + 140);
  assert.ok(near.amplitude > 2 * far.amplitude && far.amplitude > .002);
  assert.ok(far.at > near.at);
});
test('a scattered arrival retains direction and timing through the bounded shared response', () => {
  const { left, right } = render('binaural', [{ ...wall, scatter: true }]);
  const arrival = impulseFrame + 192;
  assert.equal(peak(left, impulseFrame, arrival).amplitude, 0);
  const near = peak(left, arrival, arrival + 140), far = peak(right, arrival, arrival + 140);
  assert.ok(near.amplitude > 2 * far.amplitude && far.amplitude > .002);
  assert.ok(far.at > near.at);
});
test('the vehicle pipeline projects a fixed world arrival into the changing head basis', async () => {
  const session = '0123456789abcdef0123456789abcdef';
  const id = 'stock:fixture:exhaust', scene = conditionalStockScene([id], session);
  const pipeline = new VehicleAcousticPipeline({ scene, sourceIds: [id], spatialOutput: 'binaural' });
  const inputs = { [id]: new Float32Array(blockFrames) }, left = new Float32Array(blockFrames), right = new Float32Array(blockFrames);
  const directions = [[0, 1, 0], [1, 0, 0], [0, -1, 0]];
  const actual = [];
  try {
    for (let block = 0; block < 12; block++) {
      const time = block * blockFrames / 48000;
      const forward = directions[Math.min(directions.length - 1, Math.max(0, block - 5))];
      const control = await pipeline.prepare({
        time, session, generation: 1,
        listener: { position: [0, 0, 1], forward },
        sources: [{ id, position: [5, 0, 1], forward: [0, 1, 0] }],
      });
      if (block >= 5 && block <= 7) {
        const [arrival] = control.paths;
        assert.deepEqual(arrival.arrivalDirection, [1, 0, 0]);
        actual.push(arrival.arrivalHeadDirection.map(value => value + 0));
      }
      pipeline.process(inputs, left, right);
    }
  } finally {
    pipeline.close();
  }
  assert.deepEqual(actual, [[1, 0, 0], [0, 1, 0], [-1, 0, 0]]);
});
