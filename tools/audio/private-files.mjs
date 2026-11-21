import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const privateRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.local/audio-reconstruction');
export const within = (p, r) => {const x = path.relative(r, p); return x !== '' && !x.startsWith('..') && !path.isAbsolute(x);};
export function noLinks(p) {for (let n = path.resolve(p);;) {if (fs.existsSync(n) && fs.lstatSync(n).isSymbolicLink()) throw Error('linked path rejected'); const parent = path.dirname(n); if (n === parent) break; n = parent;}}
export function privatePath(p) {p = path.resolve(p); noLinks(p); if (!within(p, privateRoot)) throw Error('private .local/audio-reconstruction path required'); return p;}
