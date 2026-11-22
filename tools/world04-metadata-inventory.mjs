// Pure bounded metadata decoder. No filesystem, network, key loader, resource
// decompression or installed-resource executor is imported by this module.
// The separate proposal remains BLOCKED until independent process containment
// and its complete hash closure have been implemented and reviewed.
import {byteDigest,freeze,requireWorld} from '../src/acoustics/world/contracts.mjs';

export const metadataInventoryRevision04='uncompressed-rpf7-outer-table-v1';
export const metadataInventoryLimits04=Object.freeze({archives:1,reads:2,headerBytes:16,entries:32768,namesBytes:1048576,tableBytes:1572864,outputRows:2048,outputBytes:524288,nameBytes:128,pathBytes:384,depth:16});
export const metadataInventoryAllowlist04=Object.freeze(['update/update.rpf']);

// A range authority is produced from a header only; offsets never come from a
// directory entry. The sole possible second read is contiguous offset 16.
export function planMetadataRead04({archive,header,archiveBytes}={}){
 requireWorld(metadataInventoryAllowlist04.includes(archive),'archive outside exact metadata allowlist');
 requireWorld(Buffer.isBuffer(header)&&header.length===16&&Number.isSafeInteger(archiveBytes)&&archiveBytes>=16,'exact header and handle-derived archive length');
 requireWorld(header.readUInt32LE(0)===0x52504637,'unsupported archive version');
 const entries=header.readUInt32LE(4),namesBytes=header.readUInt32LE(8),encryption=header.readUInt32LE(12);
 requireWorld(entries>0&&entries<=metadataInventoryLimits04.entries&&namesBytes>0&&namesBytes<=metadataInventoryLimits04.namesBytes,'bounded metadata counts');
 const tableBytes=entries*16+namesBytes;
 requireWorld(tableBytes<=metadataInventoryLimits04.tableBytes&&16+tableBytes<=archiveBytes,'metadata ranges wholly inside archive');
 const readable=encryption===0||encryption===0x4e45504f;
 return freeze({revision:metadataInventoryRevision04,archive,archiveBytes,headerSHA256:byteDigest(header),entries,namesBytes,encryption,
  state:readable?'bounded-uncompressed-metadata-only':'blocked-encrypted-or-unknown-table',
  nextRead:readable?{offset:16,bytes:tableBytes}:null,maximumInstalledBytes:readable?16+tableBytes:16,
  installationQualified:false,resourcesRead:0,keysRead:0});
}

export function decodeMetadataTable04({archive,header,archiveBytes,table}={}){
 const plan=planMetadataRead04({archive,header,archiveBytes});
 requireWorld(plan.nextRead&&Buffer.isBuffer(table)&&table.length===plan.nextRead.bytes,'exact approved plain metadata range required');
 const names=table.subarray(plan.entries*16),entries=[];
 function nameAt(offset,index){
  requireWorld(offset<names.length,'metadata name offset');const end=names.indexOf(0,offset);
  requireWorld(end>=offset&&end-offset<=metadataInventoryLimits04.nameBytes,'bounded terminated metadata name');
  const bytes=names.subarray(offset,end);requireWorld(bytes.every(n=>n>=32&&n<=126),'ASCII metadata names only');
  const name=bytes.toString('ascii').toLowerCase();
  requireWorld((index===0&&name==='')||(/^[a-z0-9_.+ -]+$/.test(name)&&name!=='.'&&name!=='..'),'unsafe metadata member name');return name;
 }
 for(let i=0;i<plan.entries;i++){
  const at=i*16,tag=table.readUInt32LE(at+4),directory=tag===0x7fffff00;
  const name=nameAt(directory?table.readUInt32LE(at):table.readUInt16LE(at),i);
  if(directory){const start=table.readUInt32LE(at+8),count=table.readUInt32LE(at+12);requireWorld(start<=plan.entries&&count<=plan.entries-start,'directory child range');entries.push({name,kind:'directory',start,count});}
  else entries.push({name,kind:tag&0x80000000?'resource':'binary'});
 }
 requireWorld(entries[0].kind==='directory','root directory required');
 const seen=new Set([0]),paths=new Set(),queue=[{index:0,path:'',depth:0}],rows=[];
 for(let q=0;q<queue.length;q++){
  const parent=queue[q],dir=entries[parent.index];requireWorld(parent.depth<=metadataInventoryLimits04.depth,'directory depth budget');
  for(let i=dir.start;i<dir.start+dir.count;i++){
   requireWorld(!seen.has(i),'duplicate/cyclic directory ownership');seen.add(i);const entry=entries[i],logical=parent.path?parent.path+'/'+entry.name:entry.name;
   requireWorld(logical.length<=metadataInventoryLimits04.pathBytes&&!paths.has(logical),'ambiguous or oversized logical member');paths.add(logical);
   if(entry.kind==='directory')queue.push({index:i,path:logical,depth:parent.depth+1});
   else if(/\.(?:rpf|ymap|ytyp|ybn)$/.test(logical)||logical==='common/data/dlclist.xml'){
    requireWorld(rows.length<metadataInventoryLimits04.outputRows,'metadata output row budget');rows.push({logicalMember:logical,kind:entry.kind,index:i});
   }
  }
 }
 requireWorld(seen.size===entries.length,'unreachable metadata entries');
 const output={revision:metadataInventoryRevision04,archive,archiveBytes,headerSHA256:plan.headerSHA256,tableSHA256:byteDigest(table),readBytes:16+table.length,
  rows:rows.sort((a,b)=>a.logicalMember.localeCompare(b.logicalMember)),memberPayloadsRead:0,nestedArchivesOpened:0,installationQualified:false,
  missingEvidence:['effective-enabled-mount-order','selected-ymap-ytyp-ybn-identities','placement-collision-link','coordinates-and-scale','activation-state','independently-supervised-installed-read']};
 requireWorld(Buffer.byteLength(JSON.stringify(output))<=metadataInventoryLimits04.outputBytes,'metadata output byte budget');return freeze(output);
}
