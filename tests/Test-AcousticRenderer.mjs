import { test } from "node:test";
import assert from "node:assert/strict";
import { createTile } from "../src/acoustics/research/local-geometry.mjs";
import { solveFirstReflections } from "../src/acoustics/research/first-reflections.mjs";
import { sceneInput, patch, contextFor } from "./fixtures/acoustics-scenes.mjs";
import {
  material,
  acousticScene,
  trajectory,
  ownedSource,
} from "../src/acoustics/engine/contracts.mjs";
import {
  pathGeometry,
  solvePath,
  candidatePaths,
} from "../src/acoustics/engine/paths.mjs";
import {
  prepare,
  render,
  PcmRenderer,
  splitBands,
} from "../src/acoustics/engine/renderer.mjs";
import { signal, wav, audioMetrics } from "../src/acoustics/engine/signals.mjs";
import { fixture } from "../tools/acoustics-06-scenes.mjs";
const close = (a, b, e = 1e-7) =>
  assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
function setup({
  surfaces = [],
  position = [0, 10, 1],
  listenerPosition = [0, 0, 1],
  config = {},
  pcm = signal("impulse", 0.1, { amplitude: 0.2 }),
} = {}) {
  const input = {
    ...sceneInput(),
    surfaces,
    validUntil: 1000000,
    listenerAnchor: listenerPosition,
  };
  for (const s of surfaces) s.validUntil = input.validUntil;
  const scene = acousticScene(
    createTile(input),
    Object.fromEntries(
      surfaces.map((s) => [s.id, material({ reflection: [0.7, 0.7, 0.7] })]),
    ),
    { order: 1, airDbPerMetre: [0, 0, 0], ...config },
  );
  const listener = trajectory([{ time: 0, position: listenerPosition }]),
    source = ownedSource({
      id: "original",
      pcm,
      track: trajectory([{ time: 0, position }]),
    });
  return { scene, source, listener };
}
function output(f, duration = 0.5, options = {}) {
  return render(prepare(f.scene, [f.source], f.listener, { duration }), {
    masterGain: 1,
    ...options,
  });
}
const energy = (x) => x.reduce((s, v) => s + v * v, 0);

