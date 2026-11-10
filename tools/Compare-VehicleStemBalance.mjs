// Offline audition of the hash-bound PLAYABLE-15 role stems.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {encodeVehicleWav} from '../src/acoustics/vehicle/pipeline.mjs';

const rate=48000;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw Error(message);};
const mean=values=>values.reduce((sum,x)=>sum+x,0)/values.length;

function readPinned(file,digest,limit){
  const info=fs.lstatSync(file);
  if(!info.isFile()||info.nlink!==1||info.size>limit||fs.realpathSync(file)!==path.resolve(file))fail('Expected an ordinary private input');
  const bytes=fs.readFileSync(file);
  if(bytes.length!==info.size||hash(bytes)!==digest)fail('Retained input SHA-256 differs');
  return bytes;
}
function decode(wave){
  if(wave.length<52||wave.length%8!==4||wave.toString('ascii',0,4)!=='RIFF'||
    wave.toString('ascii',8,16)!=='WAVEfmt '||wave.toString('ascii',36,40)!=='data'||
    wave.readUInt32LE(16)!==16||wave.readUInt16LE(20)!==3||wave.readUInt16LE(22)!==2||
    wave.readUInt32LE(24)!==rate||wave.readUInt16LE(34)!==32||wave.readUInt32LE(40)!==wave.length-44)fail('Expected native 48 kHz stereo Float32 WAV');
  const frames=(wave.length-44)/8;
  return [0,1].map(c=>Float32Array.from({length:frames},(_,i)=>wave.readFloatLE(44+i*8+c*4)));
}

// ITU-R BS.1770 Annex 1, 48 kHz K weighting and overlapping gated blocks.
// Sample peak below is measured separately, without an oversampling claim.
function lufs(channels){
  const pre=[1.53512485958697,-2.69169618940638,1.19839281085285,-1.69065929318241,.73248077421585];
  const rlb=[1,-2,1,-1.99004745483398,.99007225036621];
  const energy=new Float64Array(channels[0].length+1);
  for(const samples of channels){
    let x1=0,x2=0,y1=0,y2=0,z1=0,z2=0;
    for(let i=0;i<samples.length;i++){
      const x=samples[i],y=pre[0]*x+pre[1]*x1+pre[2]*x2-pre[3]*y1-pre[4]*y2;
      const z=rlb[0]*y+rlb[1]*y1+rlb[2]*y2-rlb[3]*z1-rlb[4]*z2;
      energy[i+1]+=z*z;
      x2=x1;x1=x;y2=y1;y1=y;z2=z1;z1=z;
    }
  }
  for(let i=1;i<energy.length;i++)energy[i]+=energy[i-1];
  const blocks=[],width=rate*.4,hop=rate*.1;
  const level=e=>-.691+10*Math.log10(e);
  for(let i=0;i+width<energy.length;i+=hop){
    const e=(energy[i+width]-energy[i])/width;
    if(level(e)>-70)blocks.push(e);
  }
  const threshold=level(mean(blocks))-10;
  const result=level(mean(blocks.filter(e=>level(e)>threshold)));
  if(!Number.isFinite(result))fail('Insufficient gated signal for loudness matching');
  return result;
}
function welchSpectrum(channels){
  const n=8192,hop=n/2,mask=n-1;
  const power=new Float64Array(hop+1),real=new Float64Array(n),imaginary=new Float64Array(n);
  const window=Float64Array.from({length:n},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/mask));
  const reversed=new Uint16Array(n);
  for(let i=1;i<n;i++)reversed[i]=(reversed[i>>1]>>1)|((i&1)*hop);
  for(const channel of channels)for(let at=0;at+n<=channel.length;at+=hop){
    imaginary.fill(0);
    for(let i=0;i<n;i++)real[reversed[i]]=channel[at+i]*window[i];
    for(let width=2;width<=n;width*=2){
      const half=width/2;
      for(let k=0;k<half;k++){
        const phase=-2*Math.PI*k/width,wr=Math.cos(phase),wi=Math.sin(phase);
        for(let a=k;a<n;a+=width){
          const b=a+half,r=wr*real[b]-wi*imaginary[b],im=wr*imaginary[b]+wi*real[b];
          real[b]=real[a]-r;imaginary[b]=imaginary[a]-im;real[a]+=r;imaginary[a]+=im;
        }
      }
    }
    for(let i=0;i<=hop;i++)power[i]+=(real[i]**2+imaginary[i]**2)*(i===0||i===hop?1:2);
  }
  const sum=power.reduce((total,value)=>total+value,0);
  const fractionBelow=hz=>power.slice(0,Math.ceil(hz*n/rate)).reduce((total,value)=>total+value,0)/sum;
  return {method:'8192-frame Hann Welch, stereo power sum',fractionBelow600Hz:fractionBelow(600),fractionBelow1200Hz:fractionBelow(1200)};
}
function metrics([left,right]){
  let ll=0,rr=0,lr=0,l=0,r=0,peak=0;
  const n=left.length;
  for(let i=0;i<n;i++){
    if(!Number.isFinite(left[i])||!Number.isFinite(right[i]))fail('Nonfinite retained PCM');
    ll+=left[i]**2;rr+=right[i]**2;lr+=left[i]*right[i];l+=left[i];r+=right[i];
    peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
  }
  return {samplePeakDbfs:20*Math.log10(peak),rmsDbfs:10*Math.log10((ll+rr)/(2*n)),
    integratedLufs:lufs([left,right]),stereoCorrelation:(lr-l*r/n)/Math.sqrt((ll-l*l/n)*(rr-r*r/n)),
    monoToStereoRmsRatio:Math.sqrt((ll+rr+2*lr)/(2*(ll+rr))),spectrum:welchSpectrum([left,right])};
}
function mix(engine,exhaust,engineGain,exhaustGain,gain=1){
  return engine.map((channel,c)=>Float32Array.from(channel,(x,i)=>gain*(engineGain*x+exhaustGain*exhaust[c][i])));
}

