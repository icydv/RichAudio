import {test} from 'node:test';import assert from 'node:assert/strict';
import {StockGrainVoice} from '../src/acoustics/vehicle/stock-grain.mjs';
import {VehicleAcousticPipeline} from '../src/acoustics/vehicle/pipeline.mjs';
import {distanceProbeScene} from './fixtures/vehicle-distance-probe.mjs';
const FS=48000;
function dominant(x){const n=FS,start=FS;let peak=-Infinity,best=null;
  for(let tenth=950;tenth<=1120;tenth+=2){const hz=tenth/10,a=2*Math.cos(2*Math.PI*hz/FS);let s1=0,s2=0;
    for(let i=0;i<n;i++){const value=x[start+i]*(.5-.5*Math.cos(2*Math.PI*i/(n-1)))+a*s1-s2;s2=s1;s1=value;}
    const power=s1*s1+s2*s2-a*s1*s2;if(power>peak){peak=power;best=hz;}}
  return best;
}
test('corrected periodic source retains 100 Hz through real paths, with independent causal Doppler only',async()=>{
  for(const moving of [false,true]){
    const samples=Float32Array.from({length:FS},(_,i)=>.25*Math.sin(2*Math.PI*100*i/FS));
    const voice=new StockGrainVoice({samples,frames:FS,sampleRate:FS},{regions:Array.from({length:100},(_,i)=>({startFrame:i*480,endFrame:(i+1)*480}))});
    const id='fidelity-original-tone',pipeline=new VehicleAcousticPipeline({scene:distanceProbeScene(),sourceIds:[id],acceleration:'cpu',masterGain:.7});
    const input=new Float32Array(512),l=new Float32Array(512),r=new Float32Array(512),output=new Float32Array(3*FS);let last=null;
    try{
      for(let at=0;at<output.length;at+=512){const n=Math.min(512,output.length-at),time=at/FS;
        for(let i=0;i<n;i++)input[i]=voice.next(.5);
        const control=await pipeline.prepare({time,session:'fidelity-propagation',generation:1,
          listener:{position:[0,0,1],velocity:[0,0,0],forward:[1,0,0],up:[0,0,1]},
          sources:[{id,generation:1,position:[moving?80-20*time:2,0,1],velocity:[moving?-20:0,0,0],forward:[-1,0,0],up:[0,0,1],directivity:0,valid:true,emitting:true,rights:'original-diagnostic'}]});
        for(const path of control.paths){last=path;assert.ok(Math.abs(path.emissionFrame-(time-path.distance/343)*FS)<1);}
        pipeline.process({[id]:input},l,r,n);output.set(l.subarray(0,n),at);
      }
      const expected=moving?100/(1-20/343):100;
      assert.ok(Math.abs(dominant(output)-expected)<=.11,'0.2 Hz measurement grid preserves source/physical Doppler separation');
      assert.ok(Math.abs(last.rate-(moving?1/(1-20/343):1))<1e-8);
      const d=pipeline.diagnostics();for(const key of ['limited','missingHistory','cursorResets','rejectedControls'])assert.equal(d.renderer[key],0);
      assert.equal(d.history.affectedFrames,0);assert.ok(output.every(x=>Number.isFinite(x)&&Math.abs(x)<1));
    }finally{pipeline.close();}
  }
});
