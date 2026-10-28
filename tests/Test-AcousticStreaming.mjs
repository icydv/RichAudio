import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { replay } from "../tools/Replay-Acoustics07.mjs";
import { createTile } from "../src/acoustics/research/local-geometry.mjs";
import { sceneInput, patch } from "./fixtures/acoustics-scenes.mjs";
import {
  acousticScene,
  material,
  trajectory,
  ownedSource,
} from "../src/acoustics/engine/contracts.mjs";
import {
  CausalSimulation,
  StreamingRenderer,
} from "../src/acoustics/streaming/causal.mjs";
import {
  rate,
  originalCase,
  offlineReference,
  incrementalReference,
  observationAt,
  toneFrequency,
  relativeDifference,
  rms,
} from "../tools/Measure-Acoustics07.mjs";

const near = (a, b, tolerance, label = "measurement") =>
  assert.ok(
    Math.abs(a - b) <= tolerance,
    `${label}: ${a} versus ${b}, tolerance ${tolerance}`,
  );
for (const name of ["stationary", "ground", "canyon", "obstruction"])
  test(`Incremental ${name} matches the unchanged complete-trajectory PCM oracle`, () => {
    const c = originalCase(name),
      offline = offlineReference(c),
      stream = incrementalReference(c);
    for (const channel of ["left", "right"])
      assert.ok(
        relativeDifference(stream[channel], offline[channel], 0.8, 3.5) < 0.001,
        `${name} ${channel} error ${relativeDifference(stream[channel], offline[channel], 0.8, 3.5)}`,
      );
  });
for (const [name, expected] of [
  ["approach", (1000 * 343) / 323],
  ["departure", (1000 * 343) / 363],
  ["moving-listener", (1000 * 363) / 343],
])
  test(`Incremental ${name} has independently predicted Doppler, without double correction`, () => {
    const c = originalCase(name),
      offline = offlineReference(c),
      stream = incrementalReference(c);
    near(toneFrequency(stream.right), expected, 0.5, "measured frequency");
    assert.ok(
      relativeDifference(stream.right, offline.right, 0.8, 3.5) < 0.05,
      `waveform error ${relativeDifference(stream.right, offline.right, 0.8, 3.5)}`,
    );
  });
test("Causal flyby retains the reference stereo movement with bounded prediction error", () => {
  const c = originalCase("flyby"),
    offline = offlineReference(c),
    stream = incrementalReference(c);
  assert.ok(
    rms(stream.left, rate * 0.8, rate * 1.2) >
      rms(stream.right, rate * 0.8, rate * 1.2),
  );
  assert.ok(
    rms(stream.right, rate * 3, rate * 3.5) >
      rms(stream.left, rate * 3, rate * 3.5),
  );
  for (const channel of ["left", "right"])
    assert.ok(
      relativeDifference(stream[channel], offline[channel], 0.8, 3.5) < 0.12,
      `${channel} error ${relativeDifference(stream[channel], offline[channel], 0.8, 3.5)}`,
    );
});
for (const name of [
  "stationary",
  "ground",
  "canyon",
  "obstruction",
  "approach",
  "departure",
  "moving-listener",
])
  test(`Evaluated 1024-frame cadence preserves the declared ${name} oracle tolerance`, () => {
    const c = originalCase(name),
      offline = offlineReference(c),
      stream = incrementalReference(c, {
        controlEveryBlocks: 2,
        observationEveryBlocks: 2,
      });
    const moving = ["approach", "departure", "moving-listener"].includes(name),
      tolerance = name === "flyby" ? 0.12 : moving ? 0.05 : 0.001;
    for (const channel of moving ? ["right"] : ["left", "right"])
      assert.ok(
        relativeDifference(stream[channel], offline[channel], 0.8, 3.5) <
          tolerance,
        `${name}/${channel}: ${relativeDifference(stream[channel], offline[channel], 0.8, 3.5)} > ${tolerance}`,
      );
    const expected = {
      stationary: 1000,
      approach: (1000 * 343) / 323,
      departure: (1000 * 343) / 363,
      "moving-listener": (1000 * 363) / 343,
    }[name];
    if (expected)
      near(
        toneFrequency(stream.right),
        expected,
        0.5,
        "measured actual-cadence frequency",
      );
  });
