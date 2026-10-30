// Private, controlled extension of the published Source05 audition. No game/endpoint access.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VehicleAcousticPipeline, encodeVehicleWav } from '../src/acoustics/vehicle/pipeline.mjs';
import { StreamingRenderer } from '../src/acoustics/streaming/causal.mjs';
import { createUrbanEnvironment } from '../src/acoustics/vehicle/urban-environment.mjs';
import { vehicleDistanceSceneOptions } from '../src/acoustics/vehicle/distance-presentation.mjs';
import { acousticScene } from '../src/acoustics/engine/contracts.mjs';
import { audioMetrics } from '../src/acoustics/engine/signals.mjs';
import { stockEmitters } from './stock-source-01-scenario.mjs';
import { source04DelayedFlybyOperating } from './Render-StockSource04.mjs';
import { stockExteriorPressure } from '../src/acoustics/vehicle/stock-pressure.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const FS = 48000, BLOCK = 512, MASTER = .7, DURATION = 10.3;
const multipliers = [2.5, 5, 7, 7.5, 10], commonGain = .25;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const gainName = gain => String(gain).replace('.', 'p');
const esc = value => String(value).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));

function readWav(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(b.readUInt16LE(20), 3); assert.equal(b.readUInt16LE(22), 2); assert.equal(b.readUInt32LE(24), FS);
  assert.equal(b.readUInt16LE(34), 32); assert.equal(b.toString('ascii', 36, 40), 'data');
  assert.equal(b.length, 44 + b.readUInt32LE(40));
  const channels = [new Float32Array((b.length - 44) / 8), new Float32Array((b.length - 44) / 8)];
  for (let i = 0; i < channels[0].length; i++) for (let c = 0; c < 2; c++) channels[c][i] = b.readFloatLE(44 + i * 8 + c * 4);
  return channels;
}
function faults(renderer) {
  return ['limited','missingHistory','cursorResets','rejectedControls','pathOverflow'].every(key => renderer.stats[key] === 0)
    && renderer.historyDiagnostics.affectedFrames === 0;
}
function windowMetrics(channels, begin, end) {
  return audioMetrics(channels.map(channel => channel.subarray(Math.round(begin * FS), Math.round(end * FS))));
}

