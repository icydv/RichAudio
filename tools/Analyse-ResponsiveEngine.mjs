// Local numeric diagnosis, never playback or processing of game state.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {decodeWav,measure,limits} from '../src/offline-audio/stock-source.mjs';
import {privatePath,noLinks} from './audio/private-files.mjs';
import {hash} from './Inspect-Deceleration.mjs';
import {localPeriodicity} from './audio/cycle-analysis.mjs';
import {controlAt,validateControl} from './audio/responsive-engine.mjs';
export function eventPeriod(schedule){
  if(!Array.isArray(schedule)||schedule.length<4||schedule.length>512)throw Error('schedule analysis bound');
  if(schedule.some((s,i)=>!Number.isSafeInteger(s.index)||s.index<0||!Number.isSafeInteger(s.start)||!Number.isSafeInteger(s.end)||s.end<=s.start||i&&s.start!==schedule[i-1].end))throw Error('invalid event timeline');
  for(let k=1;k<=Math.floor(schedule.length/2);k++)if(schedule.slice(k).every((s,i)=>s.index===schedule[i].index&&s.end-s.start===schedule[i].end-schedule[i].start))return k;
  return null;
}
function stats(values){const mean=values.reduce((a,b)=>a+b,0)/values.length;return {min:Math.min(...values),max:Math.max(...values),mean,coefficientOfVariation:mean>0?Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/values.length)/mean:null};}
export function analyse(directory,outputDirectory){
  const root=privatePath(directory),out=privatePath(outputDirectory);if(fs.existsSync(out))throw Error('existing analysis output');
  const reportFile=path.join(root,'analysis.json');noLinks(reportFile);if(fs.statSync(reportFile).size>2*1024*1024)throw Error('report size');
  const source=JSON.parse(fs.readFileSync(reportFile,'utf8')),schedule=source.diagnostics?.schedule;
  if(source.schemaVersion!==1||!Array.isArray(schedule)||schedule.length<4||schedule.length>512)throw Error('report layout');
  eventPeriod(schedule);
  if(schedule.some(s=>![s.engineSpeed,s.exhaustSpeed].every(v=>Number.isFinite(v)&&v>=0.95&&v<=1.05)||![s.engineState,s.exhaustState,s.value,s.rawJoinMismatch].every(Number.isFinite)))throw Error('invalid report state/rate');
  const waves={};for(const name of ['engine.wav','exhaust.wav','mix_exhaust_led.wav','mix_reference_gain.wav']){
    const file=path.join(root,name);noLinks(file);if(fs.statSync(file).size>limits.bytes)throw Error('WAV size');
    const b=fs.readFileSync(file);if(hash(b)!==source.outputs?.[name]?.sha256)throw Error('output fingerprint');waves[name]=decodeWav(b);
    if(waves[name].channels!==1||waves[name].rate!==48000||waves[name].data.length!==source.diagnostics.frames||waves[name].data.length>48000*15)throw Error('output layout');
  }
  const a=waves['mix_exhaust_led.wav'],windows=[];
  for(let start=4800;start+9600<=a.data.length-4800;start+=9600){let sum=0;for(let n=start;n<start+9600;n++)sum+=a.data[n]**2;windows.push(Math.sqrt(sum/9600));}
  const period=eventPeriod(schedule),lag=period===null?null:schedule[period].start-schedule[0].start;
  let repeat=null;
  if(lag!==null){let differences=0,square=0,count=0;for(let n=4800;n+lag<a.data.length-4800;n++){const d=a.data[n+lag]-a.data[n];if(d!==0)differences++;square+=d*d;count++;}repeat={eventPeriod:period,lagFrames:lag,lagSeconds:lag/a.rate,comparedSamples:count,differentSamples:differences,rmsDifference:count?Math.sqrt(square/count):null};}
  const first=source.control.points[0].state,constant=source.control.points.every(p=>p.state===first);
  validateControl(source.control.points,source.control.duration);
  const centers=constant?[1,2,3,4]:source.control.points.slice(1).map((p,i)=>(p.t+source.control.points[i].t)/2).slice(0,8);
  const independent=[];for(const t of centers)if(t>=0.25&&t<source.control.duration-0.25)independent.push({centerSeconds:t,...localPeriodicity(a,Math.round(t*a.rate),14+14*controlAt(source.control.points,t))});
  const diagnostic={schemaVersion:1,scenario:source.scenario,constantInput:constant,rms200ms:stats(windows),repetition:repeat,independentPeriodicity:independent,
    uniquePairs:new Set(schedule.map(s=>s.index)).size,
    speedRange:{min:Math.min(...schedule.flatMap(s=>[s.engineSpeed,s.exhaustSpeed])),max:Math.max(...schedule.flatMap(s=>[s.engineSpeed,s.exhaustSpeed]))},
    maxJoinMismatch:Math.max(...schedule.map(s=>s.rawJoinMismatch)),
    maxSourceIndexStep:Math.max(0,...schedule.slice(1).flatMap((s,i)=>[Math.abs(s.engineIndex-schedule[i].engineIndex),Math.abs(s.exhaustIndex-schedule[i].exhaustIndex)])),
    maxComponentStateError:Math.max(...schedule.map(s=>Math.abs(s.engineState-s.exhaustState)/s.engineState)),
    maxRequestedStateError:Math.max(...schedule.flatMap(s=>[Math.abs(s.engineState-s.value)/s.value,Math.abs(s.exhaustState-s.value)/s.value])),
    outputMeasurements:Object.fromEntries(Object.entries(waves).map(([name,a])=>[name,measure(a)])),
    caution:'Stable periods/RMS do not establish natural sound. A repeated event pattern is a scheduling limitation, not proof of a unique perceptual cause.'};
  fs.mkdirSync(path.dirname(out),{recursive:true});noLinks(out);fs.mkdirSync(out);fs.writeFileSync(path.join(out,'diagnosis.json'),JSON.stringify(diagnostic,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({scenario:diagnostic.scenario,uniquePairs:diagnostic.uniquePairs,repetition:diagnostic.repetition,rms:diagnostic.rms200ms}));return diagnostic;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==4)throw Error('Usage: node tools/Analyse-ResponsiveEngine.mjs PRIVATE_RENDER NEW_PRIVATE_DIAGNOSIS');analyse(...process.argv.slice(2));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
