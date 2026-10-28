// Original synthetic scenes. Names select input geometry only; the DSP never receives scene names.
import { createTile } from "../src/acoustics/research/local-geometry.mjs";
import { patch, sceneInput } from "../tests/fixtures/acoustics-scenes.mjs";
import {
  acousticScene,
  material,
  trajectory,
  ownedSource,
} from "../src/acoustics/engine/contracts.mjs";
import { signal } from "../src/acoustics/engine/signals.mjs";
export const hard = material({
  reflection: [0.88, 0.75, 0.52],
  transmission: [0.01, 0.005, 0.001],
});
export const ground = material({ reflection: [0.7, 0.5, 0.25] });
export function fixture(name = "open-road", { order = 2 } = {}) {
  const input = sceneInput(
    name === "urban-street" ? "urban-street" : "open-road",
  );
  input.validUntil = 1000000;
  if (name === "obstructed-corner")
    input.surfaces.push(
      patch("screen", [0, 0, 3], [1, 0, 0], [0, 1, 0], [2, 3], {
        reflectiveSide: "both",
      }),
      patch("corner-reflector", [0, 6, 4], [0, -1, 0], [1, 0, 0], [16, 4]),
    );
  if (name === "enclosure")
    input.surfaces.push(
      patch("north", [0, 6, 4], [0, -1, 0], [1, 0, 0], [18, 4]),
      patch("south", [0, -6, 4], [0, 1, 0], [1, 0, 0], [18, 4]),
      patch("ceiling", [0, 0, 8], [0, 0, -1], [1, 0, 0], [18, 6]),
      patch("west", [-18, 0, 4], [1, 0, 0], [0, 1, 0], [6, 4]),
      patch("east", [18, 0, 4], [-1, 0, 0], [0, 1, 0], [6, 4]),
    );
  let sourcePosition = [-5, 0, 1],
    listenerPosition = [5, 0, 1],
    track;
  if (name === "flyby") {
    input.bounds = { min: [-125, -30, -2], max: [125, 30, 12] };
    input.listenerAnchor = [0, 6, 1];
    listenerPosition = [0, 6, 1];
    input.surfaces = [
      patch("ground", [0, 0, 0], [0, 0, 1], [1, 0, 0], [124, 29]),
      patch("facade", [0, -12, 5], [0, 1, 0], [1, 0, 0], [100, 5]),
    ];
    track = trajectory([
      { time: 0, position: [-90, 0, 1], forward: [1, 0, 0] },
      { time: 12, position: [90, 0, 1], forward: [1, 0, 0] },
    ]);
  }
  for (const s of input.surfaces) s.validUntil = input.validUntil;
  const materials = Object.fromEntries(
    input.surfaces.map((s) => [
      s.id,
      s.id === "ground"
        ? ground
        : s.id === "screen"
          ? material({
              reflection: [0.6, 0.5, 0.3],
              transmission: [0.025, 0.0025, 0.00025],
            })
          : hard,
    ]),
  );
  const scene = acousticScene(createTile(input), materials, { order });
  return {
    scene,
    track: track ?? trajectory([{ time: 0, position: sourcePosition }]),
    listener: trajectory([
      {
        time: 0,
        position: listenerPosition,
        forward: name === "flyby" ? [0, 1, 0] : [-1, 0, 0],
      },
    ]),
  };
}
export function demo(name) {
  const f = fixture(name),
    duration = name === "flyby" ? 12 : 6,
    pcm = signal("engine", duration, { frequency: 95, amplitude: 0.35 });
  if (name !== "flyby")
    for (let i = 0; i < pcm.length; i++) {
      const t = i / 48000,
        phase = t % 2;
      pcm[i] *=
        phase < 1.35 ? Math.min(1, phase / 0.03, (1.35 - phase) / 0.03) : 0;
    }
  return {
    ...f,
    source: ownedSource({
      id: "original-exhaust-like",
      pcm,
      track: f.track,
      directivity: name === "flyby" ? 0.3 : 0,
    }),
    duration: duration + 1,
  };
}
