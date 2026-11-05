// Versioned, outside-render diagnostics for matched original-only workloads.
// No source is selected, synthesised, reordered or discarded by this module.
import {createHash} from 'node:crypto';

export const processingRoleContractStreet01='RichAudioRoleIdentityPCM01';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const zeroBlockHash=hash(Buffer.alloc(512*4));
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const requireRole=(ok,message)=>{if(!ok)throw Error('Role-aware processing: '+message);};
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const legacyKeys=['quality','acceleration','enabled','volume','reflections','mode'];
const airflowKeys=['airflowEnabled','airflowLevel'];
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item);
const same=(a,b)=>canonical(a)===canonical(b);
const roleKey=(slot,role)=>`slot${slot}:${role}`;

export function processingSettingsContractStreet01(settings){
 requireRole(settings&&typeof settings==='object'&&!Array.isArray(settings),'settings object required');
 const modern=airflowKeys.some(k=>Object.hasOwn(settings,k)),expected=modern?[...legacyKeys,...airflowKeys]:legacyKeys;
 requireRole(same(Object.keys(settings).sort(),[...expected].sort()),'missing or unexpected setting');
 requireRole(['auto','performance','balanced','quality','max'].includes(settings.quality)&&['auto','cpu','gpu'].includes(settings.acceleration)&&typeof settings.enabled==='boolean'&&Number.isFinite(settings.volume)&&settings.volume>=0&&settings.volume<=1&&typeof settings.reflections==='boolean'&&['experimental-additive','stock-fallback'].includes(settings.mode),'legacy setting value');
 if(modern)requireRole(typeof settings.airflowEnabled==='boolean'&&Number.isFinite(settings.airflowLevel)&&settings.airflowLevel>=0&&settings.airflowLevel<=1,'airflow setting value');
 return {revision:modern?'street01-eight-settings':'legacy-six-settings',legacy:Object.fromEntries(legacyKeys.map(k=>[k,settings[k]])),airflow:modern?{airflowEnabled:settings.airflowEnabled,airflowLevel:settings.airflowLevel}:null};
}

export function processingInputBindingStreet01(bank,config,session){
 const streams=[];
 for(const role of Object.keys(bank.layers).sort())for(const mode of Object.keys(bank.layers[role]).sort()){
  const a=bank.layers[role][mode],pcm=a.samplesFloat32??a.samples;
  requireRole(pcm instanceof Float32Array&&pcm.length===a.frames,'bound input PCM');
  streams.push({role,mode,frames:a.frames,sampleRate:a.sampleRate,pcmSHA256:hash(bytes(pcm)),nativePeak:a.nativePeak??null,intervals:a.intervals??null,sustain:a.sustain??null});
 }
 const {profile,scene,blocks,coldBlocks,lifecycle,texture}=config;
 return hash(Buffer.from(canonical({contract:processingRoleContractStreet01,session,sampleRate:48000,blockFrames:512,model:bank.model,context:bank.audioContext??'player',streams,profile,scene,blocks,coldBlocks,lifecycle,texture})));
}

function pcmRecord(array){
 requireRole(array instanceof Float32Array&&array.length===512,'exact 512-frame Float32 buffer');
 let nonzero=0,peak=0;for(const value of array){requireRole(Number.isFinite(value),'nonfinite PCM');if(value!==0)nonzero++;peak=Math.max(peak,Math.abs(value));}
 return {sha256:hash(bytes(array)),nonzero,peak};
}
function expectedKeys(airflow){
 return [0,1].flatMap(slot=>['engine','exhaust',...(airflow?['aero']:[])].map(role=>roleKey(slot,role))).concat(airflow?['rider:left','rider:right']:[]).sort();
}
function sourceIdentity(slot,serials){
 requireRole(Number.isSafeInteger(slot.generation)&&slot.generation>0,'source generation');
 const serial=slot.source?serials.get(slot.source):null;
 requireRole(!slot.source||Number.isSafeInteger(serial)&&serial>0,'identified source construction');
 return {vehicle:slot.identity??null,generation:slot.generation,sourceSerial:serial,sourceFrame:slot.source?.frame??null};
}

