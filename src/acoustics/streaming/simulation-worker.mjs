import { parentPort, workerData } from "node:worker_threads";
import { fixture } from "../../../tools/acoustics-06-scenes.mjs";
import { CausalSimulation } from "./causal.mjs";

// This worker alone performs geometry and history construction. The PCM producer
// sends one bounded request at a time; no future trajectory is supplied.
const simulation = new CausalSimulation(fixture(workerData.scene).scene);
parentPort.on("message", (message) => {
  const started = performance.now();
  try {
    if (message.snapshot) simulation.observe(message.snapshot);
    const control = simulation.update(message.now);
    parentPort.postMessage({
      id: message.id,
      control,
      milliseconds: performance.now() - started,
    });
  } catch (error) {
    parentPort.postMessage({ id: message.id, error: error.message });
  }
});
