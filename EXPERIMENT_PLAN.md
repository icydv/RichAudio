# Experiment plan

Every in-game experiment below remains **UNTESTED**. Phase 2 has compiled a C# RPH logger against an authentic SDK and executed offline mocks; the author-advertised 1158.16 runtime remains to be acquired/preflighted and explicitly authorized for deployment. The authoritative current A–E procedure is [DEPLOYMENT.md](docs/DEPLOYMENT.md). Acoustic experiments remain future designs; no sound change is implemented.

## P2-01 — first in-game experiment: telemetry without changing sound

**Question:** can an explicitly supported Story Mode scripting stack provide trustworthy player and streamed-NPC motion/engine state, and optional normalized RPM/gear, without destabilizing gameplay?

**Current prerequisites:** the exact author-supported RPH 1158.16 runtime, its reviewed dependency/license manifest, explicit installation authorization, a supported Story Mode environment and known native baseline. C# compilation now works with the existing Framework compiler; the Phase 1 MSVC/SHV assumption is superseded. Do not rename executables, patch code, alter original archives or use Online as a test environment. Uncertain network/session state disables acquisition.

**Implemented candidate:** one managed `RichAudio.Telemetry.Rph.dll` reads documented entity/camera/engine/ratio/gear getters, copies runtime-independent values through a bounded queue, and delegates JSONL writes to a background thread. No LSPDFR gameplay code, audio playback, archive replacement, priority changes, muting, engine-state writes, raw memory access or collision/world modifications. Throttle and calibrated load are not established and remain unavailable. Public RPM/gear getters are compiled but not certified by gameplay.

Record build/hook/SDK versions and fingerprints in a run header, then at 20 Hz: sequence, monotonic timestamp, dt, source handle+generation/model/class, player/NPC role, entity validity, position/basis/velocity, running state, chosen camera pose, raw control values and validity. Optional fields are raw normalized RPM, raw gear and throttle state with their capability flags. Derived acceleration is stored separately. Enumerate at 2 Hz; cap at 32 vehicles. Log total seen/tracked/overflow plus adapter tick durations, queue drops and field-age counters.

**Procedure, ten-minute target run:**

1. Capture an unmodified native-audio baseline at fixed output settings. Use an existing Bati player vehicle (a known source chain), then idle for 30 s, perform three smooth throttle ramps, three acceleration/overrun cycles and three gear-change sequences. Do not label its asset family inline-four.
2. Observe naturally spawned traffic with a stationary listener, logging source identity/lifetime and validity at measured 25, 50, 100, 200, 400 m bands where sources exist. Report empty bands; do not force mission vehicles persistent and call that normal NPC coverage.
3. Change camera mode, enter/leave a vehicle, pause/resume and drive through a stream boundary. Observe handle retirement/reuse. Include a crowded street segment. Use normal gameplay rather than changing population caps.
4. Disable the logger and compare a second native baseline. Restart once and repeat the short startup/shutdown segment. Archive only telemetry and permitted local recordings, not game assets in Git.

**Acceptance:** no crash/hang, native sound unaffected, no game setter calls in adapter, monotonic sequence/time, finite poses, missing data explicitly tagged, lifecycle handled without stale sources. At least 95% of scheduled samples for a continuously valid target should arrive within 100 ms; report actual distribution rather than concealing misses. Optional RPM must show distinct engine-off/idle/ramp behavior, with a validated readiness check; zero-only output fails RPM validation. Gear transitions must be plausible in recorded state. Compare raw velocity to smoothed position differences after excluding teleports. Meet initial adapter p95/p99 timing targets or revise the source cap before adding acoustics.

**Decision:** if native motion succeeds but RPM fails, approve motion-only replay and stop any claim of calibrated engine synthesis. If NPCs disappear before useful listening distances, document a hard coverage limit for exact traffic acoustics. P2-01 does not establish clean handoff or acoustic rendering.

## P2-02 — native ownership feasibility gate

**Question:** is there an engine-only, per-instance, reversible replacement path? Use one controlled known-model vehicle and a separate untouched instance of the same model. Record engine, horn, doors, tires, collisions and radio independently where practical.

First test documented profile reassignment between two valid native profiles and restore the known original profile. Test whether model siblings/NPCs are affected, whether both conventional/granular paths change, and what happens on seat changes/LOD transitions. An invalid/empty profile is not an established silent profile and must not be deployed as such. `_SET_VEHICLE_SILENT` is only a separately labelled hypothesis because its documentation concerns door/horn effects.

Only after a supported copied-metadata route exists, consider a uniquely named engine-silent profile that preserves other references. Apply it to the controlled instance, never a shared bank globally. That candidate requires proof that all engine/intake/transmission paths needing ownership are isolated without collateral sound loss. Test restoration on explicit disable, source deletion, exception, renderer disconnect, pause, unload and recovery after a failed heartbeat. Never simulate a fatal crash by relying on a flag that may leave the game silent without a restart path.

**Acceptance:** targeted engine components measurably suppressed, unrelated target/sibling sounds preserved, original known state restored consistently, no persistent silent source on failures. Report residuals/noise floor and measured restoration latency. If this fails, no custom direct engine is enabled. A gradual distance handoff is deferred until ownership, synchronization and failure recovery are demonstrated. Native+RichAudio duplication is not a passing result.

## Shared acoustic experiment method

After P2-01/P2-02, first use owned synthetic source signals and simple owned geometry outside GTA. Then replay identical logged trajectories for each candidate renderer configuration. Compare unprocessed, direct-only, direct+early, and hybrid-tail versions; change one mechanism at a time. Record all geometry/material/source-profile hashes and settings. No headset/output changes between paired runs.

