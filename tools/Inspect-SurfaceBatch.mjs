// Read private evidence and write fresh private diagnostics. No game access or deployment.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {reconstructSurface,reconstructionRules,diagnosticReflection,hypotheticalEndpoints} from '../src/acoustics/research/surface-reconstruction.mjs';
import {surfaceSvg} from '../src/acoustics/research/surface-visualisation.mjs';
export function privatePath(root,input){
 const base=path.resolve(root,'.local'),target=path.resolve(input);
 if(!target.startsWith(base+path.sep))throw Error('private .local path required');
 for(let p=target;;){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('linked private path rejected');const parent=path.dirname(p);if(parent===p)break;p=parent;}
 return target;
}
export function inspectPrivate(root,input,output){
 const file=privatePath(root,input),out=privatePath(root,output),stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.size>reconstructionRules.maxBytes)throw Error('bounded regular batch file required');
 if(fs.existsSync(out))throw Error('fresh private output required');
 const batch=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')),result=reconstructSurface(batch);
 let reflection=null;if(result.candidate){const e=hypotheticalEndpoints(result);reflection=diagnosticReflection(result,e.source,e.listener);}
 fs.mkdirSync(out,{recursive:false});
 fs.writeFileSync(path.join(out,'reconstruction.json'),JSON.stringify({result,reflection},null,2)+'\n',{flag:'wx'});
 let visualisationAvailable=false;
 try{const svg=surfaceSvg(batch,result);fs.writeFileSync(path.join(out,'geometry.svg'),svg,{flag:'wx'});visualisationAvailable=true;}
 catch(e){fs.writeFileSync(path.join(out,'visualisation-unavailable.txt'),'Insufficient valid pose/geometry for a diagnostic view: '+e.message+'\n',{flag:'wx'});}
 return {status:result.status,reasons:result.reasons,counts:result.counts,fitRms:result.candidate?.fitRms??null,maxFitResidual:result.candidate?.maxFitResidual??null,planeTolerance:result.candidate?.planeTolerance??null,maxNormalAngleDegrees:result.candidate?.maxNormalAngleDegrees??null,footprintAreaNativeUnitsSquared:result.candidate?.footprintArea??null,reconstructionMs:result.reconstructionMs,managedHeapSnapshotBytes:batch.ManagedMemoryBytes??null,processMemorySnapshot:process.memoryUsage(),reflectionClassification:reflection?.classification??null,physicalArrivalTime:null,visualisationAvailable,certifiedAcousticGeometry:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 try{if(process.argv.length!==4)throw Error('Provide private batch file and fresh private output directory');console.log(JSON.stringify(inspectPrivate(root,process.argv[2],process.argv[3]),null,2));}
 catch(e){console.error('Surface inspection rejected: '+e.message);process.exitCode=2;}
}
