# My persistent Bati controller: offline readiness assessment

27 October 2026. **OFFLINE IMPLEMENTATION / SDK BUILD / SYNTHETIC TESTS PASS. LIVE READINESS BLOCKED.** I have not deployed this adapter, launched GTA/RPH, spawned a motorcycle or changed the game installation. Combined ACOUSTICS-05 + BENCHMARK-01 progress remains **60%**. This increment is preparation, not a completed benchmark or full-throttle result.

## Continuity and exact evidence boundary

I branched from PR #34, `research/benchmark-01-route-markers`, at `cd53aca77148d4784f0c8545c1096dd85fd9b76e`, after GitHub readback confirmed it was open, draft and unmerged. My new branch is `research/benchmark-01-persistent-bati-controller`, stacked on that exact parent. Main was freshly fetched at `3075037704371c6ac416d4b8c9f2c0df339a5600`. Its merged README/checklist work remains present; main's merge commit is a sibling of the research stack rather than its ancestor. I did not merge/rebase it or discard the newer research wording. Earlier PRs and the unsanitized archival checkout are untouched.

The real airport marker test already passed; this task does not repeat it. The new standalone loader read the actual private revision **3**, pinned to its prior SHA-256, session and provenance. It verified schema/build/units, all three poses, monotonic capture times, stationary/on-foot conditions, bounded coordinates, original derived lines and the unchanged **793.885462 native-unit horizontal chord**. Its input hash remained unchanged. No positions or private session IDs are published.

The endpoints remain vehicle-seat/player poses, not surveyed motorcycle contact points. The listener remains elevated on airport equipment. I preserve those heights exactly. `RouteCoverage: UNKNOWN`, `RouteClear: false` and `BenchmarkStartSupported: false` remain unchanged. A successful file load cannot upgrade any of them.

## What I implemented

| Component | Implementation and limit |
|---|---|
| `BatiData.cs` | Pinned historical marker loader, copied identities/observations, bounded policy, explicit route evidence and versioned private run record |
| `BatiController.cs` | Platform-independent one-attempt lifecycle, owned Bati/rider operations through an injected interface, selective tuning/readback, measured stationary start, checkpoints, deviation/stall/failure handling and independently acknowledged cleanup |
| `SpeedAnalysis.cs` | Actual copied velocity magnitude checks, derivative estimates, threshold crossing times, sampled/integrated distance, 3D listener relationship, gaps and declared steady-speed analysis |
| `BatiAdapter.Rph.cs` | SDK-compiled owned-operation primitives and copied telemetry; a readiness-only console/HUD entrypoint. Every runtime mutator first enters an unconditional closed gate |
| `Inspect-BatiReadiness.cs` | Standalone private-marker readback; no SDK loading, game inspection or deployment |
| Build/tests | Core and explicit pinned-SDK build modes, original C# scenarios, independent JS evidence/API-boundary checks and offline-suite registration |

This is not a fully wired live controller. The neutral controller currently admits **only original synthetic route evidence**. There is no runtime route-evidence producer, runtime enable configuration or approval command capable of unlocking mutations. `WorldOperations` is compiled but never instantiated by the readiness entrypoint. Its source is an inspectable integration candidate, not verified game functionality. The existing marker display remains unchanged; the new entrypoint presents cached readiness text only, not an additional geometry survey or a tested live run HUD.

## Reviewed SDK and native interfaces

I inspected the authentic local SDK as PE/CLR metadata without executing it: **1.124.1393.17586**, SHA-256 `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0`. The new core/bridge compile with warnings treated as errors against it. Static members establish vehicle/ped constructors, model and handle counter, `IsPersistent`, `WarpIntoVehicle`, driving tasks, `Delete`, position/velocity/orientation and engine/gear getters. Compilation does not prove those operations on runtime **1.132.1428.17748**, Enhanced **1158.16**. The last marker runtime versions are historical evidence, freshly matched against the retained sealed candidate; I did not run that package here.