const [reviewArg,reviewSHA,outputArg]=process.argv.slice(2);
if(process.argv.length!==5||!/^[a-f0-9]{64}$/.test(reviewSHA??''))fail('Use retained stems-report.json, its SHA-256 and a fresh private output path');
const review=path.resolve(reviewArg),output=path.resolve(outputArg),privateRoot=path.resolve('.local/audio-development');
if(!review.split(path.sep).includes('.local')||path.basename(review)!=='stems-report.json'||!output.startsWith(privateRoot+path.sep)||fs.existsSync(output))fail('Expected retained private evidence and a fresh private output');
const receipt=JSON.parse(readPinned(review,reviewSHA,1024*1024));
if(receipt.kind!=='isolated-offline-genuine-trace-role-stems'||receipt.sampleRate!==rate||receipt.all670FramesConsumed!==true)fail('Unexpected retained source receipt');
const load=name=>{
  const row=receipt.outputs.find(x=>x.file===name);
  if(!row)fail('Required stem is absent from the receipt');
  const bytes=readPinned(path.join(path.dirname(review),name),row.sha256,24*1024*1024);
  const channels=decode(bytes);
  if(channels[0].length!==receipt.frames)fail('Retained stem timeline differs');
  return {bytes,channels};
};
const original=load('combined.wav'),engine=load('enginePost.wav'),exhaust=load('exhaustPost.wav');
if(hash(original.bytes)!==receipt.originalCombinedWavSha256)fail('Original replay identity differs');
const reproduced=mix(engine.channels,exhaust.channels,1,1);
let maxResidual=0,stemDot=0,stemEngineEnergy=0,stemExhaustEnergy=0;
for(let c=0;c<2;c++)for(let i=0;i<receipt.frames;i++){
  const a=engine.channels[c][i],b=exhaust.channels[c][i];
  maxResidual=Math.max(maxResidual,Math.abs(reproduced[c][i]-original.channels[c][i]));
  stemDot+=a*b;stemEngineEnergy+=a*a;stemExhaustEnergy+=b*b;
}
if(maxResidual>1e-8)fail('Retained role stems do not reconstruct the original');
const base=metrics(original.channels),relativeEngine=4,relativeExhaust=.5;
let gain=1,variant;
for(let i=0;i<3;i++){
  variant=mix(engine.channels,exhaust.channels,relativeEngine,relativeExhaust,gain);
  gain*=10**((base.integratedLufs-lufs(variant))/20);
}
variant=mix(engine.channels,exhaust.channels,relativeEngine,relativeExhaust,gain);
const changed=metrics(variant);
if(Math.abs(base.integratedLufs-changed.integratedLufs)>.05)fail('Loudness match failed');
const wav=encodeVehicleWav(variant);
for(let at=path.dirname(output);at!==path.dirname(at);at=path.dirname(at))
  if(fs.existsSync(at)&&fs.realpathSync(at)!==at)fail('Linked output parent');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.mkdirSync(output);
const write=(name,bytes)=>fs.writeFileSync(path.join(output,name),bytes,{flag:'wx'});
write('A-original.wav',original.bytes);
write('B-engine-forward-matched.wav',wav);
const result={inputReceiptSHA256:reviewSHA,frames:receipt.frames,sampleRate:rate,maxResidual,
  engineExhaustUncentredCorrelation:stemDot/Math.sqrt(stemEngineEnergy*stemExhaustEnergy),
  exhaustToEngineDb:10*Math.log10(stemExhaustEnergy/stemEngineEnergy),
  original:{...base,sha256:hash(original.bytes)},variant:{...changed,sha256:hash(wav),relativeEngine,relativeExhaust,matchedGain:gain},
  scope:'Offline gain-only audition of previously rendered stems, not a change to the in-game mix or a listening verdict'};
write('comparison.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
