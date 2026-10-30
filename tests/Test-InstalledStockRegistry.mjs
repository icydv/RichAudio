import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadStockCatalogAssets} from '../src/acoustics/vehicle/stock-source.mjs';
import {loadInstalledStockRegistry} from '../src/acoustics/vehicle/installed-stock-registry.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
const catalogFile=process.env.RICHAUDIO_INSTALLED_CATALOG,reportFile=process.env.RICHAUDIO_STOCK_SOURCE05_REPORT;
test('installed registry binds genuine banks and rejects graph mismatches without name/class/NPC fallback',
 {skip:!catalogFile||!reportFile},()=>{
 const report=JSON.parse(fs.readFileSync(reportFile)),assets=loadStockCatalogAssets(report.inputs.manifestFile,{sustainAtlasFile:report.inputs.sustainAtlasFile});
 const bytes=fs.readFileSync(catalogFile),catalog=JSON.parse(bytes),expected=JSON.parse(fs.readFileSync(path.join(root,'evidence/installed-game-cache-validation.json'))).Summary.ResolvedCatalogSHA256;
 assert.equal(sha(bytes),expected);
 const registry=loadInstalledStockRegistry({catalogFile,catalogSha256:expected,assets});assert.equal(registry.modelCount,935);
 for(const [model,bank]of assets.vehicles){const v=catalog.Vehicles.find(v=>v.Model===model),key=parseInt(v.ModelHash,16),resolved=registry.resolve(key,'player');
  assert.equal(resolved.status,'available',model);assert.equal(resolved.bank,bank);assert.equal(registry.createSource(key,'player').vehicle,bank);
  assert.notEqual(registry.resolve(key,'npc').status,'available','NPC bank must not silently use player bank');
 }
 assert.equal(registry.resolve(0,'player').reason,'unknown-installed-model');assert.throws(()=>registry.resolve(-1));assert.throws(()=>registry.resolve(0,'other'));
 assert.throws(()=>loadInstalledStockRegistry({catalogFile,catalogSha256:'0'.repeat(64),assets}));
 const tempRoot=path.join(root,'.local','installed-registry-tests'),folder=path.join(tempRoot,randomUUID());fs.mkdirSync(folder,{recursive:true});
 const fixtureFile=path.join(folder,'fixture.json'),base=catalog.Vehicles.find(v=>v.Model==='bati');
 function fixture(mutate,library=assets){const c={Schema:1,Stage:catalog.Stage,ParserErrorCount:0,InputBinding:catalog.InputBinding,Vehicles:[structuredClone(base)]};mutate(c);
  const b=Buffer.from(JSON.stringify(c));fs.writeFileSync(fixtureFile,b);return loadInstalledStockRegistry({catalogFile:fixtureFile,catalogSha256:sha(b),assets:library});}
 try{
  const shared=fixture(c=>{c.Vehicles[0].Model='authored_shared_graph_fixture';c.Vehicles[0].ModelHash='00000001';});
  assert.equal(shared.resolve(1,'player').bank,assets.vehicles.get('bati'),'sharing requires the exact same graph, regardless of model label');
  for(const change of [l=>l.AwcSHA256='0'.repeat(64),l=>l.CandidateCount=2,l=>l.Candidates[0].Path='different.awc',l=>l.Stream.Frames++,l=>l.Stream.SampleRate=32000,l=>l.Stream.Codec=4,l=>l.MaskedAwcStreamId='0x00000000',l=>l.State='ambiguous']){
   const r=fixture(c=>change(c.Vehicles[0].Sounds.EngineAccel.ChannelLinks[0]));assert.equal(r.resolve(parseInt(base.ModelHash,16),'player').status,'unavailable');
   assert.throws(()=>r.createSource(parseInt(base.ModelHash,16),'player'));
  }
  const absent=fixture(c=>{delete c.Vehicles[0].Sounds.EngineAccel;});assert.equal(absent.resolve(parseInt(base.ModelHash,16),'player').status,'unavailable');
  assert.throws(()=>fixture(c=>c.Vehicles.push(c.Vehicles[0])));
  assert.throws(()=>fixture(c=>c.InputBinding={...c.InputBinding,CodeWalkerCoreSHA256:'0'.repeat(64)}));
  assert.throws(()=>fixture(()=>{},{...assets,vehicles:new Map([['forged',{...assets.vehicles.get('bati')} ]])}));
  const dup=fixture(()=>{},{...assets,vehicles:new Map([['first',assets.vehicles.get('bati')],['second',assets.vehicles.get('bati')]])});
  assert.equal(dup.resolve(parseInt(base.ModelHash,16),'player').reason,'ambiguous-decoded-bank');
 }finally{assert.ok(path.resolve(folder).startsWith(path.resolve(tempRoot)+path.sep));fs.rmSync(folder,{recursive:true});}
});
