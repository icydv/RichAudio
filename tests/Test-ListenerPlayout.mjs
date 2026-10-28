import { test } from "node:test";
import assert from "node:assert/strict";
import { ListenerPlayout } from "../src/acoustics/streaming/listener-playout.mjs";
import {
  CausalSimulation,
  StreamingRenderer,
} from "../src/acoustics/streaming/causal.mjs";
import { fixture } from "../tools/acoustics-06-scenes.mjs";

const near = (actual, expected, tolerance = 1e-10) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} versus ${expected}`,
  );
function message(time, sequence, overrides = {}, lag = 0) {
  return {
    type: "listener",
    receiptAgeMs: lag * 1000,
    state: {
      version: 1,
      session: "a".repeat(32),
      generation: 1,
      sequence,
      observationTicks: 10000000 + Math.round(time * 10000000),
      clockFrequency: 10000000,
      gameTimeMs: Math.round(time * 1000),
      position: [time * 4, 0, 1],
      velocity: [4, 0, 0],
      forward: [0, 1, 0],
      up: [0, 0, 1],
      listenerKind: "synthetic",
      velocityKind: "authored-synthetic",
      paused: false,
      valid: true,
      reason: "valid",
      coordinates: "research-rh-z-up-metres-v1",
      units: "metres",
      sourceId: null,
      ...overrides,
    },
  };
}
function add(playout, time, sequence, overrides = {}, lag = 0) {
  return playout.add(
    message(time, sequence, overrides, lag),
    time + lag,
    (time + lag) * 1000,
  );
}

test("Listener playout has an explicit 100 ms control delay and unchanged 50 ms forecast ceiling", () => {
  const p = new ListenerPlayout();
  assert.equal(p.delay, 0.1);
  assert.equal(p.extrapolation, 0.05);
  const empty = p.sample(0.2, 200);
  assert.equal(empty.state, null);
  assert.equal(empty.mode, "missing");
  add(p, 0.1, 0);
  const warming = p.sample(0.15, 150);
  assert.equal(warming.state, null);
  assert.equal(warming.mode, "warming");
  const exact = p.sample(0.2, 200);
  assert.equal(exact.mode, "exact");
  near(exact.targetTime, 0.1);
  near(exact.state.position[0], 0.4);
  assert.equal(exact.playoutSeconds, 0.1);
});
test("Already received brackets reconstruct an independent linear trajectory at the retrospective timestamp", () => {
  const p = new ListenerPlayout();
  add(p, 0, 0);
  add(p, 0.05, 1);
  const result = p.sample(0.125, 125);
  assert.equal(result.mode, "interpolated");
  near(result.targetTime, 0.025);
  near(result.state.position[0], 0.1);
  assert.deepEqual(result.state.velocity, [4, 0, 0]);
  near(result.extrapolationSeconds, 0);
  assert.notEqual(
    result.state.position[0],
    0.125 * 4,
    "control latency must not become undisclosed present-time position",
  );
});
test("Orientation interpolation stays unit length and orthogonal", () => {
  const p = new ListenerPlayout();
  add(p, 0, 0);
  add(p, 0.05, 1, { forward: [1, 0, 0] });
  const state = p.sample(0.125, 125).state;
  near(state.forward[0], Math.SQRT1_2);
  near(state.forward[1], Math.SQRT1_2);
  near(Math.hypot(...state.forward), 1);
  near(Math.hypot(...state.up), 1);
  near(
    state.forward.reduce(
      (sum, value, index) => sum + value * state.up[index],
      0,
    ),
    0,
  );
});
test("No future bracket is invented and prediction stops at its existing 50 ms bound", () => {
  const p = new ListenerPlayout();
  add(p, 1, 0);
  const limited = p.sample(1.149, 1149);
  assert.equal(limited.mode, "predicted");
  near(limited.extrapolationSeconds, 0.049);
  near(limited.state.position[0], 4.196);
  const expired = p.sample(1.151, 1151);
  assert.equal(expired.state, null);
  assert.equal(expired.mode, "prediction-expired");
});
test("Receipt age and wall-clock freshness remain independent from presentation time", () => {
  const p = new ListenerPlayout();
  add(p, 1, 0, {}, 0.02);
  near(p.records[0].time, 1);
  near(p.sample(1.1, 1100).targetTime, 1);
  const stale = p.sample(1.1, 1251);
  assert.equal(stale.mode, "stale-wall-clock");
  assert.equal(stale.state, null);
  const backwards = p.sample(1.1, 1019);
  assert.equal(backwards.mode, "clock-invalid");
});
test("An old first observation cannot be relabelled fresh", () => {
  const p = new ListenerPlayout();
  p.add(message(0, 0, {}, 0.2), 0, 0);
  near(p.records[0].time, -0.2);
  const result = p.sample(0, 0);
  assert.equal(result.state, null);
  assert.equal(result.mode, "prediction-expired");
});
test("20 Hz snapshots with bounded variable delivery delay cover every 512-frame playout update after startup", () => {
  const p = new ListenerPlayout(),
    deliveries = [],
    variations = [0, 0.003, 0.017, 0.007, 0.028, 0.001, 0.019, 0.005];
  for (let sequence = 0; sequence <= 62; sequence++) {
    const time = sequence / 20,
      lag = 0.012 + variations[sequence % variations.length],
      yaw = time * 0.2;
    deliveries.push({
      sequence,
      time,
      lag,
      arrival: time + lag,
      forward: [-Math.sin(yaw), Math.cos(yaw), 0],
    });
  }
  let delivered = 0,
    checked = 0;
  for (let frame = 0; frame <= 48000 * 3; frame += 512) {
    const time = frame / 48000;
    while (
      delivered < deliveries.length &&
      deliveries[delivered].arrival <= time
    ) {
      const d = deliveries[delivered++];
      add(p, d.time, d.sequence, { forward: d.forward }, d.lag);
    }
    const result = p.sample(time, time * 1000);
    if (time < 0.11) continue;
    assert.ok(result.state, `unexpected gap at frame ${frame}: ${result.mode}`);
    assert.ok(
      ["interpolated", "exact"].includes(result.mode),
      "received brackets suffice without forecasting",
    );
    near(result.state.position[0], (time - 0.1) * 4);
    near(result.state.forward[0], -Math.sin((time - 0.1) * 0.2), 1e-6);
    assert.ok(
      p.records.every((record) => record.time <= time),
      "no future observation was supplied",
    );
    checked++;
  }
  assert.ok(checked > 250);
  assert.equal(p.stats.predicted, 0);
  assert.ok(p.stats.interpolated > 250);
});
test("A large missing observation interval is not filled with invented motion", () => {
  const p = new ListenerPlayout();
  add(p, 0, 0);
  add(p, 0.3, 1);
  const gap = p.sample(0.35, 350);
  assert.equal(gap.state, null);
  assert.equal(gap.mode, "observation-gap");
});

test("Jitter-buffered 20 Hz state remains continuous through actual causal PCM processing", () => {
  const playout = new ListenerPlayout(),
    simulation = new CausalSimulation(fixture("open-road").scene);
  const renderer = new StreamingRenderer({ sourceIds: ["beacon"] });
  const input = new Float32Array(512).fill(0.08),
    left = new Float32Array(512),
    right = new Float32Array(512);
  const source = {
    id: "beacon",
    generation: 1,
    position: [-5, 0, 1],
    velocity: [0, 0, 0],
    forward: [1, 0, 0],
    up: [0, 0, 1],
    valid: true,
  };
  const delays = [0.012, 0.015, 0.029, 0.019, 0.04, 0.013, 0.031, 0.017];
  let sequence = 0,
    checked = 0;
  for (let frame = 0; frame < 3 * 48000; frame += 512) {
    const time = frame / 48000;
    while (sequence / 20 + delays[sequence % delays.length] <= time) {
      add(
        playout,
        sequence / 20,
        sequence,
        {},
        delays[sequence % delays.length],
      );
      sequence++;
    }
    const sampled = playout.sample(time, time * 1000),
      listener = sampled.state ?? {
        position: [0, 0, 1],
        velocity: [0, 0, 0],
        forward: [0, 1, 0],
        up: [0, 0, 1],
        generation: 1,
      };
    simulation.observe({
      time,
      session: "continuity-probe",
      generation: 1,
      listener: { ...listener, valid: Boolean(sampled.state) },
      sources: [source],
    });
    renderer.accept(simulation.update(time));
    renderer.process({ beacon: input }, left, right);
    if (time < 0.4) continue;
    // Positive original DC is deliberate here: its zero-output frames cannot be natural tone zero crossings.
    for (let i = 0; i < 512; i++) {
      assert.ok(
        left[i] + right[i] > 1e-5,
        `unexpected PCM hole at ${frame + i}`,
      );
      checked++;
    }
  }
  assert.ok(checked > 120000);
  assert.equal(renderer.stats.limited, 0);
  assert.equal(renderer.stats.pathOverflow, 0);
});
test("Newest pause or invalid observation makes old playable state unavailable immediately", () => {
  for (const flags of [
    { paused: true },
    { valid: false, reason: "unavailable" },
  ]) {
    const p = new ListenerPlayout();
    add(p, 0, 0);
    add(p, 0.05, 1, flags);
    const result = p.sample(0.1, 100);
    assert.equal(result.state, null);
    assert.equal(result.mode, "invalid-or-paused");
  }
});
test("Session and generation changes clear interpolation history instead of blending identities", () => {
  for (const identity of [{ session: "b".repeat(32) }, { generation: 2 }]) {
    const p = new ListenerPlayout();
    add(p, 0, 0);
    add(p, 0.05, 1);
    add(p, 0.1, 2, { ...identity, position: [100, 0, 1] });
    assert.equal(p.records.length, 1);
    assert.equal(p.stats.resets, 2);
    assert.equal(p.sample(0.15, 150).state, null);
    near(p.sample(0.2, 200).state.position[0], 100);
  }
});
test("Position and antipodal orientation discontinuities require generation changes", () => {
  for (const change of [
    { position: [999, 0, 1] },
    { forward: [0, -1, 0] },
    { up: [0, 0, -1] },
  ]) {
    const p = new ListenerPlayout();
    add(p, 0, 0);
    assert.throws(() => add(p, 0.05, 1, change));
    assert.equal(p.records.length, 1);
    add(p, 0.05, 1, { ...change, generation: 2 });
    assert.equal(p.records.length, 1);
  }
});
test("Coordinate representation and listener identity changes cannot hide behind one generation", () => {
  for (const change of [
    { coordinates: "gta-native-unscaled", units: "native-unverified" },
    { listenerKind: "camera" },
  ]) {
    const p = new ListenerPlayout();
    add(p, 0, 0);
    assert.throws(() => add(p, 0.05, 1, change));
    assert.equal(p.stats.accepted, 1);
    add(p, 0.05, 1, { ...change, generation: 2 });
    assert.equal(p.stats.resets, 2);
  }
});
test("Mapped receipt clock reversal and host clock reversal fail before altering history", () => {
  const p = new ListenerPlayout();
  add(p, 0.1, 0);
  assert.throws(() => p.add(message(0.15, 1, {}, 0.1), 0.15, 150));
  assert.throws(() => p.add(message(0.15, 1), 0.15, 99));
  assert.equal(p.records.length, 1);
  assert.equal(p.stats.accepted, 1);
});
test("Equal mapped time permits only equivalent pose coalescing", () => {
  const p = new ListenerPlayout();
  add(p, 0.1, 0);
  p.add(message(0.15, 1, { position: [0.4, 0, 1] }, 0.05), 0.15, 150);
  assert.equal(p.records.length, 1);
  assert.equal(p.stats.coalesced, 1);
  assert.throws(() =>
    p.add(message(0.2, 2, { position: [100, 0, 1] }, 0.1), 0.2, 200),
  );
  assert.equal(p.records.length, 1);
  near(p.records[0].state.position[0], 0.4);
});
test("Retention stays bounded and malformed clocks are rejected", () => {
  const p = new ListenerPlayout();
  for (let i = 0; i < 300; i++) add(p, i / 20, i);
  assert.ok(p.records.length <= 128);
  assert.ok(p.records.at(-1).time - p.records[0].time <= 2.6);
  assert.throws(() => p.sample(NaN, 0));
  assert.throws(() => p.sample(1, -1));
  assert.throws(() => p.add(message(15, 300), Infinity, 15000));
});
test("Unavailable warmup pose to first valid distant pose does not invent a movement velocity or Doppler spike", () => {
  const simulation = new CausalSimulation(fixture("open-road").scene);
  const source = {
    id: "beacon",
    position: [-5, 0, 1],
    velocity: [0, 0, 0],
    forward: [1, 0, 0],
    up: [0, 0, 1],
    generation: 1,
    valid: true,
  };
  const listener = {
    position: [0, 0, 1],
    velocity: [0, 0, 0],
    forward: [-1, 0, 0],
    up: [0, 0, 1],
    generation: 1,
    valid: false,
  };
  simulation.observe({
    time: 0,
    session: "synthetic",
    generation: 1,
    listener,
    sources: [source],
  });
  let control;
  for (let i = 1; i <= 20; i++) {
    const time = i / 100;
    simulation.observe({
      time,
      session: "synthetic",
      generation: 1,
      listener: { ...listener, position: [20, 0, 1], valid: true },
      sources: [source],
    });
    control = simulation.update(time);
  }
  assert.ok(control.paths.length >= 1);
  for (const path of control.paths) near(path.rate, 1, 1e-9);
  const direct = control.paths.find((path) => path.order === 0);
  assert.ok(direct);
  near(direct.delay, 25 / 343, 1e-9);
});
