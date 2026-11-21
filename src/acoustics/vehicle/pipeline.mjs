// Offline/source-worker adapter. No endpoint, listener transport or host changes.
import { CausalSimulation, StreamingRenderer } from '../streaming/causal.mjs';
import { AcousticAcceleration } from '../streaming/acoustic-backend.mjs';
import { qualityPresets, qualityReflectors } from '../streaming/acoustic-quality.mjs';
import { stockExteriorPressureGains } from './stock-pressure.mjs';

export const vehicleSampleRate = 48000;
export const vehicleBlockFrames = 512;

// Stock integration entry point: the exact balance/headroom selected by the
// user, independent of unchanged generic and historical audition defaults.
export function createStockVehiclePipeline(options = {}) {
  if (Object.hasOwn(options, 'sourcePressureGains')) throw Error('stock pressure calibration is supplied by the selected shared profile');
  return new VehicleAcousticPipeline({ ...options, sourcePressureGains: stockExteriorPressureGains(options.sourceIds) });
}

export class VehicleAcousticPipeline {
  constructor({ scene, sourceIds, quality = 'quality', acceleration = 'cpu', masterGain = 0.7,
    directStem = false, sourcePressureGains = {}, continuousRates = false, controlFilter = null } = {}) {
    if (!(quality in qualityPresets)) throw Error('explicit acoustic quality required');
    this.simulation = new CausalSimulation(scene);
    this.backend = new AcousticAcceleration({ mode: acceleration });
    this.renderer = new StreamingRenderer({ sourceIds, maxPathsPerSource: qualityPresets[quality],
      pathCapacityPerSource: 64, masterGain, historyDiagnostics: true, generationReleaseGuard: true, sourcePressureGains, continuousRates });
    this.directRenderer = directStem ? new StreamingRenderer({ sourceIds, maxPathsPerSource: 1,
      masterGain, historyDiagnostics: true, generationReleaseGuard: true, sourcePressureGains }) : null;
    this.setQuality(quality);
    this.lastControl = null;
    if(controlFilter!==null&&typeof controlFilter!=='function')throw Error('control filter required');this.controlFilter=controlFilter;
  }
  setQuality(quality) {
    if (!(quality in qualityPresets)) throw Error('explicit acoustic quality required');
    this.quality = quality;
    this.simulation.setProcessingSettings({ pathBudget: qualityPresets[quality], maxReflectors: qualityReflectors[quality] });
    this.renderer.setPathBudget(qualityPresets[quality]);
  }
  setAcceleration(mode) { this.backend.setMode(mode); }
  replaceScene(scene, options) { this.simulation.replaceScene(scene, options); }
  // Called on the source/control worker. GPU preparation is never in process().
  async prepare(snapshot, options = {}) {
    this.simulation.observe(snapshot);
    let control = await this.simulation.updateAccelerated(snapshot.time, options, this.backend);
    if(this.controlFilter)control=this.controlFilter(control,this.renderer);
    this.renderer.accept(control);
    if (this.directRenderer) this.directRenderer.accept({ ...control, paths: control.paths.filter(p => p.order === 0) });
    this.lastControl = control;
    return control;
  }
  // Existing bounded synchronous PCM renderer: caller supplies all buffers.
  process(inputs, left, right, frames = left.length, directLeft = null, directRight = null) {
    if (this.directRenderer && (!(directLeft instanceof Float32Array) || !(directRight instanceof Float32Array) ||
      directLeft.length < frames || directRight.length < frames || directLeft === directRight ||
      directLeft === left || directLeft === right || directRight === left || directRight === right))
      throw Error('independent caller-owned direct-stem buffers required');
    this.renderer.process(inputs, left, right, frames);
    if (this.directRenderer) {
      this.directRenderer.process(inputs, directLeft, directRight, frames);
    }
  }
  diagnostics() {
    return { quality: this.quality, simulation: { ...this.simulation.stats }, renderer: { ...this.renderer.stats },
      history: this.renderer.historyDiagnostics, sourceHistoryBytes: this.renderer.ownedArrayBytes,
      backend: this.backend.diagnostics(), directStemHistoryBytes: this.directRenderer?.ownedArrayBytes ?? 0,
      sourcePressureGains: this.renderer.sourcePressureGains };
  }
  close() { this.backend.close(); }
}

// RA07-compatible frame construction for future owned producer substitution.
// This is framing only; it does not claim host/credit/live integration.
export function encodeVehicleRa07(left, right, sequence, packet = Buffer.alloc(4112)) {
  if (!(left instanceof Float32Array) || !(right instanceof Float32Array) || left.length !== 512 || right.length !== 512 ||
      !Number.isInteger(sequence) || sequence < 0 || sequence > 0xffffffff || !Buffer.isBuffer(packet) || packet.length !== 4112)
    throw Error('bounded RA07 frame required');
  packet.write('RA07', 0, 'ascii'); packet.writeUInt32LE(sequence, 4); packet.writeUInt32LE(512, 8); packet.writeUInt32LE(0, 12);
  for (let i = 0; i < 512; i++) {
    if (![left[i], right[i]].every(x => Number.isFinite(x) && Math.abs(x) <= 1)) throw Error('bounded RA07 PCM required');
    packet.writeFloatLE(left[i], 16 + i * 8); packet.writeFloatLE(right[i], 20 + i * 8);
  }
  return packet;
}

// IEEE float WAV retains quiet physical tails without independent normalisation.
export function encodeVehicleWav(channels) {
  if (!Array.isArray(channels) || channels.length !== 2 || !channels.every(c => c instanceof Float32Array &&
    c.length === channels[0].length && c.length > 0 && c.length <= 2880000)) throw Error('bounded stereo WAV required');
  const frames = channels[0].length, bytes = frames * 8, out = Buffer.alloc(44 + bytes);
  out.write('RIFF', 0); out.writeUInt32LE(bytes + 36, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16);
  out.writeUInt16LE(3, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(48000, 24); out.writeUInt32LE(384000, 28);
  out.writeUInt16LE(8, 32); out.writeUInt16LE(32, 34); out.write('data', 36); out.writeUInt32LE(bytes, 40);
  for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) {
    const sample = channels[c][i];
    if (!Number.isFinite(sample) || Math.abs(sample) > 1) throw Error('bounded WAV sample required');
    out.writeFloatLE(sample, 44 + i * 8 + c * 4);
  }
  return out;
}