test("Surface expiry and unknown co-located regions cannot bypass visibility", () => {
  const i = sceneInput();
  i.validUntil = 10000;
  i.surfaces[0].validUntil = 500;
  const scene = acousticScene(createTile(i), {
      ground: material({ reflection: [0.7, 0.7, 0.7] }),
    }),
    l = trajectory([{ time: 0, position: [5, 0, 1] }]),
    s = ownedSource({
      id: "expiry",
      pcm: signal("impulse", 0.1),
      track: trajectory([{ time: 0, position: [-5, 0, 1] }]),
    });
  assert.throws(() => prepare(scene, [s], l, { duration: 1 }), /expires/);
  assert.equal(
    solvePath(scene, s, l, 1, { id: "direct", surfaces: [] }).status,
    "geometry-time-unavailable",
  );
  i.missingRegions = [
    {
      id: "unknown",
      bounds: { min: [-1, -1, 0], max: [1, 1, 2] },
      reason: "unobserved",
    },
  ];
  const g = acousticScene(createTile(i), {});
  assert.equal(pathGeometry(g, [0, 0, 1], [0, 0, 1], []).status, "unknown");
});
test("Direct 10m impulse has inverse-distance pressure and fractional time of flight", () => {
  const f = setup(),
    r = output(f),
    delay = (48000 * 10) / 343,
    k = Math.floor(delay),
    frac = delay - k;
  close(r.left[k], 0.2 * 0.1 * Math.SQRT1_2 * (1 - frac), 2e-9);
  close(r.left[k + 1], 0.2 * 0.1 * Math.SQRT1_2 * frac, 2e-9);
  close(
    r.left.reduce((a, b) => a + b, 0),
    0.2 * 0.1 * Math.SQRT1_2,
    2e-9,
  );
});
test("Near field is bounded; pressure is inverse distance, not inverse square", () => {
  for (const distance of [0.1, 1, 2, 10]) {
    const f = setup({ position: [0, distance, 1] }),
      p = solvePath(f.scene, f.source, f.listener, 0.2, {
        id: "direct",
        surfaces: [],
      });
    close(p.bands[0], 1 / Math.max(1, distance));
  }
});
test("Coincident synthetic source uses the bounded central near-field convention", () => {
  const f = setup({ position: [0, 0, 1] }),
    p = solvePath(f.scene, f.source, f.listener, 0.2, {
      id: "direct",
      surfaces: [],
    });
  close(p.distance, 0);
  close(p.bands[0], 1);
  close(p.pan, 0);
  const r = output(f);
  close(r.left[0], 0.2 * Math.SQRT1_2, 1e-8);
  assert.deepEqual(r.left, r.right);
});
test("Ground reflection matches historical solver and independent unfolded distance", () => {
  const f = fixture("open-road", { order: 1 }),
    s = ownedSource({ id: "x", pcm: signal("impulse", 0.1), track: f.track }),
    ground = f.scene.tile.surfaces[0],
    p = solvePath(f.scene, s, f.listener, 0.2, {
      id: "ground",
      surfaces: [ground],
    });
  close(p.distance, Math.sqrt(104));
  close(p.delay - 10 / 343, 0.000577372965754656, 1e-9);
  const old = solveFirstReflections(f.scene.tile, [-5, 0, 1], [5, 0, 1], {
    context: contextFor(f.scene.tile),
  });
  close(old.candidates[0].distance, p.distance);
  assert.deepEqual(p.points, [[0, 0, 0]]);
});
test("Ground PCM reflection lands at its calculated fractional arrival", () => {
  const ground = patch("ground", [0, 0, 0], [0, 0, 1], [1, 0, 0], [18, 12]),
    f = setup({
      surfaces: [ground],
      position: [-5, 0, 1],
      listenerPosition: [5, 0, 1],
    }),
    r = output(f),
    d = (Math.sqrt(104) * 48000) / 343,
    k = Math.floor(d),
    gain = (0.2 * Math.sqrt(0.7)) / Math.sqrt(104);
  close(Math.hypot(r.left[k], r.right[k]), gain * (1 - (d - k)), 2e-8);
  close(Math.hypot(r.left[k + 1], r.right[k + 1]), gain * (d - k), 2e-8);
});
test("Finite patch rejection and bounded openings agree with the reference geometry", () => {
  const s = patch("small", [10, 6, 4], [0, -1, 0], [1, 0, 0], [1, 4]),
    f = setup({
      surfaces: [s],
      position: [-5, 0, 1],
      listenerPosition: [5, 0, 1],
    });
  assert.equal(
    pathGeometry(f.scene, [-5, 0, 1], [5, 0, 1], [f.scene.tile.surfaces[0]])
      .status,
    "outside-finite-patch-or-opening",
  );
  const door = patch("door", [0, 0, 2], [1, 0, 0], [0, 1, 0], [4, 2], {
    openings: [{ min: [-1, -2], max: [1, 0] }],
  });
  const g = setup({ surfaces: [door] });
  assert.equal(
    pathGeometry(g.scene, [-5, 0, 1], [5, 0, 1], []).status,
    "clear",
  );
});
test("Two wall bounces have independently unfolded 26m length and valid points", () => {
  const f = fixture("urban-street"),
    s = f.scene.tile.surfaces,
    seq = [
      s.find((p) => p.id === "north-wall"),
      s.find((p) => p.id === "south-wall"),
    ],
    p = pathGeometry(f.scene, [-5, 0, 1], [5, 0, 1], seq);
  assert.equal(p.status, "clear");
  close(p.distance, 26);
  close(p.points[0][1], 6);
  close(p.points[1][1], -6);
  const reverse = pathGeometry(
    f.scene,
    [5, 0, 1],
    [-5, 0, 1],
    [...seq].reverse(),
  );
  close(reverse.distance, 26);
});
test("Every second-order interaction applies square-root energy loss", () => {
  const f = fixture("urban-street"),
    s = ownedSource({ id: "x", pcm: signal("impulse", 0.1), track: f.track }),
    seq = candidatePaths(f.scene).find(
      (p) => p.id === "r:north-wall>south-wall",
    ),
    p = solvePath(f.scene, s, f.listener, 0.2, seq);
  close(p.bands[0], (0.88 / 26) * 10 ** ((-0.0001 * 26) / 20), 1e-10);
});
test("Unknown geometry and unknown material never become authoritative audio paths", () => {
  const i = sceneInput();
  i.validUntil = 1000000;
  i.coverage = "partial";
  i.surfaces[0].validUntil = i.validUntil;
  const scene = acousticScene(createTile(i), {}),
    s = ownedSource({
      id: "x",
      pcm: signal("impulse", 0.1),
      track: trajectory([{ time: 0, position: [-5, 0, 1] }]),
    }),
    l = trajectory([{ time: 0, position: [5, 0, 1] }]);
  assert.equal(
    prepare(scene, [s], l, { duration: 0.5 }).prepared[0].tracks.length,
    0,
  );
});
test("Blocked path uses authored transmission, or remains unavailable without it", () => {
  const f = fixture("obstructed-corner"),
    s = ownedSource({ id: "x", pcm: signal("impulse", 0.1), track: f.track }),
    p = solvePath(f.scene, s, f.listener, 0.2, { id: "direct", surfaces: [] });
  assert.equal(p.visibility, "authored-transmission");
  assert.ok(p.bands[0] > p.bands[2] * 9);
  const no = setup({
    surfaces: [
      patch("screen", [0, 0, 3], [1, 0, 0], [0, 1, 0], [2, 3], {
        reflectiveSide: "both",
      }),
    ],
    position: [-5, 0, 1],
    listenerPosition: [5, 0, 1],
  });
  assert.equal(
    solvePath(no.scene, no.source, no.listener, 0.2, {
      id: "direct",
      surfaces: [],
    }).status,
    "blocked-no-modelled-path",
  );
});
test("Energy coefficient budgets and provenance validation reject fabricated materials", () => {
  assert.throws(() =>
    material({ reflection: [0.9, 0.9, 0.9], transmission: [0.2, 0.2, 0.2] }),
  );
  assert.throws(() => material({ reflection: [NaN, 0, 0] }));
  assert.throws(() => material({ reflection: [0, 1, 0] }));
});
test("Complementary source bands sum to input and have a bounded filter tail", () => {
  const x = signal("tone", 0.2),
    b = splitBands(x);
  for (let i = 0; i < x.length; i++)
    close(b[0][i] + b[1][i] + b[2][i], x[i], 3e-8);
  assert.equal(b[0].length, x.length + 2400);
});
test("Band losses change actual PCM and passive monotone filtering does not increase tone energy", () => {
  for (const frequency of [100, 1000, 4000]) {
    const pcm = signal("tone", 0.3, { frequency }),
      a = setup({ pcm }),
      b = setup({ pcm, config: { airDbPerMetre: [0.02, 0.2, 1] } }),
      ra = output(a),
      rb = output(b);
    assert.ok(energy(rb.left) < energy(ra.left));
  }
});
test("Source directivity changes emission gain without altering propagation timing", () => {
  const f = setup();
  f.source = ownedSource({ ...f.source, directivity: 1 });
  const p = solvePath(f.scene, f.source, f.listener, 0.2, {
    id: "direct",
    surfaces: [],
  });
  close(p.bands[0], 0);
  close(p.delay, 10 / 343);
});
test("Geometric stereo uses arrival side and listener orientation", () => {
  const f = setup({ position: [10, 0, 1] }),
    p = solvePath(f.scene, f.source, f.listener, 0.2, {
      id: "direct",
      surfaces: [],
    });
  close(p.pan, 1);
  const r = output(f);
  close(energy(r.left), 0);
  assert.ok(energy(r.right) > 0);
  f.listener = trajectory([
    { time: 0, position: [0, 0, 1], forward: [0, -1, 0] },
  ]);
  close(
    solvePath(f.scene, f.source, f.listener, 0.2, {
      id: "direct",
      surfaces: [],
    }).pan,
    -1,
  );
});
test("Block size and reset preserve sample-identical output", () => {
  const f = fixture("urban-street"),
    s = ownedSource({ id: "x", pcm: signal("burst", 0.5), track: f.track }),
    p = prepare(f.scene, [s], f.listener, { duration: 0.8 }),
    a = render(p, { blockSize: 256 }),
    b = render(p, { blockSize: 512 });
  assert.deepEqual(a.left, b.left);
  assert.deepEqual(a.right, b.right);
  const r = new PcmRenderer(p),
    l = new Float32Array(512),
    q = new Float32Array(512);
  r.process(l, q);
  const first = [...l];
  r.reset();
  r.process(l, q);
  assert.deepEqual([...l], first);
});
test("WAV is deterministic 48k stereo PCM16 with valid header and bounded samples", () => {
  const r = output(setup()),
    b = wav([r.left, r.right]);
  assert.equal(b.toString("ascii", 0, 4), "RIFF");
  assert.equal(b.readUInt16LE(22), 2);
  assert.equal(b.readUInt32LE(24), 48000);
  assert.equal(b.readUInt16LE(34), 16);
  assert.deepEqual(b, wav([r.left, r.right]));
  assert.throws(() => wav([new Float32Array([NaN])]));
  assert.equal(audioMetrics([r.left, r.right]).clippedSamples, 0);
});
test("Invalid coordinates, rates, source identities, delays and unsafe trajectories reject", () => {
  assert.throws(() =>
    createTile({ ...sceneInput(), coordinateSpace: "gta-native-unverified" }),
  );
  assert.throws(() =>
    trajectory([
      { time: 0, position: [0, 0, 0] },
      { time: 1, position: [1000, 0, 0] },
    ]),
  );
  assert.throws(() =>
    trajectory([{ time: 0, position: [0, 0, 0], velocity: [1, 0, 0] }]),
  );
  assert.throws(() => setup({ config: { soundSpeed: 0 } }));
  assert.throws(() => setup({ config: { maxDelay: 10 } }));
  const f = setup();
  assert.throws(() => prepare(f.scene, [f.source, f.source], f.listener));
});

