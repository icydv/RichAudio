// Offline preparation writer only. Never call from a PCM callback, producer
// render or observation path. The caller retains its existing single-writer
// lease and outer owned-process deadline; all retry time is inside that scope.
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const maximumBytes=67108864,sharingCodes=new Set(['EPERM','EACCES','EBUSY']);
const waitWord=new Int32Array(new SharedArrayBuffer(4));
export function atomicWriteJson01(filename,value,{maximumMilliseconds=750}={}){
 if(typeof filename!=='string'||!filename||!Number.isFinite(maximumMilliseconds)||maximumMilliseconds<1||maximumMilliseconds>1000)throw Error('Bounded offline JSON publication required');
 const began=performance.now(),text=JSON.stringify(value);if(typeof text!=='string')throw Error('JSON publication value required');
 const bytes=Buffer.from(text);if(bytes.length>maximumBytes)throw Error('JSON publication byte bound');const sha256=createHash('sha256').update(bytes).digest('hex');
 // A duplicate final checkpoint must not churn the metadata generation or
 // fail solely because an existing reader denies replacement of identical data.
 try{const info=fs.statSync(filename);if(info.isFile()&&info.size===bytes.length&&fs.readFileSync(filename).equals(bytes))return {published:false,identical:true,attempts:0,bytes:bytes.length,sha256,elapsedMilliseconds:performance.now()-began,pendingPath:null};}
 catch(error){if(error.code!=='ENOENT'&&!(process.platform==='win32'&&sharingCodes.has(error.code)))throw error;}
 const pending=filename+'.pending-'+process.pid+'-'+randomUUID();
 fs.writeFileSync(pending,bytes,{flag:'wx'});let attempts=0,delay=10;
 for(;;){attempts++;try{fs.renameSync(pending,filename);return {published:true,identical:false,attempts,bytes:bytes.length,sha256,elapsedMilliseconds:performance.now()-began,pendingPath:null};}
  catch(error){const remaining=maximumMilliseconds-(performance.now()-began);
   if(process.platform!=='win32'||!sharingCodes.has(error.code)||remaining<=0){error.atomicPublication01={pendingPath:pending,pendingRetained:true,attempts,maximumMilliseconds,elapsedMilliseconds:performance.now()-began};throw error;}
   // Only this separate offline writer waits. The old target remains intact;
   // there is no delete-before-rename window and no queue or wait in audio.
   Atomics.wait(waitWord,0,0,Math.min(delay,remaining));delay=Math.min(50,delay*2);
  }
 }
}
