# BENCHMARK-01: My first moving Bati — stop and acceleration investigation

28 October 2026. Offline follow-on to draft PR #44 at `230f35b59318d1f4128cb4f8925df09051208187`, still open and unmerged at inspection. The existing recording tested runtime source `61743bceef6d31a4c2825eaaeb39c4b03c933fc6`, Enhanced 1.0.1158.16 and RPH 1.132.1428.17748. I have not launched GTA/RPH or written to the game installation. Combined progress remains **60%**.

## Decision

**My Bati genuinely changed its reported position over about 73.54 native units, but this recording does not establish why it stopped.** I can rule out ordinary arrival at MID1, the 25-unit lookahead, a controller-requested brake, a recorded destination replacement, and a premature stall decision causing the initial stop. No demonstrable driving implementation defect is identified. I preserve the working runtime unchanged.

The key new finding is an **abrupt reporting discontinuity**, not a gradual braking manoeuvre: speed changes from 58.111394 to exactly zero across 56.5472 ms, with precisely the same sampled position and rotation. That occurs almost five seconds before the watchdog fails. A gear reading changes at this boundary and changes again while position remains stationary. This is consistent with an entity/physics/task-state transition, but it does not identify one. I cannot certify a physical freeze, a collision, normal braking or a particular streaming mechanism from copied getters alone.

## Evidence and method

I located the actual private JSONL, final record, saved five-point route and four-file fingerprint receipt. All four hashes match before analysis; the 96 protected evidence files and 12 earlier runtime files also match. I use all 181 original raw observations and independently match each of the 120 accepted observations back to its exact raw record. The original report, recordings, public scalar evidence and approval records are not rewritten. The route's saved source fingerprint is checked separately against the deployment manifest.

`tools/Inspect-BatiMovement.mjs` accepts explicit ignored private paths and verifies the four recorded sizes/hashes before analysis. It rejects linked paths, existing output directories, oversized inputs, malformed/missing evidence, duplicate timestamps and mismatched accepted records. It writes only new private diagnostics. `tools/benchmark/movement-analysis.mjs` contains framework-independent arithmetic and original synthetic tests. It calculates distances from original XYZ samples, velocity magnitudes, interval derivatives, trapezoidal integration, vector displacement residuals, first-segment projection and state transitions. It neither changes a controller guard nor calls a game API.

The public scalar result is [moving-bati-stop-analysis.json](../evidence/benchmark/moving-bati-stop-analysis.json). Full per-pair diagnostics remain private. Values below retain **uncalibrated native game units**; I make no metres, km/h, real acceleration or power conversion.

## Actual chronological timeline

Times are copied monotonic observation epochs in seconds, not exact CPU call times. Native getters are sampled sequentially, not an atomic engine snapshot.

| Time | What I can establish |
|---:|---|
| 32.7367423 | Start accepted, as preserved in #44; setup/readiness precede driving |
| 36.3290993 | Stationary accepted observation; first driving request and normal return recorded at the same observation epoch; generic status still NoTask because it was copied before invocation |
| 36.3851870 | First positive speed/displacement; generic status becomes InProgress; speed 2.281089 |
| 36.4414129 onward | Sustained measured acceleration; the central ramp's finite differences are approximately 70.69–71.18 units/s² |
| 37.2306424 | Highest reported speed 58.177933; 0.9015431 seconds after the stationary accepted observation |
| 37.2869614 | First negative speed derivative, a small decline from the peak; not evidence of a deliberate braking task |
| 38.0188158 | Last positive speed 58.111394 and last qualifying route progress; projected progress 73.408274 |
| 38.0753630 | First exact zero velocity and no new position displacement; gear reading 0 → 1; task remains InProgress; game time advances 56 ms |
| 39.0897505 | One-second stationary reporting suffix can first be confirmed retrospectively using the unchanged 0.25 speed / one-second diagnostic definition and unchanged sampled position |
| 40.1031654 / 40.6103005 / 42.6949140 | Gear readings 1 → 0 / 0 → 1 / 1 → 0 while position, rotation and velocity remain unchanged |
| 43.0328279 | Controller terminates for `stalled progression`, 5.0140121 seconds after last qualifying progress; cleanup follows |

