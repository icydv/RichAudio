# BENCHMARK-01: traffic-isolation calibration preparation

27 October 2026. **Offline preparation complete only after exact-head CI/readback; live experiment NOT TESTED and requires separate approval.** I've prepared one narrow calibration, not the Bati benchmark. Combined ACOUSTICS-05 + BENCHMARK-01 progress remains **60%**. The existing cache remains PASS OFFLINE with its negative tiny-fixture timing result; none of its geometry, identity or source-synthesis behavior is changed.

## Baseline, hypothesis and evidence boundary

PR #31 remains open/draft, head `49c5c6533fa6bab8856fd2f07e863fbba099c707`. This focused branch is stacked directly on it. Main remains `3075037704371c6ac416d4b8c9f2c0df339a5600`. No earlier branch is merged or rebased, and the archival unsanitized checkout is unchanged.

My hypothesis is that three supported frame-scoped zero density requests will reduce newly observed ambient road traffic during a short stationary observation. Existing vehicles may remain or enter from outside the area. A first-observed identity is **not proof of a new spawn**: streaming, re-entry, an earlier missed sample or handle reuse may explain it. I will measure this distinction rather than deleting/teleporting other vehicles.

The experiment cannot establish city-wide isolation, distant-route clearance, dispatch/scenario coverage, exact vehicle creation time or statistical causation from one sequential A/B/C trial. The runtime collector always labels coverage **PARTIAL**. A manual visual confirmation plus currently enumerated entity centers does not establish complete between-sample observation, hidden entities or physical vehicle-body clearance. The independent validator consequently cannot award a live isolation PASS from this collector alone; a useful PARTIAL result is possible. This limitation is explicit before approval, not hidden in a later verdict.

## Interface review

