// Explicit private inputs, verified fingerprints, fresh ignored output. Never touches GTA.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {analyseMovement} from './benchmark/movement-analysis.mjs';
export function requirePrivate(p) {
  const full=path.resolve(p);
  if(!full.split(path.sep).includes('.local')||full.startsWith('\\\\'))throw new Error('ignored local path required');
  for(let part=full;;part=path.dirname(part)) {
    try{if(fs.lstatSync(part).isSymbolicLink())throw new Error('linked path rejected');}catch(e){if(e.code!=='ENOENT')throw e;}
    if(path.dirname(part)===part)break;
  }
  return full;
}
function read(p,max=16*1024*1024) {requirePrivate(p);if(fs.statSync(p).size>max)throw new Error('input size cap');return fs.readFileSync(p);}
export function inspect(evidence,fingerprintFile,output) {
  evidence=requirePrivate(evidence);output=requirePrivate(output);
  if(fs.existsSync(output))throw new Error('fresh output required');
  const manifest=JSON.parse(read(fingerprintFile,16384));
  const names=['attempt.used','final.json','samples.jsonl','session.json'];
  if(!Array.isArray(manifest)||manifest.length!==4||new Set(manifest.map(x=>x.Name)).size!==4||manifest.some(x=>!names.includes(x.Name)))throw new Error('fingerprint manifest shape');
  const buffers={};for(const receipt of manifest) {
    const data=read(path.join(evidence,receipt.Name));
    if(data.length!==receipt.Bytes||createHash('sha256').update(data).digest('hex').toLowerCase()!==String(receipt.SHA256).toLowerCase())throw new Error('source fingerprint mismatch');
    buffers[receipt.Name]=data;
  }
  const lines=buffers['samples.jsonl'].toString('utf8').trim().split(/\r?\n/);if(lines.length>2500)throw new Error('row cap');
  const result=analyseMovement({raw:lines.map(x=>JSON.parse(x)),footer:JSON.parse(buffers['final.json']),route:JSON.parse(buffers['session.json'])});
  fs.mkdirSync(output);for(const [name,value] of [['summary.json',result.summary],['private-pairs.json',result.pairs]])fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  return result.summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{if(process.argv.length!==5)throw new Error('three arguments required: private evidence directory, fingerprints, fresh private output');inspect(...process.argv.slice(2));console.log('Verified evidence analysed offline; fresh private diagnostics written.');}
  catch(e){console.error(e instanceof SyntaxError?'Invalid JSON evidence':e.message);process.exitCode=1;}
}
