// Device-free driver of the ACTUAL RA07 credit-paced child and simulation worker.
// A finite original fixture, not an RPH acquisition implementation.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {liveConfiguration,nativeEnvelope,geometryEvent,nativeSource} from '../../tests/fixtures/LiveGeometry.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),FS=48000,BLOCK=512;
export const transitionBlocks=Object.freeze({introduced:64,revised:112,invalid:160,recovered:192,expired:286,
  reacquired:320,sourceGeneration:352,listenerGeneration:416,sessionMismatch:440,newSession:464,emitStop:512});
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function replayGeometry({mode='observed',blocks=560}={}){
  if(!['observed','direct-reference','fixed-scene'].includes(mode)||!Number.isInteger(blocks)||blocks<32||blocks>1024)throw Error('replay budget');
  const args=['tools/Run-Acoustics07.mjs','--headless-clock','audio','--trace-blocks','yes','--history-diagnostics','yes'];
  if(mode!=='fixed-scene')args.push('--geometry-input','required');
  const child=spawn(process.execPath,args,{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let raw=Buffer.alloc(0),stderr='',failure=null,exitCode=null,closed=false;
  let wake=null;
  const signal=()=>{if(wake){const f=wake;wake=null;f();}};
  const pcm=[],traces=[];let final=null;
  child.stdin.on('error',()=>{});child.on('error',e=>{failure=e;signal();});
  child.on('close',code=>{closed=true;exitCode=code;signal();});
  child.stdout.on('data',chunk=>{
    try{
      raw=Buffer.concat([raw,chunk]);if(raw.length>65536)throw Error('RA07 parse bound');
      while(raw.length>=4112){
        if(raw.toString('ascii',0,4)!=='RA07'||raw.readUInt32LE(4)!==pcm.length||raw.readUInt32LE(8)!==BLOCK||raw.readUInt32LE(12)!==0)
          throw Error('RA07 format/sequence');
        pcm.push(Buffer.from(raw.subarray(16,4112)));raw=raw.subarray(4112);
        if(pcm.length>blocks)throw Error('credit overrun');
      }
    }catch(e){failure=e;child.kill();}finally{signal();}
  });
  child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{
    try{
      stderr+=chunk;if(stderr.length>131072)throw Error('diagnostic parse bound');
      let end;while((end=stderr.indexOf('\n'))>=0){const line=stderr.slice(0,end);stderr=stderr.slice(end+1);
        if(line.trim()){const m=JSON.parse(line);if(m.type==='block')traces.push(m);if(m.type==='final')final=m;}
      }
      if(traces.length>blocks)throw Error('trace bound');
    }catch(e){failure=e;child.kill();}finally{signal();}
  });
  async function until(test){const start=Date.now();while(!test()){
    if(failure)throw failure;if(closed||Date.now()-start>10000)throw Error('replay child ended/deadline: '+JSON.stringify(final));
    await new Promise(r=>{const timer=setTimeout(()=>{wake=null;r();},10000);wake=()=>{clearTimeout(timer);r();};});
  }}
  const send=messages=>child.stdin.write(messages.map(m=>JSON.stringify(m)+'\n').join(''));
  let revision=0;
  try{
    for(let b=0;b<blocks;b++){
      const time=b*BLOCK/FS,messages=[];
      if(b===0 && mode!=='fixed-scene')messages.push(liveConfiguration());
      if(b%5===0||b===416||b===440||b===464){
        const u=Math.max(0,Math.min(time-1,1)),angle=u*.9,position=[100.3+.08*Math.sin(u*2),200.1,3.7],
          velocity=[time>1&&time<2?.16*Math.cos(u*2):0,0,0];
        messages.push(nativeEnvelope(time,b,{position,velocity,forward:[-Math.cos(angle),-Math.sin(angle),0],
          generation:b>=416?2:1,session:b>=440?'b'.repeat(32):'a'.repeat(32)}));
      }
      if(mode!=='fixed-scene'){
        const empty=mode==='direct-reference';let g=null;
        if(b===0||b===48)g=geometryEvent(time,++revision,{empty:true});
        if(b===64||b===112)g=geometryEvent(time,++revision,{empty,wallY:b===112?.6:.5});
        if(b===160){g=geometryEvent(time,++revision,{empty});if(!empty)g.groups[0].Samples.pop();else g.revision=0;}
        if(b===192||b===320||b===384)g=geometryEvent(time,++revision,{empty,wallY:.6});
        if(b===352)messages.push({type:'owned-sources',epoch:1,sources:[nativeSource(2)]});
        if(b===464){
          const c=liveConfiguration(2);c.configuration.listenerSession='b'.repeat(32);
          c.configuration.geometrySession='controlled-observation-2';c.configuration.clock.id='controlled-clock-2';
          c.configuration.sources=[nativeSource(2)];messages.push(c);
          revision=1;g=geometryEvent(time,revision,{empty});g.epoch=2;g.session='controlled-observation-2';g.clockId='controlled-clock-2';
          for(const group of g.groups){group.Session=g.session;for(const s of group.Samples)s.Observation.SessionId=g.session;}
        }
        if(g)messages.push(g);
      }
      if(b===0)messages.push({type:'control',command:'start'});
      if(b===512)messages.push({type:'control',command:'emit-stop'});
      messages.push({type:'credit',blocks:1});send(messages);
      await until(()=>pcm.length===b+1 && traces.length===b+1);
    }
    send([{type:'control',command:'stop'}]);await until(()=>closed);
    if(exitCode!==0||!final||raw.length)throw Error('unclean replay completion: '+JSON.stringify(final));
    const bytes=Buffer.concat(pcm),left=new Float32Array(blocks*BLOCK),right=new Float32Array(blocks*BLOCK);
    for(let i=0;i<left.length;i++){left[i]=bytes.readFloatLE(i*8);right[i]=bytes.readFloatLE(i*8+4);}
    let peak=0,step=0,boundaryStep=0,nonfinite=0,clipped=0;
    const windows=[];
    for(const [name,at] of Object.entries(transitionBlocks)){
      const a=Math.max(0,(at-2)*BLOCK),end=Math.min(left.length,(at+5)*BLOCK);let maxStep=0,sum=0;
      for(let i=a+1;i<end;i++){maxStep=Math.max(maxStep,Math.abs(left[i]-left[i-1]),Math.abs(right[i]-right[i-1]));sum+=left[i]**2+right[i]**2;}
      windows.push({name,frame:at*BLOCK,maxStep,rms:Math.sqrt(sum/Math.max(1,2*(end-a)))});
    }
    for(let i=0;i<left.length;i++)for(const channel of [left,right]){
      const x=channel[i];if(!Number.isFinite(x))nonfinite++;if(Math.abs(x)>=1)clipped++;peak=Math.max(peak,Math.abs(x));
      if(i){const d=Math.abs(x-channel[i-1]);step=Math.max(step,d);if(i%BLOCK===0)boundaryStep=Math.max(boundaryStep,d);}
    }
    return {left,right,traces,final,metrics:{mode,frames:left.length,blocks,sha256:hash(bytes),peak,maximumStep:step,
      maximumBlockBoundaryStep:boundaryStep,nonfinite,clipped,transitionWindows:windows}};
  }finally{
    if(!closed){child.stdin.end();child.kill();}
  }
}
