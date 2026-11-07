// One reusable metadata-only thread; never reads geometry chunks or audio.
import {parentPort,workerData} from 'node:worker_threads';import fs from 'node:fs';
import {createHash} from 'node:crypto';import path from 'node:path';
import {InstalledStaticWorld01} from './installed-static-scene01.mjs';import {metadataOperations01,sceneAuthorityBinding01,sceneRowAuthority01} from './prepared-world-metadata01.mjs';
const {config}=workerData;let iterator=null,buffered=null,serial=0,hash=null,installed=null,candidate=null;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
function readAuthorityView(bytes){
 const expected=/^\{"SceneAuthoritySHA25601":"([a-f0-9]{64})",/.exec(bytes.toString('utf8',0,100))?.[1];
 if(!expected)return null;
 const file=path.join(path.dirname(config.manifestPath),'driver-plan01.json');
 try{
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.size<=0||stat.size>16777216)return null;
  const raw=fs.readFileSync(file);
  if(raw.length>16777216)return null;
  const driver=JSON.parse(raw),view=driver.SceneAuthority01;
  if(driver.Schema!==1||!Array.isArray(view?.rows)||view.rows.length>262144||
     expected!==sha256(JSON.stringify(view))||driver.ManifestSHA256!==sha256(bytes))return null;
  const rows=new Map(view.rows);
  return rows.size===view.rows.length?{binding:view.binding,rows}:null;
 }catch{return null;}
}
function postProof(message,began,binding,readAuthority,proofBasis01){
 const sameHeader=binding===installed?.binding&&installed!==null;
 const currentRow=id=>installed.authority.has(id)&&installed.authority.get(id)===readAuthority(id);
 const current=sameHeader&&[...installed.authority.keys()].every(currentRow);
 const activeCurrent=sameHeader&&(message.activeIds??[]).every(currentRow);
 parentPort.postMessage({type:'proof-current',serial,current,activeCurrent,
  consumerRequestId:message.consumerRequestId??null,proofMilliseconds:performance.now()-began,proofBasis01});
}

function sendNext(){const packet=[];let bytes=2;for(;;){const next=buffered??iterator.next();buffered=null;if(next.done){if(packet.length){buffered=next;break;}iterator=null;parentPort.postMessage({type:'complete',serial,digest:hash.digest('hex')});return;}const size=Buffer.byteLength(JSON.stringify(next.value))+1;if(packet.length&&(packet.length>=256||bytes+size>32768)){buffered=next;break;}if(size>32760)throw Error('Metadata packet scalar bound');packet.push(next.value);bytes+=size;}hash.update(JSON.stringify(packet));parentPort.postMessage({type:'packet',serial,packet});}
parentPort.on('message',m=>{try{
 if(m.type==='installed'){if(m.serial===serial)installed=candidate;return;}
 if(m.type==='next'){if(iterator&&m.serial===serial)sendNext();return;}
 if(m.type!=='prepare'||m.serial<=serial)throw Error('Ordered metadata preparation required');
 // The consumer can discard an obsolete transfer at a packet boundary.
 iterator=null;buffered=null;candidate=null;serial=m.serial;
 const began=performance.now();
 for(let at=path.resolve(config.manifestPath);;at=path.dirname(at)){if(fs.lstatSync(at).isSymbolicLink())throw Error('Linked metadata input');if(path.dirname(at)===at)break;}const stat=fs.statSync(config.manifestPath);if(stat.size<=0||stat.size>67108864)throw Error('Bounded manifest');const bytes=fs.readFileSync(config.manifestPath);
 if(bytes.length<=0||bytes.length>67108864)throw Error('Bounded manifest bytes');
 const fast=installed?readAuthorityView(bytes):null;
 if(fast)postProof(m,began,fast.binding,id=>fast.rows.get(id),'manifest-bound-driver-view');
 const manifest=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
 const sha=manifest.ResolvedCatalogSHA256;if(!/^[a-f0-9]{64}$/.test(sha??'')||config.catalogSHA256&&sha!==config.catalogSHA256||config.expectedGameSHA256&&manifest.InputBinding?.GameExecutableSHA256!==config.expectedGameSHA256)throw Error('Metadata game/catalogue identity');
 parentPort.postMessage({type:'manifest-read',serial,milliseconds:performance.now()-began,bytes:bytes.length});
 if(m.epoch&&manifest.ValidationEpochUtc01!==m.epoch){parentPort.postMessage({type:'waiting',serial});return;}
 const binding=sceneAuthorityBinding01(manifest);
 const byId=new Map(),authorityById=new Map();
 for(const row of manifest.Resources??[]){if(byId.has(row.Id))throw Error('Unique metadata resource IDs required');byId.set(row.Id,row);}
 const readAuthority=id=>{
  if(!authorityById.has(id)&&byId.has(id))authorityById.set(id,sceneRowAuthority01(byId.get(id)));
  return authorityById.get(id);
 };
 if(!fast)postProof(m,began,manifest.Schema===1&&Array.isArray(manifest.Resources)?binding:null,readAuthority,'full-manifest');
 else if(fast.binding!==binding||[...fast.rows].some(([id,authority])=>authority!==readAuthority(id)))throw Error('Driver proof view does not match parsed manifest');
 const world=new InstalledStaticWorld01({...config,catalogSHA256:sha,requiredValidationEpochUtc01:m.epoch??null,manifestInput01:manifest});
 const snapshot=world.exportMetadata01();
 candidate={binding,authority:new Map(world.rows.filter(({row})=>row.Status==='imported-exterior-incomplete-surfaces').map(({row})=>[row.Id,readAuthority(row.Id)]))};
 world.close();
 parentPort.postMessage({type:'begin',serial,preparationMilliseconds:performance.now()-began});
 hash=createHash('sha256');iterator=metadataOperations01(snapshot);sendNext();
 }catch(e){iterator=null;buffered=null;parentPort.postMessage({type:e.code==='ENOENT'&&!config.catalogSHA256?'waiting':'failed',serial,reason:e.message});}});
