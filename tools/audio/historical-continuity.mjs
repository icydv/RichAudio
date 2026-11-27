// Reproduce PR #50's actual producer/simulation privately. Only receipt-clock,
// bounded tracing and the instrumented (PCM-identical) DSP are substituted.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { privateStoragePath } from "../../src/acoustics/research/research-private-storage.mjs";
export function historicalProducer(root, destination) {
  const dir = privateStoragePath(root, destination),
    url = (p) => pathToFileURL(path.resolve(root, p)).href;
  if (fs.existsSync(dir)) throw Error("Fresh historical probe required");
  fs.mkdirSync(dir, { recursive: true });
  const head = "2631b01e0c77ed404610b130b3e6a19e010f9551";
  const read = (p) =>
    execFileSync("git", ["show", `${head}:${p}`], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1048576,
    });
  const old = read("src/acoustics/streaming/causal.mjs"),
    current = fs.readFileSync(
      path.join(root, "src/acoustics/streaming/causal.mjs"),
      "utf8",
    );
  let causal =
    old.slice(0, old.indexOf("export class StreamingRenderer")) +
    current.slice(current.indexOf("export class StreamingRenderer"));
  causal = causal.replace(
    /from "(\.\.\/[^\"]+)"/g,
    (_, p) =>
      "from " + JSON.stringify(url(path.join("src/acoustics/streaming", p))),
  );
  fs.writeFileSync(path.join(dir, "causal.mjs"), causal, { flag: "wx" });
  let worker = read("src/acoustics/streaming/simulation-worker.mjs")
    .replace(
      '"./causal.mjs"',
      JSON.stringify(url(path.join(dir, "causal.mjs"))),
    )
    .replace(
      '"../../../tools/acoustics-06-scenes.mjs"',
      JSON.stringify(url("tools/acoustics-06-scenes.mjs")),
    );
  fs.writeFileSync(path.join(dir, "worker.mjs"), worker, { flag: "wx" });
  let producer = read("tools/Run-Acoustics07.mjs");
  producer = producer
    .replace(
      '"../src/acoustics/streaming/causal.mjs"',
      JSON.stringify(url(path.join(dir, "causal.mjs"))),
    )
    .replace(
      '"../src/acoustics/streaming/listener-playout.mjs"',
      JSON.stringify(url("src/acoustics/streaming/listener-playout.mjs")),
    );
  producer = producer
    .replace(
      '"../src/acoustics/streaming/simulation-worker.mjs"',
      JSON.stringify(url(path.join(dir, "worker.mjs"))),
    )
    .replace(
      "new StreamingRenderer({ sourceIds: ids })",
      "new StreamingRenderer({ sourceIds: ids, historyDiagnostics:true })",
    );
  producer = producer.replace(
    'else throw Error("Unknown producer option");',
    'else if (["--headless-clock", "--trace-blocks", "--listener-delay-ms"].includes(args[i])) {}\n  else throw Error("Unknown producer option");',
  );
  producer = producer
    .replaceAll(
      "performance.now() - external.receivedAt",
      "renderer.frame / FS * 1000 - external.receivedAt",
    )
    .replace(
      "listenerPlayout.sample(now, performance.now())",
      "listenerPlayout.sample(now, renderer.frame / FS * 1000)",
    )
    .replace(
      "listenerPlayout.add(m, renderer.frame / FS, performance.now())",
      "listenerPlayout.add(m, renderer.frame / FS, renderer.frame / FS * 1000)",
    )
    .replace(
      "receivedAt: performance.now()",
      "receivedAt: renderer.frame / FS * 1000",
    );
  producer = producer.replace(
    "dsp: renderer.stats,",
    "dsp: renderer.stats, historyDiagnostics: renderer.historyDiagnostics,",
  );
  producer = producer.replace(
    "stats.blocks++;",
    'stats.blocks++; log({type:"block",frame:renderer.frame-BLOCK,mode:lastPlayout?.mode??"synthetic",targetTime:lastPlayout?.targetTime??now,age:lastPlayout?.newestAgeSeconds??0,prediction:lastPlayout?.extrapolationSeconds??0,pan:lastControl.paths.find(p=>p.order===0)?.pan??null,missingHistory:renderer.stats.missingHistory,history:{...renderer.historyDiagnostics}});',
  );
  const filename = path.join(dir, "producer.mjs");
  fs.writeFileSync(filename, producer, { flag: "wx" });
  return filename;
}