test("Measured spectral loss matches the independent one-pole transfer function", () => {
  const coefficients = [0.02, 0.2, 1].map((db) => 10 ** ((-db * 10) / 20));
  for (const frequency of [100, 1000, 4000]) {
    const pcm = signal("tone", 0.5, { frequency }),
      a = output(setup({ pcm }), 0.6),
      b = output(
        setup({ pcm, config: { airDbPerMetre: [0.02, 0.2, 1] } }),
        0.6,
      );
    const response = (cutoff) => {
      const k = 1 - Math.exp((-2 * Math.PI * cutoff) / 48000),
        w = (2 * Math.PI * frequency) / 48000,
        re = 1 - (1 - k) * Math.cos(w),
        im = (1 - k) * Math.sin(w),
        den = re * re + im * im;
      return [(k * re) / den, (-k * im) / den];
    };
    const lo = response(400),
      hi = response(4000),
      re =
        coefficients[2] +
        (coefficients[1] - coefficients[2]) * hi[0] +
        (coefficients[0] - coefficients[1]) * lo[0],
      im =
        (coefficients[1] - coefficients[2]) * hi[1] +
        (coefficients[0] - coefficients[1]) * lo[1];
    const ratio = Math.sqrt(
      energy(b.left.slice(4800, 19200)) / energy(a.left.slice(4800, 19200)),
    );
    close(ratio, Math.hypot(re, im), 0.0001);
  }
});
test("Unrelated geometry blocks reflection legs and both bounce orders are checked", () => {
  const f = fixture("urban-street"),
    seq = candidatePaths(f.scene).filter((x) => x.surfaces.length === 2);
  for (const c of seq) {
    const p = pathGeometry(f.scene, [-5, 0, 1], [5, 0, 1], c.surfaces);
    if (p.status === "clear")
      assert.ok(p.points.every((x) => x.every(Number.isFinite)));
  }
  const s = patch("blocking", [0, 0, 3], [1, 0, 0], [0, 1, 0], [12, 3], {
      reflectiveSide: "both",
    }),
    wall = patch("wall", [0, 6, 4], [0, -1, 0], [1, 0, 0], [18, 4]),
    g = setup({ surfaces: [s, wall] });
  assert.equal(
    pathGeometry(g.scene, [-5, 0, 1], [5, 0, 1], [g.scene.tile.surfaces[1]])
      .status,
    "blocked-reflection",
  );
});
test("Emergency peak protection is linked across stereo and reports every reduction", () => {
  const f = setup({
      position: [0.5, 0.5, 1],
      pcm: new Float32Array(4800).fill(0.9),
    }),
    sources = Array.from({ length: 4 }, (_, i) =>
      ownedSource({ ...f.source, id: "headroom-" + i }),
    ),
    p = prepare(f.scene, sources, f.listener, { duration: 0.2 }),
    r = render(p, { masterGain: 1 });
  assert.ok(r.metrics.limitedFrames > 0 && r.metrics.maximumPreLimit > 1);
  assert.ok(audioMetrics([r.left, r.right]).peak <= 0.980001);
  const n = 1000;
  close(
    r.left[n] / r.right[n],
    Math.sqrt((1 - Math.SQRT1_2) / (1 + Math.SQRT1_2)),
    1e-6,
  );
});
test("Path count, simulation workload, buffer length and delay are enforced", () => {
  const f = fixture("enclosure"),
    s = ownedSource({ id: "budget", pcm: signal("tone", 0.1), track: f.track }),
    p = prepare(f.scene, [s], f.listener, { duration: 0.3 });
  assert.equal(p.prepared[0].tracks.length, 12);
  assert.ok(p.stats.prunedTracks > 0);
  const g = setup({ config: { maxDelay: 0.01 } });
  assert.equal(
    solvePath(g.scene, g.source, g.listener, 0.2, {
      id: "direct",
      surfaces: [],
    }).status,
    "delay-budget",
  );
  assert.throws(() => render(p, { blockSize: 8192 }));
  const many = Array.from({ length: 16 }, (_, i) =>
    ownedSource({ ...s, id: "budget-" + i }),
  );
  assert.throws(
    () => prepare(f.scene, many, f.listener, { duration: 60 }),
    /simulation grid budget/,
  );
});
