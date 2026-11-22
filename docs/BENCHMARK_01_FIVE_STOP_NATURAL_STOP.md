# BENCHMARK-01: My five measured airport stops and natural stopping

Reviewed: 27 October 2026. Stacked on the unmerged airport-survey PR #36 and controller PR #35. Combined ACOUSTICS-05 + BENCHMARK-01 progress remains **60%**.

## Decision and evidence

I've removed RUNOUT as a required marker or readiness prerequisite. I am retaining my actual START, MID1, MID2, MID3 and FINISH observations: **12 + 3 + 3 + 3 + 9 = 30 collision queries**. The failed sixth command does not erase these completed measurements. No sixth observation, new survey, GTA/RPH launch, spawning or new deployment was performed for this implementation.

The current private records are a later five-stop survey, distinct from the earlier 21-query interruption. The later RPH log contains the ordered five completions and the subsequent failed RUNOUT command. `closed.json` preserves all five completed stops and reports STOPPED with a generic InvalidOperationException; its exact failing predicate is not recorded, so I have not invented a cause.

`FiveStopRoute.Load` checks all five immutable cumulative snapshots and the closing record against six pinned SHA-256 values. It verifies the original schema, Enhanced 1158.16/RPH 1.132.1428.17748, session, revision-3 historical marker provenance, query plans, observation identity/timing, trace bounds and normals, cumulative counts, unchanged earlier records, and the original uncertainty classifications. It recomputes surface assessment. A separate JavaScript readback checks the saved observations and derived scalar results independently.

The derived candidate uses the five actual anchors in their observed order. The original START/FINISH/LISTENER records remain byte-identical. A separate measured centre ground hit is retained for initial spawn-height estimation; it does not relocate the original marker. Raw positions, sessions, source records and detailed receipts remain ignored and private.

| Evidence | Result and limit |
|---|---|
| Completed stops | Five; 30/36 originally authorised queries; no RUNOUT observation |
| Ground | All five PARTIAL_SAMPLED_SUPPORT; no continuous road certification |
| Body clearance | START partial lines, not a body-volume test; other stops not probed |
| Navigation | Nodes reported loaded at each stop, with candidate-only travel estimates |
| Historical nearby counts | 3, 4, 2, 3, 5; potential local interference, not a current clear route |
| Route | Approximately 793.885 native units between endpoints; sparse intermediate observations do not prove traversability |
| Continuous clearance / stopping space | UNKNOWN; removing RUNOUT does not turn either into verified geometry |

## Controller changes

My historical version-1 readiness mode remains read-only. Version 2 is an explicit one-shot research path, requiring a fresh separate approval receipt bound to a nonce, the exact built assembly and the derived candidate. It allows one run and two created entities, expires within two hours, and requires Story Mode. A durable create-new attempt record precedes spawning. Merely loading the plugin, supplying a candidate, or entering Start cannot provide approval.

The bounded route contract requires reviewed spawn placement, current monitored interference scope, the reviewed braking mechanism and ownership cleanup. It does **not** require a fabricated continuous-clearance certificate or RUNOUT. Legacy full-coverage synthetic fixtures retain their separate checks. General release/live-start certification remains false in the historical output flag; this is a separately approved research experiment only.

I create one persistent Bati and one persistent rider, and verify the saved full entity GUID, reuse counter, model and creation/session identity. I install a normal mod kit, query engine/transmission/brake/suspension category counts and apply the highest valid `count - 1` with readback. Unsupported categories remain explicit. One ordinary turbo-toggle/readback is permitted in the bounded experiment: an enabled toggle bit does **not** establish availability or physical effect, and a failed readback aborts. There is no handling edit, torque multiplier, wheelie task or forced velocity.

### Navigation hypothesis

I retain `TASK_VEHICLE_DRIVE_TO_COORD_LONGRANGE`, using one fixed documented driving-style combination: avoidance bits 63 plus `DF_ForceStraightLine` (16777216). The destination advances through the measured checkpoints using a 25-native-unit lookahead, while arrivals are independently recorded in order. This is an attempt to avoid inappropriate airport road-node detours without bypassing game physics. There is no automatic task fallback, invented intermediate point or alternate route search.

