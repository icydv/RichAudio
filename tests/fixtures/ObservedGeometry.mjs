// Original analytic collision samples in the existing GTA observation format.
import { tileFixture } from './TileFixtures.mjs';
export function observedFixture() {
  const wall=tileFixture('wall'),ground=tileFixture('ground');
  for(const s of wall.Samples)s.Observation.HitPosition.Y=0.5;
  for(const s of ground.Samples)s.Observation.HitPosition.Z=0.5;
  return [wall,ground];
}
export const demonstrationCoordinates = (scale=10)=>({originNative:[0,0,0],axes:[[1,0,0],[0,1,0],[0,0,1]],metresPerNativeUnit:scale,
  basis:'declared-demonstration-scale',reference:'original-model-assumption-not-GTA-calibration'});
export const observedInput = ()=>({groups:observedFixture(),region:{minNative:[-2,-2,-1],maxNative:[2,2,3]},listenerNative:[.3,.1,.7],
  context:{session:'synthetic-independent',build:'1.0.1158.16',interior:0,revision:1,nowMs:20},
  visibilityAssumption:'unobserved-space-assumed-clear',motionAssumption:'static-during-snapshot',
  materialsByKind:{wall:{reflection:[.85,.6,.3],transmission:[.025,.004,.0004],reference:'authored-wall-v1'},
    ground:{reflection:[.7,.45,.2],reference:'authored-ground-v1'}},engine:{order:2,airDbPerMetre:[0,0,0]}});
