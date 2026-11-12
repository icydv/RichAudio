// Offline deterministic signal qualification. No device, game, network or playback API.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {recipe, sha256, decodeWav, encodeWav, inspectWav} from '../private-profile/ResourceMarker.mjs';
import {baselines, contribution} from '../private-profile03/ResourceProof03.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.join(root,'.local/gate-a-shvdne-private-03c/marker');
const detector=path.join(root,'tools/native-control/private-profile/ResourceMarker.mjs');
const proof=path.join(root,'tools/native-control/private-profile03/ResourceProof03.mjs');
const original=path.join(root,'.local/gate-a-shvdne-private-01/resource/original-marker/marker.wav');
const aac=path.join(root,'.local/gate-a-shvdne-private-03/codec-fixture/aac192-decoded.wav');
const rate=48000, duration=4, frames=rate*duration;
const fresh=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const filePin=p=>({path:p,bytes:fs.statSync(p).size,sha256:sha256(fs.readFileSync(p))});
const sourcePin=()=>filePin(fileURLToPath(import.meta.url));
const ensurePrivate=()=>{assert.equal(path.resolve(root),'C:\\Users\\Libby\\Documents\\RichAudio-SHVDNE01');for(let p=out;p!==path.dirname(p);p=path.dirname(p))if(fs.existsSync(p))assert.ok(!fs.lstatSync(p).isSymbolicLink());fs.mkdirSync(out,{recursive:true});};

// This plan and every detector parameter are written by `freeze` before evaluate.
// The conservative positive envelope and exploratory stress cases are separate.
const plan=[
 {id:'retained-original',kind:'positive',transform:'original'},
 {id:'retained-aac192',kind:'positive',transform:'aac'},
 ...[0.25,0.10,0.05].map(gain=>({id:'gain-'+gain,kind:'positive',transform:'gain',gain})),
 ...[0.02,0.01].map(gain=>({id:'quiet-'+gain,kind:'exploratory-marker',transform:'gain',gain})),
 ...[0.995,1.005].map(pitch=>({id:'pitch-'+pitch,kind:'positive',transform:'pitch',pitch})),
 ...[0.98,1.02,0.95,1.05].map(pitch=>({id:'pitch-stress-'+pitch,kind:'exploratory-marker',transform:'pitch',pitch})),
 ...[0.995,1.005].map(timing=>({id:'timing-'+timing,kind:'positive',transform:'timing',timing})),
 ...[0.98,1.02,0.95,1.05].map(timing=>({id:'timing-stress-'+timing,kind:'exploratory-marker',transform:'timing',timing})),
 {id:'mild-lowpass',kind:'positive',transform:'lowpass'},
 {id:'mild-highpass',kind:'positive',transform:'highpass'},
 {id:'stereo-one-channel',kind:'positive',transform:'one-channel'},
 {id:'stereo-opposite-phase',kind:'positive',transform:'opposite-phase'},
 {id:'stereo-asymmetric-downmix',kind:'positive',transform:'downmix'},
 {id:'destructive-mono-downmix',kind:'quality-reject',transform:'cancel'},
 {id:'sample-rate-44100-roundtrip',kind:'positive',transform:'resample',intermediateRate:44100},
 {id:'sample-rate-32000-roundtrip',kind:'positive',transform:'resample',intermediateRate:32000},
 {id:'wave-header-44100-no-conversion',kind:'quality-reject',transform:'wrong-rate'},
 {id:'noise-plus-reflection',kind:'positive',transform:'noise-reflection',seed:0x3c7103},
 {id:'engine-like-contamination',kind:'positive',transform:'engine-mixture',seed:0x3ca1},
 ...[0.005,0.015,0.045].map(dropout=>({id:'interruption-'+dropout,kind:'partial-marker',transform:'dropout',dropout})),
 {id:'first-half-only',kind:'partial-marker',transform:'first-half'},
 {id:'last-half-only',kind:'partial-marker',transform:'last-half'},
 {id:'first-30-symbols-only',kind:'partial-marker',transform:'first-thirty'},
 {id:'last-30-symbols-only',kind:'partial-marker',transform:'last-thirty'},
 {id:'silence',kind:'quality-reject',transform:'silence'},
 {id:'clipped-marker',kind:'quality-reject',transform:'clipped'},
 {id:'capture-2-seconds',kind:'quality-reject',transform:'short'},
 {id:'truncated-wave',kind:'quality-reject',transform:'truncated'},
 ...[350,660,880,1100].map(frequency=>({id:'single-tone-'+frequency,kind:'negative',transform:'tone',frequency})),
 {id:'both-tones-simultaneous',kind:'negative',transform:'both-tones'},
 {id:'synthetic-engine-harmonics',kind:'negative',transform:'engine',seed:0x3cfa2},
 {id:'synthetic-siren-sweep',kind:'negative',transform:'siren'},
 {id:'synthetic-impact-noise',kind:'negative',transform:'impact',seed:0x3cda1},
 {id:'wideband-noise',kind:'negative',transform:'noise',seed:0x3c09},
 {id:'reversed-temporal-word',kind:'negative',transform:'reverse-word'},
 ...Array.from({length:31},(_,bit)=>({id:'one-wrong-symbol-'+bit,kind:'negative',transform:'one-bit',bit})),
 ...[0x3c0101,0x3c0202,0x3c0303,0x3c0404,0x3c0505,0x3c0606,0x3c0707,0x3c0808].map(seed=>({id:'random-word-'+seed,kind:'negative',transform:'random-word',seed})),
];

