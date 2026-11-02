// Fixed144-byte priority descriptor. Only the explicit authored fixture flag is
// emitted. Shared kernels travel once during prewarming, never in this packet.
export const transientWire=Object.freeze({bytes:144,version:1,magic:'RAE2',readyMagic:'RA2R'});
const safe=n=>Number.isSafeInteger(n)&&n>=0,u32=n=>safe(n)&&n<=4294967295;
export function encodeTransientDescriptor(descriptor,{session,transportSequence,priority=0,extraClockUncertaintyFrames=0,
  maximumSoftwareLatenessFrames=960}={},target=Buffer.alloc(144)){
  if(!Buffer.isBuffer(target)||target.length!==144||!/^[a-f0-9]{32}$/.test(session)||!u32(transportSequence)||
    ![0,1].includes(priority)||!u32(extraClockUncertaintyFrames)||extraClockUncertaintyFrames>4800||
    !u32(maximumSoftwareLatenessFrames)||maximumSoftwareLatenessFrames>2400)throw Error('bounded authored descriptor transport');
  const d=descriptor;
  if(d?.authority!=='authored-fixture-only'||d.eventKind!=='authored-impulse'||!safe(d.eventId)||d.eventId<1||d.eventId>8192||!safe(d.sourceEventSequence)||
    !u32(d.sourceId)||d.sourceId<1||d.sourceId>8||d.sourceId!==d.kernelSlot+1||!u32(d.sourceGeneration)||d.sourceGeneration<1||
    !u32(d.kernelSlot)||d.kernelSlot>7||d.kernelGeneration!==1||!u32(d.sceneGeneration)||d.sceneGeneration<1||
    !u32(d.listenerGeneration)||d.listenerGeneration<1||[d.sourceGeneration,d.sceneGeneration,d.listenerGeneration].some(n=>n>2147483647)||!safe(d.occurrenceLowerQpc)||!safe(d.occurrenceUpperQpc)||
    !safe(d.observationAfterQpc)||d.occurrenceUpperQpc<d.occurrenceLowerQpc||d.occurrenceUpperQpc>d.observationAfterQpc||
    !safe(d.qpcFrequency)||d.qpcFrequency<1||d.qpcFrequency>1000000000||
    d.acquisitionBeforeQpc!==null&&(!safe(d.acquisitionBeforeQpc)||d.acquisitionBeforeQpc>d.observationAfterQpc))throw Error('admitted authored event descriptor required');
  target.fill(0);target.write('RAE2',0,'ascii');target.writeUInt16LE(1,4);target.writeUInt16LE(1,6);target.writeUInt32LE(144,8);
  target.writeUInt32LE(transportSequence,12);target.writeBigUInt64LE(BigInt(d.eventId),16);target.writeUInt32LE(d.sourceId,24);
  target.writeUInt32LE(d.sourceGeneration,28);target.writeUInt32LE(d.kernelSlot,32);target.writeUInt32LE(1,36);
  target.writeUInt32LE(d.sceneGeneration,40);target.writeUInt32LE(d.listenerGeneration,44);target.writeUInt32LE(priority,48);target.writeUInt32LE(48000,52);
  target.writeBigInt64LE(BigInt(d.occurrenceLowerQpc),56);target.writeBigInt64LE(BigInt(d.occurrenceUpperQpc),64);
  target.writeBigInt64LE(BigInt(d.acquisitionBeforeQpc??-1),72);target.writeBigInt64LE(BigInt(d.observationAfterQpc),80);
  target.writeBigInt64LE(BigInt(d.qpcFrequency),88);target.writeBigInt64LE(-1n,96);target.writeBigUInt64LE(BigInt(d.sourceEventSequence),104);
  target.writeUInt32LE(extraClockUncertaintyFrames,112);target.writeUInt32LE(maximumSoftwareLatenessFrames,116);
  Buffer.from(session,'hex').copy(target,120);return target;
}
export function transientReadyPacket(kernelCount){
  if(kernelCount!==8)throw Error('exact eight prewarmed fixture kernels required');
  const packet=Buffer.alloc(16);packet.write('RA2R',0,'ascii');packet.writeUInt32LE(1,4);packet.writeUInt32LE(16,8);packet.writeUInt32LE(8,12);return packet;
}
