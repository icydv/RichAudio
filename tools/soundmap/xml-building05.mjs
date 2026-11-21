// Presentation/controller for the existing XML->tile->scene->solver pipeline.
// Inspection context never supplies surfaces or paths to an acoustic renderer.
import {prepareXmlBuildingPipeline05} from '../../src/acoustics/world/xml-building05.mjs';
import {verifyXmlAdmission05,inspectXmlGeometry05} from '../../src/acoustics/world/xml-evidence05.mjs';
import {CausalSimulation} from '../../src/acoustics/streaming/causal.mjs';
import {SoundMapTelemetry} from '../../src/acoustics/streaming/soundmap-telemetry.mjs';
import {vehicleDistanceSceneOptions} from '../../src/acoustics/vehicle/distance-presentation.mjs';
import {requireWorld,digest,freeze} from '../../src/acoustics/world/contracts.mjs';
import {MODEL_SPACE,parseVisualContext} from './ui/model.mjs';
import {ownedCleanup042} from './supplied-building042.mjs';
import {startReadOnlyInspection05} from './read-only-inspection05.mjs';
const views=new WeakSet();
const calibration={originNative:[0,0,0],axes:[[1,0,0],[0,1,0],[0,0,1]],metresPerNativeUnit:1,basis:'declared-inspection-model-only',reference:'XML05-no-physical-calibration',physicalCalibration:false};
function context05({inspection,witness=null,geometry=null}){
 const region=witness?.bounds??{min:inspection.geometryBounds.min.map(v=>v-1),max:inspection.geometryBounds.max.map(v=>v+1)};
 const vertices=witness?[]:inspection.triangles.flatMap(t=>t.positions),faces=witness?[]:inspection.triangles.map((_,i)=>[i*3,i*3+1,i*3+2]);
 const packet={schemaVersion:1,kind:'richaudio-visual-context',coordinateSpace:MODEL_SPACE,acousticUse:false,knowledge:'historical',calibration:witness?(geometry.calibration??geometry.observationModel?.calibration??null):calibration,provenance:{kind:witness?.authority==='original-reference-fixture'?'original-synthetic':'private-simplified-collision',reference:'xml05-inspection-only'},inspection05:{mode:witness?'admitted-xml05':'unqualified-xml05',anchor:region.min.map((v,i)=>(v+region.max[i])/2),modelSessionId:geometry?.sessionId??null,modelStreamId:geometry?.streamId??null,geometryGeneration:geometry?.generation??null},tiles:[{id:witness?.tileId??'xml05-unqualified',bounds:region,vertices,faces,showBounds:true,classification:witness?'admitted-boundary':'unknown-inspection'}]};
 return parseVisualContext(JSON.stringify(packet));
}
export async function prepareXmlBuildingView05({decoded,admission=null,inputs,session,store=null,trustedArtifacts={},virtualMotion='orbit'}={}){
 requireWorld(['orbit','stationary-beside'].includes(virtualMotion),'explicit virtual inspection motion');
 const witness=admission?verifyXmlAdmission05(admission):null;
 if(witness)requireWorld(decoded?.resources?.length===3&&new Set(decoded.resources.map(r=>r.id)).size===3&&digest(decoded.selection)===digest(witness.selection)&&witness.resources.every(r=>decoded.resources.some(d=>d.id===r.id&&d.kind===r.kind&&d.bytes===r.xmlBytes&&d.sourceSHA256===r.rawSourceSHA256&&d.xmlSHA256===r.xmlSHA256&&d.logicalArchive===r.logicalArchive&&d.logicalMember===r.logicalMember&&digest(d.normalized)===r.decodedSHA256)),'exact presentation/export/DTO admission binding');
 let pipeline=null,closed=false,sample=null,step=null,context,release,inspection;
 try{
 if(witness){
  pipeline=await prepareXmlBuildingPipeline05({admissions:admission,inputs,session,store,trustedArtifacts,engine:vehicleDistanceSceneOptions('authored-detail-loss-v1')});
  // Read already converted cached supports; never reconvert collision or XML
  // merely to choose a presentation camera/virtual-source trajectory.
  const points=pipeline.scene.tile.surfaces.flatMap(s=>s.footprint?s.footprint.map(p=>s.center.map((v,i)=>v+s.u[i]*p[0]+s.v[i]*p[1])):s.corners),support={min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))};
  const center=support.min.map((v,i)=>(v+support.max[i])/2),radius=Math.max(support.max[0]-support.min[0],support.max[1]-support.min[1])/2+4,z=support.min[2]+1;
  const listener=[center[0],center[1]-radius-2,z];
  requireWorld([0,1].every(i=>center[i]-radius-1>witness.bounds.min[i]&&center[i]+radius+1<witness.bounds.max[i])&&listener.every((v,i)=>v>witness.bounds.min[i]&&v<witness.bounds.max[i])&&z+.65<witness.bounds.max[2],'declared tile contains the authored virtual trajectory');
  inspection={kind:'cached-XML-display-supports05',entity:decoded.resources.find(r=>r.kind==='ymap').normalized.data.entities[0],geometryBounds:support,triangles:[],unknown:pipeline.scene.tile.missingRegions};
  const simulation=new CausalSimulation(pipeline.scene),telemetry=new SoundMapTelemetry({enabled:true,fps:20});let firstGeometry=null;
  step=(time,producedAtUnixMs=Date.now())=>{
   requireWorld(!closed&&Number.isFinite(time)&&time>=0&&time<=120,'open bounded virtual Bati trajectory');
   const angle=-Math.PI/2+(virtualMotion==='orbit'?Math.max(0,time-20)*.06:0),position=[center[0]+radius*Math.cos(angle),center[1]+radius*Math.sin(angle),z];
   const forward=[-Math.sin(angle),Math.cos(angle),0],up=[0,0,1],sources=['engine','exhaust'].map((role,i)=>({id:'stock:slot0:'+role,generation:1,position:position.map((v,k)=>v+forward[k]*(i?-.75:.35)+up[k]*(i?.3:.65)),forward:forward.map(v=>i?-v:v),up,directivity:i?.65:.1}));
   telemetry.begin(simulation,time*1000);simulation.observe({time,session,generation:1,listener:{position:listener,forward:[0,1,0],up},sources});const control=simulation.update(time,{geometryTimeMs:time*1000});
   const packet=telemetry.publish(simulation,control,{producedAtUnixMs});firstGeometry=packet.soundMapGeometry??firstGeometry;
   return {control,...packet,soundMapGeometry:firstGeometry};
  };
  for(let i=0;i<=6;i++)sample=step(i*.05);
  requireWorld(sample.soundMapFrame&&sample.soundMapGeometry,'actual solver/geometry publication');
  context=context05({inspection,witness,geometry:sample.soundMapGeometry});
 }else {inspection=inspectXmlGeometry05(decoded);requireWorld(inspection.geometryBounds,'finite supplied inspection geometry or envelope');context=context05({inspection});}
 const entity=inspection.entity,info=freeze({kind:'RichAudioXmlBuildingView05',qualified:!!witness,originalFixture:witness?.authority==='original-reference-fixture',qualification:witness?.authority??'unqualified-inspection-only',viewerCanPublishAcoustics:false,genuineResourceVerified:false,installedWorldVerified:false,runtimeActivationVerified:false,geometryFormat:'actual-CodeWalker-XML',source:'virtual-Bati-controller; analytic-bank-only-in-offline-PCM-comparisons',buildings:[{buildingId:witness?.buildingId??'supplied-unqualified',tileId:witness?.tileId??'xml05-unqualified',position:entity.position,storedQuaternion:entity.rotation,scale:[entity.scaleXY,entity.scaleXY,entity.scaleZ],collisionFrame:decoded.selection.collisionFrame,bounds:witness?.bounds??context.tiles[0].bounds}],resources:decoded.resources.map(r=>({id:r.id,kind:r.kind,logicalArchive:r.logicalArchive,logicalMember:r.logicalMember,xmlSHA256:r.xmlSHA256,xmlBytes:r.bytes,rawSourceSHA256:r.sourceSHA256})),unknown:[...inspection.unknown.map(r=>r.family),'Outside finite supplied geometry; runtime activation and unmeasured material response remain unknown'],cache:pipeline?{format:'existing-resource-cache04',artifacts:pipeline.artifactBindings,stats:{...pipeline.builder.stats}}:null});
 release=ownedCleanup042([async()=>{closed=true;},async()=>{if(pipeline)await pipeline.close();}]);
 const view={info,context,pipeline,inspection,sample,step,close:()=>release(),get closed(){return closed;}};views.add(view);return view;
 }catch(error){if(pipeline)try{await pipeline.close();}catch(cleanup){throw new AggregateError([error,cleanup],'XML view and cleanup failed');}throw error;}
}
export async function startXmlBuildingService05({view,root,port=0}={}){
 requireWorld(views.has(view)&&!view.closed,'branded open XML view');
 return startReadOnlyInspection05({root,port,info:view.info,context:view.context,initialSample:view.sample,canPublish:()=>views.has(view)&&!view.closed&&view.info.qualified});
}