The requested speed is 60 native units/s. That is a task request, **not** measured speed, guaranteed full throttle or proof of mechanical top speed. The available distance may be insufficient for maximum speed. Airport navigation and the effect of this driving style on the exact build remain **NOT TESTED IN GAME**.

### FINISH and natural braking

FINISH detection uses the existing two-unit arrival radius or forward crossing of its checkpoint plane, within the three-unit route-deviation guard. The first accepted detection sample is recorded, including actual speed and position. I then issue the SDK's `GoForwardStraightBraking` maneuver (24) once, for at most 20 seconds. Its historical documentation specifies zero throttle, full ordinary brake and straight steering. It does not set velocity to zero.

The controller enters **Stopping**, continues genuine observations, and measures:

- Sampled path and trapezoidal speed-integrated distance after the first FINISH detection sample.
- Actual stopping/confirmation position, distance from the recorded FINISH marker and elapsed time.
- The beginning and duration of a consecutive measured speed hold at or below 0.25 native units/s.

Only a continuous one-second low-speed hold permits completion. Movement resets that hold. `StoppingSeconds` includes the confirmation hold; `StationarySince` separately identifies the first qualifying sample of that final hold. The exact sub-sample FINISH crossing and instant of physical zero speed are not measured.

Limits are 120 seconds for the whole run, 20 seconds after FINISH, 150 sampled native units after detection, a maximum 0.25-second telemetry gap, three-unit route deviation and five-second progress stall. The 150-unit limit is an **emergency abort cap**, not a surveyed run-out or promised safe braking distance. It must never be presented as clearance evidence. Stopping failure, continued movement, collision, interference, listener movement, identity uncertainty, writer failure or interruption produces failure/abort, never a successful stop.

## Current monitored scope and residual risk

There is no density suppression or unrelated deletion in this airport experiment. Before arming/starting, and at most four times per second during the run, a bounded streamed vehicle/ped/object screen inspects up to the next 100 native units of the current segment. During stopping it points forward along the final segment, rather than looking backward at FINISH. Model bounds are conservative potential-interference hints, not collision volumes. Low fixtures excluded by the explicit height screen are not certified harmless. Hidden collision, static world meshes, unstreamed/distant traffic, and future incursions remain unknown.

Pools exceeding 2,048 entities per category, invalid entities/bounds or the 25-ms soft analysis budget yield UNKNOWN and abort a running attempt. A single synchronous game call cannot be preempted by that soft budget. A cached scope result lasts at most the next scheduled quarter-second check. The HUD states **Traffic Isolation: OFF**, the observed interference status, and distant coverage UNKNOWN. A supervisor must assess the visible starting/approach/stopping area and use emergency Abort if it becomes unsuitable. No claim of an entirely traffic-free distant route is made.

This scoped research policy deliberately replaces the old impossible requirement for full continuous survey certification. It leaves genuine uncertainty explicit rather than scheduling another mapping exercise.

## Observation and cleanup

The listener stays at the original saved position. The bike must settle naturally near START before the first driving observation. There is no new ground trace or position correction. Approximately 20-Hz copied samples retain position, velocity, rotation, mounted/engine state, optional gear/raw RPM diagnostics, time and local interference. Acceleration, listener distance and threshold times are derived explicitly. RPM remains unavailable for synthesis; the original telemetry implementation and validator are unchanged.

A bounded 256-record worker queue writes private JSONL. Queue/write failure aborts. Display callbacks only draw cached text. Final evidence distinguishes run outcome, writer finalisation and cleanup.

Cleanup affects only the exact created rider and bike, rider first. Every mutation rechecks creation provenance. Post-delete verification queries `DOES_ENTITY_EXIST` using the **copied original full GUID**, independently of the invalidated managed wrapper, and also requires the wrapper to be invalid. A previously confirmed native creation plus both postconditions establishes observed absence at that query. Wrapper invalidity alone, unavailable/contradictory native results or a reused identity leaves cleanup UNRESOLVED; remaining mutations are withheld. This bounded check is not proof against every future handle-counter wrap or an inaccessible engine bug. Normal exit and independent installation restoration are still required.

## Proposed single supervised experiment — approval still required

