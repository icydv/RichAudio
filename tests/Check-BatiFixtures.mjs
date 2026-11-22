import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const dir=process.argv[2],run=JSON.parse(fs.readFileSync(path.join(dir,'run.json')));let checks=0;
function test(ok,message){assert(ok,message);checks++;}
test(run.Domain==='original-synthetic-fixture','never live evidence');test(run.Version===1&&run.MarkerRevision===3,'versions');
test(run.FullThrottleProven===false&&run.MechanicalTopSpeedProven===false&&run.LiveStartSupported===false,'scientific boundaries');
test(run.Outcome.startsWith('FINISH_REACHED')&&run.Stage==='Cleaned'&&run.Cleanup==='VERIFIED_ABSENT','separate finish and cleanup');
test(run.Summary.HighestObservedSpeed===20&&run.Summary.MaximumPossibleSpeed==='NOT PROVEN','highest sample not mechanical maximum');
const speed=s=>Math.hypot(s.Observation.Velocity.X,s.Observation.Velocity.Y,s.Observation.Velocity.Z);
for(let i=0;i<run.Samples.length;i++){
 const s=run.Samples[i],r=s.Observation;test(Math.abs(speed(s)-r.Speed)<1e-9,'speed independently recomputed');
 const d=Math.hypot(r.Position.X-run.Listener.X,r.Position.Y-run.Listener.Y,r.Position.Z-run.Listener.Z);test(Math.abs(d-s.DistanceToMarker)<1e-9,'3D listener distance');
 test(s.RpmStatus==='unavailable'&&r.RawRpm===48.333335876464844,'invalid vendor signal never repurposed');
 if(i){const prev=run.Samples[i-1],dt=r.At-prev.Observation.At;test(dt>0&&dt<=.25,'actual time gaps');test(Math.abs(s.Acceleration-(r.Speed-prev.Observation.Speed)/dt)<1e-8,'independent acceleration derivative');}
}
for(const u of run.Upgrades){test([11,12,13,15,18].includes(u.Category),'performance allowlist');if(u.Category!==18&&u.Count>0)test(u.Requested===u.Count-1&&u.Observed===u.Requested,'highest count-index and readback');}
const adapter=fs.readFileSync(new URL('../src/benchmark/Bati/BatiAdapter.Rph.cs',import.meta.url),'utf8');
const core=fs.readFileSync(new URL('../src/benchmark/Bati/BatiController.cs',import.meta.url),'utf8');
test(adapter.includes('if(!active)throw new NotSupportedException(')&&adapter.includes('approval.Validate(nonce,binary,candidate,DateTime.UtcNow)'),'default-closed approval-bound live gate');
for(const start of ['public Identity CreateBike','public Identity CreateRider','public void InstallKit','public void SetMod','public void EnableTurbo','public void Drive','public void Brake','public void StopOwnedTask','public void DeleteOwned']){const body=adapter.slice(adapter.indexOf(start));test(body.slice(0,body.indexOf('\n')).includes('LiveGate.Require();'),'mutation gate '+start);}
const draw=adapter.slice(adapter.indexOf('private static void Draw('),adapter.indexOf('[ConsoleCommand',adapter.indexOf('private static void Draw(')));
test(!/NativeFunction|Save|Write|Position|Capture|Spawn|CreateBike/.test(draw),'cached draw no acquisition/mutation/IO');
for(const c of ['Load','Status','Show','Hide','Arm','Start','Review','Cleanup','Abort'])test(adapter.includes('Name="RichAudioBati'+c+'"'),'actual command '+c);
test(!/SET_VEHICLE_FORWARD_SPEED|SET_ENTITY_VELOCITY|\.Velocity\s*=|SET_VEHICLE_ENGINE_POWER_MULTIPLIER|APPLY_FORCE|WHEELIE|SET_ENTITY_ROTATION|SET_GRAVITY_LEVEL|ApplyAllMods|TraceLine|PlaySound|SET_VEHICLE_SILENT|\.Position\s*=/.test(adapter),'no forbidden physics/audio/geometry shortcuts');
test(!/SetVehicleDensity|CLEAR_AREA|DELETE_VEHICLES|InvalidateIdle|INVALIDATE_IDLE/.test(adapter),'no unsolicited traffic deletion or camera mutation');
test(core.includes('world.Inspect(id)==Presence.Present')&&core.includes('creation provenance ambiguous'),'mutation provenance checked');
const perf=JSON.parse(fs.readFileSync(path.join(dir,'performance.json')));test(perf.domain==='original-synthetic-fixture'&&perf.realTimeCertified===false&&perf.iterations===100,'performance provenance');
console.log('PASS: '+checks+' independent Bati fixture, measurement and mutation-boundary checks; original synthetic data only.');
