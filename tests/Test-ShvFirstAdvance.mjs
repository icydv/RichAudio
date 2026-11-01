// Prior production-ASI ABI fixture records are read/copied; no binary is executed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkFirstAdvance,validateOwnership,fileTimeFromUtc,candidateSha256,hasTerminalCapture} from '../tools/Observe-ShvFirstAdvance.mjs';

const repo=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg=name=>{const at=process.argv.indexOf(name);return at<0?null:process.argv[at+1];};
const fixtureRoot=arg('--fixture-root');
if(!fixtureRoot)throw Error('Supply --fixture-root to the preserved full PLAYABLE-07 ABI fixture directory.');
const work=path.join(repo,'.local','playable-08','first-advance-tests-'+randomUUID());
fs.mkdirSync(work,{recursive:true});
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fixtureReceipt=path.join(fixtureRoot,'fixture-result.json');
const fixture=JSON.parse(fs.readFileSync(fixtureReceipt,'utf8'));
assert.equal(fixture.profile,'PLAYABLE-07');assert.equal(fixture.fullMatrix,true);assert.equal(fixture.candidateSha256,candidateSha256);
function load(name) {
  const root=path.join(fixtureRoot,'case-'+name,'RichAudio','ShvProbe');
  const sessions=fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory());
  assert.equal(sessions.length,1);
  const directory=path.join(root,sessions[0].name);
  const timeline=path.join(directory,'timeline.ndjson'),capture=path.join(directory,'capture.json');
  return {directory,rows:fs.readFileSync(timeline,'utf8').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)),
    summary:JSON.parse(fs.readFileSync(capture,'utf8')),timelineSha256:digest(timeline),captureSha256:digest(capture)};
}
const dynamic=load('sequence_dynamic'),constant=load('sequence_constant'),finite=load('finite');
// Replay the real record prefix at first confirmation, before terminal writing.
// A closed fixture/live session is explicitly a negative readiness control.
const prefix=data=>data.rows.slice(0,data.rows.findIndex(r=>r.kind==='observation'&&r.requestedPhaseIndex===1)+1);
const replayRows=prefix(dynamic);
const options={qpcFrequency:dynamic.summary.qpcFrequency,terminal:false,sourceMode:'copied-abi-fixture-prefix'};
const outcomes=[];
function test(name,run) {try{run();outcomes.push({name,passed:true});console.log('PASS '+name);}
  catch(error){outcomes.push({name,passed:false,message:String(error.message).slice(0,500)});console.error('FAIL '+name+': '+error.message);}}
function changed(edit) {const rows=structuredClone(replayRows);edit(rows);return checkFirstAdvance(rows,options);}
const firstIdle=rows=>rows.find(r=>r.kind==='observation'&&r.requestedPhaseIndex===1);
const firstAdvance=rows=>rows.find(r=>r.kind==='phase'&&r.action==='advance');
const failed=result=>assert.equal(result.state,'failed',JSON.stringify(result));

