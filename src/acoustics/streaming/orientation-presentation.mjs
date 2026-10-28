import { ListenerPlayout } from "./listener-playout.mjs";
import { cross, unit, dot } from "../research/local-geometry.mjs";
const same = (a, b) =>
  a &&
  b &&
  ["session", "generation", "coordinates", "units", "listenerKind"].every(
    (k) => a[k] === b[k],
  );
export function orientationTiming(history, sample, frame, hostMs) {
  if (!sample?.state)
    return {
      frame,
      selectionAudioSeconds: frame / 48000,
      selectionHostMs: hostMs,
      mode: "unavailable",
      targetTime: sample?.targetTime ?? null,
      actualTime: null,
      ageSeconds: null,
    };
  const a = history.records.findLast((r) => r.time <= sample.targetTime),
    b = history.records.find((r) => r.time > sample.targetTime);
  const held = sample.mode !== "interpolated",
    actualTime = held ? a.time : sample.targetTime;
  return {
    frame,
    selectionAudioSeconds: frame / 48000,
    selectionHostMs: hostMs,
    mode: held ? "held" : "interpolated",
    targetTime: sample.targetTime,
    actualTime,
    ageSeconds: frame / 48000 - actualTime,
    observationTimes: held ? [a.time] : [a.time, b.time],
    receiptHostMs: held ? [a.hostMs] : [a.hostMs, b.hostMs],
    sequences: held ? [a.state.sequence] : [a.state.sequence, b.state.sequence],
    generation: sample.state.generation,
  };
}
export class OrientationPresentation {
  constructor() {
    this.history = new ListenerPlayout({ delayMs: 50 });
    this.stats = {
      fastBlocks: 0,
      fallbackBlocks: 0,
      fallbackFrames: 0,
      unavailableBlocks: 0,
      invalidatedBlocks: 0,
    };
  }
  add(message, audioTime, hostMs) {
    this.history.add(message, audioTime, hostMs);
  }
  select(buffered, bufferedHistory, frame, hostMs) {
    const now = frame / 48000,
      fast = this.history.sample(now, hostMs);
    let sample = buffered,
      history = bufferedHistory,
      mode = "spatial-unavailable";
    if (buffered?.state) {
      if (fast.state && same(fast.state, buffered.state)) {
        sample = fast;
        history = this.history;
        mode = "faster-50";
      } else mode = "buffered-fallback";
    }
    const newest = this.history.records.at(-1);
    return {
      state: sample?.state ?? null,
      context: buffered?.state ?? null,
      latestReceiptHostMs: newest?.hostMs ?? null,
      latestReceiptAgeMs: newest?.receiptAgeMs ?? null,
      diagnostic: {
        policy: "experimental-orientation-50",
        mode,
        fastUnavailableReason: fast.state ? null : fast.mode,
        spatialTargetTime: buffered?.targetTime ?? null,
        ...orientationTiming(history, sample, frame, hostMs),
        // Keep policy selection separate from interpolation/hold mode.
        selectionMode: mode,
      },
    };
  }
  present(control, selection, hostMs, controlContext) {
    const latest = this.history.records.at(-1),
      s = latest?.state,
      d = {
        ...selection.diagnostic,
        handoffHostMs: hostMs,
        selectionToHandoffMs: hostMs - selection.diagnostic.selectionHostMs,
      };
    if (
      selection.context &&
      (control.frame !== selection.diagnostic.frame ||
        !same(selection.context, controlContext) ||
        !same(selection.context, s) ||
        !s.valid ||
        s.paused ||
        hostMs < latest.hostMs ||
        hostMs < selection.diagnostic.selectionHostMs ||
        latest.receiptAgeMs + hostMs - latest.hostMs > 250 ||
        selection.latestReceiptAgeMs + hostMs - selection.latestReceiptHostMs >
          250)
    ) {
      this.stats.invalidatedBlocks++;
      return {
        control,
        muteBlock: true,
        diagnostic: {
          ...d,
          selectionMode: "boundary-invalidated",
          mode: "unavailable",
          currentGeneration: s?.generation ?? null,
        },
      };
    }
    if (!selection.state) {
      this.stats.unavailableBlocks++;
      return { control, muteBlock: false, diagnostic: d };
    }
    if (d.selectionMode === "buffered-fallback") {
      this.stats.fallbackBlocks++;
      this.stats.fallbackFrames += 512;
    } else this.stats.fastBlocks++;
    const right = unit(cross(selection.state.forward, selection.state.up));
    const paths = control.paths.map((p) => {
      if (
        !Array.isArray(p.arrivalDirection) ||
        p.arrivalDirection.length !== 3 ||
        p.arrivalDirection.some((x) => !Number.isFinite(x)) ||
        Math.abs(Math.hypot(...p.arrivalDirection) - 1) > 1e-6
      )
        throw Error("Invalid presentation arrival direction");
      return {
        ...p,
        pan: Math.max(-1, Math.min(1, dot(p.arrivalDirection, right))),
      };
    });
    return { control: { ...control, paths }, muteBlock: false, diagnostic: d };
  }
}
