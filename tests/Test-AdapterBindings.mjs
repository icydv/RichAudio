import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {executedPaths,operatorFiles,moduleClosure,verifyExecutionBindings} from '../tools/operator/adapter.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
test('recursive source coverage reaches simulation worker and external scene helper',()=>{
 const files=moduleClosure([path.join(root,'tools/Run-Acoustics07.mjs')]);assert.ok(files.includes(path.join(root,'src/acoustics/streaming/simulation-worker.mjs')));assert.ok(files.includes(path.join(root,'tools/acoustics-06-scenes.mjs')));
});
test('executed entry, membership broker and omitted transitive imports cannot escape seal',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'richaudio-binding-'));
 try{
  const manifest=path.join(dir,'manifest.json');writeFileSync(manifest,JSON.stringify({Files:Array.from({length:26},(_,n)=>({Source:path.join(dir,String(n))}))}));
  const runtime=path.join(root,'tools/Run-Acoustics07.mjs'),required=[...moduleClosure([...operatorFiles,runtime]),executedPaths.broker,process.execPath,manifest,...Array.from({length:26},(_,n)=>path.join(dir,String(n)))];
  const p={entry:executedPaths.entry,broker:executedPaths.broker,node:process.execPath,executable:manifest,bridge:manifest,manifest,cwd:root,bindings:required.map(path=>({path}))};
  assert.ok(verifyExecutionBindings(p).length>26);
  assert.throws(()=>verifyExecutionBindings({...p,broker:path.join(dir,'different-broker.exe')}),/path differs/);
  assert.throws(()=>verifyExecutionBindings({...p,entry:path.join(dir,'different-entry.mjs')}),/path differs/);
  for(const omitted of [executedPaths.broker,path.join(root,'tools/operator/supervisor.mjs'),path.join(root,'tools/acoustics-06-scenes.mjs')])assert.throws(()=>verifyExecutionBindings({...p,bindings:p.bindings.filter(b=>b.path!==omitted)}),/missing from bindings/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
