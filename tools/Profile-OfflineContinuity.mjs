import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { runHeadless, sequence } from "./audio/headless-stream.mjs";
import { privateStoragePath } from "../src/acoustics/research/research-private-storage.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = privateStoragePath(
  root,
  path.resolve(root, process.argv[2] ?? ".local/continuity-profile"),
);
if (fs.existsSync(output))
  throw Error("Fresh private profile destination required");
fs.mkdirSync(output, { recursive: true });
const summary = (a) => {
  a.sort((x, y) => x - y);
  return {
    median: a[Math.floor(a.length * 0.5)] ?? 0,
    p95: a[Math.floor(a.length * 0.95)] ?? 0,
    max: a.at(-1) ?? 0,
  };
};
const rows = [];
for (const sources of [1, 4])
  for (const diagnostics of sources === 1
    ? [false, true, true, false]
    : [true, false, false, true]) {
    const r = await runHeadless({
      sources,
      diagnostics,
      seconds: 15,
      events: sequence("turn", 15),
    });
    rows.push({
      sources,
      diagnostics,
      seconds: 15,
      clock: r.sink.clock,
      blocks: r.trace.length,
      sourceHash: createHash("sha256")
        .update(Buffer.from(r.left.buffer))
        .update(Buffer.from(r.right.buffer))
        .digest("hex"),
      startupDspMs: summary(
        r.trace.filter((t) => t.frame < 24000).map((t) => t.dspMilliseconds),
      ),
      steadyDspMs: summary(
        r.trace.filter((t) => t.frame >= 24000).map((t) => t.dspMilliseconds),
      ),
      simulationMs: r.final.statistics.simulationMs,
      cpuSeconds: r.final.cpuSeconds,
      wallSeconds: r.final.wallSeconds,
      memory: r.final.memory,
      ownedArrayBytes: r.final.ownedArrayBytes,
      maxPaths: r.final.statistics.pathMaximum,
      missingHistory: r.final.dsp.missingHistory,
      creditDepth: r.sink.maximumOutstandingCredits,
    });
  }
for (const sources of [1, 4]) {
  const r = await runHeadless({
    sources,
    seconds: 2,
    paced: true,
    events: sequence("jitter", 2),
  });
  rows.push({
    sources,
    clock: r.sink.clock,
    wallMs: r.sink.wallMs,
    renderedSeconds: r.left.length / 48000,
    missingHistory: r.final.dsp.missingHistory,
    dsp: r.final.statistics.dspMs,
    memory: r.final.memory,
  });
}
const soak = await runHeadless({
  sources: 4,
  seconds: 60,
  events: sequence("jitter", 60),
});
rows.push({
  sources: 4,
  seconds: 60,
  clock: soak.sink.clock,
  blocks: soak.trace.length,
  cpuSeconds: soak.final.cpuSeconds,
  wallSeconds: soak.final.wallSeconds,
  dsp: soak.final.statistics.dspMs,
  simulation: soak.final.statistics.simulationMs,
  memory: soak.final.memory,
  ownedArrayBytes: soak.final.ownedArrayBytes,
  missingHistory: soak.final.dsp.missingHistory,
  maxPaths: soak.final.statistics.pathMaximum,
  limited: soak.final.dsp.limited,
});
fs.writeFileSync(
  path.join(output, "profile.json"),
  JSON.stringify(
    {
      rows,
      limitations:
        "No endpoint, device deadlines or hardware latency; Node GC/worker/IPC scheduling are not audio callback certification. RSS is end-of-run, not a measured peak; no per-object allocation profiler attached.",
    },
    null,
    2,
  ),
  { flag: "wx" },
);
console.log(
  JSON.stringify(
    rows.map(({ memory, ...r }) => ({ ...r, rss: memory.rss })),
    null,
    2,
  ),
);
