import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runHeadless } from "./audio/headless-stream.mjs";
import { orientationEvents } from "./audio/orientation-fixtures.mjs";
import { privateStoragePath } from "../src/acoustics/research/research-private-storage.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)),
  output = privateStoragePath(
    root,
    path.resolve(root, process.argv[2] ?? ".local/orientation-overhead"),
  );
if (fs.existsSync(output)) throw Error("Fresh overhead destination required");
fs.mkdirSync(output, { recursive: true });
const rows = [];
for (const sources of [1, 4])
  for (const experimental of [false, true, true, false]) {
    const r = await runHeadless({
      seconds: 6,
      sources,
      events: orientationEvents({ kind: "turn", phase: 0 }, 6),
      extraArgs: experimental ? ["--experimental-orientation", "50ms"] : [],
    });
    rows.push({
      sources,
      experimental,
      blocks: r.trace.length,
      simulationMs: r.final.statistics.simulationMs,
      dspMs: r.final.statistics.dspMs,
      orientationMs: r.final.statistics.orientationMs,
      cpuSeconds: r.final.cpuSeconds,
      wallSeconds: r.final.wallSeconds,
      memory: r.final.memory,
      ownedArrayBytes: r.final.ownedArrayBytes,
      paths: r.final.statistics.pathMaximum,
      missingHistory: r.final.dsp.missingHistory,
      limited: r.final.dsp.limited,
      maximumOutstandingCredits: r.sink.maximumOutstandingCredits,
    });
  }
fs.writeFileSync(
  path.join(output, "overhead.json"),
  JSON.stringify(
    {
      schema: 1,
      scope:
        "accelerated silent producer with diagnostic tracing; no callback/device benchmark",
      rows,
    },
    null,
    2,
  ),
  { flag: "wx" },
);
console.log(
  JSON.stringify(
    rows.map(({ memory, ...row }) => ({
      ...row,
      rssMiB: memory.rss / 1048576,
    })),
    null,
    2,
  ),
);
