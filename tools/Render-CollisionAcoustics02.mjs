// Original authored audio files only. No game, source bank, endpoint or capture.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash,randomUUID} from 'node:crypto';
import {collisionFixture02} from '../src/acoustics/collisions/fixtures.mjs';
import {renderCollisionFixture02} from '../src/acoustics/collisions/render.mjs';
import {encodeVehicleWav} from '../src/acoustics/vehicle/pipeline.mjs';
const repo=fileURLToPath(new URL('..',import.meta.url)),base=path.join(repo,'.local','world-02'),args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--output')throw Error('Use --output <fresh private .local/world-02 directory>');
const output=path.resolve(args[1]);if(!output.startsWith(base+path.sep)||fs.existsSync(output))throw Error('Fresh private original-demo output required');
for(let at=path.dirname(output);;at=path.dirname(at)){if(fs.existsSync(at)&&fs.lstatSync(at).isSymbolicLink())throw Error('Linked output parent refused');if(path.dirname(at)===at)break;}
fs.mkdirSync(output,{recursive:true});const hash=b=>createHash('sha256').update(b).digest('hex'),sources=new Map();
function pin(file){file=path.resolve(file);if(sources.has(file))return;const bytes=fs.readFileSync(file),text=bytes.toString('utf8');sources.set(file,hash(bytes));
 for(const m of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))pin(path.resolve(path.dirname(file),m[1]));
 for(const m of text.matchAll(/new URL\(['"](\.[^'"]+\.mjs)['"],\s*import.meta.url\)/g))pin(path.resolve(path.dirname(file),m[1]));}
pin(fileURLToPath(import.meta.url));const nodeSha256=hash(fs.readFileSync(process.execPath)),beforeMemory=process.memoryUsage(),results=[];
const cases=[['motorcycle-barrier','corner'],['motorcycle-barrier','direct'],['light-scrape','canyon'],['high-energy','direct'],['high-energy','canyon'],['high-energy','tunnel'],['glass','canyon']];
for(const [name,environment]of cases){const rendered=await renderCollisionFixture02(collisionFixture02(name,{environment,seconds:3})),file=`${name}-${environment}.wav`,bytes=encodeVehicleWav([rendered.left,rendered.right]);fs.writeFileSync(path.join(output,file),bytes,{flag:'wx'});
 const fixture=collisionFixture02(name,{environment,seconds:3});results.push({...rendered.summary,file,bytes:bytes.length,wavSha256:hash(bytes),memorySnapshot:process.memoryUsage(),
  contactRadiators:fixture.events.map(event=>({eventId:event.eventId,contact:event.contact,radiator:event.radiator,severity:event.severity,material:event.material}))});}
for(const [file,sha]of sources)if(hash(fs.readFileSync(file))!==sha)throw Error('Source changed during collision fixture rendering');if(hash(fs.readFileSync(process.execPath))!==nodeSha256)throw Error('Executed Node changed during fixture rendering');
const high=results.filter(r=>r.name==='high-energy');if(high.length!==3||new Set(high.map(r=>r.sources.map(s=>s.pcmSha256).join(':'))).size!==1||new Set(high.map(r=>r.outputSha256)).size!==3)throw Error('Matched collision dry/geometry comparison failed');
const result={schema:1,kind:'original-authored-collision-fixtures-not-live-recordings',passed:true,sourcePins:[...sources].sort(([a],[b])=>a.localeCompare(b)).map(([file,sha256])=>({file:path.relative(repo,file).replaceAll('\\','/'),sha256})),
 node:{version:process.version,sha256:nodeSha256},beforeMemory,afterMemory:process.memoryUsage(),results,matchedHighEnergyDryIdentical:true,
 originalSyntheticOnly:true,gameFilesRead:false,endpointOpened:false,recordingStarted:false,nativeEventAcquired:false,nativeSuppression:false,physicalSoundPowerCalibrated:false,
 scope:'Existing renderer; fixed authored contact radiators, explicitly authored severity/materials, original sources and optional existing analytic-enclosure late model. No live collision or installed-world proof.'};
fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,arms:results.length,output,validationSha256:hash(fs.readFileSync(path.join(output,'validation.json')))}));
