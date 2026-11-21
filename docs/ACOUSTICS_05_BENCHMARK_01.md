# ACOUSTICS-05 + BENCHMARK-01: offline foundations and live-readiness stop

27 October 2026. I've prepared bounded walking, traffic/benchmark safety models and an installation-aware tile-cache foundation. **I have not launched GTA, deployed a new plugin, spawned the Bati or changed traffic.** My mandatory traffic-free condition prevents a justified supervised test at this checkpoint.

| Component | Scientific verdict | Evidence boundary |
|---|---|---|
| ACOUSTICS-05 | **BLOCKED for the combined live experiment; offline contract tests pass** | Manual stop/expiry/provenance model exists; no new walking adapter, live overlay integration or observations |
| BENCHMARK-01 | **BLOCKED** | No validated real route coordinates or verified route-wide traffic isolation; synthetic controller only |
| Persistent-cache foundation | **PASS OFFLINE** | Bounded synthetic roundtrip, historical state, compatibility/invalidation and corruption handling; no runtime integration |

The blocker is a missing readiness proof, not evidence that RPH cannot support a future solution. The independent outcomes are not averaged into an overall PASS. My acoustic-source renderer, telemetry schema, invalid-RPM rejection and native-audio ownership gate remain unchanged.

## Continuity and reviewed baseline

This branch descends from PR #30, `research/acoustics-04-multisurface-visual-debug`, commit `5eca9bd7a51fd76293d1caa88828f79011659f3f`, still open and unmerged when checked. PR #28 is now merged; current main is `3075037704371c6ac416d4b8c9f2c0df339a5600`. I've preserved its accepted ACOUSTICS-04 README wording while retaining newer branch findings. No PR is merged/rebased here. Earlier ACOUSTICS-01/02/03/04 findings and their limits remain in their existing reports.

The separate source-synthesis checkout remains at `24e1be70eb75c8f7b43e95fe495d3c71dba5dc42`; its complete offline suite is checked separately without importing its ancestry. The unsanitized archival repository is not changed.

## Weighted progress: stopped before live readiness

| Stage | Available | Earned at publication | Actual scope |
|---|---:|---:|---|
| Review | 10% | 10% | Repository/history, earlier evidence, installation and architecture reviewed |
| API/route/safeguards | 15% | 15% | Research completed with explicit traffic/route blockers |
| Offline implementation | 25% | 20% | Synthetic models/cache tested; live adapter, actual preset and integrated overlay deferred |
| Approved live experiment | 20% | 0% | Not requested: prerequisites fail |
| Independent runtime validation/restoration | 15% | 0% | No run; offline preservation checks do not earn live credit |
| Reports/publication/CI | 15% | Pending final readback | Earn only after the exact published revision passes checks |

Communicated checkpoints before publication: **0%, 10%, 25%, 45%**. No 50% readiness checkpoint or implied launch approval is claimed. Final progress is **60% only if publication, preservation and hosted CI finish**; otherwise it remains below that. This is an explicitly stopped combined milestone, with a completed offline cache component. No live-test progress is awarded for cache work.

## Supported API evidence and the traffic gate

The authentic pinned SDK was inspected statically, without loading/executing it: version `1.124.1393.17586`, SHA-256 `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0`. It exposes vehicle/ped constructors, entity persistence/delete/dismiss, `WarpIntoVehicle`, driving-task overloads, vehicle enumeration and path-node helpers. These are signatures, not new exact-build runtime validation. The working runtime remains RPH `1.132.1428.17748` on Enhanced `1.0.1158.16` from earlier supervised work.