export async function renderPressureComparison({
  audition = path.join(root, '.local/stock-source-05/audition'),
  frozenRoot = path.resolve(root, '../RichAudio-StockSource04'),
} = {}) {
  const out = path.join(audition, 'exhaust-pressure');
  assert.ok(path.resolve(audition).startsWith(path.join(root, '.local') + path.sep));
  assert.ok(!fs.existsSync(out), 'fresh comparison directory required');
  const reportFile = path.join(audition, 'render-report.json');
  const publishedBytes = fs.readFileSync(reportFile), published = JSON.parse(publishedBytes);
  assert.equal(published.status, 'complete'); assert.equal(published.commonPressureGain, 1);
  const protectedFiles = new Map([[reportFile, sha(publishedBytes)], [path.join(audition, 'index.html'), sha(fs.readFileSync(path.join(audition, 'index.html')))]]);
  // Bind the exact delivered source implementation, even while generic catalogue work continues separately.
  for (const file of published.frozenSourceFiles) {
    const filename = path.join(frozenRoot, file), hash = sha(fs.readFileSync(filename));
    assert.equal(hash, published.moduleBindings[file]); protectedFiles.set(filename, hash);
  }
  const { loadStockAssets, loadStockExhaustPops, StockVehicleSource, stockModels, stockRoles } =
    await import(pathToFileURL(path.join(frozenRoot, 'src/acoustics/vehicle/stock-source.mjs')));
  const assets = loadStockAssets(published.inputs.manifestFile, { sustainAtlasFile: published.inputs.sustainAtlasFile });
  const pops = loadStockExhaustPops(published.inputs.popManifestFile), mix = JSON.parse(fs.readFileSync(published.inputs.mixFile));
  const report = { schemaVersion: 1, status: 'rendering', basis: 'Published Source05 frozen source performance and acoustic configuration',
    sampleRate: FS, durationSeconds: DURATION, multipliers, commonGain, commonGainDb: 20 * Math.log10(commonGain),
    rendererMasterGain: MASTER, sourceGain: mix.sourceGain, files: [], cases: [],
    processing: 'Actual engine/exhaust acoustic stems; linear pressure sum commonGain*(engine + multiplier*exhaust). Same scalar on every delivered file; no independent normalization, EQ or limiter.',
    referenceMeaning: 'Multipliers relative to original Source05 engine1/exhaust1 emitter calibration;2.5 is current published balance. Digital calibration, not measured SPL.',
    acousticEngineChanged: false, sourcePlayerChanged: false, gameLaunched: false, endpointOpened: false,
    subjectiveListeningPerformed: false, perceptualAcceptance: 'User selected10x pressure; source quality and runtime acceptance OPEN',
    selectedPressureProfile: stockExteriorPressure,
    limitations: ['This isolates exhaust balance, not exhaust resonance or source texture. Existing Lectro/X80 stepping remains open.',
      'Street geometry is the authored24m Source05 canyon, not imported Legion Square.', 'Offline render timings do not establish live fleet performance.'] };
  fs.mkdirSync(out);
  const save = () => json(path.join(out, 'report.json'), report); save();
  for (const model of stockModels) for (const sceneName of ['road-exhaust', 'urban24']) {
    const before = published.files.find(record => record.model === model && record.name === sceneName);
    assert.ok(before); const beforeFile = path.join(audition, before.file);
    protectedFiles.set(beforeFile, sha(fs.readFileSync(beforeFile))); assert.equal(protectedFiles.get(beforeFile), before.sha256);
    const reference = readWav(beforeFile), total = Math.round(DURATION * FS), ids = stockRoles.map(role => 'stock:' + model + ':' + role);
    const profile = mix.profiles[model], events = before.eventPlan;
    const player = new StockVehicleSource(assets.vehicles.get(model), { sourceGain: mix.sourceGain,
      pressureSharesByState: profile.pressureSharesByState,
      ...(events.length ? { exhaustEvents: { assets: pops, triggers: events } } : {}) });
    const authored = createUrbanEnvironment({ width: 24, includeFacades: sceneName === 'urban24', length: 240, height: 24,
      duration: DURATION, maxOrder: 10, maxPaths: 32 });
    const scene = acousticScene(authored.scene.tile, authored.scene.materials,
      { ...authored.scene.config, ...vehicleDistanceSceneOptions('authored-detail-loss-v1') });
    const pipeline = new VehicleAcousticPipeline({ scene, sourceIds: ids, quality: 'quality', acceleration: 'cpu', masterGain: MASTER,
      sourcePressureGains: { [ids[0]]: commonGain, [ids[1]]: commonGain * 2.5 } });
    const stems = Object.fromEntries(stockRoles.map(role => [role, {
      renderer: new StreamingRenderer({ sourceIds: ids, maxPathsPerSource: 32, pathCapacityPerSource: 64, masterGain: MASTER,
        historyDiagnostics: true, generationReleaseGuard: true }),
      channels: [new Float32Array(total), new Float32Array(total)], block: [new Float32Array(BLOCK), new Float32Array(BLOCK)] }]));
    const e = new Float32Array(BLOCK), x = new Float32Array(BLOCK), left = new Float32Array(BLOCK), right = new Float32Array(BLOCK);
    const sourceHash = createHash('sha256'), controlHash = createHash('sha256'), motionHash = createHash('sha256');
    const listener = published.scenario.listener;
    let maximumReferenceError = 0, maximumSumError = 0, deadlineMisses = 0, maximumBlockMs = 0;
    try {
      for (let at = 0; at < total; at += BLOCK) {
        const start = performance.now(), frames = Math.min(BLOCK, total - at), time = at / FS;
        const control = source04DelayedFlybyOperating(time), pose = { position: [22 * (time - 5.3), 0, 0], velocity: [22, 0, 0],
          forward: [1, 0, 0], up: [0, 0, 1], speed: 22, acceleration: 0 };
        player.renderInto(control, e, x, frames);
        sourceHash.update(Buffer.from(e.buffer, 0, frames * 4)); sourceHash.update(Buffer.from(x.buffer, 0, frames * 4));
        controlHash.update(JSON.stringify([time, control])); motionHash.update(JSON.stringify([time, pose, listener]));
        const sources = stockEmitters(model, pose).map(source => ({ ...source,
          directivity: profile.directivity[source.id.endsWith('engine') ? 'engine' : 'exhaust'] }));
        const paths = await pipeline.prepare({ time, session: 'source05-city', generation: 1, listener, sources });
        const inputs = { [ids[0]]: e, [ids[1]]: x };
        pipeline.process(inputs, left, right, frames);
        const elapsed = performance.now() - start;
        maximumBlockMs = Math.max(maximumBlockMs, elapsed); if (elapsed > frames / FS * 1000) deadlineMisses++;
        for (const [role, stem] of Object.entries(stems)) {
          stem.renderer.accept({ ...paths, paths: paths.paths.filter(item => item.sourceId === 'stock:' + model + ':' + role) });
          stem.renderer.process(inputs, ...stem.block, frames);
          for (let c = 0; c < 2; c++) stem.channels[c].set(stem.block[c].subarray(0, frames), at);
        }
        for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) {
          const actual = c === 0 ? left[i] : right[i];
          maximumReferenceError = Math.max(maximumReferenceError, Math.abs(actual - reference[c][at + i] * commonGain));
          maximumSumError = Math.max(maximumSumError,
            Math.abs(actual - commonGain * (stems.engine.block[c][i] + 2.5 * stems.exhaust.block[c][i])));
        }
      }
      const hashes = { sourceHash: sourceHash.digest('hex'), controlHash: controlHash.digest('hex'), motionHash: motionHash.digest('hex') };
      for (const [key, value] of Object.entries(hashes)) assert.equal(value, before[key], model + '/' + sceneName + '/' + key);
      assert.ok(maximumReferenceError < 2e-7 && maximumSumError < 2e-7);
      assert.ok(faults(pipeline.renderer) && Object.values(stems).every(stem => faults(stem.renderer)));
      const caseRecord = { model, sceneName, ...hashes, publishedReferenceSha256: before.sha256, maximumReferenceError, maximumSumError,
        deadlineMisses, maximumBlockMs, timingScope: 'Full renderer only; diagnostic stem passes excluded',
        renderer: { ...pipeline.renderer.stats }, history: pipeline.renderer.historyDiagnostics };
      report.cases.push(caseRecord);
      for (const multiplier of multipliers) {
        const channels = [0, 1].map(c => Float32Array.from(stems.engine.channels[c], (sample, i) =>
          commonGain * (sample + multiplier * stems.exhaust.channels[c][i])));
        const metrics = audioMetrics(channels);
        assert.ok(metrics.nonfiniteSamples === 0 && metrics.clippedSamples === 0 && metrics.peak < .98, 'common gain lacks headroom');
        const relative = model + '/' + sceneName + '-' + gainName(multiplier) + 'x.wav', file = path.join(out, relative);
        const bytes = encodeVehicleWav(channels); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
        report.files.push({ model, sceneName, multiplier, exhaustDbAboveCurrent2p5: 20 * Math.log10(multiplier / 2.5),
          file: relative, sha256: sha(bytes), metrics, nearPass: windowMetrics(channels, 4.8, 5.8),
          liftAndRecession: windowMetrics(channels, 6.3, 10.3), ...hashes });
      }
      save(); console.log(model + ' ' + sceneName + ':5 gains; reference error=' + maximumReferenceError + '; misses=' + deadlineMisses);
    } finally { pipeline.close(); }
  }
  for (const [file, hash] of protectedFiles) assert.equal(sha(fs.readFileSync(file)), hash, 'published/frozen input changed:' + file);
  report.protectedFilesUnchanged = true; report.status = 'complete'; save();
  const page = writePressureComparisonPage(audition, report);
  console.log(JSON.stringify({page, files:report.files.length, maximumPeak:Math.max(...report.files.map(file=>file.metrics.peak))}));
  return report;
}

