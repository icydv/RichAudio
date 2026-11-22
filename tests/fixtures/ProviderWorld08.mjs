// Original authored NG material and archive mutations; never installed secrets.
import {createHash,createCipheriv} from 'node:crypto';
import {syntheticNgMaterial041,encryptSyntheticNg041} from './NgMetadata041.mjs';
export const providerByteSHA08=b=>createHash('sha256').update(b).digest('hex');
export function originalProviderRequest08({parserSHA256,bytes,sha256=null,file='input/original.rpf',handleId=null,archiveName='base.rpf',logicalArchive='original/base.rpf',capability=null,hashMode=sha256?'full-fixture':'ranges',maximumResources=128,phase='all-fixture',selection,discovery}={}){
 return {schema:1,kind:'RichAudioCodeWalkerRequest08',gen9:true,parserSHA256,sourceAuthority:'original-authored-fixture',archives:[{id:'original',...(handleId?{handleId}:{file}),logicalArchive,archiveName,mount:'base',order:0,bytes,sha256,hashMode}],maximumResources,capability,phase,...(selection?{selection}:{}),...(discovery?{discovery}:{})};
}
export function originalEncryptedArchive08(original,{aes=false,archiveName='base.rpf'}={}){
 const bytes=Buffer.from(original),count=bytes.readUInt32LE(4),names=bytes.readUInt32LE(8),material=syntheticNgMaterial041();
 const state=Buffer.concat([material.expandedKeys,material.tables,material.hashLut]),aesKey=Buffer.from(Array.from({length:32},(_,i)=>(i*13+17)&255));
 const encrypt=b=>{if(!aes)return encryptSyntheticNg041(b,material,{archiveName,archiveBytes:bytes.length});const full=b.length&~15,out=Buffer.from(b);if(full){const cipher=createCipheriv('aes-256-ecb',aesKey,null);cipher.setAutoPadding(false);Buffer.concat([cipher.update(b.subarray(0,full)),cipher.final()]).copy(out);}return out;};
 const end=16+count*16;encrypt(bytes.subarray(16,end)).copy(bytes,16);encrypt(bytes.subarray(end,end+names)).copy(bytes,end);bytes.writeUInt32LE(aes?0x0ffffff9:0x0fefffff,12);
 return {bytes,state,aesKey,originalAuthority:'original-synthetic-key-material',capability:{kind:'explicit-ng-state08',file:'input/original-state.bin',bytes:state.length,sha256:providerByteSHA08(state),aes:aes?{file:'input/original-aes.bin',bytes:32,sha256:providerByteSHA08(aesKey)}:null}};
}
