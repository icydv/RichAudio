// Default component packaging never builds or downloads upstream Core source.
import fs from 'node:fs/promises';
import path from 'node:path';
import {inspectCoreDistribution10,packageCoreRuntime10} from '../src/acoustics/world/distribution10.mjs';
const args=process.argv.slice(2);
try{
 if(args.length===0){console.log(JSON.stringify(inspectCoreDistribution10()));process.exitCode=2;}
 else{
  if(args.length!==12||args.filter((_,i)=>i%2===0).join(',')!=='--audit,--review,--review-sha256,--input,--notices,--out')throw Error('exact audited component arguments required');
  const a=Object.fromEntries(Array.from({length:6},(_,i)=>[args[i*2],args[i*2+1]])),read=async file=>{const h=await fs.open(path.resolve(file),'r');try{const s=await h.stat();if(!s.isFile()||s.size<1||s.size>262144)throw Error('bounded audit/review file required');const bytes=Buffer.alloc(262145);let length=0;while(length<bytes.length){const n=await h.read(bytes,length,bytes.length-length,length);if(!n.bytesRead)break;length+=n.bytesRead;}const after=await h.stat();if(length!==s.size||after.size!==s.size||after.mtimeMs!==s.mtimeMs)throw Error('audit/review changed or exceeded byte bound');return bytes.subarray(0,length);}finally{await h.close();}};
  const audit=JSON.parse((await read(a['--audit'])).toString('utf8')),reviewBytes=await read(a['--review']),review=JSON.parse(reviewBytes.toString('utf8'));
  const result=await packageCoreRuntime10({audit,review,reviewBytes,expectedReviewSHA256:a['--review-sha256'],inputRoot:a['--input'],noticesRoot:a['--notices'],outputRoot:a['--out']});console.log(JSON.stringify(result));if(result.state==='blocked')process.exitCode=2;
 }
}catch(error){console.error(error.message);process.exitCode=1;}