export function writePressureComparisonPage(audition, report) {
  assert.equal(report.status, 'complete');
  assert.equal(report.files.length, 40);
  const titles = { schafter3: 'Schafter', bati: 'Bati', lectro: 'Lectro', prototipo: 'X80 Proto' };
  const groups = [];
  for (const [model, title] of Object.entries(titles)) for (const sceneName of ['road-exhaust', 'urban24']) {
    const files = report.files.filter(file => file.model === model && file.sceneName === sceneName);
    assert.equal(files.length, 5);
    groups.push('<section><h2>' + esc(title) + ' · ' + (sceneName === 'urban24' ? '24m street' : 'Open roadside') + '</h2><div class="grid">'
      + files.map(file => '<div><b>' + file.multiplier + '× exhaust' + (file.multiplier === 2.5 ? ' · current balance' : '') + '</b><p>Peak '
        + (20 * Math.log10(file.metrics.peak)).toFixed(2) + 'dBFS · +' + file.exhaustDbAboveCurrent2p5.toFixed(2)
        + 'dB exhaust versus current</p><audio controls preload="none" data-group="' + model + sceneName + '" src="exhaust-pressure/'
        + esc(file.file) + '"></audio></div>').join('') + '</div></section>');
  }
  const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Exhaust pressure comparison</title>'
    + '<style>body{background:#10151c;color:#eaf0f8;font:16px system-ui;line-height:1.5;margin:24px auto;max-width:1280px;padding:0 18px}a{color:#acd7ff}section{background:#19222e;padding:18px;margin:20px 0;border-radius:10px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}audio{width:100%}p{color:#bdc8d5}.controls{position:sticky;top:0;background:#283b52;padding:15px;z-index:1}</style>'
    + '<h1>Exhaust pressure comparison ·10× selected</h1><p>You selected10× after listening. Current2.5× alongside requested5×,7×,7.5× and10× remains available for comparison. Each group uses identical source PCM, driving performance, path controls and engine level. Only exhaust pressure changes.</p>'
    + '<p>Every file, including2.5×, has the same −12.04dB headroom trim. These play quieter than the previous page; set playback volume once for this set, then keep it fixed while comparing. No individual normalization, compression, EQ or limiting. Pressure multipliers are authored game calibration, not measured SPL.</p>'
    + '<p>Pitch stepping on Lectro/X80 remains open. These files test exhaust balance; they do not establish perceptual acceptance or live readiness.</p>'
    + '<p><a href="index.html">Preserved city audition</a> · <a href="exhaust-pressure/report.json">Measurements and exact bindings</a></p>'
    + '<div class="controls"><label>Common volume <input id="volume" type="range" min="0" max="1" step=".01" value="1"></label> <button id="pause">Pause all</button> <label><input id="carry" type="checkbox" checked>Carry position when switching within a group</label></div>'
    + groups.join('') + '<script>const players=[...document.querySelectorAll("audio")];let prior=null,changing=false;function volume(v){if(changing)return;changing=true;document.querySelector("#volume").value=v;players.forEach(a=>{if(a.volume!==v)a.volume=v});changing=false}document.querySelector("#volume").oninput=e=>volume(+e.target.value);players.forEach(a=>{a.addEventListener("volumechange",()=>volume(a.volume));a.addEventListener("play",()=>{if(prior&&prior!==a&&prior.dataset.group===a.dataset.group&&document.querySelector("#carry").checked&&Number.isFinite(a.duration)&&prior.currentTime<a.duration)a.currentTime=prior.currentTime;players.forEach(b=>{if(b!==a)b.pause()});prior=a})});document.querySelector("#pause").onclick=()=>players.forEach(a=>a.pause());</script></html>';
  const page = path.join(audition, 'exhaust-pressure.html'); assert.ok(!fs.existsSync(page)); fs.writeFileSync(page, html);
  return page;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  renderPressureComparison().catch(error => { console.error(error); process.exitCode = 1; });