Measurements: band energy, direct/early arrival times, spectral centroid or band ratios, decay/EDT/T20 where supported, Doppler pitch tracking, time to update an obstruction, peak/limiter action, source count, simulation/DSP p50/p95/p99 and output starvation. Use blind/randomized listening pairs with fixed source level when comparing space; separate absolute-level tests for audibility. A recording of a completed game mix cannot isolate native and supplemental stems by itself.

## Scenario A — urban street canyon, inline-four motorcycle

- **Inputs/geometry:** traced and calibrated inline-four source profile (not automatically Bati), RPM/load confidence, vehicle orientation, camera pose, velocities, street facades, intersections, building heights and openings. First use one manually verified acoustic tile; indirect routes need adjacent tiles and portal/edge connectivity.
- **Expected:** strong direct suppression behind buildings; valid delayed facade/around-corner paths may dominate, with frequency-dependent losses and changing apparent arrival direction. Increasing load raises emitted spectral energy; reflections depend on the street, not source distance alone.
- **Components:** owned harmonic/granular engine and exhaust, directivity, partial occlusion, geometry-based early reflections, bounded hybrid tail, explicit diffraction/path approximation where validated. No generic outdoor reverb slider can substitute.
- **Measurement:** identical acceleration route with a fixed listener, then a corner-crossing listener. Compare first path delays to geometry, band energy and direction before/after emergence. Level-matched listening tests compare spatial signature; separate absolute tests assess audibility.
- **Feasibility:** INFERRED local scene possible from parsed collision; exact source mechanics, world transforms, indirect solver and clean handoff UNTESTED. Street-scale NPC availability may block a distant specific vehicle.
- **Performance:** prioritize that one target; at most four reflection sources, cached facade geometry, lower-rate distant updates; count early-path cache invalidations and seam errors.

## Scenario B — open countryside, V8 highway

- **Inputs/geometry:** independently traced V8 target/profile, source/load calibration, camera/source trajectories, grade, road/ground plane and sparse barriers; documented atmospheric assumptions. Do not claim class `muscle` establishes V8 mechanics.
- **Expected:** direct spreading dominates, high-frequency atmospheric loss increases with path length, load/RPM alter source power/harmonics, Doppler follows relative motion. Ground reflection can produce interference; enclosure tail stays low unless actual nearby geometry supports it.
- **Components:** owned source, band atmosphere/directivity, propagation delay, optional ground reflection and one Doppler implementation. Disable expensive room-tail processing for the open scene on evidence, not just distance.
- **Measurement:** constant-speed pass-bys in both directions and three acceleration/load conditions, listener at several surveyed offsets. Check direct gain change against analytic free-field reference in the synthetic version; distinguish game terrain effects. Track pitch trajectory separately from engine pitch and measured background masking.
- **Feasibility:** simplest renderer scene once telemetry/ownership pass; real physical RPM/load remains estimated until calibrated. Far NPCs may not exist in the streamed pool.
- **Performance:** one direct voice and sparse reflection; benchmark as baseline for all other scenarios. No full-resolution far-vehicle tracing.

## Scenario C — concrete tunnel, motorcycle entry/acceleration/exit

- **Inputs/geometry:** verified tunnel walls/ceiling/floor, cross-section, entrance/exit portals, local material priors, source/listener pose and relative velocity, engine state/load. Source type calibrated separately.
- **Expected:** distinct short early reflections inside, denser longer band-dependent decay, strong directionality along the tunnel; entry/exit transitions are continuous and tails survive exit. A tunnel is not necessarily a diffuse Sabine room.
- **Components:** direct path, repeated reflections under a bounce/time budget, hybrid or locally baked late response with portal-state validation, IR transitions and delay alignment.
- **Measurement:** owned impulse/noise tests in the offline mesh first, then consistent drive-through trajectories at two speeds. Compare early-arrival spacing, band decay and wet/dry ratio at mouth/midpoint/exit. Listen for clicks, tail resets, comb filtering and incorrect propagation into adjacent streets.
- **Feasibility:** a bounded static tunnel is promising for local extraction/baking; matching live portal/streaming state and handoff remains UNTESTED.
- **Performance:** cap IR duration/memory and convolution sources; cache/bake the static tunnel, update source/listener routing gradually; log worst-case tail cost on exit.

## Scenario D — interior listener, traffic outside

- **Inputs/geometry:** actual room/interior mapping, window/door aperture geometry and state, wall thickness/material priors, external source motion, chosen listener/camera pose and cabin/room distinction.
- **Expected:** solid walls reduce/highly filter exterior sound; openings supply distinct direct/indirect routes, with internal early reflections and late response. Opening a door changes transmission/pathing continuously; no universal 'indoors low-pass'.
- **Components:** portal/room graph, band transmission, owned external source and interior reflections, double-count prevention for transmitted and portal contributions. Later dynamic door instances invalidate cached paths.
- **Measurement:** repeated exterior pass-by at fixed indoor pose with door closed/open, then move listener through threshold. Offline two-room analytic/owned-geometry check precedes game scene. Measure band insertion loss, update delay, arrival paths and stable interior tail. Record native interior treatment separately to detect doubled filtering.
- **Feasibility:** parsed occlusion metadata supplies real portal/room identifiers, but not complete acoustic geometry or coefficient calibration; live room matching and source isolation UNTESTED.
- **Performance:** one/few dominant openings, cached static room response, dirty updates on door state; bound active portal search depth and IR allocations.

## Stop and reporting rules

Stop a run on game instability, unsupported build, unexplained collateral muting, stale source identity, sustained starvation or uncontrolled memory growth. Retain native audio wherever owned replacement is not validated. Store `PASS`, `FAIL` or `BLOCKED` with actual measurements and run IDs; planned thresholds are not results. Full acceptance of all four environments is a later roadmap milestone, not Phase 1 completion evidence.
