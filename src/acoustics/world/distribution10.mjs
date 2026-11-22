// RichAudio-owned distribution boundary. No vendor code, key loader or downloader.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {boundedStartupMetadata06} from './startup-catalogue06.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex'),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const names=Object.freeze(['CodeWalker.Core.dll','SharpDX.dll','SharpDX.Mathematics.dll','RichAudio.CodeWalkerApiAdapter10.dll']);
const system=new Set(['mscorlib','System','System.Core','System.Drawing','System.Xml','System.Xml.Linq','System.Runtime.Serialization','System.IO.Compression','System.Web.Extensions','System.Runtime','System.Collections','System.Numerics','netstandard']);
const check=(ok,text)=>{if(!ok)throw Error(text);};
function options10(value,allowed){check(value&&Object.getPrototypeOf(value)===Object.prototype,'plain distribution options required');const out={};for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);check(typeof key==='string'&&allowed.includes(key)&&d.enumerable&&Object.hasOwn(d,'value'),'distribution options must be closed data properties');out[key]=d.value;}return out;}
function snapshot(value){boundedStartupMetadata06(value,262144);return structuredClone(value);}
export const minimalCoreRuntimeFiles10=names;
export function inspectCoreDistribution10(options={}){
 const {audit=null,review=null,reviewBytes=null,expectedReviewSHA256=null}=options10(options,['audit','review','reviewBytes','expectedReviewSHA256']);
 const blocked=reasons=>Object.freeze({schema:1,kind:'RichAudioCoreDistributionPolicy10',state:'blocked',reasons:Object.freeze(reasons),vendorSourceIncluded:false,fullApplicationIncluded:false,proprietaryDataIncluded:false,legalClearanceVerified:false,sourceFilesOpened:0});
 if(!audit||!review||!Buffer.isBuffer(reviewBytes)||!hex(expectedReviewSHA256))return blocked(['qualified-standard-Core-artifact-and-independent-review-missing']);
 const a=snapshot(audit),r=snapshot(review);check(reviewBytes.length>0&&reviewBytes.length<=65536&&hash(reviewBytes)===expectedReviewSHA256,'exact external review receipt required');
 check(JSON.stringify(JSON.parse(reviewBytes.toString('utf8')))===JSON.stringify(r),'review bytes must describe the supplied review');
 if(!Array.isArray(a.files)||!Array.isArray(r.files)||!Array.isArray(r.notices))return blocked(['complete-runtime-and-notice-arrays-required']);
 const reasons=[];
 if(a.kind!=='RichAudioCodeWalkerApiAudit10'||!a.passed||a.binaryRole!=='standard-core-candidate')reasons.push('standard-precompiled-Core-metadata-not-qualified');
 if(a.features?.researchAugmentationMarkers?.length)reasons.push('modified-research-Core-is-not-distributable-under-this-profile');
 if(r.kind!=='RichAudioCoreDistributionReview10'||r.scope!=='official-unmodified-Core-without-proprietary-payload'||r.independentReview!==true||r.sourcePublisher!=='dexyfex'||r.opaqueBootstrapExcluded!==true||r.gameAssetsAndKeysExcluded!==true||r.vendorSourceExcluded!==true)reasons.push('exact-vendor-origin-and-no-secret-review-required');
 if(!Array.isArray(a.files)||a.files.length!==4||new Set(a.files.map(f=>f.file)).size!==4||!names.every(n=>a.files.some(f=>f.file===n)))reasons.push('exact-four-runtime-DLL-metadata-required');
 const pins=[];
 for(const file of a.files??[]){
  if(!names.includes(file.file)||file.name!==file.file.slice(0,-4)||!hex(file.sha256)||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>(file.file===names[3]?16777216:67108864)){reasons.push('bounded-runtime-file-pin-required');continue;}
  if(!Array.isArray(file.manifestResources)||file.manifestResources.length)reasons.push('embedded-resource-payload-remains-unqualified');
  if(!Array.isArray(file.references)||file.references.some(ref=>!system.has(ref.name)&&!['CodeWalker.Core','SharpDX','SharpDX.Mathematics'].includes(ref.name)))reasons.push('unreviewed-transitive-runtime-dependency');
  const pin=r.files?.find(p=>p.file===file.file);if(!pin||pin.sha256!==file.sha256||pin.bytes!==file.bytes)reasons.push('review-does-not-bind-audited-vendor-file');
  pins.push({file:file.file,bytes:file.bytes,sha256:file.sha256});
 }
 if(r.files?.length!==4||new Set(r.files?.map(f=>f.file)).size!==4)reasons.push('extra-or-missing-runtime-file');
 if(pins.reduce((sum,p)=>sum+p.bytes,0)>134217728)reasons.push('component-aggregate-byte-cap');
 if(!a.features?.publicYmapLoadBytes||!a.features?.publicYtypLoadBytes||!a.features?.publicYbnLoadBytes||!a.features?.publicGen9Selector)reasons.push('required-public-resource-API-missing');
 const mandatoryNotices=['CodeWalker.Notice.txt','CodeWalker.Readme_Src.txt','CodeWalker.PERMISSION.txt','SharpDX.LICENSE'];
 if(r.notices.length<4||r.notices.length>8||!mandatoryNotices.every(file=>r.notices.some(n=>n.file===file))||r.notices.some(n=>!/^[-A-Za-z0-9_.]+\.(?:txt|LICENSE)$/.test(n.file)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(n.file)||!hex(n.sha256)||!Number.isInteger(n.bytes)||n.bytes<1||n.bytes>1048576)||new Set(r.notices.map(n=>n.file.toLowerCase())).size!==r.notices.length)reasons.push('exact-required-notices-not-bound');
 // These are externally reviewed assertions, never inferred from file count,
 // attribution, a successful API call, or this packaging tool's own output.
 const third=r.thirdPartyReview;
 if(r.noticeCompletenessQualified!==true||!third||third.scope!=='exact-Core-and-transitive-closure'||third.obligationsSatisfied!==true||third.sourceRedistributionRequired!==false||!hex(third.evidenceSHA256)||typeof third.fbxPresent!=='boolean'||(third.fbxPresent&&!r.notices.some(n=>n.file==='FBX.LICENSE')))reasons.push('exact-third-party-obligations-review-required');
 if(reasons.length)return blocked([...new Set(reasons)]);
 return Object.freeze({schema:1,kind:'RichAudioCoreDistributionPolicy10',state:'reviewed-inputs-required',files:Object.freeze(pins.map(Object.freeze)),notices:Object.freeze(r.notices.map(n=>Object.freeze({...n}))),reviewSHA256:expectedReviewSHA256,vendorSourceIncluded:false,fullApplicationIncluded:false,proprietaryDataIncluded:false,legalClearanceVerified:false,sourceFilesOpened:0});
}
async function noLinks(file){for(let p=path.resolve(file);;p=path.dirname(p)){const s=await fs.lstat(p);check(!s.isSymbolicLink(),'linked component input/output refused');if(path.dirname(p)===p)break;}}
async function existingParentsNoLinks(file){for(let p=path.resolve(file);;p=path.dirname(p)){try{const s=await fs.lstat(p);check(!s.isSymbolicLink(),'linked component input/output refused');}catch(error){if(error.code!=='ENOENT')throw error;}if(path.dirname(p)===p)break;}}
async function exactRead(file,pin){await noLinks(file);const handle=await fs.open(file,'r');try{const before=await handle.stat();check(before.isFile()&&before.nlink===1&&before.size===pin.bytes,'exact regular component input');const bytes=Buffer.alloc(pin.bytes);let at=0;while(at<bytes.length){const r=await handle.read(bytes,at,Math.min(65536,bytes.length-at),at);check(r.bytesRead>0,'short component input');at+=r.bytesRead;}const extra=await handle.read(Buffer.alloc(1),0,1,at);check(extra.bytesRead===0&&hash(bytes)===pin.sha256,'component input digest mismatch');const after=await handle.stat();check(after.ino===before.ino&&after.dev===before.dev&&after.size===before.size&&after.mtimeMs===before.mtimeMs,'component input changed');await noLinks(file);return bytes;}finally{await handle.close();}}
export async function packageCoreRuntime10(options={}){
 const {audit,review,reviewBytes,expectedReviewSHA256,inputRoot,noticesRoot,outputRoot}=options10(options,['audit','review','reviewBytes','expectedReviewSHA256','inputRoot','noticesRoot','outputRoot']);
 // A failed policy does not probe an installation, source directory or DLL.
 const policy=inspectCoreDistribution10({audit,review,reviewBytes,expectedReviewSHA256});if(policy.state==='blocked')return policy;
 const output=path.resolve(outputRoot),local=path.join(root,'.local')+path.sep;check(output.startsWith(local),'fresh checkout-local component output required');
 try{await fs.lstat(output);throw Error('fresh component output required');}catch(error){if(error.code!=='ENOENT')throw error;}
 const parent=path.dirname(output);await existingParentsNoLinks(parent);await fs.mkdir(parent,{recursive:true});await noLinks(parent);
 const inputs=[];for(const pin of policy.files)inputs.push([pin,await exactRead(path.join(path.resolve(inputRoot),pin.file),pin)]);
 for(const pin of policy.notices)inputs.push([{...pin,file:'notices/'+pin.file},await exactRead(path.join(path.resolve(noticesRoot),pin.file),pin)]);
 await fs.mkdir(output);await fs.mkdir(path.join(output,'notices'));
 for(const [pin,bytes]of inputs)await fs.writeFile(path.join(output,pin.file),bytes,{flag:'wx'});
 const manifest={schema:1,kind:'RichAudioMinimalCoreRuntime10',reviewSHA256:policy.reviewSHA256,files:inputs.map(([p])=>p),vendorDlls:3,ownedAdapterDlls:1,vendorSourceIncluded:false,fullApplicationIncluded:false,bootstrapMaterialIncluded:false,gameAssetsOrKeysIncluded:false,legalClearanceVerified:false,installedWorldQualified:false,deployed:false};
 await fs.writeFile(path.join(output,'runtime-manifest10.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return Object.freeze({...manifest,state:'prepared-from-externally-reviewed-inputs'});
}
