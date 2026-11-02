// Explicit offline composition around the existing vehicle acoustic pipeline.
// No import from stock/gameplay and no normal live activation path is added.
import {VehicleAcousticPipeline} from '../pipeline.mjs';
import {ComponentSourceSet} from './lifecycle.mjs';
import {componentLimits,componentSourceId,componentPose,requireComponent} from './contracts.mjs';
export class ComponentAcousticSession {
 constructor({capability,identities,scene,quality='balanced',masterGain=.35}={}) {
  requireComponent(Number.isFinite(masterGain)&&masterGain>0&&masterGain<=.7,'Explicit original component mix gain');
  this.sources=new ComponentSourceSet({capability,identities});this.session=capability.session;this.frame=0;this.omittedPaths=0;
  this.ids=identities.map(componentSourceId);this.inputs=Object.fromEntries(this.ids.map(id=>[id,new Float32Array(512)]));
  this.pipeline=new VehicleAcousticPipeline({scene,sourceIds:this.ids,quality,masterGain,continuousRates:true,
   controlFilter:(control,renderer)=>{
    // Conservative factor two covers the fractional read interpolation bound.
    const weight=2*componentLimits.dryPeak*masterGain,occupied=new Map();let total=0;
    for(const slot of renderer.slots)if(slot.active){const p=Math.max(slot.gain[0],slot.releaseLeft?0:slot.target[0])*weight;occupied.set(slot.id,p);total+=p;}
    const paths=[];for(const p of [...control.paths].sort((a,b)=>a.order-b.order||b.bands[0]-a.bands[0])){const bound=p.bands[0]*weight,extra=Math.max(0,bound-(occupied.get(p.id)??0));
     if(total+extra>componentLimits.outputPeakBudget){this.omittedPaths++;continue;}total+=extra;paths.push(p);}
    return {...control,paths};
   }});
 }
 accept(observation){return this.sources.accept(observation);}
 replaceScene(scene,options){this.pipeline.replaceScene(scene,options);}
 async render({listener,left,right,frames=512,geometryTimeMs=this.frame/48}={}) {
  requireComponent(Number.isSafeInteger(frames)&&frames>0&&frames<=512&&left instanceof Float32Array&&right instanceof Float32Array&&left!==right&&left.length>=frames&&right.length>=frames,'Caller-owned bounded stereo output required');
  const pose=componentPose(listener),generation=listener.generation;
  requireComponent(Number.isSafeInteger(generation)&&generation>0,'Genuine declared listener generation required');
  const sources=this.sources.prepare(this.frame,frames);
  const control=await this.pipeline.prepare({session:this.session,generation:1,time:this.frame/48000,listener:{...pose,generation},sources},{geometryTimeMs});
  this.sources.renderInto(this.inputs,frames);this.pipeline.process(this.inputs,left,right,frames);this.frame+=frames;return control;
 }
 diagnostics(){return {frame:this.frame,extraFixedAudioQueueFrames:0,productionEnabled:false,nativeSuppression:false,
  omittedPaths:this.omittedPaths,sources:this.sources.diagnostics(),acoustics:this.pipeline.diagnostics()};}
 close(){this.pipeline.close();}
}
