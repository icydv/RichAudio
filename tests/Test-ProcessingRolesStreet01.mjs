import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProcessingRoleCaptureStreet01,compareProcessingRolesStreet01,processingInputBindingStreet01,processingRoleContractStreet01} from '../tools/Processing-RolesStreet01.mjs';
import {compareProcessingPcm13} from '../tools/Profile-Processing13.mjs';

const pin='a'.repeat(64),base={quality:'balanced',acceleration:'cpu',enabled:true,volume:1,reflections:true,mode:'experimental-additive'};
function engine(modern=false){
 const slots=[0,1].map(index=>({index,identity:index?null:'authored-vehicle:1',generation:1,source:index?null:{frame:512},vehicle:index?null:{riderAttached:true}}));
 const ids=slots.flatMap(s=>['engine','exhaust',...(modern?['aero']:[])].map(role=>`stock:slot${s.index}:${role}`));
 const inputs=Object.fromEntries(ids.map(id=>[id,new Float32Array(512).fill(id.includes('slot0:engine')?.125:id.includes('slot0:exhaust')?.0625:0)]));
 return {settings:{...base,...(modern?{airflowEnabled:false,airflowLevel:.35}:{})},slots,ids,inputs,left:new Float32Array(512).fill(.025),right:new Float32Array(512).fill(.02),...(modern?{localAirflow:[new Float32Array(512),new Float32Array(512)]}:{})};
}
function capture(instance){const serials=new WeakMap();serials.set(instance.slots[0].source,1);const c=createProcessingRoleCaptureStreet01(instance,{sourceSerials:serials,inputBinding:pin,expectedBlocks:1});c.observe({sequence:1,time:0,source:'authored'});c.record(0);return c.finish();}
const pass=result=>Object.values(result).every(v=>v===true);
const aggregate=instance=>{const h=createHash('sha256');for(const id of instance.ids){const a=instance.inputs[id];h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}return h.digest('hex');};

