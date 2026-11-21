// Private ignored storage guard with no geometry or game dependency.
import fs from 'node:fs';import path from 'node:path';
export function privateStoragePath(root,input){const base=path.resolve(root,'.local'),target=path.resolve(input);if(!target.startsWith(base+path.sep))throw Error('private .local path required');for(let p=target;;){let s;try{s=fs.lstatSync(p);}catch(e){if(e.code!=='ENOENT')throw e;}if(s?.isSymbolicLink())throw Error('linked storage path rejected');const parent=path.dirname(p);if(parent===p)break;p=parent;}return target;}
