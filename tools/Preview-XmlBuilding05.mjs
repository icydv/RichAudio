// Original pinned-exporter fixtures only. No input-file acquisition or endpoint.
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {admittedOriginalXml05} from '../tests/fixtures/AdmittedXml05.mjs';
import {prepareXmlBuildingView05,startXmlBuildingService05} from './soundmap/xml-building05.mjs';
import {ownedCleanup042} from './soundmap/supplied-building042.mjs';
const boundedText=value=>String(value??'unknown').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,240);
const diagnostic=(error,phase,time)=>({phase,modelTimeSeconds:time,name:boundedText(error?.name??'Error'),reason:boundedText(error?.message??error),code:typeof error?.cause?.code==='string'?boundedText(error.cause.code):null});
// Small controller used by the real preview and by deterministic clock/close
// controls. It neither supplies geometry nor invents a solver result.
export function createXmlPreviewPump05({step,publish,startTick=7}={}){
 if(typeof step!=='function'||typeof publish!=='function'||!Number.isInteger(startTick)||startTick<7||startTick>2401)throw Error('Bounded original preview pump');
 let tick=startTick,active=null,stopping=false,lastOutcome=null;
 const run=()=>{
  if(stopping)return Promise.resolve({state:'closed'});if(active)return Promise.resolve({state:'busy'});
  const time=tick*.05;if(time>120){stopping=true;lastOutcome={state:'model-time-limit',modelTimeSeconds:time,maximumModelTimeSeconds:120};return Promise.resolve(lastOutcome);}tick++;
  const token={done:null};active=token;
  token.done=(async()=>{let phase='step';try{const sample=step(time);phase='publish';await publish(sample);lastOutcome={state:'published',modelTimeSeconds:time};return lastOutcome;}
   catch(error){lastOutcome={state:stopping?'cancelled-during-close':'failed',...diagnostic(error,phase,time)};return lastOutcome;}
   finally{if(active===token)active=null;}})();return token.done;
 };
 return {run,stop(){stopping=true;},async join(){const pending=active?.done;if(pending)await pending;},diagnostics:()=>({stopping,active:!!active,nextTick:tick,lastOutcome})};
}
export async function previewXmlBuilding05({root,inspectionOnly=false,maximumSeconds=120,virtualMotion='orbit'}={}){
 if(!Number.isInteger(maximumSeconds)||maximumSeconds<1||maximumSeconds>120)throw Error('Bounded original preview duration');
 const f=admittedOriginalXml05(),view=await prepareXmlBuildingView05({...f,virtualMotion,...(inspectionOnly?{admission:null}:{})});let server,closed=false,pump=null,timer,deadline,cleanupFailure=null;
 const release=ownedCleanup042([()=>server?.close(),()=>view.close(),()=>pump?.join()]);
 const close=()=>{closed=true;pump?.stop();clearInterval(timer);clearTimeout(deadline);return release();};
 const cleanupError=error=>{cleanupFailure=diagnostic(error,'cleanup',null);process.exitCode=1;console.error(JSON.stringify({kind:'XMLPreviewUnexpectedError05',...cleanupFailure}));};
 try{server=await startXmlBuildingService05({view,root});
 if(view.step){pump=createXmlPreviewPump05({step:time=>view.step(time),publish:sample=>server.publish(sample)});timer=setInterval(async()=>{if(closed)return;const result=await pump.run();if(result.state==='failed'){console.error(JSON.stringify({kind:'XMLPreviewUnexpectedError05',...result}));process.exitCode=1;await close().catch(cleanupError);}else if(result.state==='model-time-limit')await close().catch(cleanupError);},50);}
 deadline=setTimeout(()=>{void close().catch(cleanupError);},maximumSeconds*1000);return {view,server,url:server.url,close,diagnostics:()=>({closed,cleanupFailure,pump:pump?.diagnostics()??null})};
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'XML preview startup and cleanup failed');}throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const repo=fileURLToPath(new URL('../',import.meta.url)),root=path.resolve(process.argv[2]??path.join(repo,'.local/world05-preview'));
 if(!root.startsWith(path.join(repo,'.local')+path.sep))throw Error('Fresh private preview root');await fs.mkdir(root,{recursive:true});
 const p=await previewXmlBuilding05({root,inspectionOnly:process.argv[3]==='--inspection-only',virtualMotion:process.argv[3]==='--stationary-beside'?'stationary-beside':'orbit'});console.log(JSON.stringify({kind:'original-CodeWalker-XML05-preview',url:p.url,qualified:p.view.info.qualified,genuineResourceVerified:false,endpoint:false,recording:false}));
 const stop=()=>{void p.close().catch(error=>{process.exitCode=1;console.error(JSON.stringify({kind:'XMLPreviewUnexpectedError05',...diagnostic(error,'signal-cleanup',null)}));});};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
