# ACOUSTICS-08 — geometry in the real-time worker and PCM producer

The actual simulation worker and credit-paced producer now consume bounded observed geometry. One persistent `CausalSimulation` and `StreamingRenderer` calculate and render changing acoustic paths; the offline `PcmRenderer` is not used in this route. This increment starts at PR #69, without importing the launcher/deployment branches.

## Run the device-free slice

```powershell
node --test tests/Test-RealtimeGeometry.mjs
node tools/Render-RealtimeGeometry.mjs .local/realtime-geometry
```

The output directory must be new private storage. It contains three stereo PCM16 WAVs, actual per-block path/control traces, numerical results and `listen.html` with manual playback controls. Generation opens no endpoint, starts no game and plays nothing. Sources and ray observations are original analytic fixtures, not game assets or promoted historical captures.

`observed.wav` contains the complete update sequence. `direct-reference.wav` uses identical mapped poses, source PCM and control events, with explicitly empty fresh observation sets instead of reflectors. Its prefix matches exactly before reflection introduction; later samples differ. `fixed-scene.wav` exercises the pre-existing synthetic scene path. That third reference has its own synthetic positions and establishes compatibility; it is not the matched isolation of geometry's effect.

## Input and ownership boundary

The producer's opt-in `--geometry-input required` mode accepts bounded JSON lines on its existing control input. Stdout remains the same sequenced RA07 format: 512 frames of 48 kHz stereo Float32 per credited block. No output block is generated without credit. Defaults and the original beacon options remain compatible.

| Message | Contract |
|---|---|
| `geometry-config` | Increasing configuration epoch; validated coordinate contract, paired geometry/listener session identities, build/interior, minimum listener generation, native region, clock evidence, authored materials and original owned-source definitions |
| `geometry` | Matching epoch/context/clock ID; increasing revision; at most two qualified wall/ground groups, or an explicitly empty bounded observation set |
| `owned-sources` | Matching epoch and exact existing source IDs; original-generated rights/reference, native pose/velocity and nondecreasing source generation |
| `listener` | Existing neutral envelope, unchanged protocol; native coordinates required in geometry mode |

Each geometry event is limited to 64 KiB. The producer retains at most four pending events and one worker request; the worker reconstructs/qualifies surfaces and solves paths outside DSP. Live updates are capped at 20 Hz. `ObservedGeometryFeed` replaces whole scenes; it does not accumulate old patches. The empty-set case has an explicit lease no longer than 1000 ms and remains a partial, conditional model. Invalid input or absent/expired geometry removes the active scene; it never selects the synthetic scene as a fallback.

All positions use the PR #69 origin/axes/declared scale contract. Directions rotate without scaling; velocities rotate and scale without translating. Native camera position now affects propagation distance, delay and panning instead of being replaced with `[5,0,1]`. Unavailable camera velocity cannot authorize extrapolation. Invalid poses, excessive mapped speed, undeclared discontinuities and incompatible coordinate representations fail closed. Coordinate/context changes within a session require a fresh listener generation; a new geometry revision alone does not change source identity or history.

The producer still synthesizes its own harmonic/pulse/impulse source. Native source definitions locate that owned sound in the same coordinate frame as the observed surfaces. This does not capture, replace or modify GTA stock vehicle audio.

## Clock alignment

These clocks have different roles and origins:

| Clock | Existing evidence and treatment |
|---|---|
| Tile observation milliseconds | `TileObserver.Rph.cs` uses plugin-relative `Stopwatch.Elapsed`; not raw QPC and not producer time |
| Neutral listener ticks | `ListenerBridge.Rph.cs` publishes raw `Stopwatch.GetTimestamp` ticks and frequency; the Windows receiver measures freshness |
| Producer receipt clock | Node monotonic time in ordinary mode; explicitly produced-audio time only in the controlled device-free fixture |
| Audio frame clock | Frames / 48000 drives causal source history, retarded emission time and output sequence |

`ObservationClock` requires two ordered, bounded paired readings of observation milliseconds and listener ticks, a common-rate relation, session/clock binding and uncertainty. For each pair, `offset = listenerTicks / frequency * 1000 - observationMs`. The uncertainty intervals must overlap. Missing pairs, inconsistent offsets/rates, frequency mismatch, reversal or a mapping horizon beyond 120 seconds are rejected.

Current geometry time is an interval derived from the latest raw listener ticks plus receiver-reported age, producer queue age, worker dispatch/processing age and a declared receiver-to-producer delivery upper bound. The real worker measures dispatch elapsed time with the shared Node-process monotonic counter; it does not compare an RPH stopwatch to that counter. Missing dispatch evidence fails closed. The controlled fixture uses explicitly scheduled frame-clock delivery instead and is tested for identical PCM on repeated runs.

