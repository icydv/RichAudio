// Private original offline demonstrations. No endpoint, recording or GTA.
import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {renderVehicleComponentsFixture} from '../src/acoustics/vehicle/components/fixtures.mjs';
import {encodeVehicleWav} from '../src/acoustics/vehicle/pipeline.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),args=process.argv.slice(2);
if(args.length!==0&&args.length!==2||args.length===2&&args[0]!=='--output')throw Error('Use optional --output <new private directory>');
const output=path.resolve(args[1]??path.join(root,'.local','acoustic-world-02','components-'+randomUUID()));
if(!output.startsWith(path.join(root,'.local','acoustic-world-02')+path.sep)||fs.existsSync(output))throw Error('Fresh private acoustic-world-02 output required');
for(let at=path.dirname(output);;at=path.dirname(at)){if(fs.existsSync(at)&&fs.lstatSync(at).isSymbolicLink())throw Error('Linked outputs refused');if(path.dirname(at)===at)break;}
fs.mkdirSync(output,{recursive:true});const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sources=['src/acoustics/vehicle/components/registry.mjs','src/acoustics/vehicle/components/contracts.mjs','src/acoustics/vehicle/components/source.mjs',
 'src/acoustics/vehicle/components/lifecycle.mjs','src/acoustics/vehicle/components/pipeline.mjs','src/acoustics/vehicle/components/fixtures.mjs',
 'src/acoustics/vehicle/pipeline.mjs','src/acoustics/vehicle/environment.mjs','src/acoustics/streaming/causal.mjs','src/acoustics/engine/contracts.mjs',
 'src/acoustics/engine/paths.mjs','src/acoustics/research/local-geometry.mjs','tools/Render-VehicleComponents02.mjs'];
const sourcePins=sources.map(file=>({file,sha256:sha(fs.readFileSync(path.join(root,file)))})),measurements=[];
for(const environment of ['direct','canyon','tunnel'])for(const components of [['horn'],['tyre-rolling'],['tyre-slip'],['mechanical-clunk'],['horn','tyre-rolling','tyre-slip','mechanical-clunk']]){
 const {channels,measurement}=await renderVehicleComponentsFixture({environment,components,seconds:2});const name=environment+'-'+components.join('_'),bytes=encodeVehicleWav(channels);
 fs.writeFileSync(path.join(output,name+'.wav'),bytes,{flag:'wx'});fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify(measurement,null,2)+'\n',{flag:'wx'});
 measurements.push({...measurement,wavFile:name+'.wav',wavSha256:sha(bytes)});
}
for(const pin of sourcePins)if(sha(fs.readFileSync(path.join(root,pin.file)))!==pin.sha256)throw Error('Component/source implementation changed during demonstration');
const result={schema:1,passed:true,kind:'original-authored-component-rendering-not-game-or-device-recording',sourcePins,measurements,
 sourceMaterial:'original-synthetic-only',nativeTelemetryUsed:false,endpointOpened:false,gameLaunched:false,nativeSuppression:false,productionEnabled:false,
 limits:['Authored component positions and contact/load/slip inputs, not native observations','No physical sound-power calibration','Finite early reflections only; late field not enabled in this composition','No subjective/perceptual acceptance is claimed']};
fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,output,validationSha256:sha(fs.readFileSync(path.join(output,'validation.json'))),arms:measurements.length,endpointOpened:false,gameLaunched:false}));
