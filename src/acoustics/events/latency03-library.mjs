// Original authored sound shapes. No GTA event/audio, endpoint or installed asset.
import {createPreparedTransientKernel} from './prepared-path.mjs';
import {transientFixtureScene,transientFixtureSession,transientFixturePoses} from './fixture-scenes.mjs';
export function originalTransientWaveform(kind){
 if(!['synthetic-shot','synthetic-impact'].includes(kind))throw Error('Original authored waveform kind required');
 const wave=new Float32Array(kind==='synthetic-shot'?2048:4096);let state=kind==='synthetic-shot'?0x127ac915:0x69ab3d21,peak=0;
 for(let i=0;i<wave.length;i++){state^=state<<13;state^=state>>>17;state^=state<<5;const noise=(state>>>0)/4294967296*2-1,t=i/48000;
  const x=kind==='synthetic-shot'?.17*noise*Math.exp(-t/.003)+.12*Math.sin(2*Math.PI*180*t)*Math.exp(-t/.006):
   .16*noise*Math.exp(-t/.012)+.11*Math.sin(2*Math.PI*90*t)*Math.exp(-t/.018);
  wave[i]=x;peak=Math.max(peak,Math.abs(wave[i]));}
 // A declared original-fixture scale, never a change to existing vehicle banks.
 if(peak>.25)for(let i=0;i<wave.length;i++)wave[i]*=.25/peak;return wave;
}
export function createLatency03Library(){
 const poses=transientFixturePoses,make=(slot,name,scene,kind,source=poses.source,listener=poses.listener)=>Object.freeze({kernelSlot:slot,kernelGeneration:1,sourceId:slot+1,name,
  kernel:createPreparedTransientKernel({scene:transientFixtureScene(scene),sceneId:scene,sceneGeneration:1,session:transientFixtureSession,
   sourcePose:source,listenerPose:listener,authority:'authored-fixture-only',frames:16384,amplitude:.004,
   waveformId:kind+'-original-03',dryWaveform:originalTransientWaveform(kind)})});
 return Object.freeze([make(0,'shot-conditional','unknown','synthetic-shot'),make(1,'shot-open','open','synthetic-shot'),make(2,'shot-wall','wall','synthetic-shot'),
  make(3,'shot-passage','passage','synthetic-shot'),make(4,'impact-camera-two','wall','synthetic-impact',poses.source,{position:[0,0,1],generation:2,forward:[1,0,0],up:[0,0,1]}),
  make(5,'impact-left','wall','synthetic-impact',{position:[-1,2,1],generation:1}),make(6,'impact-right','passage','synthetic-impact',{position:[1,2,1],generation:1}),
  make(7,'shot-near-conditional','unknown','synthetic-shot',{position:[0,1,1],generation:1})]);
}
