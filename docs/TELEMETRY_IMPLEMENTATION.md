# P2-01 telemetry implementation

Status: implemented, compiled and offline-tested; the original approved adapter has now completed one live Enhanced 1158.16 Story Mode smoke capture. Player/NPC observations exist, but all operating-player/driver-present NPC RPM readings failed range validation. This is not full P2-01 certification. [Evidence and remaining gates](RPH_IO_FAILURE_INVESTIGATION.md). Acoustic rendering, source audio and native audio configuration are untouched.

## Components and build

The bounded [drivetrain diagnostic experiment](P2_01_DRIVETRAIN_VALIDATION.md) now confirms a constant out-of-range player RPM getter through user-controlled revving/driving, with partial gear-transition corroboration. Its separate, opt-in diagnostic schema leaves the production schema unchanged; do not infer physical RPM or silently normalize its raw scalar. The final capture/restoration results are distinct from the earlier recovery smoke test.

- `src/telemetry/Core`: runtime-independent model, deadline scheduler, tracker, SPSC queue, JSONL serialization and asynchronous writer. No `Rage` reference.
- `src/telemetry/Rph`: documented getter adapter and plugin lifecycle/commands. No LSPDFR reference, memory offsets or game setter calls.
- `src/telemetry/Analysis`: inspectable JSON summary of JSONL sessions, cadence, omissions, errors, lifecycle and sampled NPC distance bands.
- `tests/telemetry`: authored mocks, a recorded synthetic fixture, concurrency/integration tests and actual offline benchmarks.

Build using the installed x64 .NET Framework compiler:

```powershell
.\tools\Build-Telemetry.ps1 -CoreOnly
.\tools\Test-Telemetry.ps1
# With the reviewed authentic SDK present locally:
.\tools\Build-Telemetry.ps1
.\tools\Test-Telemetry.ps1 -BuildAdapter
```

The SDK path can be specified to the build script; its hash must match the reviewed pin. It is not copied to build output. No SDK stub substitutes for a missing dependency. The standalone core DLL, analysis executable and tests executable use the installed .NET Framework. To keep deployment small, the RPH plugin compiles the same core source into its own DLL; it does not need a second RichAudio DLL at runtime. Core source remains separately compiled/tested and replaceable behind `ITelemetrySource`.

## Schema and validity

Each JSONL record has schema version 1, kind, session ID, sequence and monotonic timestamp in seconds since plugin-session start. A session header records target rate/limits, Stopwatch frequency, actual loaded framework/game versions and coordinate assumptions. `sample`, `capture_stopped` and `session_end` carry observations/events; the footer carries final dropped/missed counters. Sequence gaps and queue drops must be examined together. A forcefully killed process can leave no footer or a partial line; the analyzer reports that capture incomplete.

Physical fields are `Field<T>` with **observed**, **estimated** or **unavailable**, units, origin, reason and nullable value. Observed means a getter returned a reading; it does not certify physical accuracy. Nonfinite values and invalid quaternions become unavailable. RPM values outside the documented 0–1 range are rejected by the adapter. Zero remains a reading and must be checked against visible engine behavior. The library never maps ratio to crankshaft RPM.

Listener position/rotation come from the final rendered camera and are explicitly a proxy for the native audio listener. Camera orientation is an estimated ZXY conversion; the current adapter lacks a native listener-velocity reading, so it uses a finite-difference estimate with gap/large-cut rejection. The tracker preserves a valid directly observed/adapter-provided velocity if a future source supplies one, rather than replacing it with that estimate. Vehicle position, rotation, quaternion, velocity, model, engine state, RPM ratio and gear are getter observations. Vehicle acceleration and source-listener distance are calculated/estimated. Engine load is **unavailable**, with an explicit reason: no calibrated estimator or reliable throttle/torque inputs have been established. Acceleration is not disguised as engine load.

Units are metres and m/s **assuming** GTA's coordinate scale; live unit/basis validation remains pending. Quaternions use GTA world Z-up coordinates; rotation labels state pitch/roll/yaw and order. Snapshot time marks acquisition start, not a claim that every property was read simultaneously. Acquisition duration is recorded. A downstream acoustic system can consume this model without using RPH types.

## Cadence and read budget

Default 20 Hz uses absolute monotonic deadlines. Late polls skip missed periods rather than issuing bursts. A cooperative RPH fiber sleeps between polls; a game stall cannot be overcome safely by calling natives from a background timer. Missed deadlines and schedule delay therefore remain honest measurements. Pausing/disable terminates active tracks and a fresh scheduler starts on resume, while session missed counters remain cumulative.

