const maximumPhases = 8;
const maximumHighRevSamples = 96;
const sampleEveryBlocks = 8;
const highRevSampleEveryBlocks = 3;

const meter = () => ({samples: 0, energy: 0, peak: 0});
function measure(result, pcm) {
  for (const value of pcm) {
    result.peak = Math.max(result.peak, Math.abs(value));
    result.energy += value * value;
  }
  result.samples += pcm.length;
}
const level = ({samples, energy, peak}) => ({samples, peak, rms: samples ? Math.sqrt(energy / samples) : null});
const range = (prior, value) => prior ? [Math.min(prior[0], value), Math.max(prior[1], value)] : [value, value];

// Sample after processing and RA07 tagging. A scene publication on its own
// cannot establish which routes had a mixer slot in that output block.
export function powertrainPathBlock(pipeline, packetSequence, vehicle) {
  const {renderer, simulation, lastControl} = pipeline;
  const sample = simulation.lastInstalledPaths01;
  if (!sample || !lastControl || !simulation.scene?.tile || sample.frame !== packetSequence * 512 ||
      lastControl.frame !== sample.frame || renderer.frame !== sample.frame + 512 ||
      sample.observationKey !== simulation.scene.tile.observationKey) return null;

  const selected = lastControl.paths.filter(p => p.order > 0 && p.diagnosticReflection);
  const byOrder = {};
  const groups = new Map();
  for (const route of selected) {
    byOrder[route.order] = (byOrder[route.order] ?? 0) + 1;
    const key = route.sourceId + ':' + route.order;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(route);
  }
  // One representative per emitter and order comes before extra paths, so a
  // busy engine cannot fill every diagnostic row before exhaust is sampled.
  // Cycle through each group on successive 16-block diagnostic snapshots.
  const index = Math.floor(packetSequence / 16);
  const representatives = Array.from(groups.values(), routes => routes[index % routes.length]);
  const rows = [...new Set([...representatives, ...selected])].slice(0, 6);
  return {...sample, packetSequence, sourceSequence: vehicle.powertrainSequence, revision: vehicle.powertrainRevision,
    vehicleId: vehicle.id, vehicleGeneration: vehicle.generation, selectedByOrder: byOrder,
    reflected: rows.map(p => {
      const slot = renderer.slots.find(s => s.active && s.present && s.id === p.id && s.generation === p.generation);
      return {sourceId:p.sourceId, order:p.order, ...p.diagnosticReflection, distance:p.distance, delay:p.delay,
        arrivalDirection:p.arrivalDirection, arrivalOrigin:p.arrivalOrigin, bands:p.bands,
        mixerEndBands:slot ? Array.from(slot.gain) : null};
    })};
}

// Bounded opt-in measurements on the existing producer thread. Units are
// normalized rev ratio, native camera coordinates, and digital full scale.
export class PowertrainVoiceEvidence {
  phases = new Map();
  highRev = null;
  rendererLimitedSamples = 0;

  accept(frame) {
    const {powertrainRevision: revision, powertrainGate: mode, listener} = frame;
    const vehicle = frame.vehicles[0];
    if (!vehicle) return;
    if (!this.phases.has(revision)) {
      if (this.phases.size === maximumPhases) this.phases.delete(this.phases.keys().next().value);
      this.phases.set(revision, {revision, mode, blocks: 0, inputRange: null, engineDistance: null, exhaustDistance: null,
        dryEngine: meter(), dryExhaust: meter(), renderedOutput: meter()});
    }
    const phase = this.phases.get(revision);
    const {observationTicks, operatingPoint} = vehicle;
    phase.inputRange = range(phase.inputRange, operatingPoint);
    if (mode === 'voice' && operatingPoint >= .85 && this.highRev === null)
      this.highRev = {revision, beganQpc: observationTicks, throughQpc: observationTicks + 3 * listener.clockFrequency,
        clockFrequency: listener.clockFrequency, input: [], rendered: []};
    if (this.inHighWindow(revision, observationTicks) && this.highRev.input.length < maximumHighRevSamples)
      this.highRev.input.push([listener.sequence, observationTicks, operatingPoint]);
  }

  inHighWindow(revision, ticks) {
    const window = this.highRev;
    return window && revision === window.revision && ticks >= window.beganQpc && ticks <= window.throughQpc;
  }

  render(gameplay, channels) {
    this.rendererLimitedSamples = gameplay.pipeline.renderer.stats.limited;
    const slot = gameplay.slots.find(slot => slot.source);
    if (!slot) return;
    const {powertrainRevision, powertrainSequence, observationTicks, operatingPoint} = slot.vehicle;
    const phase = this.phases.get(powertrainRevision);
    if (!phase) return;
    const block = phase.blocks++;
    if (block % highRevSampleEveryBlocks === 0 && this.inHighWindow(powertrainRevision, observationTicks) &&
        this.highRev.rendered.length < maximumHighRevSamples) {
      const {position, commonRates} = slot.source;
      this.highRev.rendered.push([powertrainSequence, observationTicks, operatingPoint, position, commonRates.engine, commonRates.exhaust]);
    }
    if (block % sampleEveryBlocks !== 0) return;
    const engineId = 'stock:slot' + slot.index + ':engine';
    const exhaustId = 'stock:slot' + slot.index + ':exhaust';
    measure(phase.dryEngine, gameplay.inputs[engineId]);
    measure(phase.dryExhaust, gameplay.inputs[exhaustId]);
    for (const channel of channels) measure(phase.renderedOutput, channel);
    for (const path of gameplay.pipeline.lastControl.paths) {
      if (path.order !== 0) continue;
      if (path.sourceId === engineId) phase.engineDistance = range(phase.engineDistance, path.distance);
      if (path.sourceId === exhaustId) phase.exhaustDistance = range(phase.exhaustDistance, path.distance);
    }
  }

  report() {
    return {
      sampleEveryBlocks,
      highRevSampleEveryBlocks,
      rendererLimitedSamples: this.rendererLimitedSamples,
      phases: [...this.phases.values()].map(p => ({...p,
        dryEngine: level(p.dryEngine), dryExhaust: level(p.dryExhaust), renderedOutput: level(p.renderedOutput)})),
      inputColumns: ['sequence', 'vehicleObservationQpc', 'rawRatio'],
      renderedColumns: ['sourceSequence', 'sourceObservationQpc', 'selectedRatio', 'smoothedRatio', 'engineIntervalHz', 'exhaustIntervalHz'],
      highRev: this.highRev,
    };
  }
}
