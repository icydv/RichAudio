// Silent production replay + actual host PcmRing gain. Never invokes HostProgram.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { runHeadless, measure } from "./audio/headless-stream.mjs";
import { pcmHash, spatialSchedule, fundamentalPeak, envelope, verifyWav } from "./audio/beacon-analysis.mjs";
import { wav, audioMetrics } from "../src/acoustics/engine/signals.mjs";
import { privateStoragePath } from "../src/acoustics/research/research-private-storage.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = privateStoragePath(root, path.resolve(root, process.argv[2] ?? ".local/beacon-600hz-new"));
const sink = process.argv[3];
if (!sink || fs.existsSync(output)) throw Error("Compiled device-free sink and fresh private output required");
fs.mkdirSync(output, { recursive: true });
const report = { schema: 1, scope: "silent pre-device; actual producer and PcmRing; no listening", referenceSource: "be8e60c71d9c28808b2ca6b866eed7f5ff7d41b5", defaults: { frequencyHz: 95, sourceLevel: 0.22, hostGain: 0.08, listenerBufferMs: 100 }, candidate: { frequencyHz: 600, sourceLevel: 0.44, hostGain: 0.20 }, results: [], comparisons: [] };
function save(name, r) {
  const bytes = wav([r.left, r.right]); fs.writeFileSync(path.join(output, name + ".wav"), bytes, { flag: "wx" });
  const validation = verifyWav(fs.readFileSync(path.join(output, name + ".wav")), r);
  if(name.startsWith("stationary-600Hz"))assert.equal(fundamentalPeak(validation.decoded,600).frequencyHz,600);
  delete validation.decoded;
  return { sha256: createHash("sha256").update(bytes).digest("hex"), validation };
}
function gainPcm(name, r, gain) {
  const input = Buffer.alloc(r.left.length * 8);
  for (let i = 0; i < r.left.length; i++) { input.writeFloatLE(r.left[i], i * 8); input.writeFloatLE(r.right[i], i * 8 + 4); }
  const source = path.join(output, name + "-input.f32"), dest = path.join(output, name + "-gain.f32");
  fs.writeFileSync(source, input, { flag: "wx" });
  execFileSync(sink, [source, dest, String(gain)], { windowsHide: true, timeout: 10000 });
  const b = fs.readFileSync(dest); assert.equal(b.length, input.length);
  const left = new Float32Array(r.left.length), right = left.slice();
  for (let i = 0; i < left.length; i++) {
    left[i] = b.readFloatLE(i * 8); right[i] = b.readFloatLE(i * 8 + 4);
    assert.equal(left[i], Math.fround(r.left[i] * Math.fround(gain)));
    assert.equal(right[i], Math.fround(r.right[i] * Math.fround(gain)));
  }
  return { left, right };
}
for (const name of ["stationary", "turn", "emission-stop"]) {
  const base = await runHeadless({ name, seconds: 4 });
  const frequencyOnly = await runHeadless({ name, seconds: 4, extraArgs: ["--beacon-frequency-hz", "600"] });
  const candidate = await runHeadless({ name, seconds: 4, extraArgs: ["--beacon-frequency-hz", "600", "--beacon-level", "0.44"] });
  assert.deepEqual(spatialSchedule(frequencyOnly), spatialSchedule(base));
  assert.deepEqual(spatialSchedule(candidate), spatialSchedule(base));
  for (const [label, r, frequency, sourceLevel, gains] of [["reference", base, 95, 0.22, [0.12]], ["frequency-only", frequencyOnly, 600, 0.22, [0.12]], ["candidate", candidate, 600, 0.44, [0.12, 0.20]]]) {
    assert.equal(r.exitCode, 0); assert.equal(r.final.dsp.missingHistory, 0); assert.equal(r.final.dsp.limited, 0);
    const entry = { scenario: name, label, frequencyHz: frequency, sourceLevel, pcmSha256: pcmHash(r), preGain: measure(r), frequency: name === "stationary" ? fundamentalPeak(r, frequency) : null, outputs: [], final: r.final, sink: r.sink };
    delete entry.preGain.windows;
    for (const gain of gains) {
      const key = `${name}-${frequency}Hz-level-${sourceLevel}-gain-${gain}`, g = gainPcm(key, r, gain);
      const metrics = audioMetrics([g.left, g.right]);
      assert.equal(metrics.nonfiniteSamples, 0); assert.equal(metrics.clippedSamples, 0); assert.ok(metrics.peak < 0.1);
      const artifact = save(key,g);
      entry.outputs.push({ gain, wavSha256: artifact.sha256, wavValidation: artifact.validation, ...metrics, headroomDb: -20 * Math.log10(metrics.peak), steadyEnvelope: name === "stationary" ? envelope(g) : null });
    }
    fs.writeFileSync(path.join(output, `${name}-${frequency}Hz-level-${sourceLevel}-trace.json`), JSON.stringify(r.trace), { flag: "wx" });
    report.results.push(entry);
  }
  report.comparisons.push({ scenario: name, identicalNonPcmSchedule: true, missingHistoryEqual: true });
}
const stationary = report.results.find(r => r.scenario === "stationary" && r.label === "candidate");
report.sameFrequencyGainIncreaseDb = 20 * Math.log10(stationary.outputs[1].rms / stationary.outputs[0].rms);
report.expectedGainIncreaseDb = 20 * Math.log10(0.20 / 0.12);
const legacy = report.results.find(r => r.scenario === "stationary" && r.label === "reference");
const frequencyOnly = report.results.find(r => r.scenario === "stationary" && r.label === "frequency-only");
report.candidateVsLegacyRmsDb = 20 * Math.log10(stationary.outputs[1].rms / legacy.outputs[0].rms);
report.frequencyOnlyVsLegacyRmsDb = 20 * Math.log10(frequencyOnly.outputs[0].rms / legacy.outputs[0].rms);
assert.ok(report.candidateVsLegacyRmsDb > 0, "Candidate must actually exceed legacy fixture RMS");
assert.ok(Math.abs(report.sameFrequencyGainIncreaseDb - report.expectedGainIncreaseDb) < 0.00001);
fs.writeFileSync(path.join(output, "metrics.json"), JSON.stringify(report, null, 2), { flag: "wx" });
fs.writeFileSync(path.join(output, "LISTEN-LATER.txt"), "Generated silently; never played. Compare stationary-95Hz-level-0.22-gain-0.12.wav with stationary-600Hz-level-0.44-gain-0.2.wav later. The other 600Hz files separate source level and master gain. Turn and emission-stop examples preserve the same spatial/control schedule. These are synthetic metric scenes, not GTA propagation or listening acceptance.\n", { flag: "wx" });
console.log(JSON.stringify({ output, measuredFundamentalHz: stationary.frequency.frequencyHz, gainIncreaseDb: report.sameFrequencyGainIncreaseDb, candidate: stationary.outputs[1], endpointOpened: false, played: false }));
