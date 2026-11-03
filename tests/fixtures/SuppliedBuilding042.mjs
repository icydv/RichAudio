// Original numeric authoring only. No supplied real export, asset or parser is
// read. The generated RSC7-shaped carriers and normalized DTOs are portable
// contract fixtures, not actual CodeWalker serialization/parsing evidence.
import {authorSuppliedBuildingFixture042} from '../../src/acoustics/world/supplied-building042.mjs';
import {identity} from '../../src/acoustics/world/collision-mesh.mjs';
export function suppliedBuildingSpec042(){return {id:'original-supplied042',buildings:[{id:'west',translation:[-12,0,0],rotation:[0,0,0,1],scaleXY:1,scaleZ:1,geometryCenter:[0,0,0],collisionRootTransform:[...identity],interior:true},{id:'east',translation:[4,0,0],rotation:[0,0,0,1],scaleXY:1,scaleZ:1,geometryCenter:[0,0,0],collisionRootTransform:[...identity],interior:true}]};}
export function suppliedBuildingFixture042(change=()=>{}){const spec=suppliedBuildingSpec042();change(spec);return authorSuppliedBuildingFixture042(spec);}
