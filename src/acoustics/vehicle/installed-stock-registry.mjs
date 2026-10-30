// Exact installed graph -> already verified PCM bank. No class/name fallback.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {isVerifiedStockBank,stockRoles,stockModes,StockVehicleSource} from './stock-source.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const digest=s=>typeof s==='string'&&/^[a-f0-9]{64}$/i.test(s);
const id=s=>{if(typeof s!=='string'||!/^(?:0x)?[a-f0-9]{8}$/i.test(s))throw Error('exact stream/model hash required');return parseInt(s.replace(/^0x/i,''),16);};
const route=s=>{if(typeof s!=='string'||!s)return null;return s.replaceAll('\\','/').toLowerCase();};
function bankSignature(bank,context='player'){
 if(!isVerifiedStockBank(bank)||!digest(bank.provenance?.awcSha256))throw Error('loaded, provenance-bound stock bank required');
 if((bank.audioContext??'player')!==context)throw Error('decoded bank context differs');
 const modes=context==='npc'?['idle','accel']:stockModes;
 return stockRoles.flatMap(role=>modes.map(mode=>{
  const name=role+'_'+mode,records=bank.streams?.filter(s=>s.name===name),a=bank.layers[role][mode];
  if(records?.length!==1)throw Error('distinct required original stream identities required');
  if(context==='npc'){
   const expected={engine_idle:0x1d18b9a1,engine_accel:0x1f7402aa,exhaust_idle:0x179ddcaa,exhaust_accel:0x03ab9171},record=records[0];
   if(!route(bank.provenance.archive)||(id(record.hash)&0x1fffffff)!==expected[name]||record.asset?.file!==a.file||record.asset?.sha256?.toLowerCase()!==a.sha256.toLowerCase())throw Error('NPC role must bind its exact original stream and PCM');
  }
  return [id(records[0].hash)&0x1fffffff,bank.provenance.awcSha256.toLowerCase(),route(bank.provenance.entry),a.frames,a.sampleRate,a.sourceFormat.codec,...(context==='npc'?[route(bank.provenance.archive)]:[])].join('|');
 })).sort().join('\n');
}
function graphSignature(sound,context='player'){
 if(sound?.ParserType!=='Dat54GranularSound'||sound.ChannelLinks?.length!==6)return null;
 const seen=new Set(),rows=[];
 for(const [index,link] of sound.ChannelLinks.entries()){
  if(context==='npc'){
   if(link.Index!==index)return null;
   if(index===2||index===3){
    if(link.State!=='unused-channel'||id(link.FullRelStreamHash)!==0||id(link.MaskedAwcStreamId)!==0||link.CandidateCount!==0||link.Candidates?.length!==0||link.Stream!==null||link.AwcSHA256!==null)return null;
    continue;
   }
   if(id(link.MaskedAwcStreamId)!==[0x1f7402aa,0x03ab9171,0,0,0x1d18b9a1,0x179ddcaa][index])return null;
  }
  if(link.State!=='verified-installed-container-and-stream'||link.CandidateCount!==1||link.Candidates?.length!==1||!digest(link.AwcSHA256)||!link.Stream)return null;
  const key=id(link.MaskedAwcStreamId);
  if(key!==(id(link.FullRelStreamHash)&0x1fffffff)||key!==id(link.Stream.StreamId)||seen.has(key))return null;
  seen.add(key);
  rows.push([key,link.AwcSHA256.toLowerCase(),route(link.Candidates[0].Path),link.Stream.Frames,link.Stream.SampleRate,link.Stream.Codec,...(context==='npc'?[route(link.Candidates[0].SourceArchive)]:[])].join('|'));
 }
 return rows.sort().join('\n');
}
export function loadInstalledStockRegistry({catalogFile,catalogSha256,assets,npcAssets=null}){
 if(!digest(catalogSha256)||fs.statSync(catalogFile).size>128*1024*1024)throw Error('bounded digest-pinned catalogue required');
 const bytes=fs.readFileSync(catalogFile);if(hash(bytes)!==catalogSha256.toLowerCase())throw Error('installed catalogue digest differs');
 const c=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
 if(c.Schema!==1||c.Stage!=='codewalker-resolved-installation-model'||c.ParserErrorCount!==0||!digest(c.InputBinding?.CodeWalkerCoreSHA256)||
   c.InputBinding.CodeWalkerCoreSHA256.toLowerCase()!==assets.manifest.sourceAssemblies?.CodeWalkerCoreSha256?.toLowerCase()||
   !Array.isArray(c.Vehicles)||c.Vehicles.length>20000)throw Error('matching installed/parser catalogue required');
 const banks=new Map();for(const bank of assets.vehicles.values()){
  const signature=bankSignature(bank),existing=banks.get(signature)??[];existing.push(bank);banks.set(signature,existing);
 }
 const npcBanks=new Map();if(npcAssets){
  if(!digest(c.InputBinding.GameExecutableSHA256)||c.InputBinding.GameExecutableSHA256.toLowerCase()!==npcAssets.manifest.gameExecutableSha256?.toLowerCase()||c.InputBinding.CodeWalkerCoreSHA256.toLowerCase()!==npcAssets.manifest.sourceAssemblies?.CodeWalkerCoreSha256?.toLowerCase())throw Error('NPC installed game/parser provenance differs');
  for(const bank of npcAssets.vehicles.values()){const signature=bankSignature(bank,'npc'),matches=npcBanks.get(signature)??[];matches.push(bank);npcBanks.set(signature,matches);}
 }
 const npcResolution=sound=>{const signature=graphSignature(sound,'npc'),matches=signature?npcBanks.get(signature):null;
  return Object.freeze(matches?.length===1?{status:'available',bank:matches[0],basis:'exact-installed-four-stream-npc-graph',runtimeSelectionObserved:false}:
   {status:'unavailable',reason:!signature?'incomplete-or-unverified-four-state-npc-graph':matches?.length?'ambiguous-decoded-bank':'npc-bank-not-decoded',runtimeSelectionObserved:false});};
 const entries=new Map();
 for(const v of c.Vehicles){
  const modelHash=id(v.ModelHash);if(entries.has(modelHash)||typeof v.Model!=='string')throw Error('distinct installed model identity required');
  const contexts={};for(const context of ['player']){
   const signature=graphSignature(v.Sounds?.[context==='player'?'EngineAccel':'EngineAccelNPC']),matches=signature?banks.get(signature):null;
   contexts[context]=Object.freeze(matches?.length===1?{status:'available',bank:matches[0],basis:'exact-installed-six-stream-graph',runtimeSelectionObserved:false}:
    {status:'unavailable',reason:!signature?'incomplete-or-unverified-six-state-graph':matches?.length?'ambiguous-decoded-bank':'bank-not-decoded',runtimeSelectionObserved:false});
  }
  // NPC graphs are resolved only on an explicit request, not enumerated here.
  entries.set(modelHash,Object.freeze({model:v.Model,modelHash,contexts:Object.freeze(contexts),npcSound:v.Sounds?.EngineAccelNPC}));
 }
 return Object.freeze({catalogSha256:catalogSha256.toLowerCase(),modelCount:entries.size,
  resolve(modelHash,context){
   if(!Number.isInteger(modelHash)||modelHash<0||modelHash>0xffffffff||!['player','npc'].includes(context))throw Error('unsigned model hash and explicit context required');
   const entry=entries.get(modelHash);return entry?Object.freeze({model:entry.model,modelHash,...(context==='npc'?npcResolution(entry.npcSound):entry.contexts[context])}):Object.freeze({status:'unavailable',reason:'unknown-installed-model'});
  },
  createSource(modelHash,context,options={}){
   const resolved=this.resolve(modelHash,context);if(resolved.status!=='available')throw Error('native stock source unavailable: '+resolved.reason);
   return new StockVehicleSource(resolved.bank,options);
  }
 });
}
