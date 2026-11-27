import { validateNeutralEnvelope } from "./listener-control.mjs";

const norm = (v) => Math.hypot(...v);
const dot = (a, b) => a.reduce((n, x, i) => n + x * b[i], 0);
const unit = (v) => {
  const n = norm(v);
  if (n < 1e-8) throw Error("Ambiguous listener orientation");
  return v.map((x) => x / n);
};
// A fixed presentation delay permits interpolation between observations which
// have ALREADY arrived. This is control latency, never extra acoustic distance.
export class ListenerPlayout {
  constructor({ delayMs = 100 } = {}) {
    if (![100, 75, 50].includes(delayMs))
      throw Error("Experimental listener delay");
    this.delay = delayMs / 1000;
    this.extrapolation = 0.05;
    this.records = [];
    this.lastState = null;
    this.stats = {
      accepted: 0,
      resets: 0,
      coalesced: 0,
      interpolated: 0,
      predicted: 0,
      unavailable: 0,
    };
  }
  add(envelope, audioTime, hostMs) {
    if (
      !Number.isFinite(audioTime) ||
      audioTime < 0 ||
      !Number.isFinite(hostMs) ||
      hostMs < 0
    )
      throw Error("Listener receipt clock");
    const message = validateNeutralEnvelope(envelope, this.lastState),
      s = message.state;
    const changed =
      !this.lastState ||
      s.session !== this.lastState.session ||
      s.generation !== this.lastState.generation;
    const time = audioTime - message.receiptAgeMs / 1000,
      previous = this.records.at(-1);
    if (previous && hostMs < previous.hostMs)
      throw Error("Listener receipt clock reversed");
    if (
      !changed &&
      previous &&
      (s.coordinates !== previous.state.coordinates ||
        s.units !== previous.state.units ||
        s.listenerKind !== previous.state.listenerKind)
    )
      throw Error("Listener representation changed without generation");
    if (!changed && previous && time < previous.time - 1e-9)
      throw Error("Mapped observation clock reversed");
    if (
      !changed &&
      previous &&
      Math.abs(time - previous.time) <= 1e-9 &&
      ["position", "velocity", "forward", "up"].some((key) =>
        s[key].some(
          (value, i) => Math.abs(value - previous.state[key][i]) > 1e-9,
        ),
      )
    )
      throw Error("Listener pose changed without mapped time");
    if (
      !changed &&
      previous &&
      time > previous.time + 1e-9 &&
      s.valid &&
      previous.state.valid
    ) {
      if (
        dot(s.forward, previous.state.forward) < -0.99 ||
        dot(s.up, previous.state.up) < -0.99
      )
        throw Error("Listener orientation discontinuity needs generation");
      if (
        s.units === "metres" &&
        norm(s.position.map((x, i) => x - previous.state.position[i])) /
          (time - previous.time) >
          100 + 1e-6
      )
        throw Error("Listener position discontinuity needs generation");
    }
    if (changed) {
      this.records = [];
      this.stats.resets++;
    } else if (previous && Math.abs(time - previous.time) <= 1e-9) {
      this.records.pop();
      this.stats.coalesced++;
    }
    this.records.push({
      time,
      hostMs,
      receiptAgeMs: message.receiptAgeMs,
      state: s,
    });
    while (
      this.records.length > 128 ||
      (this.records.length > 2 && this.records[1].time < time - 2.5)
    )
      this.records.shift();
    this.lastState = s;
    this.stats.accepted++;
    return message;
  }
  sample(renderTime, hostMs) {
    if (
      !Number.isFinite(renderTime) ||
      renderTime < 0 ||
      !Number.isFinite(hostMs) ||
      hostMs < 0
    )
      throw Error("Listener playout clock");
    const targetTime = renderTime - this.delay,
      last = this.records.at(-1);
    const result = {
      state: null,
      mode: "warming",
      targetTime,
      playoutSeconds: this.delay,
      newestAgeSeconds: last ? renderTime - last.time : null,
      receiptAgeMs: last?.receiptAgeMs ?? null,
      extrapolationSeconds: 0,
    };
    const missing = (mode) => {
      this.stats.unavailable++;
      return { ...result, mode };
    };
    if (!last) return missing("missing");
    if (hostMs < last.hostMs) return missing("clock-invalid");
    if (!last.state.valid || last.state.paused)
      return missing("invalid-or-paused");
    if (last.receiptAgeMs + hostMs - last.hostMs > 250)
      return missing("stale-wall-clock");
    if (targetTime < this.records[0].time) return missing("warming");
    let a = this.records[0],
      b = null;
    for (const r of this.records) {
      if (r.time <= targetTime) a = r;
      else {
        b = r;
        break;
      }
    }
    if (
      !a.state.valid ||
      a.state.paused ||
      (b && (!b.state.valid || b.state.paused))
    )
      return missing("invalid-interval");
    let state,
      mode,
      extrapolationSeconds = 0;
    if (b) {
      if (b.time - a.time > 0.25) return missing("observation-gap");
      const u = (targetTime - a.time) / (b.time - a.time),
        mix = (x, y) => x.map((v, i) => v + (y[i] - v) * u);
      const forward = unit(mix(a.state.forward, b.state.forward));
      const up0 = mix(a.state.up, b.state.up),
        projection = dot(up0, forward),
        up = unit(up0.map((x, i) => x - projection * forward[i]));
      state = {
        ...a.state,
        position: mix(a.state.position, b.state.position),
        velocity: mix(a.state.velocity, b.state.velocity),
        forward,
        up,
      };
      mode = "interpolated";
      this.stats.interpolated++;
    } else {
      extrapolationSeconds = targetTime - a.time;
      if (extrapolationSeconds > this.extrapolation + 1e-9)
        return missing("prediction-expired");
      state = {
        ...a.state,
        position: a.state.position.map(
          (x, i) => x + a.state.velocity[i] * extrapolationSeconds,
        ),
      };
      mode = extrapolationSeconds > 1e-9 ? "predicted" : "exact";
      this.stats.predicted++;
    }
    return { ...result, state, mode, extrapolationSeconds };
  }
}
