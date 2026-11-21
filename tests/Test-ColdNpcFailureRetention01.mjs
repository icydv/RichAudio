import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('the actual cold NPC comparison retains its first exact history failure and still fails',()=>{
 const base=path.join(root,'.local','street01');fs.mkdirSync(base,{recursive:true});
 const fixture=fs.mkdtempSync(path.join(base,'cold-npc-observer-fixture-'));
 const copy=(relative,text)=>{const target=path.join(fixture,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text??fs.readFileSync(path.join(root,relative)));};
 for(const name of ['stock-source.mjs','stock-grain.mjs','stock-events.mjs','stock-source-preparation10.mjs','source-preparation-budget10.mjs'])copy('src/acoustics/vehicle/'+name);
 copy('tools/cold-npc-history01.mjs');
 const original=fs.readFileSync(path.join(root,'tests/Test-Synthesis12.mjs'),'utf8');
 const marker='sources.push(source);if(diagnose)constructors.push(inspectColdSource01(source));';
 assert.equal(original.split(marker).length,2,'one exact production observer site');
 // Only this private fixture corrupts the current constructor's original
 // feature. The actual comparison and every historical assertion are retained.
 copy('tests/Test-Synthesis12.mjs',original.replace(marker,'if(diagnose&&module===current)source.voices.engine.idle.features[0].rms+=.001;\n  '+marker));
 copy('reporter.mjs',"export default async function*(events){for await(const event of events)if(event.type==='test:fail')yield event.data.name+' '+event.data.details.error.message+'\\n';}\n");
 const environment={...process.env};delete environment.NODE_TEST_CONTEXT;
 const child=spawnSync(process.execPath,['--test','--test-reporter=./reporter.mjs','--test-name-pattern=^parent source remains bit exact: NPC, long loop, cold$','tests/Test-Synthesis12.mjs'],{cwd:fixture,env:environment,encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024,windowsHide:true});
 fs.writeFileSync(path.join(fixture,'stdout.log'),child.stdout??'');fs.writeFileSync(path.join(fixture,'stderr.log'),child.stderr??'');
 assert.equal(child.error,undefined);assert.equal(child.status,1,'the unchanged exact assertion must fail');assert.match(child.stdout,/grain history at block 0/);
 const retained=fs.readdirSync(path.join(fixture,'.local','street01')).filter(name=>name.startsWith('cold-npc-failure-'));assert.equal(retained.length,1);
 const json=fs.readFileSync(path.join(fixture,'.local','street01',retained[0],'first-divergence.json'));
 assert.ok(json.length<=4*1024*1024);const report=JSON.parse(json);
 assert.equal(report.stage,'exact-grain-history');assert.equal(report.block,0);assert.equal(report.frames,1);
 assert.equal(report.inputFirstDifference,null);assert.equal(report.constructors.length,2);
 assert.ok(report.constructors.every(side=>side.sourceFrame===0&&side.sourceStatsFrames===0));
 assert.ok(report.beforeRender.every(side=>side.sourceFrame===0));assert.ok(report.failureState.every(side=>side.sourceFrame===1));
 assert.match(report.constructorFirstDifference.path,/features/);assert.ok(report.failureFirstDifference);
 for(let role=0;role<2;role++)assert.deepEqual(report.outputBuffers[0][role],report.outputBuffers[1][role],'first PCM block still matches independently of history failure');
 assert.equal(report.assertionRethrown,true);assert.equal(report.historicalAssertionsChanged,false);assert.equal(report.observerAdvancesSource,false);
 assert.ok(report.constructors[1].features.some(feature=>feature.difference),'independent recomputation catches corrupt constructor feature');
});