test('actual dynamic ABI timeline confirms first advance without provider qualification',()=>{
  const r=checkFirstAdvance(replayRows,options);assert.equal(r.state,'ready');assert.equal(r.providerQualified,false);
  assert.equal(r.drivingInterlock,false);assert.equal(r.measuredRPM,false);assert.ok(r.confirmingObservationIndex>0);
});
test('constant-output ABI timeline may confirm controls but never qualifies telemetry',()=>{
  const r=checkFirstAdvance(prefix(constant),{...options,qpcFrequency:constant.summary.qpcFrequency});
  assert.equal(r.state,'ready');assert.equal(r.providerQualified,false);
});
test('actual no-advance capture cannot confirm readiness',()=>failed(checkFirstAdvance(finite.rows,{...options,terminal:true,qpcFrequency:finite.summary.qpcFrequency})));
test('partial first phase waits rather than inventing advance',()=>{
  const cut=dynamic.rows.findIndex(r=>r.kind==='phase'&&r.action==='advance');
  assert.equal(checkFirstAdvance(dynamic.rows.slice(0,cut),{...options,terminal:false}).state,'waiting');
});
test('missing advance is rejected',()=>failed(changed(rows=>rows.splice(rows.indexOf(firstAdvance(rows)),1))));
test('duplicate start is rejected',()=>failed(changed(rows=>rows.splice(1,0,structuredClone(rows[0])))));
test('jump directly to stationary-rev is rejected',()=>failed(changed(rows=>{const r=firstAdvance(rows);r.requestedPhaseIndex=2;r.requestedPhase='STATIONARY_REV';})));
test('stop before first advance is rejected',()=>failed(changed(rows=>{const r=firstAdvance(rows);r.action='stop';r.requestedPhaseIndex=0;r.requestedPhase='OFF';})));
test('observed motion before first advance is a protocol failure',()=>{
  const r=changed(rows=>{const d=rows.find(r=>r.kind==='declared-precontext');d.preContext.speedBits=0x3f800000;d.preContext.speedMps=1;});
  failed(r);assert.equal(r.reason,'motion-before-first-advance');
});
test('motion after advance but before stationary confirmation is rejected',()=>failed(changed(rows=>{
  const d=rows.find(r=>r.kind==='declared-precontext'&&r.requestedPhaseIndex===1);d.preContext.speedBits=0x3f800000;d.preContext.speedMps=1;
})));
test('changed Bati identity is rejected',()=>failed(changed(rows=>{const r=firstIdle(rows);r.preContext.vehicle++;r.postContext.vehicle++;})));
test('negative player identity is rejected',()=>failed(changed(rows=>{rows.find(r=>r.kind==='declared-precontext').preContext.player=-1;})));
test('missing observed pre-context cannot pass',()=>failed(changed(rows=>{firstIdle(rows).preContextObserved=false;})));
test('invalid post bracket cannot pass',()=>failed(changed(rows=>{firstIdle(rows).contextBracketValid=false;})));
test('mismatched speed bits cannot pass',()=>failed(changed(rows=>{firstIdle(rows).postContext.speedBits=0x3f800000;})));
test('native failure before confirmation is rejected',()=>failed(changed(rows=>{rows.find(r=>r.kind==='target-return').readStatus='seh';})));
test('stale complete context cannot pass',()=>failed(changed(rows=>{firstIdle(rows).postContext.acquisitionEndQpc+=dynamic.summary.qpcFrequency;})));
test('future phase timestamp cannot pass',()=>failed(changed(rows=>{firstAdvance(rows).acceptedQpc=firstIdle(rows).targetBeforeQpc+1;})));
test('bad QPC frequency cannot pass',()=>failed(checkFirstAdvance(dynamic.rows,{...options,qpcFrequency:0})));
test('record bound cannot be bypassed',()=>failed(checkFirstAdvance(Array(7210).fill(dynamic.rows[0]),options)));
test('advance without returned full context remains unconfirmed',()=>{
  const cut=dynamic.rows.findIndex(r=>r.kind==='observation'&&r.requestedPhaseIndex===1);
  assert.equal(checkFirstAdvance(dynamic.rows.slice(0,cut),options).state,'waiting');
});
test('historical valid IDLE cannot qualify an already terminal capture',()=>failed(checkFirstAdvance(replayRows,{...options,terminal:true})));
test('known stop after an earlier valid IDLE cannot inherit readiness',()=>failed(checkFirstAdvance(dynamic.rows,options)));
test('motion after an earlier ready record but before publication is rejected',()=>{
  const next=structuredClone(firstIdle(replayRows));next.preContext.speedBits=0x3f800000;next.preContext.speedMps=1;
  failed(checkFirstAdvance([...replayRows,next],options));
});
test('NaN observation cannot qualify a bracket',()=>failed(changed(rows=>{const r=firstIdle(rows);r.rawBits=0x7fc00000;r.rawBitsHex='7FC00000';r.rawFloat=null;})));
test('out-of-range observation cannot qualify a bracket',()=>failed(changed(rows=>{const r=firstIdle(rows);r.rawBits=0x40000000;r.rawBitsHex='40000000';r.rawFloat=2;})));
test('observation float-bit disagreement is rejected',()=>failed(changed(rows=>{firstIdle(rows).rawFloat=.4;})));
test('NaN minimal raw return cannot qualify',()=>failed(changed(rows=>{const r=rows.find(r=>r.kind==='target-return');r.rawBits=0x7fc00000;r.rawBitsHex='7FC00000';r.rawFloat=null;})));
test('minimal raw-return float-bit disagreement is rejected',()=>failed(changed(rows=>{rows.find(r=>r.kind==='target-return').rawFloat=.4;})));
test('two individually valid but different return and observation values are rejected',()=>failed(changed(rows=>{
  const r=rows.find(r=>r.kind==='target-return');r.rawBits=0x3ecccccd;r.rawBitsHex='3ECCCCCD';r.rawFloat=Math.fround(.4);
})));
test('missing observation index cannot establish readiness',()=>failed(changed(rows=>{delete firstIdle(rows).observationIndex;})));
for(const [name,text]of [['unknown-producer','{"producerCompleted":false}'],['partial-terminal','{"producerCompleted":']]) {
  test(name+' capture file fails closed without parsing it',()=>{
    const directory=path.join(work,name);fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory,'capture.json'),text,{flag:'wx'});
    assert.equal(hasTerminalCapture(directory),true);
    failed(checkFirstAdvance(replayRows,{...options,terminal:hasTerminalCapture(directory)}));
  });
}

