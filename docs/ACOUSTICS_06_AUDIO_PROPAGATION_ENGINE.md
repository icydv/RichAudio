# ACOUSTICS-06 — My first working acoustic propagation and PCM renderer

## Executive result

I've built a functioning **offline** acoustic engine. It turns owned mono PCM into stereo PCM using finite geometry, propagation time, inverse-distance pressure, spectral losses, obstruction, first- and second-order reflections, source/listener motion and geometric stereo positioning. Five original synthetic demonstrations now exist as playable 48 kHz PCM16 WAVs. This is actual sample processing, not a path visualisation or a scene-name effect preset.

My result is **PASS for the bounded synthetic implementation**. Human listening acceptance is pending. I have not demonstrated a live GTA renderer, native audio ownership, calibrated GTA geometry, HRTF, diffraction, diffuse late reverberation or real-time device operation. I deliberately completed tested second-order reflections instead of adding an unvalidated reverb tail.

This work is isolated on `research/acoustics-06-physical-propagation`, stacked on the still-open ACOUSTICS-05 branch at `49c5c6533fa6bab8856fd2f07e863fbba099c707`. Main remains `3075037704371c6ac416d4b8c9f2c0df339a5600`; its accepted README progress wording was already preserved in the acoustic parent. I have not merged, rebased or changed the benchmark/source-synthesis histories. My combined ACOUSTICS-05 + BENCHMARK-01 record remains **60%**; this separate offline implementation earns no live-test credit.

## Architecture decision: bounded original renderer now

I reviewed Valve's Steam Audio at commit `480dd64f513cc8a6437e7d5b9eb0d3f1d30c2fac`.

