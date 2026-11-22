// Independent arithmetic over original synthetic fixtures. No game data required.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.argv[2],run=JSON.parse(fs.readFileSync(path.join(root,'stopping-run.json')));let checks=0;
const check=(condition,message)=>{assert(condition,message);checks++;};
check(run.Domain==='original-synthetic-fixture'&&run.Stage==='Cleaned','synthetic only, terminal cleanup');
check(run.RunoutRequired===false&&run.Stopping.StationaryConfirmed===true,'no runout, actual synthetic stopping confirmation');
check(run.Stopping.BrakeRequested&&run.Stopping.FinishObserved,'finish and braking independently recorded');
const s=run.Stopping, samples=run.Samples.filter(x=>x.Observation.At>=s.FinishObservedAt);
let distance=0,integral=0;for(let i=1;i<samples.length;i++){const a=samples[i-1].Observation,b=samples[i].Observation,dt=b.At-a.At;check(dt>0&&dt<=.25,'continuous sample clock');distance+=Math.hypot(b.Position.X-a.Position.X,b.Position.Y-a.Position.Y,b.Position.Z-a.Position.Z);integral+=(a.Speed+b.Speed)*dt/2;}
check(Math.abs(distance-10)<1e-8&&Math.abs(integral-10)<1e-8,'analytic constant deceleration integral');
check(Math.abs(distance-s.SampledDistanceAfterFinishDetection)<1e-8&&Math.abs(integral-s.IntegratedDistanceAfterFinishDetection)<1e-8,'recorded distance independently checked');
const held=samples.filter(x=>x.Observation.At>=s.StationarySince);check(held.length>=10&&held.every(x=>x.Observation.Speed<=.25),'consecutive measured low-speed hold');
check(s.StopObservedAt-s.StationarySince>=1&&s.StoppingSeconds===s.StopObservedAt-s.FinishObservedAt,'hold duration and reported confirmation time');
check(run.Lifecycle.filter(x=>x.startsWith('observed checkpoint')).length===4,'four measured checkpoint arrivals after START');
check(run.FullThrottleProven===false&&run.MechanicalTopSpeedProven===false,'requested speed is not proof of full throttle or maximum speed');
const adapter=fs.readFileSync('src/benchmark/Bati/BatiAdapter.Rph.cs','utf8'),host=fs.readFileSync('src/benchmark/Bati/BatiExperiment.Rph.cs','utf8');
check(adapter.includes('GoForwardStraightBraking')&&adapter.includes('DOES_ENTITY_EXIST",id.Handle'),'supported braking and saved full-GUID native presence query');
check(host.includes('controller.Arm(true);Check.That(controller.Start(now)')&&host.indexOf('attempt.used')<host.indexOf('controller.Start(now)'),'explicit arm and durable one-shot intent precede spawning');
check(host.includes('controller.State==Stage.Stopping')&&host.includes('r.Position.X+d.X/n*100'),'stopping interference screen points ahead, not back at FINISH');
check(!/SET_ENTITY_VELOCITY|SET_VEHICLE_FORWARD_SPEED|FREEZE_ENTITY|APPLY_FORCE|SET_ENTITY_COORDS|TraceLine|PlaySound|\.Position\s*=|\.Velocity\s*=/.test(adapter+host),'no physics shortcuts, collision rays or audio mutation');
check(adapter.includes('Creation(true)')&&adapter.includes('Creation(false)')&&host.includes('FileMode.CreateNew'),'one bike/rider counters and non-overwriting private evidence');
console.log(`PASS: ${checks} independent five-stop arithmetic and runtime-boundary checks; synthetic only.`);
