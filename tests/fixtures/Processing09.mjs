// Wholly original finite reflector; no installed resource or audio bank loader.
import {createHash} from 'node:crypto';
import {createTile,coordinateSpace} from '../../src/acoustics/research/local-geometry.mjs';
import {acousticScene} from '../../src/acoustics/engine/contracts.mjs';
import {vehicleDistanceSceneOptions} from '../../src/acoustics/vehicle/distance-presentation.mjs';
import {createSceneTileContext03} from '../../src/acoustics/world/scene-union03.mjs';
import {budgetSession042,budgetWorld042} from './AcousticBudget042.mjs';

export function processingContexts09(){
 const surfaces=[{id:'processing09:wall',coordinateSpace,center:[0,14,2],normal:[0,-1,0],u:[1,0,0],half:[24,3],motion:'static',reflectiveSide:'both',
  provenance:{kind:'synthetic',reference:'original-processing09-finite-wall'},confidence:1,version:1,observedAt:0,validUntil:60000,material:{observedId:null,observedConfidence:null,acoustic:null}}];
 const tile=createTile({schemaVersion:1,id:'processing09',coordinateSpace,timeUnit:'monotonic-ms',bounds:{min:[-48,-32,-8],max:[48,32,16]},listenerAnchor:[0,0,1],coverage:'complete-synthetic',surfaces,missingRegions:[],version:1,createdAt:0,validUntil:60000,build:'original-processing09',session:budgetSession042,interior:'authored-fixture-only',dynamicEpoch:1});
 const materials={'processing09:wall':{reflection:[.64,.49,.25],transmission:[0,0,0],basis:'authored-assumption',reference:'original-processing09-passive-assumption'}};
 const scene=acousticScene(tile,materials,vehicleDistanceSceneOptions('authored-detail-loss-v1'));
 return [createSceneTileContext03({tileId:'processing09',worldDigest:budgetWorld042,scene,sourceBindings:[{id:'processing09:original-wall',sha256:createHash('sha256').update(JSON.stringify(surfaces)).digest('hex')}],layout:'gen9-rsc7'})];
}
