// Original deterministic PCM replay through causal snapshots, with no device or game.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { demo } from "./acoustics-06-scenes.mjs";
import { incrementalReference } from "./Measure-Acoustics07.mjs";
import { audioMetrics, wav } from "../src/acoustics/engine/signals.mjs";
import { privateStoragePath } from "../src/acoustics/research/research-private-storage.mjs";

export function replay(
  root,
  destination,
  names = [
    "open-road",
    "urban-street",
    "obstructed-corner",
    "enclosure",
    "flyby",
  ],
) {
  if (
    !Array.isArray(names) ||
    names.length < 1 ||
    names.length > 5 ||
    new Set(names).size !== names.length ||
    names.some(
      (n) =>
        ![
          "open-road",
          "urban-street",
          "obstructed-corner",
          "enclosure",
          "flyby",
        ].includes(n),
    )
  )
    throw Error("Bounded replay cases");
  const output = privateStoragePath(root, path.resolve(root, destination));
  if (fs.existsSync(output))
    throw Error("Fresh private replay destination required");
  fs.mkdirSync(output, { recursive: true });
  const report = {
    version: 1,
    source: "original-generated",
    coordinateSpace: "research-rh-z-up-metres-v1",
    sampleRate: 48000,
    channels: 2,
    subjectiveListening: "pending",
    cases: [],
  };
  for (const name of names) {
    const d = demo(name),
      c = { ...d, outputSeconds: d.duration },
      rendered = incrementalReference(c),
      bytes = wav([rendered.left, rendered.right]),
      filename = name + "_incremental.wav";
    fs.writeFileSync(path.join(output, filename), bytes, { flag: "wx" });
    report.cases.push({
      name,
      filename,
      frames: rendered.left.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      metrics: audioMetrics([rendered.left, rendered.right]),
      dsp: rendered.renderer.stats,
      simulation: rendered.simulation.stats,
    });
  }
  fs.writeFileSync(
    path.join(output, "replay-metrics.json"),
    JSON.stringify(report, null, 2),
    { flag: "wx" },
  );
  return report;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 3)
    throw Error(
      "Usage: node tools/Replay-Acoustics07.mjs .local/fresh-replay-directory",
    );
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = replay(root, process.argv[2]);
  console.log(
    JSON.stringify({
      cases: result.cases.length,
      nonfinite: result.cases.reduce(
        (n, c) => n + c.metrics.nonfiniteSamples,
        0,
      ),
      clipped: result.cases.reduce((n, c) => n + c.metrics.clippedSamples, 0),
    }),
  );
}
