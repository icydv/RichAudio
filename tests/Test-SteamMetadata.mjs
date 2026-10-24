// Authored in-memory fixtures only; no Steam/game dependencies or writes.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {protobuf,depot,textVdf,appInfo41} from '../tools/Inspect-SteamInstall.mjs';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const vi=n=>{n=BigInt(n);const out=[];do{let b=Number(n&127n);n>>=7n;if(n)b|=128;out.push(b);}while(n);return Buffer.from(out);};
const number=(id,n)=>Buffer.concat([vi(id*8),vi(n)]);
const bytes=(id,b)=>Buffer.concat([vi(id*8+2),vi(b.length),b]);
const section=(id,b)=>Buffer.concat([u32(id),u32(b.length),b]);
function manifest(encrypted=0){
  const mapping=Buffer.concat([bytes(1,Buffer.from('GTA5_Enhanced.exe')),number(2,42),bytes(5,Buffer.alloc(20,7))]);
  return Buffer.concat([section(0x71f617d0,bytes(1,mapping)),section(0x1f4812be,Buffer.concat([number(1,3240225),number(2,9007199254740993n),number(4,encrypted)])),section(0x1b81b817,bytes(1,Buffer.from('authored-not-a-real-signature'))),u32(0x32c415ab)]);
}
function cache({key=1,version=0x07564429}={}){
  const body=Buffer.concat([Buffer.from([0]),u32(0),Buffer.from([1]),u32(key),Buffer.from('Authored mock\0'),Buffer.from([8,8])]);
  const header=Buffer.alloc(68);header.writeUInt32LE(3240220,0);header.writeUInt32LE(60+body.length,4);crypto.createHash('sha1').update(body).digest().copy(header,48);
  const start=Buffer.alloc(16);start.writeUInt32LE(version,0);start.writeUInt32LE(1,4);start.writeBigUInt64LE(BigInt(16+68+body.length+4),8);
  return Buffer.concat([start,header,body,u32(0),u32(2),Buffer.from('appinfo\0name\0')]);
}
test('text VDF preserves nested depot IDs and escaped paths',()=>{const r=textVdf('"AppState" { "path" "D:\\\\Games" "InstalledDepots" { "1" { "manifest" "123" } } }');assert.equal(r.AppState.path,'D:\\Games');assert.equal(r.AppState.InstalledDepots['1'].manifest,'123');});
test('duplicate text keys fail instead of silently selecting a depot',()=>assert.throws(()=>textVdf('"a" "1" "a" "2"'),/Duplicate/));
test('incomplete text nesting fails',()=>assert.throws(()=>textVdf('"a" { "b" "1"'),/Unclosed/));
test('protobuf retains manifest integers above JS safe-number range',()=>assert.equal(protobuf(number(2,9007199254740993n)).get(2)[0],9007199254740993n));
test('truncated length-delimited field fails',()=>assert.throws(()=>protobuf(Buffer.from([10,10,1])),/Truncated/));
test('unsupported wire types fail',()=>assert.throws(()=>protobuf(Buffer.from([11])),/wire/));
test('zero field number fails',()=>assert.throws(()=>protobuf(Buffer.from([0,0])),/field/));
test('uint64 varint overflow fails',()=>assert.throws(()=>protobuf(Buffer.from([8,...Array(10).fill(255)])),/overflow/));
test('complete depot produces filename, length, content hash and exact manifest ID',()=>{const r=depot(manifest());assert.equal(r.ManifestId,'9007199254740993');assert.equal(r.Files[0].Name,'GTA5_Enhanced.exe');assert.equal(r.Files[0].Bytes,'42');assert.equal(r.Files[0].SHA1,'07'.repeat(20));});
test('encrypted filenames never support a false absence conclusion',()=>assert.throws(()=>depot(manifest(1)),/Encrypted/));
test('missing depot end marker fails',()=>assert.throws(()=>depot(manifest().subarray(0,-4)),/Incomplete/));
test('duplicate depot section fails',()=>assert.throws(()=>depot(Buffer.concat([section(0x71f617d0,Buffer.alloc(0)),manifest()])),/duplicate/));
test('v41 app cache parses the requested record and verifies binary hash',()=>{const r=appInfo41(cache(),3240220);assert.equal(r.App.name,'Authored mock');assert.equal(r.BinarySHA1Matched,true);});
test('corrupt app metadata fails hash verification',()=>{const b=cache();b[68+16+12]^=1;assert.throws(()=>appInfo41(b,3240220),/SHA1 mismatch/);});
test('unknown appinfo versions fail closed',()=>assert.throws(()=>appInfo41(cache({version:0x07564430}),3240220),/Only reviewed/));
test('out-of-range string-table keys fail even with a valid payload checksum',()=>assert.throws(()=>appInfo41(cache({key:99}),3240220),/string-table key/));
test('absent requested app is reported explicitly',()=>assert.throws(()=>appInfo41(cache(),123),/absent/));
