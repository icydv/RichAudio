import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ListenerPlayout } from "../src/acoustics/streaming/listener-playout.mjs";
import { StartupGate } from "../src/acoustics/streaming/startup-gate.mjs";
import {
  CausalSimulation,
  StreamingRenderer,
} from "../src/acoustics/streaming/causal.mjs";
import { fixture } from "../tools/acoustics-06-scenes.mjs";
import {
  runHeadless,
  measure,
  listenerMessage,
  sequence,
} from "../tools/audio/headless-stream.mjs";
const hash = (r) =>
  createHash("sha256")
    .update(Buffer.from(r.left.buffer))
    .update(Buffer.from(r.right.buffer))
    .digest("hex");

test("Intentional idle does not consume priming's deadline before emission is requested", async () => {
  const events = sequence("stationary", 4);
  events.push({ receipt: 3, message: { type: "control", command: "start" } });
  events.sort((a, b) => a.receipt - b.receipt);
  const r = await runHeadless({ autoStart: false, events });
  assert.equal(r.exitCode, 0);
  assert.ok(r.left.slice(0, 3 * 48000).every((x) => x === 0));
  assert.ok(r.left.slice(3.2 * 48000).some((x) => Math.abs(x) > 0.001));
  assert.ok(r.trace.some((t) => t.frame > 2.5 * 48000 && t.startup === "idle"));
});
test("Only three experimental presentation policies; freshness and prediction do not change", () => {
  for (const ms of [100, 75, 50]) {
    const p = new ListenerPlayout({ delayMs: ms });
    assert.equal(p.delay, ms / 1000);
    assert.equal(p.extrapolation, 0.05);
    p.add(listenerMessage(0, 0), 0, 0);
    assert.equal(p.sample(0.31, 310).mode, "stale-wall-clock");
    assert.equal(p.sample(0.2, 200).mode, "prediction-expired");
  }
  for (const ms of [0, 49, 51, 101, NaN])
    assert.throws(() => new ListenerPlayout({ delayMs: ms }));
});
test("Source PCM identity is known during invalid-listener warmup", () => {
  const sim = new CausalSimulation(fixture("open-road").scene);
  sim.observe({
    time: 0,
    session: "original",
    generation: 1,
    listener: { position: [5, 0, 1], valid: false },
    sources: [{ id: "beacon", position: [-5, 0, 1] }],
  });
  const c = sim.update(0);
  assert.equal(c.paths.length, 0);
  assert.equal(c.sourceGenerations.beacon, 4294967297);
});
test("Priming has a fixed deadline, linear fade and advances output time without altering source history", () => {
  const g = new StartupGate(),
    l = new Float32Array(512).fill(1),
    r = l.slice();
  g.apply(l, r, 0, false);
  assert.equal(g.silentFrames, 512);
  assert.ok(l.every((x) => x === 0));
  l.fill(1);
  r.fill(1);
  g.apply(l, r, 512, true);
  assert.equal(g.readyFrame, 512);
  assert.ok(Math.abs(l[0] - 1 / 480) < 1e-9);
  assert.equal(l[479], 1);
  const expired = new StartupGate();
  expired.apply(l, r, 120000, false);
  assert.equal(expired.status, "deadline-expired");
  expired.apply(l, r, 120512, true);
  assert.ok(l.every((x) => x === 0));
  assert.equal(expired.status, "deadline-expired");
});
test("Actual producer never exposes the late-listener startup burst", async () => {
  const r = await runHeadless({ name: "startup" }),
    m = measure(r);
  assert.equal(r.exitCode, 0);
  assert.equal(m.lowEnvelopeIntervals.length, 1);
  assert.equal(m.lowEnvelopeIntervals[0].start, 0);
  assert.ok(r.left.slice(0, Math.floor(0.28 * 48000)).every((x) => x === 0));
  assert.equal(m.missingHistory, 0);
  assert.equal(r.final.startup.status, "ready");
  assert.ok(
    r.trace
      .filter((t) => t.frame > 0.5 * 48000)
      .every((t) => t.startup === "ready" && t.paths === 2),
  );
});
test("A missing required listener terminates at the bounded priming deadline without opening a device", async () => {
  const r = await runHeadless({ events: [], seconds: 3 });
  assert.equal(r.exitCode, 1);
  assert.match(r.final.error, /priming deadline/);
  assert.ok(r.left.every((x) => x === 0));
  assert.equal(r.left.length, Math.ceil(120000 / 512) * 512);
});
test("Headless framing, credit bound and deterministic PCM use the real producer", async () => {
  const a = await runHeadless({ name: "jitter" }),
    b = await runHeadless({ name: "jitter" });
  assert.equal(hash(a), hash(b));
  assert.equal(a.sink.maximumOutstandingCredits, 1);
  assert.equal(a.left.length, 192000);
  assert.equal(a.final.statistics.blocks, 375);
  assert.equal(a.final.statistics.listenerRejected, 0);
  assert.ok(a.trace.every((t) => t.pathIds.length <= 12));
  assert.equal(a.sink.endpointOpened, false);
});
test("Missing-history diagnostics do not change PCM", async () => {
  const a = await runHeadless({ diagnostics: true }),
    b = await runHeadless({ diagnostics: false });
  assert.equal(hash(a), hash(b));
  assert.equal(b.final.historyDiagnostics, null);
  assert.equal(a.final.historyDiagnostics.affectedFrames, 0);
});
test("Short gaps expose the measured continuity cost of the lower policies", async () => {
  const a = await runHeadless({ name: "short-gap", delayMs: 100 }),
    b = await runHeadless({ name: "short-gap", delayMs: 75 }),
    c = await runHeadless({ name: "short-gap", delayMs: 50 });
  const gaps = (r) =>
    measure(r).lowEnvelopeIntervals.filter((w) => w.start > 0.5);
  assert.equal(gaps(a).length, 0);
  assert.ok(gaps(b).length > 0);
  assert.ok(
    gaps(c)[0].end - gaps(c)[0].start >= gaps(b)[0].end - gaps(b)[0].start,
  );
  for (const r of [a, b, c])
    assert.ok(r.trace.every((t) => t.prediction <= 0.05 + 1e-9));
});
test("Actual PCM step is earlier for smaller buffers without changing source level or propagation", async () => {
  const results = [];
  for (const delayMs of [100, 75, 50])
    results.push(await runHeadless({ name: "step", delayMs }));
  const m = results.map(measure);
  assert.ok(
    m[0].stepHalfResponseSeconds > m[1].stepHalfResponseSeconds &&
      m[1].stepHalfResponseSeconds > m[2].stepHalfResponseSeconds,
  );
  for (const r of results) {
    assert.equal(r.final.statistics.listenerRejected, 0);
    assert.ok(
      r.trace
        .filter((t) => t.frame > 48000 && t.delays.length)
        .every((t) => Math.abs(t.delays[0] - 10 / 343) < 1e-10),
    );
  }
  for (const x of m) assert.equal(x.clipped, 0);
});
test("Smooth turns track the presented orientation in actual stereo energy", async () => {
  const m = measure(await runHeadless({ name: "turn" }));
  assert.ok(m.smoothTurnErrorToPresented < 0.03);
  assert.ok(m.smoothTurnErrorToCurrent > m.smoothTurnErrorToPresented);
});
test("Stale and paused input are unavailable; independent generation/session replacement recovers", async () => {
  for (const name of ["expired", "pause", "replacement"]) {
    const r = await runHeadless({ name });
    assert.equal(r.exitCode, 0);
    assert.equal(r.final.dsp.missingHistory, 0);
    assert.ok(r.trace.some((t) => t.frame > 3 * 48000 && t.paths === 2));
    if (name !== "replacement")
      assert.ok(
        r.trace.some(
          (t) =>
            t.mode === "stale-wall-clock" || t.mode === "invalid-or-paused",
        ),
      );
    if (name !== "expired") assert.equal(r.final.simulation.resets, 3); // Initial waiting session, external session, deliberate replacement.
  }
});
test("Emission stop preserves delayed tails; explicit Stop and unexpected failure end the producer", async () => {
  const r = await runHeadless({ name: "emission-stop" });
  assert.ok(r.left.slice(96000, 97200).some((x) => Math.abs(x) > 0.001));
  assert.ok(r.left.slice(2.3 * 48000).every((x) => Math.abs(x) < 1e-7));
  const stop = await runHeadless({ name: "stop" }),
    failure = await runHeadless({ name: "failure" });
  assert.equal(stop.exitCode, 0);
  assert.equal(failure.exitCode, 1);
  assert.equal(stop.left.length, 96256);
  assert.equal(failure.left.length, 96256);
  assert.match(failure.final.error, /Unknown message/);
});
test("Bounded history attribution distinguishes weighted defects from zero-weight taps", () => {
  const r = new StreamingRenderer({
    sourceIds: ["beacon"],
    historyDiagnostics: true,
  });
  r.accept({
    frame: 0,
    sourceGenerations: { beacon: 2 },
    paths: [
      {
        id: "test",
        sourceId: "beacon",
        generation: 1,
        emissionFrame: -1,
        rate: 1,
        bands: [0.1, 0.1, 0.1],
        pan: 0,
      },
    ],
  });
  r.process(
    { beacon: new Float32Array(512).fill(0.2) },
    new Float32Array(512),
    new Float32Array(512),
  );
  assert.equal(r.historyDiagnostics.generationTag, 511);
  assert.equal(r.historyDiagnostics.beforeStart, 1);
  assert.equal(r.historyDiagnostics.zeroWeightUnavailable, 512);
  assert.equal(r.historyDiagnostics.affectedFrames, 512);
  assert.equal(r.historyDiagnostics.firstFrame, 0);
  assert.equal(r.historyDiagnostics.lastFrame, 511);
  assert.equal(r.stats.missingHistory, 1023); // Old aggregate excludes negative indices but includes zero-weight taps.
});
test("Private diagnostics cannot escape .local or overwrite historical outputs", async () => {
  const { privateStoragePath } = await import(
    "../src/acoustics/research/research-private-storage.mjs"
  );
  assert.throws(() => privateStoragePath(process.cwd(), "../outside"));
});
test("The same headless producer preserves moving-source Doppler without external future state", async () => {
  const r = await runHeadless({
    scene: "flyby",
    events: [],
    required: false,
    seconds: 6,
  });
  const sum = Float32Array.from(r.left, (v, i) => v + r.right[i]);
  // Multipath interference can add zero crossings. Measure the fundamental's
  // Hann-windowed spectral peak, not the count of waveform zero crossings.
  const peak = (start) => {
    let best = 0,
      frequency = 0;
    for (let hz = 90; hz <= 101; hz += 0.1) {
      let re = 0,
        im = 0;
      for (let i = 0; i < 48000; i++) {
        const x =
            sum[start * 48000 + i] *
            (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / 47999)),
          a = (2 * Math.PI * hz * i) / 48000;
        re += x * Math.cos(a);
        im += x * Math.sin(a);
      }
      if (re * re + im * im > best) {
        best = re * re + im * im;
        frequency = hz;
      }
    }
    return frequency;
  };
  const expected = (time) => {
    let emission = time;
    for (let i = 0; i < 8; i++) {
      const x = 35 * Math.sin((emission - 3) * 0.35);
      emission = time - Math.hypot(x, 6) / 343;
    }
    const a = (emission - 3) * 0.35,
      x = 35 * Math.sin(a),
      v = 12.25 * Math.cos(a);
    return 95 / (1 + (x * v) / (Math.hypot(x, 6) * 343));
  };
  const approach = peak(1),
    departure = peak(4);
  assert.ok(
    Math.abs(approach - expected(1.5)) < 0.7,
    `${approach} / ${expected(1.5)}`,
  );
  assert.ok(
    Math.abs(departure - expected(4.5)) < 0.7,
    `${departure} / ${expected(4.5)}`,
  );
  assert.equal(r.final.dsp.missingHistory, 0);
  assert.equal(r.final.dsp.limited, 0);
});
