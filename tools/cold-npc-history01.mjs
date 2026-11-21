// Original-fixture diagnostics only. No product mutation, native API or PCM IO.
import {createHash} from 'node:crypto';
export const coldHistoryHash01=value=>createHash('sha256').update(value).digest('hex');
export const coldHistoryBytes01=value=>Buffer.from(value.buffer,value.byteOffset,value.byteLength);

// Preserve exact numeric values, own-property presence, buffer bytes and object
// alias paths. Hashing arrays avoids duplicating thousands of original samples
// in every observation. This observer never replaces a synthesis assertion.
export function coldHistorySnapshot01(value){
 const seen=new Map();
 function read(v,path){
  if(v===undefined)return {$number:'undefined'};
  if(typeof v==='number'&&(!Number.isFinite(v)||Object.is(v,-0)))return {$number:Object.is(v,-0)?'-0':String(v)};
  if(v===null||typeof v!=='object')return v;
  if(seen.has(v))return {$ref:seen.get(v)};seen.set(v,path);
  if(ArrayBuffer.isView(v))return {$typed:v.constructor.name,length:v.length,byteLength:v.byteLength,sha256:coldHistoryHash01(coldHistoryBytes01(v))};
  if(v instanceof Set)return {$set:[...v].map((x,i)=>read(x,path+'.set['+i+']'))};
  if(v instanceof ArrayBuffer)return {$buffer:v.byteLength,sha256:coldHistoryHash01(Buffer.from(v))};
  if(Array.isArray(v))return Array.from({length:v.length},(_,i)=>Object.hasOwn(v,i)?read(v[i],path+'['+i+']'):{$hole:true});
  return Object.fromEntries(Object.keys(v).sort().map(k=>[k,read(v[k],path+'.'+k)]));
 }
 return read(value,'$');
}
export function firstColdHistoryDifference01(expected,actual,path='$'){
 if(Object.is(expected,actual))return null;
 if(expected===null||actual===null||typeof expected!=='object'||typeof actual!=='object')return {path,expected,actual};
 if(Array.isArray(expected)!==Array.isArray(actual))return {path,reason:'container-kind',expectedArray:Array.isArray(expected),actualArray:Array.isArray(actual)};
 const a=Object.keys(expected),b=Object.keys(actual);
 if(a.length!==b.length||a.some((k,i)=>k!==b[i]))return {path,reason:'own-property-identity',expectedKeys:a,actualKeys:b};
 for(const key of a){const difference=firstColdHistoryDifference01(expected[key],actual[key],path+(Array.isArray(expected)?'['+key+']':'.'+key));if(difference)return difference;}
 return null;
}
export function recomputeColdFeature01(samples,interval){
 let energy=0,peak=0,detail=0,count=0;
 for(let i=interval.start;i<interval.end;i++){
  const v=samples[i];energy+=v*v;peak=Math.max(peak,Math.abs(v));if(i>interval.start)detail+=(v-samples[i-1])**2;count++;
 }
 const rms=Math.sqrt(energy/interval.length);
 return {feature:{rms,crestDb:rms?20*Math.log10(peak/rms):0,detailRatio:Math.sqrt(detail/Math.max(energy,1e-30)),transientRisk:false},count,energy,firstIndex:interval.start,lastIndex:interval.start+count-1};
}
export function inspectColdSource01(source){
 const features=[],aliases=[];
 for(const role of ['engine','exhaust'])for(const mode of source.modes){
  const voice=source.voices[role][mode],asset=source.vehicle.layers[role][mode];
  for(let i=0;i<voice.intervals.length;i++){
   const recomputed=recomputeColdFeature01(voice.samples,voice.intervals[i]);
   const supplied=asset.sustain?.intervals!==undefined;
   features.push({role,mode,index:i,interval:{...voice.intervals[i]},samplesSHA256:coldHistoryHash01(coldHistoryBytes01(voice.samples)),suppliedFeatures:supplied,actual:coldHistorySnapshot01(voice.features[i]),recomputed,
    difference:supplied?null:firstColdHistoryDifference01(coldHistorySnapshot01(recomputed.feature),coldHistorySnapshot01(voice.features[i]))});
  }
  aliases.push({role,mode,samplesAreAssetSamples:voice.samples===(asset.samplesFloat32??asset.samples),featuresAreSupplied:voice.features===asset.sustain?.intervals,
   featuresAliasOtherVoices:source.modes.filter(other=>other!==mode&&voice.features===source.voices[role][other].features),firstFeatureAliasesOtherVoices:source.modes.filter(other=>other!==mode&&voice.features[0]===source.voices[role][other].features[0]),
   currentIntervalIndex:voice.current===undefined?null:voice.intervals.indexOf(voice.current),frame:voice.frame,phase:voice.phase,clockCycles:voice.clockCycles});
 }
 return {ownState:coldHistorySnapshot01(source),features,aliases,sourceFrame:source.frame,sourceStatsFrames:source.stats.frames};
}
