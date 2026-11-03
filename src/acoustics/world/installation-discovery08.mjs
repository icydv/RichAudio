// Bounded prelaunch discovery only. Importing this file performs no IO. The
// caller supplies one approved root and supported custom roots; no drive scan,
// registry search, GUI, key loader or executable content read is performed.
import fs from 'node:fs/promises';
import path from 'node:path';
import {byteDigest,digest,freeze,requireWorld} from './contracts.mjs';
const scopes=new WeakMap();
export const installationDiscoveryLimits08=Object.freeze({entries:4096,archives:1024,customRoots:16,archiveBytes:1099511627776,logicalSourceBytes:17592186044416});
function exactRoot(root){requireWorld(typeof root==='string'&&path.isAbsolute(root),'explicit absolute approved discovery root');return path.resolve(root);}
async function noLinks(file,{directory=false}={}){
 for(let at=file;at;at=path.dirname(at)){const s=await fs.lstat(at);requireWorld(!s.isSymbolicLink(),'linked discovery ancestor refused');const parent=path.dirname(at);if(parent===at)break;}
 const s=await fs.lstat(file);requireWorld(directory?s.isDirectory():s.isFile()&&s.nlink===1,'regular no-link discovery source');return s;
}
// This token binds a separately supplied scope; it grants no permission by
// itself. A real candidate must review/pin this exact descriptor externally.
export function pinInstallationScope08(bytes,{expectedSHA256}={}){
 requireWorld(Buffer.isBuffer(bytes)&&bytes.length<=16384&&byteDigest(bytes)===expectedSHA256,'exact external discovery scope pin');
 const scope=JSON.parse(bytes.toString('utf8'));requireWorld(scope?.kind==='RichAudioDiscoveryScope08'&&scope.schema===1&&['original-authored-install-layout','separately-approved-installation'].includes(scope.origin)&&typeof scope.reviewReceiptSHA256==='string'&&/^[a-f0-9]{64}$/.test(scope.reviewReceiptSHA256),'reviewed discovery scope identity');
 const root=exactRoot(scope.root);requireWorld(Array.isArray(scope.customRoots)&&scope.customRoots.length<=16&&scope.customRoots.every(r=>typeof r.id==='string'&&/^[A-Za-z0-9_.-]{1,48}$/.test(r.id)&&typeof r.path==='string')&&new Set(scope.customRoots.map(r=>r.id)).size===scope.customRoots.length,'bounded exact supported custom roots');
 const token=Object.freeze({kind:'RichAudioDiscoveryScopeToken08'});scopes.set(token,freeze({...scope,root,customRoots:scope.customRoots.map(r=>({...r,path:exactRoot(r.path)})),scopeSHA256:expectedSHA256}));return token;
}
export async function discoverInstallationArchives08(token,{signal}={}){
 const scope=scopes.get(token);requireWorld(scope,'branded independently pinned installation scope');let entries=0,sourceBytes=0;const archives=[],unknown=[],seen=new Set();
 const cancelled=()=>{if(signal?.aborted)throw Error('discovery-cancelled');};
 const list=async directory=>{cancelled();await noLinks(directory,{directory:true});const names=[],dir=await fs.opendir(directory,{bufferSize:16});try{for(;;){cancelled();const item=await dir.read();if(!item)break;requireWorld(++entries<=installationDiscoveryLimits08.entries,'bounded source-domain directory names');names.push(item.name);}}finally{await dir.close();}return names.sort();};
 const add=async(file,logicalArchive,family,customId=null)=>{cancelled();const resolved=path.resolve(file);requireWorld(!seen.has(resolved.toLowerCase()),'duplicate physical archive source');seen.add(resolved.toLowerCase());const s=await noLinks(resolved);requireWorld(s.size>=16&&s.size<=installationDiscoveryLimits08.archiveBytes,'bounded archive file length');sourceBytes+=s.size;requireWorld(archives.length<installationDiscoveryLimits08.archives&&sourceBytes<=installationDiscoveryLimits08.logicalSourceBytes,'bounded logical archive source domain, not a content-read budget');archives.push({id:'archive-'+digest(logicalArchive).slice(0,24),path:resolved,logicalArchive,family,customId,bytes:s.size,identity:{dev:String(s.dev),ino:String(s.ino),mtimeMs:s.mtimeMs},sha256:null,contentRead:false});};
 const optional=async(directory,work)=>{try{await work(await list(directory));}catch(e){if(e.code==='ENOENT'){unknown.push({logicalRoot:path.relative(scope.root,directory).replaceAll('\\','/'),reason:'declared-root-absent'});return;}throw e;}};
 await optional(scope.root,async names=>{for(const n of names.filter(n=>/\.rpf$/i.test(n)))await add(path.join(scope.root,n),n,'base');});
 const update=path.join(scope.root,'update');await optional(update,async names=>{for(const n of names.filter(n=>/\.rpf$/i.test(n)))await add(path.join(update,n),'update/'+n,'update');});
 const packs=path.join(update,'x64','dlcpacks');await optional(packs,async names=>{for(const n of names){requireWorld(/^[A-Za-z0-9_.-]+$/.test(n)&&n!=='.'&&n!=='..','bounded declared DLC pack name');const dir=path.join(packs,n),s=await fs.lstat(dir);requireWorld(s.isDirectory()&&!s.isSymbolicLink(),'DLC pack directory only');const members=await list(dir);if(members.includes('dlc.rpf'))await add(path.join(dir,'dlc.rpf'),'update/x64/dlcpacks/'+n+'/dlc.rpf','dlc');else unknown.push({logicalRoot:'update/x64/dlcpacks/'+n,reason:'supported-dlc-rpf-absent'});}});
 for(const custom of scope.customRoots)await optional(custom.path,async names=>{for(const n of names.filter(n=>/\.rpf$/i.test(n)))await add(path.join(custom.path,n),'custom/'+custom.id+'/'+n,'custom',custom.id);});
 return freeze({kind:'RichAudioDiscoveredArchiveDomain08',scopeSHA256:scope.scopeSHA256,origin:scope.origin,archives,unknown,entries,logicalSourceBytes:sourceBytes,sourceContentReadBytes:0,archiveContentsRead:0,executablesRead:0,
  mountPrecedence:'not-established-by-directory-order; decode-DLC-declarations-before-selection',completeInstallationClaimed:false,installedWorldVerified:false});
}
