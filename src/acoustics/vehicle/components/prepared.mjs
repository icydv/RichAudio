// Authored stationary vehicle-event bridge to LATENCY-02's existing prepared
// kernel path. Preparation is off the output callback; no native event is read.
import {createHash} from 'node:crypto';
import {createPreparedTransientKernel} from '../../events/prepared-path.mjs';
import {componentIdentity,componentSourceId,requireAuthoredComponentCapability,requireComponent,freezeComponent} from './contracts.mjs';
import {OriginalComponentSource} from './source.mjs';
export function createPreparedMechanicalComponent({capability,identity,sourcePose,listenerPose,scene=null,sceneId,sceneGeneration=1,
 kind='gear-clunk',strength=.8,amplitude=.25}={}) {
 const context=requireAuthoredComponentCapability(capability),owner=componentIdentity(identity);
 requireComponent(owner.session===context.session&&owner.component==='mechanical-clunk'&&context.maximumFrame>=16383&&
  sourcePose?.generation===owner.componentGeneration&&Number.isFinite(amplitude)&&amplitude>0&&amplitude<=.25,
  'Exact authored mechanical identity, whole prepared-window horizon and generation required');
 requireComponent(scene===null||scene.tile?.session===owner.session,'Prepared component scene must match its authored session');
 const source=new OriginalComponentSource('mechanical-clunk');source.setState({});
 source.trigger({eventId:'prepared-original-mechanical-shape',sequence:0,occurrenceFrame:0,observedFrame:0,strength,kind},0);
 const dry=new Float32Array(4800),block=new Float32Array(512);
 for(let at=0;at<dry.length;at+=512){const count=Math.min(512,dry.length-at);source.renderInto(block,count);dry.set(block.subarray(0,count),at);}
 const drySha256=createHash('sha256').update(Buffer.from(dry.buffer)).digest('hex');
 const kernel=createPreparedTransientKernel({scene,sceneId,sceneGeneration,session:owner.session,sourcePose,listenerPose,
  frames:16384,amplitude,masterGain:.7,authority:'authored-fixture-only',waveformId:'component-'+kind+'-original-02',dryWaveform:dry});
 requireComponent(kernel.waveformSha256===drySha256&&kernel.waveformFrames===dry.length,
  'Existing arbitrary-waveform acoustic preparation must preserve the complete original component source');
 return freezeComponent({identity:owner,sourceId:componentSourceId(owner),component:owner.component,sourceFrames:dry.length,
  drySha256,kind,strength,kernel,authority:context.authority,productionEnabled:false,nativeSuppression:false,
  timingPolicy:'timestamped-event-with-physical-propagation-no-retrospective-vehicle-history',
  geometryPolicy:'separately-qualified-stationary-authored-pose-only',extraFixedQueueFrames:0});
}
