// One reusable metadata-only thread; never reads geometry chunks or audio.
import {parentPort,workerData} from 'node:worker_threads';import fs from 'node:fs';
import {createHash} from 'node:crypto';import path from 'node:path';
import {digest} from './contracts.mjs';
import {InstalledStaticWorld01} from './installed-static-scene01.mjs';import {metadataOperations01} from './prepared-world-metadata01.mjs';
const {config}=workerData;let iterator=null,buffered=null,world=null,serial=0,hash=null,installed=null,candidate=null;
const authority=row=>digest([row.Id,row.Hash,row.Status,row.Eligibility,row.Result??null,row.ArchiveValidation01??null]);
function sendNext(){const packet=[];let bytes=2;for(;;){const next=buffered??iterator.next();buffered=null;if(next.done){if(packet.length){buffered=next;break;}iterator=null;parentPort.postMessage({type:'complete',serial,digest:hash.digest('hex')});return;}const size=Buffer.byteLength(JSON.stringify(next.value))+1;if(packet.length&&(packet.length>=256||bytes+size>32768)){buffered=next;break;}if(size>32760)throw Error('Metadata packet scalar bound');packet.push(next.value);bytes+=size;}hash.update(JSON.stringify(packet));parentPort.postMessage({type:'packet',serial,packet});}
parentPort.on('message',m=>{try{
 if(m.type==='installed'){if(m.serial===serial)installed=candidate;return;}
 if(m.type==='next'){if(iterator&&m.serial===serial)sendNext();return;}
 if(m.type!=='prepare'||iterator)throw Error('One metadata preparation at a time');serial=m.serial;const began=performance.now();
 for(let at=path.resolve(config.manifestPath);;at=path.dirname(at)){if(fs.lstatSync(at).isSymbolicLink())throw Error('Linked metadata input');if(path.dirname(at)===at)break;}const stat=fs.statSync(config.manifestPath);if(stat.size<=0||stat.size>67108864)throw Error('Bounded manifest');const manifest=JSON.parse(fs.readFileSync(config.manifestPath,'utf8').replace(/^\uFEFF/,''));
 const sha=manifest.ResolvedCatalogSHA256;if(!/^[a-f0-9]{64}$/.test(sha??'')||config.catalogSHA256&&sha!==config.catalogSHA256||config.expectedGameSHA256&&manifest.InputBinding?.GameExecutableSHA256!==config.expectedGameSHA256)throw Error('Metadata game/catalogue identity');
 parentPort.postMessage({type:'manifest-read',serial,milliseconds:performance.now()-began,bytes:stat.size});
 if(m.epoch&&manifest.ValidationEpochUtc01!==m.epoch){parentPort.postMessage({type:'waiting',serial});return;}
 const sameHeader=manifest.Schema===1&&Array.isArray(manifest.Resources)&&!!installed&&sha===installed.catalogSHA256&&manifest.ValidationEpochUtc01===installed.manifest.ValidationEpochUtc01&&manifest.InputFingerprint===installed.manifest.InputFingerprint&&digest(manifest.InputBinding)===digest(installed.manifest.InputBinding);
 const byId=new Map();for(const row of manifest.Resources??[]){if(byId.has(row.Id))throw Error('Unique metadata resource IDs required');byId.set(row.Id,row);}
 const currentRow=id=>{const old=installed?.rowsByOwner01[digest(id)]?.row,next=byId.get(id);return !!old&&!!next&&authority(old)===authority(next);};
 const current=sameHeader&&installed.rows.filter(e=>e.row.Status==='imported-exterior-incomplete-surfaces').every(e=>currentRow(e.row.Id));
 const activeCurrent=sameHeader&&(m.activeIds??[]).every(currentRow);
 parentPort.postMessage({type:'proof-current',serial,current,activeCurrent,consumerRequestId:m.consumerRequestId??null,proofMilliseconds:performance.now()-began});
 world?.close();world=new InstalledStaticWorld01({...config,catalogSHA256:sha,requiredValidationEpochUtc01:m.epoch??null,manifestInput01:manifest});
 const snapshot=world.exportMetadata01();candidate=snapshot;parentPort.postMessage({type:'begin',serial,preparationMilliseconds:performance.now()-began});hash=createHash('sha256');iterator=metadataOperations01(snapshot);sendNext();
 }catch(e){iterator=null;buffered=null;parentPort.postMessage({type:e.code==='ENOENT'&&!config.catalogSHA256?'waiting':'failed',serial,reason:e.message});}});
