import { test } from "node:test";
import assert from "node:assert/strict";
import { createTile } from "../src/acoustics/research/local-geometry.mjs";
import { sceneInput, patch } from "./fixtures/acoustics-scenes.mjs";
import {
  acousticScene,
  trajectory,
  ownedSource,
  pose,
  material,
} from "../src/acoustics/engine/contracts.mjs";
import {
  prepare,
  render,
  PcmRenderer,
} from "../src/acoustics/engine/renderer.mjs";
import { candidatePaths, solvePath } from "../src/acoustics/engine/paths.mjs";
import { signal, audioMetrics } from "../src/acoustics/engine/signals.mjs";
import { fixture, demo } from "../tools/acoustics-06-scenes.mjs";

const close = (a, b, e = 1e-6) =>
  assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
function scene(surfaces = [], options = {}) {
  const i = sceneInput();
  i.bounds = { min: [-125, -30, -2], max: [125, 30, 12] };
  i.listenerAnchor = [0, 0, 1];
  i.surfaces = surfaces;
  i.validUntil = 1000000;
  for (const s of surfaces) s.validUntil = i.validUntil;
  return acousticScene(
    createTile(i),
    Object.fromEntries(
      surfaces.map((s) => [s.id, material({ reflection: [0.8, 0.8, 0.8] })]),
    ),
    { order: 0, airDbPerMetre: [0, 0, 0], ...options },
  );
}
function make(
  keys,
  {
    listener = [{ time: 0, position: [0, 0, 1] }],
    pcm = signal("tone", 3, { frequency: 1000 }),
    geometry = scene(),
  } = {},
) {
  return {
    scene: geometry,
    source: ownedSource({
      id: "motion-original",
      pcm,
      track: trajectory(keys),
    }),
    listener: trajectory(listener),
  };
}
function run(f, duration = 3, blockSize = 512) {
  return render(prepare(f.scene, [f.source], f.listener, { duration }), {
    masterGain: 1,
    blockSize,
  });
}
function frequency(x, start = 1, end = 2) {
  const crossings = [];
  for (let i = Math.floor(start * 48000) + 1; i < end * 48000; i++)
    if (x[i - 1] <= 0 && x[i] > 0)
      crossings.push(i - 1 - x[i - 1] / (x[i] - x[i - 1]));
  assert.ok(crossings.length > 100);
  return ((crossings.length - 1) * 48000) / (crossings.at(-1) - crossings[0]);
}
const direct = { id: "direct", surfaces: [] };
test("Stationary tone retains its frequency after delayed PCM rendering", () => {
  const f = make([{ time: 0, position: [50, 0, 1] }]),
    r = run(f);
  close(frequency(r.right), 1000, 0.01);
});
test("Approaching source: measured PCM matches c/(c-v), with no second Doppler shift", () => {
  const f = make([
      { time: 0, position: [100, 0, 1] },
      { time: 3, position: [10, 0, 1] },
    ]),
    r = run(f);
  close(frequency(r.right), (1000 * 343) / 313, 0.05);
  const p = solvePath(f.scene, f.source, f.listener, 1, direct);
  close(p.emissionTime, (343 - 100) / 313, 1e-9);
});
test("Departing source: measured PCM matches c/(c+v)", () => {
  const f = make([
    { time: 0, position: [10, 0, 1] },
    { time: 3, position: [100, 0, 1] },
  ]);
  close(frequency(run(f).right), (1000 * 343) / 373, 0.05);
});
test("Moving listener: measured PCM matches (c+v)/c", () => {
  const f = make([{ time: 0, position: [100, 0, 1] }], {
    listener: [
      { time: 0, position: [0, 0, 1] },
      { time: 3, position: [90, 0, 1] },
    ],
  });
  close(frequency(run(f).right), (1000 * 373) / 343, 0.05);
});
test("Flyby arrival direction, distance and retarded-time residual track motion", () => {
  const d = demo("flyby"),
    p = [1, 6, 11].map((t) =>
      solvePath(d.scene, d.source, d.listener, t, direct),
    );
  assert.ok(p[0].pan < -0.9 && p[2].pan > 0.9);
  assert.ok(p[1].distance < 7 && p[0].distance > 70 && p[2].distance > 70);
  assert.ok(p.every((x) => x.retardedResidual < 1e-7));
  assert.ok(p[1].bands[0] > p[0].bands[0] * 5);
});
test("Moving reflected path solves retarded distance, not only the direct delay", () => {
  const d = demo("flyby"),
    c = candidatePaths(d.scene).find((x) => x.id === "r:facade"),
    p = solvePath(d.scene, d.source, d.listener, 6, c);
  assert.equal(p.status, "renderable");
  close(6 - p.emissionTime, p.distance / 343, 1e-8);
  assert.ok(p.distance > 29);
  assert.ok(p.pan !== solvePath(d.scene, d.source, d.listener, 6, direct).pan);
});
test("Curved pass control interpolation has bounded delay error against per-sample geometry", () => {
  const d = demo("flyby"),
    p = prepare(d.scene, [d.source], d.listener, { duration: 13 }),
    track = p.prepared[0].tracks.find((x) => x.id === "direct");
  let worst = 0;
  for (let i = 220; i < 260; i++) {
    const a = track.entries[i],
      b = track.entries[i + 1],
      t = ((i + 0.5) * p.step) / 48000,
      exact = solvePath(d.scene, d.source, d.listener, t, direct);
    worst = Math.max(
      worst,
      Math.abs((a.emissionTime + b.emissionTime) / 2 - exact.emissionTime) *
        48000,
    );
  }
  assert.ok(worst < 0.5, `interpolation error ${worst} samples`);
});
test("Moving path output is identical across block sizes", () => {
  const f = make(
    [
      { time: 0, position: [50, 0, 1] },
      { time: 3, position: [-50, 0, 1] },
    ],
    { listener: [{ time: 0, position: [0, 5, 1] }] },
  );
  const a = run(f, 3, 256),
    b = run(f, 3, 512);
  assert.deepEqual(a.left, b.left);
  assert.deepEqual(a.right, b.right);
});
test("Missing telemetry fades to silence and returns without an unbounded step", () => {
  const f = make(
      [
        { time: 0, position: [10, 0, 1] },
        { time: 1, position: [10, 0, 1], valid: false },
        { time: 2, position: [10, 0, 1] },
      ],
      { pcm: signal("tone", 3, { frequency: 100 }) },
    ),
    r = run(f);
  assert.ok(r.right.slice(55000, 90000).every((x) => x === 0));
  assert.ok(r.right.slice(110000).some((x) => Math.abs(x) > 0.005));
  assert.ok(audioMetrics([r.left, r.right]).maximumAdjacentStep < 0.001);
});
test("A generation-labelled teleport is silenced around its discontinuity", () => {
  const f = make(
      [
        { time: 0, position: [10, 0, 1] },
        { time: 1, position: [-10, 0, 1], generation: 2 },
        { time: 3, position: [-10, 0, 1], generation: 2 },
      ],
      { pcm: signal("tone", 3, { frequency: 100 }) },
    ),
    r = run(f);
  assert.equal(pose(f.source.track, 1).valid, false);
  assert.ok(r.left.slice(48000, 49000).every((x) => x === 0));
  assert.ok(r.right.slice(48000, 49000).every((x) => x === 0));
  assert.ok(audioMetrics([r.left, r.right]).maximumAdjacentStep < 0.001);
});
test("Listener rotation changes side smoothly without inventing front/back cues", () => {
  const f = make([{ time: 0, position: [10, 0, 1] }], {
    listener: [
      { time: 0, position: [0, 0, 1] },
      { time: 1, position: [0, 0, 1], forward: [1, 0, 0] },
      { time: 2, position: [0, 0, 1], forward: [0, -1, 0] },
    ],
  });
  close(solvePath(f.scene, f.source, f.listener, 0, direct).pan, 1);
  close(solvePath(f.scene, f.source, f.listener, 1, direct).pan, 0);
  close(solvePath(f.scene, f.source, f.listener, 2, direct).pan, -1);
  assert.equal(audioMetrics([run(f).left]).nonfiniteSamples, 0);
});
test("A finite reflector appears and disappears with a bounded path gain ramp", () => {
  const wall = patch("wall", [0, -10, 4], [0, 1, 0], [1, 0, 0], [5, 4]),
    g = scene([wall], { order: 1 }),
    f = make(
      [
        { time: 0, position: [-30, 0, 1] },
        { time: 3, position: [30, 0, 1] },
      ],
      { geometry: g, pcm: signal("tone", 3, { frequency: 100 }) },
    );
  const p = prepare(f.scene, [f.source], f.listener, { duration: 3 }),
    t = p.prepared[0].tracks.find((x) => x.id === "r:wall");
  assert.ok(t.entries.some(Boolean) && t.entries.some((x) => !x));
  assert.ok(audioMetrics([render(p).left]).maximumAdjacentStep < 0.005);
});
test("Delayed reflected sound survives the end of the dry buffer", () => {
  const f = fixture("urban-street"),
    pcm = new Float32Array(4800);
  pcm[4790] = 0.2;
  const s = ownedSource({ id: "tail", pcm, track: f.track }),
    r = render(prepare(f.scene, [s], f.listener, { duration: 0.5 }));
  assert.ok(r.left.slice(4800, 10000).some((x) => Math.abs(x) > 0.0001));
  assert.ok(r.left.slice(20000).every((x) => x === 0));
});
test("Bounded processing storage is stable across repeated resets and long output", () => {
  const f = make([{ time: 0, position: [10, 0, 1] }], {
      pcm: signal("tone", 10),
    }),
    p = prepare(f.scene, [f.source], f.listener, { duration: 12 }),
    r = new PcmRenderer(p),
    left = new Float32Array(512),
    right = new Float32Array(512),
    arrays = r.paths.map((x) => x.data),
    bytes = r.ownedArrayBytes;
  for (let repeat = 0; repeat < 3; repeat++) {
    r.reset();
    while (r.position < r.frames) r.process(left, right);
    assert.equal(r.ownedArrayBytes, bytes);
    for (let i = 0; i < arrays.length; i++)
      assert.equal(r.paths[i].data, arrays[i]);
  }
  assert.equal(r.process(left, right), 0);
  assert.ok(left.every((x) => x === 0));
});
test("Unknown/expired geometry, invalid ownership and exceeded budgets fail closed", () => {
  const f = make([{ time: 0, position: [10, 0, 1] }]);
  assert.throws(() => prepare({ ...f.scene }, [f.source], f.listener));
  assert.throws(() => prepare(f.scene, [{ ...f.source }], f.listener));
  assert.throws(() =>
    trajectory([{ time: 0, position: [0, 0, 0] }], { discontinuityGuard: NaN }),
  );
  const r = new PcmRenderer(
      prepare(f.scene, [f.source], f.listener, { duration: 1 }),
    ),
    x = new Float32Array(10);
  assert.throws(() => r.process(x, x));
  assert.throws(() => r.process(x.subarray(0, 5), x.subarray(2, 7)));
  assert.throws(() => r.process(x, new Float32Array(10), 1.2));
  assert.throws(() => prepare(f.scene, Array(17).fill(f.source), f.listener));
});
test("Prepared snapshots are immutable and processing owns independent arrays", () => {
  const f = make([{ time: 0, position: [10, 0, 1] }]),
    p = prepare(f.scene, [f.source], f.listener, { duration: 1 }),
    r = new PcmRenderer(p);
  assert.throws(() => (p.prepared[0].tracks[0].entries[0].bands[0] = 99));
  const before = r.paths[0].bands[0][100];
  p.prepared[0].bands[0][100] = 99;
  close(r.paths[0].bands[0][100], before);
});