There are 30 positive moving raw readings. First positive motion to last positive observation spans **1.6336288 seconds**; stationary accepted observation to first zero spans 1.7462637 seconds. The zero-speed, unchanged-position suffix contains **89 accepted observations** and spans **4.9574649 seconds**. The last moving observation shares its position with that suffix, so 90 accepted positions in total are identical at the end. This distinguishes last displacement, last positive reported velocity, first zero reading, sustained reporting confirmation and controller stall.

The recorded velocity's finite-difference drop is **−1027.661736 native units/s²**. This is a derivative of sampled readings, not a measured force or proof of extreme physical braking. The earlier summary's 13 decelerating pairs include tiny near-cruise decreases and this abrupt collapse; the count must not be read as evidence of 13 samples of conventional braking.

## Acceleration and displacement consistency

| Independent calculation | Result |
|---|---:|
| Position-derived path | 73.537083997 |
| Integrated speed distance | 74.665393545 |
| Difference | 1.128309548, about 1.5112% of the integral |
| Largest position step | 3.303596957 |
| Largest position-derived interval speed | 58.519665800 |
| Maximum reported speed vs double-precision velocity-magnitude difference | 0.000001985 |
| Accepted observation interval range | 55.7143–57.1250 ms |
| Accepted game-time increments | 56–57 ms; no missing clock pairs |
| Accepted stale gaps | 0 |
| Maximum moving-phase vector integration residual | 0.172115835 units per interval |
| Largest vector residual, at zero-speed collapse | 1.643018318 units |

During the moving phase, displacement-minus-trapezoidal-speed-distance residuals range from −0.022634125 to +0.077184867 units per pair. At the collapse, the trapezoid predicts 1.643018302 units of travel, but position is exactly unchanged. That single boundary dominates the largest residual. Trapezoidal integration assumes an intervening velocity shape that is not observed here; its mismatch is not proof of a teleport.

The high-speed portion has repeated approximately 3.27-unit position steps, rather than one large relocation. The observed position ramp corroborates the velocity ramp. There is no detected position jump under the existing loose continuity guard, no observation-time gap, and no evidence that a single bad velocity sample alone created the apparent motion. Speed is computed directly from `v.Velocity`, not an independent speed native; their close magnitude agreement is an arithmetic check, not independent physical instrumentation. The small difference is compatible with float arithmetic in the existing adapter and double arithmetic offline.

Yaw settles near −122 degrees following the initial steering adjustment; total recorded yaw range is approximately −122.036 to −114.633. Position moves along the first route segment with at most 0.390546 recorded deviation. Initial-to-last-moving vertical change is −0.427802 native units. These observations support a coherent sampled path. They do not validate tyre contact, traction, simulation mode or true engine power. After the stop all three position and rotation components are exactly unchanged, while gear getters continue changing: an entirely repeated JSON record is not the explanation, but selective getter/simulation staleness remains possible.

**Acceleration verdict:** corroborated rapid *reported motion*, unknown physical mechanism. I do not classify it as impossible solely because it is large, and I do not call it verified Bati performance merely because velocity and position agree. An acceleration/physics-mode anomaly shared by both getters is still compatible with the data.

## Destination, controller and task review

I inspected `BatiController.cs`, `BatiAdapter.Rph.cs`, `BatiExperiment.Rph.cs`, `BatiData.cs` and `SpeedAnalysis.cs` at the tested source.

- START → MID1 is **300.096027426** units. Final/minimum MID1 distance is **226.688023874**. The bike approaches the correct segment but stays over 201 units outside the lookahead threshold and over 224 units outside the task's 2-unit stopping radius.
- The initial controller destination is `route.Points[1]`, MID1, using the route checked against saved survey records. The adapter forwards float XYZ, requested speed 60, flags `63 | 16777216`, and radius 2. No alternative destination or listener coordinate is substituted. Actual native-internal task state/destination is not read back, so source dispatch is stronger evidence than generic status but not proof of internal path selection.
- `taskCheckpoint` and `checkpoint` both begin at 1. A lookahead task requires distance ≤25; checkpoint completion requires distance ≤2 or crossing the target plane. Neither occurs. The lifecycle contains one initial task request, zero lookahead entries, zero observed checkpoint entries and no braking request. Independent projection differs from recorded progress by at most 1.42e−14 units. I find no wrong projection, premature waypoint completion or controller task overwrite explaining this recording.
- Progress refresh requires an increase greater than 0.25. It refreshes through 38.0188158, then correctly expires after five seconds without progress. The stop predates expiry. FINISH is never reached, so the controller's braking and cleanup cannot explain the earlier stationary reporting interval.
- `OBSERVED_CONTIGUOUS` means acceptable sample gap and a permissive displacement bound. It does **not** measure active physics, prove all displacement plausible, or detect stationary simulation. I retain that historical field and qualify its meaning.