function rand(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function pad(data,before=.347,gain=1){const output=new Float64Array(frames);const first=Math.round(before*rate);for(let n=0;n<data.length&&first+n<output.length;n++)output[first+n]=gain*data[n];return output;}
function tone(frequency,gain=.07){return Float64Array.from({length:frames},(_,n)=>gain*Math.sin(2*Math.PI*frequency*n/rate));}
function sum(a,b,gain=1){return a.map((v,n)=>v+gain*b[n]);}
function synthWord(code=recipe.code,{pitch=1,timing=1}={}){
 const output=new Float64Array(frames),lead=Math.round((.347+recipe.leadSeconds)*rate),chip=Math.round(recipe.chipSeconds*timing*rate),note=Math.round(recipe.noteSeconds*timing*rate),ramp=Math.round(recipe.rampSeconds*timing*rate);
 for(let k=0;k<code.length;k++)for(let n=0;n<note&&lead+k*chip+n<frames;n++){
  const edge=Math.min(1,n/ramp,(note-1-n)/ramp),envelope=(1-Math.cos(Math.PI*edge))/2;
  output[lead+k*chip+n]=recipe.amplitude*envelope*Math.sin(2*Math.PI*recipe.frequenciesHz[Number(code[k])]*pitch*n/rate);
 }return output;
}
function lowpass(a,cutoff){const alpha=1-Math.exp(-2*Math.PI*cutoff/rate);let y=0;return a.map(v=>y+=alpha*(v-y));}
function highpass(a,cutoff){const alpha=Math.exp(-2*Math.PI*cutoff/rate);let y=0,last=0;return a.map(v=>{y=alpha*(y+v-last);last=v;return y;});}
function resample(a,from,to){const b=new Float64Array(Math.round(a.length*to/from));for(let n=0;n<b.length;n++){const p=n*from/to,i=Math.floor(p),t=p-i;b[n]=(a[i]??0)*(1-t)+(a[i+1]??0)*t;}return b;}
function engine(seed){const random=rand(seed);return Float64Array.from({length:frames},(_,n)=>{const t=n/rate,base=72+45*t/duration;let x=0;for(let k=1;k<11;k++)x+=.018/k*Math.sin(2*Math.PI*base*k*t);return x+(random()-.5)*.008;});}
function build(entry,pcm){
 const a=pad(pcm),random=rand(entry.seed??1);let data=a;
 switch(entry.transform){
 case'original':break;
 case'aac':return fs.readFileSync(aac);
 case'gain':data=pad(pcm,.347,entry.gain);break;
 case'pitch':data=synthWord(recipe.code,{pitch:entry.pitch});break;
 case'timing':data=synthWord(recipe.code,{timing:entry.timing});break;
 case'lowpass':data=lowpass(a,1400);break;
 case'highpass':data=highpass(a,180);break;
 case'one-channel':return encodeWav([tone(350,.03),a]);
 case'opposite-phase':return encodeWav([a,a.map(v=>-v)]);
 case'downmix':data=a.map(v=>(v-.25*v)/2);break;
 case'cancel':data=a.map(v=>(v-v)/2);break;
 case'resample':data=resample(resample(a,rate,entry.intermediateRate),entry.intermediateRate,rate);break;
 case'wrong-rate':return encodeWav(a,44100);
 case'noise-reflection':data=a.map((v,n)=>.28*(v+.22*(a[n-720]??0))+(random()-.5)*.003);break;
 case'engine-mixture':data=sum(a,engine(entry.seed));break;
 case'dropout':{data=a.slice();const at=Math.round((.347+.16+15*.08+.02)*rate);data.fill(0,at,at+Math.round(entry.dropout*rate));break;}
 case'first-half':data=a.slice();data.fill(0,Math.round((.347+.16+15*.08)*rate));break;
 case'last-half':data=a.slice();data.fill(0,0,Math.round((.347+.16+15*.08)*rate));break;
 case'first-thirty':data=a.slice();data.fill(0,Math.round((.347+.16+30*.08)*rate));break;
 case'last-thirty':data=a.slice();data.fill(0,0,Math.round((.347+.16+.08)*rate));break;
 case'silence':data=new Float64Array(frames);break;
 case'clipped':data=a.slice();data[0]=1;break;
 case'short':data=a.subarray(0,rate*2);break;
 case'truncated':return encodeWav(a).subarray(0,encodeWav(a).length-1);
 case'tone':data=tone(entry.frequency);break;
 case'both-tones':data=sum(tone(660),tone(880));break;
 case'engine':data=engine(entry.seed);break;
 case'siren':data=Float64Array.from({length:frames},(_,n)=>.07*Math.sin(2*Math.PI*(600*n/rate+150/(2*Math.PI)*Math.sin(2*Math.PI*n/rate))));break;
 case'impact':data=Float64Array.from({length:frames},(_,n)=>(random()-.5)*.15*Math.exp(-(n%(rate/2))/(rate*.08)));break;
 case'noise':data=Float64Array.from({length:frames},()=>(random()-.5)*.10);break;
 case'reverse-word':data=synthWord([...recipe.code].reverse().join(''));break;
 case'one-bit':data=synthWord(recipe.code.slice(0,entry.bit)+(recipe.code[entry.bit]==='1'?'0':'1')+recipe.code.slice(entry.bit+1));break;
 case'random-word':data=synthWord(Array.from({length:31},()=>random()<.5?'0':'1').join(''));break;
 default:throw new Error('Unknown fixture transform');
 }return encodeWav(data);
}

export function freeze(){
 ensurePrivate();assert.ok(!fs.existsSync(path.join(out,'freeze.json')));
 const source=fs.readFileSync(detector,'utf8');
 for(const literal of ['hop = rate / 100, size = rate / 25','power >= 0.00000225','ratio >= 4','>= 0.55','matchingSymbols === 31','audibleWindows >= 50'])assert.ok(source.includes(literal));
 assert.equal(sha256(fs.readFileSync(original)),'ed09f9acaaa4347a4fb04d33483faf08ac129e3be54cf2f5270b6f0a739bbb7c');
 fresh('freeze.json',{schema:'RichAudioMarkerQualification03CFreeze',frozenBeforeEvaluation:true,utc:new Date().toISOString(),detector:filePin(detector),proof:filePin(proof),original:filePin(original),retainedAac:filePin(aac),runner:sourcePin(),recipe,parameters:{hopMs:10,windowMs:40,hann:true,symbolSpacingHops:8,matchingSymbolsRequired:31,expectedToneToOtherToneRatioMinimum:4,expectedToneEnergyToPowerMinimum:.55,powerMinimum:.00000225,minimumCaptureSeconds:2.8,minimumAudibleWindows:50,clippedSamplesAllowed:0,channelPolicy:'Each channel independently; no implicit downmix',pitchFitting:false,timingFitting:false,partialCodeDistanceAllowed:0},plan,classificationPolicy:{positive:'Expected full marker inside predeclared conservative transforms; report every miss without changing thresholds',negative:'No authored word; any present is a false positive',partialMarker:'Known marker fragment/dropout; absence of complete word does not establish marker-free isolation',qualityReject:'Must not yield present or admissible negative; inconclusive expected',exploratoryMarker:'Stress outside conservative admission; report sensitivity, do not widen thresholds',realGameAudio:'No new real game capture or extracted stock bank is used. Synthetic horn/engine/siren/noise negatives do not establish empirical GTA-wide false-positive rate.'},noPlayback:true,noGameOrObsAccess:true,noThresholdTuning:true});
 return filePin(path.join(out,'freeze.json'));
}

export function evaluate(){
 const freezePath=path.join(out,'freeze.json'),frozen=JSON.parse(fs.readFileSync(freezePath,'utf8'));
 assert.equal(sha256(fs.readFileSync(detector)),frozen.detector.sha256);assert.equal(sha256(fs.readFileSync(proof)),frozen.proof.sha256);assert.equal(sourcePin().sha256,frozen.runner.sha256);
 assert.ok(!fs.existsSync(path.join(out,'qualification.json')));
 const pcm=decodeWav(fs.readFileSync(original)).channels[0],cases=[],captures=new Map();
 const fixtureDirectory=path.join(out,'fixtures');fs.mkdirSync(fixtureDirectory);
 for(const entry of frozen.plan){const bytes=build(entry,pcm),result=inspectWav(bytes),fixture=path.join(fixtureDirectory,entry.id+'.wav');fs.writeFileSync(fixture,bytes,{flag:'wx'});captures.set(entry.id,bytes);cases.push({...entry,fixture:filePin(fixture),result});}
 const plain=captures.get('single-tone-350'),full=captures.get('retained-original');
 const attribution=[];
 for(const id of ['retained-original','first-half-only','last-half-only','first-30-symbols-only','last-30-symbols-only','interruption-0.045']){
  const contaminant=captures.get(id);attribution.push({id:'control-'+id,knownMarkerContamination:true,baseline:baselines(plain,plain).verdict,contribution:contribution(plain,plain,full,contaminant),expectedAttribution:'Must not be accepted as proof of isolated contribution solely from no complete marker match'});
  attribution.push({id:'baselineB-'+id,knownMarkerContamination:true,baseline:baselines(plain,contaminant).verdict,contribution:contribution(plain,contaminant,full,plain),expectedAttribution:'Must not authorize assignment when supplied baseline contains known marker material'});
 }
 const falsePositives=cases.filter(x=>x.kind==='negative'&&x.result.state==='present').map(x=>x.id);
 const falseNegatives=cases.filter(x=>x.kind==='positive'&&x.result.state!=='present').map(x=>x.id);
 const qualityMisadmissions=cases.filter(x=>x.kind==='quality-reject'&&x.result.state!=='inconclusive').map(x=>x.id);
 const unsafeAttributionPasses=attribution.filter(x=>x.contribution.verdict==='PASS').map(x=>x.id);
 const result={schema:'RichAudioMarkerQualification03C',evaluatedUtc:new Date().toISOString(),freeze:filePin(freezePath),detectorUnchanged:true,caseCount:cases.length,categories:Object.fromEntries([...new Set(cases.map(x=>x.kind))].map(k=>[k,cases.filter(x=>x.kind===k).length])),falsePositives,falseNegatives,qualityMisadmissions,unsafeAttributionPasses,cases,attribution,scope:'Deterministic offline original-marker transforms and synthetic negative audio only. Structural signal detection is separate from A/B provenance, GTA registration, profile identity, ownership, suppression and recovery. Any partial contamination observation must stay visible; no tuning against held-out or live results.'};
 fresh('qualification.json',result);return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command]=process.argv.slice(2);
 if(command==='freeze')console.log(JSON.stringify(freeze(),null,2));
 else if(command==='evaluate'){const r=evaluate();console.log(JSON.stringify({caseCount:r.caseCount,categories:r.categories,falsePositives:r.falsePositives,falseNegatives:r.falseNegatives,qualityMisadmissions:r.qualityMisadmissions,unsafeAttributionPasses:r.unsafeAttributionPasses},null,2));}
 else throw new Error('freeze | evaluate');
}
