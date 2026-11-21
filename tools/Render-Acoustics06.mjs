import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { privateStoragePath } from "../src/acoustics/research/research-private-storage.mjs";
import { demo } from "./acoustics-06-scenes.mjs";
import { prepare, render } from "../src/acoustics/engine/renderer.mjs";
import { wav, audioMetrics, signal } from "../src/acoustics/engine/signals.mjs";
import {
  ownedSource,
  acousticScene,
  material,
} from "../src/acoustics/engine/contracts.mjs";
export function generate(root, output) {
  output = privateStoragePath(root, path.resolve(root, output));
  if (fs.existsSync(output)) throw Error("fresh demo output required");
  fs.mkdirSync(output, { recursive: true });
  const report = {
    version: 1,
    domain: "original-synthetic-metres",
    backend: "original-finite-path-pcm-v1",
    noGameAccess: true,
    subjectiveListening: "pending",
    demos: [],
  };
  for (const [label, name] of [
    ["A", "open-road"],
    ["B", "urban-street"],
    ["C", "obstructed-corner"],
    ["D", "enclosure"],
    ["E", "flyby"],
  ]) {
    const d = demo(name),
      plan = prepare(d.scene, [d.source], d.listener, { duration: d.duration }),
      processed = render(plan),
      dry = d.source.pcm;
    const files = {
      dry: `${label}_${name}_dry.wav`,
      processed: `${label}_${name}_processed.wav`,
    };
    const original = wav([dry]),
      result = wav([processed.left, processed.right]);
    fs.writeFileSync(path.join(output, files.dry), original, { flag: "wx" });
    fs.writeFileSync(path.join(output, files.processed), result, {
      flag: "wx",
    });
    const paths = plan.prepared[0].tracks.map((t) => ({
      id: t.id,
      peak: t.peak,
      states: t.entries.map((p, i) =>
        p
          ? {
              time: (i * plan.step) / 48000,
              distance: p.distance,
              delay: p.delay,
              emissionTime: p.emissionTime,
              pan: p.pan,
              bands: p.bands,
              points: p.points,
              visibility: p.visibility,
            }
          : null,
      ),
    }));
    fs.writeFileSync(
      path.join(output, `${label}_paths.json`),
      JSON.stringify({ geometryKey: plan.geometryKey, paths }, null, 2),
      { flag: "wx" },
    );
    const row = {
      name,
      files,
      sha256: createHash("sha256").update(result).digest("hex"),
      dryMetrics: audioMetrics([dry]),
      processedMetrics: audioMetrics([processed.left, processed.right]),
      render: processed.metrics,
      preparationMs: plan.preparationMs,
      simulation: plan.stats,
      paths: paths.map((p) => ({ id: p.id, peak: p.peak })),
    };
    report.demos.push(row);
    const diagnostic =
      name === "open-road"
        ? {
            name: "direct-only",
            scene: acousticScene(d.scene.tile, d.scene.materials, {
              ...d.scene.config,
              order: 0,
            }),
          }
        : name === "urban-street"
          ? {
              name: "absorptive-walls",
              scene: acousticScene(
                d.scene.tile,
                Object.fromEntries(
                  Object.entries(d.scene.materials).map(([id, m]) => [
                    id,
                    id === "ground"
                      ? m
                      : material({ reflection: [0.5, 0.15, 0.02] }),
                  ]),
                ),
                d.scene.config,
              ),
            }
          : null;
    if (diagnostic) {
      const p = prepare(diagnostic.scene, [d.source], d.listener, {
          duration: d.duration,
        }),
        r = render(p),
        file = `${label}_${name}_${diagnostic.name}.wav`,
        bytes = wav([r.left, r.right]);
      fs.writeFileSync(path.join(output, file), bytes, { flag: "wx" });
      row.comparison = {
        file,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        metrics: audioMetrics([r.left, r.right]),
        render: r.metrics,
        onlyChange: diagnostic.name,
      };
    }
    if (name !== "flyby") {
      const impulse = ownedSource({
          id: "impulse",
          pcm: signal("impulse", 0.1, { amplitude: 0.3 }),
          track: d.track,
        }),
        p = prepare(d.scene, [impulse], d.listener, { duration: 0.6 }),
        r = render(p);
      fs.writeFileSync(
        path.join(output, `${label}_${name}_impulse.wav`),
        wav([r.left, r.right]),
        { flag: "wx" },
      );
    }
  }
  fs.writeFileSync(
    path.join(output, "metrics.json"),
    JSON.stringify(report, null, 2),
    { flag: "wx" },
  );
  return report;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = path.resolve(fileURLToPath(new URL("..", import.meta.url))),
    output = process.argv[2] ?? ".local/acoustics-06-demo";
  const r = generate(root, output);
  console.log(
    JSON.stringify(
      r.demos.map((d) => ({
        scene: d.name,
        peak: d.processedMetrics.peak,
        paths: d.paths.length,
        renderMs: d.render.processingMs,
        simulationMs: d.preparationMs,
        limited: d.render.limitedFrames,
      })),
      null,
      2,
    ),
  );
}