1. Reverify the sealed private 27-path candidate, current executable signatures/hashes, baseline inventories, backups, absent deployment targets and no active GTA/RPH/file tools. Keep all existing survey data unchanged. Bind a fresh approval only after my separate go-ahead.
2. Temporarily deploy the same 25 reviewed RPH/loader/DirectStorageFix files plus this Bati assembly/config pair, using the previously validated executable-selection rename and offline launch configuration. Start RPH once into Enhanced Story Mode. No survey plugin, new framework, native audio change or additional ray is included.
3. Manually reach my saved listener. Review the visible monitored course and likely stopping direction. Load the Bati plugin, inspect Status and issue Arm; Start remains a separate command. Preflight refusal creates no bike. No retries are authorised after the one-shot intent.
4. Start one owned bike/rider, verify indexed stock upgrades and turbo-bit result, observe natural settling, then record ordered checkpoint progression. Abort on the stated guards or any unsafe situation. Do not compensate for failed navigation by teleporting, restarting or changing flags.
5. At FINISH, request maneuver 24 once and measure the overshoot/hold. Treat the first failed checkpoint as the result. `RichAudioBatiAbort` remains the manual emergency command.
6. Verify stream closure, final record and saved-GUID cleanup evidence. Unload, quit normally and restore all temporary files/names/configuration. Verify original root hashes/signatures, archive metadata, sampled archive hashes and absence of additions independently. Preserve unexpected outputs for inspection rather than deleting them blindly.

No additional airport mapping is requested. A successful run would establish only this controller trial, measured movement and stopping behavior, not full speed, road clearance, complete traffic isolation, acoustic propagation or audio ownership.

## Validation and preservation

- **PASS:** 88 original synthetic five-stop/provenance/approval/absence/writer/stopping assertions and 44 independent JavaScript arithmetic/boundary checks.
- **PASS:** 149 existing Bati assertions and 715 independent fixture checks, updated only for the explicit opt-in gate and natural stopping.
- **PASS:** complete relevant offline suite, including 76 airport-survey assertions / 236 independent checks, geometry/cache/traffic/marker regressions, 130 Phase-1 checks, 65 telemetry assertions, nine configuration and eight append tests. These are offline results, not live passes.
- **PASS:** all 219 source-synthesis tests in the separate unchanged sanitized checkout.
- **PASS:** pinned SDK compilation, SHA-256 `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0`; build proof only.
- **PASS:** 13 original current-survey files and their preserved snapshots; 67 earlier protected marker/preparation files; 4,857 source-research private files / 139 link targets; 1,045 earlier acoustics files. No existing accepted audio was overwritten.
- **PASS:** pending installation restoration completed before preparation: original 32 root files, 179 archive metadata entries and ten sampled archive hashes, executable signatures and all 27 temporary paths independently verified. One additional generated RPH log was preserved by hash outside the installation before its now-empty extra directory was removed. GTA/RPH were already closed; normal shutdown was not newly observed in this task.

Hosted CI and publication screening must be read back for the actual PR head before reporting success. No proprietary binaries, audio, raw survey records, coordinates, private paths or approval material belong in Git. The five previously reviewed historical committer-identity findings are tracked exceptions, not newly introduced leaks. No licence is selected here.

## Mechanism sources

- RPH historical [VehicleManeuver values](https://docs.ragepluginhook.net/html/T_Rage_VehicleManeuver.htm) and [driving maneuver API](https://docs.ragepluginhook.net/html/M_Rage_TaskInvoker_PerformDrivingManeuver.htm), checked against the actual pinned SDK signatures. Documentation is not Enhanced runtime proof.
- RPH [PoolHandle identity layout](https://docs.ragepluginhook.net/html/T_Rage_PoolHandle.htm): full GUID and finite reuse counter; preserve their limits.
- Cfx author-published ordinary GTA native references, reviewed commit `c00e0ed83d06dcba2457424ba254fbaa7a05bf7e`: [long-range driving and flags](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/TASK/TaskVehicleDriveToCoordLongrange.md), [braking action semantics](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/TASK/TaskVehicleTempAction.md), [entity existence](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/ENTITY/DoesEntityExist.md) and [deletion](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/ENTITY/DeleteEntity.md). These are ordinary native documentation, not a FiveM dependency or exact-build guarantee.

**Next action:** one separately approved, supervised five-stop Bati controller experiment. No new survey or second policy trial is proposed.
