import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root=path.resolve(process.argv[2]);
const receipt=JSON.parse(readFileSync(path.join(root,'package-receipt.json'),'utf8').replace(/^\uFEFF/,''));
let imports=0;
for(const pin of receipt.files){
  const file=path.resolve(root,pin.file);
  assert(file.startsWith(root+path.sep));
  assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),pin.sha256,pin.file);
  assert(!/\.(?:asi)$/i.test(pin.file));
  assert(!/(?:^|\/)RichAudio\.GateAProfile|(?:^|\/)RagePluginHook|rph-prerequisite|plugin\/RichAudio\.dll/i.test(pin.file));
  if(!file.endsWith('.mjs'))continue;
  const text=readFileSync(file,'utf8');
  for(const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(|\bimport\s*)["'](\.{1,2}\/[^"']+)["']/g)){
    const target=path.resolve(path.dirname(file),match[1]);
    assert(target.startsWith(root+path.sep),'relative import escaped');
    assert(existsSync(target),`${pin.file}: missing ${match[1]}`);imports++;
  }
}
const config=JSON.parse(readFileSync(path.join(root,'scripts/RichAudio/integration.json'),'utf8').replace(/^\uFEFF/,''));
for(const name of ['enabled','hostEnabled','allowMemoryTelemetry','useEnhancedNativeTelemetry','soundMapEnabled','worldWarmupEnabled'])assert.equal(config[name],false,name);
console.log(JSON.stringify({passed:true,files:receipt.files.length,relativeImports:imports,probeIncluded:false,installed:false}));
