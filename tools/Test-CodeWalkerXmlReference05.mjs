// Compare CURRENT Node decoding of the fixed ORIGINAL XML corpus with one
// explicit public-CodeWalker oracle output. No paths inside the receipt are used.
import fs from 'node:fs/promises';
import path from 'node:path';
import {constants} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {decodeCodeWalkerXmlBuilding05,codeWalkerNameHash05,codeWalkerXmlSource05} from '../src/acoustics/world/codewalker-xml05.mjs';
import {entityMatrix} from '../src/acoustics/world/placements.mjs';
import {transformPoint,resourcePoint} from '../src/acoustics/world/collision-mesh.mjs';
const repository=fileURLToPath(new URL('../',import.meta.url));
export const xmlReferenceGroups05=Object.freeze(['legacy-building','gen9-building','gen9-passage','gen9-open','legacy-transform-challenge','gen9-transform-challenge','gen9-corner','gen9-corner-east','gen9-corner-wide']);
const kinds=['ymap','ytyp','ybn'],maximumReferenceBytes=1048576,sha=b=>createHash('sha256').update(b).digest('hex'),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const need=(ok,reason)=>{if(!ok)throw Error('XML05 fresh reference: '+reason);};
export function xmlReferencePath05(value){
 need(typeof value==='string','explicit reference path');const allowed=path.resolve(repository,'.local','world-03'),target=path.resolve(repository,value),relative=path.relative(allowed,target),parts=relative.split(path.sep);
 need(parts.length===2&&/^world05-[A-Za-z0-9-]+$/.test(parts[0])&&parts[1]==='reference.json'&&!relative.startsWith('..')&&!path.isAbsolute(relative),'only exact new-worktree .local/world-03/world05-*/reference.json');return target;
}
async function noLinks(file){for(let at=path.resolve(file);;at=path.dirname(at)){const s=await fs.lstat(at);need(!s.isSymbolicLink(),'linked original reference path');if(at===path.dirname(at))break;}}
async function boundedRead(file,maximum){
 await noLinks(file);const before=await fs.lstat(file);need(before.isFile()&&before.nlink===1&&before.size>0&&before.size<=maximum,'bounded single-link original artifact');
 const handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const opened=await handle.stat();need(opened.isFile()&&opened.ino===before.ino&&opened.dev===before.dev&&opened.size===before.size&&opened.mtimeMs===before.mtimeMs&&opened.nlink===1,'original artifact changed before open');const bytes=Buffer.alloc(before.size+1);let count=0;while(count<bytes.length){const read=await handle.read(bytes,count,bytes.length-count,count);if(!read.bytesRead)break;count+=read.bytesRead;}const after=await handle.stat(),current=await fs.lstat(file);need(count===before.size&&after.isFile()&&after.ino===before.ino&&after.dev===before.dev&&after.nlink===1&&after.size===before.size&&after.mtimeMs===before.mtimeMs&&current.isFile()&&current.nlink===1&&current.ino===before.ino&&current.dev===before.dev&&current.size===before.size&&current.mtimeMs===before.mtimeMs&&!current.isSymbolicLink(),'original artifact changed during bounded read');await noLinks(file);return bytes.subarray(0,count);}finally{await handle.close();}
}
function approximately(actual,expected,label){
 if(typeof actual==='number'){need(typeof expected==='number'&&Number.isFinite(expected)&&Math.abs(actual-expected)<=Math.max(.0002,Math.abs(expected)*2e-6),label+' numeric disagreement');return;}
 if(Array.isArray(actual)){need(Array.isArray(expected)&&actual.length===expected.length,label+' array disagreement');actual.forEach((x,i)=>approximately(x,expected[i],label+'['+i+']'));return;}
 if(actual&&typeof actual==='object'){need(expected&&typeof expected==='object'&&!Array.isArray(expected),label+' object disagreement');for(const k of Object.keys(actual))approximately(actual[k],expected[k],label+'.'+k);return;}
 need(actual===expected,label+' scalar disagreement');
}
export async function compareCurrentCodeWalkerXmlReference05(reference,{expectedParserSHA256}={}){
 need(expectedParserSHA256===undefined||hex(expectedParserSHA256),'explicit parser SHA-256 binding');
 need(reference?.schema===1&&reference.kind==='CodeWalker-original-XML05-reference'&&reference.passed===true&&reference.sourceAuthority==='original-authored-fixture'&&reference.parserSourceCommit===codeWalkerXmlSource05&&hex(reference.parserSHA256)&&reference.gameFilesRead===false&&reference.keysRead===false&&reference.installedEnhancedCompatibilityVerified===false,'exact original public parser receipt identity');
 if(expectedParserSHA256!==undefined)need(reference.parserSHA256===expectedParserSHA256,'fresh public-profile parser SHA-256 mismatch');
 need(Array.isArray(reference.fixtureSets)&&reference.fixtureSets.length===xmlReferenceGroups05.length&&reference.fixtureSets.every((r,i)=>r.group===xmlReferenceGroups05[i]),'exact nine original reference groups');
 const hashTexts=['Original_MixedCase05','original_mixedcase05','hash_075BCD15','hash_1',''];need(Array.isArray(reference.nameHashVectors)&&reference.nameHashVectors.length===hashTexts.length,'exact independent hash-vector set');reference.nameHashVectors.forEach((v,i)=>{need(v.text===hashTexts[i]&&v.hash===codeWalkerNameHash05(v.text),'actual CodeWalker hash-vector disagreement');});
 let resourcesChecked=0,selectedResources=0,worldVertices=0,emptySelectionRejected=0;
 for(const group of xmlReferenceGroups05){const expected=reference.fixtureSets.find(r=>r.group===group);need(Array.isArray(expected.resources)&&expected.resources.length===3&&expected.resources.every((r,i)=>r.kind===kinds[i]),group+' exact XML triplet');
  const resources=[];for(const kind of kinds){const file=path.join(repository,'tests','fixtures','CodeWalkerXml05',group,'original.'+kind+'.xml'),xml=await boundedRead(file,1048576),r=expected.resources.find(r=>r.kind===kind);need(hex(r.xmlSHA256)&&r.xmlSHA256===sha(xml)&&r.xmlBytes===xml.length,group+' current fixture byte identity');resources.push({id:kind,kind,xml,expectedSHA256:r.xmlSHA256,logicalArchive:'original-fixture.rpf',logicalMember:group+'/original.'+kind,sourceSHA256:null});resourcesChecked++;}
  const request={resources,selection:{ymapId:'ymap',ytypId:'ytyp',ybnId:'ybn',entityIndex:0,archetypeHash:123456789,physicsDictionary:987654321,collisionFrame:'archetype-local',associationEvidenceSHA256:sha(Buffer.from('original-explicit-xml-fixture-association05'))}};
  if(group==='gen9-open'){need(expected.world?.entityMissing===true&&Array.isArray(expected.world.samples)&&expected.world.samples.length===0&&expected.resources[0].data?.entities?.length===0,'actual empty-map reference');assert.throws(()=>decodeCodeWalkerXmlBuilding05(request),/selected entity index/);emptySelectionRejected++;continue;}
  const decoded=decodeCodeWalkerXmlBuilding05(request);need(decoded.supported===true&&decoded.genuineResourceVerified===false&&decoded.installedResourceVerified===false,'current decoder remains supported but uncertified');
  for(const item of decoded.resources){const oracle=expected.resources.find(r=>r.kind===item.kind),actual=item.normalized.data;need(item.normalized.sourceAuthority==='unqualified-codewalker-xml-export'&&item.xmlSHA256===oracle.xmlSHA256,'current XML DTO identity');
   if(item.kind==='ymap')approximately(actual.entities,[oracle.data.entities[0]],group+' selected entities');
   else if(item.kind==='ytyp')approximately(actual.archetypes,oracle.data.archetypes,group+' archetypes');
   else{need(actual.nodes.length===oracle.data.nodes.length,group+' node count');actual.nodes.forEach((node,index)=>{const ref=oracle.data.nodes[index];for(const key of ['id','parent','type','center','transform','vertices','polygons','materials','unsupportedBound','declaredBounds'])approximately(node[key],ref[key],group+' collision '+key);need(Array.isArray(ref.oracleSamples)&&ref.oracleSamples.length===Math.min(8,node.vertices.length),'exact immediate-parent sample count');for(const sample of ref.oracleSamples){need(Number.isInteger(sample.index)&&sample.index>=0&&sample.index<node.vertices.length,'valid parent vertex sample');approximately(transformPoint(node.vertices[sample.index].map((v,i)=>v+node.center[i]),node.transform),sample.positionInParent,group+' actual parent sample');}});}
   selectedResources++;
  }
  const collision=decoded.resources.find(r=>r.kind==='ybn').normalized.data,entity=decoded.resources.find(r=>r.kind==='ymap').normalized.data.entities[0],placement=entityMatrix(entity),world=expected.world;need(world?.entityMissing===false&&world.entityIndex===0&&world.method==='Actual YmapEntityDef Orientation/Scale/Position + BoundGeometry.GetVertexPos + ancestor Transform + SharpDX.TransformCoordinate','actual independent world API method');approximately(placement,world.entityMatrix,group+' actual entity matrix');need(Array.isArray(world.samples)&&world.samples.length===collision.nodes.reduce((n,x)=>n+x.vertices.length,0),'every actual world vertex present');const seen=new Set();
  for(const sample of world.samples){need(Number.isInteger(sample.node)&&sample.node>=0&&sample.node<collision.nodes.length,'world node index');const node=collision.nodes[sample.node];need(Number.isInteger(sample.vertex)&&sample.vertex>=0&&sample.vertex<node.vertices.length&&!seen.has(sample.node+':'+sample.vertex),'unique world vertex index');seen.add(sample.node+':'+sample.vertex);const chain=[];for(let n=node;n;n=n.parent===null?null:collision.nodes.find(p=>p.id===n.parent))chain.push(n.transform);approximately(transformPoint(resourcePoint(node.vertices[sample.vertex],node.center,chain),placement),sample.positionInWorld,group+' actual world sample');worldVertices++;}
 }
 return {schema:1,kind:'CurrentNodeCodeWalkerXmlReferenceCheck05',passed:true,parserSourceCommit:reference.parserSourceCommit,declaredParserSHA256:reference.parserSHA256,expectedParserBindingChecked:expectedParserSHA256!==undefined,groupsChecked:xmlReferenceGroups05.length,resourcesChecked,selectedResources,worldVertices,emptySelectionRejected,hashVectorsChecked:hashTexts.length,fixtureAuthority:'original-authored-fixture',genuineResourceVerified:false,installedResourceVerified:false,referenceExecutionFreshness:'supervising wrapper must bind this explicit receipt to its fresh public-reference invocation'};
}
export async function verifyCodeWalkerXmlReferenceFile05(value,options){const file=xmlReferencePath05(value),bytes=await boundedRead(file,maximumReferenceBytes),text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),reference=JSON.parse(text);const result=await compareCurrentCodeWalkerXmlReference05(reference,options);return {...result,referenceSHA256:sha(bytes)};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{need((process.argv.length===4||process.argv.length===6&&process.argv[4]==='--parser-sha256')&&process.argv[2]==='--reference','use --reference .local/world-03/world05-*/reference.json [--parser-sha256 fresh-profile-hash]');console.log(JSON.stringify(await verifyCodeWalkerXmlReferenceFile05(process.argv[3],{expectedParserSHA256:process.argv[5]})));}catch(error){console.error(error.message);process.exitCode=1;}
}
