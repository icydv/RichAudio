import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, parseArguments, voiceInputs, writeStereoWave } from './audio/powertrain-drive.mjs';
import { mappedDrive, prepareDriveWindows } from './audio/mapped-drive-scene.mjs';
import { renderMappedPerformance } from './audio/mapped-drive-render.mjs';
import { renderStraightPass } from './audio/straight-pass.mjs';

const args=parseArguments(process.argv.slice(2)), directory=args['--output'];
const privateRoot=fileURLToPath(new URL('../.local/',import.meta.url));
assert(directory.startsWith(privateRoot)&&!fs.existsSync(directory),'Choose a fresh private output folder inside .local');
const inputs=voiceInputs(args['--package']), placement=readJson(args['--placement']), config=readJson(args['--world']);
const session=randomUUID().replaceAll('-','');
fs.mkdirSync(directory,{recursive:true});
const straight=await renderStraightPass(inputs,session,directory);
writeJson(path.join(directory,'pass-by.json'),straight);

const drive=mappedDrive(placement,inputs.independent);
const setup={session,drive,placement,inputs,config,blocks:Math.ceil(drive.seconds*48000/512),blockMs:512/48};
const takes=[];
for (const [name,height] of [['Smooth surfaces',0],['Rough surfaces',.012]]) {
  const {windows}=await prepareDriveWindows({...setup,surfaceRoughnessRmsMetres:height});
  assert([...windows.values()].every(s=>s.config.surfaceRoughnessRmsMetres===height));
  const r=await renderMappedPerformance({...setup,windows,name,directory,fleet:false,record:true});
  takes.push(r);
}
const [smooth,rough]=takes;
assert.equal(smooth.receipt.voices['adder-pass'].drySHA256,rough.receipt.voices['adder-pass'].drySHA256);
let selectionChanges=0,directMatches=0;
for(let i=0;i<smooth.records.length;i++) {
  const a=smooth.records[i].control.paths,b=rough.records[i].control.paths;
  const direct=paths=>paths.filter(p=>p.order===0).sort((x,y)=>x.id.localeCompare(y.id));
  assert.deepEqual(direct(a),direct(b),'Direct path changed at block '+i);
  directMatches+=direct(a).length;
  const ids=paths=>paths.map(p=>p.id).sort().join('|');
  if(ids(a)!==ids(b))selectionChanges++;
}
const frames=smooth.channels[0].length, second=frames+24000;
const joined=smooth.channels.map((channel,i)=>{
  const result=new Float32Array(second+frames);result.set(channel);result.set(rough.channels[i],second);return result;
});
let residualPeak=0,squared=[0,0],original=[0,0];
for(let side=0;side<2;side++)for(let i=0;i<frames;i++){
  const x=smooth.channels[side][i],delta=rough.channels[side][i]-x;
  squared[side]+=delta*delta;original[side]+=x*x;residualPeak=Math.max(residualPeak,Math.abs(delta));
}
assert(residualPeak>1e-5);
const file='Compare the surface returns.wav';
const wavSHA256=writeStereoWave(path.join(directory,file),joined);
writeJson(path.join(directory,'surface-comparison.json'),{session,file,wavSHA256,roughnessRmsMetres:.012,
  nominalBandHz:[200,1600,6400],firstSeconds:0,secondSeconds:second/48000,smoothSHA256:smooth.receipt.wavSHA256,
  roughSHA256:rough.receipt.wavSHA256,unchangedDrySHA256:smooth.receipt.voices['adder-pass'].drySHA256,
  directMatches,selectionChanges,blocks:smooth.records.length,residualPeak,
  residualRelativeToSmoothDb:squared.map((s,i)=>10*Math.log10(s/original[i])),
  scope:'Authored RMS surface height. Only coherent specular energy is rendered. Diffuse returns and physical surface roughness are unmeasured.'});
