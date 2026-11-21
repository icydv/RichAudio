// Evaluate the actual same-origin HTTP module graph with browser-like globals.
// VM modules are enabled only in this bounded test child, never the product.
import vm from 'node:vm';import assert from 'node:assert/strict';
const base=process.argv[2],origin=new URL(base);assert.equal(origin.hostname,'127.0.0.1');assert.equal(origin.protocol,'http:');
const context=vm.createContext({URL,Date,performance}),modules=new Map(),requests=[];
async function load(url){
 assert.equal(new URL(url).origin,origin.origin);if(modules.has(url))return modules.get(url);
 const response=await fetch(url,{signal:AbortSignal.timeout(3000)});assert.equal(response.status,200,url);assert.match(response.headers.get('content-type'),/javascript/);
 const source=await response.text(),module=new vm.SourceTextModule(source,{context,identifier:url});modules.set(url,module);requests.push(new URL(url).pathname);return module;
}
const model=await load(base+'/model.mjs');await model.link((specifier,parent)=>load(new URL(specifier,parent.identifier).href));await model.evaluate();
const wire=modules.get(base+'/wire-limits.mjs');assert.ok(wire);assert.equal(wire.namespace.SOUND_MAP_WIRE.installedGeometryBytes,8*1024*1024);assert.equal(wire.namespace.geometryWireBudget({geometryProfile:'installed-static-workset01',observationModel:{kind:'conditional-installed-static-model'}}).surfaces,4096);
assert.equal(model.namespace.clampFps(120),60);assert.ok(new model.namespace.VisualState());assert.deepEqual(requests.sort(),['/model.mjs','/wire-limits.mjs']);
process.stdout.write(JSON.stringify({browserModulesEvaluated:true,requests,installedSurfaces:4096,nodeGlobalsProvided:false,gameRead:false,endpointOpened:false})+'\n');
