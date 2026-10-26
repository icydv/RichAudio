// Original synthetic examples only. This command never accepts GTA observations.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {reconstructSurface,diagnosticReflection,hypotheticalEndpoints} from '../src/acoustics/research/surface-reconstruction.mjs';
import {surfaceSvg} from '../src/acoustics/research/surface-visualisation.mjs';
import {flatFixture,cornerFixture,openingFixture,noisyFixture,incompatibleFixture,insufficientFixture} from '../tests/fixtures/SurfaceFixtures.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.resolve(root,process.argv[2]??'.local/acoustics03-synthetic-examples');
if(fs.existsSync(out))throw Error('Fresh example directory required');fs.mkdirSync(out,{recursive:true});
const rows=[];
for(const [name,fixture] of Object.entries({flat:flatFixture,corner:cornerFixture,opening:openingFixture,noisy:noisyFixture,incompatible:incompatibleFixture,insufficient:insufficientFixture})){
 const batch=fixture(),r=reconstructSurface(batch);let reflection=null;
 if(r.candidate){const e=hypotheticalEndpoints(r);reflection=diagnosticReflection(r,e.source,e.listener);}
 rows.push({scene:name,status:r.status,validHits:r.counts.validHits,validMisses:r.counts.validMisses,reasons:r.reasons,fitRms:r.candidate?.fitRms??null,maxResidual:r.candidate?.maxFitResidual??null,footprintArea:r.candidate?.footprintArea??null,reflectionPathNativeUnits:reflection?.pathLengthNativeUnits??null,arrivalSeconds:null});
 fs.writeFileSync(path.join(out,name+'.svg'),surfaceSvg(batch,r,{synthetic:true}),{flag:'wx'});
}
fs.writeFileSync(path.join(out,'synthetic-results.json'),JSON.stringify({provenance:'wholly original synthetic fixtures; no game observations',scenes:rows},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(rows));
