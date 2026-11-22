# BENCHMARK-01: traffic-isolation calibration preparation

27 October 2026. **Execution update: my one approved launch reached observer setup, then stopped before acquisition because the proposed footprint included a junction. Traffic-control effectiveness remains NOT TESTED.** Installation restoration passed at the end of that attempt. A later read-only resumption check found two changed original executables, so another deployment is blocked pending provenance and compatibility review. Combined ACOUSTICS-05 + BENCHMARK-01 progress remains **60%**. The existing cache remains PASS OFFLINE with its negative tiny-fixture timing result; none of its geometry, identity or source-synthesis behavior is changed.

The preparation sections below preserve the conditions recorded before the approved attempt. Their statements that deployment or launch had not occurred describe that preparation checkpoint; the separate execution and resumption sections at the end record what actually happened.

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

## Approved execution: stopped before acquisition

### Outcome: BLOCKED at setup; traffic effectiveness NOT TESTED

I used the single approved launch with the sealed 27-file package. RPH selected Enhanced **1.0.1158.16**, RPH **1.132.1428.17748** completed startup, and DirectStorageFix reported initialization complete. Plugin autoload remained disabled. My traffic observer loaded, registered its commands and reported READY. I then captured one player-relative proposed observation area beside Legion Square.

The proposed rectangle reached the junction. I described it as: "it includes the junction". This did not meet the predefined straight-road setup requirement. My development tools should have identified the overlap directly from the displayed scene before asking me to certify it. Neither `RichAudioTrafficConfirm` nor `RichAudioTrafficBegin` was executed. I did not recapture an area or retry the launch.

| Planned activity | Actual result |
|---|---|
| 45-second traffic baseline | NOT TESTED; no acquisition started |
| 45-second density suppression | NOT TESTED; no controller ticks or requests |
| 45-second traffic-return observation | NOT TESTED |
| Bati/rider, route and long-distance tracking | NOT TESTED; no entities spawned |
| Geometry queries / audio changes | None |

The private output contains the session claim, single area claim, proposed area and closed metrics. It contains **no calibration claim and no traffic-evidence dataset**. I have not fabricated an empty traffic dataset or passed setup metrics to the calibration validator as if they were vehicle observations.

### Stop, evidence discrepancy and shutdown

I issued `RichAudioTrafficStop`, observed CLOSED and unloaded the plugin. Closed metrics report **zero controller ticks, zero observations and request detachment**. The display disappeared. Raw metrics contain an incorrect `EndReason` of `readiness expired`: the command chronology establishes a manual stop before the ten-minute readiness limit. Static inspection explains the labeling defect: the adapter initializes that reason before its loop, while `Stop()` changes flags without assigning a reason. I preserve the raw evidence and record this contradiction rather than silently correcting it or treating it as a timeout. This report does not change or rebuild the sealed adapter.

GTA, RPH and PlayGTAV processes were absent before rollback. I did **not** independently observe the final exit mechanism, so I cannot certify a normal quit or attribute the exit to a crash.

### Independent restoration: PASS at the end of the attempt

The existing journaled restoration procedure completed at **02:23:33 UTC on 27 October 2026**. It independently matched the saved original names, file hashes and executable signatures; **32 original root files, 179 archive metadata records and ten sampled archive hashes** passed their exact historical comparisons. All **27 temporary deployment paths** were absent. Introduced binaries and generated diagnostics were preserved privately outside GTA, not published. The executable-selection filename change was reversed.

This is a restoration result for that checkpoint, not a promise that Steam or another later operation cannot change the installation.

### Actual setup-display costs

The private final metrics report 22,960 HUD submissions totaling 48.1641 ms (maximum 1.2864 ms) and 20,489 outline submissions totaling 290.5494 ms (maximum 0.6397 ms). Process-wide managed memory at closure was 8,266,464 bytes. These are measured setup-display CPU costs and one CLR memory snapshot, not controller/observation performance, GPU time, FPS, isolated allocations or real-time certification. Zero controller/observation costs mean those operations did not run.

### Progress and preservation

Actual execution updates reached **0%, 15% and 25%** before setup was rejected; stop and restoration were then reported without awarding unperformed acquisition stages. The live calibration is not 100% complete. Combined progress remains **60%**. The later resumption check reverified **4,857 protected source/audio files, 139 protected link targets and 1,045 prior acoustics artifacts**, all unchanged. The source-synthesis checkout remains clean at its recorded checkpoint. No earlier PR was merged, no renderer or telemetry behavior changed, and no original or private recordings are included here.

