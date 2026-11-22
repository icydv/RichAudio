import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readJson, writeJson} from './audio/powertrain-drive.mjs';
import {makeTrafficRoute} from './audio/mapped-traffic-route.mjs';

const [input, output] = process.argv.slice(2);
assert(input && output, 'Supply the retained placement and a fresh private output directory');
const directory = path.resolve(output);
assert(directory.startsWith(fileURLToPath(new URL('../.local/', import.meta.url))) && !fs.existsSync(directory));
const placement = readJson(input);
fs.mkdirSync(directory, {recursive:true});
for (const type of ['exit','covered']) writeJson(path.join(directory,type+'.json'), makeTrafficRoute(placement,type));
