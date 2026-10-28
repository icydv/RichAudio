# BENCHMARK-01 — My stop-boundary diagnostic readiness

I've prepared an optional, read-only diagnostic for my moving Bati. **Offline readiness: PASS for task status and scalar speed; native vector comparison: NOT IMPLEMENTED pending sufficient marshalling evidence. The stop's cause remains UNKNOWN.** Combined ACOUSTICS-05 + BENCHMARK-01 progress remains **60%**. I have not launched GTA/RPH, deployed a plugin, requested another survey or changed the working driving policy.

## Evidence and ancestry

I verified [draft #45](https://github.com/icydv/RichAudio/pull/45) remains open and unmerged at `e0a451ec3bd12c504e20098d2ed35f73ed33f4ef`, stacked on [#44](https://github.com/icydv/RichAudio/pull/44). This branch starts at that exact head. I preserve both investigations and their ancestry.

The actual #44 capture, analysed in [my previous report](BENCHMARK_01_MOVING_BATI_STOP_ANALYSIS.md), establishes 73.537084 native units of position-derived travel. The positive observations span 1.633629 seconds. Reported speed falls from 58.111394 to zero across 56.5472 ms at observation time 38.075363, with identical reported position and rotation. The bike remains 226.688024 short of MID1. Gear changes, advancing game time and generic `InProgress` continue. There was no checkpoint advance, lookahead retarget or braking command. The stall watchdog runs out 5.014012 seconds after the last qualifying progress; it does not cause the earlier stop.

I have no demonstrated driving defect to correct yet. Simulation state, task lifecycle, navigation/avoidance, missed obstruction and selective getter staleness remain hypotheses. No result here proves a physics freeze, a streaming cutoff or a navigation bug.

## Selected interfaces and SDK review

| Interface | Evidence | Decision |
|---|---|---|
| `GET_SCRIPT_TASK_STATUS(Ped, Hash) -> int` | [Native reference](https://github.com/citizenfx/natives/blob/master/TASK/GetScriptTaskStatus.md); scalar invocation compiles against my pinned SDK | Sample the raw integer; do not drive control flow from it |
| `SCRIPT_TASK_VEHICLE_DRIVE_TO_COORD_LONGRANGE` | [Author-published task identifiers](https://alloc8or.re/gta5/doc/enums/ScriptTaskTypes.txt): `0x21D33957` | This is the **task argument**, not an invocation hash |
| `Rage.Task.GetTask(Ped, string)` and `.Status` | [Historical RPH contract](https://docs.ragepluginhook.net/html/M_Rage_Task_GetTask.htm); pinned metadata and compile-only probe confirm both declarations | Available alternative, not sampled alongside the raw native; no distinct additional information established |
| `GET_ENTITY_SPEED(Entity) -> float` | [Native reference](https://github.com/citizenfx/natives/blob/master/ENTITY/GetEntitySpeed.md); pinned scalar-call compilation | Compare with the existing wrapper velocity magnitude, retaining native units |
| `GET_ENTITY_COORDS(Entity, bool) -> Vector3` | [Native signature](https://github.com/citizenfx/natives/blob/master/ENTITY/GetEntityCoords.md) | Native exists; safe vector-return marshalling through this RPH build is not sufficiently verified |
| `GET_ENTITY_VELOCITY(Entity) -> Vector3` | [Native signature](https://github.com/citizenfx/natives/blob/master/ENTITY/GetEntityVelocity.md) | Same limitation; no calls, pointers or improvised layouts added |

The status-query invocation hash is `0x77F1BEB8863288D5`; the driving-task invocation hash is `0x158BB33F920D360C`. Neither replaces the `0x21D33957` task argument. The adapter uses the existing typed `CallByName` convention; the driving call remains `CallByName<uint>` with the same arguments. Historical [RPH native-call documentation](https://docs.ragepluginhook.net/html/Overload_Rage_Native_NativeFunction_CallByName.htm) recommends the dynamic convenience interface. I have retained our already reviewed invocation convention rather than changing the working driving call during observation research.

Community documentation gives raw task values 0–7 and describes 0/1/2/3/7 as waiting/performing/dormant/vacant/finished-or-not-found. The implementation stores raw numbers, including finite out-of-contract values as **UNKNOWN_INVALID_VALUE**, and does not translate them into a controller verdict. Missing, unsupported or throwing reads stay unknown. A returned 1 is not proof of physical movement. The wrapper's generic status remains separate.

My authentic SDK has file version `1.124.1393.17586`, assembly version `0.0.0.0`, and SHA-256 `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0`. The target remains Enhanced `1.0.1158.16` / RPH `1.132.1428.17748`. Static metadata exposes `GetTask`, `get_Status` and generic `CallByName`, but their method RVAs are zero in the reference assembly. Ordinary reflection encountered a reference-stub type-loading error; PE metadata reading and a separate compile-only probe verified the declarations without executing RPH. The probe also compiled `.GetTask(...).Status`. This does not reveal implementation bodies or prove live compatibility. Different SDK/runtime versions alone do not prove an ABI defect.

I found no sufficient version-specific vector marshalling contract in the inspected documentation/SDK. That is a limit of the available evidence, **not proof RPH cannot marshal vectors**. I've taken the smaller diagnostic explicitly permitted by this task. Direct position/velocity comparison and its live tests remain deferred. I have not claimed the new scalar reads are independent physics ground truth; native and wrapper getters may share an underlying game state.

## Optional observation contract

Experiment configuration remains version 2 / revision 3. The new `StopBoundaryDiagnostics` boolean is false when omitted. When false, the host creates no probe and performs no new native reads. A fresh reviewed binary, bound approval and sealed configuration are still required for any future deployment; this report is not that approval.

When enabled, the probe runs once at each existing approximately 20 Hz sample point. No extra polling loop or task reissue exists.

| Private field | Meaning |
|---|---|
| `Reading.StopBoundary` | Optional version-1 copied research record; older recordings remain readable |
| `Bike`, `Rider`, `IdentityStatus` | Full existing handle/generation/model/session/creation identities, verified before and after optional native acquisition |
| `WrapperStartedAt`, `WrapperEndedAt` | A bracket around existing wrapper acquisition, not simultaneous field timestamps |
| `TaskStatus.StartedAt/EndedAt/Raw/Availability/ExceptionType` | Sequential task-specific scalar read, raw result and safe failure type |
| `NativeSpeed` with the same timing/status members | Native scalar speed; negative or nonfinite results are unavailable |
| `NativeMinusWrapperSpeed` | Signed sequential difference; no invented agreement threshold or equivalence guarantee |
| `NativePosition`, `NativeVelocity` | Explicit `NOT_IMPLEMENTED_VECTOR_MARSHALLING_UNVERIFIED` markers, not zero vectors |
| `TaskRequestSequence` | Joins observations to the exact request receipt; pre-task samples carry zero |
| `Boundary` | Same-identity adjacent-sample displacement/speed deltas, unchanged position/rotation, movement threshold crossings, generic/specific status changes and native speed delta where valid |
| `StartedAt`, `EndedAt`, `OverheadMilliseconds`, `DisabledReason` | Optional acquisition cost and any latched shutdown of the observer |
| `final.StopBoundary.Requests` | At most five copied invocation receipts: destination index/name, requested speed/flags, monotonic request/return brackets, normal return or exception type, identities, and distance from the latest copied wrapper position with its observation epoch |
| `final.StopBoundary.LastObservation` and counters | Last diagnostic before controller termination/cleanup, call counts and measured aggregate/maximum acquisition time |

Receipt distance uses the latest copied position, **not a fresh simultaneous position at task invocation**. Request timing brackets the native invocation plus small receipt bookkeeping; it is not exclusive CPU timing. All new times use the existing experiment stopwatch. The historical `DrivingDiagnostic` timestamps retain their original semantics and are not silently redefined.

The first available task result after an invocation is the first `AVAILABLE` sample with that request sequence. Movement start/end and later stationary status changes are retained in the rows. The final sampled diagnostic can be joined to the unchanged controller footer's watchdog time/reason; no status query is issued after cleanup. A task exception is retained in the receipt even if no subsequent observation exists. A hard process crash before the footer flush may lose those in-memory receipts; ordinary completion/abort uses the existing writer/finalisation path.

Only same-identity observations with increasing epochs and a gap no larger than 0.25 seconds receive paired facts. The movement threshold is the existing 0.25 native units/s reference. A threshold crossing is not physical-stop certification. Specific statuses are compared only within the same request sequence. No optional field is consulted by the controller.

Each failing getter is latched off for this attempt, with no retry or fallback. Exceptions record the type only, never the message. Identity failure disables the optional observer; it cannot join a new entity to old diagnostics. Original ownership checks and guarded cleanup remain intact. Optional collection exceptions are isolated at the adapter boundary. Historical readings and queued records use deep copies, so later diagnostic mutations cannot change saved evidence.

## What this can and cannot distinguish

| Proposed boundary outcome | Current diagnostic reach |
|---|---|
| A: wrapper-only pose/velocity discontinuity | **Incomplete.** Scalar disagreement can support a discrepancy, but native pose/velocity are unavailable |
| B: both full representations stationary | **Not established.** Zero native scalar speed beside stationary wrapper readings is weaker evidence |
| C: specific task status changes near the stop | Raw change can be observed at the sampling interval; correlation is not causation |
| D: task appears active while movement stops | Retain the raw task result with wrapper motion and native scalar speed; active interpretation remains source-qualified |
| E: unavailable/inconsistent diagnostics | Explicit availability, exception, timing, identity and budget records |
| F: progressive deceleration | Existing sequential wrapper displacement/velocity and optional native speed deltas can corroborate a gradual sampled decline |

I reuse gear, engine-on, collision, mounting, game-time and generic task fields. I have not added a general physics inspector, on-ground detector, memory reader or unsupported simulation-mode claim. At roughly 50 ms cadence, events between samples may still be missed or temporally ambiguous.

## Cost and bounds

The enabled path adds two target native reads per sample and up to four existing `DOES_ENTITY_EXIST` checks through the before/after ownership guards: at most roughly 120 additional native invocations per second at 20 Hz. Other identity properties are also read. Actual game-side cost is **NOT TESTED**.

A fixed 2 ms observation budget is an overhead guard (4% of a nominal 50 ms sampling period), not a perceptual/physics threshold. It is checked after the initial identity guard and after the task read, and the total is recorded after final identity verification. Exceeding it disables subsequent optional reads for the attempt. It cannot preempt a blocking native call or prevent the first overrun. A final identity check is still needed to qualify already collected results. Maxima are 2,500 observations and five request receipts. Disabled mode performs no diagnostic clock/getter work. The established queue remains bounded at 256 copied readings and streaming disk writes stay on its background worker. No new dependency or sensitive-path disk write was introduced.

In the full-suite synthetic run, 10,000 original fake observations took **5.520 ms**, with **6,666,688 managed bytes** reported for the test process. This is a single local measurement with fake clocks/getters, excluding native calls, real entity checks and streaming serialization. It is not expected runtime overhead, a performance improvement claim or real-time certification. The live fields measure acquisition overhead; downstream copying/serialization costs and dropped-sample/queue behaviour still need observation in the bounded run.

## Implementation and validation

- `StopBoundaryDiagnostics.cs`: original scalar/identity/timing contracts, read-only collector, bounded receipts and paired facts.
- `BatiAdapter.Rph.cs`: opt-in instrumentation around the unchanged driving invocation and original wrapper capture; two read-only native queries.
- `BatiData.cs`: optional record plus deep-copy isolation.
- `BatiExperiment.Rph.cs`: opt-in construction and final diagnostic snapshot; same sampling, route, readiness, stall and cleanup rules.
- `Test-StopBoundaryDiagnostics.cs/.ps1`: **42 original assertions**, including 10,000 disabled-path repetitions, raw statuses and transitions, generic/specific disagreement, scalar agreement/disagreement, unavailable vectors, exceptions/no retry, timing, identity reuse, overrun/caps, abrupt versus progressive changes, copied writer evidence, historical records, controller stall and abort cleanup.
- `Test-Offline.ps1`: registers the new suite. `Build-AirportSurvey.ps1`: includes the new pure data dependency because the survey already compiles the shared `Reading` contract; no survey acquisition changes.

The first full run exposed that survey build-list dependency; it was corrected and the full registered suite then passed. Existing results include 155 Bati assertions / 715 independent checks, 28 driving-activation assertions, 132 mod-kit assertions / 191 checks, 88 five-stop assertions / 44 checks, 76 survey assertions / 236 checks, ten movement-analysis cases, 134 Phase 1 checks, 65 telemetry assertions, nine configuration checks and eight append cases. Other registered geometry/cache/privacy suites also passed. These are offline results only.

Native-vector agreement/disagreement fixtures are not represented as testing a runtime capability I did not implement. The vector-unavailable marker is tested. No direct vector layout or conversion has been invented to satisfy a test checklist.

Pinned-SDK compilation and the compile-only task-interface probe pass. `BatiController.cs`, `SpeedAnalysis.cs`, `FiveStopRoute.cs`, `ModKitDiagnostics.cs` and `ExperimentEvidence.cs` remain unchanged. The original driving API, flags, speed, task count, checkpoints, listener, tuning, turbo policy, 25-unit lookahead, five-second watchdog, FINISH braking, stationary hold and one-shot approval gates are retained. There is no RUNOUT dependency.

All **112 protected evidence files** (96 prior files, 12 older runtime files and four #44 runtime records) match their recorded hashes. The previous analysis files remain private. No GTA/RPH process was running on verification; no game files were read or written by this diagnostic implementation. No new installation/restoration claim is substituted for the previous verified restoration.

Index publication screening has zero findings and Git integrity passes. Reachable-history screening still reports exactly five previously reviewed `GitHub <noreply@github.com>` committer exceptions, independently checked against their metadata; no audit rule or history was changed. Hosted CI and exact remote readback are recorded in the accompanying draft PR after completion. Public content contains only original code/tests and sanitized findings. No raw captures, coordinates, private identifiers/paths, SDK/RPH binaries, approvals, audio or third-party code are published. I have not selected a project licence.

## My next engineering decision

I recommend **one separately approved supervised diagnostic run**, using this optional scalar/task probe and the unchanged saved route, listener, working controller and proven deployment/restoration procedure. It requires a fresh exact-binary approval and preflight; it does not require another survey. This offline work does not authorise the run.

The run would collect first post-request status, movement start, the stop boundary and watchdog termination at the existing cadence, without task retries or configuration switches. Successful diagnostic capture means qualified timestamps/identities, available raw task/speed observations and verified cleanup/restoration—not necessarily reaching MID1 or FINISH. Missing/disabled readings remain an inconclusive diagnostic outcome. If the same stop recurs, my smallest next action is to join that one capture's specific-task transition and native scalar-speed trace to the wrapper stop interval before selecting any driving correction. If both getters become stationary while task state persists, the cause remains unresolved; I will not declare streaming or navigation responsible without additional evidence.