export function createProcessingRoleCaptureStreet01(instance,{sourceSerials,inputBinding,expectedBlocks}={}){
 const settings=processingSettingsContractStreet01(instance.settings),airflow=settings.airflow!==null,blocks=[],observations=createHash('sha256');
 requireRole(sourceSerials instanceof WeakMap&&hex(inputBinding)&&Number.isInteger(expectedBlocks)&&expectedBlocks>0&&expectedBlocks<=512,'source serials, input binding and exact block count required');
 const expectedIds=[0,1].flatMap(slot=>['engine','exhaust',...(airflow?['aero']:[])].map(role=>`stock:slot${slot}:${role}`)).sort();
 const checkPopulation=()=>{
  requireRole(Array.isArray(instance.ids)&&new Set(instance.ids).size===instance.ids.length&&same([...instance.ids].sort(),expectedIds),'missing, duplicate, misidentified or unexpected source role');
  requireRole(same(Object.keys(instance.inputs).sort(),expectedIds),'input buffers disagree with declared roles');
  requireRole(Array.isArray(instance.slots)&&instance.slots.length===2&&same(instance.slots.map(s=>s.index).sort(),[0,1]),'two unique source slots required');
  if(airflow)requireRole(Array.isArray(instance.localAirflow)&&instance.localAirflow.length===2,'two local rider channels required');
 };
 checkPopulation();
 return {
  observe(frame){observations.update(canonical(frame));observations.update('\n');},
  record(block){
   requireRole(block===blocks.length&&block<expectedBlocks,'ordered bounded block timeline');checkPopulation();
   requireRole(same(processingSettingsContractStreet01(instance.settings),settings),'settings changed during matched trial');
   const records=[],buffers=[];
   for(const slot of [...instance.slots].sort((a,b)=>a.index-b.index)){
    const identity=sourceIdentity(slot,sourceSerials);
    for(const role of ['engine','exhaust',...(airflow?['aero']:[])]){
     const id=`stock:slot${slot.index}:${role}`,array=instance.inputs[id];buffers.push(array);
     records.push({key:roleKey(slot.index,role),bufferId:id,identity,...pcmRecord(array)});
    }
   }
   if(airflow){
    const attached=instance.slots.filter(s=>s.source&&s.vehicle?.riderAttached===true).map(s=>({slot:s.index,...sourceIdentity(s,sourceSerials)}));
    for(const [channel,array]of instance.localAirflow.entries()){buffers.push(array);records.push({key:channel?'rider:right':'rider:left',bufferId:channel?'rider-local:right':'rider-local:left',identity:{attached},...pcmRecord(array)});}
   }
   for(let i=0;i<buffers.length;i++)for(let j=i+1;j<buffers.length;j++)requireRole(buffers[i].buffer!==buffers[j].buffer||buffers[i].byteOffset+buffers[i].byteLength<=buffers[j].byteOffset||buffers[j].byteOffset+buffers[j].byteLength<=buffers[i].byteOffset,'source roles must not alias');
   const stereo={left:pcmRecord(instance.left),right:pcmRecord(instance.right)};
   blocks.push({block,frames:512,roles:records.sort((a,b)=>a.key.localeCompare(b.key)),stereo});
  },
  finish(){requireRole(blocks.length===expectedBlocks,'incomplete block capture');return {schema:1,contract:processingRoleContractStreet01,inputBinding,observationSHA256:observations.digest('hex'),settings,airflow,expectedBlocks,blocks};}
 };
}

