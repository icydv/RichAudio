import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {vehicleBlockFrames as blockFrames,vehicleSampleRate as sampleRate} from '../src/acoustics/vehicle/pipeline.mjs';
import {parseArguments,readJson,voiceInputs,writeJson} from './audio/powertrain-drive.mjs';
import {prepareDriveWindows} from './audio/mapped-drive-scene.mjs';
import {renderMappedPerformance} from './audio/mapped-drive-render.mjs';
import {makeTrafficRoute,trafficDrive} from './audio/mapped-traffic-route.mjs';
import {measureTrafficContributions} from './audio/mapped-traffic-contributions.mjs';
import {measureTrafficReflections,measureTrafficExit} from './audio/mapped-traffic-reflections.mjs';

const command = process.argv.slice(2);
const ranked = command.includes('--ranked-reflections');
if (ranked) command.splice(command.indexOf('--ranked-reflections'), 1);
const heightIndex = command.indexOf('--surface-rms-mm');
let surfaceRoughnessRmsMetres;
if (heightIndex >= 0) {
 const millimetres = command[heightIndex + 1];
 assert(millimetres?.trim() && Number.isFinite(Number(millimetres)) && Number(millimetres) >= 0,
  'Give an RMS surface height in millimetres');
 surfaceRoughnessRmsMetres = Number(millimetres) / 1000;
 command.splice(heightIndex, 2);
}
const args = parseArguments(command), directory = args['--output'];
const privateRoot = fileURLToPath(new URL('../.local/',import.meta.url));
assert(directory.startsWith(privateRoot) && !fs.existsSync(directory),'Choose a fresh private output directory');
const inputs = voiceInputs(args['--package']), placement = readJson(args['--placement']), config = readJson(args['--world']);
assert.equal(inputs.independent.context,'npc','The traffic recording needs the separate stock NPC bank');
const session = randomUUID().replaceAll('-','');
const drive = trafficDrive(makeTrafficRoute(placement));
const blocks = Math.ceil(drive.seconds*sampleRate/blockFrames), file = 'PLAY FIRST — traffic in the passage.wav';
fs.mkdirSync(directory, {recursive:true});
const {windows,diagnostics} = await prepareDriveWindows({config,session,drive,placement,inputs,blocks,
 blockMs:blockFrames*1000/sampleRate,surfaceRoughnessRmsMetres});
writeJson(path.join(directory,'worker-windows.json'),diagnostics);
const take = await renderMappedPerformance({directory,name:'traffic',file,windows,drive,inputs,blocks,session,fleet:true,record:true,
 fleetReflectionPolicy:ranked?'fleet-ranked-reflections':'full'});
const report = {kind:'mapped-passage-traffic',session,sampleRate,blockFrames,normalisation:'none',masterGain:take.settings.masterGain,
 outputLevel:.8, quality:'quality', fleetReflectionPolicy:ranked?'fleet-ranked-reflections':'full', acceleration:'cpu', provenance:'Separately rendered offline, authored 20 Hz vehicle and fixed roadside camera observations',
 ...(surfaceRoughnessRmsMetres===undefined?{}:{surfaceRoughnessRmsMetres}),stages:{traffic:{...take.receipt,file}}};
Object.assign(report,measureTrafficContributions(take,directory));
report.reflections=measureTrafficReflections(take,directory,{requireBoth:!ranked});
report.exit=measureTrafficExit(take);
writeJson(path.join(directory,'result.json'),report);