const sessionName=path.basename(dynamic.directory),creation=sessionName.slice(sessionName.indexOf('-')+1);
const ticks=BigInt('0x'+creation),unix=ticks-116444736000000000n,seconds=unix/10000000n,fraction=unix%10000000n;
const startUtc=new Date(Number(seconds*1000n)).toISOString().replace('.000Z','.'+fraction.toString().padStart(7,'0')+'Z');
const owner={schema:1,profile:'PLAYABLE-08',mode:'fixture',candidateSha256,sessionPath:path.resolve(dynamic.directory),
  processId:Number(sessionName.split('-')[0]),processStartUtc:startUtc,processCreationFileTimeHex:creation,
  launchInvokedUtc:new Date(Date.parse(startUtc)-1000).toISOString(),observedUtc:new Date(Date.parse(startUtc)+30000).toISOString()};
const ownedOptions={allowedSessionRoot:path.dirname(owner.sessionPath),allowFixture:true};
test('actual fixture session PID-FILETIME linkage validates only in explicit pure fixture mode',()=>{
  assert.equal(fileTimeFromUtc(owner.processStartUtc),creation);assert.equal(validateOwnership(owner,ownedOptions).valid,true);
});
test('fixture ownership is refused by live CLI validator',()=>assert.equal(validateOwnership(owner,{...ownedOptions,allowFixture:false}).valid,false));
test('wrong process ID cannot reuse an old session',()=>assert.equal(validateOwnership({...owner,processId:owner.processId+1},ownedOptions).valid,false));
test('different exact process start cannot reuse a PID',()=>assert.equal(validateOwnership({...owner,processCreationFileTimeHex:'0000000000000001'},ownedOptions).valid,false));
test('old07 ownership profile cannot qualify as new08',()=>assert.equal(validateOwnership({...owner,profile:'PLAYABLE-07'},ownedOptions).valid,false));
test('wrong native-candidate ownership is rejected',()=>assert.equal(validateOwnership({...owner,candidateSha256:'0'.repeat(64)},ownedOptions).valid,false));
test('outside session root is rejected',()=>assert.equal(validateOwnership(owner,{...ownedOptions,allowedSessionRoot:work}).valid,false));
test('stale live ownership cannot qualify',()=>assert.equal(validateOwnership({...owner,mode:'live'},{...ownedOptions,nowMs:Date.parse(owner.observedUtc)+61000}).valid,false));
test('launch after process creation is rejected',()=>assert.equal(validateOwnership({...owner,launchInvokedUtc:owner.observedUtc},ownedOptions).valid,false));
test('invalid exact process UTC is rejected',()=>assert.equal(validateOwnership({...owner,processStartUtc:'not-a-time'},ownedOptions).valid,false));

const ownerPath=path.join(work,'fixture-ownership.json');fs.writeFileSync(ownerPath,JSON.stringify(owner),{flag:'wx'});
test('CLI refuses fixture ownership before querying any game process',()=>{
  const output=path.join(work,'must-not-exist.json');
  const r=spawnSync(process.execPath,[path.join(repo,'tools','Observe-ShvFirstAdvance.mjs'),'--ownership',ownerPath,'--output',output],{encoding:'utf8',windowsHide:true});
  assert.equal(r.status,1);assert.match(r.stderr,/fixture-ownership/);assert.equal(fs.existsSync(output),false);
});
test('CLI refuses to overwrite an existing private result',()=>{
  const r=spawnSync(process.execPath,[path.join(repo,'tools','Observe-ShvFirstAdvance.mjs'),'--ownership',ownerPath,'--output',ownerPath],{encoding:'utf8',windowsHide:true});
  assert.equal(r.status,1);assert.equal(JSON.parse(fs.readFileSync(ownerPath,'utf8')).mode,'fixture');
});

