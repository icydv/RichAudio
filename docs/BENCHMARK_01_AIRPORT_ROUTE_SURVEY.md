# BENCHMARK-01: Airport route and surface survey

## Offline readiness, 27 October 2026

I've prepared one bounded, observation-only airport survey on top of PR #35. My original revision-3 START, FINISH and LISTENER records pass the actual framework-independent loader with their pinned fingerprint. They remain unchanged. My START/FINISH chord is approximately 793.885462 **uncalibrated native units**, not measured road distance. Their car-seat heights and my raised LISTENER height remain historical measurements, not ground-contact positions.

**Preparation is offline tested and SDK compiled. The new survey has not run in GTA. Separate approval is required before deployment or launch.** The combined ACOUSTICS-05 + BENCHMARK-01 remains **60%**; offline survey preparation does not earn live-test progress. The Bati controller's unconditional live mutation gate is unchanged. No bike/rider was created, tuned, driven or deleted.

The survey cannot certify the entire airport course with 36 rays. Its useful result is a private, bounded set of observations, proposed support points, navigation candidates and explicit gaps. It does not automatically unlock the controller, even if every local observation looks favourable.

## Research and evidence levels

| Capability | Evidence and boundary |
|---|---|
| Original marker load | Actual private revision-3 readback passed; synthetic malformed/provenance/hash tests also pass |
| `World.TraceLine` world-only hit/normal | Previously verified in other live geometry experiments; this pattern and location remain **NOT TESTED** |
| Model bounds | Historical [RPH `Model.GetDimensions`](https://docs.ragepluginhook.net/html/M_Rage_Model_GetDimensions.htm) and pinned SDK provide relative min/max model bounds. Bounds are not a collision-volume test. No model loading is requested. |
| Local navigation availability | [ARE_NODES_LOADED_FOR_AREA](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/PATHFIND/AreNodesLoadedForArea.md) supplies a local availability observation, not route connectivity. |
| Travel estimate | [CALCULATE_TRAVEL_DISTANCE_BETWEEN_POINTS](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/PATHFIND/CalculateTravelDistanceBetweenPoints.md) documents an estimate and a 100000 sentinel. A finite result is a candidate, not proof that ordinary AI can follow this airport course. |
| Closest vehicle nodes | [GET_CLOSEST_VEHICLE_NODE_WITH_HEADING](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/PATHFIND/GetClosestVehicleNodeWithHeading.md) was reviewed. Not implemented: no guessed native output-pointer layout or additional query is introduced. |
| Ordinary AI driving | Historical [RPH DriveToPosition](https://docs.ragepluginhook.net/html/M_Rage_TaskInvoker_DriveToPosition_2.htm) exposes destination, requested speed, driving style and accepted distance. It gives no airport/runway guarantee, mechanical maximum-speed guarantee or full-throttle measurement. No task is called here. |
| Local vehicles/peds/objects | SDK streamed pools and sampled positions/velocities; future airport coverage, complete collision extents and lifecycle generations remain unknown. |
| Entity absence | [DOES_ENTITY_EXIST](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/ENTITY/DoesEntityExist.md) is relevant to a later cleanup review. Its Boolean alone cannot prove creation provenance, lifetime generation or absence of a reused entity. It is not used to unlock deletion. |

The pinned ordinary GTA native references are community documentation, not an Enhanced 1158.16 runtime certification. These are ordinary GTA calls, not Cfx-only custom natives. SDK compilation is not proof of runtime name resolution or semantics. API errors remain UNKNOWN and are preserved; failed collision/setup operations end the survey without retries.

An airport runway can be flat but lack a suitable vehicle-navigation path. We distinguish a navigation candidate, partial physical support, unknown route continuity and demonstrated local unsuitability. This observation-only survey cannot establish the strongest outcome, a supported end-to-end AI route. If ordinary AI later proves unsuitable, a different documented driving mechanism would need separate review; artificial position/speed control is not a fallback.

## One fixed manual plan

Plan identity: `airport-six-stops-v1`. Three intermediates give five route anchors across the chosen course while reserving half the rays for START/FINISH. This is an initial sparse survey, not a claim that three points adequately describe every turn or obstruction. No intermediate coordinates are invented or generated automatically.

| Order | Console command | Collision allocation | Scope |
|---|---|---:|---|
| 1 | `RichAudioSurveyStart` | 12 | Original START: 9 down + up to 3 body-line probes |
| 2 | `RichAudioSurveyMid1` | 3 | First manually chosen course observation |
| 3 | `RichAudioSurveyMid2` | 3 | Second manually chosen course observation |
| 4 | `RichAudioSurveyMid3` | 3 | Third manually chosen course observation |
| 5 | `RichAudioSurveyFinish` | 9 | Original FINISH: downward grid |
| 6 | `RichAudioSurveyRunout` | 6 | Separately proposed run-out candidate; no course extension approved |
| Total | Six separately commanded stops | **36 maximum** | No retries or reallocation |

I move manually between stops. A car may be used for travel, but every observation requires being stationary **on foot**, outdoors, with speed no greater than 0.25 native units/second. START and FINISH require visiting within 3 horizontal units of their original coordinates; their probe anchors retain the exact historical coordinates. Other anchors are the actual sampled player positions. All must lie within 2000 native units of both endpoints. This is a bound around the recorded airport course, not permission to survey the entire airport.

I select three useful intermediate positions while visually inspecting the intended path, keeping their order from START to FINISH. I identify a separate run-out observation beyond FINISH only if manually accessible. No relocation or run-out extension becomes accepted by recording it. If the intended route needs more observations, the experiment stops with incomplete coverage rather than reallocating rays or inventing a route.

### Fixed ray geometry

The horizontal forward/right axes come from the measured player heading. Ground columns have lateral offsets -0.75, 0, +0.75. START/FINISH have forward offsets -0.75, 0, +0.75; intermediates have one row; Runout has rows -0.75, +0.75. Every down-ray starts 2 units above its anchor and ends 4 below, length 6. Flags are `IntersectWorld = 1`, with the player ignored. Heights are uncalibrated native units.

Only if START's centre ray supplies a valid hit do three dependent line probes run: lateral spans ±1.5 at support height +0.5 and +1, and longitudinal span ±2 at height +1.5. These sample a **declared research envelope**, not the Bati's proven full swept volume. If the centre misses, all three are recorded as skipped; the maximum falls to 33, with no replacement calls. The optional read-only Bati model-bounds result is preserved separately and does not transform these three lines into a body-clearance certificate.

Per stop, the collision group has a 2500 ms deadline and movement tolerance 0.05 from its initial pose. Each call is charged before execution, including a thrown call. Auxiliary observations must finish within 5000 ms of the initial pose. A single synchronous SDK call cannot be forcibly timed out; these guards prevent later calls after a slow return. A hang requires supervised shutdown, never a speculative retry.

### Surface interpretation

All hits must pass the existing strict observation validator: finite, on-segment point, plausible unit normal, exact world-only provenance and compatible build/time/setup. A valid miss is retained as unknown support. Invalid evidence stops acquisition. A maximum slope of 10 degrees or sampled height spread of 0.15 units screens out unsuitable candidates for this **declared flat-support research test**; these are not measured motorcycle limits. Inconsistent/downward normals cannot pass the flat screen.

Even a passing grid remains `PARTIAL_SAMPLED_SUPPORT`. It does not establish solidity between rays, static permanence, collision availability elsewhere, material or a clear motorcycle body. A line hit means an obstruction on that line; line misses mean only `PARTIAL_LINES_ONLY_NOT_BODY_VOLUME`. Dynamic occupancy is separate. A proposed support point is never an accepted Bati spawn transform: wheel contact, model origin placement and sufficient collision-volume clearance still need separate evidence.

FINISH support and a run-out observation cannot establish braking distance or high-speed stopping safety. StoppingDistance stays UNKNOWN. The 794-unit chord is not proof of attainable maximum speed or stopping room.

## Auxiliary observation budget

Each commanded stop can make at most two navigation calls: loaded-node area for the local ±12 box, and travel estimate from its anchor to historical FINISH. Six stops allow at most **12** calls, without retries. Sentinel, unloaded nodes, negative/nonfinite values or errors yield UNKNOWN. A useful finite result is `NAVIGATION_ESTIMATE_CANDIDATE_ONLY`; Navigation overall remains UNKNOWN pending actual supported driving evidence.

One initial `Model.GetDimensions` call is permitted, without `Load`, `RequestModel` or collision-loading calls. Failure/invalid dimensions remain UNKNOWN. It supplies model bounds, not measured surface clearance.

Once per stop, up to three SDK pool enumerations inspect vehicles, pedestrians and objects: at most **18 enumeration calls**. Examine no more than 4096 entries per pool, preserve at most 64 nearby details within radius 12, and stop processing when the 8 ms auxiliary pool budget is exhausted. Calls already in flight cannot be preempted; returned SDK arrays and their allocation cost are outside that processing cap. Counts, omitted entries, read failures and timing are recorded. This does not claim a hard limit on the SDK's internal allocations.

Relevant details include handle/model, observation serial, position and velocity, with a same-read identity recheck. Observation serials are **not** engine lifecycle generations. First observation does not mean newly spawned. Read errors, streamed omissions, radius selection by centre, unknown object extents and unloaded world content all limit coverage. A large obstacle whose centre is outside the radius can be missed. There is no continuous interference monitor and no promise of future traffic absence. No density controls, deletion, moving or freezing occurs. Scope is always `PARTIAL_STREAMED_POOL`; local non-occupancy never upgrades RouteClear.

## Evidence, uncertainty and display

`SurveyRecord` version 1 preserves marker identity/revision and copied historical coordinates, session/build/time provenance, six ordered stop records, sampled poses, exact ray plans, attempted/skipped counts, hit/normal observations, separate proposed support points, candidate-only surface conclusions, navigation results and partial entity observations. Missing stops remain visibly missing. RouteCoverage, RouteContinuity and StoppingDistance remain UNKNOWN; RouteClear and BenchmarkStartSupported remain false.

Evidence is local/private only. A fresh ignored directory is required outside GTA; reparse/network paths are rejected. A durable session attempt and each one-shot stop intent precede observations. Each stop produces an immutable cumulative revision; interrupted partial results are retained in `closed.json` if finalisation succeeds. Writes use bounded ≤2 MiB JSON, exclusive create-new `.partial`, flush and same-directory rename. An interrupted partial is not a completed revision and is never overwritten. Historical marker files are read only. No raw geometry/coordinates/session identifiers are published.

Use `RichAudioSurveyShow`, `RichAudioSurveyHide`, `RichAudioSurveyReplay` and `RichAudioSurveyStatus` for cached inspection. Display is initially off. `RichAudioSurveyStop` ends the observer; it cannot reset query counters. Replay does not reopen files or remeasure anything. HUD shows original markers, actual intermediate count, used/max queries, partial surfaces, navigation uncertainty, unknown continuity/stopping and **Benchmark launch: BLOCKED**.

World colours: historical START green, FINISH red, LISTENER cyan; actual manual stops magenta; retained hits blue; measured normals white; possible obstruction centres orange. **Yellow dashed links are planning links across unknown gaps**, not measured roads. Recorded observations are labelled historical, never current clearance. Cached primitive storage/submission is capped at 128, with omissions disclosed; truncation does not acquire replacements. Drawing performs no trace, pool enumeration, navigation query, disk I/O or entity mutation. Drawing failure ends the experiment without a fallback scanner.

The loop checks Story Mode and player wrapper/handle/model continuity. Character changes or uncertainty abort; same wrapper/handle/model does not prove a unique engine lifetime after an unobserved reuse. That limitation is harmless to an observation-only survey but cannot authorize later entity mutation.

## Future independent cleanup proof — still blocked

The survey assembly excludes `BatiController.cs` and `BatiAdapter.Rph.cs`. `CleanupReview` is an offline, read-only classifier, not a live cleanup implementation or route gate.

A future separately approved lifecycle experiment would need: an attributable creation receipt for exactly one Bati and rider; matching session, model and lifetime identity; readback of the rider/bike association; guarded cleanup in rider-before-bike order; independent post-request observation; explicit partial-creation, dismount, disappearance and interruption outcomes. A successful delete return, invalid wrapper or omission from a streamed pool is insufficient. Contradictory presence or ambiguous/reused rider identity must prevent **all** related mutation, including removing a bike underneath an unknown rider.

Our original synthetic registry can authoritatively demonstrate absence within that fixture. No equivalent generation-aware runtime absence producer has been established. We therefore keep real cleanup proof UNKNOWN and the existing controller closed. This survey neither calls `DOES_ENTITY_EXIST` nor tests creation/deletion.

## Tests, preservation and performance

New original synthetic fixtures validate malformed/missing/hash-mismatched markers; original heights; candidate separation; flat/sloped/uneven/missing/inconsistent support; line obstruction; fixed order/count; missing/repeated stops; invalid evidence; timeout/movement/interior/player changes; aborted/incomplete groups; missing/sentinel/error navigation; moving vehicle/ped/object scope; stale/incomplete pools; immutable private persistence; copied snapshots; and conservative cleanup identity outcomes. Independent JavaScript reads the generated JSON and checks exact ray endpoints/counts, geometry, evidence limits, the runtime native allowlist, cached display separation and exclusion of the mutating controller. Hosted CI needs no proprietary SDK/assets; the adapter build is a separate local check.

Commands from the repository root:

```powershell
./tests/Test-AirportSurvey.ps1
./tools/Test-Offline.ps1
# Optional local build only, using an explicitly supplied authentic pinned SDK:
./tools/Build-AirportSurvey.ps1 -SdkPath '<private authentic SDK path>'
```

The full offline suite passed, including **76 new C# assertions and 236 independent survey checks**, existing **148 Bati assertions / 409 independent checks**, **129 Phase-1 checks**, **65 telemetry**, **9 configuration**, **8 append cases**, plus geometry/acquisition/tile/cache/traffic/marker suites. The separate source-synthesis checkout passed **219 tests**. Compilation against SDK 1.124.1393.17586 passed; intended runtime remains 1.132.1428.17748. No runtime compatibility is inferred from that compile.

Original synthetic measurement snapshot: 50 combined marker validation/checkpoint/12-ray surface groups ~117.5 ms; 100 full 36-observation snapshots ~346.3 ms; 100 obstruction classifications ~0.0025 ms; 10 snapshot-and-persist operations ~55.3 ms; record 45,299 bytes; process managed memory ~3.53 MB and private memory ~27.69 MB at sample. These are aggregate one-process fixture costs, not isolated live API costs, audio-thread budgets or production performance. Reruns vary; no speedup is claimed. Full snapshots/serialization run only on commands/finalisation, never drawing/audio threads.

Preservation verified 4,857 existing source/audio files and 139 link targets, 1,045 earlier acoustic files, and 67 prior marker/controller preparation files. Historical protected renderers, defaults, telemetry and the Bati gate have no diff. Fresh synthetic outputs are separate. No original audio was accessed, re-extracted, played or published. Source-synthesis ancestry stays separate and unchanged.

## Proposed supervised session — approval still pending

1. Freshly verify exact game/RPH versions, signed executable hashes, backups, original inventory/archives, absent temporary destinations, no game/editing/diagnostic processes, no PROCMON25 and sufficient evidence disk space.
2. Use the existing reversible executable-selection rename and **27 exact-hash additions**: 25 unchanged RPH/AB XInput/DirectStorageFix support files plus the new survey DLL/config pair. Marker observer files are replaced in the candidate manifest, not deployed alongside it. No Bati/telemetry/traffic/acoustic acquisition plugin is included.
3. The candidate and journal helper are sealed outside GTA. `Verify` is read-only. `Begin` still requires separate human approval plus an explicit live-approved switch, and refuses any existing journal/target collision. A prefilled candidate configuration is not permission to execute it. No deployment/launch has occurred.
4. One offline Enhanced Story Mode launch only, with the previously reviewed configuration. No multiplayer, new launcher options, driver tracing or security changes. Startup not confirmed within 5 minutes: abort normally, no retry.
5. Load `RichAudio.Survey.Rph.dll`; show cached historical markers. Manually inspect and visit the six stops. Execute each listed command once, under supervision. Stop if visibility, stationary setup, surface support or API evidence is inadequate; missing coverage is an outcome.
6. Plugin lifetime **20 minutes from load**; overall target ceiling **30 minutes** including up to 5 minutes startup and 5 for normal exit. No automatic continuation if time is insufficient. No extra launch or extra queries.
7. End with `RichAudioSurveyStop`; verify private final evidence and display detachment. Quit normally. Preserve logs/private results, remove only introduced files, reverse the executable rename and verify original names/signatures/hashes, 32 root files, 179 archive metadata records and 10 sampled archive hashes against exact saved manifests, plus absence of all 27 additions. Unexpected generated files are preserved/reviewed, not silently deleted. Restoration uncertainty blocks further work.

Abort on multiplayer, wrong build/source hashes, marker mismatch, unexpected destination/driver/process, malformed evidence, player identity change, moving/interior setup, duplicate/out-of-order stop, elapsed budget, disk/write failure, cancellation or instability. Missed support/node absence can remain UNKNOWN without a retry. No route/start claim is made from visual confidence alone.

Fresh read-only installation verification passed during preparation. The local sealed manifest SHA-256 is recorded in the private readiness receipt. No proprietary dependencies, private config/coordinates, generated game evidence or binaries are committed. The public licence remains undecided.

### What the approved survey could prove

It could establish that this observer actually records valid local ground/support/line evidence, useful or absent navigation estimates, manually selected course observations and scoped nearby interference at this airport, while preserving historical markers and the installation. It could reject sampled locations as unsuitable. It cannot prove continuous solidity/clearance along 794 units, correct Bati wheel placement, AI followability, safe braking, persistent empty traffic, maximum speed, live entity cleanup, source audio ownership or completed benchmark readiness.

**One next action:** after separate approval, conduct this single bounded supervised survey. Review its evidence before choosing any later route certification or lifecycle test. Do not spawn the Bati in this session.

## Publication and progress record

Stacked parent: PR #35 at `3a3c602519717e278ad5349f3f2d02382d2e7702`; branch `research/benchmark-01-airport-route-survey`. No existing PR was merged/rebased and no unsanitised ancestry was imported. Accepted README/checklist updates from main are preserved in the stack. PR URL, exact final commit and hosted CI are reported in the completion/readiness response after independent remote readback; they are not assumed from a local pass.

Communicated preparation checkpoints: **0, 15, 30, 50, 70, 85, 95%** so far; publication/integrity is the 95% gate and exact-head hosted CI/remote readback the 100% gate. Preparation completion does not change the combined milestone's 60% or constitute live route acceptance.
