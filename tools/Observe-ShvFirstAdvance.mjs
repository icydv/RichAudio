// Readiness observer only. It never sends input, changes game files, or interlocks driving.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const candidateSha256='21302b4c5c5fb99f63b7b25dce2fa973117bfb0246f16745d0782f062fe1a69e';
const phases=['OFF','IDLE','STATIONARY_REV','ACCELERATION','GEAR_TRANSITIONS','DECELERATION','RETURN_IDLE'];
const safe=x=>Number.isSafeInteger(x), u32=x=>safe(x)&&x>=0&&x<=0xffffffff;
const i32=x=>safe(x)&&x>=-0x80000000&&x<=0x7fffffff;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function decoded(bits) {if(!u32(bits))return NaN;const b=new DataView(new ArrayBuffer(4));b.setUint32(0,bits,true);return b.getFloat32(0,true);}
function bits(value) {const b=new DataView(new ArrayBuffer(4));b.setFloat32(0,value,true);return b.getUint32(0,true);}
function context(c) {
  if(!c||!['player','ped','vehicle','driver'].every(k=>i32(c[k]))||c.player<0||!c.ped||!c.vehicle||
    c.driver!==c.ped||c.model!==0xf9300cc5||!u32(c.engineRunningRaw))return null;
  const speed=decoded(c.speedBits);
  if(c.speedObserved!==true||!Number.isFinite(speed)||speed<0||!Number.isFinite(c.speedMps)||bits(c.speedMps)!==c.speedBits)return null;
  return {identity:[c.player,c.ped,c.vehicle,c.driver,c.model].join(':'),speed,running:c.engineRunningRaw!==0};
}
function clock(...values) {return values.every(v=>safe(v)&&v>0)&&values.every((v,i)=>!i||v>=values[i-1]);}
function readableRaw(row) {
  const value=decoded(row.rawBits);
  return row.readStatus==='good'&&row.pointerPresent===true&&Number.isFinite(value)&&value>=0&&value<=1&&
    Number.isFinite(row.rawFloat)&&bits(row.rawFloat)===row.rawBits&&
    typeof row.rawBitsHex==='string'&&row.rawBitsHex===row.rawBits.toString(16).padStart(8,'0').toUpperCase();
}

export function fileTimeFromUtc(value) {
  const m=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)\.(\d{7})Z$/.exec(String(value));
  if(!m)throw Error('Exact UTC process start with seven fractional digits is required.');
  const whole=Date.parse(m[1]+'Z');
  if(!Number.isFinite(whole)||!new Date(whole).toISOString().startsWith(m[1]))throw Error('Invalid process-start UTC.');
  return ((BigInt(whole)+11644473600000n)*10000n+BigInt(m[2])).toString(16).padStart(16,'0');
}
function beneath(value,root) {
  const full=path.resolve(value),base=path.resolve(root);
  return full.toLowerCase().startsWith((base+path.sep).toLowerCase());
}
export function validateOwnership(owner,{allowedSessionRoot,nowMs=Date.now(),allowFixture=false}={}) {
  const fail=reason=>({valid:false,reason});
  if(!owner||owner.schema!==1||owner.profile!=='PLAYABLE-08'||owner.candidateSha256!==candidateSha256)return fail('ownership-profile-or-candidate-mismatch');
  const fixture=owner.mode==='fixture';
  if(fixture&&!allowFixture)return fail('fixture-ownership-cannot-authorise-live-observation');
  if(owner.mode!==undefined&&owner.mode!=='live'&&!fixture)return fail('unsupported-ownership-mode');
  if(!safe(owner.processId)||owner.processId<=0||owner.processId>0xffffffff||typeof owner.sessionPath!=='string')return fail('invalid-owned-process-or-session');
  let creation;
  try{creation=fileTimeFromUtc(owner.processStartUtc);}catch{return fail('missing-exact-process-start');}
  if(String(owner.processCreationFileTimeHex).toLowerCase()!==creation)return fail('process-start-and-filetime-disagree');
  if(path.basename(owner.sessionPath).toLowerCase()!==String(owner.processId)+'-'+creation)return fail('session-does-not-match-process-creation-identity');
  if(!allowedSessionRoot||!beneath(owner.sessionPath,allowedSessionRoot)||path.dirname(path.resolve(owner.sessionPath)).toLowerCase()!==path.resolve(allowedSessionRoot).toLowerCase())return fail('session-outside-approved-root');
  const launch=Date.parse(owner.launchInvokedUtc),start=Date.parse(owner.processStartUtc),observed=Date.parse(owner.observedUtc);
  if(![launch,start,observed].every(Number.isFinite)||launch>start||start>observed)return fail('ownership-launch-time-order-invalid');
  if(!fixture&&(observed>nowMs+5000||nowMs-observed>60000))return fail('ownership-observation-is-not-fresh');
  return {valid:true,fixture,expectedSessionName:String(owner.processId)+'-'+creation};
}

