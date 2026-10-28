// Silent sink for the ACTUAL credit-paced producer. No Windows host/device imports.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { privateStoragePath } from "../../src/acoustics/research/research-private-storage.mjs";
export const FS = 48000,
  BLOCK = 512;
const root = fileURLToPath(new URL("../../", import.meta.url));
export function listenerMessage(time, sequence, overrides = {}) {
  return {
    type: "listener",
    receiptAgeMs: 0,
    state: {
      version: 1,
      session: "a".repeat(32),
      generation: 1,
      sequence,
      observationTicks: 10000000 + Math.round(time * 10000000),
      clockFrequency: 10000000,
      gameTimeMs: Math.round(time * 1000),
      position: [5, 0, 1],
      velocity: [0, 0, 0],
      forward: [-1, 0, 0],
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
export function sequence(name, duration = 4) {
  const events = [];
  for (let i = 0; i * 0.05 < duration; i++) {
    const time = i * 0.05;
    if (name === "short-gap" && time >= 1.5 && time < 1.6) continue;
    if (name === "expired" && time >= 1.5 && time < 2.1) continue;
    const yaw =
      name === "turn"
        ? 0.9 * Math.sin(time * 2)
        : name === "step" && time >= 1.5
          ? Math.PI / 2
          : 0;
    const generation =
      (name === "replacement" || name === "pause") && time >= 2 ? 2 : 1;
    const m = listenerMessage(time, i, {
      forward: [-Math.cos(yaw), -Math.sin(yaw), 0],
      generation,
      ...(name === "replacement" && time >= 2
        ? { session: "b".repeat(32) }
        : {}),
      paused: name === "pause" && time >= 1.5 && time < 2,
    });
    events.push({
      observation: time,
      receipt:
        time +
        (name === "jitter" || name === "turn"
          ? [0.012, 0.04, 0.022, 0.032][i % 4]
          : 0.02),
      message: m,
    });
  }
  // Deliberately late first external listener reproduces the synthetic-to-live startup.
  if (name === "startup")
    for (const e of events) {
      e.observation += 0.18;
      e.receipt += 0.18;
      e.message.state.observationTicks += 1800000;
    }
  if (name === "emission-stop")
    events.push({
      receipt: 2,
      message: { type: "control", command: "emit-stop" },
    });
  if (name === "stop")
    events.push({ receipt: 2, message: { type: "control", command: "stop" } });
  if (name === "failure")
    events.push({ receipt: 2, message: { type: "invalid-terminal-test" } });
  return events.sort((a, b) => a.receipt - b.receipt);
}
export async function runHeadless({
  name = "stationary",
  seconds = 4,
  delayMs = 100,
  sources = 1,
  scene = "open-road",
  extraArgs = [],
  events = sequence(name, seconds),
  paced = false,
  required = true,
  diagnostics = true,
  producerScript = null,
  autoStart = true,
} = {}) {
  if (
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    seconds > 60 ||
    ![1, 4].includes(sources)
  )
    throw Error("Headless budget");
  const child = spawn(
    process.execPath,
    [
      producerScript
        ? privateStoragePath(root, path.resolve(root, producerScript))
        : "tools/Run-Acoustics07.mjs",
      "--scene",
      scene,
      "--sources",
      String(sources),
      "--headless-clock",
      "audio",
      "--trace-blocks",
      "yes",
      "--listener-delay-ms",
      String(delayMs),
      ...(required ? ["--listener-input", "required"] : []),
      ...(diagnostics ? ["--history-diagnostics", "yes"] : []),
      ...extraArgs,
    ],
    { cwd: root, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
  const frames = Math.ceil((seconds * FS) / BLOCK) * BLOCK,
    left = new Float32Array(frames),
    right = new Float32Array(frames),
    logs = [];
  let pending = Buffer.alloc(0),
    text = "",
    blocks = 0,
    closed = false,
    exitCode = null,
    failure = null,
    notify = null,
    eventIndex = 0;
  const started = performance.now();
  child.stdin.on("error", () => {});
  child.on("error", (e) => {
    failure = e;
    notify?.();
  });
  child.on("close", (code) => {
    closed = true;
    exitCode = code;
    notify?.();
  });
  child.stdout.on("data", (chunk) => {
    try {
      if (pending.length + chunk.length > 65536)
        throw Error("Headless frame budget");
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 4112) {
        if (
          pending.toString("ascii", 0, 4) !== "RA07" ||
          pending.readUInt32LE(4) !== blocks ||
          pending.readUInt32LE(8) !== BLOCK ||
          pending.readUInt32LE(12) !== 0 ||
          (blocks + 1) * BLOCK > frames
        )
          throw Error("Headless framing");
        for (let j = 0; j < BLOCK; j++) {
          const l = pending.readFloatLE(16 + j * 8),
            r = pending.readFloatLE(20 + j * 8);
          if (!Number.isFinite(l) || !Number.isFinite(r))
            throw Error("Nonfinite PCM");
          left[blocks * BLOCK + j] = l;
          right[blocks * BLOCK + j] = r;
        }
        blocks++;
        pending = pending.subarray(4112);
        notify?.();
      }
    } catch (e) {
      failure = e;
      notify?.();
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    try {
      text += chunk;
      if (text.length > 65536) throw Error("Headless diagnostic bound");
      let end;
      while ((end = text.indexOf("\n")) >= 0) {
        if (logs.length > 20000) throw Error("Trace bound");
        logs.push(JSON.parse(text.slice(0, end)));
        text = text.slice(end + 1);
      }
    } catch (e) {
      failure = e;
      notify?.();
    }
  });
  function send(m) {
    child.stdin.write(JSON.stringify(m) + "\n");
  }
  async function wait(predicate) {
    const deadline = performance.now() + 10000;
    while (!predicate() && !failure) {
      if (performance.now() > deadline) throw Error("Headless worker deadline");
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 25);
        notify = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
    if (failure) throw failure;
  }
  try {
    if (autoStart) send({ type: "control", command: "start" });
    while (blocks * BLOCK < frames && !closed) {
      const time = (blocks * BLOCK) / FS;
      while (
        eventIndex < events.length &&
        events[eventIndex].receipt <= time + 1e-10
      ) {
        const e = events[eventIndex++],
          m = structuredClone(e.message);
        if (m.type === "listener")
          m.receiptAgeMs = (time - e.observation) * 1000;
        send(m);
      }
      // Exactly one outstanding credit; preserves production backpressure and framing.
      const target = blocks + 1;
      send({ type: "credit", blocks: 1 });
      await wait(() => blocks >= target || closed);
      if (paced) {
        const ms =
          ((blocks * BLOCK) / FS) * 1000 - (performance.now() - started);
        if (ms > 0) await new Promise((r) => setTimeout(r, ms));
      }
    }
    if (!closed) send({ type: "control", command: "stop" });
    await wait(() => closed);
    if (pending.length) throw Error("Truncated output frame");
    const final = logs.findLast((x) => x.type === "final");
    if (!final) throw Error("Missing producer result");
    return {
      left: left.slice(0, blocks * BLOCK),
      right: right.slice(0, blocks * BLOCK),
      trace: logs.filter((x) => x.type === "block"),
      final,
      exitCode,
      receiptFrames: events
        .filter((e) => e.message.type === "listener")
        .map((e) => ({
          observation: e.observation,
          receipt: (Math.ceil((e.receipt * FS) / BLOCK) * BLOCK) / FS,
        })),
      sink: {
        clock: paced
          ? "wall-clock-paced / synthetic receipt clock"
          : "accelerated / synthetic receipt clock",
        maximumOutstandingCredits: 1,
        endpointOpened: false,
        wallMs: performance.now() - started,
      },
    };
  } finally {
    if (!closed) child.kill();
  }
}
export function measure(result) {
  const { left: l, right: r, trace } = result,
    windows = [],
    silence = [];
  // Fixed non-overlapping 20 ms energy windows: centre uncertainty +/-10 ms.
  for (let i = 0; i + 960 <= l.length; i += 960) {
    let el = 0,
      er = 0;
    for (let j = i; j < i + 960; j++) {
      el += l[j] ** 2;
      er += r[j] ** 2;
    }
    windows.push({
      start: i / FS,
      end: (i + 960) / FS,
      rms: Math.sqrt((el + er) / 1920),
      balance: el + er > 1e-18 ? (er - el) / (el + er) : null,
    });
  }
  const reference = windows.filter((w) => w.start >= 0.8 && w.end <= 1.3),
    rms = Math.sqrt(
      reference.reduce((s, w) => s + w.rms * w.rms, 0) /
        Math.max(1, reference.length),
    );
  for (const w of windows)
    if (w.rms < rms * 0.001) {
      const last = silence.at(-1);
      if (last && Math.abs(last.end - w.start) < 1e-8) last.end = w.end;
      else silence.push({ start: w.start, end: w.end });
    }
  let peak = 0,
    sum = 0,
    clipped = 0;
  for (let i = 0; i < l.length; i++) {
    peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
    sum += l[i] ** 2 + r[i] ** 2;
    if (Math.abs(l[i]) >= 1 || Math.abs(r[i]) >= 1) clipped++;
  }
  const step = windows.find(
    (w) => w.start >= 1.5 && Math.abs(w.balance ?? 0) >= 0.5,
  );
  const presented = trace.find((t) =>
    ["interpolated", "predicted", "exact"].includes(t.mode),
  );
  const delay = presented?.targetTime;
  const delaySeconds = delay == null ? 0 : presented.frame / FS - delay;
  const tracking = windows.filter(
    (w) => w.start >= 0.5 && w.end <= 3.8 && w.balance != null,
  );
  const trackingRms = (lag) =>
    Math.sqrt(
      tracking.reduce(
        (s, w) =>
          s +
          (w.balance -
            Math.sin(0.9 * Math.sin(2 * ((w.start + w.end) / 2 - lag)))) **
            2,
        0,
      ) / Math.max(1, tracking.length),
    );
  const stepReceipt = result.receiptFrames.find(
    (e) => Math.abs(e.observation - 1.5) < 1e-8,
  )?.receipt;
  const predictions = trace.filter((t) => t.mode === "predicted"),
    ages = trace
      .filter((t) => t.age != null && t.mode !== "warming")
      .map((t) => t.age);
  const orientationAges = trace
    .filter((t) => t.orientationAgeSeconds != null)
    .map((t) => t.orientationAgeSeconds)
    .sort((a, b) => a - b);
  return {
    frames: l.length,
    peak,
    rms: Math.sqrt(sum / (2 * l.length)),
    clipped,
    referenceRms: rms,
    lowEnvelopeIntervals: silence,
    stepHalfResponseSeconds: step ? step.start - 1.5 : null,
    stepHalfResponseIntervalSeconds: step
      ? [step.start - 1.5, step.end - 1.5]
      : null,
    responseWindowUncertaintyMs: 10,
    controlBlockUncertaintyMs: (BLOCK / FS) * 1000,
    stepHalfResponseFromReceiptSeconds:
      step && stepReceipt != null ? step.start - stepReceipt : null,
    stepHalfResponseFromReceiptIntervalSeconds:
      step && stepReceipt != null
        ? [step.start - stepReceipt, step.end - stepReceipt]
        : null,
    smoothTurnErrorToCurrent: trackingRms(0),
    smoothTurnErrorToPresented: trackingRms(delaySeconds),
    predictionBlocks: predictions.length,
    maximumPredictionSeconds: Math.max(
      0,
      ...predictions.map((t) => t.prediction),
    ),
    maximumNewestObservationAgeSeconds: Math.max(0, ...ages),
    presentedOrientationAgeSeconds: {
      median: orientationAges[Math.floor(orientationAges.length * 0.5)] ?? null,
      max: orientationAges.at(-1) ?? null,
    },
    directionalTrackingRms: Math.sqrt(
      windows
        .filter((w) => w.start > 0.5 && w.balance != null)
        .reduce((s, w) => {
          const t = trace.findLast((t) => t.frame / FS <= w.start);
          return s + (t?.pan == null ? 0 : (w.balance - t.pan) ** 2);
        }, 0) / Math.max(1, windows.filter((w) => w.start > 0.5).length),
    ),
    unavailableBlocks: trace.filter(
      (t) =>
        !["interpolated", "predicted", "exact", "synthetic"].includes(t.mode),
    ).length,
    missingHistory: result.final.dsp.missingHistory,
    windows,
  };
}