Vehicle discovery runs at most twice per second. Default source cap is 32, census-inspection cap 128, queue 64 records, and a **soft** acquisition budget of 2 ms. The current player vehicle has priority independent of discovery. NPCs are selected from the enumeration prefix; they are not claimed to be a distance-unbiased sample. AvailableCount is the most recent full array length from World.GetAllVehicles, with census age, examined/invalid count, truncation and omission indicators. This API call and individual getters cannot be preempted: the budget bounds subsequent RichAudio work, not the framework's own latency. Actual game timing is unmeasured.

Selection stops at limits and records omitted sources/budget skips. It never increases native population, pins entities, changes audio priority or modifies behavior to keep sources alive. Complete census membership is used for absence only if enumeration inspection finished. Truncated or skipped work cannot prove despawn. Omission fields on repeated samples describe the current selection/census, not unique omitted entities; summing them yields omission-observations only.

## Identity and lifecycle

The adapter uses full RPH PoolHandle.Value, including the SDK-exposed counter component, not a raw pool index. Raw handle/index/counter fields carry observed/unavailable validity for recycling analysis. The core creates a new session-local tracking ID on first sight, observed model change, explicit invalid/absent retirement, or a sufficiently long observation gap. Duplicate observations of a token within one sample are deduplicated; player/NPC classification does not create separate IDs for one vehicle. PlayerVehicle means the player's current occupied vehicle, not proof that the player is driving. DriverPresent is a separate public getter. Unknown player-role data and unoccupied vehicles are not silently labelled driven NPC traffic in the analyzer.

Recorded lifecycle distinguishes first observation, continued tracking (state field), unavailable telemetry, invalid entity, despawn-or-stream-out and termination. Framework invalidity/absence cannot establish whether a vehicle was destroyed or merely unloaded. The tracker expires unobserved sources after 0.75 s with an observation-timeout reason, not a fabricated despawn. Handle counter wrap or same-model same-token reuse with no observed gap can remain undetected; identity is not permanent world identity. Missing model telemetry is not interpreted as an observed model change.

Acceleration requires adjacent valid velocities within 250 ms and a plausible position continuity bound. It resets for long gaps/teleports/new identities. Listener velocity likewise resets for gaps and large jumps; small camera cuts may remain undetected. These estimates are useful diagnostics, not validated physics sensors.

## Buffering and shutdown

The single game-fiber producer publishes complete copied records into a fixed-capacity SPSC ring. It never waits for the consumer or overwrites queued records. A full ring drops the new record and increments a cumulative counter. Whole sample/event batches are dropped together. Memory use is bounded by queue/source caps, although DTO/string allocation and JSON serialization are not claimed allocation-free.

Only the background writer creates/writes/flushed JSONL files. Configuration is read once at plugin startup, not every sample. Serialization and disk IO do not occur in game acquisition. Writer faults stop acquisition rather than silently losing an entire session. Existing capture files are never overwritten. Captures default to `.local/captures` in the development workspace; output within game/tool roots or through existing reparse points is rejected.

Normal stop ends tracking; normal unload requests a drain and the RPH exit fiber polls for up to two seconds. It never blocks the game with Thread.Join. Forced unload/termination cannot guarantee drain/footer survival, and no sleeps occur in an aborted entry-fiber finally block. The generic writer's bounded Wait method is used by offline tests only. There is no audio state to restore on a failure.

## Offline analysis

```powershell
.\build\telemetry\RichAudio.Telemetry.Analysis.exe .\tests\fixtures\mock-session.jsonl
.\build\telemetry\RichAudio.Telemetry.Analysis.exe C:\path\capture.jsonl C:\path\report.json
```

The report includes **data-quality coverage** for the listener's position and velocity, selected vehicle positions/velocities/RPM-ratio readings (counts and percentages), the largest observed sample gap, distinct observed tracking IDs, empty-selection samples and samples reporting source-limit pressure. Denominators are **selected sampled observations**, not all vehicles GTA might contain. Zero observations yield a zero percentage, never evidence of complete coverage. The report also includes parsed/invalid/unknown-schema counts, session integrity, sequence gaps, non-monotonic sample/sequence flags, recorded drops/missed deadlines, p95 acquisition/processing/interval/lateness, selected/available maxima, omission/truncation counts, contexts, lifecycle kinds and NPC bands [0,25), [25,50), [50,100), [100,200), [200,400), [400,infinity) m. `Complete` concerns capture structure/order, **not** loss-free telemetry, supported runtime or successful gameplay. Inspect reported drops and other quality counters separately. ObservedSampleHz spans the first-to-last sample, including any paused/disabled gap; analyze separate marked uninterrupted captures for cadence acceptance.

The committed fixture is clearly labelled authored mock data. Its output distances and stable 20 Hz are not GTA results. NPC distance bands require observed non-player-vehicle status and a present driver; the broader maximum non-player-vehicle distance is reported separately, including unoccupied vehicles. The analyzer cannot infer accuracy of a frozen RPM ratio from field presence; compare zero/constant readings and visible behavior during tests A–E. It cannot measure frame impact or certify crash-free gameplay from telemetry alone.
