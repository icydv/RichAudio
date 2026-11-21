// Authored benchmark bookkeeping only, always outside the common render timer.
import {createHash} from 'node:crypto';
export function canonicalProcessingState13(value){
 return JSON.stringify(value,(_key,item)=>{
  if(item===undefined)return {processingType13:'undefined'};
  if(typeof item==='number'){
   if(Object.is(item,-0))return {processingType13:'number',value:'-0'};
   if(!Number.isFinite(item))return {processingType13:'number',value:String(item)};
  }
  if(item instanceof Set)return {processingType13:'Set',values:[...item]};
  if(ArrayBuffer.isView(item))return {processingType13:item.constructor.name,values:[...item]};
  return item;
 });
}
export const processingStateHash13=value=>createHash('sha256').update(canonicalProcessingState13(value)).digest('hex');
export function sourceHistoryHash13(source){
 const state={frame:source.frame,position:source.position,envelope:source.envelope,weights:source.weights,previous:source.previous,commonRates:source.commonRates,stats:source.stats,voices:{}};
 if(source.events)throw Error('Main authored processing fixture must not conceal finite event state');
 for(const role of ['engine','exhaust'])for(const mode of source.modes){
  const voice=source.voices[role][mode],dynamic={};
  for(const [key,value]of Object.entries(voice)){
   if(['asset','samples','intervals','features'].includes(key))continue;
   dynamic[key]=key==='current'&&value!==undefined?voice.intervals.indexOf(value):value;
  }
  state.voices[role+':'+mode]=dynamic;
 }
 return processingStateHash13(state);
}
