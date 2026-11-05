// Entirely original PCM and authored catalogue-shaped metadata. These files
// exercise the production loaders; they are never installed-world evidence.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function writeOriginalGameplayPackageStreet01(folder,{demoProfile=null,latencyProfile=null}={}) {
 fs.mkdirSync(folder,{recursive:true});const frames=8192,sampleRate=24000,pcm=Buffer.alloc(frames*4);
 for(let i=0;i<frames;i++)pcm.writeFloatLE(.04*Math.sin(i*.07)+.015*Math.sin(i*.19),i*4);
 fs.writeFileSync(path.join(folder,'original.f32'),pcm,{flag:'wx'});
 const file='original.f32',pcmSha=sha(pcm),core='c'.repeat(64),game='d'.repeat(64),awc='a'.repeat(64),intervals=Array.from({length:32},(_,i)=>({startFrame:i*256,endFrame:(i+1)*256}));
 const features=intervals.map((r,index)=>{let energy=0,peak=0,detail=0;for(let i=r.startFrame;i<r.endFrame;i++){const x=pcm.readFloatLE(i*4);energy+=x*x;peak=Math.max(peak,Math.abs(x));if(i>r.startFrame)detail+=(x-pcm.readFloatLE((i-1)*4))**2;}const rms=Math.sqrt(energy/256);return {index,...r,rms,crestDb:20*Math.log10(peak/rms),detailRatio:Math.sqrt(detail/energy),transientRisk:false};});
 const asset=()=>({file,channels:1,frames,sampleRate,sha256:pcmSha,sourceFormat:{codec:0},granular:{grains:Array.from({length:33},(_,i)=>({UnkUint1:i*256}))}});
 const streams=[],analysis=[],sustain=[],links=[];let index=0;
 const player={model:'bati',provenance:{awcSha256:awc,entry:'original_player.awc'},layers:Object.fromEntries(['engine','exhaust'].map(role=>[role,Object.fromEntries(['idle','accel','decel'].map(mode=>{const hash=(++index).toString(16).padStart(8,'0');streams.push({name:role+'_'+mode,hash});analysis.push({model:'bati',layer:role,state:mode,file,frames,sampleRate,candidateIntervals:intervals});sustain.push({model:'bati',role,state:mode,file,sha256:pcmSha,frames,sampleRate,intervals:features});links.push({State:'verified-installed-container-and-stream',CandidateCount:1,Candidates:[{Path:'original_player.awc'}],AwcSHA256:awc,FullRelStreamHash:hash,MaskedAwcStreamId:hash,Stream:{StreamId:hash,Frames:frames,SampleRate:sampleRate,Codec:0}});return [mode,asset()];}))]))};player.streams=streams;
 const npcStreams=[],npcIds={engine_idle:'1d18b9a1',engine_accel:'1f7402aa',exhaust_idle:'179ddcaa',exhaust_accel:'03ab9171'};
 const npc={model:'bati',audioContext:'npc',sourceContract:'npc-four-state-v1',provenance:{awcSha256:'b'.repeat(64),entry:'original_npc.awc',archive:'original_only.rpf'},layers:Object.fromEntries(['engine','exhaust'].map(role=>[role,Object.fromEntries(['idle','accel'].map(mode=>{const record=asset();npcStreams.push({name:role+'_'+mode,hash:npcIds[role+'_'+mode],asset:{file,sha256:pcmSha}});return [mode,record];}))]))};npc.streams=npcStreams;
 const catalogue={Schema:1,Stage:'codewalker-resolved-installation-model',ParserErrorCount:0,InputBinding:{CodeWalkerCoreSHA256:core,GameExecutableSHA256:game},Vehicles:[{ModelHash:'f9300cc5',Model:'original_authored_bati',Sounds:{EngineAccel:{ParserType:'Dat54GranularSound',ChannelLinks:links}}}]};
 const write=(name,value)=>fs.writeFileSync(path.join(folder,name),JSON.stringify(value),{flag:'wx'});
 write('player.json',{schema:1,sourceAssemblies:{CodeWalkerCoreSha256:core},vehicles:[player]});write('npc.json',{schema:1,gameExecutableSha256:game,sourceAssemblies:{CodeWalkerCoreSha256:core},vehicles:[npc]});write('analysis-intervals.json',{streams:analysis});write('atlas.json',{schema:1,streams:sustain});write('profiles.json',{});write('catalog.json',catalogue);
 const config={schema:1,gameSha256:game,gameVersion:'original-authored-fixture',playerManifest:'player.json',npcManifest:'npc.json',atlas:'atlas.json',profiles:'profiles.json',catalog:'catalog.json',catalogSha256:sha(fs.readFileSync(path.join(folder,'catalog.json'))),eligible:[{model:0xf9300cc5,context:'player'}],...(demoProfile?{demoProfile}:{}),...(latencyProfile?{latencyProfile}:{})};write('playable.json',config);
 return {manifest:path.join(folder,'playable.json'),source:'original-procedural-PCM-and-authored-metadata-only',config};
}