The delivery bound is also required evidence: `controlled-fixture` for the original fixture, or `measured-forwarding-upper-bound` with a reference for a future publisher/relay. The current RPH route supplies neither observation-clock pairs nor that geometry relay contract. The code does not manufacture them. Publishing genuine geometry through this interface therefore still requires that acquisition/relay work.

Admission requires a capture to be no later than the lower bound of current observation time. Expiry uses the upper bound, conservatively consuming uncertainty and transport time. Original group `FinishedMs + 1000` leases remain unchanged. An actual worker test demonstrates that dispatch queue time can make a capture expire before use. Replaying an old group at a new audio frame does not renew its lease.

Geometry validity is passed explicitly to `solvePath` in the observation-clock domain; causal arrival/emission time remains in audio seconds. This fixes the offline-only `createdAt + arrivalTime` assumption for this route without changing the existing offline default. Camera presentation retains the existing 100 ms buffered policy: the represented surface is assumed static during its short lease, while the listener pose has that declared presentation delay. This is not hardware timestamp alignment or evidence of moving-surface support.

## Smooth transitions and history

Scene replacement preserves causal pose/source records and the renderer's bounded PCM rings. Direct-path identity remains stable across geometry revisions. Reflected identities include a geometry epoch, so a changed reflector fades the old path out over the existing bounded release while the new path fades in; its changed delay is not interpreted as source velocity. Existing gain/pan smoothing and fractional history reads remain responsible for DSP.

Geometry-mode generation transitions retain primed output and use the renderer's release bank while new retarded source history becomes available. A narrow opt-in release guard stops an old-generation fade before its cursor crosses into new-generation PCM tags. This resolved the initially observed 16 affected history frames in the controlled sequence; final runs have zero unavailable weighted history reads. The original synthetic mode retains its original startup/release policy.

Invalid or expired geometry and session mismatch produce empty path controls, with a bounded fade rather than a hidden reference scene. A later fresh snapshot can recover without rebuilding the audio renderer. True listener/session/source-generation changes retain their existing distinct history identities. No observation or source reset occurs merely because a reflector changes.

## Actual numerical and PCM results

The controlled six-second sequence emits **560 RA07 blocks / 286,720 stereo frames**. It covers direct-only start, wall/ground introduction, movement/rotation, reflector replacement, invalid input, expiry, recovery, source generation, listener generation, session mismatch/new configuration and emission stop. Analytic delay and transformed-pose tests accompany actual worker tests; full producer tests inspect PCM and control data.

| Demonstration measurement | Local result |
|---|---:|
| Observed PCM SHA-256, repeated exactly | `152627b59b8f21ee649644246c426a22d122fcb9d92820d2b494019ac8bb0c67` |
| Peak / maximum adjacent step | 0.02517645 / 0.00049661 |
| Maximum step at a block boundary | 0.00037827 |
| Clipped/nonfinite samples; limiter activations | 0 / 0 / 0 |
| Unavailable weighted history reads; cursor resets; path overflow | 0 / 0 / 0 |
| Renderer-owned typed storage, all three routes | 2,881,152 bytes |
| Worker p95 / maximum | 0.2053 / 11.5075 ms |
| DSP p95 / maximum | 0.2103 / 1.8742 ms |
| Producer process RSS at completion, observed route | 78,860,288 bytes |

These timings describe this local device-free demonstration, not a hardware benchmark or worst-case guarantee. The cold worker maximum exceeds one 10.667 ms block period; no live scheduling/underrun claim is made. Tests check valid steady windows for unexpected silence, explicit invalid/expired windows for completed release, bounded sample steps, path rates, generation identities and constant owned ring storage. RSS is a process-level snapshot, not a leak proof.

The WAVs contain early-reflection coloration, moving stereo presentation, geometry-dependent delay/gain changes and deliberate fade-to-silence/recovery intervals. Subjective listening is unassessed. Coordinate scale is explicitly **10 model metres per native unit**, and material spectra are authored assumptions. Partial visibility, finite support, unmeasured continuity and unknown permanence remain represented; none is calibrated GTA physics.

## Remaining before live GTA use

The current listener bridge does not continuously supply qualified surface groups or vehicle-source poses. Implement a bounded real-RPH publisher with paired monotonic clock readings and context/generation changes, then forward that data/configuration through the existing host to this opt-in producer route. Establish the relay delivery bound and validate its failure behavior. Keep an original owned source until genuine vehicle-source ownership/integration is designed. Physical/material calibration and wider-world coverage remain research work.

No GTA/RPH launch, deployment, audio endpoint access or dependency/system change occurred in this increment. A live run still requires a separate fresh authorization. Historical evidence and sealed candidates are untouched; the combined historical milestone remains **60%**. Original CI failure cause remains unknown, 07.9 remains incomplete with failed Stop timing, and 07.13 remains failed at launch.
