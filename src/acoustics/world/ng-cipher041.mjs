/* NG round behavior adapted from the keyless public GTACrypto implementation:
 * https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/Utils/GTACrypto.cs
 * Copyright (c) 2015 Neodymium
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
// Explicit supplied synthetic material only. No key discovery, filesystem,
// magic asset, executable reader, AES dependency or installed authority.
import {byteDigest,digest,fields,freeze,requireWorld} from './contracts.mjs';
export const ngCipherRevision041='explicit-ng-17-round-synthetic-v1';
export const ngCipherLimits041=Object.freeze({schedules:101,scheduleBytes:272,tableBytes:278528,hashLutBytes:256,fullMaterialBytes:306256,selectedMaterialBytes:279056,inputBytes:1572864});
const profiles=new WeakMap(),hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const groupB=Object.freeze([[0,7,10,13],[1,4,11,14],[2,5,8,15],[3,6,9,12]].map(Object.freeze));
const profileOf=value=>{const p=profiles.get(value);requireWorld(p,'branded explicitly supplied NG profile required');return p;};
export function createNgProfile041(input){
 fields(input,['schema','authority','expandedKeys','tables','hashLut','selectedKeyIndex','expected']);
 requireWorld(input.schema===1&&input.authority==='original-synthetic-key-material','only original synthetic key/table material is currently qualified');
 const single=Number.isInteger(input.selectedKeyIndex)&&input.selectedKeyIndex>=0&&input.selectedKeyIndex<101;
 requireWorld(input.selectedKeyIndex===null||single,'explicit full-profile or selected schedule identity');
 requireWorld(Buffer.isBuffer(input.expandedKeys)&&input.expandedKeys.length===(single?272:27472)&&Buffer.isBuffer(input.tables)&&input.tables.length===278528&&Buffer.isBuffer(input.hashLut)&&input.hashLut.length===256,'exact bounded NG schedule/table/hash-LUT shape');
 fields(input.expected,['expandedKeysSHA256','tablesSHA256','hashLutSHA256']);
 const hashes={expandedKeysSHA256:byteDigest(input.expandedKeys),tablesSHA256:byteDigest(input.tables),hashLutSHA256:byteDigest(input.hashLut)};
 requireWorld(Object.entries(hashes).every(([key,value])=>hex(input.expected[key])&&input.expected[key]===value),'explicit expected synthetic material digest binding');
 const keys=new Uint32Array(input.expandedKeys.length/4),tables=new Uint32Array(69632);for(let i=0;i<keys.length;i++)keys[i]=input.expandedKeys.readUInt32LE(i*4);for(let i=0;i<tables.length;i++)tables[i]=input.tables.readUInt32LE(i*4);
 const body={schema:1,kind:'RichAudioNgCipherProfile041',authority:input.authority,revision:ngCipherRevision041,selectedKeyIndex:input.selectedKeyIndex,scheduleCount:single?1:101,materialBytes:input.expandedKeys.length+input.tables.length+256,...hashes,installedCompatibilityVerified:false};
 const profile=freeze({...body,profileDigest:digest(body)});profiles.set(profile,{keys,tables,hashLut:Buffer.from(input.hashLut)});return profile;
}
export function selectNgKey041(profile,{archiveName,archiveBytes}={}){
 const p=profileOf(profile);requireWorld(typeof archiveName==='string'&&/^[A-Za-z0-9_.+ -]{1,128}$/.test(archiveName)&&archiveName!=='.'&&archiveName!=='..'&&Number.isSafeInteger(archiveBytes)&&archiveBytes>=0,'bounded explicit archive filename and exact length');
 // GTA5Hash.CalculateHash uses its supplied LUT directly; it does not lowercase
 // the string. Every arithmetic operation below explicitly keeps uint32 wrap.
 let hash=0;for(let i=0;i<archiveName.length;i++){const temp=Math.imul(1025,(p.hashLut[archiveName.charCodeAt(i)]+hash)>>>0)>>>0;hash=((temp>>>6)^temp)>>>0;}
 const nine=Math.imul(9,hash)>>>0;hash=Math.imul(32769,((nine>>>11)^nine)>>>0)>>>0;
 const length=Number(BigInt(archiveBytes)&0xffffffffn),index=(((hash+length)>>>0)+61>>>0)%101;
 requireWorld(profile.selectedKeyIndex===null||profile.selectedKeyIndex===index,'required filename/length-selected expanded NG schedule unavailable');
 return freeze({filenameHash:hash,archiveLengthUint32:length,keyIndex:index,archiveName,filenameBasis:'exact-supplied-case-sensitive-name-with-synthetic-LUT'});
}
export function decryptNgBuffer041(data,profile,identity){
 requireWorld(Buffer.isBuffer(data)&&data.length<=ngCipherLimits041.inputBytes,'bounded explicit NG input buffer');const p=profileOf(profile),selection=selectNgKey041(profile,identity),keyAt=profile.selectedKeyIndex===null?selection.keyIndex*68:0,out=Buffer.from(data);
 let state=new Uint8Array(16),next=new Uint8Array(16);
 for(let block=0;block+16<=data.length;block+=16){state.set(data.subarray(block,block+16));for(let round=0;round<17;round++){
  const tableAt=round*4096,roundKeyAt=keyAt+round*4;
  for(let word=0;word<4;word++){
   const slots=round<2||round===16?[word*4,word*4+1,word*4+2,word*4+3]:groupB[word];
   const value=(p.keys[roundKeyAt+word]^p.tables[tableAt+slots[0]*256+state[slots[0]]]^p.tables[tableAt+slots[1]*256+state[slots[1]]]^p.tables[tableAt+slots[2]*256+state[slots[2]]]^p.tables[tableAt+slots[3]*256+state[slots[3]]])>>>0;
   const at=word*4;next[at]=value;next[at+1]=value>>>8;next[at+2]=value>>>16;next[at+3]=value>>>24;
  }
  [state,next]=[next,state];
 }out.set(state,block);}
 // The public algorithm copies an incomplete final block unchanged. It does
 // not pad or decrypt that tail, and separate archive buffers keep that rule.
 return out;
}
