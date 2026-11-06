// Optional diagnostic-only single-writer ring. Atomics keep phase boundaries
// readable while the worker is synchronous or its message queue is blocked.
// No geometry, paths, poses, source authority or admission decisions live here.
const capacity=64,stride=4;
const phases=Object.freeze(['window-received','refresh-check','manifest-read','manifest-parse','world-reload','refresh-done','static-prepare','materialize','encode','transfer','soundmap','status','result-post','window-done','poll-start','poll-done','close']);
export const createSceneWorkerProgress01=()=>new SharedArrayBuffer((1+capacity*stride)*BigInt64Array.BYTES_PER_ELEMENT);
export function recordSceneWorkerProgress01(buffer,phase,requestId=0){
 if(!buffer)return;const a=new BigInt64Array(buffer),sequence=Atomics.load(a,0)+1n,slot=1+Number((sequence-1n)%BigInt(capacity))*stride;
 Atomics.store(a,slot,-sequence);Atomics.store(a,slot+1,BigInt(requestId));Atomics.store(a,slot+2,BigInt(phases.indexOf(phase)));Atomics.store(a,slot+3,BigInt(Math.round(performance.now()*1000)));Atomics.store(a,slot,sequence);Atomics.store(a,0,sequence);
}
export function snapshotSceneWorkerProgress01(buffer){
 if(!buffer)return null;const a=new BigInt64Array(buffer),end=Number(Atomics.load(a,0)),recent=[];let concurrentOverwrite=0;
 for(let sequence=Math.max(1,end-capacity+1);sequence<=end;sequence++){
  const slot=1+((sequence-1)%capacity)*stride,before=Atomics.load(a,slot),requestId=Number(Atomics.load(a,slot+1)),phase=phases[Number(Atomics.load(a,slot+2))],at=Number(Atomics.load(a,slot+3))/1000;
  if(before!==BigInt(sequence)||Atomics.load(a,slot)!==before){concurrentOverwrite++;continue;}recent.push({sequence,requestId,phase,at});
 }
 return {schema:1,diagnosticOnly:true,capacity,bytes:buffer.byteLength,total:end,overwritten:Math.max(0,end-capacity),concurrentOverwrite,recent};
}
