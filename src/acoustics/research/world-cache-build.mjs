// Fit once at explicit acquisition/export time. Never imported by the cache loader.
import {performance} from 'node:perf_hooks';
import {inspectTileGroup,independentPatch} from './tile-inspection.mjs';
import {validateTile,validateWorld,digest,canonical,coordinateSpec,freeze} from './world-cache-format.mjs';
const vector=p=>[p.X,p.Y,p.Z];
export function buildPersistentTile({id,world,bounds,groups,savedUtc}){
 const started=performance.now();validateWorld(world);if(!Array.isArray(groups)||groups.length<1||groups.length>4)throw Error('bounded acquisition groups');
 const provenance=[],patches=[];for(const g of groups){const r=inspectTileGroup(g);if(r.status!=='candidate-inferred')throw Error('unqualified acquisition: '+r.reasons.join(','));const p=independentPatch(g,r);
  provenance.push({id:g.Name,session:g.Session,generation:g.Generation,interior:g.Interior,observedMonotonicMs:g.FinishedMs,observedUtc:g.Samples[0].Observation.StartedUtc??null,sourceFingerprint:digest(g),kind:g.Kind,observationCount:9,streamingGeneration:'unavailable'});
  patches.push({id:p.Id,group:g.Name,basis:'inferred',originalState:'observed-support-only',center:vector(p.Center),normal:vector(p.Normal),footprint:p.Footprint.map(vector),maxResidual:r.plane.maxResidual,rms:r.plane.rms,planeTolerance:r.plane.planeTolerance,arithmeticTolerance:r.plane.maxPositionTolerance,normalDegrees:r.plane.maxNormalDegrees,material:'unknown',permanence:'unverified',sourceIds:g.Samples.map(s=>s.Id)});
 }
 const tile={version:1,id,world:structuredClone(world),bounds:structuredClone(bounds),savedUtc,groups:provenance,patches,unknown:'between-rays-and-beyond-support',widerConnectivity:null};validateTile(tile);return {tile:freeze(JSON.parse(canonical(tile))),reconstructionCalls:groups.length,reconstructionMs:performance.now()-started,coordinates:coordinateSpec};
}
