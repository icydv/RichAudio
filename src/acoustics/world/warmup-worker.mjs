import {parentPort,workerData} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';
import {effectiveStaticInventory} from './inventory.mjs';
import {buildStaticTile} from './fixture-placements.mjs';
const stop=new Int32Array(workerData.cancel),cancelled=()=>Atomics.load(stop,0)!==0,inventory=effectiveStaticInventory(workerData.input),bytes=Object.fromEntries(workerData.resources.map(([id,b])=>[id,Buffer.from(b)]));
try{for(const tile of workerData.tiles){if(cancelled())break;const start=performance.now(),result=buildStaticTile(inventory,bytes,{...tile,cancelled});if(cancelled())break;parentPort.postMessage({type:'tile',tile:result,prepareMs:performance.now()-start});}parentPort.postMessage({type:'complete',cancelled:cancelled()});}catch(e){parentPort.postMessage({type:'failed',reason:e.message});}
