import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const windows=process.platform==='win32';
test('actual preparer refuses uncommitted source, path traversal and unreviewed executable helpers before package writes',{skip:!windows},()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'RichAudio-candidate-preparer-'));
  const git=args=>{const r=spawnSync('git',['-C',root,...args],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);};
  try{
    fs.mkdirSync(path.join(root,'tools'));fs.mkdirSync(path.join(root,'.local'));fs.mkdirSync(path.join(root,'fixture-game'));
    const script=path.join(root,'tools','Prepare-VehicleLiveCandidate.ps1');fs.copyFileSync(new URL('../tools/Prepare-VehicleLiveCandidate.ps1',import.meta.url),script);
    fs.writeFileSync(path.join(root,'.gitignore'),'.local/\nfixture-game/\n');git(['init','--quiet']);git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','disposable preparer fixture']);
    const manifest=path.join(root,'.local','baseline.json'),helpers=path.join(root,'.local','helpers');fs.mkdirSync(helpers);
    const game=path.join(root,'fixture-game'),sentinel=path.join(game,'original.txt');fs.writeFileSync(sentinel,'untouched');
    const files=Array.from({length:26},(_,i)=>({RelativeDestination:i===0?'Plugins\\RichAudio.Beacon.Rph.dll':`fixture-${i}.bin`,Source:path.join(root,'.local',`file-${i}`),SHA256:'A'.repeat(64),Bytes:1,PriorState:'absent'}));for(const f of files)f.Destination=path.join(game,f.RelativeDestination);
    // Match the preserved deployment-manifest contract. Attempt/journal files
    // use a different Schema field and must not be substituted for this input.
    const base={SchemaVersion:1,State:'PREPARED_NOT_AUTHORISED',GameRoot:game,GameVersion:'1.0.1158.16',RphVersion:'1.132.1428.17748',Files:files,
      RenameSource:path.join(game,'GTA5.exe'),RenameDestination:path.join(game,'_GTA5.exe'),RenameSHA256:'B'.repeat(64),
      BaselineDirectory:path.join(root,'.local','baseline'),ExecutableBackupDirectory:path.join(root,'.local','original-executables'),
      GeneratedFiles:['asiloader.log','commandline.txt','DirectStorageFix.log','RagePluginHook.ini','RagePluginHook.log','RagePluginHookLauncher.log','startup.rphs','ExecuteCode\\Code1.cs']};
    // Keep the caller's workspace as cwd: on hosted Windows it may be D: while
    // this disposable repository and Node's possibly-short temp path are on C:.
    const run=()=>spawnSync('pwsh',['-NoProfile','-File',script,'-BaselineManifest',manifest,'-HelperDirectory',helpers],{encoding:'utf8',windowsHide:true,timeout:10000,cwd:process.cwd()});
    fs.writeFileSync(manifest,JSON.stringify(base));fs.appendFileSync(script,'\n# uncommitted source');let r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/Commit all relevant source/);git(['checkout','--','tools/Prepare-VehicleLiveCandidate.ps1']);
    for(const altered of [{...base,SchemaVersion:undefined,Schema:1},{...base,GameVersion:'unreviewed'},{...base,RphVersion:'unreviewed'}]){
      fs.writeFileSync(manifest,JSON.stringify(altered));r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/exact-build 26-file SchemaVersion baseline/);
    }
    const bad=structuredClone(base);bad.Files[1].RelativeDestination='..\\escape.bin';bad.Files[1].Destination=path.join(game,'..','escape.bin');fs.writeFileSync(manifest,JSON.stringify(bad));r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/Unsafe or duplicate baseline destination/);
    fs.writeFileSync(manifest,JSON.stringify(base));const marker=path.join(root,'.local','helper-executed');for(const name of ['Invoke-Session.ps1','Verify-Original.ps1','LaunchOnly.Common.ps1'])fs.writeFileSync(path.join(helpers,name),`Set-Content -LiteralPath '${marker.replaceAll("'","''")}' -Value executed`);
    r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/Unreviewed filesystem-only attempt helper/);
    const equivalent={...base,RenameSource:game+'\\.\\GTA5.exe',RenameDestination:game.replaceAll('\\','/')+'/./_GTA5.exe'};
    fs.writeFileSync(manifest,JSON.stringify(equivalent));r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/Unreviewed filesystem-only attempt helper/);
    const escaped={...base,RenameSource:game+'\\..\\GTA5.exe'};fs.writeFileSync(manifest,JSON.stringify(escaped));r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/Original executable rename scope differs/);
    assert.equal(fs.readFileSync(sentinel,'utf8'),'untouched');assert.deepEqual(fs.readdirSync(game),['original.txt']);assert.ok(!fs.existsSync(marker));assert.ok(!fs.existsSync(path.join(root,'.local','vehicle-live-01-review')));assert.ok(!fs.existsSync(path.join(root,'escape.bin')));
  }finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true});}
});
