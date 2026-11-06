// Original values and finite geometry only. No installed data or endpoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import {freeze,acousticScene,material} from '../src/acoustics/engine/contracts.mjs';
import {createTile,coordinateSpace,timeUnit,querySegment} from '../src/acoustics/research/local-geometry.mjs';

test('recursive-freeze reuse never trusts an external shallow freeze or loses partially shared children',()=>{
 const shared={coordinates:[1,2,3]},outer=Object.freeze({shared});
 freeze(outer);assert(Object.isFrozen(shared));assert(Object.isFrozen(shared.coordinates));
 assert.throws(()=>{shared.coordinates[0]=9;},TypeError);
 const other={shared,independent:{value:[4,5,6]}};freeze(other);freeze(other);
 assert(Object.isFrozen(other.independent.value));assert.throws(()=>{other.independent.value.push(7);},TypeError);
});

test('enumerable accessor graphs retain recursive traversal rather than falsely becoming immutable capabilities',()=>{
 const seen=[],outer={get child(){const value={points:[seen.length]};seen.push(value);return value;}};
 const parent={outer};freeze(parent);freeze(parent);
 assert.equal(seen.length,2);for(const child of seen){assert(Object.isFrozen(child));assert(Object.isFrozen(child.points));}
});

test('a Proxy value changing at the freeze boundary cannot hide an unvisited child on the next traversal',()=>{
 const original={points:[1]},substituted={points:[2]},target={child:original};let first=true;
 const proxy=new Proxy(target,{get(object,key,receiver){if(key==='child'&&first){first=false;return substituted;}return Reflect.get(object,key,receiver);}});
 freeze(proxy);assert(Object.isFrozen(substituted.points));assert.equal(Object.isFrozen(original.points),false);
 freeze(proxy);assert(Object.isFrozen(original.points));assert.throws(()=>{original.points[0]=3;},TypeError);
});

test('child freeze side effects cannot memoize an unvisited replacement in its frozen parent',()=>{
 const replacement={points:[2]},parent={};
 parent.child=new Proxy({points:[1]},{preventExtensions(target){parent.child=replacement;return Reflect.preventExtensions(target);}});
 freeze(parent);assert.equal(parent.child,replacement);assert.equal(Object.isFrozen(replacement.points),false);
 freeze(parent);assert.equal(Object.isFrozen(replacement.points),true);assert.throws(()=>{replacement.points[0]=3;},TypeError);
});

test('validated finite geometry stays deeply immutable and material checks still reject invalid coefficients',()=>{
 const input={schemaVersion:1,id:'deep-freeze-original',coordinateSpace,timeUnit,bounds:{min:[-4,-4,-4],max:[4,4,4]},listenerAnchor:[0,-1,0],coverage:'complete-synthetic',surfaces:[{id:'original-wall',coordinateSpace,center:[0,0,0],normal:[0,1,0],u:[1,0,0],half:[1,1],motion:'static',reflectiveSide:'both',provenance:{kind:'synthetic',reference:'original-only'},confidence:1,version:1,observedAt:0,validUntil:1000}],missingRegions:[],version:1,createdAt:0,validUntil:1000,build:'original',session:'original',interior:'outside',dynamicEpoch:0};
 const tile=createTile(input),scene=acousticScene(tile,{'original-wall':{reflection:[.5,.4,.3],transmission:[0,0,0],basis:'authored-assumption',reference:'original'}});
 assert.throws(()=>{tile.surfaces[0].corners[0][0]=100;},TypeError);assert.throws(()=>{scene.materials['original-wall'].reflection[0]=1.1;},TypeError);
 assert.equal(querySegment(tile,[0,-1,0],[0,1,0]).hits[0].id,'original-wall');
 assert.throws(()=>material({reflection:[1.1,0,0],transmission:[0,0,0],basis:'authored-assumption',reference:'bad'}),/energy coefficients/);
 assert.throws(()=>acousticScene(tile,{'original-wall':{reflection:[.9,.9,.9],transmission:[.2,0,0],basis:'authored-assumption',reference:'bad'}}),/energy budget/);
});
