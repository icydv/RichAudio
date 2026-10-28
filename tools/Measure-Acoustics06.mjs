// Independent measurements for the public scalar evidence. Reads only generated synthetic outputs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTile } from "../src/acoustics/research/local-geometry.mjs";
import { sceneInput } from "../tests/fixtures/acoustics-scenes.mjs";
import {
  acousticScene,
  trajectory,
  ownedSource,
} from "../src/acoustics/engine/contracts.mjs";
import { prepare, render } from "../src/acoustics/engine/renderer.mjs";
import { signal } from "../src/acoustics/engine/signals.mjs";
import { demo } from "./acoustics-06-scenes.mjs";
import { solvePath } from "../src/acoustics/engine/paths.mjs";
import { privateStoragePath } from "../src/acoustics/research/research-private-storage.mjs";

export function measure() {
  const input = sceneInput();
  input.bounds = { min: [-125, -30, -2], max: [125, 30, 12] };
  input.surfaces = [];
  input.validUntil = 1000000;
  const scene = acousticScene(
      createTile(input),
      {},
      { order: 0, airDbPerMetre: [0, 0, 0] },
    ),
    cases = [
      ["stationary", 50, 50, 0, 0, 1000],
      ["approach", 100, 10, 0, 0, (1000 * 343) / 313],
      ["departure", 10, 100, 0, 0, (1000 * 343) / 373],
      ["moving-listener", 100, 100, 0, 90, (1000 * 373) / 343],
    ],
    doppler = [];
  for (const [name, s0, s1, l0, l1, expectedHz] of cases) {
    const source = ownedSource({
        id: name,
        pcm: signal("tone", 3, { frequency: 1000 }),
        track: trajectory([
          { time: 0, position: [s0, 0, 1] },
          { time: 3, position: [s1, 0, 1] },
        ]),
      }),
      listener = trajectory([
        { time: 0, position: [l0, 0, 1] },
        { time: 3, position: [l1, 0, 1] },
      ]),
      x = render(prepare(scene, [source], listener, { duration: 3 })).right,
      crossings = [];
    for (let i = 48001; i < 96000; i++)
      if (x[i - 1] <= 0 && x[i] > 0)
        crossings.push(i - 1 - x[i - 1] / (x[i] - x[i - 1]));
    const observedHz =
      ((crossings.length - 1) * 48000) / (crossings.at(-1) - crossings[0]);
    doppler.push({
      name,
      expectedHz,
      observedHz,
      errorHz: observedHz - expectedHz,
    });
  }
  const d = demo("flyby"),
    p = prepare(d.scene, [d.source], d.listener, { duration: 13 }),
    track = p.prepared[0].tracks.find((t) => t.id === "direct");
  let maximumDelayInterpolationErrorSamples = 0;
  for (let i = 220; i < 260; i++) {
    const exact = solvePath(
      d.scene,
      d.source,
      d.listener,
      ((i + 0.5) * p.step) / 48000,
      { id: "direct", surfaces: [] },
    );
    maximumDelayInterpolationErrorSamples = Math.max(
      maximumDelayInterpolationErrorSamples,
      Math.abs(
        (track.entries[i].emissionTime + track.entries[i + 1].emissionTime) /
          2 -
          exact.emissionTime,
      ) * 48000,
    );
  }
  return {
    version: 1,
    sampleRate: 48000,
    soundSpeedMetresPerSecond: 343,
    direct: {
      distanceMetres: 10,
      delaySeconds: 10 / 343,
      arrivalSample: (48000 * 10) / 343,
    },
    ground: {
      distanceMetres: Math.sqrt(104),
      delaySeconds: Math.sqrt(104) / 343,
      arrivalSample: (48000 * Math.sqrt(104)) / 343,
      excessMilliseconds: ((Math.sqrt(104) - 10) * 1000) / 343,
    },
    twoWallBounces: { distanceMetres: 26, delaySeconds: 26 / 343 },
    doppler,
    maximumDelayInterpolationErrorSamples,
    maximumRetardedResidualSeconds: p.stats.maximumRetardedResidual,
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = path.resolve(fileURLToPath(new URL("..", import.meta.url))),
    output = privateStoragePath(
      root,
      path.resolve(root, process.argv[2] ?? ".local/acoustics-06-physics.json"),
    );
  if (fs.existsSync(output)) throw Error("fresh measurement output required");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const result = measure();
  fs.writeFileSync(output, JSON.stringify(result, null, 2), { flag: "wx" });
  console.log(JSON.stringify(result, null, 2));
}
