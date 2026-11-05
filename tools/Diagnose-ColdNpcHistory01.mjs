// Fixed discriminating controls, not retries. Exact historical synthesis tests
// and product sources remain untouched. All inputs are the existing ORIGINAL
// Test-Synthesis12 generator; no installed bank, game process or endpoint opens.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
import {coldHistoryHash01 as sha,coldHistoryBytes01 as bytes,coldHistorySnapshot01 as snapshot,firstColdHistoryDifference01 as difference,inspectColdSource01 as inspect} from './cold-npc-history01.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),parentCommit='3d0642df9588aa46721efd85712fd2ba07446345';
const members=['stock-source.mjs','stock-grain.mjs','stock-events.mjs','stock-source-preparation10.mjs','source-preparation-budget10.mjs'];
const args=process.argv.slice(2),fail=(ok,why)=>{if(!ok)throw Error(why);};
function originalFunctions(text){
 const between=(a,b)=>{const first=text.indexOf(a),end=text.indexOf(b,first+1);fail(first>=0&&end>first,'Exact original fixture source markers required');return text.slice(first,end).trim();};
 const bankText=between('function authoredBank12(','function voiceHistory12('),historyText=between('function voiceHistory12(','function compare12('),compareText=between('function compare12(','for(const npc of [false,true])');
 const sizes=/const sizes=(\[[^\]]+\]);/.exec(compareText),control=/const control=(\{operatingPoint:[^\r\n]+\});/.exec(compareText),options=/options=(\{sourceGain:[^\r\n]+\});/.exec(compareText);
 fail(sizes&&control&&options,'Original control expressions must remain identifiable');
 return {bank:Function('return ('+bankText+')')(),history:Function('return ('+historyText+')')(),makeCompare:(parent,current,bank,history)=>Function('parent','current','authoredBank12','voiceHistory12','assert','bytes','return ('+compareText+')')(parent,current,bank,history,assert,bytes),
  sizes:JSON.parse(sizes[1]),control:Function('block','return ('+control[1]+')'),options:()=>Function('return ('+options[1]+')')(),generatorSHA256:sha(Buffer.from(bankText))};
}
async function child(configuration){
 const {root,control}=configuration,fixtureText=fs.readFileSync(path.join(root,'Test-Synthesis12.mjs'),'utf8'),f=originalFunctions(fixtureText),parent=await import(pathToFileURL(path.join(root,'parent/stock-source.mjs')).href),current=await import(pathToFileURL(path.join(root,'current/stock-source.mjs')).href),compare=f.makeCompare(parent,current,f.bank,f.history);
 const report={schema:1,kind:'RichAudioColdNpcDiscriminatingControl01',control,runtime:{node:process.version,execArgv:process.execArgv,executableSHA256:sha(fs.readFileSync(process.execPath)),pid:process.pid},fixtureSHA256:sha(Buffer.from(fixtureText)),generatorSHA256:f.generatorSHA256,warmupCases:[],events:[],firstDivergence:null,errors:[],endpointOpened:false,installedResourcesRead:false,productSourcesModified:false,originalAssertionsModified:false,hostedFailureExplained:false};
 const record=(kind,stage,delta)=>{if(delta&&!report.firstDivergence)report.firstDivergence={kind,stage,...delta};};
 try{
  // Exactly the four cases registered before the historical failing NPC case.
  for(const texture of [false,true])for(const prepared of [false,true]){compare({npc:false,texture,prepared});report.warmupCases.push({texture,prepared,passed:true});}
  const shared=f.bank({npc:true,texture:false}),banks=control==='separate-banks'?{parent:shared,current:structuredClone(shared)}:{parent:shared,current:shared},inputBefore={parent:snapshot(banks.parent),current:snapshot(banks.current)},sources={};
  const order=control==='current-first'?['current','parent']:['parent','current'];
  for(const name of order){const module=name==='parent'?parent:current;sources[name]=new module.StockVehicleSource(banks[name],f.options());const observation=inspect(sources[name]);report.events.push({stage:'constructed-'+name,side:name,observation,inputAfter:snapshot(banks[name])});record('input-mutation','constructed-'+name,difference(inputBefore[name],snapshot(banks[name])));record('initial-source-clock','constructed-'+name,observation.sourceFrame!==0||observation.sourceStatsFrames!==0?{actualFrame:observation.sourceFrame,actualStatsFrames:observation.sourceStatsFrames}:null);for(const feature of observation.features)record('independent-feature-invariant','constructed-'+name,feature.difference&&{voice:feature.role+':'+feature.mode,...feature.difference});}
  const atConstruction={parent:inspect(sources.parent),current:inspect(sources.current)};
  const firstCreated=report.events.find(e=>e.stage==='constructed-'+order[0]);record('existing-source-mutated-by-other-constructor','before-first-render',difference(firstCreated.observation.ownState,atConstruction[order[0]].ownState));
  report.events.push({stage:'before-first-render',...atConstruction});record('source-state','before-first-render',difference(atConstruction.parent.ownState,atConstruction.current.ownState));
  const outputs={parent:[new Float32Array(512),new Float32Array(512)],current:[new Float32Array(512),new Float32Array(512)]},identities={...sources};
  report.completeOutputSequenceCompared=true;
  for(const [block,frames]of f.sizes.entries()){
   const state=f.control(block),pcm={};
   for(const name of ['parent','current']){fail(sources[name]===identities[name],'Source lifetime replaced during diagnostic');outputs[name][0].fill(.97);outputs[name][1].fill(-.97);sources[name].renderInto(state,...outputs[name],frames);pcm[name]=outputs[name].map(x=>sha(bytes(x)));}
   const observations={parent:inspect(sources.parent),current:inspect(sources.current)},ownDifference=difference(observations.parent.ownState,observations.current.ownState);
   const outputEqual=pcm.parent.every((x,i)=>x===pcm.current[i]);if(!outputEqual)record('exact-output','block-'+block,{expected:pcm.parent,actual:pcm.current});record('source-state','block-'+block,ownDifference);
   for(const name of ['parent','current']){record('input-mutation','block-'+block,difference(inputBefore[name],snapshot(banks[name])));for(const feature of observations[name].features)record('independent-feature-invariant','block-'+block,feature.difference&&{side:name,voice:feature.role+':'+feature.mode,...feature.difference});}
   report.events.push({stage:'block',block,frames,control:state,pcm,outputEqual,...observations});
  }
 }catch(error){report.errors.push({name:error.name,message:error.message,stack:error.stack});report.completeOutputSequenceCompared=false;}
 report.passed=report.errors.length===0&&report.firstDivergence===null;
 fs.writeFileSync(configuration.output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({control,node:process.version,passed:report.passed,firstDivergence:report.firstDivergence,error:report.errors[0]?.message??null}));
}
if(args[0]==='--child'){
 fail(args.length===2,'One private child configuration required');await child(JSON.parse(fs.readFileSync(args[1],'utf8')));
}else{
 fail(args.length===4&&args[0]==='--output'&&args[2]==='--node22','Use --output <new .local/street01 directory> --node22 <exact executable>');
 const output=path.resolve(args[1]),node22=path.resolve(args[3]),prefix=path.join(repo,'.local','street01')+path.sep;fail(output.startsWith(prefix)&&!fs.existsSync(output),'New private original-only diagnostic directory required');
 for(let at=path.dirname(output);;at=path.dirname(at)){if(fs.existsSync(at))fail(!fs.lstatSync(at).isSymbolicLink(),'Linked diagnostic output refused');if(path.dirname(at)===at)break;}
 fs.mkdirSync(output,{recursive:true});const root=path.join(output,'source'),pins=[];fs.mkdirSync(root);
 const fixture=fs.readFileSync(path.join(repo,'tests/Test-Synthesis12.mjs'));fs.writeFileSync(path.join(root,'Test-Synthesis12.mjs'),fixture,{flag:'wx'});pins.push({path:'tests/Test-Synthesis12.mjs',sha256:sha(fixture)});
 for(const implementation of ['parent','current']){fs.mkdirSync(path.join(root,implementation));for(const member of members){const relative='src/acoustics/vehicle/'+member,data=implementation==='parent'?execFileSync('git',['show',parentCommit+':'+relative],{cwd:repo,windowsHide:true}):fs.readFileSync(path.join(repo,relative));fs.writeFileSync(path.join(root,implementation,member),data,{flag:'wx'});pins.push({implementation,path:relative,sha256:sha(data)});}}
 for(const relative of ['tools/Diagnose-ColdNpcHistory01.mjs','tools/cold-npc-history01.mjs'])pins.push({path:relative,sha256:sha(fs.readFileSync(path.join(repo,relative)))});
 const runtimes=[node22,process.execPath],results=[];
 for(const runtime of runtimes){const version=execFileSync(runtime,['--version'],{encoding:'utf8',windowsHide:true}).trim();fail(['v22.23.4','v24.19.0'].includes(version),'Explicit supported actual Node runtime required');for(const control of ['historical-order','separate-banks','current-first','jitless']){
  const name=version+'-'+control,configuration={root,control,output:path.join(output,name+'.json')},file=path.join(output,name+'-configuration.json');fs.writeFileSync(file,JSON.stringify(configuration),{flag:'wx'});
  const flags=['--max-old-space-size=256',...(control==='jitless'?['--jitless']:[])],environment={...process.env};for(const name of ['NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE'])delete environment[name];
  const result=spawnSync(runtime,[...flags,fileURLToPath(import.meta.url),'--child',file],{cwd:repo,env:environment,encoding:'utf8',timeout:20000,maxBuffer:1048576,windowsHide:true});
  fs.writeFileSync(path.join(output,name+'.stdout.log'),result.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(output,name+'.stderr.log'),result.stderr??'',{flag:'wx'});
  const report=fs.existsSync(configuration.output)?JSON.parse(fs.readFileSync(configuration.output,'utf8')):null;results.push({name,node:version,control,processExitCode:result.status,signal:result.signal,spawnError:result.error?.message??null,passed:report?.passed??false,firstDivergence:report?.firstDivergence??null,report:path.basename(configuration.output)});
 }}
 const stable=pins.filter(p=>p.implementation!=='parent').every(p=>sha(fs.readFileSync(path.join(repo,p.path)))===p.sha256);
 const summary={schema:1,kind:'RichAudioColdNpcFixedControlMatrix01',parentCommit,sourcePins:pins,sourcePinsUnchanged:stable,results,plannedProcesses:8,actualProcesses:results.length,maximumChildMilliseconds:20000,automaticRetries:0,clearedChildEnvironment:['NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE'],productOrHistoricalAssertionsChanged:false,hostedFailureResolved:false,installedResourcesRead:false,endpointOpened:false};
 fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,processes:results.length,failedControls:results.filter(r=>!r.passed).map(r=>r.name),hostedFailureResolved:false}));
}