Relevant public references were reviewed at [citizenfx/natives commit 64c6064](https://github.com/citizenfx/natives/tree/64c6064c488d6d6cf992840eccce49e447066472), alongside the historical [RPH VehicleModder documentation](https://docs.ragepluginhook.net/html/T_Rage_VehicleModder.htm) and [DriveToPosition overload](https://docs.ragepluginhook.net/html/M_Rage_TaskInvoker_DriveToPosition_2.htm). These references describe ordinary GTA interfaces, not proof of FiveM functionality in Story Mode or exact-build compatibility.

| Interface | What it establishes | What it does not establish |
|---|---|---|
| [Mod kit setup](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/VEHICLE/SetVehicleModKit.md), [kit readback](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/VEHICLE/GetVehicleModKit.md) | Kit initialization precedes indexed modifications; candidate checks kit zero | Runtime success on this Bati |
| [Count](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/VEHICLE/GetNumVehicleMods.md), [set](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/VEHICLE/SetVehicleMod.md), [get](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/VEHICLE/GetVehicleMod.md) | Query count, choose `count - 1` only if positive, then read back | Which upgrades this exact model/build offers; any top-speed benefit |
| [Toggle](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/VEHICLE/ToggleVehicleMod.md), [toggle readback](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/VEHICLE/IsToggleModOn.md) | Turbo request and on/off state interfaces exist | A reliable availability getter. A toggle category returning count zero is not proof turbo is unsupported |
| [Long-range driving task](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/TASK/TaskVehicleDriveToCoordLongrange.md) | AI destination, requested speed, driving flags and stop range | Full throttle, no braking, no natural wheel lift, straight trajectory or achieved speed |
| [Nodes loaded](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/PATHFIND/AreNodesLoadedForArea.md), [nearest node/heading](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/PATHFIND/GetClosestVehicleNodeWithHeading.md) | Possible navigation/streaming observations for a separately approved survey | Collision surface, route-wide clearance, an airport taxiway AI path or permission to move markers |
| [Travel-distance query](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/PATHFIND/CalculateTravelDistanceBetweenPoints.md) | A navigation estimate with documented failure/sentinel limitations | A certified motorcycle route; it may fail when path nodes are unavailable |
| [Collision indication](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/ENTITY/HasEntityCollidedWithAnything.md) | Candidate body-contact indication; wheels touching ground need not trigger it | Complete collision history; a future exact-build baseline still needs checking |
| [Script task status](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/TASK/GetScriptTaskStatus.md) | Task-specific status requires the correct script task hash | Inferring throttle or success from any-task status. The copied observation leaves task state unavailable rather than guessing a hash |

No navigation or collision native was called. Persistence is an entity-lifetime request, not proof of distant physics updates. Missing telemetry is never labeled despawn. The current runtime bridge reports simulation/interference **UNDETERMINED / UNKNOWN**, which cannot start the neutral run policy.

## Selective stock tuning

I allow only engine **11**, transmission **13**, brakes **12**, suspension **15**, and turbo **18**. There is no blanket `ApplyAllMods`, exhaust/cosmetic modification, handling edit, velocity setter, forced top speed, power multiplier, impulse or gravity change.

The injected tuning controller checks the benchmark-owned exact Bati hash (`F9300CC5`, matching the existing vehicle trace), initializes and reads the mod kit, validates counts in 0–128, applies only `count - 1` for positive indexed counts, checks identity again and records requested/observed values. Zero indexed count is explicit UNSUPPORTED; mismatch or exception terminates preparation and requests owned cleanup. The receipt survives partial tuning.

Turbo has a separate three-state availability contract: SUPPORTED / UNSUPPORTED / UNKNOWN. The real bridge currently returns **UNKNOWN**, because the reviewed interfaces do not establish availability independently. Thus it cannot claim maximum supported tuning or proceed to a live drive. Synthetic tests exercise all three cases and toggle disagreement. A future reviewed method must resolve this on the owned Bati rather than hardcoding support or treating zero toggle count as unsupported.

## Driving, route and speed contract

The illustrative task request is **60 native units/second**, style **63** (the reviewed stop/steer-around cars, pedestrians and objects flags), stop range **2**. Those conservative obstacle behaviors can reduce acceleration; they are not full-throttle control. The value is a **request**, never a speed measurement. No wheelie/trick task is issued and no physics change suppresses natural front-wheel lift.

The future driving task targets the finish and may brake as it approaches. The current two endpoints do not define an approved overshoot/braking zone. If it is still accelerating or starts braking at the finish, the record must say so; extending the course or moving markers is not automatic. No mechanical maximum can be inferred from a single maximum sample or steady interval.

Only an explicitly supplied, bounded **surveyed path** (2–32 points) can support the synthetic controller's checkpoint projection. Its first/last coordinates must equal the markers exactly; no road snapping is permitted. The controller checks distance to the current segment, ordered checkpoint proximity and backward/stalled progress. This is a research path-tolerance model, not a live route producer. In particular, a fabricated two-point chord must not be used as runtime route evidence.

The fixed listener retains its 3D elevation. A future actual player must remain within **0.25 native units**, with speed at most **0.25 units/s**. No teleport or camera change is provided. Current native units are not calibrated SI metres; I report native units/s and units/s² and provide no mph/km/h conversion.

I record copied monotonic times, bike/rider identity, source position/velocity/rotation, actual player pose/velocity, engine-on state, optional gear and raw RPM availability, mounted state, collision/task/world interruption flags and explicit simulation/interference classifications. Derived records include:

- Speed checked against the velocity norm; highest, starting and final valid samples.
- Pairwise acceleration estimates using actual time differences, not the nominal sampling interval.
- Threshold times at 10/20/30/40/50 native units/s, linearly interpolated only across valid contiguous samples; these thresholds are declared observations, not SI claims.
- Sampled polyline distance and trapezoidal speed-integral distance for valid pairs. Neither invents missing motion nor equals exact wheel travel. The marker chord remains a separate quantity.
- Fixed-marker 3D distance, source offset, source-minus-player velocity and radial relative velocity. No native listener orientation/acoustic rendering is implied.
- Gaps, interruption reasons, ordered checkpoints, path deviation and finish acceleration classification.

RPM stays **unavailable** even if a finite raw getter is present. I retain finite raw diagnostic values privately but do not convert constants, infer RPM/load/throttle from speed or change the production validator/schema.

### Declared research tolerances

These are configurable offline screening policies, not calibrated physical or perceptual thresholds. Their bounds are tested; widening them to force a live PASS is not supported.

| Policy | Default and rationale |
|---|---|
| Run budget | **120 seconds**, **2,500 samples**; retains the earlier finite research envelope with room for nominal 20 Hz plus endpoints. It is a cap, not a predicted 794-unit travel time |
| Gap | **0.25 seconds**; at the nominal 20 Hz target it rejects a gap of more than five periods. No derivative or crossing is bridged over it |
| Start | Within **1 unit** of the unchanged start, speed ≤ **0.25 units/s**; candidate setup check, not validated spawn geometry |
| Path / checkpoint | **3 units** deviation, **2 units** checkpoint/finish radius; explicit synthetic tolerance, requiring future route-specific review |
| Stall | **5 seconds** without more than 0.25 units of new projected progress; prevents an endless stuck AI attempt |
| Position discontinuity | Reject pair travel exceeding `(max pair speed + 2) × dt + 1` units; a declared consistency allowance, not proof of every physics update |
| Steady candidate | At least **3 seconds** of contiguous observations; every speed >0.5; forward projected progress ≥1.5; speed span ≤`max(0.5, 2% of mean)`; absolute least-squares slope ≤**0.15 units/s²** |

The steady criterion rejects stationary, steadily accelerating and strongly oscillating fixtures. It allows bounded sampling variation instead of exact floating-point equality. A MET result means **one declared interval** met the policy; it does not assert current full throttle or the bike's maximum possible speed. Later gaps/failures remain visible, rather than erasing the earlier interval.

## Lifecycle, persistence and cleanup

The neutral lifecycle distinguishes markers loaded, readiness, spawn requested, vehicle verified, tuning applied/read back, rider verified, armed awaiting measured baseline, accelerating/traversing, finish, outcome, cleanup pending and independently cleaned. READY does not imply approval. One explicit synthetic arm admits one attempt; terminal outcomes cannot retry or respawn.

Ownership combines run session, creation tag, model, handle and pool generation; the bridge also retains original RPH object references in its creation ledger. Every tune/task/delete rechecks ownership. Creation may be unresolved if an exception occurs after allocation; that uncertainty keeps cleanup pending. A foreign session, reused handle, unknown identity, failed deletion or unproven absence never permits deleting an unrelated entity or claiming CLEANED.

Rider cleanup precedes bike cleanup. Only verified-owned tasks are stopped. The independent post-delete inspection must return ABSENT. **The current real bridge deliberately does not equate an invalid RPH wrapper with proven absence**: it returns UNKNOWN and lacks an independently validated pool/lifecycle absence proof. This is a real live-readiness blocker. Normal plugin shutdown/finally handlers alone would not establish crash-safe entity recovery. No claims of crash-safe cleanup or continuously active distant simulation are made.

The run record keeps outcome separate from cleanup state, immutable copied samples/settings/upgrade receipts and lifecycle reasons. Files use fresh private create-new destinations with size bounds, no linked ancestry and no executable deserialization. An interrupted write is incomplete evidence, not a successful finalized run. Drawing only consumes cached strings; no acquisition, file write, spawning or mutation occurs in the drawing callback. This research implementation takes bounded copied snapshots and is not optimized/certified for an audio thread.

## Actual command interface: compiled, NOT tested in GTA

| Command | Current behavior |
|---|---|
| `RichAudioBatiLoad` | Read one pinned historical marker snapshot and save private readiness evidence; no route promotion |
| `RichAudioBatiStatus` / `Review` | Read cached readiness; no run result exists |
| `RichAudioBatiShow` / `Hide` | Show/hide cached readiness text only |
| `RichAudioBatiArm` / `Start` | Report **BLOCKED**, with no execution-enable option |
| `RichAudioBatiCleanup` | Report **BLOCKED**; the readiness entrypoint creates/owns no live entities |
| `RichAudioBatiAbort` | End readiness inspection and detach drawing |

There is no deployable live benchmark command sequence in this revision. A future plugin would also require exact Enhanced/runtime guards, offline Story Mode, a fresh private config/evidence directory, reviewed listener/camera/game interruption behavior, an approved finite attempt and sealed deployment/rollback manifests. None is staged in GTA here.

## Validation and performance

**148 original C# assertions** cover marker corruption/revision/provenance, unknown route/spawn/interference, one-shot approval, selective count-driven tuning, unsupported/unknown turbo, readback and partial failure, owned/foreign/reused identities, partial creation, detached/missing rider, collision/task/interruption, stale data, fixed listener, stall/timeout, immutable evidence, speed derivatives, gaps, thresholds and steady/accelerating/oscillating cases.

**409 independent JS checks** recompute the synthetic trajectory's velocity norms, distances and derivatives, check upgrade count/index receipts and separate finish/cleanup outcomes, and inspect compiled-adapter source boundaries for closed mutators, actual command names, cached drawing and absent physics/audio/traffic/geometry shortcuts. Static allowlist checks supplement behavioral tests; they are not formal security or runtime proofs.

The full current offline suite passed, including **126 Phase 1 checks, 65 telemetry assertions, nine configuration checks and eight append expectations**, with existing geometry/cache/traffic/marker regressions preserved. The separate unchanged source-synthesis checkout passed **219 Node tests**. Its history is not imported. A real private-marker load passed in the new standalone tool; no proprietary fixture enters CI.

One original synthetic measurement (100 independent controller lifecycles, 10,000 planned samples) recorded:

| Operation | Aggregate elapsed time |
|---|---:|
| Setup / marker parsing / synthetic creation+tuning | 14.296 ms |
| Controller telemetry + route + steady analysis | 60.089 ms |
| Cached diagnostic snapshot generation | 2.744 ms |
| Evidence snapshot + JSON serialization | 180.881 ms |
| Owned cleanup transitions | 0.124 ms |
| Whole controller fixture loop | 258.159 ms |
| Separate speed-analysis loop, 10,000 samples | 12.161 ms |

Managed heap observed approximately **6.93 MB**, process private memory approximately **26.91 MB**. These are whole test-process snapshots with runtime/fixture costs, not marginal controller memory. The fixture includes copied input creation and warm-up/GC effects; timings are descriptive, not speedup claims. Serialization costs exceed arithmetic in this small test. No disk/hosted/GTA/graphics/native-call performance, real-time suitability or city-scale performance is certified. [Sanitized preparation summary](../evidence/publication/bati-controller-preparation.json) identifies the measurement scope.

After tests, hashes still match for **4,857 protected source/audio files, 139 link targets, 1,045 earlier acoustics artifacts and the protected marker experiment files**. The source-synthesis checkout remains clean at its existing checkpoint. Read-only installation verification passed the exact **32-root / 179-archive-metadata / ten-sampled-hash** baseline, valid signatures/backup and all 27 temporary paths absent; GTA/RPH remain closed. No game mutation requires restoration in this task.

## RichAudio BENCHMARK-01 — Persistent Bati Controller: Offline Readiness Assessment

| Required question | Assessment |
|---|---|
| Actual implementation | Neutral controller, tuning/analysis/records/tests implemented; RPH bridge compiles but live execution is hard-disabled and not fully wired |
| Validated marker data | **PASS offline readback** of actual pinned private revision 3; historical measurements only |
| Route feasibility | **BLOCKED**: endpoints do not establish a drivable path; no runtime route producer |
| Airport course suitability | **UNVERIFIED**: start surface/heading/clearance, intermediate path and finish/braking space require separately approved survey evidence |
| Stock upgrades | API/source-supported and synthetic-tested; exact Bati categories and turbo availability **NOT TESTED** |
| Driving controls | Requested AI speed/flags supported from references/SDK; full throttle, path adherence and no unintended wheel lift **UNVERIFIED** |
| Full-throttle measurement | Actual velocity/acceleration can be measured; throttle itself remains unavailable, so achievement cannot be asserted |
| Wheelie limitation | No stunt request or physics override; natural lift is not prevented or live-tested |
| Traffic handling | **BLOCKED**: the prior partial calibration is preserved; this revision issues no density requests/deletion and cannot certify route-wide interference absence |
| Persistence | Ledger/generation safeguards synthetic-tested; lifetime request is not distant simulation proof |
| Proposed live commands | **None recommended**. Current Arm/Start/Cleanup commands cannot mutate the game |
| Maximum duration | Research run cap 120 seconds / 2,500 samples; not an estimate of course duration; inspection adapter cap 600 seconds |
| Planned telemetry | Copied actual source/listener poses, velocities, engine/gear/raw-RPM availability, continuity/validity, lifecycle and speed analysis; no fabricated motion |
| Cleanup/restoration | Synthetic cases pass; real independent absence/crash recovery **BLOCKED**. Future exact-file deployment and normal-shutdown rollback must be reviewed separately |
| Remaining blockers | Route/surface/clearance evidence, turbo support, independent runtime cleanup, simulation/interference producer and exact-build driving/spawn validation |
| Regressions/CI | Local suites pass; hosted status and exact published commit are reported in the PR after completion |
| Expected installed changes | **Zero now**. Future candidate would need its own reviewed manifest, replacing the observer pair only where justified; no final candidate/count is claimed |
| Recommend supervised motorcycle test? | **NO — BLOCKED.** Do not request or perform an unsafe run just because offline tests pass |

**One next direction:** prepare a bounded airport route/spawn-surface and interference survey design, with explicit observation budgets and cleanup-proof requirements, before asking for a separately approved survey. It must preserve these measured markers and may conclude the course cannot support the intended run. I do not start that survey, another launch or a controller-policy search here.

## Progress, publication and reproducibility

Controller-increment checkpoints are separate from the combined 60% baseline: **0%, 15%, 30%, 50%, 70%, 85%** were communicated during inspection, API review, safety design, implementation and regressions. The **95%** checkpoint covers final publication/CI review; **100%** is earned only after exact-head CI and remote readback. Completion of this offline increment does not change the live BLOCKED verdict.

Safe reproduction: run `./tests/Test-BatiController.ps1` or `./tools/Test-Offline.ps1`. For a local SDK build, pass an explicit authentic pinned SDK path to `./tools/Build-BatiController.ps1`; no game path is a build output. The standalone readiness executable takes a user's own private marker file, its expected hash/revision/session/domain and a fresh `.local` result path. Do not publish that private invocation or its raw coordinates/session details. Its marker filename is not embedded in public source.

Only original code, synthetic fixtures/tests, sanitized scalar evidence and documentation are published. No Rockstar audio/archives, raw marker files, personal paths, third-party SDK/runtime binaries or machine identifiers enter Git. The current publication audit and exact five reviewed historical GitHub identity exceptions are reported separately. No project licence is selected and no dependency redistribution permission is inferred from public documentation. Earlier research PRs remain unmerged.
