// Serial equal-work comparison; CPU synthesis/DSP and existing DirectCompute culling.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { renderVehicleCase } from './Render-VehiclePhysics.mjs';
import { privateStoragePath } from '../src/acoustics/research/research-private-storage.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const difference = (a, b) => {
  let maximum = 0, energy = 0, samples = 0;
  for (const channel of ['left', 'right']) for (let i = 0; i < a[channel].length; i++) {
    const d = a[channel][i] - b[channel][i]; maximum = Math.max(maximum, Math.abs(d)); energy += d*d; samples++;
  }
  return { maximumAbsolute: maximum, rms: Math.sqrt(energy / samples), exact: maximum === 0 };
};

export async function benchmarkVehiclePhysics(output, { duration = 3 } = {}) {
  const out = privateStoragePath(root, output); fs.mkdirSync(out, { recursive: true });
  const spec = { id: 'equal-work-tunnel', label: 'Eight V12 components in finite tunnel', operating: 'steady',
    environment: 'tunnel', duration, motion: 'stationary', late: true };
  // Separate run, explicitly excluded from all measurements and output comparisons.
  await renderVehicleCase(spec, { duration: 0.8, quality: 'quality', acceleration: 'cpu' });
  const records = [];
  for (const quality of ['performance', 'balanced', 'quality', 'max']) {
    let reference;
    for (const acceleration of ['cpu', 'gpu', 'auto']) {
      const result = await renderVehicleCase(spec, { duration, quality, acceleration });
      if (acceleration === 'cpu') reference = result;
      const report = result.report;
      records.push({ quality, acceleration, maximumPaths: report.maximumPaths, timings: report.timings,
        wallMs: report.wallMs, nodeCpuMs: report.nodeCpuMs, pcmDifferenceFromCpu: difference(reference, result),
        sourcePcmHash: report.hashes.components, stereoPcmHash: report.hashes.stereoFloat,
        sourceHistoryBytes: report.pipeline.sourceHistoryBytes, directStemHistoryBytes: report.pipeline.directStemHistoryBytes,
        late: report.late, backend: report.pipeline.backend, renderer: report.pipeline.renderer });
      console.log(`${quality}/${acceleration}: p95 total ${report.timings.total.p95Ms.toFixed(3)} ms, DSP ${report.timings.dsp.p95Ms.toFixed(3)} ms, applied GPU ${report.pipeline.backend.gpuResultsApplied}`);
    }
  }
  const data = { schemaVersion: 1, durationSecondsPerCase: duration, blockFrames: 512, sampleRate: 48000,
    cpu: os.cpus()[0]?.model, platform: process.platform, node: process.version,
    execution: { synthesis: 'scalar CPU, bounded additive synthesis', paths: 'CPU finite/retarded-time/material solver',
      gpu: 'existing hardware DirectCompute conservative visibility masks only', dsp: 'CPU source-history interpolation and stereo mix',
      late: 'CPU eight-line FDN', hardwareRayTracing: false, endpointsOpened: false },
    limitations: ['Sequential offline wall-clock processing, not WASAPI deadlines or GTA-load performance',
      'Total includes control preparation, diagnostics, source hashes and RA07 framing; DSP is separately measured',
      'JIT warmed once; per-case GPU device startup reported separately; misses are retained',
      'Small authored scenes do not saturate high quality ceilings; no surfaces manufactured to fill a budget'], records };
  if (records.some(r => !r.pcmDifferenceFromCpu.exact)) throw Error('CPU/GPU vehicle PCM mismatch');
  fs.writeFileSync(path.join(out, 'benchmark.json'), JSON.stringify(data, null, 2));
  return data;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await benchmarkVehiclePhysics(process.argv[2] ?? path.join(root, '.local/vehicle-physics/benchmark'));