export function checkFirstAdvance(records,{qpcFrequency,terminal=false,sourceMode='fixture'}={}) {
  const base={schema:1,purpose:'first-advance-readiness-only',sourceMode,providerQualified:false,measuredRPM:false,
    drivingInterlock:false,operatorMustRemainStationaryUntilConfirmation:true};
  let started=false,advanced=false,identity=null,markerQpc=0,checked=0,observations=0,ready=null,declaration=null,returned=null;
  const result=(state,reason,extra={})=>({...base,state,ready:state==='ready',reason,recordsChecked:checked,observationsChecked:observations,...extra});
  if(terminal)return result('failed','terminal-capture-present-before-confirmation');
  if(!Array.isArray(records)||records.length>7209||!safe(qpcFrequency)||qpcFrequency<=0)return result('failed','invalid-record-or-clock-bound');
  for(const row of records) {
    checked++;
    if(!row||row.schema!==3||!safe(row.requestedPhaseIndex)||row.requestedPhaseIndex<0||row.requestedPhaseIndex>6||
      row.requestedPhase!==phases[row.requestedPhaseIndex])return result('failed','invalid-phase-schema');
    if(row.kind==='phase') {
      if(declaration||returned)return result('failed','phase-interrupts-incomplete-observation');
      if(!clock(row.inputBeforeQpc,row.inputAfterQpc,row.acceptedQpc)||row.acceptedQpc<markerQpc)return result('failed','invalid-phase-clock');
      if(!started&&row.action==='start'&&row.requestedPhaseIndex===0)started=true;
      else if(started&&!advanced&&row.action==='advance'&&row.requestedPhaseIndex===1)advanced=true;
      else return result('failed','capture-stopped-or-advanced-before-first-idle-confirmation');
      markerQpc=row.acceptedQpc;
      continue;
    }
    if(!started||row.requestedPhaseIndex!==(advanced?1:0))return result('failed','record-does-not-match-first-phase-protocol');
    if(!safe(row.observationIndex)||row.observationIndex<1||row.observationIndex>2400)return result('failed','invalid-observation-index');
    if(row.kind==='target-return') {
      if(!readableRaw(row))return result('failed','target-failed-before-confirmation');
      if(!declaration||returned||row.observationIndex!==declaration.observationIndex||
        !clock(declaration.declaredQpc,row.targetBeforeQpc,row.targetAfterQpc))return result('failed','invalid-raw-return-order');
      returned=row;
      continue;
    }
    if(row.kind!=='declared-precontext'&&row.kind!=='observation')return result('failed','unknown-record-kind');
    const pre=context(row.preContext);
    if(row.preContextObserved!==true||!pre)return result('failed','invalid-pre-context');
    if(identity!==null&&identity!==pre.identity)return result('failed','vehicle-identity-changed-before-confirmation');
    identity=pre.identity;
    if(pre.speed>0.10)return result('failed',advanced?'motion-before-idle-confirmation':'motion-before-first-advance');
    if(ready&&!pre.running)return result('failed','engine-stopped-before-idle-confirmation');
    if(row.kind==='declared-precontext') {
      if(declaration||returned||row.invocationProven!==false||
        !clock(row.preContext.acquisitionStartQpc,row.preContext.acquisitionEndQpc,row.declaredQpc))return result('failed','invalid-declared-precontext-order');
      declaration=row;continue;
    }
    observations++;
    if(!declaration||!returned||row.observationIndex!==declaration.observationIndex||
      row.observationIndex!==returned.observationIndex||JSON.stringify(row.preContext)!==JSON.stringify(declaration.preContext)||
      ['rawBits','rawBitsHex','rawFloat','readStatus','pointerPresent','targetBeforeQpc','targetAfterQpc','exceptionCode'].some(k=>row[k]!==returned[k]))
      return result('failed','observation-and-declared-raw-return-disagree');
    declaration=null;returned=null;
    const post=context(row.postContext);
    if(row.targetAttempted!==true||!readableRaw(row)||
      row.postContextObserved!==true||row.contextBracketValid!==true||!post||post.identity!==identity)return result('failed','invalid-complete-context-bracket');
    if(!clock(row.preContext.acquisitionStartQpc,row.preContext.acquisitionEndQpc,row.targetBeforeQpc,
      row.targetAfterQpc,row.postContext.acquisitionStartQpc,row.postContext.acquisitionEndQpc)||
      row.targetBeforeQpc<markerQpc||row.postContext.acquisitionEndQpc-row.preContext.acquisitionStartQpc>Math.ceil(qpcFrequency/4))
      return result('failed','invalid-or-stale-observation-clock');
    if(post.speed>0.10)return result('failed',advanced?'motion-before-idle-confirmation':'motion-before-first-advance');
    if(ready&&!post.running)return result('failed','engine-stopped-before-idle-confirmation');
    if(advanced&&pre.running&&post.running)ready={acceptedAdvanceQpc:markerQpc,
      confirmingObservationIndex:row.observationIndex,confirmationQpc:row.postContext.acquisitionEndQpc};
  }
  if(ready)return result('ready','advance-to-idle-and-stationary-running-bracket-recorded',ready);
  return result('waiting',advanced?'awaiting-stationary-running-idle-bracket':'awaiting-first-advance-to-idle');
}

