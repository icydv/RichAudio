import { measure } from "./headless-stream.mjs";
const interval = (trace, predicate) => {
  const result = [];
  for (const t of trace)
    if (predicate(t)) {
      const a = t.frame / 48000,
        b = (t.frame + 512) / 48000,
        last = result.at(-1);
      if (last && Math.abs(last[1] - a) < 1e-9) last[1] = b;
      else result.push([a, b]);
    }
  return result;
};
export function analyzeOrientationCase(c, r) {
  const m = measure(r),
    out = {
      frames: m.frames,
      peak: m.peak,
      rms: m.rms,
      clipped: m.clipped,
      missingHistory: m.missingHistory,
      lowEnvelopeIntervals: m.lowEnvelopeIntervals,
      startupReadyTime:
        r.trace.find((t) => t.startup === "ready")?.frame / 48000 ?? null,
      fallbackIntervals: interval(
        r.trace,
        (t) => t.orientation?.selectionMode === "buffered-fallback",
      ),
      spatialUnavailableIntervals: interval(
        r.trace,
        (t) => !["interpolated", "predicted", "exact"].includes(t.mode),
      ),
      maximumSmoothedPanMagnitude: Math.max(
        0,
        ...r.trace.flatMap((t) =>
          (t.smoothedPan ?? []).map((p) => Math.abs(p.pan)),
        ),
      ),
      fallbackBlocks: r.final.orientation?.fallbackBlocks ?? 0,
      fallbackSeconds: (r.final.orientation?.fallbackFrames ?? 0) / 48000,
      heldOrientationBlocks: r.trace.filter(
        (t) => t.orientation?.mode === "held",
      ).length,
      interpolatedOrientationBlocks: r.trace.filter(
        (t) => t.orientation?.mode === "interpolated",
      ).length,
      terminalOutputSeconds: r.left.length / 48000,
      terminalError: r.final.error,
    };
  const ages = r.trace
    .map((t) => t.orientation?.ageSeconds)
    .filter((x) => x != null)
    .sort((a, b) => a - b);
  out.orientationAgeMs = {
    median: ages.length ? 1000 * ages[Math.floor(ages.length * 0.5)] : null,
    max: ages.length ? 1000 * ages.at(-1) : null,
  };
  if (c.kind === "step") {
    const observation = 1.5 + c.phase,
      receipt = r.receiptFrames.find(
        (e) => Math.abs(e.observation - observation) < 1e-8,
      )?.receipt;
    const w = m.windows.find(
      (w) => w.start >= observation && w.balance != null && w.balance >= 0.5,
    );
    const selection = r.trace.find(
      (t) =>
        t.orientation &&
        t.orientation.targetTime >= observation &&
        t.orientation.selectionMode !== "spatial-unavailable",
    );
    out.response = {
      observation,
      receipt,
      pcmWindow: w ? [w.start, w.end] : null,
      afterObservationMs: w
        ? [(w.start - observation) * 1000, (w.end - observation) * 1000]
        : null,
      afterReceiptMs:
        w && receipt != null
          ? [(w.start - receipt) * 1000, (w.end - receipt) * 1000]
          : null,
      selectionReachesObservationAt: selection?.frame / 48000 ?? null,
      analysisWindowMs: 20,
      controlBlockMs: 512 / 48,
    };
  }
  if (c.kind === "turn") {
    const windows = m.windows.filter(
      (w) => w.start >= 0.5 && w.end <= 3.8 && w.balance != null,
    );
    out.currentTrackingRms = Math.sqrt(
      windows.reduce(
        (sum, w) =>
          sum +
          (w.balance -
            Math.sin(0.9 * Math.sin(2 * ((w.start + w.end) / 2 - c.phase)))) **
            2,
        0,
      ) / windows.length,
    );
  }
  let backward = 0,
    smoothedBackward = 0,
    at = null,
    maxTargetStep = 0,
    maxSmoothStep = 0;
  for (let i = 1; i < r.trace.length; i++) {
    const a = r.trace[i - 1],
      b = r.trace[i];
    if (b.frame < 24000) continue;
    const p = a.pathPresentation?.find((p) => p.order === 0),
      q = b.pathPresentation?.find((p) => p.order === 0);
    if (!p || !q || p.id !== q.id) continue;
    const delta = q.pan - p.pan,
      sa = a.smoothedPan.find((x) => x.id === p.id),
      sb = b.smoothedPan.find((x) => x.id === q.id),
      sd = sa && sb ? sb.pan - sa.pan : 0;
    maxTargetStep = Math.max(maxTargetStep, Math.abs(delta));
    maxSmoothStep = Math.max(maxSmoothStep, Math.abs(sd));
    if (
      c.kind === "monotonic-gap" &&
      b.frame / 48000 >= 1.4 &&
      b.frame / 48000 <= 1.8
    ) {
      if (delta < backward) {
        backward = delta;
        at = b.frame / 48000;
      }
      smoothedBackward = Math.min(smoothedBackward, sd);
    }
  }
  out.targetPanMaximumBlockStep = maxTargetStep;
  out.smoothedPanMaximumBlockStep = maxSmoothStep;
  out.fallbackBackwardTargetStep = backward;
  out.fallbackBackwardSmoothedStep = smoothedBackward;
  out.backwardAt = at;
  return out;
}
export function compareOrientationPair(c, a, b) {
  const am = analyzeOrientationCase(c, a),
    bm = analyzeOrientationCase(c, b);
  let maxFloatDifference = 0;
  for (let i = 0; i < a.left.length; i++)
    maxFloatDifference = Math.max(
      maxFloatDifference,
      Math.abs(a.left[i] - b.left[i]),
      Math.abs(a.right[i] - b.right[i]),
    );
  const sameNonPanControls =
    a.trace.length === b.trace.length &&
    a.trace.every(
      (t, i) => t.spatialFingerprint === b.trace[i].spatialFingerprint,
    );
  const issues = [];
  if (!sameNonPanControls) issues.push("non-pan-controls-changed");
  if (am.startupReadyTime !== bm.startupReadyTime)
    issues.push("startup-changed");
  if (am.missingHistory !== bm.missingHistory || bm.clipped)
    issues.push("history-or-clipping");
  if (
    JSON.stringify(am.spatialUnavailableIntervals) !==
    JSON.stringify(bm.spatialUnavailableIntervals)
  )
    issues.push("spatial-availability-changed");
  if (
    JSON.stringify(am.lowEnvelopeIntervals) !==
    JSON.stringify(bm.lowEnvelopeIntervals)
  )
    issues.push("envelope-interval-requires-investigation");
  if (bm.maximumSmoothedPanMagnitude > 1 + 1e-9)
    issues.push("pan-out-of-bounds");
  if (c.kind === "stationary" && maxFloatDifference > 1e-8)
    issues.push("fixed-orientation-changed");
  let improvementMs = null;
  if (c.kind === "step") {
    improvementMs =
      am.response.afterObservationMs?.[0] - bm.response.afterObservationMs?.[0];
    if (!(improvementMs > 30.667)) issues.push("response-not-distinguishable");
  }
  if (
    c.kind === "turn" &&
    c.sources !== 4 &&
    !c.scene &&
    !(bm.currentTrackingRms < am.currentTrackingRms)
  )
    issues.push("smooth-tracking-not-improved");
  if (
    c.kind === "monotonic-gap" &&
    bm.fallbackBackwardTargetStep <
      Math.min(-1e-6, am.fallbackBackwardTargetStep - 1e-6)
  )
    issues.push("new-backward-fallback");
  return {
    sameNonPanControls,
    maxFloatDifference,
    improvementMs,
    issues,
    reference: am,
    candidate: bm,
  };
}