| Approach | Evidence and decision |
|---|---|
| Steam Audio | Its [core integration guide](https://github.com/ValveSoftware/steam-audio/blob/480dd64f513cc8a6437e7d5b9eb0d3f1d30c2fac/core/doc/guide.rst) documents simulation and rendering facilities, including spatialisation, reflection processing and direct effects. This is a credible future backend, especially for HRTF and denser propagation. |
| Native integration cost | The [build instructions](https://github.com/ValveSoftware/steam-audio/blob/480dd64f513cc8a6437e7d5b9eb0d3f1d30c2fac/core/doc/build-instructions.rst) require a native toolchain and dependencies. No Steam Audio binary, managed bridge or reproducible native package has been validated in this worktree. That is a local readiness limitation, not proof that integration is impossible. |
| Licensing | The [project licence](https://github.com/ValveSoftware/steam-audio/blob/480dd64f513cc8a6437e7d5b9eb0d3f1d30c2fac/LICENSE.md) is Apache 2.0; [component notices](https://github.com/ValveSoftware/steam-audio/blob/480dd64f513cc8a6437e7d5b9eb0d3f1d30c2fac/core/THIRDPARTY.md) contain additional terms, including FFT and Intel components. Optional build configurations need their own distribution review. Apache licensing alone is not a blanket redistribution conclusion. |
| Selected approach | Extend our existing tested finite-surface solver with a bounded original Node renderer. There are no new runtime packages or native binaries. Separate path preparation from sample processing so the propagation/spatialisation backend can later change. I have not implemented two competing engines. |

Node is the current **offline reference implementation**, not a newly selected in-process GTA audio runtime. I did not port valid research mathematics merely to produce C++ files. A native or managed output host still needs a measured integration. Prettier 3.6.2 was used only as a development formatter; it is not a runtime dependency or redistributed code.

## Reused foundations and new modules

The original `local-geometry.mjs` remains unchanged. Its validated immutable tiles, finite patches, openings, coordinate rules, provenance, bounds and visibility queries are used directly. `first-reflections.mjs` remains an independent historical numerical reference. The cache builder/format/store and all real observation records remain unchanged; loading a historical inferred tile does not grant it complete geometry status.

| New module/tool | Responsibility |
|---|---|
| `src/acoustics/engine/contracts.mjs` | Branded validated scene, authored/measured material labels, owned source PCM, time-indexed source/listener trajectories and generation guards |
| `src/acoustics/engine/paths.mjs` | Finite zero/one/two-bounce geometry, every-leg visibility, retarded-time solution, distance/material/directivity losses and arrival direction |
| `src/acoustics/engine/renderer.mjs` | Off-thread preparation, source-band buffers, immutable path snapshots, bounded block processing, fractional delayed reads and stereo summation |
| `src/acoustics/engine/signals.mjs` | Original procedural fixtures, PCM measurements and deterministic WAV encoding |
| `tools/acoustics-06-scenes.mjs` | Original metre-scale input geometry and trajectories; scene labels never enter the DSP |
| `tools/Render-Acoustics06.mjs` | Fresh private demonstration package, real path records, metrics and controlled diagnostic comparisons |
| `tools/Measure-Acoustics06.mjs` | Independently measured PCM tone frequencies and analytical timing comparisons |
| `tools/Benchmark-Acoustics06.mjs` | Forward/reverse workload measurement, preparation versus DSP cost, memory and storage checks |

The three new test files cover renderer mathematics, motion/lifecycle and end-to-end WAV generation. They run without GTA, a device, SDKs or proprietary assets.

## Coordinate, source and world contracts

All rendered positions are explicitly `research-rh-z-up-metres-v1`. Trajectory times are seconds relative to this synthetic render; tile observation/lifetime times retain the existing millisecond contract. Source/listener velocities are metres/second and must agree with their piecewise-linear positions if explicitly supplied. Orientation vectors must be valid. Source identities and generations are separate; a generation discontinuity is muted around its boundary rather than converted to a huge velocity.

The current scene is static for one prepared render. Geometry key, tile generation, build/session/environment identity, per-surface provenance, confidence, openings and missing regions remain in the validated tile. A material carries a separate provenance label and reference. All demonstration coefficients are **authored assumptions**, not measured material data. A matching version is not proof of complete geometry.

Partial, unknown or ambiguous visibility produces an unavailable path. Expired surfaces are rejected even when their containing tile has not expired. The complete simulation grid must fit inside both lifetimes. Real GTA patches remain sparse/inferred, with **unverified physical scale**; they cannot be silently converted into these synthetic-complete metric scenes. No GTA-unit conversion is implemented or claimed.

`ownedSource` accepts original-generated or explicitly licensed-owned mono Float32 PCM at 48 kHz. It copies source data; the renderer takes separate owned band buffers before processing. Callers must respect exclusive ownership of exposed typed buffers. Path metadata is deeply frozen. No RPH objects, entity handles, game calls or source-pack filenames enter the solver. The demonstration source is a harmonic, modulated, exhaust-like signal with deterministic filtered noise, not a recorded motorcycle or a substitute for the separate source synthesiser.

## Direct propagation and pressure model

For path length `r`, the pressure spreading factor is `r0 / max(r,r0)`, initially `r0 = 1 m`. I do not apply inverse-square intensity loss to waveform pressure. The near field is bounded; exact co-location uses an explicitly nonphysical central-pan/unit-gain limiting convention when represented geometry is known, rather than dividing by zero.

Sound speed is configured, initially **343 m/s**, an illustrative approximately 20°C assumption. Delay is `r / c`. Atmospheric band coefficients `[0.0001, 0.001, 0.01] dB/m` are authored illustrative losses, not an ISO atmospheric calibration or GTA-weather measurement. Amplitude conversion is `10^(-lossDbPerMetre * r / 20)`.

Optional source radiation blends omni with a forward cardioid pressure pattern. Its direction is evaluated toward the first path leg at emission time, so a reflected route can have a different radiation gain from the direct route. It is an authored directivity approximation, not measured exhaust radiation.

There is no arbitrary audibility-radius cutoff. Explicit scene and delay budgets can nevertheless make a path unavailable; these are diagnostic model limits and must not be mistaken for physical inaudibility.

## Actual first- and second-order reflections

The solver mirrors the source through an ordered sequence of one or two finite surface planes. Working backward from the listener, it intersects the appropriate unfolded image with each plane. Every point must lie inside its actual patch and outside any opening. Incoming/outgoing legs must obey the reflecting side. Every leg is tested against **all** represented surfaces and unknown regions; only the nominated bounce endpoint is excluded from obstruction. A different blocker is never ignored.

Second-order paths use distinct successive surfaces and a bounded ordered candidate set. They are not invented repeated echoes. Invalid reflection order, parallel/degenerate geometry, outside-patch hits, unknown visibility and obstructed legs are rejected with diagnostic reasons.

Independent reference checks:

| Path | Length | Delay at 343 m/s | 48 kHz fractional arrival |
|---|---:|---:|---:|
| Direct | 10 m | 29.154519 ms | 1399.416910 |
| Ground, source/listener 1 m high | 10.198039027 m | 29.731892 ms | 1427.130826 |
| Ground excess over direct | 0.198039027 m | **0.577373257 ms** | 27.713916 samples |
| Opposite walls, two bounces | **26 m** | **75.801749 ms** | 3638.483965 |

The historical first-reflection solver and independent unfolded geometry agree. PCM impulse tests verify the two neighbouring samples of each fractional arrival and its pressure gain. Linear interpolation spreads an ideal impulse across those two samples, so the first nonzero sample may precede the continuous arrival by less than one sample. This is the stated interpolation tolerance, not an unexplained timing offset.

## Materials, actual filtering and obstruction

Each surface has three reflection-energy and transmission-energy coefficients. Inputs are finite, within [0,1], and their sum must not exceed one per band; the remainder is absorption. Each bounce contributes the **square root** of its reflection energy to pressure gain. Transmission losses are applied separately only to a blocked direct path with explicit material data. Scattering is not modelled.

The prototype supports monotonically decreasing band gains. This restriction allows a simple passive complementary approximation:

`low = LP400(x); mid = LP4000(x) - LP400(x); high = x - LP4000(x)`.

These are actual stable one-pole filters. Equal gains sum back to the input. With `gLow >= gMid >= gHigh >= 0`, the combined response is `gHigh*I + (gMid-gHigh)*LP4000 + (gLow-gMid)*LP400`, bounded by `gLow`. Tone measurements independently agree with the complex transfer function. This is a broad three-band approximation, not a brick-wall equaliser or a full measured impedance model. Per-bounce band products are collapsed into the path's effective band response; reflection phase inversion, angular impedance and exact cascaded material phase are absent.

The synthetic corner has a finite blocking screen with transmission energies `[0.025,0.0025,0.00025]` and a geometrically valid alternate wall reflection. Without authored transmission, a blocked direct path is unavailable. The renderer does not retain unchanged direct sound behind a known blocker. Unknown geometry is not treated as transparent. Low-pass transmission is **not diffraction**; diffraction and portal/pathing remain unimplemented.

The urban material diagnostic changes only wall coefficients to `[0.5,0.15,0.02]`; its source, geometry, timeline and master level stay fixed. This permits a real spectral comparison without a scene-name preset.

## Motion, retarded time and Doppler

For each arrival time `t`, the solver finds emission time `te` satisfying `te = t - pathDistance(source(te), listener(t))/c`. Static reflectors let the unfolded image distance supply this equation for both direct and reflected paths. A bounded 20-iteration fixed-point solve rejects an unconverged or invalid result. The maximum measured residual in the flyby is approximately **9.96e-11 s**.

The PCM reader follows the resulting emission-time curve. Its changing read rate creates Doppler **once**; there is no additional pitch shifter or spatial-speed-to-engine-RPM mapping. Position and direction gains use the same retarded source state. Spreading amplitude is quasi-static `1/r`; this is not a complete moving-monopole radiation-amplitude model.

Measured 1 kHz test-tone results at 30 m/s:

| Case | Analytical frequency | Measured PCM frequency |
|---|---:|---:|
| Stationary | 1000 Hz | 1000.000000 Hz |
| Approaching source, `c/(c-v)` | 1095.846645 Hz | 1095.846645 Hz |
| Departing source, `c/(c+v)` | 919.571046 Hz | 919.571046 Hz |
| Approaching listener, `(c+v)/c` | 1087.463557 Hz | 1087.463557 Hz |

These numbers validate the tested trajectories, not arbitrary nonlinear motion. Path snapshots default to 40 Hz. Interpolated delay differs from a per-sample geometric solve by at most **0.411 sample** in the tested near-pass window. Teleports use generation changes and a 50 ms guard on either side; missing source/listener data suppresses paths. One grid cell provides attack/release when a path appears/disappears. That intentional smoothing can lead/lag an exact visibility boundary by up to 25 ms; it is a perceptual transition approximation. The offline planner knows the future trajectory. A live host must replace that lookahead with an explicit buffered/predicted update policy and validate its latency.

## PCM and spatial rendering

The renderer processes caller-owned stereo Float32 buffers in bounded blocks (512 default; 256 independently tested). It uses preallocated source-band and numeric path-grid arrays. Absolute frame indexing preserves sample continuity across block boundaries and sample-identical output at different block sizes. Each path has its own emission cursor curve, gain bands and arrival-direction state.

Fractional source reads use two-point linear interpolation. This is adequate for the demonstrated low-band synthetic source and measured 1 kHz motion cases; it is not a high-quality bandlimited sample-rate converter. High-frequency droop and aliasing on strongly compressed broadband material remain limitations. The original engine-like fixture limits harmonics and low-passes its small noise component; no general anti-alias guarantee is claimed.

Geometric stereo uses `pan = dot(arrivalDirection, listenerRight)` and constant-power left/right gains at path snapshots, with smooth interpolation between those gains. Interpolating gain pairs can slightly reduce total power between widely separated directions; it never adds power. There are no binaural front/back or elevation cues. Static comparison listeners face the source so the two canyon walls arrive from opposite stereo sides. The moving example travels from left to right. No HRTF or second spatialiser is applied.

Source history remains readable after emission stops. The source filters retain a bounded 50 ms tail, and delayed paths continue until their existing history is exhausted. Output duration must include the desired propagation tail; the demos allow one second, longer than their paths. The 2 s configured maximum delay does not automatically extend the requested export duration.

All demos use the same **0.7 master gain**, without per-file normalisation. An emergency stereo-linked sample-peak guard at 0.98 reports affected frames and pre-guard peak; it is not a transparent mastering limiter or an intersample true-peak protector. It was **inactive in every demonstration**. Constructive interference can increase local pressure; this does not justify a scientifically incorrect blanket total-pressure energy assertion.

## Reverb scope

The enclosure renders up to twelve direct/early paths, including validated second-order paths. Its timing and spectral changes come from geometry and per-bounce losses. It has **no FDN, diffuse late tail, RT60 estimate or Sabine preset**. A six-plane fixture alone is not a validated diffuse-room decay model. The engine's path interface leaves room for a separately tested convolution/late-response backend, but no placeholder reverb is presented as implemented.

## Reproduction and listening

Node 24.19.0 was used locally; there are no runtime npm packages. From this branch's repository root:

```powershell
node tools/Render-Acoustics06.mjs .local/acoustics-06-demo
node tools/Measure-Acoustics06.mjs .local/acoustics-06-physics.json
node --expose-gc tools/Benchmark-Acoustics06.mjs .local/acoustics-06-bench.json
node --test tests/Test-AcousticRenderer.mjs tests/Test-AcousticMotion.mjs tests/Test-AcousticDemo.mjs
./tools/Test-Offline.ps1
```

All output destinations must be **fresh**, ignored local paths. Existing files and symlink/junction routes are rejected. Use a new suffix on subsequent runs. The delivered package is under `.local/acoustics-06-demo-final/`; it contains 16 WAVs, five synthetic path JSON files and one metrics JSON (about 18.7 MB total). No generated audio is committed.

| Primary processed WAV | Duration | Rendered paths | What to compare |
|---|---:|---:|---|
| `A_open-road_processed.wav` | 7 s | 2 | Direct arrival plus finite ground bounce; compare `A_open-road_direct-only.wav` and the impulse response |
| `B_urban-street_processed.wav` | 7 s | 6 | Separate wall arrivals and two-wall bounces; compare A at the same device level and B's `absorptive-walls` diagnostic |
| `C_obstructed-corner_processed.wav` | 7 s | 2 | Attenuated, spectrally altered direct transmission plus a valid reflected alternative; compare A |
| `D_enclosure_processed.wav` | 7 s | 12 | More early arrivals with per-bounce spectral losses; listen after each dry emission stops; no dense late tail is claimed |
| `E_flyby_processed.wav` | 13 s | 4 | Original 95 Hz harmonic source moving 180 m at 15 m/s, approaching, passing and departing 6 m from the listener |

Every scene has an accompanying `_dry.wav`. A–D also have `_impulse.wav` diagnostics. Dry audio is source-level mono, whereas processed audio includes actual spreading loss; it is intentionally quieter. Keep comparison device gain fixed rather than normalising away the effect. Headphones make stereo side changes easier to assess. My subjective listening verdict is **not yet recorded**; numerical success does not establish naturalness.

Measured processed peak/RMS respectively: A **0.023015/0.009224**, B **0.020274/0.006146**, C **0.010486/0.002760**, D **0.026561/0.007810**, E **0.036424/0.005470**. All contain nonzero audio, finite samples and zero clipped/limited samples. The quieter canyon RMS is possible coherent interference, not evidence that more paths must always make a source louder. The stereo paths retain their actual phase/delay relationships.

Exact fingerprints, frames, preparation statistics, DSP timings, spectra-related assertions and independent physics measurements are in [the scalar evidence](../evidence/acoustics-06/validation.json). Two fresh complete package generations produce identical primary WAV hashes. The original private GTA sound research was not accessed.

## Performance and bounds

Measured on Ryzen 7 5800X, Windows, Node 24.19.0, CPU only. Forward/reverse workload orders expose warm-up and order effects. A 512-frame block lasts **10.6667 ms**.

| Workload | Sources / rendered paths | Median block range | Worst observed block | Preparation range |
|---|---:|---:|---:|---:|
| Direct only | 1 / 1 | 0.0129 ms | 0.0317 ms | 0.685–2.062 ms |
| Early reflections | 1 / 6 | 0.0706–0.0716 ms | 0.0886 ms | 1.207–6.000 ms |
| Moving | 4 / 32 | 0.3689–0.3700 ms | 0.5705 ms | 52.822–69.575 ms |
| Moving | 16 / 126 | 1.4487–1.4501 ms | 1.7818 ms | 241.405–243.165 ms |
| Enclosed path cap | 16 / 192 | 2.5680–2.5793 ms | **3.1225 ms** | 38.262–49.382 ms |
| Many candidate surfaces | 1 / 2, 128 surfaces | 0.0284–0.0286 ms | 0.0481 ms | 68.982–77.287 ms |

The scalar evidence includes p95/p99, cache hits/misses, rejected/pruned paths and geometry test counts. The 16-moving case used 72,414 surface tests for its two-second prepared trajectory. These expensive operations are **not** run in the sample loop. Static paths cache geometry; moving paths are solved per control update. There is no persistent live propagation cache or game-world raycasting.

Renderer-owned typed storage is about 1.19 MB for direct-only and **19.89 MB at 192 paths** in these two-second fixtures (192 path arrays plus 48 source-band arrays). Repeated processing/reset preserves array identities and byte counts. The benchmark process high-water RSS reached about **246.2 MB** including preparation, fixtures, output arrays and VM overhead. Heap/RSS deltas include garbage collection and are not exact allocation counts. The sample loop contains no explicit normal-path object/array allocation, disk access, locks or geometry calls; V8 allocation/GC was not instrumented. I do not claim zero runtime allocation or hard real-time suitability.

Hard limits: 16 sources; 12 retained paths/source; 8 reflector candidates; 128 visibility surfaces; two bounces; 2 s delay; 60 s offline duration; 4,000,000 aggregate dry frames; 4,096 trajectory keys; 100 m/s source/listener speed; 250,000 candidate-grid evaluations; output blocks at most 4,096 frames. Limits reject unsupported requests; source count overflow is rejected rather than silently stealing a voice. Hardware/device latency is unmeasured and must be added to propagation, control buffering and block latency by a future host. Reflectors are selected deterministically by ID; all surfaces still obstruct. Retained paths are ranked by peak band gain over the **known offline timeline**, with ID tie-breaks. This is not a production audibility/priority policy, and pruned paths represent deliberately omitted physics.

Measured performance covers the listed workloads, not every permitted combination or full Los Santos. The worst validated configuration is not a proof of a global worst-case deadline. Offline preparation can take hundreds of milliseconds and full trajectories allocate substantial data. A live host needs bounded rolling snapshots, lifetime expiry, an appropriate bandlimited streaming reader, device scheduling and soak tests. The [XAudio2 callback guidance](https://learn.microsoft.com/en-us/windows/win32/xaudio2/xaudio2-callbacks) reinforces the separation of I/O/simulation from audio callbacks; no XAudio2 integration is claimed here.

## Verification and preservation

There are **43 new original Node tests**: 23 renderer/propagation, 16 motion/lifecycle and four demonstration/storage tests. The full existing runner passes **247 Node tests**, **493 managed/PowerShell assertions**, and independent C#/JavaScript replay checks. Core/analyser and existing geometry-observation helpers compile through the unchanged offline build path. New checks include analytical impulse timing/gain, finite patches/openings, two-bounce reciprocity, actual PCM spectral response, tone-measured Doppler, missing data/teleports, path transitions, tails, block-size identity, reset/storage stability, invalid ownership, budgets, expiry and output path safety.

The historical research solver, cache implementation, production telemetry, Bati code, original source material and game installation are unchanged. GTA/RPH were not launched. No additional archives were read or extracted. Preservation is established by the isolated worktree and unchanged tracked research trees; I do not invent a new full private-file inventory or game-archive hash audit for files this task never accessed.

Public deliverables contain only original code/tests and scalar synthetic evidence. No WAV/PCM, private absolute paths, vendor binaries, proprietary metadata or raw game logs are included. Publication screening and Git integrity are checked before pushing. Previously reviewed GitHub commit-identity exceptions remain historical exceptions, not newly introduced defects. The project licence remains unselected. Hosted CI and exact remote-head verification are recorded in the draft PR once the run completes; a local pass alone is not described as green hosted CI.

## Integration boundary and next milestone

The implemented path is:

`owned 48 kHz mono PCM + metric trajectories + validated tile/materials -> immutable prepared path observations -> bounded stereo block renderer -> WAV`.

A future adapter must copy source/listener values into neutral identities, monotonic timestamps, positions, velocities, orientation and generations. It must supply independently verified coordinate conversion, clock alignment, source rights/ownership and geometry confidence. A live snapshot must expire rather than hold the last observation forever. The present trajectories are authored recordings, not a live telemetry lease. Scene replacement also needs explicit phase/history continuity; replacing a prepared plan is not a proven live update mechanism.

The source provider may later deliver original/licensed/custom PCM or separately validated local stock synthesis. It must not share RPH entities with the core or silently overlap an unowned native source. This task neither reads the source-synthesis branch into the engine nor solves stock engine muting. Sparse cached GTA patches cannot be used as complete buildings or a city propagation graph.

**My single next milestone is an end-to-end owned synthetic-beacon audio host:** connect a standalone output backend to bounded copied RPH source/listener snapshots, first using deterministic replay and then a separately approved supervised Story Mode test after coordinate-scale and ownership preflight pass. A deliberately distinct owned beacon can validate the transport/output path without replacing or duplicating a stock engine. Live approval, measured device latency, dropout handling and safe shutdown remain prerequisites. I have not started that milestone.

ACOUSTICS-06 advances from path research to functioning PCM. It does not certify the complete responsive vehicle synthesiser, late reverb, native source ownership, a full city model or playable GTA acoustic overhaul.
