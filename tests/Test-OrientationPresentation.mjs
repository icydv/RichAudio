import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  orientationCases,
  orientationEvents,
} from "../tools/audio/orientation-fixtures.mjs";
import { compareOrientationPair } from "../tools/audio/orientation-measurements.mjs";
import { wav } from "../src/acoustics/engine/signals.mjs";
import { OrientationPresentation } from "../src/acoustics/streaming/orientation-presentation.mjs";
import { ListenerPlayout } from "../src/acoustics/streaming/listener-playout.mjs";
import {
  listenerMessage,
  runHeadless,
  sequence,
} from "../tools/audio/headless-stream.mjs";
function setup() {
  const reference = new ListenerPlayout(),
    candidate = new OrientationPresentation();
  let seq = 0;
  return {
    reference,
    candidate,
    add(t, yaw = 0, other = {}) {
      const m = listenerMessage(t, seq++, {
        forward: [-Math.cos(yaw), -Math.sin(yaw), 0],
        ...other,
      });
      reference.add(m, t, t * 1000);
      candidate.add(m, t, t * 1000);
    },
    select(t) {
      const b = reference.sample(t, t * 1000);
      return {
        selection: candidate.select(
          b,
          reference,
          Math.round(t * 48000),
          t * 1000,
        ),
        context: b.state,
      };
    },
  };
}
const control = (frame) => ({
  frame,
  sourceGenerations: { beacon: 4294967297 },
  paths: [
    {
      id: "direct",
      sourceId: "beacon",
      generation: 4294967297,
      order: 0,
      emissionFrame: frame - 1400,
      rate: 1,
      delay: 10 / 343,
      distance: 10,
      bands: [0.1, 0.09, 0.08],
      pan: 0,
      arrivalDirection: [-1, 0, 0],
    },
    {
      id: "reflection",
      sourceId: "beacon",
      generation: 4294967297,
      order: 1,
      emissionFrame: frame - 1800,
      rate: 1,
      delay: 1800 / 48000,
      distance: 12.8625,
      bands: [0.06, 0.04, 0.02],
      pan: 0,
      arrivalDirection: [0, 1, 0],
    },
  ],
});
test("Only pan changes, with each reflected arrival projected independently", () => {
  const s = setup();
  for (const t of [0, 0.05, 0.1, 0.15, 0.2]) s.add(t, t * 3);
  const { selection, context } = s.select(0.2),
    c = control(9600),
    r = s.candidate.present(c, selection, 200, context);
  assert.equal(r.diagnostic.selectionMode, "faster-50");
  assert.equal(r.diagnostic.mode, "interpolated");
  assert.ok(Math.abs(r.control.paths[0].pan - Math.sin(0.45)) < 1e-12);
  assert.ok(Math.abs(r.control.paths[1].pan - Math.cos(0.45)) < 1e-12);
  assert.deepEqual(
    r.control.paths.map(({ pan, ...p }) => p),
    c.paths.map(({ pan, ...p }) => p),
  );
  assert.equal(c.paths[0].pan, 0);
});
test("Held orientation reports the observation's real age without angular extrapolation", () => {
  const s = setup();
  for (const t of [0, 0.05, 0.1]) s.add(t, t * 3);
  const { selection } = s.select(0.16);
  assert.equal(selection.diagnostic.mode, "held");
  assert.equal(selection.diagnostic.actualTime, 0.1);
  assert.ok(Math.abs(selection.diagnostic.ageSeconds - 0.06) < 1e-12);
  assert.deepEqual(
    selection.state.forward,
    s.candidate.history.records.at(-1).state.forward,
  );
});
test("Faster expiry falls back only to valid buffered orientation and retains its older timestamp", () => {
  const s = setup();
  for (const t of [0, 0.05, 0.1]) s.add(t, t * 3);
  const { selection, context } = s.select(0.21),
    r = s.candidate.present(control(10080), selection, 210, context);
  assert.equal(r.diagnostic.selectionMode, "buffered-fallback");
  assert.equal(r.diagnostic.fastUnavailableReason, "prediction-expired");
  assert.equal(r.diagnostic.actualTime, 0.1);
  assert.ok(Math.abs(r.diagnostic.ageSeconds - 0.11) < 1e-12);
  assert.equal(s.candidate.stats.fallbackFrames, 512);
  assert.equal(s.select(0.36).selection.state, null);
});
test("New invalid or paused observations override older valid orientation", () => {
  for (const flags of [
    { valid: false, reason: "unavailable" },
    { paused: true },
  ]) {
    const s = setup();
    for (const t of [0, 0.05, 0.1]) s.add(t);
    const frozen = s.select(0.11);
    s.add(0.12, 0, flags);
    const r = s.candidate.present(
      control(5280),
      frozen.selection,
      120,
      frozen.context,
    );
    assert.equal(r.muteBlock, true);
    assert.equal(r.diagnostic.selectionMode, "boundary-invalidated");
    assert.equal(s.select(0.12).selection.state, null);
  }
});
test("Generation/session changes cannot present new orientation on an outstanding old control", () => {
  for (const other of [{ generation: 2 }, { session: "b".repeat(32) }]) {
    const s = setup();
    for (const t of [0, 0.05, 0.1]) s.add(t);
    const frozen = s.select(0.11);
    s.add(0.12, 1, other);
    assert.equal(
      s.candidate.present(control(5280), frozen.selection, 120, frozen.context)
        .muteBlock,
      true,
    );
  }
});
test("Wrong control context, future frame or expired receipt suppresses presentation", () => {
  const s = setup();
  for (const t of [0, 0.05, 0.1]) s.add(t);
  const x = s.select(0.11);
  assert.equal(
    s.candidate.present(control(5280), x.selection, 110, {
      ...x.context,
      generation: 2,
    }).muteBlock,
    true,
  );
  assert.equal(
    s.candidate.present(control(5792), x.selection, 110, x.context).muteBlock,
    true,
  );
  assert.equal(
    s.candidate.present(control(5280), x.selection, 351, x.context).muteBlock,
    true,
  );
  s.add(0.3);
  assert.equal(
    s.candidate.present(control(5280), x.selection, 370, x.context).muteBlock,
    true,
    "Fresh later messages cannot refresh a frozen stale selection",
  );
});
test("Same-generation observations received during handoff wait until the next selection", () => {
  const s = setup();
  for (const t of [0, 0.05, 0.1]) s.add(t);
  const x = s.select(0.11);
  s.add(0.12, 1);
  const r = s.candidate.present(control(5280), x.selection, 120, x.context);
  assert.equal(r.muteBlock, false);
  assert.equal(r.control.paths[0].pan, 0);
  assert.ok(r.diagnostic.observationTimes.every((t) => t <= 0.1));
  assert.ok(s.select(0.17).selection.state.forward[1] < -0.5);
});
test("Near-180-degree orientation and representation changes still reject without a generation", () => {
  const s = setup();
  s.add(0);
  assert.throws(() => s.add(0.05, Math.PI), /discontinuity/);
  const p = new OrientationPresentation();
  p.add(listenerMessage(0, 0), 0, 0);
  assert.throws(
    () =>
      p.add(
        listenerMessage(0.05, 1, {
          coordinates: "gta-native-unscaled",
          units: "native-unverified",
        }),
        0.05,
        50,
      ),
    /representation/,
  );
});
test("Actual default and experimental fixed-orientation PCM remain identical", async () => {
  const a = await runHeadless(),
    b = await runHeadless({
      extraArgs: ["--experimental-orientation", "50ms"],
    });
  assert.deepEqual(a.left, b.left);
  assert.deepEqual(a.right, b.right);
  assert.equal(b.final.dsp.missingHistory, 0);
  assert.equal(b.final.dsp.limited, 0);
  assert.deepEqual(
    a.trace.map((t) => t.spatialFingerprint),
    b.trace.map((t) => t.spatialFingerprint),
  );
});
test("Experiment refuses any non-100 ms spatial setting or unsupported orientation delay", async () => {
  await assert.rejects(
    runHeadless({
      delayMs: 75,
      extraArgs: ["--experimental-orientation", "50ms"],
    }),
  );
  await assert.rejects(
    runHeadless({ extraArgs: ["--experimental-orientation", "75ms"] }),
  );
});
test("Actual outstanding worker result is muted on generation or invalid-state replacement", async () => {
  for (const replacement of [
    { generation: 2 },
    { valid: false, reason: "unavailable" },
  ]) {
    const frame = 73728,
      time = frame / 48000,
      events = sequence("stationary", 2);
    for (const e of events)
      if (e.observation >= 1.55) {
        e.message.state.sequence += 1000;
        if (replacement.generation) e.message.state.generation = 2;
        else Object.assign(e.message.state, replacement);
      }
    const message = listenerMessage(time, 999, replacement),
      r = await runHeadless({
        seconds: 2,
        events,
        extraArgs: [
          "--experimental-orientation",
          "50ms",
          "--headless-barrier-frame",
          String(frame),
        ],
        boundaryMessages: [{ frame, message }],
      });
    const t = r.trace.find((t) => t.frame === frame);
    assert.equal(r.exitCode, 0);
    assert.equal(t.orientation.selectionMode, "boundary-invalidated");
    assert.equal(t.presentationMuted, true);
    assert.ok(r.left.slice(frame, frame + 512).every((x) => x === 0));
  }
});
test("Terminal Stop during actual worker handoff submits no later PCM", async () => {
  const frame = 73728,
    r = await runHeadless({
      seconds: 2,
      extraArgs: [
        "--experimental-orientation",
        "50ms",
        "--headless-barrier-frame",
        String(frame),
      ],
      boundaryMessages: [
        { frame, message: { type: "control", command: "stop" } },
      ],
    });
  assert.equal(r.exitCode, 0);
  assert.equal(r.left.length, frame);
  assert.equal(r.final.frames, frame);
});
test("Source emission tails remain identical; terminal producer failure never rearms", async () => {
  for (const name of ["emission-stop", "failure"]) {
    const a = await runHeadless({ name }),
      b = await runHeadless({
        name,
        extraArgs: ["--experimental-orientation", "50ms"],
      });
    assert.deepEqual(a.left, b.left);
    assert.deepEqual(a.right, b.right);
    assert.equal(a.exitCode, b.exitCode);
    if (name === "failure") assert.equal(b.exitCode, 1);
  }
});
test("Frozen 24-case matrix preserves PR51 default PCM and passes the declared comparison rules", async () => {
  const expected = JSON.parse(
    fs.readFileSync(
      new URL(
        "./fixtures/orientation-reference-fingerprints.json",
        import.meta.url,
      ),
    ),
  );
  for (const c of orientationCases) {
    const options = {
      events: orientationEvents(c),
      scene: c.scene ?? "open-road",
      sources: c.sources ?? 1,
    };
    const a = await runHeadless(options),
      b = await runHeadless({
        ...options,
        extraArgs: ["--experimental-orientation", "50ms"],
      });
    assert.equal(
      createHash("sha256")
        .update(wav([a.left, a.right]))
        .digest("hex"),
      expected.results.find((x) => x.name === c.name).sha256,
      c.name + " historical default",
    );
    assert.deepEqual(compareOrientationPair(c, a, b).issues, [], c.name);
    if (c.name === "reflected-turn") {
      const block = b.trace.find(
        (t) => t.frame > 48000 && t.pathPresentation.some((p) => p.order === 1),
      );
      const direct = block.pathPresentation.find((p) => p.order === 0),
        reflected = block.pathPresentation.filter((p) => p.order === 1);
      assert.ok(
        reflected.some((p) => Math.abs(p.pan - direct.pan) > 0.1),
        "Real wall paths must not all share the source bearing",
      );
    }
  }
});
