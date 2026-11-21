// Independent readback of original synthetic records and a static mutation boundary audit.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
let checks=0;const yes=(b,m)=>{assert.ok(b,m);checks++;};const dir=process.argv[2];
const r=JSON.parse(fs.readFileSync(path.join(dir,'survey.json'),'utf8'));
yes(r.Version===1&&r.Domain==='original-synthetic-fixture','fixture provenance');
yes(r.ActualCalls===36&&r.QueryLimit===36,'independent total');
yes(r.RouteCoverage==='UNKNOWN'&&!r.RouteClear&&!r.BenchmarkStartSupported,'no certification');
yes(r.OriginalStart.Z===1&&r.OriginalFinish.X===100&&r.OriginalListener.Z===5,'historical endpoints');
const names=['Start','Mid1','Mid2','Mid3','Finish','Runout'],counts=[12,3,3,3,9,6];
let total=0;
for(let j=0;j<6;j++){
 const s=r.Stops[j];yes(s.Kind===names[j]&&s.Revision===j+1,'ordered six stops');yes(s.ActualCalls===counts[j]&&s.Observations.length===counts[j],'fixed per-stop count');yes(s.Coverage==='PARTIAL'&&s.Continuity==='UNKNOWN'&&!s.ReplacesOriginalMarker,'limited observations');
 for(let k=0;k<s.Observations.length;k++){
  const o=s.Observations[k],p=s.Plan[k];total++;
  yes(o.TraceCalls===1&&o.FlagsValue===1&&o.FlagsName==='IntersectWorld'&&o.IgnoredPlayerHandle===42,'one world-only query');
  const len=Math.hypot(o.End.X-o.Origin.X,o.End.Y-o.Origin.Y,o.End.Z-o.Origin.Z);yes(Math.abs(len-o.MaximumDistance)<1e-9&&len<=10,'bounded segment');
  yes(JSON.stringify(o.Origin)===JSON.stringify(p.Origin)&&JSON.stringify(o.End)===JSON.stringify(p.End),'same exact planned endpoints');
  if(k<counts[j]-(j===0?3:0)){yes(o.Completion==='hit'&&o.HitPosition.Z===0&&o.HitNormal.Z===1,'original plane fixture');yes(len===6,'known independent six-unit downward geometry');}else yes(o.Completion==='miss'&&!o.HitPosition&&!o.HitNormal,'body misses are unknown volume');
 }
 yes(s.Navigation.Classification==='NAVIGATION_ESTIMATE_CANDIDATE_ONLY','navigation not AI proof');yes(s.Interference.Coverage==='PARTIAL_STREAMED_POOL'&&!s.Interference.FutureClearance,'no empty-route inference');
}
yes(total===36,'no hidden query');
const adapter=fs.readFileSync(new URL('../src/benchmark/Survey/SurveyAdapter.Rph.cs',import.meta.url),'utf8');
const natives=[...adapter.matchAll(/CallByName<[^>]+>\("([A-Z0-9_]+)"/g)].map(m=>m[1]);
const allowed=new Set(['NETWORK_IS_SESSION_STARTED','NETWORK_IS_GAME_IN_PROGRESS','GET_INTERIOR_FROM_ENTITY','DRAW_LINE','ARE_NODES_LOADED_FOR_AREA','CALCULATE_TRAVEL_DISTANCE_BETWEEN_POINTS']);
yes(natives.every(n=>allowed.has(n))&&natives.length>0,'native allowlist: no tasks/population/audio mutations');
yes((adapter.match(/World\.TraceLine\(/g)||[]).length===1,'single reserved query site');
for(const bad of [/new\s+(Vehicle|Ped)\s*\(/,/\.Delete\s*\(/,/\.Tasks\b/,/(?:model|Model)\.Load\s*\(/,/\.Position\s*=(?!=)/,/ResetAbort/])yes(!bad.test(adapter),'no entity creation, deletion, driving, model load, teleport or abort reset');
const capture=adapter.slice(adapter.indexOf('static void Capture'),adapter.indexOf('static void Add'));
yes(capture.includes('ClaimRay(current)')&&capture.indexOf('ClaimRay(current)')<capture.indexOf('Trace(ray,current)'),'claim before query');
for(const method of ['Refresh','Hud','Show','Replay','Hide','Status']){
 const signature=method==='Refresh'?'static void Refresh':method==='Hud'?'static void Hud':'public static void '+method;
 const start=adapter.indexOf(signature),open=adapter.indexOf('{',start);let end=open+1,depth=1;
 for(;end<adapter.length&&depth;end++){if(adapter[end]==='{')depth++;if(adapter[end]==='}')depth--;}
 const body=adapter.slice(open,end);yes(start>=0&&depth===0,'method boundary: '+method);
 yes(!/World\.|Trace\(|Nav\(|Nearby\(|ReadPose\(|Capture\(/.test(body),'presentation cannot acquire: '+method);
}
const build=fs.readFileSync(new URL('../tools/Build-AirportSurvey.ps1',import.meta.url),'utf8');
yes(!/BatiController\.cs|BatiAdapter\.Rph/.test(build),'mutating controller excluded from survey assembly');
const bati=fs.readFileSync(new URL('../src/benchmark/Bati/BatiAdapter.Rph.cs',import.meta.url),'utf8');
yes(bati.includes('LiveGate')&&bati.includes('throw new NotSupportedException'),'existing Bati gate remains closed');
const p=JSON.parse(fs.readFileSync(path.join(dir,'performance.json'),'utf8'));yes(p.domain==='original-synthetic-fixture'&&p.bytes>0&&p.bytes<2097152,'bounded synthetic evidence');
console.log(`PASS: ${checks} independent airport survey checks.`);
