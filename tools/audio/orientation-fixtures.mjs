import { sequence } from "./headless-stream.mjs";
export const orientationCases = [
  ...[0, 0.004, 0.008].flatMap((phase) =>
    ["step", "turn"].map((name) => ({
      name: `${name}-${Math.round(phase * 1000)}ms`,
      kind: name,
      phase,
    })),
  ),
  ...[
    "stationary",
    "startup",
    "jitter",
    "short-gap",
    "expired",
    "pause",
    "replacement",
    "emission-stop",
    "stop",
    "failure",
    "rapid",
    "wrap",
    "invalid",
    "monotonic-gap",
    "coalesced",
    "moving-listener",
  ].map((name) => ({ name, kind: name, phase: 0 })),
  { name: "reflected-turn", kind: "turn", phase: 0, scene: "urban-street" },
  { name: "four-source-turn", kind: "turn", phase: 0, sources: 4 },
];
export function orientationEvents(c, seconds = 4) {
  const custom = [
    "rapid",
    "wrap",
    "invalid",
    "monotonic-gap",
    "coalesced",
    "moving-listener",
  ].includes(c.kind);
  let events = sequence(custom ? "stationary" : c.kind, seconds);
  for (const e of events) {
    if (e.message.type !== "listener") continue;
    const t = e.observation;
    const yaw =
      c.kind === "rapid"
        ? 0.8 * Math.sin(10 * t)
        : c.kind === "wrap"
          ? 3 + 0.6 * (t - 1)
          : c.kind === "monotonic-gap"
            ? 0.6 * t
            : c.kind === "moving-listener"
              ? 0.5 * Math.sin(2 * t)
              : null;
    if (yaw != null)
      e.message.state.forward = [-Math.cos(yaw), -Math.sin(yaw), 0];
    if (c.kind === "invalid" && t >= 1.5 && t < 2) {
      e.message.state.valid = false;
      e.message.state.reason = "unavailable";
    }
    if (c.kind === "moving-listener") {
      e.message.state.position = [5, t * 0.5, 1];
      e.message.state.velocity = [0, 0.5, 0];
    }
    e.observation += c.phase;
    e.receipt += c.phase;
    e.message.state.observationTicks += Math.round(c.phase * 1e7);
  }
  if (c.kind === "monotonic-gap")
    events = events.filter((e) => e.observation < 1.5 || e.observation >= 1.6);
  if (c.kind === "coalesced") {
    events = events.flatMap((e) =>
      e.message.type !== "listener"
        ? [e]
        : [e, { ...structuredClone(e), receipt: e.receipt + 0.001 }],
    );
    for (let i = 0; i < events.length; i++) {
      events[i].message.state.sequence = i;
      if (i % 2) events[i].message.state.observationTicks++;
    }
  }
  return events;
}
