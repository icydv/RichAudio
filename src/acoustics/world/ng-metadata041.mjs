// Strict outer RPF7 metadata only. All input is already supplied bytes. No IO,
// executable, key acquisition, nested archive or member-payload API exists.
import {byteDigest,digest,fields,freeze,requireWorld} from './contracts.mjs';
import {decryptNgBuffer041,selectNgKey041} from './ng-cipher041.mjs';
export const ngMetadataRevision041='bounded-outer-rpf7-ng-metadata-v1';
export const ngMetadataLimits041=Object.freeze({headerBytes:16,entries:32768,namesBytes:1048576,tableBytes:1572864,nameBytes:128,pathBytes:384,depth:16,outputRows:2048,outputBytes:1048576});
export const rpfTags041=Object.freeze({none:0,open:0x4e45504f,aes:0x0ffffff9,ng:0x0fefffff});
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const catalogs=new WeakSet();
function archiveLabel(value){requireWorld(typeof value==='string'&&value.length>0&&value.length<=384&&!value.includes('\\')&&!value.includes(':')&&!value.startsWith('/')&&value.split('/').every(p=>/^[A-Za-z0-9_.+ -]+$/.test(p)&&p!=='.'&&p!=='..'),'explicit safe logical archive identity');return value.toLowerCase();}
export function planNgMetadata041({archive,archiveName,archiveBytes,header}={}){
 const logicalArchive=archiveLabel(archive);requireWorld(typeof archiveName==='string'&&/^[A-Za-z0-9_.+ -]{1,128}$/.test(archiveName)&&archiveName.toLowerCase()===logicalArchive.split('/').at(-1)&&Number.isSafeInteger(archiveBytes)&&archiveBytes>=16&&Buffer.isBuffer(header)&&header.length===16,'exact header, filename and handle-derived archive length');
 requireWorld(header.readUInt32LE(0)===0x52504637,'unsupported outer archive marker');const entries=header.readUInt32LE(4),namesBytes=header.readUInt32LE(8),tag=header.readUInt32LE(12),entryBytes=entries*16,tableBytes=entryBytes+namesBytes;
 requireWorld(entries>0&&entries<=ngMetadataLimits041.entries&&namesBytes>0&&namesBytes<=ngMetadataLimits041.namesBytes&&tableBytes<=ngMetadataLimits041.tableBytes&&16+tableBytes<=archiveBytes,'bounded metadata counts and archive ranges');
 const supported=[rpfTags041.none,rpfTags041.open,rpfTags041.ng].includes(tag),state=tag===rpfTags041.ng?'explicit-ng-profile-required':tag===rpfTags041.aes?'unsupported-aes-metadata':supported?'plain-metadata':'unsupported-unknown-encryption-tag';
 return freeze({revision:ngMetadataRevision041,logicalArchive,archiveName,archiveBytes,headerSHA256:byteDigest(header),entries,entryBytes,namesBytes,tableBytes,encryptionTag:tag,state,
  entriesRange:supported?{offset:16,bytes:entryBytes}:null,namesRange:supported?{offset:16+entryBytes,bytes:namesBytes}:null,tableRange:supported?{offset:16,bytes:tableBytes}:null,memberPayloadReadsAllowed:false,installedWorldVerified:false});
}
function pageBytes(flags){const units=((flags>>>27)&1)+(((flags>>>26)&1)*2)+(((flags>>>25)&1)*4)+(((flags>>>24)&1)*8)+(((flags>>>17)&127)*16)+(((flags>>>11)&63)*32)+(((flags>>>7)&15)*64)+(((flags>>>5)&3)*128)+(((flags>>>4)&1)*256);return 512*2**(flags&15)*units;}
export function decodeNgMetadata041(input){
 fields(input,['archive','archiveName','archiveBytes','header','table','profile','expected']);const plan=planNgMetadata041(input);requireWorld(plan.tableRange,'AES and unknown encryption tags cannot fall back to NG');
 const {table,expected}=input;fields(expected,['headerSHA256','tableSHA256']);requireWorld(Buffer.isBuffer(table)&&table.length===plan.tableBytes&&hex(expected.headerSHA256)&&expected.headerSHA256===plan.headerSHA256&&hex(expected.tableSHA256)&&expected.tableSHA256===byteDigest(table),'exact independently expected header/table input digests');
 let entryBytes=table.subarray(0,plan.entryBytes),names=table.subarray(plan.entryBytes),selection=null;
 if(plan.encryptionTag===rpfTags041.ng){selection=selectNgKey041(input.profile,plan);entryBytes=decryptNgBuffer041(entryBytes,input.profile,plan);names=decryptNgBuffer041(names,input.profile,plan);}
 else requireWorld(input.profile===undefined||input.profile===null,'plain metadata does not consume NG key material');
 function memberName(offset,index){requireWorld(offset<names.length,'metadata name offset outside table');let end=offset;while(end<names.length&&end-offset<=128&&names[end]!==0)end++;requireWorld(end<names.length&&end-offset<=128&&names[end]===0,'bounded terminated metadata member name');const bytes=names.subarray(offset,end);requireWorld(bytes.every(n=>n>=32&&n<=126),'ASCII metadata member names only');const name=bytes.toString('ascii');requireWorld(index===0&&name===''||/^[A-Za-z0-9_.+ -]+$/.test(name)&&name!=='.'&&name!=='..','unsafe metadata member name');return {name,nameOffset:offset,nameBytes:end-offset+1};}
 const entries=[],intervals=[];let unknownExtents=0;
 for(let i=0;i<plan.entries;i++){
  const at=i*16,tag=entryBytes.readUInt32LE(at+4),directory=tag===0x7fffff00,resource=!directory&&(tag&0x80000000)!==0;
  const named=memberName(directory?entryBytes.readUInt32LE(at):entryBytes.readUInt16LE(at),i),common={index:i,...named,kind:directory?'directory':resource?'resource':'binary',entryMetadataRange:{offset:16+at,bytes:16},encryptedEntrySHA256:byteDigest(table.subarray(at,at+16)),decodedEntrySHA256:byteDigest(entryBytes.subarray(at,at+16))};
  if(directory){const start=entryBytes.readUInt32LE(at+8),count=entryBytes.readUInt32LE(at+12);requireWorld(start<=plan.entries&&count<=plan.entries-start,'bounded directory child ownership range');entries.push({...common,start,count});continue;}
  const packedSize=entryBytes.readUIntLE(at+2,3),packedOffset=entryBytes.readUIntLE(at+5,3),offsetBlocks=resource?packedOffset&0x7fffff:packedOffset,offset=offsetBlocks*512;let storedBytes,extentState='bounded-declared-member',properties;
  if(resource){const systemFlags=entryBytes.readUInt32LE(at+8),graphicsFlags=entryBytes.readUInt32LE(at+12),systemBytes=pageBytes(systemFlags),graphicsBytes=pageBytes(graphicsFlags);requireWorld(systemBytes<=0x7fffffff&&graphicsBytes<=0x7fffffff&&systemBytes+graphicsBytes<=0x7fffffff,'unsupported overflowing resource page declarations');properties={packedSize,offsetBlocks,systemFlags,graphicsFlags,systemBytes,graphicsBytes,resourceVersion:(systemFlags>>>28)*16+(graphicsFlags>>>28)};
   if(packedSize===0xffffff){storedBytes=null;extentState='unqualified-extended-resource-size-needs-payload-header';unknownExtents++;}else storedBytes=packedSize||systemBytes+graphicsBytes;
  }else{const unpackedBytes=entryBytes.readUInt32LE(at+8),encryptionType=entryBytes.readUInt32LE(at+12);requireWorld(encryptionType===0||encryptionType===1,'unsupported binary member encryption declaration');storedBytes=packedSize||unpackedBytes;properties={packedSize,offsetBlocks,unpackedBytes,encryptionType,compressed:packedSize!==0};}
  const minimum=storedBytes===null?0xffffff:storedBytes;requireWorld(Number.isSafeInteger(offset)&&offset<=plan.archiveBytes&&minimum<=plan.archiveBytes-offset&&(minimum===0||offset>=16+plan.tableBytes),'declared member extent outside archive or aliases metadata');if(minimum>0)intervals.push({index:i,start:offset,end:offset+minimum});
  entries.push({...common,...properties,storedRange:{offset,bytes:storedBytes,end:storedBytes===null?null:offset+storedBytes},minimumStoredBytes:minimum,extentState,boundsQualified:storedBytes!==null});
 }
 requireWorld(entries[0].kind==='directory'&&entries[0].name==='','explicit empty-name archive root directory required');intervals.sort((a,b)=>a.start-b.start||a.end-b.end);for(let i=1;i<intervals.length;i++)requireWorld(intervals[i].start>=intervals[i-1].end,'overlapping declared member extents unsupported');
 const seen=new Set([0]),paths=new Set(),queue=[{index:0,path:'',original:'',depth:0}],rows=[];let directories=0,files=0;
 for(let q=0;q<queue.length;q++){const parent=queue[q],dir=entries[parent.index];directories++;requireWorld(parent.depth<=16,'metadata directory depth budget');for(let i=dir.start;i<dir.start+dir.count;i++){
  requireWorld(!seen.has(i),'duplicate or cyclic directory entry ownership');seen.add(i);const entry=entries[i],original=parent.original?parent.original+'/'+entry.name:entry.name,logical=original.toLowerCase();requireWorld(logical.length<=384&&!paths.has(logical),'ambiguous or oversized logical member path');paths.add(logical);
  if(entry.kind==='directory')queue.push({index:i,path:logical,original,depth:parent.depth+1});else{files++;if(/\.(?:rpf|ymap|ytyp|ybn)$/.test(logical)||/(?:^|\/)(?:dlclist|content|setup2)\.xml$/.test(logical)){
   requireWorld(rows.length<2048,'metadata output row budget');const {name,start,count,...metadata}=entry;
   // Observational identity retains this exact table/entry occurrence. The
   // separate logical key survives unrelated table changes. Its metadata digest
   // binds decoded member declarations, never a payload hash or cache authority.
   const {index,entryMetadataRange,encryptedEntrySHA256,...localMetadata}=metadata;
   const logicalMemberKey=digest({schema:1,kind:'logical-rpf-member-key',archive:plan.logicalArchive,logicalMember:logical});
   const decodedMemberMetadataDigest=digest({schema:1,kind:'decoded-rpf-member-metadata',logicalMember:logical,originalMemberPath:original,decodedNameSHA256:byteDigest(names.subarray(entry.nameOffset,entry.nameOffset+entry.nameBytes)),...localMetadata});
   rows.push({...metadata,logicalMember:logical,originalMemberPath:original,logicalMemberKey,decodedMemberMetadataDigest,resourceContentSHA256:null,
    memberIdentity:digest({archive:plan.logicalArchive,archiveBytes:plan.archiveBytes,headerSHA256:plan.headerSHA256,tableSHA256:expected.tableSHA256,index:i})});
  }}
 }}requireWorld(seen.size===entries.length,'unreachable directory metadata entries');
 const output={schema:1,kind:'RichAudioBoundedNgMetadata041',revision:ngMetadataRevision041,authority:'explicit-supplied-buffer-metadata-only',archive:plan.logicalArchive,archiveName:plan.archiveName,archiveBytes:plan.archiveBytes,completeArchiveSHA256:null,headerSHA256:plan.headerSHA256,tableSHA256:expected.tableSHA256,entriesSHA256:byteDigest(table.subarray(0,plan.entryBytes)),namesSHA256:byteDigest(table.subarray(plan.entryBytes)),decodedEntriesSHA256:byteDigest(entryBytes),decodedNamesSHA256:byteDigest(names),encryptionTag:plan.encryptionTag,profileDigest:input.profile?.profileDigest??null,selection,
  decryption:{independentEntryAndNamesBuffers:plan.encryptionTag===rpfTags041.ng,entryBlocks:plan.encryptionTag===rpfTags041.ng?plan.entryBytes/16:0,namesBlocks:plan.encryptionTag===rpfTags041.ng?Math.floor(names.length/16):0,namesUnchangedTailBytes:plan.encryptionTag===rpfTags041.ng?names.length%16:0},
  counts:{entries:entries.length,directories,files,selectedRows:rows.length,unknownMemberExtents:unknownExtents},rangeCompleteness:unknownExtents?'partial-extended-resource-size':'all-declared-member-extents-bounded',rows:rows.sort((a,b)=>a.logicalMember.localeCompare(b.logicalMember)),metadataReadBytes:16+table.length,memberPayloadsRead:0,nestedArchivesOpened:0,keysAcquired:0,installedWorldVerified:false,enhancedCompatibilityVerified:false,
  missingEvidence:['authorized-real-key-capability','exact-Enhanced-NG-compatibility','complete-archive-content-identity','effective-mount-precedence','selected-resource-placement-scale-activation']};
 requireWorld(Buffer.byteLength(JSON.stringify(output))<=ngMetadataLimits041.outputBytes,'metadata output byte budget');const catalog=freeze(output);catalogs.add(catalog);return catalog;
}
export function diffNgMetadataCatalogs041(previous,next){
 requireWorld(catalogs.has(previous)&&catalogs.has(next),'independently decoded branded metadata catalogs required');
 const a=new Map(previous.rows.map(row=>[row.logicalMemberKey,row])),b=new Map(next.rows.map(row=>[row.logicalMemberKey,row]));
 const changes=[...new Set([...a.keys(),...b.keys()])].map(logicalMemberKey=>{
  const old=a.get(logicalMemberKey),current=b.get(logicalMemberKey),change=!old?'member-metadata-added':!current?'member-metadata-removed':old.decodedMemberMetadataDigest===current.decodedMemberMetadataDigest?'member-metadata-unchanged':'member-metadata-changed';
  return {logicalMemberKey,logicalMember:(current??old).logicalMember,change,candidateInvalidation:change!=='member-metadata-unchanged',previousMetadataDigest:old?.decodedMemberMetadataDigest??null,nextMetadataDigest:current?.decodedMemberMetadataDigest??null,
   resourceContentSHA256:null,payloadContentStatus:'unknown-not-read',cacheReuseQualified:false};
 }).sort((x,y)=>x.logicalMember.localeCompare(y.logicalMember)||x.logicalMemberKey.localeCompare(y.logicalMemberKey));
 const contextChanges=['archive','archiveName','archiveBytes','headerSHA256','tableSHA256','profileDigest','revision'].filter(key=>previous[key]!==next[key]);
 return freeze({schema:1,kind:'RichAudioMemberMetadataDiff041',authority:'metadata-comparison-only',coverage:'selected-listed-member-metadata-only',contextChanges,changes,
  counts:{unchanged:changes.filter(c=>!c.candidateInvalidation).length,candidateInvalidations:changes.filter(c=>c.candidateInvalidation).length},resourceContentHashesKnown:0,cacheReuseQualified:false,installedWorldVerified:false,
  qualificationBoundary:'metadata differences identify dependency candidates; unchanged metadata cannot establish unchanged resource payloads or cache validity'});
}
