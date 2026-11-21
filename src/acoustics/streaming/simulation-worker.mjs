import { parentPort, workerData } from "node:worker_threads";
import { fixture } from "../../../tools/acoustics-06-scenes.mjs";
import { CausalSimulation } from "./causal.mjs";
import { ObservedSimulationInput } from './observed-live.mjs';
import {AcousticAcceleration} from './acoustic-backend.mjs';
import {AcousticQualityController,validateAcousticSettings} from './acoustic-quality.mjs';
import {scenario} from '../../../tools/acoustics-08-2-scenes.mjs';

// This worker alone performs geometry and history construction. The PCM producer
// sends one bounded request at a time; no future trajectory is supplied.
const simulation = new CausalSimulation(workerData.geometry ? null : workerData.acousticBenchmark?scenario(workerData.acousticBenchmark,{sources:workerData.sourceIds.length}).scene:fixture(workerData.scene).scene,
  {allowMissingScene:Boolean(workerData.geometry)});
const observed=workerData.geometry?new ObservedSimulationInput(simulation,workerData.sourceIds):null;
const initial=workerData.acousticSettings?validateAcousticSettings(workerData.acousticSettings):null;
const quality=initial?new AcousticQualityController({selected:initial.acousticQuality}):null;
const acceleration=initial?new AcousticAcceleration({mode:initial.acousticAcceleration}):null;
let settingsRevision=0,busy=false;
let processingPreferences=initial;
process.on('exit',()=>acceleration?.close());
parentPort.on("message", async (message) => {
  if(message.type==='acoustic-shutdown'){acceleration?.close();parentPort.postMessage({type:'acoustic-shutdown'});return;}
  if(busy){parentPort.postMessage({id:message.id,error:'Bounded simulation request already occupied'});return;}
  busy=true;
  const started = performance.now();
  try {
    if(message.acousticSettings){
      if(!quality||!acceleration||!Number.isSafeInteger(message.acousticSettings.revision)||message.acousticSettings.revision<=settingsRevision)
        throw Error('Acoustic settings revision or startup capacity');
      const {revision,quality:requestedQuality,acceleration:requestedAcceleration,...preferences}=message.acousticSettings;
      const s=validateAcousticSettings({...preferences,acousticQuality:requestedQuality,acousticAcceleration:requestedAcceleration});
      processingPreferences=s;
      quality.select(s.acousticQuality);acceleration.setMode(s.acousticAcceleration);settingsRevision=message.acousticSettings.revision;
    }
    if(quality){
      if(message.acousticFeedback)quality.observe(message.acousticFeedback);
      const active=quality.diagnostics();simulation.setProcessingSettings({pathBudget:active.pathBudget,maxReflectors:active.reflectorBudget,
        earlyReflections:processingPreferences.earlyReflections});
    }
    let control;
    if(observed){
      const anchor=()=>{
        if(!message.anchor || workerData.controlledClock)return message.anchor;
        // These threads share one Node process monotonic clock. Unlike RPH's
        // plugin-relative stopwatch, this measures queue/solve time directly.
        if(!/^\d{1,24}$/.test(message.anchor.dispatchNs??''))return {...message.anchor,clockError:'Worker dispatch clock missing'};
        const elapsed=Number(process.hrtime.bigint()-BigInt(message.anchor.dispatchNs))/1e6;
        if(elapsed<0||elapsed>250)return {...message.anchor,clockError:'Worker dispatch clock/freshness'};
        return {...message.anchor,queueAgeMs:message.anchor.queueAgeMs+elapsed,
          queueUncertaintyMs:message.anchor.dispatchUncertaintyMs??0};
      };
      observed.consume(message.geometryEvents??[],anchor(),message.now);
      control=acceleration?await observed.updateAccelerated(message.snapshot,anchor(),message.now,acceleration,anchor):observed.update(message.snapshot,anchor(),message.now);
    }else{
      if (message.snapshot) simulation.observe(message.snapshot);
      control = acceleration?await simulation.updateAccelerated(message.now,{},acceleration):simulation.update(message.now);
    }
    if(quality)control.acoustic={...quality.diagnostics(),...acceleration.diagnostics(),settingsRevision,
      richAudioEnabled:processingPreferences.richAudioEnabled,outputLevel:processingPreferences.outputLevel,
      earlyReflections:processingPreferences.earlyReflections,diagnosticsOverlay:processingPreferences.diagnosticsOverlay,
      dopplerProcessing:'propagation-coupled',dopplerBypassSupported:false,
      actualPathCount:control.paths.length,sourceCount:Object.keys(control.sourceGenerations).length,
      availablePaths:simulation.availablePaths??0,maximumReflectionOrder:2,lateReverberation:'not-implemented'};
    parentPort.postMessage({
      id: message.id,
      control,
      milliseconds: performance.now() - started,
    });
  } catch (error) {
    parentPort.postMessage({ id: message.id, error: error.message });
  }finally{busy=false;}
});