function validateCapture(capture){
 requireRole(capture?.schema===1&&capture.contract===processingRoleContractStreet01&&hex(capture.inputBinding)&&hex(capture.observationSHA256)&&typeof capture.airflow==='boolean'&&Array.isArray(capture.blocks)&&Number.isInteger(capture.expectedBlocks)&&capture.expectedBlocks>0&&capture.expectedBlocks<=512&&capture.blocks.length===capture.expectedBlocks,'complete versioned capture required');
 const settings=processingSettingsContractStreet01({...capture.settings?.legacy,...capture.settings?.airflow});
 requireRole(same(settings,capture.settings)&&capture.airflow===(settings.airflow!==null),'settings capability binding');
 const keys=expectedKeys(capture.airflow);
 for(const [i,block]of capture.blocks.entries()){
  requireRole(block.block===i&&block.frames===512&&Array.isArray(block.roles)&&same(block.roles.map(r=>r.key).sort(),keys),'missing, duplicate or unexpected captured role');
  for(const record of block.roles){
   const match=/^slot([01]):(engine|exhaust|aero)$/.exec(record.key),expected=match?`stock:slot${match[1]}:${match[2]}`:record.key==='rider:left'?'rider-local:left':'rider-local:right';
   requireRole(record.bufferId===expected&&record.identity&&typeof record.identity==='object'&&hex(record.sha256)&&Number.isInteger(record.nonzero)&&record.nonzero>=0&&record.nonzero<=512&&Number.isFinite(record.peak)&&record.peak>=0&&(record.nonzero===0)===(record.peak===0),'misidentified role, identity or PCM record');
   if(match)requireRole(Number.isSafeInteger(record.identity.generation)&&record.identity.generation>0&&(record.identity.vehicle===null||typeof record.identity.vehicle==='string')&&(record.identity.sourceSerial===null||Number.isSafeInteger(record.identity.sourceSerial)&&record.identity.sourceSerial>0)&&(record.identity.sourceFrame===null||Number.isSafeInteger(record.identity.sourceFrame)&&record.identity.sourceFrame>=0),'source lifetime record');
  }
  for(const channel of ['left','right'])requireRole(hex(block.stereo?.[channel]?.sha256),'stereo channel binding');
 }
 return capture;
}

export function compareProcessingRolesStreet01(reference,trial){
 const a=validateCapture(reference),b=validateCapture(trial),legacy=rows=>rows.filter(r=>r.key.endsWith(':engine')||r.key.endsWith(':exhaust'));
 const select=(c,fn)=>c.blocks.map(block=>({block:block.block,frames:block.frames,roles:fn([...block.roles].sort((x,y)=>x.key.localeCompare(y.key)))}));
 const identities=c=>select(c,rows=>legacy(rows).map(({key,bufferId,identity})=>({key,bufferId,identity})));
 const dry=c=>select(c,rows=>legacy(rows).map(({key,bufferId,sha256})=>({key,bufferId,sha256})));
 const newer=c=>select(c,rows=>rows.filter(r=>!legacy([r]).length));
 const silentNew=c=>c.blocks.every(block=>block.roles.filter(r=>!legacy([r]).length).every(r=>r.nonzero===0&&r.peak===0&&r.sha256===zeroBlockHash));
 const oneHistorical=a.airflow!==b.airflow,modern=a.airflow?a:b;
 const newSettings=oneHistorical?modern.settings.airflow.airflowEnabled===false&&modern.settings.airflow.airflowLevel===.35:same(a.settings.airflow,b.settings.airflow);
 const newSources=[a,b].every(c=>!c.airflow||c.settings.airflow.airflowEnabled||silentNew(c))&&(oneHistorical?silentNew(modern):a.airflow?same(newer(a),newer(b)):true);
 return {
  roleContractQualified:true,
  matchedSourceInputs:a.inputBinding===b.inputBinding&&a.observationSHA256===b.observationSHA256,
  exactLegacySourceIdentities:same(identities(a),identities(b)),
  exactLegacyEngineExhaustPCM:same(dry(a),dry(b)),
  exactLegacySettings:same(a.settings.legacy,b.settings.legacy),
  expectedAirflowSettings:newSettings,
  separateAirflowBuffersQualified:newSources,
  exactRoleAwareStereoPCM:same(a.blocks.map(r=>({block:r.block,frames:r.frames,stereo:r.stereo})),b.blocks.map(r=>({block:r.block,frames:r.frames,stereo:r.stereo})))
 };
}