const ps7=arg('--powershell')??'pwsh.exe';
if(execFileSync(ps7,['-NoLogo','-NoProfile','-NonInteractive','-Command','$PSVersionTable.PSVersion.Major'],{encoding:'utf8',windowsHide:true}).trim()!=='7')
  throw Error('Existing PowerShell7 is required for proposal-only checks.');
const proposalArgs=['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(repo,'tools','Prepare-ShvProbe.ps1'),
  '-ProposalProfile','PLAYABLE-08','-FixtureReceipt',path.resolve(fixtureReceipt),'-AnalysisReceipt',path.join(repo,'.local','playable-07','analysis-validation-final-01.json'),
  '-ShortcutBaselinePath',path.join(repo,'.local','playable-07','shortcut-baseline.json')];
test('fresh08 proposal truthfully reuses07 artifact and pending ownership',()=>{
  const output=path.join(work,'proposal');
  execFileSync(ps7,[...proposalArgs,'-OutputRoot',output],{encoding:'utf8',windowsHide:true,timeout:20000});
  const install=JSON.parse(fs.readFileSync(path.join(output,'installation-manifest.json'),'utf8'));
  const plan=JSON.parse(fs.readFileSync(path.join(output,'multi-state-proposal.json'),'utf8'));
  assert.equal(install.profile,'PLAYABLE-08');assert.equal(install.reusedBuildProfile,'playable-07');
  assert.equal(install.payload[0].sha256,candidateSha256);assert.match(install.payload[0].pendingPath,/\.playable08\.pending$/);
  assert.equal(install.executed,false);assert.equal(plan.firstAdvanceConfirmation.requiredBeforeManualDriving,true);
  assert.equal(plan.firstAdvanceConfirmation.probeProvidesDrivingInterlock,false);
});
test('proposal refuses old07 output tree',()=>{
  const r=spawnSync(ps7,[...proposalArgs,'-OutputRoot',path.join(repo,'.local','playable-07','must-not-create08')],{encoding:'utf8',windowsHide:true});
  assert.notEqual(r.status,0);assert.equal(fs.existsSync(path.join(repo,'.local','playable-07','must-not-create08')),false);
});
test('proposal refuses overwrite of an earlier08 review proposal',()=>{
  const output=path.join(work,'proposal'),before=digest(path.join(output,'installation-manifest.json'));
  const r=spawnSync(ps7,[...proposalArgs,'-OutputRoot',output],{encoding:'utf8',windowsHide:true});
  assert.notEqual(r.status,0);assert.equal(digest(path.join(output,'installation-manifest.json')),before);
});
test('proposal refuses incomplete matrix receipt without producing output',()=>{
  const bad=path.join(work,'labelled-incomplete-fixture-receipt.json');
  fs.writeFileSync(bad,JSON.stringify({...fixture,fullMatrix:false}),{flag:'wx'});
  const at=proposalArgs.indexOf('-FixtureReceipt'),args=[...proposalArgs];args[at+1]=bad;
  const output=path.join(work,'invalid-proposal');
  const r=spawnSync(ps7,[...args,'-OutputRoot',output],{encoding:'utf8',windowsHide:true});
  assert.notEqual(r.status,0);assert.equal(fs.existsSync(output),false);
});
const failedCount=outcomes.filter(r=>!r.passed).length;
const report={schema:1,profile:'PLAYABLE-08',scope:'Readiness and proposal validation using preserved production-ASI ABI fixture records plus labelled in-memory mutations; no native/binary/game execution',
  candidateSha256,fixtureReceiptSha256:digest(fixtureReceipt),fixtureRecordsCopied:true,actualShvExecuted:false,gameStarted:false,
  gameFilesWritten:false,windowControlPerformed:false,endpointOpened:false,providerQualified:false,
  observerSourceSha256:digest(path.join(repo,'tools','Observe-ShvFirstAdvance.mjs')),
  preparationSourceSha256:digest(path.join(repo,'tools','Prepare-ShvProbe.ps1')),testSourceSha256:digest(fileURLToPath(import.meta.url)),
  preservedInputCases:[dynamic,constant,finite].map((r,i)=>({name:['sequence_dynamic','sequence_constant','finite'][i],timelineSha256:r.timelineSha256,captureSha256:r.captureSha256})),
  passed:outcomes.length-failedCount,failed:failedCount,outcomes};
const output=path.join(work,'test-result.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log((failedCount?'FAIL ':'PASS ')+report.passed+'/'+outcomes.length+'; receipt '+output);
if(failedCount)process.exitCode=1;
