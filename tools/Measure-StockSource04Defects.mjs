// Small, read-only Source03 defect measurements. Writes JSON evidence only;
// no audio generation, playback, endpoint access, extraction or game access.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const options={baseline:path.resolve(root,'../RichAudio-StockSource03'),
  manifest:path.resolve(root,'../RichAudio-StockSource01/.local/stock-source-01/assets-native/manifest.json'),
  output:path.join(root,'evidence/stock-source-04-defects.json')};
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i].slice(2);
  assert.ok(process.argv[i].startsWith('--')&&Object.hasOwn(options,key)&&process.argv[i+1], 'supported option and value required');
  options[key]=path.resolve(process.argv[i+1]);}
assert.ok(options.output.startsWith(path.join(root,'evidence')+path.sep),'JSON output must remain in this checkout evidence directory');
assert.notEqual(options.baseline,path.resolve(root),'explicit unchanged Source03 checkout required');
const BASE='ba62846dd6155b515e165a57088bea660c68be84',FS=48000;
assert.equal(execFileSync('git',['-C',options.baseline,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),BASE);
const hash=x=>createHash('sha256').update(x).digest('hex');
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const from03=file=>path.join(options.baseline,file);
const atlasFile=from03('.local/stock-source-03/sustain-assets/atlas.json');
// Import the old checkout explicitly. Concurrent Source04 edits cannot affect results.
const {loadStockAssets,StockGrainVoice}=await import(pathToFileURL(from03('src/acoustics/vehicle/stock-source.mjs')));
const assets=loadStockAssets(options.manifest,{sustainAtlasFile:atlasFile});
const bindings={};
for(const file of ['src/acoustics/vehicle/stock-grain.mjs','src/acoustics/vehicle/stock-source.mjs',
  '.local/stock-source-03/sustain-assets/atlas.json','.local/stock-source-03/audition/render-report.json',
  '.local/stock-source-03/audition/measurements.json'])bindings[file]=hash(fs.readFileSync(from03(file)));
const manifestBytes=fs.readFileSync(options.manifest),sourceBase=path.dirname(options.manifest);
const nativeBindings={'manifest.json':hash(manifestBytes),'analysis-intervals.json':hash(fs.readFileSync(path.join(sourceBase,'analysis-intervals.json')))};
const nativeFiles=[];
for(const vehicle of assets.vehicles.values())for(const role of ['engine','exhaust'])for(const state of ['idle','accel','decel']){
  const asset=vehicle.layers[role][state],file=path.join(sourceBase,asset.file),digest=hash(fs.readFileSync(file));
  assert.equal(digest.toUpperCase(),asset.sha256.toUpperCase());
  nativeBindings[vehicle.model+'.'+role+'.'+state]=digest;nativeFiles.push([file,digest,asset.samples,hash(Buffer.from(asset.samples.buffer))]);
}
assert.equal(nativeFiles.length,24);
const db=x=>20*Math.log10(x);
const interpolate=(x,p)=>{const k=Math.floor(p),w=p-k;return x[k]*(1-w)+x[Math.min(k+1,x.length-1)]*w;};

// Exact original numerical counterexample; this is a diagnostic array, never audio output.
const P=480,fixture={sampleRate:24000,frames:P*20,
  samples:Float32Array.from({length:P*20},(_,i)=>.5*Math.sin(3*Math.PI*i/P)),
  intervals:Array.from({length:20},(_,i)=>({startFrame:i*P,endFrame:(i+1)*P}))};
const fixtureVoice=new StockGrainVoice(fixture),fixtureOutput=Float32Array.from({length:960},()=>fixtureVoice.next(0));
let rawEnergy=0,outputEnergy=0,errorEnergy=0;
for(let i=0;i<fixtureOutput.length;i++){const raw=interpolate(fixture.samples,i*.5),out=fixtureOutput[i];
  rawEnergy+=raw*raw;outputEnergy+=out*out;errorEnergy+=(out-raw)**2;}
const counterexample={nativeSineHz:75,metadataClockHz:50,nativeSampleRate:24000,intervalFrames:P,
  comparedOutputFrames:fixtureOutput.length,selectedIntervals:[fixtureVoice.textureCurrent,fixtureVoice.textureUpcoming],
  midpointSource:fixture.samples[P/2],midpointOutput:fixtureOutput[480],
  rawRms:Math.sqrt(rawEnergy/960),outputRms:Math.sqrt(outputEnergy/960),relativeRmsError:Math.sqrt(errorEnergy/rawEnergy)};
assert.deepEqual(counterexample.selectedIntervals,[0,1]);assert.ok(Math.abs(counterexample.midpointOutput)<1e-10);

function fftPower(input,{periodic=false,detrend=false}={}){
  const n=input.length;assert.equal(n&(n-1),0);
  const mean=detrend?input.reduce((s,v)=>s+v,0)/n:0;
  const re=Float64Array.from(input,(v,i)=>(v-mean)*(.5-.5*Math.cos(2*Math.PI*i/(periodic?n:n-1)))),im=new Float64Array(n);
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
  for(let size=2;size<=n;size*=2){const cr=Math.cos(-2*Math.PI/size),ci=Math.sin(-2*Math.PI/size);
    for(let at=0;at<n;at+=size){let c=1,s=0;for(let j=0;j<size/2;j++){
      const k=at+j,l=k+size/2,r=re[l]*c-im[l]*s,q=re[l]*s+im[l]*c;
      re[l]=re[k]-r;im[l]=im[k]-q;re[k]+=r;im[k]+=q;
      const next=c*cr-s*ci;s=c*ci+s*cr;c=next;}}}
  return Float64Array.from(re.subarray(0,n/2+1),(v,i)=>v*v+im[i]*im[i]);
}
const morphEffects=[];
for(const model of ['schafter3','bati','lectro','prototipo'])for(const role of ['engine','exhaust']){
  const asset=assets.vehicles.get(model).layers[role].accel,voice=new StockGrainVoice(asset);
  const plan=voice.pool(voice.pair(.98)),[lo,hi]=[...plan.runs].sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]))[0];
  const cycles=2**Math.floor(Math.log2(hi-lo)),raw=new Float64Array(cycles*512),morph=new Float64Array(raw.length);
  assert.ok(cycles>=2);const clockHz=asset.sampleRate/plan.period;
  for(let c=0;c<cycles;c++)for(let j=0;j<512;j++){
    const phase=j/512,w=phase*phase*(3-2*phase),a=voice.intervals[lo+c],b=voice.intervals[lo+c+1];
    assert.equal(a.end,b.start,'reference must traverse contiguous original frames');
    const x=interpolate(asset.samples,a.start+phase*a.length),y=interpolate(asset.samples,b.start+phase*b.length);
    raw[c*512+j]=x;morph[c*512+j]=(1-w)*x+w*y;
  }
  const a=fftPower(raw),b=fftPower(morph),deltaDb={};
  for(const [label,low,high] of [['low20to150',20,150],['body150to500',150,500],['mid500to2000',500,2000],['fractional20to500',20,500]]){
    let ea=0,eb=0;for(let k=1;k<a.length;k++){
      const order=k/cycles,hz=order*clockHz;
      if(hz<low||hz>=high||label==='fractional20to500'&&Math.abs(order-Math.round(order))<=.125)continue;
      ea+=a[k];eb+=b[k];}
    deltaDb[label]=10*Math.log10(eb/ea);
  }
  morphEffects.push({model,role,cycles,run:[lo,hi],clockHz,deltaDb});
}

