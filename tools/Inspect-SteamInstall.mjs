// Read-only, dependency-free metadata inspection. Never calls Steam, starts a game or changes an input.
// Format references (not vendored code): SteamRE/SteamKit DepotManifest.cs,
// SteamTracking/Protobufs content_manifest.proto, xPaw/SteamAppInfo README.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

function bounded(buffer, start, count) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || start < 0 || count < 0 || start + count > buffer.length) throw Error('Truncated/invalid metadata range');
  return buffer.subarray(start, start + count);
}
export function protobuf(buffer) {
  let pos = 0; const fields = new Map();
  function varint() {
    let value = 0n;
    for (let i=0; i<10; i++) {
      const byte = bounded(buffer,pos++,1)[0];
      if (i===9 && byte>1) throw Error('Varint overflow');
      value |= BigInt(byte & 127) << BigInt(i*7);
      if (!(byte & 128)) return value;
    }
    throw Error('Invalid varint');
  }
  while (pos < buffer.length) {
    const tag=varint(), id=Number(tag>>3n), wire=Number(tag&7n); let value;
    if (id<1 || id>0x1fffffff) throw Error('Invalid field number');
    if (wire===0) value=varint();
    else if (wire===2) {const length=Number(varint());value=bounded(buffer,pos,length);pos+=length;}
    else if (wire===1 || wire===5) {const count=wire===1?8:4;value=bounded(buffer,pos,count);pos+=count;}
    else throw Error('Unsupported protobuf wire type');
    if (!fields.has(id)) fields.set(id,[]);
    fields.get(id).push(value);
  }
  return fields;
}
function first(fields,id,fallback) {return fields.get(id)?.[0] ?? fallback;}
export function depot(buffer) {
  let pos=0; const sections=new Map(); let ended=false;
  while(pos<buffer.length) {
    const magic=bounded(buffer,pos,4).readUInt32LE();pos+=4;
    if(magic===0x32c415ab){ended=true;break;}
    if(![0x71f617d0,0x1f4812be,0x1b81b817].includes(magic) || sections.has(magic)) throw Error('Unexpected/duplicate depot section');
    const length=bounded(buffer,pos,4).readUInt32LE();pos+=4;
    sections.set(magic,protobuf(bounded(buffer,pos,length)));pos+=length;
  }
  if(!ended || pos!==buffer.length || sections.size!==3) throw Error('Incomplete depot container');
  const metadata=sections.get(0x1f4812be);
  if(first(metadata,4,0n)!==0n) throw Error('Encrypted filenames: absence cannot be established without authorised decryption');
  const files=(sections.get(0x71f617d0).get(1)??[]).map(raw=>{
    const row=protobuf(raw), name=first(row,1,Buffer.alloc(0)).toString('utf8');
    if(!name || name.includes('\0')) throw Error('Invalid depot filename');
    const sha=first(row,5,Buffer.alloc(0));if(sha.length!==0 && sha.length!==20) throw Error('Invalid content SHA1');
    return {Name:name.replaceAll('\\','/'),Bytes:first(row,2,0n).toString(),SHA1:sha.toString('hex').toUpperCase()};
  });
  return {DepotId:first(metadata,1,0n).toString(),ManifestId:first(metadata,2,0n).toString(),FilenamesEncrypted:false,Files:files};
}
export function textVdf(text) {
  const tokens=text.match(/"(?:[^"\\]|\\.)*"|[{}]/g)??[];let pos=0;
  function item() {const raw=tokens[pos++];if(!raw?.startsWith('"'))throw Error('Expected VDF string');return raw.slice(1,-1).replace(/\\([\\"])/g,'$1');}
  function object(nested) {
    const result=Object.create(null);
    while(pos<tokens.length) {
      if(tokens[pos]==='}') {if(!nested)throw Error('Unexpected VDF close');pos++;return result;}
      const key=item();if(Object.hasOwn(result,key))throw Error('Duplicate VDF key');
      if(tokens[pos]==='{'){pos++;result[key]=object(true);}else result[key]=item();
    }
    if(nested)throw Error('Unclosed VDF object');return result;
  }
  return object(false);
}
export function appInfo41(buffer, target) {
  if(bounded(buffer,0,4).readUInt32LE()!==0x07564429)throw Error('Only reviewed appinfo v41 is supported');
  const tablePos=Number(bounded(buffer,8,8).readBigUInt64LE());let stringPos=tablePos+4;
  const count=bounded(buffer,tablePos,4).readUInt32LE();if(count>1000000)throw Error('String table bound exceeded');
  function cstring(limit) {const end=buffer.indexOf(0,stringPos);if(end<0||end>=limit)throw Error('Unterminated metadata string');const s=buffer.toString('utf8',stringPos,end);stringPos=end+1;return s;}
  const strings=Array.from({length:count},()=>cstring(buffer.length));
  let recordPos=16;
  while(recordPos<tablePos) {
    const appid=bounded(buffer,recordPos,4).readUInt32LE();if(!appid)break;
    const size=bounded(buffer,recordPos+4,4).readUInt32LE(), end=recordPos+8+size;
    if(size<60||end>tablePos)throw Error('Invalid appinfo record boundary');
    if(appid===target) {
      let pos=recordPos+68;
      const digest=crypto.createHash('sha1').update(bounded(buffer,pos,end-pos)).digest();
      if(!digest.equals(bounded(buffer,recordPos+48,20)))throw Error('Binary appinfo SHA1 mismatch');
      function dict(depth=0) {
        if(depth>64)throw Error('VDF depth exceeded');const result=Object.create(null);
        while(pos<end) {
          const type=buffer[pos++];if(type===8)return result;
          const keyIndex=bounded(buffer,pos,4).readUInt32LE();pos+=4;
          const key=strings[keyIndex];if(key===undefined||Object.hasOwn(result,key))throw Error('Invalid/duplicate string-table key');
          if(type===0)result[key]=dict(depth+1);
          else if(type===1){stringPos=pos;result[key]=cstring(end);pos=stringPos;}
          else if(type===2){result[key]=bounded(buffer,pos,4).readInt32LE();pos+=4;}
          else if(type===7){result[key]=bounded(buffer,pos,8).readBigUInt64LE().toString();pos+=8;}
          else if(type===3){result[key]=bounded(buffer,pos,4).readFloatLE();pos+=4;}
          else throw Error('Unsupported binary VDF type '+type);
        }
        throw Error('Missing VDF end marker');
      }
      const root=dict();if(pos!==end)throw Error('Unexpected appinfo trailing bytes');
      return {App:root.appinfo,BinarySHA1Matched:true};
    }
    recordPos=end;
  }
  throw Error('Requested app is absent from cache');
}
export function inspect({repo,steam,acf,game}) {
  const acfSnapshot=fs.readFileSync(acf);
  const state=textVdf(acfSnapshot.toString('utf8')).AppState;
  if(state.appid!=='3240220')throw Error('Unexpected Steam app');
  const info=appInfo41(fs.readFileSync(path.join(steam,'appcache','appinfo.vdf')),3240220);
  const rows=[], executables=[];
  for(const [id,record] of Object.entries(state.InstalledDepots)) {
    const file=path.join(steam,'depotcache',`${id}_${record.manifest}.manifest`);
    const bytes=fs.readFileSync(file);if(bytes.length>64*1024*1024)throw Error('Manifest bound exceeded');
    const parsed=depot(bytes);
    if(parsed.DepotId!==id||parsed.ManifestId!==record.manifest)throw Error('Depot/manifest identity mismatch');
    rows.push({DepotId:id,ManifestId:record.manifest,CachePath:file,SHA256:crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(),FileCount:parsed.Files.length,PlaintextNames:true});
    for(const f of parsed.Files.filter(f=>/^(GTA5(?:_Enhanced(?:_BE)?)?|PlayGTAV)\.exe$/i.test(f.Name))) {
      const full=path.join(game,f.Name), present=fs.existsSync(full);
      const actual=present?crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex').toUpperCase():null;
      executables.push({...f,DepotId:id,ManifestId:record.manifest,Present:present,ActualSHA1:actual,ContentMatches:present&&actual===f.SHA1});
    }
  }
  const launch=Object.entries(info.App.config?.launch??{}).map(([key,v])=>({Entry:key,Executable:v.executable,Arguments:v.arguments,Description:v.description,Platform:v.config?.oslist}));
  if(!acfSnapshot.equals(fs.readFileSync(acf)))throw Error('Steam installation metadata changed during inspection; repeat before drawing conclusions');
  return {SchemaVersion:1,InspectedUtc:new Date().toISOString(),AppId:state.appid,Name:state.name,InstalledBuildId:state.buildid,InstalledLastUpdatedUtc:new Date(Number(state.LastUpdated)*1000).toISOString(),SteamCacheBinarySHA1Matched:info.BinarySHA1Matched,LaunchEntries:launch,InstalledDepots:rows,ExecutableEntries:executables,OldGta5ExeListed:executables.some(f=>f.Name.toLowerCase()==='gta5.exe'),AllInstalledDepotsInspected:rows.length===Object.keys(state.InstalledDepots).length,Scope:'Local Steam metadata only. No Steam verification/download performed; depot signatures not independently cryptographically validated. No account, PICS token or unrelated app data exported.'};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const output=path.join(repo,'evidence','phase2.2');
  for(let p=output;;p=path.dirname(p)) {if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Reparse/symlink report path');if(path.dirname(p)===p)break;}
  const report=inspect({repo,steam:'C:\\Program Files (x86)\\Steam',acf:'D:\\Games\\steamapps\\appmanifest_3240220.acf',game:'__GAME_ROOT__'});
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'steam-origin.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
