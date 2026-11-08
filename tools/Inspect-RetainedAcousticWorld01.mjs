// Build a reviewable source scope from an existing private catalogue and cache.
// This tool does not open the game installation or publish current archive proof.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {worldCoverageStates01} from '../src/acoustics/world/world-state-completion01.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const privateFile=file=>{
 const p=path.resolve(file);
 if(!p.split(path.sep).includes('.local')||fs.realpathSync.native(p).toLowerCase()!==p.toLowerCase())throw Error('Unlinked private path required');
 return p;
};
function read(file){
 const p=privateFile(file),stat=fs.statSync(p);
 if(!stat.isFile()||stat.size>64*1024*1024)throw Error('Bounded retained JSON required');
 const data=fs.readFileSync(p);
 return {sha256:sha(data),value:JSON.parse(data.toString('utf8').replace(/^\uFEFF/,''))};
}
function physical(entry){
 const segments=entry?.replaceAll('\\','/').toLowerCase().split('/');
 const index=segments?.findIndex(segment=>segment.endsWith('.rpf'))??-1;
 const p=index>=0?segments.slice(0,index+1).join('/'):null;
 if(!p||p.split('/').some(segment=>segment==='.'||segment==='..'||!/[\w@.-]+$/.test(segment)))throw Error('Unresolved physical archive in retained inventory');
 return p;
}
const [manifestFile,catalogFile,output]=process.argv.slice(2);
if(process.argv.length!==5)throw Error('Expected retained manifest, resolved catalogue, and new private scope file');
const manifest=read(manifestFile),catalogue=read(catalogFile),plan=manifest.value,catalog=catalogue.value;
if(plan.ResolvedCatalogSHA256!==catalogue.sha256||catalog.ParserErrorCount!==0||plan.InputBinding.GameExecutableSHA256!==catalog.InputBinding.GameExecutableSHA256)
 throw Error('Retained cache and effective catalogue identities differ');
const archives=new Map(),byId=new Set(),entries=new Set(catalog.Resources.filter(r=>r.Kind==='ybn').map(r=>r.Path.replaceAll('\\','/').toLowerCase()));
const rowFor=relative=>{
 if(!archives.has(relative))archives.set(relative,{relative,collision:0,placements:0,inventory:false,retainedCollisionSHA256:null});
 return archives.get(relative);
};
let presentArtifacts=0;
const derivedRoot=privateFile(path.resolve(import.meta.dirname,'../.local'));
for(const r of plan.Resources){
 if(byId.has(r.Id)||!entries.delete(r.EntryPath.toLowerCase())||physical(r.EntryPath)!==r.PhysicalArchive)throw Error('Inconsistent retained collision source');
 byId.add(r.Id);
 const a=rowFor(r.PhysicalArchive),result=r.Result??r.PotentialResult;
 a.collision++;
 if(result){
  if(a.retainedCollisionSHA256&&a.retainedCollisionSHA256!==result.ArchiveSHA256)throw Error('Inconsistent retained whole-archive digest');
  a.retainedCollisionSHA256=result.ArchiveSHA256;
  const inCache=[result.IndexPath,result.ReceiptPath].every(p=>typeof p==='string'&&path.resolve(p).toLowerCase().startsWith(derivedRoot.toLowerCase()+path.sep)&&fs.existsSync(p));
  if(inCache)presentArtifacts++;
 }
}
if(entries.size)throw Error('Incomplete collision denominator');
for(const r of catalog.Resources.filter(r=>r.Kind==='ymap'||r.Kind==='ytyp'))rowFor(physical(r.Path)).placements++;
for(const a of catalog.ActiveMapArchives){
 const relative=physical(a.Archive);
 if(!relative.startsWith('x64/audio/'))rowFor(relative).inventory=true;
}
rowFor(physical(catalog.DlcListSource)).inventory=true;
const coverage=worldCoverageStates01(plan);
const report={schema:1,kind:'RichAudioRetainedWorldSourceScope01',authority:'retained-metadata-only',
 manifestSHA256:manifest.sha256,catalogueSHA256:catalogue.sha256,gameExecutableSHA256:plan.InputBinding.GameExecutableSHA256,
 codeWalkerCoreSHA256:plan.InputBinding.CodeWalkerCoreSHA256,coverage,presentIndexAndReceiptPairs:presentArtifacts,
 indexAndReceiptPresenceIsNotContentVerification:true,
 archives:[...archives.values()].sort((a,b)=>a.relative.localeCompare(b.relative)),
 readProposal:{inventory:'headers and effective map configuration and manifests only',
 placements:'selected YMAP and YTYP plus collision placement/cache metadata',
 collision:'full hashes of recorded physical collision archives; resume selected YBN decode only on missing or invalidated entries',
 excludes:['audio archives or banks','PCM','game writes','GTA launch','endpoint or recording']},
 currentProofIssued:false,installedWorldComplete:false};
const out=path.resolve(output);privateFile(path.dirname(out));fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({coverage,presentArtifacts,collisionArchives:report.archives.filter(a=>a.collision).length,
 placementArchives:report.archives.filter(a=>a.placements).length,totalArchives:archives.size}));