test("Rejected 1024-frame flyby cadence remains outside the unchanged 12-percent oracle gate", () => {
  const c = originalCase("flyby"),
    offline = offlineReference(c),
    stream = incrementalReference(c, {
      controlEveryBlocks: 2,
      observationEveryBlocks: 2,
    });
  // This records a measured unsuitable configuration. The live producer uses the validated512-frame cadence.
  assert.ok(relativeDifference(stream.left, offline.left, 0.8, 3.5) > 0.12);
});
test("Overlapping stereo output views are rejected before rendering", () => {
  for (const offset of [0, 4]) {
    const renderer = new StreamingRenderer({ sourceIds: ["s"] }),
      buffer = new ArrayBuffer(513 * 4),
      left = new Float32Array(buffer, 0, 512),
      right = new Float32Array(buffer, offset, 512);
    assert.throws(() =>
      renderer.process({ s: new Float32Array(512) }, left, right),
    );
    assert.equal(renderer.frame, 0);
  }
});
test("Output cannot overwrite unconsumed dry input through an overlapping view", () => {
  const renderer = new StreamingRenderer({ sourceIds: ["s"] }),
    buffer = new ArrayBuffer(513 * 4),
    input = new Float32Array(buffer, 0, 512),
    left = new Float32Array(buffer, 4, 512);
  assert.throws(() =>
    renderer.process({ s: input }, left, new Float32Array(512)),
  );
  assert.equal(renderer.frame, 0);
});
test("Disjoint stereo views in one allocation remain legal", () => {
  const renderer = new StreamingRenderer({ sourceIds: ["s"] }),
    buffer = new ArrayBuffer(1024 * 4);
  renderer.process(
    { s: new Float32Array(512) },
    new Float32Array(buffer, 0, 512),
    new Float32Array(buffer, 512 * 4, 512),
  );
  assert.equal(renderer.frame, 512);
});
test("A warmed incremental impulse preserves independently calculated direct and ground arrivals", () => {
  const input = sceneInput();
  input.validUntil = 1000000;
  input.surfaces = [
    patch("ground", [0, 0, 0], [0, 0, 1], [1, 0, 0], [18, 12], {
      validUntil: 1000000,
    }),
  ];
  const scene = acousticScene(
    createTile(input),
    { ground: material({ reflection: [0.7, 0.7, 0.7] }) },
    { order: 1, airDbPerMetre: [0, 0, 0] },
  );
  const pcm = new Float32Array(rate);
  pcm[rate * 0.3] = 0.2;
  const c = {
    scene,
    source: ownedSource({
      id: "impulse",
      pcm,
      track: trajectory([{ time: 0, position: [-5, 0, 1] }]),
    }),
    listener: trajectory([{ time: 0, position: [5, 0, 1] }]),
    outputSeconds: 1.3,
  };
  const r = incrementalReference(c);
  for (const [distance, coefficient] of [
    [10, 1],
    [Math.sqrt(104), Math.sqrt(0.7)],
  ]) {
    const arrival = rate * (0.3 + distance / 343),
      k = Math.floor(arrival),
      f = arrival - k,
      gain = (0.2 * coefficient) / distance;
    near(
      Math.hypot(r.left[k], r.right[k]),
      gain * (1 - f),
      2e-7,
      "first arrival sample",
    );
    near(
      Math.hypot(r.left[k + 1], r.right[k + 1]),
      gain * f,
      2e-7,
      "second arrival sample",
    );
  }
});
test("Observer rejects duplicate, out-of-order and future-relative-to-arrival observations", () => {
  const c = originalCase("stationary"),
    sim = new CausalSimulation(c.scene);
  sim.observe(observationAt(c, 0));
  assert.throws(() => sim.observe(observationAt(c, 0)));
  assert.throws(() => sim.observe(observationAt(c, -1)));
  sim.observe(observationAt(c, 1));
  assert.throws(() => sim.update(0.5));
});
test("Missing listener/source observations expire and do not extrapolate forever", () => {
  const c = originalCase("stationary"),
    r = incrementalReference(c, { stopObserving: 1 });
  assert.ok(
    r.controls
      .filter((x) => x.frame > rate * 1.5)
      .every((x) => x.paths.length === 0),
  );
  assert.ok(r.left.slice(rate * 1.6).every((x) => x === 0));
  assert.ok(r.right.slice(rate * 1.6).every((x) => x === 0));
});
test("Invalid listener state produces a bounded fade to silence", () => {
  const c = originalCase("stationary"),
    r = incrementalReference(c, {
      observation: (c, t) => {
        const x = observationAt(c, t);
        if (t >= 1) x.listener.valid = false;
        return x;
      },
    });
  assert.ok(r.right.slice(rate * 1.5).every((x) => x === 0));
  assert.ok(
    r.right.slice(rate * 0.5, rate * 0.8).some((x) => Math.abs(x) > 0.001),
  );
});
test("Stopping emission preserves already emitted sound until its actual delay expires", () => {
  const c = originalCase("stationary");
  c.source = ownedSource({ ...c.source, pcm: c.source.pcm.slice(0, rate) });
  c.outputSeconds = 2;
  const r = incrementalReference(c);
  assert.ok(
    r.right.slice(rate * 1.05, rate * 1.1).some((x) => Math.abs(x) > 0.001),
  );
  assert.ok(r.right.slice(rate * 1.5).every((x) => x === 0));
});
test("New source generation cannot replay old-generation circular PCM history", () => {
  const c = originalCase("stationary");
  c.outputSeconds = 2;
  const r = incrementalReference(c, {
    observation: (c, t) => {
      const x = observationAt(c, t);
      if (t >= 1) x.sources[0].generation = 2;
      return x;
    },
    onBlock: ({ time, input }) => {
      if (time >= 1) {
        input.fill(0);
      }
    },
  });
  assert.ok(r.right.slice(rate * 1.1).every((x) => x === 0));
});
test("A new generation cannot read samples tagged to another identity", () => {
  const renderer = new StreamingRenderer({ sourceIds: ["s"], masterGain: 1 }),
    l = new Float32Array(512),
    r = new Float32Array(512),
    input = new Float32Array(512).fill(0.1);
  renderer.process({ s: input }, l, r);
  renderer.setSourceGeneration("s", 7);
  renderer.accept({
    frame: 512,
    sourceGenerations: { s: 7 },
    paths: [
      {
        id: "s:new",
        sourceId: "s",
        generation: 7,
        emissionFrame: 0,
        rate: 1,
        bands: [1, 1, 1],
        pan: 0,
      },
    ],
  });
  input.fill(0);
  renderer.process({ s: input }, l, r);
  assert.ok(l.every((x) => x === 0));
  assert.ok(r.every((x) => x === 0));
  assert.ok(renderer.stats.missingHistory > 0);
});
test("Future divergence cannot change samples produced before that observation arrives", () => {
  const c = originalCase("stationary");
  c.outputSeconds = 2;
  const a = incrementalReference(c),
    b = incrementalReference(c, {
      observation: (c, t) => {
        const x = observationAt(c, t);
        if (t >= 1) {
          x.sources[0].position = [80, 0, 1];
          x.sources[0].generation = 2;
        }
        return x;
      },
    });
  assert.deepEqual(a.left.slice(0, rate), b.left.slice(0, rate));
  assert.deepEqual(a.right.slice(0, rate), b.right.slice(0, rate));
});
test("Repeated incremental processing is deterministic and returns finite bounded PCM", () => {
  const c = originalCase("canyon"),
    a = incrementalReference(c),
    b = incrementalReference(c);
  assert.deepEqual(a.left, b.left);
  assert.deepEqual(a.right, b.right);
  assert.ok(a.left.every(Number.isFinite));
  assert.ok(a.right.every((x) => Number.isFinite(x) && Math.abs(x) < 1));
});
test("Source and output count bounds reject unbounded processing requests", () => {
  assert.throws(
    () =>
      new StreamingRenderer({
        sourceIds: Array.from({ length: 17 }, (_, i) => "s" + i),
      }),
  );
  assert.throws(
    () => new StreamingRenderer({ sourceIds: ["duplicate", "duplicate"] }),
  );
  const r = new StreamingRenderer({ sourceIds: ["s"] });
  assert.throws(() =>
    r.process(
      { s: new Float32Array(513) },
      new Float32Array(513),
      new Float32Array(513),
      513,
    ),
  );
});
test("Declared excessive velocity and nonfinite original PCM are rejected", () => {
  const c = originalCase("stationary"),
    sim = new CausalSimulation(c.scene),
    s = observationAt(c, 0);
  s.sources[0].velocity = [101, 0, 0];
  assert.throws(() => sim.observe(s));
  const renderer = new StreamingRenderer({ sourceIds: ["s"] }),
    input = new Float32Array(512);
  input[8] = NaN;
  assert.throws(() =>
    renderer.process(
      { s: input },
      new Float32Array(512),
      new Float32Array(512),
    ),
  );
});
test("An undeclared teleport cannot be interpreted as ordinary source motion", () => {
  const c = originalCase("stationary"),
    sim = new CausalSimulation(c.scene);
  sim.observe(observationAt(c, 0));
  const next = observationAt(c, 0.01);
  next.sources[0].position = [-50, 0, 1];
  assert.throws(() => sim.observe(next));
});
test("Antipodal listener orientation requires an explicit discontinuity", () => {
  const c = originalCase("stationary"),
    sim = new CausalSimulation(c.scene);
  sim.observe(observationAt(c, 0));
  const next = observationAt(c, 0.01);
  next.listener.forward = [0, -1, 0];
  assert.throws(() => sim.observe(next));
});
test("Identical control times produce block-partition independent stationary samples", () => {
  const c = originalCase("stationary"),
    a = incrementalReference(c),
    b = incrementalReference(c, { blockSize: 256, controlEveryBlocks: 2 });
  assert.deepEqual(a.left, b.left);
  assert.deepEqual(a.right, b.right);
});
test("The audio processor rejects controls from future output frames", () => {
  const renderer = new StreamingRenderer({ sourceIds: ["s"] });
  assert.throws(() => renderer.accept({ frame: 512, paths: [] }));
});
test("Missing control updates independently fade output even when dry PCM continues", () => {
  const c = originalCase("stationary");
  c.outputSeconds = 2;
  const r = incrementalReference(c, {
    controlEveryBlocks: 999,
    onBlock: ({ time, renderer, simulation }) => {
      if (time >= 0.4 && time < 0.41) renderer.accept(simulation.update(time));
    },
  });
  assert.ok(
    r.right.slice(rate * 0.42, rate * 0.48).some((x) => Math.abs(x) > 0.001),
  );
  assert.ok(r.right.slice(rate * 1.2).every((x) => x === 0));
});
test("Invalid session replacement cannot erase previously valid acoustic history", () => {
  const c = originalCase("stationary"),
    sim = new CausalSimulation(c.scene);
  sim.observe(observationAt(c, 0));
  const before = sim.update(0),
    bad = observationAt(c, 0.01);
  bad.session = "invalid-new-session";
  bad.listener.position = [NaN, 0, 0];
  assert.throws(() => sim.observe(bad));
  assert.deepEqual(sim.update(0).sourceGenerations, before.sourceGenerations);
});
test("Session and source generation pairs cannot alias the same PCM history identity", () => {
  const c = originalCase("stationary"),
    sim = new CausalSimulation(c.scene),
    first = observationAt(c, 0);
  first.sources[0].generation = 100001;
  try {
    sim.observe(first);
  } catch (error) {
    assert.match(error.message, /generation/);
    return;
  } // A declared generation bound is also safe.
  const oldIdentity = sim.update(0).sourceGenerations[c.source.id];
  const next = observationAt(c, 0.01);
  next.session = "different-session";
  sim.observe(next);
  assert.notEqual(sim.update(0.01).sourceGenerations[c.source.id], oldIdentity);
});
test("Listener rotation changes geometric stereo direction without changing source pitch", () => {
  const c = originalCase("stationary");
  c.outputSeconds = 2.5;
  const r = incrementalReference(c, {
    observation: (c, t) => {
      const x = observationAt(c, t);
      if (t >= 1) x.listener.forward = [1, 0, 0];
      return x;
    },
  });
  assert.ok(
    rms(r.right, 0.5 * rate, 0.8 * rate) >
      100 * rms(r.left, 0.5 * rate, 0.8 * rate),
  );
  near(
    rms(r.left, 1.5 * rate, 2 * rate),
    rms(r.right, 1.5 * rate, 2 * rate),
    1e-7,
    "rotated centre balance",
  );
  near(
    toneFrequency(r.right, 1.5, 2),
    1000,
    0.5,
    "orientation does not shift pitch",
  );
});
test("Game pause suppresses paths without silently redefining the source clock", () => {
  const c = originalCase("stationary");
  c.outputSeconds = 2;
  const r = incrementalReference(c, {
    observation: (c, t) => ({ ...observationAt(c, t), paused: t >= 1 }),
  });
  assert.ok(
    r.controls
      .filter((x) => x.frame >= 1.5 * rate)
      .every((x) => x.paths.length === 0),
  );
  assert.ok(r.right.slice(rate * 1.5).every((x) => x === 0));
});
test("Maximum accepted observation cadence retains the declared history window", () => {
  const c = originalCase("stationary"),
    sim = new CausalSimulation(c.scene);
  for (let i = 0; i <= 720; i++) sim.observe(observationAt(c, i / 240));
  assert.ok(sim.records.length <= 1024);
  assert.ok(sim.records[0].time <= 0.5 && sim.records[1].time >= 0.5 - 1 / 240);
  assert.equal(sim.records.at(-1).time, 3);
  assert.ok(sim.update(3).paths.length > 0);
});
test("Excessive observation cadence is rejected without erasing accepted history", () => {
  const c = originalCase("stationary"),
    sim = new CausalSimulation(c.scene);
  sim.observe(observationAt(c, 0));
  assert.throws(() => sim.observe(observationAt(c, 0.001)));
  assert.equal(sim.records.length, 1);
  assert.equal(sim.records[0].time, 0);
});
function removeOriginalFixture(root) {
  assert.equal(path.dirname(root), os.tmpdir());
  assert.ok(path.basename(root).startsWith("richaudio-a07-replay-"));
  fs.rmSync(root, { recursive: true });
}
test("Incremental replay produces deterministic stereo PCM and preserves existing outputs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "richaudio-a07-replay-"));
  try {
    const first = replay(root, ".local/a", ["open-road", "flyby"]),
      second = replay(root, ".local/b", ["open-road", "flyby"]);
    for (let i = 0; i < first.cases.length; i++) {
      const a = first.cases[i],
        b = second.cases[i],
        bytes = fs.readFileSync(path.join(root, ".local/a", a.filename));
      assert.equal(a.sha256, b.sha256);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
      assert.equal(bytes.readUInt16LE(20), 1);
      assert.equal(bytes.readUInt16LE(22), 2);
      assert.equal(bytes.readUInt32LE(24), 48000);
      assert.equal(bytes.length, 44 + a.frames * 4);
      assert.equal(a.metrics.nonfiniteSamples, 0);
      assert.equal(a.metrics.clippedSamples, 0);
      assert.ok(a.metrics.rms > 0);
    }
    assert.throws(() => replay(root, ".local/a", ["open-road"]), /Fresh/);
    assert.equal(
      createHash("sha256")
        .update(
          fs.readFileSync(path.join(root, ".local/a", first.cases[0].filename)),
        )
        .digest("hex"),
      first.cases[0].sha256,
    );
  } finally {
    removeOriginalFixture(root);
  }
});
test("Replay rejects public paths and invalid or duplicate scene requests", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "richaudio-a07-replay-"));
  try {
    assert.throws(() => replay(root, "public", ["open-road"]), /private/);
    assert.throws(
      () => replay(root, ".local/a", ["open-road", "open-road"]),
      /Bounded/,
    );
    assert.throws(
      () => replay(root, ".local/a", ["invented-scene"]),
      /Bounded/,
    );
    assert.equal(fs.readdirSync(root).length, 0);
  } finally {
    removeOriginalFixture(root);
  }
});
test("Replay rejects linked private destinations without writing through them", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "richaudio-a07-replay-")),
    outside = fs.mkdtempSync(path.join(os.tmpdir(), "richaudio-a07-replay-"));
  try {
    fs.mkdirSync(path.join(root, ".local"));
    fs.symlinkSync(
      outside,
      path.join(root, ".local/link"),
      process.platform === "win32" ? "junction" : "dir",
    );
    assert.throws(
      () => replay(root, ".local/link/new", ["open-road"]),
      /linked/,
    );
    assert.equal(fs.readdirSync(outside).length, 0);
  } finally {
    removeOriginalFixture(root);
    removeOriginalFixture(outside);
  }
});