The [community-maintained ordinary native reference](https://github.com/citizenfx/natives/blob/master/TASK/TaskVehicleDriveToCoordLongrange.md) defines the destination/radius signature and flag bits. The retained mask includes stopping/avoidance for vehicles/pedestrians/objects and ForceStraightLine. It does not guarantee a navigable straight route on this airport surface. These are source/documentation findings, not a newly verified Enhanced native implementation. No driving API, flag, speed, radius or task cadence is changed.

## What the negative checks miss

All accepted observations report console closed, game unpaused, rider mounted, engine on and no collision flag. Task changes from NoTask to InProgress immediately after invocation and stays InProgress through the stop. The game clock continues advancing. These rule against a recorded console/pause transition, rider loss or engine-off event, but do not prove that the long-range task is the active task or that distant vehicle physics keeps updating.

`Scope()` enumerates available vehicles, peds and objects within the current scene pools, excludes exact owned entities and screens a corridor capped at 100 units toward the current target. It has 2048-member pool caps, a 25-ms budget and approximately 250-ms refreshes; its last result is reused between refreshes. It excludes low object fixtures and does not query static map collision geometry, unstreamed entities, all junction inflows or the entire 300-unit segment. NONE_OBSERVED_IN_MONITORED_SCOPE therefore cannot certify an unobstructed road. A false [collision getter](https://github.com/citizenfx/natives/blob/master/ENTITY/HasEntityCollidedWithAnything.md) is also not proof of no obstacle, avoidance or contact between observations.

Listener distance decreases from 505.720555 to 433.033806 units. Persistence and mounting stay true. Abrupt zero velocity with unchanged pose at that distance is compatible with a simulation-state change, but there is no recorded physics/streaming-mode getter, controlled distance comparison or close visual observation. I cannot attribute the stop to distance or identify a universal distance threshold.

## Ranked explanations

This is a diagnostic priority order, not measured probabilities. No root cause is CONFIRMED or PROBABLE from the available evidence.

| Rank / explanation | Supporting evidence | Contradictory or limiting evidence | Confidence / smallest discriminator |
|---|---|---|---|
| 1 — Vehicle simulation/physics-state transition, potentially distance-related | Abrupt synchronized pose/velocity collapse, unusually regular fast ramp, gear transition, distant source | Clocks and gear continue updating; bike previously moved; no simulation-mode or close-view evidence | HYPOTHESIS; compare native-backed pose/velocity with RPH and specific task status at the same boundary before considering a separate distance experiment |
| 2 — Navigation/avoidance behaviour under retained task/flags | Task is navigation-driven on airport surface; avoidance bits retained; static obstacles and road-node choices not fully observed | Still 226.69 units from target; no local interference/collision reported; sudden collapse is not a documented normal destination stop | HYPOTHESIS; record the specific script task status and issued destination/clock without changing task strategy |
| 3 — Specific driving task became dormant/finished/replaced | Generic InProgress cannot identify our task; no task-specific history | No controller reissue, brake or checkpoint event; generic task remains active | HYPOTHESIS; query the actual script task hash, preserving raw status and UNKNOWN on failure |
| 4 — Missed obstruction/contact or unexpected vehicle state | Scoped pools omit static world collision and transient contact; no damage/contact/airborne-state history | No collision flag, rider loss or route deviation; repeated exact pose lacks visible confirmation | HYPOTHESIS; task-specific/native observation first; do not add a survey or infer collision |
| 5 — Selectively stale or inaccurate getters | No direct native pose/velocity comparison; known separate RPM defect warns against trusting every getter | Position and velocity strongly agree while moving; gear updates during standstill; raw and accepted records agree | HYPOTHESIS, weaker as a complete-record explanation; compare direct native and wrapper observations |
| 6 — Destination/checkpoint/watchdog implementation caused stop | Would be a simple software explanation | Target is still far away; no lookahead/checkpoint/brake; projection matches; stall occurs later | CONTRADICTED for these specific mechanisms in this recording; no correction justified |

## Narrow implementation and validation

I add only the offline analyser, original synthetic tests, test registration, sanitized scalar evidence and this report. Runtime code, tuning, route, listener, driving behaviour, default settings and cleanup remain byte-identical to #44. There is no new live diagnostic adapter in this PR.

Tests distinguish missing/mismatched evidence, known displacement/integration arithmetic, velocity-only spikes, position jumps, magnitude inconsistencies, gaps, clock absence, resumed motion, stationary drift, task/gear transitions, deterministic output, hash failure, overwrite prevention and private-path/link rejection. All **ten original synthetic tests pass**. The full registered offline suite passes, including 28 activation assertions, 155 Bati assertions / 715 independent checks, 132 mod-kit assertions / 191 independent checks and 88 five-stop assertions / 44 independent checks. Running the full local suite is justified here by the new executable analysis utility and its registration; hosted CI uses that same verification policy. Authentic pinned-SDK compilation also passes, without deployment. Runtime source hashes and the route/marker receipts remain unchanged. Hosted exact-head CI is recorded after execution in the PR; no future pass is assumed.

Reproduce locally using relative private paths:

```text
node tools/Inspect-BatiMovement.mjs .local/<session>/run-evidence .local/<session>/runtime-fingerprints.json .local/<fresh-analysis>
node --test tests/Test-BatiMovementAnalysis.mjs
```

The analyser is intentionally scoped to a recording that remains on START → MID1. Its first-segment recomputation is not a generic multi-checkpoint certifier. It can expose inconsistency; no residual threshold here authorizes or rejects a live run. No chart or audio is required to identify this particular abrupt boundary.

## One proposed next live experiment — not executed or approved here

My next engineering direction is a **read-only boundary diagnostic**, preserving exactly the existing activation, task, route, upgrades, listener, watchdog and cleanup. Before requesting a fresh single supervised attempt, separately review/compile an optional diagnostic that records the issued task destination and native-call timing privately, the raw status of `GET_SCRIPT_TASK_STATUS` for the owned rider's long-range script task, and near-contemporaneous direct-native position/velocity alongside RPH readings. The public [status signature](https://github.com/citizenfx/natives/blob/master/TASK/GetScriptTaskStatus.md) and [task-hash enumeration](https://alloc8or.re/gta5/doc/enums/ScriptTaskTypes.txt) identify `SCRIPT_TASK_VEHICLE_DRIVE_TO_COORD_LONGRANGE = 0x21D33957`; this is the script task identifier, not the invocation native hash. [GET_ENTITY_COORDS](https://github.com/citizenfx/natives/blob/master/ENTITY/GetEntityCoords.md) and [GET_ENTITY_VELOCITY](https://github.com/citizenfx/natives/blob/master/ENTITY/GetEntityVelocity.md) describe the candidate read-only pose calls.

These community API descriptions do not establish exact-build runtime validity. New getters must be SDK-checked, bounded, timestamped and exception-safe first; unavailable values stay UNKNOWN. Preserve raw task-status integers rather than translating ambiguous results into acceptance. Reads are sequential and share the same game subsystem, so agreement is useful but not independent physical ground truth. Record call overhead so extra diagnostics cannot silently undermine the observation budget. No binary is deployed by this milestone.

A separately approved test would still consume one Start, close F4, retain the five-second stall guard, and stop/clean up even if the same failure recurs. Task status changes versus native/wrapper agreement would discriminate task lifecycle and wrapper staleness; agreement plus active-looking task would leave navigation/physics causes unresolved. It would not prove streaming merely by elimination. No altered driving method, artificial motion, camera relocation, new survey or second comparison run is proposed. Normal shutdown, exact 27-file removal and original baseline verification remain mandatory.
