# Observed GTA surfaces through the existing acoustic renderer

The missing offline connection now works: qualified wall/ground observation groups become finite acoustic surfaces, the existing image-source solver calculates direct and reflected paths, and the existing DSP writes processed stereo PCM. This adds an adapter to the acoustic engine, not another propagation or rendering implementation.

## Run the slice

From the repository root, with Node.js:

```powershell
node --test tests/Test-ObservedGeometryAudio.mjs
node tools/Render-ObservedGeometry.mjs .local/observed-audio
```

The destination must be new private storage. The generator writes original synthetic exhaust-like harmonic/noise bursts, path reports, metrics and a `listen.html` comparison page with manual playback controls. It opens no device and does not launch GTA. A second optional argument supplies a private JSON array of recorded observation groups:

```powershell
node tools/Render-ObservedGeometry.mjs .local/recorded-demo .local/recorded-groups.json
```

Recorded inputs, coordinates, session identifiers, detailed reports and WAVs stay private and ignored. The public fixture is independently authored analytic data in the existing observation format. The signal is original synthesized audio; no GTA vehicle audio is extracted or redistributed.

## Geometry and scale contract

`observationCoordinates` requires a native origin, three right-handed orthonormal axis rows, a positive bounded scale, a basis and an identifiable reference. Positions use

`model[i] = dot(axes[i], native - originNative) * metresPerNativeUnit`.

Directions use the rotation alone. Source and listener positions must use the same mapping; directions use `modelDirection`. The existing engine's right-handed, Z-up metre coordinate label denotes **model metres** here. Only `declared-demonstration-scale` is currently accepted. The adapter records `physicalCalibration: unverified`; it cannot label an assumed scale as measured GTA metres. Demonstrations explicitly choose 10 model metres per native unit and the existing 343 model-metres/second sound-speed default. Delay and attenuation are consequences of that declared model, not measurements of Los Santos.

`observedAcousticScene` accepts at most eight groups, each bounded to 256 KiB, using the existing qualified nine-ray wall/ground envelope for the recorded game/RPH build. It invokes `inspectTileGroup` and `independentPatch`; it does not refit with a relaxed algorithm. Invalid samples, mixed session/build/interior context, duplicate group identities, incompatible orientation and unsupported input fail before rendering. Existing tile size, source, path, time and PCM budgets also apply.

The inset convex support from the independent reconstruction becomes an optional polygon in the existing surface representation. Reflection points and obstruction intersections must lie inside that polygon, rather than merely its enclosing rectangle. Existing synthetic rectangular surfaces retain their behavior. Evidence retains input JSON SHA-256, original ray identities, build/framework/session/interior/generation, original times and expiry, native footprint, fit residual and positional/normal tolerances. The hash identifies the serialized group content, not an original capture file's byte encoding.

Confidence remains null, motion remains unknown, material remains unknown and coverage remains partial. Continuity between sampled rays and permanence are unverified. Rendering requires both explicit assumptions:

- `unobserved-space-assumed-clear`: sparse support does not establish city-wide visibility. Explicit unknown regions and ambiguous intersections still suppress paths.
- `static-during-snapshot`: a bounded model assumption, not a measured classification of the surface.

Three-band reflection/transmission coefficients are separately authored assumptions with references and the existing energy constraints. The adapter rejects a claim of measured material coefficients. An unknown material suppresses affected reflections or transmission; it is never silently replaced with concrete. Geometrically eligible paths carry `conditional-observed-path` or `authored-transmission-in-partial-model`, not verified-world labels.

## Calculated and rendered results

The analytic observation fixture produces four valid paths: direct, ground reflection, wall reflection and wall-then-ground reflection. The opposite two-bounce order is rejected by the existing finite-path geometry checks. At the declared demonstration scale, their delays are approximately 17.734, 22.770, 29.300 and 32.596 ms. Numerical tests independently derive the image-source distances and delays, including fractional-sample arrival weights.

| Comparison | Calculated content | Expected audible distinction |
|---|---|---|
| `01_direct.wav` | Direct path | Dry spatial reference with propagation delay/attenuation |
| `02_reflections_only.wav` | Two first-order paths and one second-order path | Delayed, spectrally filtered arrivals without the direct signal |
| `03_direct_and_reflections.wav` | All four paths | Early-reflection coloration and a changed transient/tail |
| `04_second_order_only.wav` | One valid two-bounce path | Weaker arrival with both surfaces' band processing |
| `05_absorptive_surfaces.wav` | Same geometry, lower authored reflectance | Reduced and darker reflected contribution |
| `06_open_reference.wav` / `07_obstructed.wav` | Matched source/listener; wall absent/present | Stronger loss of high frequencies and level through authored transmission |

