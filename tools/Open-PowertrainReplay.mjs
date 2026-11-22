import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import {openPowertrainReplay} from './soundmap/powertrain-replay.mjs';
import {startSoundMap} from './soundmap/server.mjs';

const [folder, ...options] = process.argv.slice(2);
const takeIndex = options.indexOf('--take');
const take = takeIndex < 0 ? 'comparison' : options[takeIndex + 1];
const check = options.includes('--check');
if (!folder || !take || options.filter((_, i) => takeIndex < 0 || i !== takeIndex && i !== takeIndex + 1).some(v => v !== '--check'))
  throw Error('Use node tools/Open-PowertrainReplay.mjs <private demo folder> [--take <name>] [--check]');

const repo = fileURLToPath(new URL('..', import.meta.url));
const local = path.join(await fs.realpath(repo), '.local');
const root = await fs.realpath(folder);
const relative = path.relative(local, root);
if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
  throw Error('Choose a demo folder within this worktree’s .local directory');

const replay = await openPowertrainReplay(root, take);
const service = await startSoundMap({root, port: 0, renderedReplay: replay});
const {token, url} = service.descriptor;
const viewer = url + '/?replay=' + encodeURIComponent(replay.id);
try {
  if (check) {
    const headers = {'Content-Type': 'application/json', 'X-RichAudio-Token': token};
    const opened = await fetch(url + '/api/replay/open', {method: 'POST', headers, body: JSON.stringify({id: replay.id})});
    const manifest = await opened.json();
    if (!opened.ok || !manifest.audio.available || manifest.id !== replay.id) throw Error('Replay manifest readback differs');
    const bytes = await fetch(url + '/api/replay/audio', {headers});
    if (!bytes.ok || !Buffer.from(await bytes.arrayBuffer()).equals(replay.wav)) throw Error('Replay audio readback differs');
    for (const event of replay.events) {
      const browserTimeMs = Math.floor(event.timeMs * 1000) / 1000;
      const response = await fetch(url + '/api/replay/frame?timeMs=' + browserTimeMs, {headers});
      if (!response.ok) throw Error('Replay timeline seek failed');
      if (event.detail?.pathId || event.detail?.withheldPathId || event.detail?.retiredVehicle) {
        const sample = await response.json();
        const frame = sample.frame, detail = event.detail;
        if (!sample.geometry || frame?.sequence !== detail.sequence || frame.streamId !== detail.streamId)
          throw Error('Original witness frame or its geometry is missing');
        if (detail.pathId) {
          const ray = frame.paths.find(ray => ray.id === detail.pathId && ray.status === 'selected');
          if (JSON.stringify(ray?.vertices) !== JSON.stringify(detail.vertices) ||
            JSON.stringify(ray?.surfaceIds) !== JSON.stringify(detail.surfaceIds) ||
            !ray?.surfaceIds?.every(id => sample.geometry.surfaces.some(surface => surface.id === id)))
            throw Error('Selected reflection or ordered wall geometry differs from the witness');
          if (frame.appliedPaths && !frame.appliedPaths.some(tap => tap.id === ray.id && tap.sourceId === ray.sourceId))
            throw Error('Witness route absent from the mixer');
        }
        if (detail.withheldPathId && (frame.appliedPaths.some(tap => tap.id === detail.withheldPathId) ||
          frame.paths.some(ray => ray.id === detail.withheldPathId && ray.status === 'selected')))
          throw Error('Withheld witness route present in the mixer or selection');
        if (detail.retiredVehicle && frame.renderedVoices.some(voice => voice.vehicle === detail.retiredVehicle))
          throw Error('Retired vehicle present at the withdrawal marker');
      }
    }
    console.log(JSON.stringify({verified: true, manifest: replay.manifest, mappedFrames: replay.frames.filter(f => f.frame).length,
      geometryGenerations: replay.geometries.size, events: replay.events}, null, 2));
    await service.close();
  } else {
    console.log('SoundMap replay ' + viewer);
    if (process.platform === 'win32' && process.env.SystemRoot) {
      const browser = spawn(path.join(process.env.SystemRoot, 'explorer.exe'), [viewer], {stdio: 'ignore', windowsHide: true});
      browser.on('error', error => console.error(error.message));
      browser.unref();
    }
    process.once('SIGINT', () => service.close());
    process.once('SIGTERM', () => service.close());
  }
} catch (error) {
  await service.close();
  throw error;
}