## Resumption gate: original executable contents changed

On resumption, GTA/RPH were closed and all 27 temporary paths were still absent. Read-only verification rejected two original root-file hashes:

| Original file | Historical SHA-256 | Current SHA-256 |
|---|---|---|
| `GTA5_Enhanced.exe` | `69DA07FF67D05E9DED11289E597E8B8DC5855B0A429C085F37D148DC267CB2C5` | `B48E80F5FC899EB89E5DCC9F3B68E9551CC8DCFAC78B2A940B207E569E9987EA` |
| `GTA5_Enhanced_BE.exe` | `F67ECC62EBCE3BE67A5B1CC5531525EA2A46E938DEC9EB533F89F7E0B889A36B` | `5E7B36949A50A2D72D1F5519622A2086F0005B7C6530FC3FC3ADDFBD2F0C64BD` |

Both currently have valid Authenticode signatures and a last-write time of **10:07:36 UTC on 27 October 2026**. The main executable still reports **1.0.1158.16**; the BE executable changed size from 1,473,144 to 1,593,976 bytes. The original root set has no other content mismatch. The helper stopped at this root-file check; its subsequent archive/signature/package stages must not be represented as a completed fresh full verification.

I then inspected only the relevant local Steam app manifest and update-log entries. Steam records an automatic update of Enhanced app **3240220**, changed depot **3240225**, committing successfully at **10:07:37 UTC** to build ID **25971420**. It staged two files totaling **57,413,360 bytes**, exactly the current combined size of these two executables. An automatic update is directly evidenced; attribution of each individual file is strongly supported by timing and the two-file size match, rather than a per-file trace. Raw Steam logs and unrelated activity remain private. This does not establish RPH/loader/fix compatibility with the newly fingerprinted binaries.

I have not repaired files, overwritten the historical baseline, disabled security or performed another deployment/launch. The successful earlier restoration receipt remains intact. Exact-compatibility review is required before a new baseline or runtime attempt can be considered.

## Simplified follow-up direction: blanket requests, bounded observations

My revised requirement is blanket suppression of naturally occurring traffic during the benchmark. The three prepared native calls already take only a multiplier, **no area argument**. The yellow rectangle limits evidence collection; it never limits where density requests are sent. The existing preparation should therefore not be described as an area-specific traffic-disabling mechanism.

After the installation discrepancy is resolved, the next proposed calibration should remove the artificial requirement to align that rectangle to lane markings or exclude a junction. It should observe a bounded sample of the currently streamed vehicle pool from one stationary, safe pavement location, including junction arrivals, while retaining the same 45/45/45-second phases and 150-second hard cap. Position, camera, enumeration limits, read errors, first-observed versus previously observed identities, class/population categories and request receipts must remain explicit. An independently checked evidence schema must identify this changed observation domain; old corridor recordings must not be reinterpreted as pool observations. This is a **design proposal, not an implemented or sealed replacement package**.

I do not equate blanket density requests with complete traffic removal. Existing moving/parked vehicles can remain; dispatch and scenario behavior are unverified. No entity deletion, global dispatch switch or invented city-wide visibility is proposed. Empty enumeration cannot certify a distant road. The motorcycle benchmark remains blocked until route interference and reversible control are genuinely established.

The previous one-launch authorization has been consumed. This resumption adds no launch. The next single engineering action is to review runtime compatibility with the newly fingerprinted Steam-updated executables before preparing a revised, separately reviewable calibration. No further supervised experiment is authorized by this report.

## Resumption validation and publication

The complete current offline suite passes: **204 Node tests**, 73 geometry-observation assertions, 53 acquisition assertions, 164 tile assertions, independent C#/JS replay checks, 50 focused traffic assertions plus 13,511 repeated synthetic request-argument checks, 43 independent traffic interpretation checks, 119 Phase 1 checks, 65 telemetry assertions, nine configuration assertions and eight append-sharing expectations. No new tests are added for this documentation-only update. The sealed traffic source fingerprints are unchanged; no production behavior or defaults are changed.

Publication screening and exact-head hosted CI are reported with the updated draft PR after completion. Historical preparation evidence is retained separately from the new sanitized execution summary. No private logs, original audio, source positions, local session identifiers or binaries are included. Git history is preserved and no licence is selected. I retain combined progress at **60%**, with traffic effectiveness and the full motorcycle route still unverified.