The paired open/obstructed PCM peaks were 0.024019 and 0.002740. Combined-path peak was 0.034282. Every generated stereo comparison had finite samples, no clipping and zero limiter activation. These are numerical observations; subjective listening was not performed by the agent.

Original private wall and ground captures also passed the adapter and produced a direct plus first-order reflected path each. They were recorded at different times and are rendered separately, with hypothetical source/listener placements. They are not combined into a contemporaneous GTA scene. Their declared model gives roughly 11.662 ms direct and 117.200 ms reflected arrivals, a clearer discrete-echo demonstration. Those values are illustrative consequences of assumed scale and placements.

Historical replay creates an explicitly frozen model with its own bounded render lease; original source times and the original 1000 ms expiry remain in the evidence. It does not renew the observation's validity in the current world. Live mode instead retains the original expiry and rejects stale/future inputs. A render plan cannot extend beyond that live lease.

## Interface for new game observations

```javascript
import { observationCoordinates, ObservedGeometryFeed, modelPoint }
  from '../src/acoustics/engine/observed-geometry.mjs';
import { trajectory } from '../src/acoustics/engine/contracts.mjs';
import { prepare, PcmRenderer } from '../src/acoustics/engine/renderer.mjs';

// Inside a simulation worker; inputs below come from the caller.
const coordinates = observationCoordinates(explicitCoordinateContract);
const feed = new ObservedGeometryFeed();
feed.publish({ groups, coordinates, region, listenerNative,
  context: { session, build, interior, revision, nowMs },
  materialsByKind: authoredMaterials,
  visibilityAssumption: 'unobserved-space-assumed-clear',
  motionAssumption: 'static-during-snapshot' });
const scene = feed.current({ session, build, interior, nowMs });
if (scene) {
  const listener = trajectory([{ time: 0,
    position: modelPoint(coordinates, listenerNative), forward: modelForward }]);
  const plan = prepare(scene, ownedSourcesInModelSpace, listener,
    { duration: boundedChunkSeconds }); // Must fit within the remaining lease.
  const pcm = new PcmRenderer(plan); // Existing bounded process(left, right).
}
```

Publication replaces the whole immutable snapshot and requires increasing revisions. Failed publication, expiry, clock rollback or session/build/interior mismatch clears the available scene; there is no stale fallback or accumulation of old patches. Historical replay is excluded from the live feed. The adapter performs no game, disk or device operations. Reconstruction/path preparation belongs in the simulation worker, outside the PCM callback.

The next practical step is to feed newly acquired bounded groups to this interface alongside mapped camera/source poses, then hand the existing renderer's prepared PCM to the existing producer. Continuous acquisition, shared clock alignment, smooth snapshot/PCM handoff, live geometry effects and physical/material calibration remain unverified. Sparse patches do not yet support diffraction around a building, complete tunnels or distant motorcycle routing through an entire district. Existing Doppler, source ownership, host and benchmark research remain intact.

## Validation and separate live smoke attempt

Nine focused tests cover provenance, transforms, analytic paths, polygon extent, authored obstruction, deterministic PCM/order summation/block equivalence, leases, feed replacement/invalidation and rejected inputs. The required full `tools/Test-Offline.ps1` suite also passed locally, including existing engine, streaming, geometry, ownership and benchmark tests. Hosted status is reported against the published PR separately.

The separately approved live addendum used the unchanged previously reviewed installation and host candidate, not this development branch. One Explorer activation reached RPH first-run UI, then Steam/Rockstar handoff, game loading and RPH renderer/interoperability initialization. At the 300-second boundary GTA was still entering Story Mode; stable gameplay and bridge READY were not established. First-run dialogs and interaction latency occupied part of that same window. No startup crash or SlimDX exception was observed, so the prior exception was not reproduced in this attempt; its underlying cause is not proven resolved. No bridge load, beacon, publisher, RichAudio host session or listening result followed. GTA quit normally; all 26 additions and generated files were preserved in the fresh private quarantine, the executable rename was reversed, and independent restoration verification passed against the original baseline. The attempt approval is closed; no retry is authorized.

Historical results remain: original CI cause unknown; 07.9 incomplete with failed Stop timing; 07.13 failed at launch with no listening result; combined ACOUSTICS-05 + BENCHMARK-01 remains 60%.
