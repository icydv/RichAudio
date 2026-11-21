import { parentPort, workerData } from "node:worker_threads";
import { fixture } from "../../../tools/acoustics-06-scenes.mjs";
import { CausalSimulation } from "./causal.mjs";
import { ObservedSimulationInput } from './observed-live.mjs';

// This worker alone performs geometry and history construction. The PCM producer
// sends one bounded request at a time; no future trajectory is supplied.
const simulation = new CausalSimulation(workerData.geometry ? null : fixture(workerData.scene).scene,
  {allowMissingScene:Boolean(workerData.geometry)});
const observed=workerData.geometry?new ObservedSimulationInput(simulation,workerData.sourceIds):null;
parentPort.on("message", (message) => {
  const started = performance.now();
  try {
    let control;
    if(observed){
      const anchor=()=>{
        if(!message.anchor || workerData.controlledClock)return message.anchor;
        // These threads share one Node process monotonic clock. Unlike RPH's
        // plugin-relative stopwatch, this measures queue/solve time directly.
        if(!/^\d{1,24}$/.test(message.anchor.dispatchNs??''))return {...message.anchor,clockError:'Worker dispatch clock missing'};
        const elapsed=Number(process.hrtime.bigint()-BigInt(message.anchor.dispatchNs))/1e6;
        if(elapsed<0||elapsed>250)return {...message.anchor,clockError:'Worker dispatch clock/freshness'};
        return {...message.anchor,queueAgeMs:message.anchor.queueAgeMs+elapsed};
      };
      observed.consume(message.geometryEvents??[],anchor(),message.now);
      control=observed.update(message.snapshot,anchor(),message.now);
    }else{
      if (message.snapshot) simulation.observe(message.snapshot);
      control = simulation.update(message.now);
    }
    parentPort.postMessage({
      id: message.id,
      control,
      milliseconds: performance.now() - started,
    });
  } catch (error) {
    parentPort.postMessage({ id: message.id, error: error.message });
  }
});
