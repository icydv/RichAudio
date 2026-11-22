// Authored-resource worker only; no filesystem or installed-resource readers.
import {parentPort,workerData} from 'node:worker_threads';
import {prepareExplicitResourceBatch03,encodeImportedTile03} from './resource-import03.mjs';
try{const inputs=workerData.inputs;const resourceBytes=Object.fromEntries(Object.entries(inputs.resourceBytes).map(([id,b])=>[id,Buffer.from(b)]));const prepared=prepareExplicitResourceBatch03({...inputs,resourceBytes});if(!prepared.tiles?.length)parentPort.postMessage({passed:false,state:prepared.state});else parentPort.postMessage({passed:true,tile:encodeImportedTile03(prepared.tiles[0]),tileDigest:prepared.tiles[0].tileDigest});}catch(e){parentPort.postMessage({passed:false,state:'resource-import-failed',reason:e.message});}
