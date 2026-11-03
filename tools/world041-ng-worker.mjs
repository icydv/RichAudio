// Standalone contained process: stdin supplies original synthetic buffers only.
// No archive path reader, key provider, filesystem discovery or renderer API.
import fs from 'node:fs';
import {decodeCanonical,canonical,fields,requireWorld} from './contracts.mjs';
import {createNgProfile041} from './ng-cipher041.mjs';
import {decodeNgMetadata041} from './ng-metadata041.mjs';
try{
 const parts=[];let size=0;const scratch=Buffer.alloc(65536);
 for(;;){const count=fs.readSync(0,scratch,0,scratch.length,null);if(!count)break;size+=count;requireWorld(size<=8388608,'contained input byte cap');parts.push(Buffer.from(scratch.subarray(0,count)));}
 const input=decodeCanonical(Buffer.concat(parts),8388608);
 fields(input,['schema','kind','request']);requireWorld(input.schema===1&&input.kind==='original-synthetic-ng-process041','synthetic process authority required');
 const request=input.request;fields(request,['archive','archiveName','archiveBytes','header','table','material','expected']);
 const binary=(value,max)=>{requireWorld(typeof value==='string'&&value.length<=Math.ceil(max/3)*4,'bounded encoded input');const data=Buffer.from(value,'base64');requireWorld(data.length<=max&&data.toString('base64')===value,'canonical encoded input');return data;};
 const material=request.material;fields(material,['schema','authority','expandedKeys','tables','hashLut','selectedKeyIndex','expected']);
 const profile=createNgProfile041({...material,expandedKeys:binary(material.expandedKeys,27472),tables:binary(material.tables,278528),hashLut:binary(material.hashLut,256)});
 const output=decodeNgMetadata041({archive:request.archive,archiveName:request.archiveName,archiveBytes:request.archiveBytes,header:binary(request.header,16),table:binary(request.table,1572864),profile,expected:request.expected});
 process.stdout.write(canonical({schema:1,kind:'World041ContainedNgResult',passed:true,result:output})+'\n');
}catch(error){process.stdout.write(JSON.stringify({schema:1,kind:'World041ContainedNgResult',passed:false,reason:String(error?.message??'bounded decoding failed').slice(0,240)})+'\n');process.exitCode=2;}
