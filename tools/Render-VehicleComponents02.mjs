// Private original offline demonstrations. No endpoint, recording or GTA.
import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {renderVehicleComponentsFixture} from '../src/acoustics/vehicle/components/fixtures.mjs';
import {encodeVehicleWav} from '../src/acoustics/vehicle/pipeline.mjs';
import {createPreparedMechanicalComponent} from '../src/acoustics/vehicle/components/prepared.mjs';
import {createAuthoredComponentCapability} from '../src/acoustics/vehicle/components/contracts.mjs';
import {fixtureComponentIdentity} from '../src/acoustics/vehicle/components/fixtures.mjs';
import {transientFixtureSession,transientFixturePoses,transientFixtureScene} from '../src/acoustics/events/fixture-scenes.mjs';
import {copyPreparedTransientPCM} from '../src/acoustics/events/prepared-path.mjs';
import {modulePins} from './latency03-source-pins.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),args=process.argv.slice(2);
if(args.length!==0&&args.length!==2||args.length===2&&args[0]!=='--output')throw Error('Use optional --output <new private directory>');
const output=path.resolve(args[1]??path.join(root,'.local','acoustic-world-02','components-'+randomUUID()));
if(!output.startsWith(path.join(root,'.local','acoustic-world-02')+path.sep)||fs.existsSync(output))throw Error('Fresh private acoustic-world-02 output required');
for(let at=path.dirname(output);;at=path.dirname(at)){if(fs.existsSync(at)&&fs.lstatSync(at).isSymbolicLink())throw Error('Linked outputs refused');if(path.dirname(at)===at)break;}
fs.mkdirSync(output,{recursive:true});const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourcePins=modulePins(root,['tools/Render-VehicleComponents02.mjs']),measurements=[],nodeSha256=sha(fs.readFileSync(process.execPath));
for(const environment of ['direct','canyon','tunnel'])for(const components of [['horn'],['tyre-rolling'],['tyre-slip'],['mechanical-clunk'],['horn','tyre-rolling','tyre-slip','mechanical-clunk']]){
 const {channels,measurement}=await renderVehicleComponentsFixture({environment,components,seconds:2});const name=environment+'-'+components.join('_'),bytes=encodeVehicleWav(channels);
 fs.writeFileSync(path.join(output,name+'.wav'),bytes,{flag:'wx'});fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify(measurement,null,2)+'\n',{flag:'wx'});
 measurements.push({...measurement,wavFile:name+'.wav',wavSha256:sha(bytes)});
}
const identity={...fixtureComponentIdentity('mechanical-clunk'),session:transientFixtureSession};
const preparedMechanical=createPreparedMechanicalComponent({identity,capability:createAuthoredComponentCapability({session:identity.session,maximumFrame:20000}),
 scene:transientFixtureScene('wall'),sceneId:'wall',sourcePose:transientFixturePoses.source,listenerPose:transientFixturePoses.listener});
const pcm=new Float32Array(preparedMechanical.kernel.frames*2);copyPreparedTransientPCM(preparedMechanical.kernel,pcm);
const l=new Float32Array(preparedMechanical.kernel.frames),r=new Float32Array(l.length);for(let i=0;i<l.length;i++){l[i]=pcm[i*2];r[i]=pcm[i*2+1];}
const preparedBytes=encodeVehicleWav([l,r]);fs.writeFileSync(path.join(output,'prepared-wall-mechanical-clunk.wav'),preparedBytes,{flag:'wx'});
for(const pin of sourcePins)if(sha(fs.readFileSync(path.join(root,pin.file)))!==pin.sha256)throw Error('Component/source implementation changed during demonstration');
if(sha(fs.readFileSync(process.execPath))!==nodeSha256)throw Error('Executed Node changed during original demonstration');
const result={schema:1,passed:true,kind:'original-authored-component-rendering-not-game-or-device-recording',sourcePins,measurements,
 preparedMechanical:{...preparedMechanical,wavSha256:sha(preparedBytes),wavFile:'prepared-wall-mechanical-clunk.wav'},
 node:{version:process.version,sha256:nodeSha256},
 sourceMaterial:'original-synthetic-only',nativeTelemetryUsed:false,endpointOpened:false,gameLaunched:false,nativeSuppression:false,productionEnabled:false,
 limits:['Authored component positions and contact/load/slip inputs, not native observations','No physical sound-power calibration','Finite early reflections only; late field not enabled in this composition','No subjective/perceptual acceptance is claimed']};
fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,output,validationSha256:sha(fs.readFileSync(path.join(output,'validation.json'))),arms:measurements.length,endpointOpened:false,gameLaunched:false}));
