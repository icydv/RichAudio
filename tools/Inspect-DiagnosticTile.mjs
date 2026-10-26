// Private, offline evidence inspection only. Never writes to the game or public tree.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {privatePath} from './Inspect-SurfaceBatch.mjs';
import {inspectTileGroup,checkVisualSnapshot,independentPatch} from '../src/acoustics/research/tile-inspection.mjs';
import {snapshotHtml,snapshotSvg} from '../src/acoustics/research/tile-replay.mjs';
export function inspectPrivateTile(root,input,output){
 const dir=privatePath(root,input),out=privatePath(root,output);if(!fs.lstatSync(dir).isDirectory()||fs.existsSync(out))throw Error('private directory and fresh output required');
 const read=name=>{const p=privatePath(root,path.join(dir,name)),s=fs.lstatSync(p);if(!s.isFile()||s.size>262144)throw Error('bounded regular evidence file required');return JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));};
 const groups=['wall','ground'].filter(n=>fs.existsSync(path.join(dir,n+'-group.json'))).map(n=>read(n+'-group.json'));if(groups.length===0)throw Error('no group evidence');
 const results=groups.map(inspectTileGroup),snapshot=read('final-snapshot.json'),patches=[];
 // Recompute the expected outlines from original observations, never from visual lines.
 for(const [i,g] of groups.entries())if(results[i].status==='candidate-inferred')patches.push(independentPatch(g,results[i]));
 let visualCheck=null,visualError=null;try{if(results.some(r=>r.status!=='candidate-inferred'))throw Error('not all groups independently qualified; primitive correspondence requires manual rejection review');visualCheck=checkVisualSnapshot(snapshot,groups,patches);}catch(e){visualError=e.message;}
 const summary={classification:visualCheck&&groups.length===2?'offline-independent-validation-complete':'requires-review',groups:results.map((r,i)=>({name:groups[i].Name,status:r.status,reasons:r.reasons,actualCalls:r.actualCalls,validHits:r.validHits,validMisses:r.validMisses,maxResidual:r.plane?.maxResidual??null,rms:r.plane?.rms??null,normalDegrees:r.plane?.maxNormalDegrees??null,planeTolerance:r.plane?.planeTolerance??null,orientation:r.plane?.orientation??null})),visualCheck,visualError,material:'unknown',units:'native-unverified',certified:false};
 const html=snapshotHtml(snapshot),svg=snapshotSvg(snapshot);fs.mkdirSync(out,{recursive:false});for(const [name,data] of [['independent-validation.json',JSON.stringify({summary,results},null,2)],['replay.html',html],['replay.svg',svg]])fs.writeFileSync(path.join(out,name),data,{flag:'wx'});return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');try{if(process.argv.length!==4)throw Error('Supply private evidence directory and fresh private output');console.log(JSON.stringify(inspectPrivateTile(root,process.argv[2],process.argv[3]),null,2));}catch(e){console.error('Tile inspection rejected: '+e.message);process.exitCode=2;}
}
