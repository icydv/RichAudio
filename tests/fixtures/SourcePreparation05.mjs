// Original analytic PCM only; never calls a stock bank/file loader.
import {StockGameplay} from '../../src/acoustics/vehicle/gameplay.mjs';
import {StockVehicleSource} from '../../src/acoustics/vehicle/stock-source.mjs';
import {budgetFrame042,budgetSession042} from './AcousticBudget042.mjs';
export {budgetFrame042 as sourceFrame05,budgetSession042 as sourceSession05};
export function originalSourceBank05(){
 const samples=Float32Array.from({length:8192},(_,i)=>.043*Math.sin(i*.119)+.021*Math.cos(i*.037));
 const asset={frames:samples.length,sampleRate:24000,samples,nativePeak:.064};
 return {model:'bati',layers:Object.fromEntries(['engine','exhaust'].map(role=>[role,Object.fromEntries(['idle','accel','decel'].map(mode=>[mode,asset]))]))};
}
export function sourceEngine05({prepared=false,onConstruct=()=>{},profiles=null}={}){
 let bank=originalSourceBank05(),wall=0,instance;const constructions=[];
 const registry={resolve:()=>({status:'available',bank}),createSource:(model,context,options)=>{
  const entry={insideRender:instance?.sourcePreparation05?.rendering??false,source:null};constructions.push(entry);
  const source=new StockVehicleSource(bank,options);entry.source=source;onConstruct(source,entry,instance);return source;
 }};
 instance=new StockGameplay({registry,profiles,session:budgetSession042,now:()=>wall,continuityPolicy:'camera-source-01',...(prepared?{sourcePreparationPolicy:'explicit-control05'}:{})});
 instance.setSettings({quality:'balanced',acceleration:'cpu',enabled:true,volume:1,reflections:true,mode:'experimental-additive'});
 return {instance,registry,constructions,setWall:value=>{wall=value;},replaceBank:()=>{bank=originalSourceBank05();return bank;}};
}
