import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { runHeadless, measure } from "./audio/headless-stream.mjs";
import { wav } from "../src/acoustics/engine/signals.mjs";
import { privateStoragePath } from "../src/acoustics/research/research-private-storage.mjs";
import { historicalProducer } from "./audio/historical-continuity.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = privateStoragePath(
  root,
  path.resolve(root, process.argv[2] ?? ".local/offline-continuity"),
);
if (fs.existsSync(output)) throw Error("Fresh private output required");
fs.mkdirSync(output, { recursive: true });
const report = {
  schema: 1,
  scope: "silent pre-device; no listening",
  results: [],
};
const baseline = process.argv.includes("--baseline");
const producerScript = baseline
  ? historicalProducer(root, path.join(output, "historical-producer"))
  : null;
report.reference = baseline
  ? "PR50 original simulation/producer, deterministic receipt clock and diagnostic DSP"
  : "current producer";
const names = [
  "startup",
  "stationary",
  "step",
  "turn",
  "jitter",
  "short-gap",
  "expired",
  "pause",
  "replacement",
  "emission-stop",
  "stop",
  "failure",
];
for (const delayMs of process.argv.includes("--baseline")
  ? [100]
  : [100, 75, 50])
  for (const name of names) {
    const r = await runHeadless({
        name,
        delayMs,
        producerScript,
        required: !baseline,
        diagnostics: !baseline,
      }),
      bytes = wav([r.left, r.right]);
    fs.writeFileSync(path.join(output, `${name}-${delayMs}.wav`), bytes, {
      flag: "wx",
    });
    fs.writeFileSync(
      path.join(output, `${name}-${delayMs}-trace.json`),
      JSON.stringify(r.trace),
      { flag: "wx" },
    );
    const m = measure(r);
    delete m.windows;
    report.results.push({
      name,
      delayMs,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      ...m,
      final: r.final,
      sink: r.sink,
    });
    fs.writeFileSync(
      path.join(output, "metrics.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        name,
        delayMs,
        missing: m.missingHistory,
        gaps: m.lowEnvelopeIntervals,
        response: m.stepHalfResponseSeconds,
      }),
    );
  }