Native source references are pinned to [citizenfx/natives 64c6064c488d6d6cf992840eccce49e447066472](https://github.com/citizenfx/natives/tree/64c6064c488d6d6cf992840eccce49e447066472). These are GTA native-interface references, not FiveM configuration. No third-party implementation is copied.

| Control | Hash / argument | Established and unverified |
|---|---|---|
| [Vehicle density this frame](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/VEHICLE/SetVehicleDensityMultiplierThisFrame.md) | `0x245A6883D966D537`, float `0.0` | Source documents looped use, zero and normal density. Exact Enhanced behavior awaits the experiment |
| [Random vehicle density this frame](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/VEHICLE/SetRandomVehicleDensityMultiplierThisFrame.md) | `0xB3B3359379FE77D3`, float `0.0` | Float signature established; detailed range/category behavior thinly documented |
| [Parked vehicle density this frame](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/VEHICLE/SetParkedVehicleDensityMultiplierThisFrame.md) | `0xEAE6DCC7EEE3DB1D`, float `0.0` | Float signature established; it must not be assumed to remove existing parked vehicles |

Only zero is allowed by this controller; it does not experiment with undocumented values. The pinned authentic SDK exposes `NativeFunction.CallByHash<T>`, and the adapter builds against it. Compilation establishes the dispatcher/signature, **not that these operations work on Enhanced 1158.16**. The approved runtime experiment will be their first actual use here. Void-call success means a request returned without exception, not that population suppression succeeded.

The adapter guards exact Enhanced `1.0.1158.16` and RPH `1.132.1428.17748`, and uses the existing official loader/DirectStorageFix environment. SDK `1.124.1393.17586`, SHA-256 `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0`, is a compile-time local dependency only.

Emergency/dispatch and scenario generation remain separate uncertainties. Persistent global dispatch switches and ambiguous generator toggles are not added. The scoped dispatch add/remove candidates recorded in [the earlier report](ACOUSTICS_05_BENCHMARK_01.md) remain untested; no blind enable-all/reset is used. Blanket ambient-density requests during the suppression phase are already authorized in principle, but deployment/launch still require this experiment's approval.

Observation uses [RPH World.GetAllVehicles](https://docs.ragepluginhook.net/html/M_Rage_World_GetAllVehicles.htm), rechecked handle/model/validity, positions, velocities and pool counter. Historical vendor documentation and this installation's earlier telemetry support the API route; enumeration is not proof of complete streaming. [GET_VEHICLE_CLASS](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/VEHICLE/GetVehicleClass.md) identifies class 18 as emergency category, not a dispatched mission. [GET_ENTITY_POPULATION_TYPE](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/ENTITY/GetEntityPopulationType.md) and its [author-published enum](https://alloc8or.re/gta5/doc/enums/ePopulationType.txt) provide raw population categories: 1–5 are random/permanent, parked, patrol, scenario and ambient. These classifications are not creation timestamps, and exact-build getter behavior remains subject to the live evidence.

## One area and fixed sequence

Proposed location: a straight, level mid-block section of **Vespucci Boulevard beside Legion Square**, observed from a safe footpath with the road on my right. The outline must fit within one directly visible road segment, away from junctions, bends, over/underpasses, ramps, decorative barriers and occlusion. If that is unsuitable, stop rather than silently choosing another experimental area. No fixed map coordinates are invented.

`RichAudioTrafficArea` freezes the actual player position and horizontal forward/right basis. Its proposed center-point observation rectangle extends **12–42 native units forward, 0–12 right, ±3 vertically** relative to that measured anchor. Dimensions are uncalibrated native units, not certified metres. Yellow lines show the proposed footprint at anchor height plus 0.2, not measured road geometry. The camera must let me inspect the whole outline; a narrow/broken view invalidates setup. The rectangle is an observation region, not a validated driving route or complete body-intersection test.

`RichAudioTrafficConfirm` acknowledges only that visual setup. It never certifies complete streaming or clears a road. The core rejects any attempt to label runtime coverage VALID. No observation/control calls are made by the HUD; no collision rays exist in this plugin.

| Phase | Fixed window | Actions |
|---|---:|---|
| BASELINE | 45 seconds | No density requests; sample available vehicle centers at nominal 5 Hz |
| SUPPRESSION_ACTIVE | 45 seconds | Three zero float requests per unique observed game frame; same sampler/area/listener |
| RESTORING | 45 seconds | Cease requests entirely; continue the same observations |

Total planned acquisition: **135 seconds**; hard active limit **150 seconds**, with a scheduling gap over one second causing an immediate failure. READY expires after ten minutes without beginning. A consumed area/attempt cannot retry/reset. Fixed player identity/exterior context, on-foot stationary speed, displacement ≤0.25 native units and camera rotation change ≤2 degrees are guarded. Pause, movement, session change, native exception, evidence/record bound or display failure ends the run. These are research guard settings, not certified measurement-error limits.

One launch, one area, one A/B/C sequence, one active controller. No Bati/rider, no alternative test, no geometry acquisition, no audio changes. Opening the pause menu during acquisition aborts; the manual STOP command remains available. No automatic second attempt follows a failure.

## Commands and player actions

After the separate deployment/launch approval, choose Story Mode, keep plugin autoload disabled and manually reach the agreed safe footpath. No teleport or automatic relocation is used.

1. Open F4: `LoadPlugin RichAudio.Traffic.Rph.dll`.
2. On foot, face along the chosen straight road with the roadway on my right. Enter `RichAudioTrafficArea` once; close F4 and review the four yellow boundary lines and proposed area.
3. If the entire outlined segment is visible, straight, level and free of occluding structures/junction complications, enter `RichAudioTrafficConfirm`. Otherwise `RichAudioTrafficStop`, preserving an invalid setup result.
4. Enter `RichAudioTrafficBegin` once, close F4 and remain still with a fixed camera through all 135 seconds. No driving is needed. A meaningful baseline requires at least three observed entries and three first-observed moving ambient-category identities; this is a modest predefined screen, not statistical power.
5. `RichAudioTrafficStop` ends the single attempt early. `RichAudioTrafficStatus`, `Show` and `Hide` inspect/present cached state only. Hide is not stop.
6. Wait for `TRAFFIC CLOSED` and verify private evidence plus `closed-metrics.json` before unloading/quitting. Then `UnloadPlugin RichAudio.Traffic.Rph.dll`, normal game quit, and installation restoration/independent comparison.

The optional display shows actual mode, request ACTIVE/OFF, PARTIAL coverage, current detected count, entries after the first phase snapshot, elapsed time and read errors. Unexpected first-observed IDs during suppression produce DETECTED; otherwise coverage limitations keep that field UNKNOWN. It never displays ROAD CLEAR or TRAFFIC RESTORED. Emergency and population categories are retained for independent analysis; parked generation cannot be inferred merely from low speed.

## Components, recording and safety

- `TrafficCalibration.cs`: platform-independent fixed-window state machine, exact-frame deduplication, three-request interface, bounded copies of samples/receipts, terminal stop/failure. No native/game types.
- `TrafficObserver.Rph.cs`: thin exact-build adapter, read-only enumeration/getters, three density requests, existing ACOUSTICS-04 `DRAW_LINE`/RPH text technology and private create-new persistence. No entity mutation, driving, collision ray or audio API.
- `validate-calibration.mjs`: independent JavaScript phase/receipt/area/provenance/count/gap checks and conservative interpretation. It does not import or repeat the C# implementation.

Bounds: at most 4,096 enumerated vehicles per observation, 64 in-area readings, 800 samples, 20,000 frame request receipts, 512 live first-observed identities, 16 MiB serialization/file limit. No unbounded worker/queue is started. Input and returned evidence copies cannot alter the controller's retained records. The private file is written only after the request loop is detached; per-frame work does not write disk. Interrupted persistence may leave incomplete evidence: no false successful footer or automatic rerun.

Receipts record frame/time plus attempted/successful control masks, including partial failure. They are adapter-level request evidence, not an independent kernel/native effect trace. Missing request frames are counted and prevent clean-control certification. A subsequent validator checks no recorded request falls outside the suppression window. Observation gaps >400 ms, getter failures and category uncertainty remain visible.

On stop, exception, unload or timeout the frame loop stops making requests; no persistent density configuration is written and no density=1 restoration override is applied. Frame lifetime comes from the native contract, **not newly proven crash recovery**. An unresponsive host/abrupt crash can prevent private finalization; actual population restoration remains a separate observation. The restoration window reports newly observed moving ambient-category traffic returning when present, never proof of exact creation or normality everywhere. No returning traffic means observationally inconclusive, not automatic success/failure. There is no watchdog service or second framework.

## Installation plan: prepared, not executed

The new private sealed plan contains **27 additions**: 25 unchanged approved runtime/official XInput loader/DirectStorageFix files, plus **RichAudio.Traffic.Rph.dll and its private configuration**, replacing the earlier Tile observer/config pair in the plan only. No Tile/telemetry/source renderer is deployed with it. No original game file is overwritten. The validated temporary old-executable filename change is the only proposed original-name mutation; contents remain untouched. RPH arguments remain `-forcesettings -log`; the existing Steam `-nobattleye` option was independently rechecked and not changed. No anti-cheat/security modification or new launch argument is introduced; Story Mode only.

Prepared manifest SHA-256: `514959B973F73B2380BE96511526CDD33A53F9476914E66342175A204C6148A1`.
Prepared observer SHA-256: `8A54C10D8B57DC63093D9403C8303C2D5F285F41C0171C9205764AA036879F6B`.

The prior known deployment/rollback helper is reused with narrow manifest/plugin/scope substitutions. `Verify` is read-only and has passed. `Begin` still requires separate live approval and is **not invoked** here. Its journal reserves rename/add operations before mutation; exclusive destination creation prevents unexpected overwrites. The helper does not launch RPH itself. A later approved start must recheck exact source/baseline hashes, destination absence, processes, signatures and diagnostics before mutation. No current new deployment journal exists.

After any future run: detach requests/overlay; save and independently inspect evidence; unload; quit normally; preserve generated diagnostics outside GTA; remove only exact introduced files; restore original executable name; compare original names/hashes/signatures, root/directories, archive metadata and sampled hashes; verify all 27 paths absent and no GTA/RPH process remains. An unexpected changed temporary file or unknown generated addition stops automatic removal and blocks restoration certification. Prior procedure limitations under arbitrary crashes/disk failure are not described as guaranteed recovery.

## Offline validation and current results

**50 focused C# lifecycle/safety assertions**, plus 13,511 repeated fake-request argument checks, pass without loading the SDK or invoking natives. They cover invalid values/order, frame deduplication/missing frames, timeout, stop/unload, partial-request exceptions, no retries, source/handle duplication, copied evidence, invalid positions/velocities, missing samples and forbidden runtime coverage promotion.

**43 independent JS checks** consume the C#-serialized original fixtures, recompute results and reject contradictory clocks/receipts/counts, hidden missing request frames, impossible partial-call ordering, duplicates, area violations and promotion. They cover retained/parked-like stationary vehicles, emergency arrivals, empty/insufficient baseline, incomplete windows, read errors, traffic return/not observed, deterministic analysis and no rendering-time acquisition. A complete synthetic oracle can pass; real collector evidence remains PARTIAL. No synthetic fixture is represented as game evidence.

The complete acoustics/cache/telemetry regression suite and the separate source-synthesis suite pass. The adapter builds against the authentic pinned SDK. Publication/remote readback/exact-head hosted CI must finish before readiness is asserted; their actual status is recorded with the PR/completion message. No SDK or third-party runtime binary is committed.

Fresh read-only installation verification passes **32 root files, 179 archive metadata records and ten sampled hashes**, valid original executable signatures, backup integrity, absent temporary destinations, RPH version and diagnostic cleanup. GTA/RPH and PROCMON25 are absent. The source/audio inventory of **4,857 files and 139 link targets**, plus a fresh **1,045 prior acoustics artifacts**, is protected. No archive is parsed/re-extracted or modified. No new installation restoration has been performed because no mutation has occurred.

Actual baseline/suppression/restoration traffic counts, exact-build native effects, traffic return, controller/getter/observation/drawing costs, live memory and local observability are all **NOT TESTED**. Metrics separately instrument each cost and process-wide managed memory for a later approved run; CPU submission is not FPS/GPU time, isolated allocation or real-time certification.

## Interpretation and one next action

My offline preparation can be ready for this separately approved supervised calibration while its scientific outcome remains pending. A correct request lifecycle is not effective isolation; reduced arrivals are not an empty road; observed returning traffic is not proof of every population subsystem restoring. The wider route, existing-vehicle exclusion, Bati/rider identity, distance tracking and repeatability remain independent gates. No live-stage credit is added to the combined milestone.

**Exactly one next action:** conduct the sealed single-area, single-sequence traffic calibration **only after explicit approval**, then independently assess the resulting request and traffic observations before deciding whether any motorcycle-controller development is justified. No Bati benchmark or wider route experiment is included.
