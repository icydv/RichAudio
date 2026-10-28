// Original synthetic workloads. No audio device, game, source archives or external dependencies.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { createTile } from "../src/acoustics/research/local-geometry.mjs";
import { sceneInput, patch } from "../tests/fixtures/acoustics-scenes.mjs";
import {
  acousticScene,
  material,
  trajectory,
  ownedSource,
} from "../src/acoustics/engine/contracts.mjs";
import {
  prepare,
  render,
  PcmRenderer,
} from "../src/acoustics/engine/renderer.mjs";
import { signal } from "../src/acoustics/engine/signals.mjs";
import { privateStoragePath } from "../src/acoustics/research/research-private-storage.mjs";
import { fixture } from "./acoustics-06-scenes.mjs";

export function workload(name) {
  const count =
    name === "four-moving" ? 4 : name.startsWith("sixteen-") ? 16 : 1;
  const input = sceneInput(
    name === "direct-only" ? "open-road" : "urban-street",
  );
  input.validUntil = 1000000;
  if (name === "direct-only") input.surfaces = [];
  if (name === "128-surfaces") {
    input.surfaces = [
      patch("ground", [0, 0, 0], [0, 0, 1], [1, 0, 0], [18, 12]),
    ];
    for (let i = 0; i < 127; i++)
      input.surfaces.push(
        patch(
          "panel" + String(i).padStart(3, "0"),
          [-17 + (i % 32), 10 + Math.floor(i / 32) * 0.5, 4],
          [0, -1, 0],
          [1, 0, 0],
          [0.3, 1],
        ),
      );
  }
  for (const s of input.surfaces) s.validUntil = input.validUntil;
  const scene =
      name === "sixteen-enclosed"
        ? fixture("enclosure").scene
        : acousticScene(
            createTile(input),
            Object.fromEntries(
              input.surfaces.map((s) => [
                s.id,
                material({ reflection: [0.8, 0.6, 0.4] }),
              ]),
            ),
            { order: 2 },
          ),
    listener = trajectory([{ time: 0, position: [5, 0, 1] }]),
    moving = name.includes("moving") || name === "128-surfaces";
  const sources = Array.from({ length: count }, (_, i) =>
    ownedSource({
      id: "original-" + i,
      pcm: signal("tone", 2, { frequency: 150 + i * 7, amplitude: 0.01 }),
      track: trajectory(
        moving
          ? [
              { time: 0, position: [-10, -3 + i * 0.3, 1] },
              { time: 2, position: [0, -3 + i * 0.3, 1] },
            ]
          : [{ time: 0, position: [-5, 0, 1] }],
      ),
    }),
  );
  return { scene, listener, sources };
}
export function benchmark() {
  const names = [
      "direct-only",
      "early-reflections",
      "four-moving",
      "sixteen-moving",
      "sixteen-enclosed",
      "128-surfaces",
    ],
    results = [];
  const warm = workload("direct-only");
  render(prepare(warm.scene, warm.sources, warm.listener, { duration: 2 }));
  // Forward and reverse orders expose warm-up/order sensitivity instead of claiming a small speedup.
  for (const [order, list] of [
    ["forward", names],
    ["reverse", [...names].reverse()],
  ])
    for (const name of list) {
      if (global.gc) global.gc();
      const before = process.memoryUsage(),
        w = workload(name),
        start = performance.now(),
        plan = prepare(w.scene, w.sources, w.listener, { duration: 2 }),
        preparationMs = performance.now() - start,
        result = render(plan),
        after = process.memoryUsage();
      const processor = new PcmRenderer(plan),
        l = new Float32Array(512),
        r = new Float32Array(512),
        storage = processor.paths.map((p) => p.data),
        bytes = processor.ownedArrayBytes;
      for (let repeat = 0; repeat < 4; repeat++) {
        processor.reset();
        while (processor.position < processor.frames) processor.process(l, r);
      }
      results.push({
        name,
        order,
        sources: w.sources.length,
        surfaces: w.scene.tile.surfaces.length,
        preparationMs,
        simulation: plan.stats,
        dsp: result.metrics,
        rssDeltaBytes: after.rss - before.rss,
        heapUsedDeltaBytes: after.heapUsed - before.heapUsed,
        peakRssBytes: process.resourceUsage().maxRSS * 1024,
        fixedArrayIdentityPreserved:
          storage.every((p, i) => p === processor.paths[i].data) &&
          bytes === processor.ownedArrayBytes,
      });
    }
  return {
    version: 1,
    node: process.version,
    platform: process.platform,
    cpuModel: os.cpus()[0].model,
    logicalCpus: os.cpus().length,
    blockDeadlineMs: (512 / 48000) * 1000,
    measurement:
      "Offline Node process; includes JIT/GC/OS scheduling. Heap deltas are not allocation counts or a real-time certification.",
    allocationAudit: {
      preparation: "allocates source copies, bands, path records and grids",
      processorConstruction: "allocates owned bands and numeric path grids",
      process:
        "no explicit arrays, objects, I/O, geometry queries or locks in normal sample loop; JavaScript VM allocation/GC is not instrumented",
    },
    results,
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = path.resolve(fileURLToPath(new URL("..", import.meta.url))),
    out = privateStoragePath(
      root,
      path.resolve(root, process.argv[2] ?? ".local/acoustics-06-bench.json"),
    );
  if (fs.existsSync(out)) throw Error("fresh benchmark output required");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const result = benchmark();
  fs.writeFileSync(out, JSON.stringify(result, null, 2), { flag: "wx" });
  console.log(
    JSON.stringify(
      result.results.map((r) => ({
        name: r.name,
        order: r.order,
        sources: r.sources,
        paths: r.dsp.pathSlots,
        prepareMs: r.preparationMs,
        median: r.dsp.medianBlockMs,
        p99: r.dsp.p99BlockMs,
        max: r.dsp.maximumBlockMs,
        arrayBytes: r.dsp.rendererArrayBytes,
        surfaceTests: r.simulation.surfaceTests,
      })),
      null,
      2,
    ),
  );
}
