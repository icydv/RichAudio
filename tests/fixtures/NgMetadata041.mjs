// Wholly original synthetic schedules, LUT and invertible substitution tables.
// These are generated arithmetic test values, never GTA key material. The
// inverse below exists only to author encrypted fixtures for the real NG round
// order; it is not an installed-key provider or general NG encryption adapter.
import {byteDigest} from '../../src/acoustics/world/contracts.mjs';
import {createNgProfile041,selectNgKey041} from '../../src/acoustics/world/ng-cipher041.mjs';
import {rpfTags041} from '../../src/acoustics/world/ng-metadata041.mjs';
const groupsA=[[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15]],groupsB=[[0,7,10,13],[1,4,11,14],[2,5,8,15],[3,6,9,12]];
const groups=round=>round===0||round===1||round===16?groupsA:groupsB;
const odd=(round,slot)=>(round*17+slot*4+1)|1,bias=(round,slot)=>(round*23+slot*11+7)&255;
export function syntheticNgMaterial041(){
 const expandedKeys=Buffer.alloc(27472),tables=Buffer.alloc(278528),hashLut=Buffer.alloc(256);let state=0x89abcdef;
 for(let i=0;i<expandedKeys.length;i+=4){state^=state<<13;state^=state>>>17;state^=state<<5;expandedKeys.writeUInt32LE(state>>>0,i);}
 for(let r=0;r<17;r++)for(const slots of groups(r))for(let lane=0;lane<4;lane++){const slot=slots[lane];for(let n=0;n<256;n++)tables.writeUInt32LE((((n*odd(r,slot)+bias(r,slot))&255)<<(8*lane))>>>0,((r*16+slot)*256+n)*4);}
 for(let n=0;n<256;n++)hashLut[n]=(n*197+43)&255;
 return {schema:1,authority:'original-synthetic-key-material',expandedKeys,tables,hashLut,selectedKeyIndex:null,expected:{expandedKeysSHA256:byteDigest(expandedKeys),tablesSHA256:byteDigest(tables),hashLutSHA256:byteDigest(hashLut)}};
}
export function selectedSyntheticMaterial041(full,index){const expandedKeys=Buffer.from(full.expandedKeys.subarray(index*272,(index+1)*272));return {...full,expandedKeys,selectedKeyIndex:index,expected:{...full.expected,expandedKeysSHA256:byteDigest(expandedKeys)}};}
export function encryptSyntheticNg041(data,material,{archiveName,archiveBytes}){
 const profile=createNgProfile041(material),index=selectNgKey041(profile,{archiveName,archiveBytes}).keyIndex,keyAt=material.selectedKeyIndex===null?index*272:0,result=Buffer.from(data);
 const inverse=Array.from({length:17},(_,r)=>Array.from({length:16},(_,s)=>{const map=new Uint8Array(256);for(let n=0;n<256;n++)map[(n*odd(r,s)+bias(r,s))&255]=n;return map;}));
 for(let at=0;at+16<=data.length;at+=16){let state=Buffer.from(data.subarray(at,at+16));for(let r=16;r>=0;r--){const next=Buffer.alloc(16);for(let word=0;word<4;word++)for(let lane=0;lane<4;lane++){const slot=groups(r)[word][lane],out=word*4+lane;next[slot]=inverse[r][slot][state[out]^material.expandedKeys[keyAt+r*16+out]];}state=next;}state.copy(result,at);}
 return result;
}
export function originalNgMetadata041({tag=rpfTags041.ng}={}){
 const material=syntheticNgMaterial041(),archive='update/update.rpf',archiveName='update.rpf',archiveBytes=8192;
 const names=Buffer.from('\0common\0building.YMAP\0collision.YBN\0data\0dlclist.xml\0building.YTYP\0nested.rpf\0'),entries=Buffer.alloc(8*16),header=Buffer.alloc(16);
 const name=n=>n===''?0:names.indexOf(Buffer.from(n+'\0'));
 const directory=(index,label,start,count)=>{const at=index*16;entries.writeUInt32LE(name(label),at);entries.writeUInt32LE(0x7fffff00,at+4);entries.writeUInt32LE(start,at+8);entries.writeUInt32LE(count,at+12);};
 const file=(index,label,{resource=false,bytes=0,blocks,unpacked=0,encrypted=0,system=0x08000000,graphics=0x20000000})=>{const at=index*16;entries.writeUInt16LE(name(label),at);entries.writeUIntLE(bytes,at+2,3);entries.writeUIntLE(blocks|(resource?0x800000:0),at+5,3);entries.writeUInt32LE(resource?system:unpacked,at+8);entries.writeUInt32LE(resource?graphics:encrypted,at+12);};
 directory(0,'',1,3);directory(1,'common',4,1);file(2,'building.YMAP',{resource:true,bytes:120,blocks:4});file(3,'collision.YBN',{resource:true,bytes:144,blocks:5});directory(4,'data',5,3);file(5,'dlclist.xml',{bytes:0,unpacked:17,blocks:6});file(6,'building.YTYP',{resource:true,bytes:96,blocks:7});file(7,'nested.rpf',{bytes:48,unpacked:500,blocks:8,encrypted:1});
 header.writeUInt32LE(0x52504637);header.writeUInt32LE(8,4);header.writeUInt32LE(names.length,8);header.writeUInt32LE(tag,12);
 const table=tag===rpfTags041.ng?Buffer.concat([encryptSyntheticNg041(entries,material,{archiveName,archiveBytes}),encryptSyntheticNg041(names,material,{archiveName,archiveBytes})]):Buffer.concat([entries,names]);
 const profile=tag===rpfTags041.ng?createNgProfile041(material):null,expected={headerSHA256:byteDigest(header),tableSHA256:byteDigest(table)};
 return {archive,archiveName,archiveBytes,header,table,profile,expected,material,plainEntries:entries,plainNames:names};
}