const render=readJson(from03('.local/stock-source-03/audition/render-report.json'));
const measurements=readJson(from03('.local/stock-source-03/audition/measurements.json'));
for(const [file,digest]of Object.entries(render.moduleBindings))assert.equal(hash(fs.readFileSync(from03(file))),digest,'audition module binding changed');
function wav(file){
  const bytes=fs.readFileSync(file);
  assert.equal(bytes.readUInt16LE(20),3);assert.equal(bytes.readUInt16LE(22),2);
  assert.equal(bytes.readUInt32LE(24),FS);assert.equal(bytes.readUInt16LE(34),32);
  assert.equal(bytes.toString('ascii',36,40),'data');
  return {bytes,data:new Float32Array(bytes.buffer,bytes.byteOffset+44,bytes.readUInt32LE(40)/4)};
}
function passBands(data){
  // Reproduce Analyze-StockSource03.py: per-channel Welch, periodic Hann,
  // nperseg8192, overlap4096, constant detrend, then average channels and segments.
  const n=8192,begin=Math.round(5.05*FS),end=Math.round(5.55*FS),power=new Float64Array(n/2+1);let count=0;
  for(let at=begin;at+n<=end;at+=n/2)for(let channel=0;channel<2;channel++){
    const x=Float64Array.from({length:n},(_,i)=>data[(at+i)*2+channel]),p=fftPower(x,{periodic:true,detrend:true});
    for(let k=0;k<p.length;k++)power[k]+=p[k]*(k===0||k===n/2?1:2)/(FS*n*.375);count++;
  }
  for(let k=0;k<power.length;k++)power[k]/=count;
  function band(low,high){const first=Math.ceil(low*n/FS),last=Math.ceil(high*n/FS)-1;let total=0;
    for(let k=first;k<last;k++)total+=(power[k]+power[k+1])*.5*FS/n;return total;}
  return {low20to500Dbfs:10*Math.log10(band(20,150)+band(150,500)),mid500to2000Dbfs:10*Math.log10(band(500,2000))};
}
const pass=[],audioBindings={};
for(const model of ['schafter3','bati','lectro','prototipo']){
  const openFile=model+'/flyby-open.wav',streetFile=model+'/flyby-street.wav';
  const open=wav(from03('.local/stock-source-03/audition/'+openFile)),street=wav(from03('.local/stock-source-03/audition/'+streetFile));
  assert.equal(open.data.length,street.data.length);
  for(const [file,value]of [[openFile,open],[streetFile,street]]){
    const digest=hash(value.bytes);assert.equal(digest,render.files.find(f=>f.file===file).sha256);assert.equal(digest,measurements.files[file].sha256);
    audioBindings[file]=digest;
  }
  const openRender=render.files.find(f=>f.file===openFile),streetRender=render.files.find(f=>f.file===streetFile);
  for(const key of ['sourceHash','motionHash','controlHash'])assert.equal(openRender[key],streetRender[key]);
  const bandsOpen=passBands(open.data),bandsStreet=passBands(street.data),published=measurements.files[openFile].nearPass.bandPower;
  assert.ok(Math.abs(bandsOpen.low20to500Dbfs-10*Math.log10(published['20-150']+published['150-500']))<1e-7,'Welch band result differs from bound original measurement');
  let ed=0,er=0,es=0,cross=0,openPeak=0,streetPeak=0,count=0;
  for(let i=Math.round(5.05*FS)*2;i<Math.round(5.55*FS)*2;i++){
    const d=open.data[i],s=street.data[i],r=s-d;ed+=d*d;es+=s*s;er+=r*r;cross+=d*r;
    openPeak=Math.max(openPeak,Math.abs(d));streetPeak=Math.max(streetPeak,Math.abs(s));count++;
  }
  const n50=Math.round(.05*FS),first=Math.round(4.8*FS),last=Math.round(5.8*FS);let energy=0,best=0,bestAt=first;
  const frameEnergy=i=>(open.data[i*2]**2+open.data[i*2+1]**2)/2;
  for(let i=first;i<last;i++){energy+=frameEnergy(i);if(i-first>=n50)energy-=frameEnergy(i-n50);
    if(i-first>=n50-1&&energy>best){best=energy;bestAt=i-n50+1;}}
  pass.push({model,open:{rmsDbfs:db(Math.sqrt(ed/count)),...bandsOpen,peakHeadroomDb:-db(openPeak),
    best50msRmsDbfs:db(Math.sqrt(best/n50)),best50msStart:bestAt/FS},
    street:{rmsDbfs:db(Math.sqrt(es/count)),...bandsStreet,peakHeadroomDb:-db(streetPeak)},
    returns:{residualToDirectDb:10*Math.log10(er/ed),directResidualCorrelation:cross/Math.sqrt(ed*er),
      lowGainDb:bandsStreet.low20to500Dbfs-bandsOpen.low20to500Dbfs,midGainDb:bandsStreet.mid500to2000Dbfs-bandsOpen.mid500to2000Dbfs},
    maximumExhaustReturns:streetRender.propagation.exhaustReturns});
}
for(const [file,digest,pcm,memoryDigest]of nativeFiles){assert.equal(hash(fs.readFileSync(file)),digest);assert.equal(hash(Buffer.from(pcm.buffer)),memoryDigest);}
for(const [file,digest]of Object.entries(bindings))assert.equal(hash(fs.readFileSync(from03(file))),digest);
const report={schema:1,milestone:'STOCK-SOURCE-04',measurementToolSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  baseline:{checkoutCommit:BASE,renderDeclaredBase:render.baseCommit,bindings},
  nativeBindings,audioBindings,
  methods:{counterexample:'75Hz fixture,24k native,480-frame spans;50Hz clock;960 output frames versus native linear read. Numerical array only.',
    morph:'Accel0.98; longest safe run; power-of-two cycles plus next cycle;512 phase samples/cycle; symmetric Hann FFT. Same original chronological PCM versus03morph; no seams/reorder.',
    fractional:'20-500Hz excluding +/-0.125 integer metadata orders; these are not crank orders. Delta=morph-chronological; not wholesale bass loss.',
    pass:'03stereo WAVs;5.05-5.55s; Welch8192/4096 periodic Hann, mean detrend, channel power average, trapezoid bands. Best50ms search4.8-5.8s. Headroom is digital, not SPL.',
    returns:'Street-open residual; identical source/motion/control hashes and bound unchanged renderer.'},
  counterexample,morphEffects,passWindow:[5.05,5.55],pass,
  projection:{sourceGain:render.sourceGain,masterGain:render.rendererMasterGain,
    coefficients:'1/r at1m reference; authored state shares/broadband cardioid; equal-power pan; native host gain unknown.',
    distanceLoss:'Additional mid/high loss near2m approximately0.018/0.18dB; no boost.',
    liftStartsSeconds:5.32,geometry:{supportsX:render.geometry.retainedStreetSupportsX,
      tileBoundsX:render.geometry.tileBoundsX,orders:[1,2],streetFdn:false,
      basis:'Unchanged authored10m finite street, not Los Santos coverage; open is direct-only.'}},
  checks:{nativeFilesVerifiedUnchanged:24,nativePcmMemoriesUnchanged:true,baselineBindingsUnchanged:true,
    auditionAudioHashesVerified:8,noAudioWritten:true,noPlaybackOrEndpoints:true},
  limitations:['No listening or perceptual acceptance.','Controlled morph comparison, not native GTA playback reconstruction.',
    'Finite pools create no new recorded sustain.','Finite first/second-order street returns; no FDN.','No noise/vibrato/EQ/reverb/normalization/per-model repair.']};
// Keep the evidence small and reviewable by top-level section. Hashes remain exact;
// scalar measurements retain eight significant digits, beyond these method limits.
const precision=(_,value)=>typeof value==='number'&&!Number.isInteger(value)?Number(value.toPrecision(8)):value;
const evidence='{\n'+Object.entries(report).map(([key,value])=>' '+JSON.stringify(key)+': '+JSON.stringify(value,precision)).join(',\n')+'\n}\n';
assert.ok(Buffer.byteLength(evidence)<=10240,'compact evidence must remain <=10KiB');
fs.mkdirSync(path.dirname(options.output),{recursive:true});fs.writeFileSync(options.output,evidence);
console.log(JSON.stringify({baselineCommit:BASE,nativeFilesVerified:24,heldProbes:morphEffects.length,auditionFilesVerified:8,
  evidenceBytes:fs.statSync(options.output).size,checks:report.checks}));
