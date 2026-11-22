import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {preparedGeometryEncoding} from './ui/wire-limits.mjs';

// The producer never waits for a viewer or disk. At most one observer packet
// is in flight. Include the current geometry again if its first frame dropped.
export class ClockedMapRecorder {
  constructor(directory, session) {
    this.session = session;
    this.sentGeneration = null;
    this.busy = true;
    this.worker = new Worker(new URL(import.meta.url), {workerData:{directory, session}});
    this.done = new Promise((resolve,reject) => {
      this.worker.on('message', msg => {
        this.busy = false;
        if (msg === 'full') this.full = true;
      });
      this.worker.on('error', error => { this.error = error; });
      this.worker.on('exit', code => this.error || code ? reject(this.error ?? Error('Clocked map writer stopped')) : resolve());
    });
    this.done.catch(() => {});
  }
  offer(engine, block, packet) {
    const frame = engine.visual?.soundMapFrame;
    if (!frame || frame.audioFrame !== block * 512 || this.busy || this.full || this.error) return;
    const geometry = engine.telemetry.cachedGeometry;
    const include = frame.geometryGeneration && frame.geometryGeneration !== this.sentGeneration;
    if (include && geometry?.generation !== frame.geometryGeneration) return;
    const selected = new Map(engine.pipeline.lastControl.paths.map(p => [p.id,p.order]));
    const renderer = engine.pipeline.renderer;
    const appliedPaths = renderer.slots.filter(s => s.active && s.present && selected.has(s.id)).map(s => ({
      id:s.id, sourceId:s.source.id, order:selected.get(s.id), present:true, generation:s.generation,
      atFrame:renderer.frame, delayMs:(renderer.frame - s.cursor) / 48, gainBands:[...s.gain], pan:s.pan}));
    const renderedVoices = engine.slots.filter(s => s.source && s.vehicle).map(s => ({
      vehicle:s.vehicle.id, model:s.vehicle.model, context:s.vehicle.context, observedGeneration:s.vehicle.generation,
      renderGeneration:s.generation, operatingPoint:s.vehicle.operatingPoint, voice:s.source.vehicle.model,
      engine:'stock:slot'+s.index+':engine', exhaust:'stock:slot'+s.index+':exhaust'}));
    const encoded = include ? preparedGeometryEncoding(geometry) : null;
    this.busy = true;
    this.worker.postMessage({session:this.session, block, frame, renderedVoices, appliedPaths,
      pcmSHA256:createHash('sha256').update(packet.subarray(16)).digest('hex'),
      geometry:include && !encoded ? geometry : null, encoded});
    this.sentGeneration = frame.geometryGeneration;
  }
  close() {
    this.worker.postMessage('close');
    return this.done;
  }
}

if (!isMainThread && parentPort && workerData?.directory && workerData?.session) {
  const fd = fs.openSync(path.join(workerData.directory,'clocked-soundmap.jsonl'),'wx');
  let bytes = 0;
  parentPort.on('message', msg => {
    if (msg === 'close') { fs.closeSync(fd); parentPort.close(); return; }
    const {encoded, ...packet} = msg;
    if (encoded) packet.geometry = {...JSON.parse(Buffer.from(encoded.bodyBytes).toString('utf8')), ...encoded.header};
    const line = JSON.stringify(packet) + '\n', size = Buffer.byteLength(line);
    if (bytes + size > 96 * 1024 * 1024) { parentPort.postMessage('full'); return; }
    fs.writeFileSync(fd, line);
    bytes += size;
    parentPort.postMessage('ready');
  });
  parentPort.postMessage('ready');
}
