// Frozen03C functions are imported unchanged. No playback or native API.
import fs from 'node:fs';
import {baselines,contribution} from '../private-profile03c/ResourceProof03C.mjs';
const [mode,...files]=process.argv.slice(2),start=performance.now();
const result=mode==='baselines'&&files.length===2?baselines(...files.map(p=>fs.readFileSync(p))):mode==='contribution'&&files.length===4?contribution(...files.map(p=>fs.readFileSync(p))):null;
if(!result)throw new Error('Declared A/B baselines or contribution windows required');
console.log(JSON.stringify({result,detectorSeconds:(performance.now()-start)/1000}));