test('versioned roles preserve every legacy buffer despite the four/six aggregate difference',()=>{
 const old=engine(),current=engine(true);assert.notEqual(aggregate(old),aggregate(current));
 const a=capture(old),b=capture(current);assert.equal(a.contract,processingRoleContractStreet01);assert.equal(a.blocks[0].roles.length,4);assert.equal(b.blocks[0].roles.length,8);
 assert.ok(pass(compareProcessingRolesStreet01(a,b)));assert.notDeepEqual(a.settings,b.settings);
});
test('roles are keyed by explicit identity rather than buffer enumeration order',()=>{
 const a=engine(true),b=engine(true);b.ids.reverse();assert.ok(pass(compareProcessingRolesStreet01(capture(a),capture(b))));
});
test('one altered legacy sample is rejected even when final stereo is unchanged',()=>{
 const a=engine(),b=engine(true);b.inputs['stock:slot0:engine'][127]+=.0001;
 const compared=compareProcessingRolesStreet01(capture(a),capture(b));assert.equal(compared.exactLegacyEngineExhaustPCM,false);assert.equal(compared.exactRoleAwareStereoPCM,true);
});
test('changed lifetime identity and source frame are detected independently of PCM',()=>{
 for(const change of [s=>s.identity='other-vehicle:1',s=>s.generation++,s=>s.source.frame++]){
  const a=engine(),b=engine(true);change(b.slots[0]);const compared=compareProcessingRolesStreet01(capture(a),capture(b));assert.equal(compared.exactLegacySourceIdentities,false);assert.equal(compared.exactLegacyEngineExhaustPCM,true);
 }
});
test('missing, duplicate, unexpected and misidentified source roles are rejected',()=>{
 for(const change of [e=>e.ids.pop(),e=>e.ids.push(e.ids[0]),e=>{e.ids[0]='stock:slot0:horn';},e=>{e.inputs.extra=new Float32Array(512);}]){const e=engine(true);change(e);assert.throws(()=>capture(e),/role|input buffers/);}
 const b=capture(engine(true));b.blocks[0].roles[0].bufferId='stock:slot1:engine';assert.throws(()=>compareProcessingRolesStreet01(capture(engine()),b),/misidentified/);
 const duplicate=capture(engine(true));duplicate.blocks[0].roles[0]=structuredClone(duplicate.blocks[0].roles[1]);assert.throws(()=>compareProcessingRolesStreet01(capture(engine()),duplicate),/duplicate/);
});
test('all legacy settings and only explicitly recognised new settings are checked',()=>{
 for(const [key,value]of Object.entries({quality:'performance',acceleration:'gpu',enabled:false,volume:.9,reflections:false,mode:'stock-fallback'})){
  const b=engine(true);b.settings[key]=value;assert.equal(compareProcessingRolesStreet01(capture(engine()),capture(b)).exactLegacySettings,false,key);
 }
 const extra=engine(true);extra.settings.ignoredField=1;assert.throws(()=>capture(extra),/unexpected setting/);
 const missing=engine(true);delete missing.settings.volume;assert.throws(()=>capture(missing),/missing/);
 const nondefault=engine(true);nondefault.settings.airflowLevel=.4;assert.equal(compareProcessingRolesStreet01(capture(engine()),capture(nondefault)).expectedAirflowSettings,false);
});
test('new exterior and rider channels must be separately zero when disabled',()=>{
 for(const key of ['aero','rider']){const b=engine(true);if(key==='aero')b.inputs['stock:slot0:aero'][200]=.02;else b.localAirflow[1][1]=.02;
  const current=capture(b);assert.equal(compareProcessingRolesStreet01(capture(engine()),current).separateAirflowBuffersQualified,false);
  assert.equal(compareProcessingRolesStreet01(current,current).separateAirflowBuffersQualified,false,'same-implementation equality cannot hide disabled-layer leakage');
 }
 const enabled=engine(true);enabled.settings.airflowEnabled=true;enabled.inputs['stock:slot0:aero'].fill(.01);enabled.localAirflow[0].fill(.015);assert.ok(pass(compareProcessingRolesStreet01(capture(enabled),capture(enabled))));
 assert.equal(compareProcessingRolesStreet01(capture(engine()),capture(enabled)).expectedAirflowSettings,false);
});
test('nonfinite new PCM and overlapping role buffers are rejected',()=>{
 const a=engine(true);a.localAirflow[0][20]=NaN;assert.throws(()=>capture(a),/nonfinite/);
 const b=engine(true);b.inputs['stock:slot0:exhaust']=b.inputs['stock:slot0:engine'];assert.throws(()=>capture(b),/alias/);
});
test('matched input and observation timelines remain mandatory',()=>{
 const a=capture(engine()),b=capture(engine(true));b.inputBinding='b'.repeat(64);assert.equal(compareProcessingRolesStreet01(a,b).matchedSourceInputs,false);b.inputBinding=a.inputBinding;b.observationSHA256='b'.repeat(64);assert.equal(compareProcessingRolesStreet01(a,b).matchedSourceInputs,false);
 const bank={model:'bati',layers:{engine:{idle:{frames:16,sampleRate:24000,samples:new Float32Array(16)}}}},config={profile:'test',scene:'direct',blocks:1,coldBlocks:0,lifecycle:false,texture:false};
 const first=processingInputBindingStreet01(bank,config,'authored');bank.layers.engine.idle.samples[1]=.01;assert.notEqual(processingInputBindingStreet01(bank,config,'authored'),first);
});
function report(modern){const roleAudio=capture(engine(modern));return {schema:2,comparisonContract:processingRoleContractStreet01,roleAudio,settings:modern?{...base,airflowEnabled:false,airflowLevel:.35}:base,beforeRender:{sourceConstructions:0,sourceCreations:0,rendererFrame:0},observationSequence:[{time:0}],lifecycle:{retired:0},continuity:{drySha256:modern?'new-aggregate':'old-aggregate',stereoSha256:'same-stereo',blocks:[{block:0,drySha256:modern?'new':'old',stereoSha256:'same'}],rendererFrames:512,sourceRows:[{block:0,sources:[{identity:'authored',frame:512,phaseHistorySha256:pin}]}],pathRows:[{block:0,pathsSha256:pin,selectedPaths:2,reflectedPaths:0}],sourceCreations:1,sourceCursorContinuous:true,rendererHistoryStable:true,historyAffectedFrames:0,limiterEvents:0,nonzeroBlocks:1}};}
test('production comparison preserves exact phase/grain history and fails missing versioned data',()=>{
 const a=report(false),b=report(true);assert.ok(pass(compareProcessingPcm13(a,b)));
 const changed=structuredClone(b);changed.continuity.sourceRows[0].sources[0].phaseHistorySha256='b'.repeat(64);assert.equal(compareProcessingPcm13(a,changed).phaseAndGrainHistoryIdentical,false);
 const absent=structuredClone(b);delete absent.roleAudio;assert.throws(()=>compareProcessingPcm13(a,absent),/block timeline/);
 delete absent.comparisonContract;assert.throws(()=>compareProcessingPcm13(a,absent),/comparison versions/);
});
test('missing role blocks cannot qualify a partial sequence',()=>{
 const a=capture(engine()),b=capture(engine(true));b.blocks=[];assert.throws(()=>compareProcessingRolesStreet01(a,b),/complete versioned capture/);
 const truncated=report(true);truncated.continuity.rendererFrames+=512;assert.throws(()=>compareProcessingPcm13(report(false),truncated),/block timeline/);
});
test('fresh schema cannot silently fall back to anonymous aggregates when both contracts are missing',()=>{
 const a=report(true),b=structuredClone(a);for(const r of [a,b]){delete r.comparisonContract;delete r.roleAudio;}
 assert.throws(()=>compareProcessingPcm13(a,b),/comparison versions/);
 a.schema=1;b.schema=1;assert.ok(Object.values(compareProcessingPcm13(a,b)).every(v=>v===true),'old schema retains its original strict comparison rather than being retroactively role-qualified');
});
