import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {writeOriginalGameplayPackageStreet01} from './StreetGameplayPackage01.mjs';

// Each role/state has its own procedural PCM, so swapped channels cannot pass a byte comparison.
export function writeOriginalNpcWorkerPackage(folder) {
  const pkg=writeOriginalGameplayPackageStreet01(folder,{fleet:true,latencyProfile:'street-01'});
  const npcManifest=path.join(folder,pkg.config.npcManifest);
  const manifest=JSON.parse(fs.readFileSync(npcManifest,'utf8')),bank=manifest.vehicles[0];
  let index=0;
  for(const role of ['engine','exhaust'])for(const mode of ['idle','accel']){
    const asset=bank.layers[role][mode],pcm=Buffer.alloc(asset.frames*4),pitch=.035+ ++index*.018;
    for(let i=0;i<asset.frames;i++)pcm.writeFloatLE(.035*Math.sin(i*pitch)+.012*Math.cos(i*pitch*2.23),4*i);
    const file='original-npc-'+role+'-'+mode+'.f32',sha256=createHash('sha256').update(pcm).digest('hex');
    fs.writeFileSync(path.join(folder,file),pcm,{flag:'wx'});
    Object.assign(asset,{file,sha256});
    bank.streams.find(s=>s.name===role+'_'+mode).asset={file,sha256};
  }
  fs.writeFileSync(npcManifest,JSON.stringify(manifest));
  Object.assign(pkg.config,{vehicleSourcePolicy:'catalogue-fleet-01',continuityPolicy:'camera-source-01',eligible:[]});
  fs.writeFileSync(pkg.manifest,JSON.stringify(pkg.config));
  return {...pkg,folder,npcManifest};
}