function noLinks(value) {
  for(let cursor=path.resolve(value);;cursor=path.dirname(cursor)) {
    if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())throw Error('Linked paths are not permitted.');
    if(path.dirname(cursor)===cursor)break;
  }
}
function liveIdentity(owner) {
  const executable=path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const script='$ErrorActionPreference="Stop";$p=Get-Process -Id '+owner.processId+';[ordered]@{processId=$p.Id;processName=$p.ProcessName;processStartUtc=$p.StartTime.ToUniversalTime().ToString("o");qpcFrequency=[Diagnostics.Stopwatch]::Frequency}|ConvertTo-Json -Compress';
  const actual=JSON.parse(execFileSync(executable,['-NoLogo','-NoProfile','-NonInteractive','-Command',script],
    {encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:4096}).trim());
  if(actual.processId!==owner.processId||actual.processName!=='GTA5_Enhanced'||actual.processStartUtc!==owner.processStartUtc)
    throw Error('Current GTA process does not match the exact owned process creation identity.');
  return actual;
}
// Creation starts terminal writing. Partial/unknown/failed producer output is
// already terminal and must never revive an earlier successful IDLE sample.
export function hasTerminalCapture(session) {return fs.existsSync(path.join(session,'capture.json'));}
export async function runCli(args) {
  const value=name=>{const at=args.indexOf(name);return at<0?null:args[at+1];};
  const ownerPath=value('--ownership'),outArg=value('--output'),timeout=Number(value('--timeout-ms')??30000);
  if(!ownerPath||!outArg||!safe(timeout)||timeout<1000||timeout>60000)throw Error('Use --ownership <fresh08.json> --output <new .local/playable-08 JSON> [--timeout-ms 1000..60000].');
  const repo=path.dirname(path.dirname(fileURLToPath(import.meta.url))),privateRoot=path.join(repo,'.local','playable-08'),out=path.resolve(outArg);
  if(!beneath(ownerPath,privateRoot)||!beneath(out,privateRoot)||path.extname(out)!=='.json')throw Error('Ownership and new output must be under this repository .local/playable-08.');
  noLinks(ownerPath);noLinks(out);
  if(fs.existsSync(out)||!fs.statSync(path.dirname(out)).isDirectory()||fs.statSync(ownerPath).size>16384)throw Error('New output in an existing private08 directory and bounded ownership receipt required.');
  const ownerBytes=fs.readFileSync(ownerPath),owner=JSON.parse(ownerBytes.toString('utf8'));
  const sessionRoot=path.join(process.env.LOCALAPPDATA??'','RichAudio','ShvProbe');
  if(!process.env.LOCALAPPDATA)throw Error('LOCALAPPDATA is required.');
  const ownership=validateOwnership(owner,{allowedSessionRoot:sessionRoot});
  if(!ownership.valid)throw Error(ownership.reason);
  noLinks(owner.sessionPath);
  if(!fs.statSync(owner.sessionPath).isDirectory())throw Error('Exact owned session directory is missing.');
  const actual=liveIdentity(owner); // Exactly one read-only process query, no polling subprocess.
  const timeline=path.join(owner.sessionPath,'timeline.ndjson');
  const started=performance.now(),rows=[];let offset=0,pending='',handle=null,result;
  try {
    while(performance.now()-started<timeout) {
      if(fs.existsSync(timeline)) {
        noLinks(timeline);
        if(handle===null)handle=fs.openSync(timeline,'r');
        const size=fs.fstatSync(handle).size;
        if(size<offset||size>12*1024*1024)throw Error('Source timeline changed identity/length or exceeds its bound.');
        while(offset<size) {
          const buffer=Buffer.alloc(Math.min(65536,size-offset)),read=fs.readSync(handle,buffer,0,buffer.length,offset);
          if(!read)break;offset+=read;pending+=buffer.subarray(0,read).toString('utf8');
          let newline;
          while((newline=pending.indexOf('\n'))>=0) {
            const line=pending.slice(0,newline).replace(/\r$/,'');pending=pending.slice(newline+1);
            if(Buffer.byteLength(line)>2047)throw Error('Source row exceeds bound.');
            if(line)rows.push(JSON.parse(line));
            if(rows.length>7209)throw Error('Source record count exceeds bound.');
          }
          if(Buffer.byteLength(pending)>2047)throw Error('Partial source row exceeds bound.');
        }
      }
      result=checkFirstAdvance(rows,{qpcFrequency:actual.qpcFrequency,terminal:hasTerminalCapture(owner.sessionPath),sourceMode:'live-owned-session'});
      if(result.state!=='waiting')break;
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    if(result?.ready&&hasTerminalCapture(owner.sessionPath))
      result=checkFirstAdvance(rows,{qpcFrequency:actual.qpcFrequency,terminal:true,sourceMode:'live-owned-session'});
    if(!result||result.state==='waiting')result={...(result??{}),schema:1,state:'failed',ready:false,reason:'first-advance-observer-timeout',providerQualified:false,drivingInterlock:false};
    result.ownershipSha256=sha(ownerBytes);result.exactProcessIdentityVerifiedOnce=true;
    result.processQueryWasReadOnly=true;result.sourceCaptureFilesWritten=false;result.windowControlPerformed=false;
    result.gameNativeCalls=0;result.pollHz=5;result.maximumWaitMs=timeout;
    result.sourceSessionBirthTimeIsSupplementalOnly=true;
    fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    process.stdout.write(result.ready?'FIRST ADVANCE CONFIRMED: IDLE label and stationary running Bati recorded. This is not provider qualification.\n':
      'FIRST ADVANCE FAILED: '+result.reason+'. Remain stationary; no automatic retry.\n');
    return result.ready?0:1;
  } finally {if(handle!==null)fs.closeSync(handle);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try{process.exitCode=await runCli(process.argv.slice(2));}
  catch(error){process.stderr.write('First-advance observer refused: '+error.message+'\n');process.exitCode=1;}
}
