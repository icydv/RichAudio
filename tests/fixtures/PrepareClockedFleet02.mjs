// Manufacture only original test inputs and bind the actual product files.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {writeOriginalGameplayPackageStreet01} from './StreetGameplayPackage01.mjs';
import {originalInstalledCache01} from './InstalledStaticCache01.mjs';

const repo=fileURLToPath(new URL('../../',import.meta.url));
const [directory,owner,node,host,mode]=process.argv.slice(2);
const root=path.join(directory,'package');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const copy=(from,to)=>{
 fs.mkdirSync(path.dirname(to),{recursive:true});
 fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);
};
if(!path.resolve(directory).startsWith(path.join(repo,'.local','street01')+path.sep)||!['fleet','legacy'].includes(mode))throw Error('Private clocked benchmark package required');
fs.mkdirSync(root);
const gameHash=hash(owner);
const world=originalInstalledCache01({outputDirectory:path.join(root,'world'),gameHash,distantWall:true});
const epoch=new Date().toISOString().replace(/(\.\d{3})Z$/,'$10000Z');
world.manifest.ValidationEpochUtc01=epoch;
for(const row of world.manifest.Resources)row.ArchiveValidation01={EpochUtc:epoch,Source:'current-archive-sha256',ArchiveSHA256:row.Result.ArchiveSHA256};
fs.writeFileSync(world.manifestPath,JSON.stringify(world.manifest));
const acousticWorld={manifestPath:'world/manifest.json',catalogPath:'world/catalog.json',catalogSHA256:world.catalogSHA256};
const {manifest,config}=writeOriginalGameplayPackageStreet01(root,{gameHash,acousticWorld,latencyProfile:'street-01',fleet:mode==='fleet'});
const sourceFiles=[
 ...['src/acoustics','tools/soundmap'].flatMap(dir=>walk(path.join(repo,dir)).filter(file=>file.endsWith('.mjs'))),
 path.join(repo,'tools/Run-Gameplay.mjs')
];
for(const file of sourceFiles)copy(file,path.join(root,path.relative(repo,file)));
copy(node,path.join(root,'runtime/node.exe'));
copy(host,path.join(root,'runtime/RichAudio.Acoustics.Host.exe'));
Object.assign(config,{gameExecutable:owner,gameVersion:'1.0.1158.16',rphVersion:'1.132.1428.17748',continuityPolicy:'camera-source-01',
 outputSink:'environment-observation',clockedFleetEvidence02:true});
if(mode==='fleet')Object.assign(config,{vehicleSourcePolicy:'catalogue-fleet-01',eligible:[]});
config.bindings=walk(root).filter(file=>file!==manifest).map(file=>({file:path.relative(root,file).replaceAll('\\','/'),sha256:hash(file)}));
fs.writeFileSync(manifest,JSON.stringify(config,null,2));
console.log(JSON.stringify({root,manifestSha256:hash(manifest),authoredOwnerSha256:gameHash,bindings:config.bindings.length,authoredWorldEpoch:epoch}));