Public native references were pinned to [citizenfx/natives commit 64c6064](https://github.com/citizenfx/natives/tree/64c6064c488d6d6cf992840eccce49e447066472). They are source-backed interface references, **not FiveM-only configuration or proof of Story Mode behavior on this build**.

| Candidate | What the evidence establishes | Missing guarantee / decision |
|---|---|---|
| [Vehicle density this frame](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/VEHICLE/SetVehicleDensityMultiplierThisFrame.md), [random](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/VEHICLE/SetRandomVehicleDensityMultiplierThisFrame.md), [parked](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/VEHICLE/SetParkedVehicleDensityMultiplierThisFrame.md) | Per-frame multiplier interface; requests can cease without persistent setting changes | No proof that all generators/dispatch/junction entries are excluded; existing vehicles remain. Candidate request only, not ACTIVE evidence |
| [Vehicle generators in area](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/VEHICLE/SetAllVehicleGeneratorsActiveInArea.md) | Area parameters and two booleans | Boolean semantics/prior-state restoration not established. Not used |
| [Dispatch service toggle](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/MISC/EnableDispatchService.md) | Service enable/disable interface | Persistent global effects and no reviewed prior-state getter. Blindly enabling everything is not restoration. Not used |
| [Scoped dispatch blocking](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/MISC/AddDispatchSpawnBlockingArea.md), [angled variant](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/MISC/AddDispatchSpawnBlockingAngledArea.md), [remove handle](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/MISC/RemoveDispatchSpawnBlockingArea.md) | Scoped add/remove interfaces exist; they must not be overlooked | Thin documentation, `Any` handles, exact-build scope/lifetime/crash recovery/effectiveness unresolved. No use or global reset |
| [GetAllVehicles](https://docs.ragepluginhook.net/html/M_Rage_World_GetAllVehicles.htm) / per-entity checks | Currently available vehicles can be examined; identity must be rechecked after yielding | No guarantee of complete distant streaming/simulation or every future junction entrant |
| [Nodes loaded for area](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/PATHFIND/AreNodesLoadedForArea.md), [closest node](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/PATHFIND/GetClosestVehicleNodeWithHeading.md) | Navigation data/query interfaces | Navigation availability does not certify collision, population, road safety or acoustic coverage |
| [Drive to coordinate long-range](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/TASK/TaskVehicleDriveToCoordLongrange.md) / [RPH DriveToPosition](https://docs.ragepluginhook.net/html/M_Rage_TaskInvoker_DriveToPosition_2.htm) | Destination/speed/behavior interfaces | AI can deviate; checkpoints do not force a deterministic path or uninterrupted distant simulation |

The Legion Square objective remains **Vespucci Boulevard → Legion Square → east towards La Mesa**. No reviewed private record establishes exact approved spawn/listener/checkpoint coordinates and whole-route observability. No invented preset or substitute route is shipped. A node ID or persistence flag cannot certify safe placement, continued physics or audibility.

**My clarification during this investigation:** I authorize blanket suppression of naturally occurring traffic during the benchmark phase. The candidate per-frame density requests are therefore allowed to be game-wide while that phase is active; area-only suppression is not a requirement. This removes a scope ambiguity, but does not establish the requests' runtime effectiveness, remove existing vehicles or waive route/interference/restoration checks. No live changes are made under this clarification, and my separate launch approval remains required. Frame-only requests are preferred over unverified persistent global toggles because they can stop on phase exit; normal spawning must still be observed independently afterward.

Existing moving, parked, emergency and junction-entry vehicles must all be considered. I will not clear them by class, delete unrelated entities, alter persistent population settings or claim a distant road is empty from a local enumeration. If an existing vehicle obstructs the approved corridor, the benchmark must remain blocked. Only benchmark-owned entities may ever become cleanup candidates.

**Hard stop:** reliable reversible isolation, route clearance within actually observable coverage, junction ingress monitoring and independent normal-traffic restoration have not been established together. Thus no launch-ready 27-file manifest is sealed, no deployment approval is requested, and no runtime traffic restoration is claimed. No game state was changed that needs traffic restoration.

## Implemented ACOUSTICS-05 model

`walking-tile.mjs` reuses the existing nine-ray planner and independent group/plane validation. The proposed `manual-three-stop-v1` uses three stops (wall, ground, wall), at anchor-relative right offsets 0, 1.5 and 3 native units. These are local research offsets, **not validated GTA route coordinates**. The eventual location must support all stops safely and be separately approved. The total permission budget is 27, below the existing ceiling of four stops/36 rays. The cache adds no queries.

Only an explicit stop claim followed by a per-query permission can consume a ray. Walking, camera movement, snapshots, cache loading and replay consume none. Stops cannot be repeated after failure to hide extra queries. Acquisition provenance verifies session, interior, expected pose/forward, source generation and consumed budget; each group is independently screened by the retained fitter. Separate candidates are not merged merely because they are nearby.

The synthetic display snapshot carries listener, group/candidate counts, original inferred patches and unknown coverage. A one-second **research freshness policy**, not proof of world permanence, labels recent support `current-inferred`; then it is historical. Session/interior changes or departure beyond the bounded 16-unit anchor neighborhood invalidate without rescanning. Material, true edges, between-ray solidity and physical metres remain unknown.

There is no new RPH walking adapter or new live debugger command in this revision. ACOUSTICS-04's tested adapter/drawing path is preserved. Future integration must project these immutable states into its existing optional bounded primitives and explicitly distinguish current-inferred, historical and invalid. The existing 105-primitive live result does not validate this new moving model.

## Implemented BENCHMARK-01 model and deferred adapter

`benchmark-contract.mjs` accepts **only explicitly synthetic routes** and exposes no game/native execution callbacks. Its three per-frame traffic requests are inert descriptions. `ACTIVE` requires fresh synthetic evidence of effective controls and coverage for every route segment. Missing/stale/partial evidence yields `UNVERIFIED / UNKNOWN`; no assumed route clearance. Intersecting non-owned vehicle footprints of any category yield `DETECTED`. The fixture's complete-observability flag has **no established GTA producer**, which is precisely the unresolved live gate.

The bounded model supports one Bati/rider ownership pair, session+handle+generation+model+nonce identity, explicit start, ordered checkpoints, failure/stop and cleanup intents. Maximum two passes; a failed first pass cannot silently retry, and a second pass requires a new explicit prepare plus verified cleanup of the first. A 120-second/2,400-sample cap, listener/camera/time-alignment checks, missing-data detection, position jumps, route deviation, stalled progression, collisions, rider fall/death, unknown simulation and lost/reused handles stop a run. No missing trajectory is synthesized.

The recorded synthetic snapshot includes measured-fixture position/velocity, timestamps, checkpoint, source-listener distance, unavailable RPM reason and unknown geometry coverage. The prototype does not yet implement all proposed production telemetry fields, weather/time capture, true simulation-freshness verification, GTA spawning/driving commands or visual integration. Its finite thresholds are fixture guard settings, not calibrated long-distance performance limits.

Cleanup returns requests only for exact owned identities observed again. It never deletes anything. Completion requires separate absence checks; uncertain handle reuse blocks cleanup certification. Stopping/completion ceases frame-request intents and turns isolation OFF in the model. This proves contract behavior, **not actual restoration of GTA traffic**. Replay is historical data only: zero spawn, restart, collision query, player movement or audio action. Repeatability comparisons remain synthetic, never deterministic GTA claims.

## Cache foundation and measured costs

See the [installation-aware cache specification](INSTALLATION_AWARE_ACOUSTIC_CACHE.md) for identity, two-layer architecture, schema, quotas, interruption handling and future mapping gates. There is no automatic installation scanning, collision scan on load, background survey, cache-expiry rescan or benchmark-time acquisition. All prototype writes are private and bounded; no cache integration is added to the game adapter.

[Scalar measurements](../evidence/publication/acoustics05-cache-benchmark.json) use one original synthetic tile, two patches and 18 observations, four warmups and 40 alternating-order repetitions. “Cold” means reading/parsing/validating/reconstructing the source fixture; the OS file cache was **not** flushed. Component medians need not sum to the median total.

| Operation | Median ms | p90 ms |
|---|---:|---:|
| Source read/parse/validate/reconstruct total | 0.7754 | 0.9566 |
| Source disk read | 0.0714 | 0.0818 |
| Source parse | 0.0768 | 0.0835 |
| Source validation + reconstruction | 0.6288 | 0.7815 |
| Cached load total | 1.4982 | 1.7237 |
| Cache disk read | 0.0739 | 0.0811 |
| Checksum/schema/compatibility | 0.2700 | 0.3298 |
| Cache path guards/directory checks/bookkeeping | 1.1509 | 1.3507 |

The cache avoids **two reconstructions per load**, performs zero collision queries and stores **2,255 bytes**, versus **20,012 bytes** for the source fixture. But the guarded cached load is approximately **1.93 times slower** here. Avoided fitting is not a demonstrated end-to-end speedup. I am retaining this negative result, not optimizing away safeguards or claiming startup benefits.

Process snapshots: heap used 7,313,288 → 7,538,200 bytes; RSS 48,099,328 → 49,569,792 bytes. These are combined process snapshots, not isolated/peak cache allocations; no forced GC. One tile was resident, cap four. Neither this tiny warm-file experiment nor the bounded LRU certifies city-scale memory or real-time audio-thread suitability.

## Validation and preservation

The 70 new original synthetic tests cover 29 cache/publication cases and 41 walking/benchmark cases. They include all ten requested map-change scenarios, preserved historical uncertainty, scoped invalidation, malformed/truncated/hostile cache rejection, interrupted writes, quotas/LRU/private paths, no loading-time reconstruction/query path, explicit walking budgets, consumed failures, traffic categories/unknown coverage, entity reuse, missing telemetry, listener mismatch, cleanup evidence and bounded replay. Publication fixtures independently verify restricted filenames sharing the same Git blob and cache envelopes disguised with an innocent extension. They do not constitute live isolation or driving proof.

The complete acoustics-branch offline suite passes: 204 Node tests, 73 geometry-observation assertions, 53 bounded acquisition/lifecycle assertions, 164 tile/reconstruction/lifecycle checks, independent C#/JS geometry replay, 116 Phase 1 checks, 65 telemetry assertions, nine configuration checks and eight append cases. Core telemetry builds successfully. No new runtime adapter is built or deployed.

The separate sound branch's full suite also passes: 219 Node tests, original offline-audio helper build, eight extraction/publication guards, 133 Phase 1 checks, 65 telemetry assertions, nine configuration checks, 35 drivetrain diagnostics and eight append cases. No stock audio is played, read, re-extracted or rendered for this task.

Protected inventories include **4,857 private source/audio files, 139 link targets and 888 earlier acoustics artifacts**. Historical source-synthesis code/defaults, accepted/rejected previews and geometry evidence are checked by hashes without following links. New diagnostics use fresh ignored locations. The `.local` boundary remains primary; `.ratile`/`.pending` ignore rules and envelope-content screening provide additional publication protection. No project licence is selected or third-party implementation copied.

The fresh read-only installation check passed: 32 original root files, 179 archive metadata records, ten sampled hashes, valid executable signatures, original filenames, exact backup/package hashes, temporary paths absent, and no GTA/RPH/diagnostic process or PROCMON25. Enhanced hash: `69DA07FF67D05E9DED11289E597E8B8DC5855B0A429C085F37D148DC267CB2C5`; original obsolete executable hash: `FD330FAE0C92A52E0B277FBA8A6856C81BD931FC4FCD1D81FBA02772A2A814CF`. No installation mutation occurred, so no new restoration procedure was exercised.

The staged publication screen has zero findings. Reachable-history screening reports five identity-review findings, all inspected as the exact non-personal committer `GitHub <noreply@github.com>`: the four previously reviewed historical exceptions plus main's PR #28 merge `3075037704371c6ac416d4b8c9f2c0df339a5600`. The latter is newly reviewed here, not silently described as an old exception. The auditor still reports these findings; no screening rule is bypassed or history rewritten. Git integrity passes. Remote file/commit readback and completed hosted CI on the exact final revision must still be recorded in the completion report rather than assumed from local tests. Public deliverables contain original code/fixtures, scalar measurements and documentation only. Raw caches, source geometry, coordinates, private logs/paths, audio and vendor binaries remain excluded.

## One next decision

I recommend a **separately scoped traffic-isolation and route-observability calibration on a short fully visible segment, before any Bati is spawned**. First prepare its supported-interface and independent restoration checks offline; obtain explicit approval for the changed scope and any live test. This must establish what traffic controls actually prevent, how existing/emergency/junction interference is detected, the observable coverage boundary, and how normal traffic is independently confirmed afterward. It is not authorization to run it here or substitute that segment for the eventual Legion Square benchmark. No additional experiment begins automatically.
