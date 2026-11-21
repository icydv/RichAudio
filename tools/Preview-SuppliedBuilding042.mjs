// Explicit original-fixture localhost preview; no user resource is opened.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareSuppliedBuilding042} from '../src/acoustics/world/supplied-building042.mjs';
import {suppliedBuildingFixture042} from '../tests/fixtures/SuppliedBuilding042.mjs';
import {prepareSuppliedBuildingView042,startSuppliedBuildingService042,ownedCleanup042} from './soundmap/supplied-building042.mjs';

export async function previewSuppliedBuilding042({root,maximumSeconds=120}={}){
  if(!Number.isInteger(maximumSeconds)||maximumSeconds<1||maximumSeconds>120)throw Error('Bounded original preview duration');
  const prepared=prepareSuppliedBuilding042(suppliedBuildingFixture042()),view=await prepareSuppliedBuildingView042(prepared);
  let server;try{server=await startSuppliedBuildingService042({view,root});}catch(error){try{await view.close();}catch(cleanup){throw new AggregateError([error,cleanup],'Preview startup and cleanup failed');}throw error;}
  let tick=7,active=false,closed=false,failure=null;
  const release=ownedCleanup042([()=>server.close(),()=>view.close()]);
  const stop=error=>{failure??=error;void close().catch(cleanup=>{failure=new AggregateError([failure,cleanup].filter(Boolean),'Preview stopped with cleanup failure');});};
  const timer=setInterval(async()=>{if(active||closed)return;active=true;try{await server.publish(view.step(tick++*.05));}catch(error){stop(error);}finally{active=false;}},50);
  const deadline=setTimeout(()=>stop(null),maximumSeconds*1000);
  function close(){closed=true;clearInterval(timer);clearTimeout(deadline);return release();}
  return {view,server,url:server.url,close,diagnostics:()=>({closed,failure:failure?.message??null})};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const repo=path.dirname(path.dirname(fileURLToPath(import.meta.url))),root=path.resolve(process.argv[2]??path.join(repo,'.local/world042-preview'));
  if(!root.startsWith(path.join(repo,'.local')+path.sep))throw Error('Explicit private preview root');
  await fs.mkdir(root,{recursive:true});const running=await previewSuppliedBuilding042({root});
  console.log(JSON.stringify({kind:'original-supplied-building042-preview',url:running.url,buildings:running.view.info.buildings.length,resources:running.view.info.resources.length,interiors:running.view.cache.interiors.length,selectedPaths:running.view.sample.soundMapFrame.paths.filter(p=>p.status==='selected').length,recording:false,endpoint:false,realBuildingVerified:false}));
  process.once('SIGINT',()=>void running.close());process.once('SIGTERM',()=>void running.close());
}
