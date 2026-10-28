import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { runHeadless, measure } from "./audio/headless-stream.mjs";
import {
  orientationCases,
  orientationEvents,
} from "./audio/orientation-fixtures.mjs";
import { wav } from "../src/acoustics/engine/signals.mjs";
import { privateStoragePath } from "../src/acoustics/research/research-private-storage.mjs";
import {
  analyzeOrientationCase,
  compareOrientationPair,
} from "./audio/orientation-measurements.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = privateStoragePath(
  root,
  path.resolve(root, process.argv[2] ?? ".local/orientation-comparison"),
);
if (fs.existsSync(output))
  throw Error("Fresh orientation comparison directory required");
fs.mkdirSync(output, { recursive: true });
const baseline = process.argv.includes("--baseline"),
  report = {
    schema: 1,
    scope: "silent synthetic pre-device",
    policies: baseline
      ? ["reference-100"]
      : ["reference-100", "orientation-50"],
    results: [],
    comparisons: [],
  };
let reference = null;
for (const c of orientationCases)
  for (const policy of report.policies) {
    const r = await runHeadless({
      events: orientationEvents(c),
      scene: c.scene ?? "open-road",
      sources: c.sources ?? 1,
      extraArgs:
        policy === "orientation-50"
          ? ["--experimental-orientation", "50ms"]
          : [],
    });
    const bytes = wav([r.left, r.right]),
      filename = `${c.name}-${policy}.wav`,
      m = analyzeOrientationCase(c, r);
    if (policy === "reference-100") reference = r;
    else
      report.comparisons.push({
        name: c.name,
        ...compareOrientationPair(c, reference, r),
      });
    fs.writeFileSync(path.join(output, filename), bytes, { flag: "wx" });
    fs.writeFileSync(
      path.join(output, `${c.name}-${policy}-trace.json`),
      JSON.stringify(r.trace),
      { flag: "wx" },
    );
    report.results.push({
      name: c.name,
      phase: c.phase,
      policy,
      filename,
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
        name: c.name,
        policy,
        response: m.stepHalfResponseIntervalSeconds,
        missing: m.missingHistory,
        error: r.final.error,
      }),
    );
  }
