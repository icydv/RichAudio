// Fresh original identities and source closure only. No vendor binary, game
// archive, private bank, installation or playback is used by this fixture.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
import {streetPreparationFiles01,selectStreetEligible01,streetWorldPreparation01} from '../../tools/playable/street-preparation01.mjs';
import {writeOriginalGameplayPackageStreet01} from './StreetGameplayPackage01.mjs';
const repo=fileURLToPath(new URL('../../',import.meta.url)),root=path.resolve(process.argv[2]??'');
assert.ok(root.startsWith(path.join(repo,'.local','street01')+path.sep)&&!fs.existsSync(root),'fresh private fixture root');
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(d,x.name)):[path.join(d,x.name)]);
fs.mkdirSync(root,{recursive:true});const install=path.join(root,'package'),game=path.join(root,'game'),parser=path.join(root,'software-identities');
for(const d of [install,game,parser])fs.mkdirSync(d,{recursive:true});
fs.writeFileSync(path.join(game,'GTA5_Enhanced.exe'),'Original inert executable identity. Never executed.');
for(const name of ['CodeWalker.Core.dll','SharpDX.dll','SharpDX.Mathematics.dll'])fs.writeFileSync(path.join(parser,name),'Original inert software identity '+name+'. Never loaded.');
fs.writeFileSync(path.join(parser,'CodeWalker.exe'),'Must never be copied.');fs.writeFileSync(path.join(parser,'key-material.txt'),'Original forbidden-copy sentinel.');
const sources=walk(path.join(repo,'src','acoustics')).filter(f=>f.endsWith('.mjs')).map(f=>path.relative(repo,f).replaceAll('\\','/'));
for(const relative of [...sources,...streetPreparationFiles01,'tools/Run-Gameplay.mjs','tools/playable/Setup.ps1']){const to=path.join(install,relative);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(repo,relative),to);}
fs.mkdirSync(path.join(install,'runtime'));fs.writeFileSync(path.join(install,'runtime/node.exe'),'Original inert bundled Node identity. Never executed.');
for(const f of walk(path.join(repo,'tools','soundmap'))){const to=path.join(install,path.relative(repo,f));fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(f,to);}
const pkg=writeOriginalGameplayPackageStreet01(install,{latencyProfile:'street-01'}),config={...pkg.config,featureProfile:'STREET-01',continuityPolicy:'camera-source-01',gameExecutable:path.join(game,'GTA5_Enhanced.exe'),gameSha256:hash(path.join(game,'GTA5_Enhanced.exe')),acousticWorld:{cacheRoot:'.local/plugin-world-warmup'}};
const eligible=[{model:0xf9300cc5,context:'player'},{model:0xf9300cc5,context:'npc'},{model:123,context:'player'}];
assert.equal(selectStreetEligible01(eligible).length,2);assert.equal(selectStreetEligible01(eligible.slice(0,1)).length,1);assert.throws(()=>selectStreetEligible01(eligible.slice(1)));assert.throws(()=>streetWorldPreparation01({sourceFiles:sources}));
config.worldPreparation=streetWorldPreparation01({codeWalkerRoot:parser,sourceFiles:[...sources,...streetPreparationFiles01,'runtime/node.exe']});
config.bindings=walk(install).filter(f=>path.basename(f)!=='playable.json').map(f=>({file:path.relative(install,f).replaceAll('\\','/'),sha256:hash(f)}));
fs.writeFileSync(pkg.manifest,JSON.stringify(config,null,2));
assert.equal(config.worldPreparation.dependencies.length,3);assert.equal(config.worldPreparation.parserRedistributed,false);assert.ok(!walk(install).some(f=>['CodeWalker.exe','CodeWalker.Core.dll','SharpDX.dll','SharpDX.Mathematics.dll','key-material.txt'].includes(path.basename(f))));
// Run the actual copied entry point with normal source assets and the default
// same-cache path. No credits means no PCM is rendered or played.
const child=spawn(process.execPath,[path.join(install,'tools/Run-Gameplay.mjs'),'--manifest',pkg.manifest,'--session','7'.repeat(32)],{cwd:install,windowsHide:true,stdio:['pipe','pipe','pipe']});
let diagnostic='',ready=false,pcmBytes=0;const timeout=setTimeout(()=>child.kill(),12000);
child.stdout.on('data',b=>pcmBytes+=b.length);child.stderr.on('data',b=>{diagnostic+=b.toString();if(!ready&&diagnostic.includes('"type":"gameplay-ready"')){ready=true;child.stdin.end('{"type":"stop"}\n');}});
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});clearTimeout(timeout);fs.writeFileSync(path.join(root,'copied-main-worker.log'),diagnostic);assert.equal(code,0,diagnostic);assert.equal(ready,true);assert.equal(pcmBytes,0);
const receipt={schema:1,root,install,game,parser,manifest:pkg.manifest,sourceBindings:config.worldPreparation.sourceFiles.length,dependencyPins:config.worldPreparation.dependencies,cacheRoot:path.join(install,config.worldPreparation.cacheRoot),copiedActualMainReady:true,pcmBytes,originalIdentitiesOnly:true,vendorAssemblyLoaded:false,installedGameRead:false,installed:false,gameLaunched:false,endpointOpened:false};
fs.writeFileSync(path.join(root,'fixture.json'),JSON.stringify(receipt,null,2));process.stdout.write(JSON.stringify(receipt)+'\n');
