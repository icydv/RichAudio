// Explicit Node CLI. UI REPL sends commands only; it does not own the clock.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import readline from 'node:readline';import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {ListeningOperator} from './operator.mjs';
import {readServiceConfiguration} from '../soundmap/producer-client.mjs';
export const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
const hex40=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const hex64=value=>typeof value==='string'&&/^[A-F0-9]{64}$/.test(value);
function unlinked(file){
  if(!path.isAbsolute(file))throw Error('Absolute vehicle input required');
  let current=path.resolve(file);while(true){if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('Linked vehicle input rejected');const parent=path.dirname(current);if(parent===current)break;current=parent;}
}
function validateVehicleInputs(c,candidateFile){
  // The native option parser uses the last occurrence. Refuse aliases/duplicates
  // before interpreting any path or allowing a manually approved invocation.
  const values=new Set(['--root','--scene','--vehicle-profile','--beacon-output-trim-db','--gain','--seconds','--sources','--device','--geometry-model','--acoustic-settings','--soundmap-config','--output']);
  const parsed=new Map();for(let i=0;i<c.args.length;i++){
    const key=c.args[i];if(parsed.has(key)||(!values.has(key)&&key!=='--listener-pipe'))throw Error('Vehicle option scope/duplicate');
    if(key==='--listener-pipe'){parsed.set(key,true);continue;}
    if(i+1>=c.args.length||c.args[i+1].startsWith('--'))throw Error('Vehicle option value absent');parsed.set(key,c.args[++i]);
  }
  if(parsed.size!==values.size+1||[...values].some(key=>!parsed.has(key))||parsed.get('--device')!=='default')throw Error('Complete fixed vehicle options required');
  const root=path.resolve(c.cwd),pack=path.dirname(candidateFile),same=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
  if(!same(root,path.join(pack,'app'))||!same(c.executable,path.join(root,'build','acoustics-host','RichAudio.Acoustics.Host.exe')))throw Error('Vehicle package executable/cwd routing');
  const routed={'--geometry-model':'.local/geometry-model.json','--acoustic-settings':'.local/acoustic-settings.json','--soundmap-config':'.local/soundmap/service.json','--output':'.local/host-live-01'};
  for(const [flag,relative] of Object.entries(routed))if(!same(parsed.get(flag),path.join(root,relative)))throw Error('Vehicle input/output routing differs');
  const bindings=new Map();for(const b of c.bindings){unlinked(b.Path);const key=path.resolve(b.Path).toLowerCase();if(!hex64(b.SHA256)||bindings.has(key))throw Error('Vehicle binding identity/hash');bindings.set(key,b.SHA256);}
  const bound=file=>{const hash=bindings.get(path.resolve(file).toLowerCase());if(!hash||hash!==sha(file))throw Error('Required vehicle input not bound');return hash;};
  if(bound(c.executable)!==c.hostSha256||bound(path.join(pack,'runtime','Plugins','RichAudio.Beacon.Rph.dll'))!==c.pluginSha256)throw Error('Vehicle executable fingerprint differs');
  bound(parsed.get('--geometry-model'));bound(path.join(root,'tools','Run-Acoustics07.mjs'));
  const op=c.listeningOperator;if(!op||!same(op.script,path.join(root,'tools','listening','run.mjs')))throw Error('Vehicle operator routing differs');
  bound(op.executable);bound(op.script);
  if(!hex40(c.sourceHead)||c.baseCommit!=='247e7ff2af8f1670ba454ae303ba56cb4f16fb19'||c.vehiclePhysicsCommit!=='eef0cbc2e96e09754d87b375975eb1053422121e'||c.targetGta!=='1.0.1158.16'||c.targetRph!=='1.132.1428.17748')throw Error('Vehicle exact source/build provenance');
  if(typeof c.liveReady!=='boolean'||c.liveReady&&(!hex40(c.upstreamCorrectionCommit)||c.upstreamCorrectionCommit===c.baseCommit))throw Error('Vehicle upstream readiness evidence required');
  const model=JSON.parse(fs.readFileSync(parsed.get('--geometry-model')));
  if(model.basis!=='declared-demonstration-scale'||model.metresPerNativeUnit!==1||!Array.isArray(model.sourceOffsetNative)||model.sourceOffsetNative.length!==3||model.sourceOffsetNative.some(x=>x!==0))throw Error('Vehicle declared coordinate model changed');
  const settings=parsed.get('--acoustic-settings');unlinked(settings);
  if(!c.initialSettings||!same(c.initialSettings.Path,settings)||!hex64(c.initialSettings.SHA256)||sha(settings)!==c.initialSettings.SHA256)throw Error('Initial vehicle settings changed');
  for(const file of [candidateFile,root,c.executable,...Object.values(routed).map(relative=>path.join(root,relative))])unlinked(file);
  // Everything copied into the executable app is an exact input. Only the
  // explicitly mutable settings and owned SoundMap/output directories differ.
  const walk=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);unlinked(file);const relative=path.relative(root,file).replaceAll('\\','/');
    if(relative==='.local/soundmap'||relative==='.local/host-live-01')continue;
    if(entry.isDirectory())walk(file);else if(!same(file,settings))bound(file);
  }};walk(root);
}
export function validateCandidate(candidateFile,expectedHash){
  if(!path.isAbsolute(candidateFile)||sha(candidateFile)!==expectedHash)throw Error('Exact candidate hash required');
  const c=JSON.parse(fs.readFileSync(candidateFile));
  const vehicle=c.scope==='RICHAUDIO_VEHICLE_LIVE01';
  if((!vehicle&&c.scope!=='RICHAUDIO_083_COMBINED')||c.maximumAttempts!==1||!path.isAbsolute(c.cwd)||!fs.statSync(c.cwd).isDirectory()||!path.isAbsolute(c.executable)||!fs.statSync(c.executable).isFile()||!Array.isArray(c.args)||c.args.some(a=>typeof a!=='string'||a.includes('\0')))throw Error('Candidate executable/cwd/argument scope');
  if(!Array.isArray(c.bindings)||!c.bindings.length||new Set(c.bindings.map(b=>b.Path)).size!==c.bindings.length)throw Error('Exact nonempty unique input bindings required');
  for(const b of c.bindings)if(sha(b.Path)!==b.SHA256)throw Error('Bound input changed');
  const option=k=>c.args[c.args.indexOf(k)+1];
  const profile=vehicle?{'--root':c.cwd,'--scene':'open-road','--vehicle-profile':'v12','--beacon-output-trim-db':'0','--gain':'0.20','--seconds':'60','--sources':'8'}:
    {'--root':c.cwd,'--scene':'open-road','--beacon':'harmonic','--beacon-frequency-hz':'600','--beacon-level':'0.44','--beacon-output-trim-db':'12','--gain':'0.20','--seconds':'60','--sources':'1'};
  for(const [k,v] of Object.entries(profile))if(c.args.filter(a=>a===k).length!==1||option(k)!==v)throw Error('Approved profile changed: '+k);
  if(vehicle&&(c.liveAuthorised!==false||c.state!=='REVIEW_ONLY'||c.audio?.stockAudio!=='additive-experimental-playback'||
    c.audio?.rendererMasterGain!==.35||c.audio?.preHostPeakLimit!==.5||c.audio?.outputTrimDb!==0))throw Error('Vehicle review/ownership/calibration scope');
  if(!c.args.includes('--listener-pipe')||['--autostart','--loopback','--exercise-controls','--probe-device','--list-devices','--wav'].some(k=>c.args.includes(k)))throw Error('Manual required-listener profile only');
  for(const k of ['--geometry-model','--acoustic-settings'])if(!fs.statSync(option(k)).isFile())throw Error('Required input absent');
  const settings=JSON.parse(fs.readFileSync(option('--acoustic-settings')));
  if(settings.acousticQuality!=='balanced'||settings.acousticAcceleration!=='auto'||settings.outputLevel!==1||!settings.richAudioEnabled||!settings.earlyReflections)throw Error('Approved settings changed');
  if(vehicle)validateVehicleInputs(c,candidateFile);
  return c;
}
async function main(){
  const [candidateFile,hash,mode]=process.argv.slice(2),c=validateCandidate(candidateFile,hash);
  if(mode==='--validate-only'){console.log(JSON.stringify({type:'validated',clock:'node:perf_hooks.performance.now',spawned:false}));return;}
  if(mode!=='--execute-approved')throw Error('Explicit execute-approved or validate-only required');
  if(c.scope==='RICHAUDIO_VEHICLE_LIVE01'&&c.liveReady!==true)throw Error('Vehicle candidate awaits reconciled upstream correction and new exact-build readiness review');
  if(c.scope==='RICHAUDIO_VEHICLE_LIVE01'&&(sha(process.execPath)!==sha(c.listeningOperator.executable)||sha(fileURLToPath(import.meta.url))!==sha(c.listeningOperator.script)))throw Error('Exact vehicle operator/runtime required');
  const packageRoot=path.dirname(candidateFile),planFile=path.join(packageRoot,'attempt.json'),plan=JSON.parse(fs.readFileSync(planFile));
  const approval=JSON.parse(fs.readFileSync(plan.Paths.FreshApproval)),journal=JSON.parse(fs.readFileSync(plan.Paths.Journal));
  if(c.scope==='RICHAUDIO_VEHICLE_LIVE01'&&(approval.Approved!==true||!Number.isFinite(Date.parse(approval.ExpiresUtc))||
    plan.Schema!==1||plan.Scope!==c.scope||plan.FixtureOnly!==false||plan.OriginalCandidateSHA256!==hash||
    path.resolve(plan.OriginalCandidatePath)!==path.resolve(candidateFile)||sha(plan.ManifestPath)!==plan.ManifestSHA256))throw Error('Fresh exact vehicle attempt/approval binding required');
  if(!approval.Approved||approval.MaximumAttempts!==1||approval.Scope!==c.scope||approval.CandidateSHA256!==hash||approval.AttemptSHA256!==sha(planFile)||approval.ManifestSHA256!==plan.ManifestSHA256||Date.parse(approval.ExpiresUtc)<=Date.now()||journal.AttemptSHA256!==sha(planFile)||journal.State!=='DEPLOYED_NOT_LAUNCHED'||fs.existsSync(path.join(packageRoot,'closed.json')))throw Error('Fresh exact deployed attempt approval required');
  const out=path.join(packageRoot,'observations','listening-operator');fs.mkdirSync(out,{recursive:false});
  const emit=e=>{fs.appendFileSync(path.join(out,'events.jsonl'),JSON.stringify(e)+'\n');if(e.type==='terminal')fs.writeFileSync(path.join(out,'terminal.json'),JSON.stringify(e,null,2));if(!['stdout','stderr'].includes(e.type))console.log(JSON.stringify(e));};
  let recording=null,config=null,bodyPending=false,previousStream=null;const headers=()=>({'Content-Type':'application/json','X-RichAudio-Token':config.token});
  const api=async(route,value)=>{const response=await fetch(config.url+route,{method:value===undefined?'GET':'POST',redirect:'error',headers:headers(),body:value===undefined?undefined:JSON.stringify(value),signal:AbortSignal.timeout(700)});if(!response.ok)throw Error('SoundMap request failed '+response.status);return response.json();};
  const stopRecording=async()=>{if(recording){const id=recording.id;recording=null;const result=await api('/api/record/stop',{id});fs.writeFileSync(path.join(out,'recording-stop.json'),JSON.stringify(result));}};
  const op=new ListeningOperator({...c,emit:e=>{emit(e);if(e.type==='recording-stop-required'||e.type==='failure'||e.type==='terminal')void stopRecording().catch(error=>emit({type:'recording-stop-error',reason:error.message}));}});
  const input=readline.createInterface({input:process.stdin});
  input.on('line',async line=>{if(bodyPending){op.fail('overlapping-operator-command');return;}bodyPending=true;try{
    const m=JSON.parse(line);
    if(m.command==='begin'){
      config=readServiceConfiguration(c.args[c.args.indexOf('--soundmap-config')+1]);
      const f=await api('/api/frame');if(!f.status?.passive?.available||f.passive?.ageMs>500||f.status.audio.hostConnected)throw Error('Fresh passive feed without host required');
      previousStream=f.frame?.streamId??null;
      op.begin(m.preconditions);
    }else if(m.command==='permit-listener')op.permitListener();
    else if(m.command==='listener-issued')op.listenerIssued();
    else if(m.command==='confirm-listener'){
      const deadline=performance.now()+5000;let accepted=false;
      while(op.alive()&&performance.now()<deadline){const f=await api('/api/frame');
        if(f.frame?.streamId!==previousStream&&op.observeReadiness(f.frame,f.status).rendererReadyForOwnedEmission){op.accepted(f.frame,f.status);accepted=true;break;}
        await new Promise(resolve=>setTimeout(resolve,50));
      }if(!accepted)throw Error('Accepted listener confirmation deadline');
    }
    else if(m.command==='record-and-emit'){
      if(op.state!=='listener-accepted'||!op.alive())throw Error('Accepted live listener required before recording');
      const r=await api('/api/record/start',{maxDurationSeconds:60,maxBytes:67108864});recording=r.recording;emit({type:'recording-started',id:recording.id});op.emitBeacon();
    }else if(m.command==='stop')op.stop();
    else if(m.command==='shutdown-service'){
      if(!op.finished||!m.gameExited||!m.ownedWindowClosed)throw Error('Host, game and owned window must be closed first');
      await stopRecording();if(!config.ownerId)throw Error('No owned service capability');await api('/api/service/stop',{ownerId:config.ownerId});emit({type:'owned-service-stop-requested'});input.close();
    }else if(m.command==='close-operator'){if(!op.finished)throw Error('Host not finished');input.close();}
    else throw Error('Unknown command');
  }catch(error){op.fail(error.message);if(!op.child)op.finish(null);}finally{bodyPending=false;}});
  input.on('close',()=>{if(op.child&&!op.finished)op.stop('operator-input-closed');fs.writeFileSync(path.join(out,'operator-final.json'),JSON.stringify({primary:op.primary,secondary:op.secondary,launches:op.launches,listenerStarts:op.listenerStarts,ownedPids:op.children.map(c=>c.pid).filter(Boolean)}));});
  emit({type:'validated',clock:'node:perf_hooks.performance.now',next:'begin after Story/READY/passive movement; await host-ready before permit-listener; no game commands executed by this CLI'});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(JSON.stringify({type:'preflight-failure',reason:error.message}));process.exitCode=1;});
