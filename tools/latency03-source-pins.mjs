import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function modulePins(root,entries){
 const seen=new Set(),visit=file=>{const absolute=path.resolve(root,file),relative=path.relative(root,absolute).replaceAll('\\','/');
  if(relative.startsWith('../')||path.isAbsolute(relative)||!relative.endsWith('.mjs')||fs.lstatSync(absolute).isSymbolicLink())throw Error('Checkout-local source module required');
  if(seen.has(relative))return;seen.add(relative);const text=fs.readFileSync(absolute,'utf8');
  for(const match of text.matchAll(/\bfrom\s*['"](\.[^'"]+)['"]/g))visit(path.relative(root,path.resolve(path.dirname(absolute),match[1])));
 };for(const entry of entries)visit(entry);return [...seen].sort().map(file=>({file,sha256:sha256(fs.readFileSync(path.join(root,file)))}));
}
export function freshPrivateOutput(root,value){
 const output=path.resolve(value),prefix=path.join(root,'.local')+path.sep;
 if(!output.startsWith(prefix)||fs.existsSync(output))throw Error('Fresh private checkout-local output required');
 for(let p=output;p!==path.dirname(p);p=path.dirname(p))if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Linked output refused');return output;
}
