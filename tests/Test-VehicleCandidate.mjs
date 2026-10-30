import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {validateCandidate,sha} from '../tools/listening/run.mjs';
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'RichAudio vehicle candidate ')),app=path.join(root,'app');
  const write=(relative,text)=>{const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);return file;};
  const executable=write('app/build/acoustics-host/RichAudio.Acoustics.Host.exe','not executable; no launch allowed');
  const plugin=write('runtime/Plugins/RichAudio.Beacon.Rph.dll','not a plugin; no load allowed');
  const model=write('app/.local/geometry-model.json',JSON.stringify({basis:'declared-demonstration-scale',metresPerNativeUnit:1,sourceOffsetNative:[0,0,0]}));
  const settings=write('app/.local/acoustic-settings.json',JSON.stringify({acousticQuality:'balanced',acousticAcceleration:'auto',outputLevel:1,richAudioEnabled:true,earlyReflections:true}));
  const producer=write('app/tools/Run-Acoustics07.mjs','throw Error("fixture never launches");');
  const operator=write('app/tools/listening/run.mjs',fs.readFileSync(new URL('../tools/listening/run.mjs',import.meta.url)));
  const file=path.join(root,'candidate.json');
  const candidate={schema:1,scope:'RICHAUDIO_VEHICLE_LIVE01',state:'REVIEW_ONLY',liveAuthorised:false,liveReady:false,maximumAttempts:1,cwd:app,executable,
    sourceHead:'a'.repeat(40),baseCommit:'247e7ff2af8f1670ba454ae303ba56cb4f16fb19',vehiclePhysicsCommit:'eef0cbc2e96e09754d87b375975eb1053422121e',upstreamCorrectionCommit:'pending',targetGta:'1.0.1158.16',targetRph:'1.132.1428.17748',hostSha256:sha(executable),pluginSha256:sha(plugin),
    args:['--root',app,'--scene','open-road','--vehicle-profile','v12','--beacon-output-trim-db','0','--sources','8','--gain','0.20','--seconds','60','--device','default','--listener-pipe','--geometry-model',model,'--acoustic-settings',settings,'--soundmap-config',path.join(app,'.local/soundmap/service.json'),'--output',path.join(app,'.local/host-live-01')],
    listeningOperator:{executable:process.execPath,script:operator},initialSettings:{Path:settings,SHA256:sha(settings)},
    audio:{stockAudio:'additive-experimental-playback',rendererMasterGain:.35,preHostPeakLimit:.5,outputTrimDb:0},
    bindings:[executable,plugin,model,producer,operator,process.execPath].map(Path=>({Path,SHA256:sha(Path)}))};
  const save=value=>{fs.writeFileSync(file,JSON.stringify(value));return sha(file);};
  return {root,app,executable,plugin,model,settings,file,candidate,save,write};
}
test('independent vehicle candidate binds exact inputs and refuses execution before readiness',()=>{
  const f=fixture();try{
    assert.equal(validateCandidate(f.file,f.save(f.candidate)).liveReady,false);
    const p=spawnSync(process.execPath,['tools/listening/run.mjs',f.file,sha(f.file),'--execute-approved'],{encoding:'utf8',windowsHide:true,timeout:3000});
    assert.equal(p.status,1);assert.match(p.stderr,/awaits reconciled upstream correction/);assert.ok(!fs.existsSync(path.join(f.root,'observations')));
    for(const [flag,value] of [['--beacon-output-trim-db','12'],['--sources','1'],['--gain','1'],['--vehicle-profile','fake']]){
      const altered=structuredClone(f.candidate);altered.args[altered.args.indexOf(flag)+1]=value;
      assert.throws(()=>validateCandidate(f.file,f.save(altered)),/profile changed/);
    }
    f.save(f.candidate);fs.appendFileSync(f.executable,'changed');assert.throws(()=>validateCandidate(f.file,sha(f.file)),/Bound input changed/);
  }finally{fs.rmSync(f.root,{recursive:true});}
});
test('vehicle preflight rejects omitted bindings, duplicate native options, route drift and uncommitted inputs',()=>{
  const f=fixture();try{
    for(const remove of [f.executable,f.plugin,f.model,f.candidate.listeningOperator.script,process.execPath]){
      const c=structuredClone(f.candidate);c.bindings=c.bindings.filter(b=>b.Path!==remove);assert.throws(()=>validateCandidate(f.file,f.save(c)),/not bound/);
    }
    for(const flag of ['--geometry-model','--acoustic-settings','--listener-pipe']){
      const c=structuredClone(f.candidate);c.args.push(flag);if(flag!=='--listener-pipe')c.args.push(f.model);assert.throws(()=>validateCandidate(f.file,f.save(c)),/duplicate/);
    }
    for(const [flag,value] of [['--device','2'],['--soundmap-config',path.join(f.root,'outside.json')],['--output',path.join(f.root,'outside')]]){
      const c=structuredClone(f.candidate);c.args[c.args.indexOf(flag)+1]=value;assert.throws(()=>validateCandidate(f.file,f.save(c)),/fixed vehicle options|routing differs/);
    }
    const c=structuredClone(f.candidate);c.sourceHead='working-tree';assert.throws(()=>validateCandidate(f.file,f.save(c)),/source\/build provenance/);
    f.write('app/src/unbound.mjs','changed source');assert.throws(()=>validateCandidate(f.file,f.save(f.candidate)),/not bound/);
  }finally{fs.rmSync(f.root,{recursive:true});}
});
test('vehicle preflight validates initial settings and rejects a resealed non-unit model',()=>{
  const f=fixture();try{
    const original=fs.readFileSync(f.settings);fs.appendFileSync(f.settings,' ');assert.throws(()=>validateCandidate(f.file,f.save(f.candidate)),/Initial vehicle settings changed/);fs.writeFileSync(f.settings,original);
    fs.writeFileSync(f.model,JSON.stringify({basis:'declared-demonstration-scale',metresPerNativeUnit:.5,sourceOffsetNative:[0,0,0]}));
    const c=structuredClone(f.candidate);c.bindings.find(b=>b.Path===f.model).SHA256=sha(f.model);assert.throws(()=>validateCandidate(f.file,f.save(c)),/coordinate model changed/);
  }finally{fs.rmSync(f.root,{recursive:true});}
});
test('readiness cannot replace fresh boolean, dated, exact attempt approval',()=>{
  const f=fixture();try{
    const c=structuredClone(f.candidate);c.liveReady=true;c.upstreamCorrectionCommit='b'.repeat(40);const candidateHash=f.save(c);
    const manifest=f.write('deployment-manifest.json','{}'),approvalFile=path.join(f.root,'fresh-approval.json'),journalFile=path.join(f.root,'journal.json');
    const planFile=f.write('attempt.json',JSON.stringify({Schema:1,Scope:c.scope,FixtureOnly:false,OriginalCandidatePath:f.file,OriginalCandidateSHA256:candidateHash,ManifestPath:manifest,ManifestSHA256:sha(manifest),Paths:{FreshApproval:approvalFile,Journal:journalFile}}));
    fs.writeFileSync(journalFile,JSON.stringify({AttemptSHA256:sha(planFile),State:'DEPLOYED_NOT_LAUNCHED'}));
    const approval={Approved:true,MaximumAttempts:1,Scope:c.scope,CandidateSHA256:candidateHash,AttemptSHA256:sha(planFile),ManifestSHA256:sha(manifest),ExpiresUtc:new Date(Date.now()+60000).toISOString()};
    for(const altered of [{...approval,Approved:'true'},{...approval,ExpiresUtc:'invalid'},{...approval,ExpiresUtc:new Date(0).toISOString()}]){
      fs.writeFileSync(approvalFile,JSON.stringify(altered));const p=spawnSync(process.execPath,['tools/listening/run.mjs',f.file,candidateHash,'--execute-approved'],{encoding:'utf8',windowsHide:true,timeout:3000});
      assert.equal(p.status,1);assert.match(p.stderr,/approval.*required/i);assert.ok(!fs.existsSync(path.join(f.root,'observations')));
    }
  }finally{fs.rmSync(f.root,{recursive:true});}
});
