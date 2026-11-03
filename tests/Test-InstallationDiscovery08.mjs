import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pinInstallationScope08,discoverInstallationArchives08} from '../src/acoustics/world/installation-discovery08.mjs';
import {byteDigest} from '../src/acoustics/world/contracts.mjs';

async function harness(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'richaudio-discovery08-')),custom=path.join(root,'authored-custom');await fs.mkdir(custom);
 const write=async name=>{const p=path.join(root,name);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,Buffer.alloc(16));};
 await write('base.rpf');await write('update/update.rpf');await write('update/x64/dlcpacks/declared/dlc.rpf');await write('update/x64/dlcpacks/undeclared/not-an-archive.txt');await write('authored-custom/override.rpf');await write('private-not-searched/nested.rpf');await write('GTA5_Enhanced.exe');
 const bytes=Buffer.from(JSON.stringify({schema:1,kind:'RichAudioDiscoveryScope08',origin:'original-authored-install-layout',root,customRoots:[{id:'authored',path:custom}],reviewReceiptSHA256:'a'.repeat(64)}));
 return {root,bytes,token:pinInstallationScope08(bytes,{expectedSHA256:byteDigest(bytes)}),async close(){const parent=path.resolve(os.tmpdir());assert.equal(path.dirname(path.resolve(root)),parent);assert.match(path.basename(root),/^richaudio-discovery08-/);await fs.rm(root,{recursive:true,force:true});}};
}
test('finite automatic base/update/DLC/custom discovery reads no archive or executable contents and does not infer precedence',async()=>{
 const h=await harness();try{const result=await discoverInstallationArchives08(h.token);assert.equal(result.archives.length,4);assert(result.archives.every(a=>a.sha256===null&&a.contentRead===false));assert.equal(result.archiveContentsRead,0);assert.equal(result.executablesRead,0);assert(result.unknown.some(u=>u.reason==='supported-dlc-rpf-absent'));assert.match(result.mountPrecedence,/not-established/);assert(!result.archives.some(a=>a.logicalArchive.includes('private-not-searched')));assert.equal(result.completeInstallationClaimed,false);}finally{await h.close();}
});
test('discovery requires an exact external scope and propagates cancellation before work',async()=>{
 const h=await harness();try{assert.throws(()=>pinInstallationScope08(h.bytes,{expectedSHA256:'0'.repeat(64)}),/pin/);await assert.rejects(discoverInstallationArchives08({...h.token}),/branded/);const controller=new AbortController();controller.abort();await assert.rejects(discoverInstallationArchives08(h.token,{signal:controller.signal}),/cancelled/);}finally{await h.close();}
});
test('source-domain links cannot expand the approved finite search',async t=>{
 const h=await harness();try{const target=path.join(h.root,'base.rpf'),link=path.join(h.root,'linked.rpf');try{await fs.symlink(target,link,'file');}catch(e){if(['EPERM','EACCES'].includes(e.code)){t.skip('Windows account cannot create a test file symlink');return;}throw e;}await assert.rejects(discoverInstallationArchives08(h.token),/linked|no-link/);}finally{await h.close();}
});
