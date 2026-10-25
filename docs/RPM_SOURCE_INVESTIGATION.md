# P2-01 cross-framework RPM investigation

Offline review, 25 October 2026; decision revision 1. Starts at `495643e4e844fa8d4f0e0e835f375992f26c47c0`, preserving open PRs [#10](https://github.com/icydv/RichAudio/pull/10) and [#11](https://github.com/icydv/RichAudio/pull/11). Fetched `main` remains `e5fbd8f3502d3e28169a224caa07471e090e368f`. No PR was merged. No game launch, deployment, framework execution, memory reader, audio implementation or game-directory write was performed.

The [versioned source/capability inventory](../evidence/publication/rpm-source-review.json) records exact commits and provenance. Full source snapshots and inspection scratch work are private and excluded from publication.

## Decision

**Choose option 4 for now: retain the proven RPH integration, keep invalid RPM unavailable, and prepare a vendor correction/reproduction path.** No supported independent RPH RPM route was identified. **SHVDNE is the strongest source-supported independent candidate**, but its dependency chain and dynamic RPM on executable 1158.16 are not verified. LeFix provides a second Enhanced-aware native implementation worth discussing with its maintainer, not a deployable substitute established here. Do not make either an additional required runtime.

This is a bounded compatibility decision, not permanent dependence on RPH or indefinite waiting for a vendor. The next offline action is review of the [prepared maintainer reproduction](RPH_RPM_VENDOR_REPRO.md), followed by an authorised support inquiry if the user chooses. In parallel, seek an exact-build support statement and current released fix from SHVDNE/Script Hook V or a maintained native provider. A concrete supported candidate reopens the experiment gate below; another identical RPH test does not.

Evidence labels: **CONFIRMED** = RichAudio capture or directly inspected artifact; **SOURCE-SUPPORTED, UNTESTED** = source establishes the mechanism, not its current game behaviour; **PLAUSIBLE** = proposed design with unresolved gates; **BLOCKED BY COMPATIBILITY** = no verified complete 1158.16 dependency chain; **UNSUPPORTED** = unavailable in the stated platform; **UNRESOLVED** = insufficient evidence. A negative API search is not proof that no private/vendor capability exists.

## RPH: signature, behaviour and alternative APIs

The pinned SDK still hashes to `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0`, file version **1.124.1393.17586**, assembly `RagePluginHook, Version=0.0.0.0`. A fresh metadata-only PE/CLI read confirms:

| Member | Metadata fact | What it does not establish |
|---|---|---|
| `Vehicle.EngineRevolutionsRatio` | Read-only `System.Single`; getter signature `20-00-0C`; method RVA 0 | No inspectable implementation in this SDK; no field address, changed scale or runtime algorithm |
| `Vehicle.CurrentGear` | Read-only `System.Byte` | Neutral/reverse semantics or every shift's correctness |
| `Vehicle.NumberOfGears` | Byte getter/setter | An alternate RPM measurement; no setter was called |
| `NativeFunction.Natives` | Public static object property; dynamic native-call entry point | New native implementations not registered by the game/framework |
| `NativeFunction.CallByName`, `CallByHash` | Public typed/untyped invocation signatures | A stock RPM native or permission to call arbitrary addresses |
| `PoolHandle.Value/Index/Counter` | UInt32/UInt32/Byte | Identity equivalence to another framework's handle or permanent world identity |

The SDK is a declaration artifact: method RVAs are zero. It cannot diagnose the runtime's proprietary getter. A CLR reflection-only helper could not materialise its bodyless types; the successful PE/CLI reader inspected metadata without loading target code. No RPH binary was executed or decompiled. The [official SDK thread](https://www.lcpdfr.com/forums/topic/154295-rph-sdk/) explicitly permits using the current SDK for Enhanced; the different SDK/runtime versions alone are **not** proof of an ABI fault.

The [historical getter contract](https://docs.ragepluginhook.net/html/P_Rage_Vehicle_EngineRevolutionsRatio.htm) describes a dimensionless 0–1 engine ratio. Its documentation applies to RPH 0.56, not an independently confirmed new Enhanced contract. Direct page retrieval returned 404 during this review; indexed official text remained available. [Native invocation documentation](https://docs.ragepluginhook.net/html/M_Rage_Native_NativeFunction_CallByHash.htm) directs callers to `NativeFunction.Natives`. Native invocation changes the access route only if an appropriate native actually exists.

The current [author-maintained native database](https://github.com/alloc8or/gta5-nativedb-data/tree/424fb51b089049a9fbcebcc641500b1d44d255b4) contains `GET_IS_VEHICLE_ENGINE_RUNNING` and other engine/vehicle state but no identified stock current-RPM getter in the reviewed named surface. Engine health, audio flags, gear count and road speed do not independently measure engine speed during stationary revving, wheel slip or shifts. Unnamed natives are not a licence to guess. No alternative public RPH route, vendor correction or changed Enhanced ratio contract was established by the SDK/docs/support search. Existing historical regression notes are not proof of today's cause.

**CONFIRMED capture finding:** all 1,683 player raw samples were `48.333335876464844`, through user-confirmed audible stationary revving, acceleration, a natural shift and braking. Speed reached 33.9063 m/s, gear getters traversed 0–4 and engine-on was true. Driven NPCs produced other finite out-of-range constants; inactive unoccupied vehicles produced zero. [Published aggregates](../evidence/publication/drivetrain-result.json) and [complete test limitations](P2_01_DRIVETRAIN_VALIDATION.md) remain the authority. Source-side widening from float to double does not rescale values. Dividing a constant cannot recover dynamics. Whether this is a wrong field, stale implementation, binding issue or contract difference remains **UNDETERMINED**. No supportable local correction was found.

## SHVDNE: an independent reader, with explicit failure limitations

Reviewed author repository `Chiheb-Bacha/ScriptHookVDotNetEnhanced`:

- Current `main`: **`b5314686ab534d9cec8914625a0f5ab2dde528ea`**, 6 October 2026.
- Latest published release **v1.1.0.6**: **`d756d479337a677cce9853b0cce63471c1fc7b7c`**, 15 July 2026; internal assembly version 3.9.0.6.
- Release support change: **`578bca03126114a0e8109ac3c4a97694b5a61832`**, explicitly 1158.13. This changes an entity-position pattern, not the RPM reader.

The [v3 Vehicle getter](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/b5314686ab534d9cec8914625a0f5ab2dde528ea/source/scripting_v3/GTA/Entities/Vehicles/Vehicle.cs#L1501) and v2 counterpart resolve `MemoryAddress` from the entity handle, then read a float at `NativeMemory.Vehicle.CurrentRpmOffset`. They do not call RPH or a stock RPM native. The API describes a **0–1 ratio**, not revolutions/minute; the getter performs no display interpolation or physical calibration. A setter exists but is irrelevant and must not be used for observation.

In [NativeMemory](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/b5314686ab534d9cec8914625a0f5ab2dde528ea/source/core/NativeMemory.cs#L3968), Enhanced selects a distinct instruction-pattern search and extracts an operand as the RPM displacement; Legacy has a separate pattern. It derives adjacent clutch/acceleration displacements too. This is runtime pattern discovery plus assumed layout relationships, not a certified fixed-offset table for each released build. Enhanced is detected from the executable module name; file-version comparison logic adjusts the major version for Legacy-oriented checks. An old `GameVersion` enum lacking 1158.16 neither proves refusal nor establishes support: other paths use the actual file version and Script Hook V.

If no pattern matches, the offset remains zero; if the entity address or offset is zero, `CurrentRPM` returns **0.0**. This collapses missing acquisition and a real zero. If a wrong nonzero pattern/offset is found, the getter has no semantic range/dynamic check; a bad entity resolution or lifetime can cause invalid memory access. `MemScanner` searches the process module and returns a match/null, rather than verifying RPM meaning. These mechanisms are inspected source facts, **not a recommendation to copy their signatures**. No pattern was applied to the game or transplanted into RichAudio.

The RPM implementation is unchanged between the reviewed tag and `main`. Their only source difference is a **separate player-info offset correction**, [issue #19](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/issues/19), acknowledged/fixed upstream in `b531468`. The reporter explicitly identifies an executable file version **1.0.1158.16**, while calling its patch 1158.13. That is useful evidence of someone exercising the framework on such an executable, and illustrates patch-label/file-version ambiguity; it is **not** a test of RPM, RPH coexistence or RichAudio's exact files. The defect is unrelated to RPM, but means the latest tag should not be called universally safe. The maintainer says the correction will be in the next release; no newer release was listed at review time.

**Conclusion:** source independently targets an engine-state field capable in principle of changing at rest; it does not calculate RPM from speed. It is therefore a credible alternative mechanism. Its float could still be wrong, stale or constant on 1158.16 if layout/resolution is wrong. Independence of implementation is not independence from game layout failures. There is **no live RPM validation** of this provider here.

## STEAVN Vehicle HUD 2.3.0

The user-supplied source ZIP was found in accessible local Downloads; no assumption about conversation attachments was needed. ZIP SHA-256 **`842793B96FF345A89820B3F3F1D467C0DDA4935D93C51EB03ACB76F077CADDA7`**; `scripts/STEAVNVehicleHUD.cs` SHA-256 **`C92FD3A40A9248CE43BF29B73E7F4A41B4A581DFF25536907D9B0549F22279BE`**. Only text was inspected privately, without running its script. Version/author/readme correspond to the [STEAVN Nexus listing](https://www.nexusmods.com/gta5enhanced/mods/1599?tab=description); no publisher signature attestation was available.

Its road-vehicle draw path (source lines 3913–3943) reads `v.CurrentRPM` from GTA/SHVDNE and clamps it for presentation. `CalculateDisplayRpm` (2575 onward) maps the ratio through assumed idle/redline values. Idle uses model-hash buckets, with special car/motorcycle overrides. `GetRedline` (4269 onward) uses model/class tables and hash-based fallbacks. These are **estimated dashboard RPM**, not calibrated crankshaft measurements.

`GetStartupSelfTestRpm` (2612 onward) uses timed eased rise, hold and settling stages. Its README explicitly describes this as display-only; engine state is not written. Outside startup/idle overrides, the displayed operating change depends on `CurrentRPM`. There is no independent engine-state acquisition or general RPM temporal filter in that road path; clamps, rounded remapping and the special startup interpolation must be separated from the input. A moving needle at ignition alone proves nothing about that input. The HUD concentrates on the occupied vehicle, not measured NPC coverage.

The listing requires SHVDNE v1.1.0.6 or newer and a compatible Script Hook V, without exact 1158.16 raw-getter evidence. Nexus permissions prohibit reupload and require permission to modify/use assets. No open-source licence was found in the archive. No source, tables, graphics or implementation were copied into RichAudio. Inspection permission is not redistribution permission.

## NFSgauge 2.63.2

No matching NFSgauge archive/source was found in the checked local Downloads or Codex attachment filenames. The [author's mod page](https://www.gta5-mods.com/scripts/nfsgauge-rpm-gear-speedometer) identifies **XMOD**, version 2.63.2 (30 December 2017), a Script Hook V ASI, and credits IKT/LeFix for gear-reading/programming contributions. Its older changelog discusses version calibration, idle calibration and needle corrections. The newer page-update timestamp is not evidence of a rebuilt Enhanced release. The author's pinned testing statement names Legacy 1868.1.

No lawful public source for this version was established. Its exact RPM acquisition, offsets, filtering and displayed scale remain **UNRESOLVED**. Credits do not prove it uses a particular IKT RPM function. A generic claim of an RPM gauge or historical auto-calibration does not prove Enhanced 1158.16 support. No ASI was executed, disassembled or reproduced. The author restricts reupload; nothing from this package is included. This is a historical pointer, not a dependency candidate.

## IKT and LeFix implementations

| Author source reviewed | What the source establishes | Build/use/licence boundary |
|---|---|---|
| [Manual Transmission](https://github.com/ikt32/GTAVManualTransmission/tree/74019c831a50ac99ebad9dea08f865b03c1dca11), archived HEAD `74019c831a50ac99ebad9dea08f865b03c1dca11`; tag v5.6.2 `adb5bdb190c436f2e150eda5dc1fd21570228a60` | `VehicleExtensions::GetCurrentRPM` reads a float from a pattern-derived displacement; zero offset returns zero. Unlike SHVDNE's getter, this old accessor itself lacks a null entity-address guard. Player `VehicleData` and `ScriptNPC` both call it. Engine-off player cache uses a synthetic 0.01 fallback; transmission logic can also write/simulate RPM. | Archived January 2025, before Enhanced; not exact-build evidence. Whole mod alters drivetrain behaviour and is excluded. No clear project-wide licence found; a bundled SHVDN notice does not license everything. No code copied. |
| [NFSU/GTAVSpeedo](https://github.com/ikt32/GTAVSpeedo/tree/ea8898bd290897c1a76b1b6b070aa05c95cce363), HEAD `ea8898bd290897c1a76b1b6b070aa05c95cce363` | Player display calls `VExt::GetCurrentRPM`, then interpolates the needle using frame time; source submodule points to Manual Transmission. Rendering motion must be separated from acquisition. | 2021 source; no 1158.16 evidence. MPL-2.0 project source; separate dependencies/assets still need review. Not NFSgauge by XMOD. |
| [LeFix Speedometer, maintained by IKT](https://github.com/ikt32/gta5-speedometer/tree/2054f6e143be1ce1f8ddcb4d162a0788825adc1d), HEAD/tag v1.4.0 source `2054f6e143be1ce1f8ddcb4d162a0788825adc1d` | Enhanced-specific `VehicleExtensions::GetOffsets` discovers a gear-related displacement, then derives RPM through adjacent layout relations. `GetCurrentRPM` reads float, returning zero on missing offset/address; `VehicleData::updateRpm` uses it. Physical-looking dial maximum can come from per-model INI settings. | Release v1.4.0 explicitly targets Enhanced **1013.34**, not 1158.16. Requires Script Hook V; version detection uses it, entity resolver has pattern and SHV-address paths. GPL-3.0 source; reuse/linking obligations require a licensing decision. Source availability does not certify layout or the complete dependency chain. |

These sources demonstrate independent memory-backed ratio acquisition and, in Manual Transmission, NPC call sites. They do not supply verified accurate RPM for streamed NPCs at range. No published source examined gives an engine-specific physical-RPM calibration for our test car. Later private/paid IKT updates were not accessed or assumed equivalent to archived public code.

## Script Hook V, stock natives and Cfx extensions

1. **Script Hook V** invokes the game's script-native handlers and provides runtime utilities, entity-address access and scheduling. Its SDK is not a promise that every managed `Vehicle` property has a stock-native equivalent.
2. **Stock Story Mode natives** expose engine-running and other state. No identified public current-RPM native was found in the reviewed named database. Adding SHV solely to call the same native surface offers no demonstrated RPM benefit over RPH's existing invocation API.
3. **SHVDNE** adds memory-backed functionality on top of SHV. `CurrentRPM` is one such addition; it is not supplied merely by installing SHV.
4. **Cfx/FiveM** declares [`GET_VEHICLE_CURRENT_RPM` in namespace CFX](https://github.com/citizenfx/fivem/blob/46de79bc1d4dd7c64f16c5cfbadf94612b5ab3d9/ext/native-decls/GetVehicleCurrentRpm.md). Its [extra-native source](https://github.com/citizenfx/fivem/blob/46de79bc1d4dd7c64f16c5cfbadf94612b5ab3d9/code/components/extra-natives-five/src/VehicleExtraNatives.cpp) registers a custom handler backed by `CurrentRPMOffset`; it is not a stock Rockstar native. Neither RPH nor SHV alone registers that handler. Its dashboard RPM handler is a different custom path again. No FiveM code/runtime was installed or proposed here.
5. **Community custom natives/exports** require their implementing runtime and its validation. A familiar function name/hash is not portable evidence.

The [official SHV listing](https://www.dev-c.com/gtav/scripthookv/) still advertises **v3889.0 / 1158.13**, released 15 July 2026, and names Enhanced **1.0.1158.13** in its supported-patches field. Exact executable 1158.16 support is **not established**, rather than proven impossible. The issue #19 patch/file-version distinction deserves an author clarification, not an invented patch. Our proven Alexander Blade **XInput loader 1.0.0.2** is a loader, not proof that `ScriptHookV.dll` supports this executable. The existing working deployment did not install that DLL.

## Decision matrix

Rows compare capabilities for this exact game, rather than gauge popularity. Physical RPM remains unavailable for every route without independent calibration.

| Criterion | RPH property / supported correction | RPH + small native provider (LeFix-style candidate) | RPH + SHVDNE |
|---|---|---|---|
| RPM authenticity | **CONFIRMED unusable** current property; correction unresolved | Source reads engine-state float; **SOURCE-SUPPORTED, UNTESTED** | Independent memory-backed float ratio; **SOURCE-SUPPORTED, UNTESTED** |
| Exact 1158.16 support | Integration proven; RPM correction not established | **BLOCKED BY COMPATIBILITY**: v1.4.0 claims 1013.34; SHV chain unresolved | **BLOCKED BY COMPATIBILITY**: release claims 1158.13; issue #19 names exe .16 but does not validate RPM/whole chain |
| NPC support | Observed invalid driven NPCs; other motion works | Accessor takes an entity handle; no local NPC measurements | Vehicle getter applies to any resolved entity; no local NPC measurements |
| Stationary revving | Confirmed constant despite audible revving | Memory route does not depend on road speed; response untested | Same source advantage; response untested |
| Gear-change response | Gear partly corroborated; RPM did not respond | Dynamic response untested | Dynamic response untested |
| Dependency complexity | Lowest; known working RPH/fix/loader | At least reviewed provider + verified loader/SHV if required; custom reader is not a supported shortcut | SHV runtime + matched SHVDNE ASI/API DLL set, config and managed script; more failure modes |
| Performance | Existing capture ~20 Hz; getter invalid | No measured cost; discovery/startup scan and copied IPC have cost | No measured cost; another scheduler/managed domain, startup scan and IPC |
| Update resilience | Vendor owns opaque layout; currently wrong signal | Maintainer must maintain patterns, layout and entity resolver | Upstream maintains patterns/resolver plus SHV; zero fallback can hide breakage |
| Open-source suitability | Proprietary SDK/runtime kept out of Git | Depends on provider licence; LeFix GPL-3.0, old MT licence unresolved | zlib with separate third-party notices; proprietary SHV/RPH still separate |
| RichAudio fit | Preserves working path and schema | Optional copied-value provider only after identity/build validation | Optional copied-value provider; never share `Rage.Vehicle` / `GTA.Vehicle` instances |

Ranking **now**: (1) keep RPH, prepare vendor evidence and seek a supported correction; (2) SHVDNE as the most explicit independent public-source candidate for a future gated comparison; (3) maintained Enhanced native-provider inquiry, with LeFix as source evidence, not an approved reader; (4) historical HUD packages as references only. Option 1's alternative public API is unresolved; option 2 has no verified independently supported provider to implement; option 3's added complexity is unjustified until compatibility gates pass. Option 4 is therefore the current recommendation.

## Optional provider contract: design only, no runtime bridge or ABI

The concrete benefit is preventing a future provider's zero/stale/misidentified value from contaminating proven RPH motion telemetry. The existing copied `VehicleObservation`, `Field<T>` provenance and session-local tracker already provide a suitable boundary. **No C# interface, IPC transport or public binary ABI is added now.** Production schema 1 and historic recordings remain unchanged.

Proposed observation-envelope revision 0, subject to a real provider's capabilities:

| Field group | Required meaning |
|---|---|
| Provider/capability | Protocol revision, provider ID/version, acquisition API, game exe build, dependency fingerprints, read-only capability, declared signal contract and whether capability discovery itself succeeded |
| Identity | Game-process/session epoch, framework/identity namespace, opaque authoritative entity ID, validity, provider generation, plus a separately verified mapping to RPH tracking generation; model is only a consistency check |
| Time/order | Acquisition start/end on declared monotonic clock, clock frequency/epoch, sequence, generation, estimated alignment uncertainty; receipt time separately recorded |
| Measurement | Raw finite value or null/nonfinite category, units (`engine_ratio` versus calibrated `rev/min`), range/normalisation declaration, status and observed/estimated classification; explicit unavailable reason |
| Calibration | None by default; physical RPM allowed only with identified engine-specific calibration/version and provenance |

Reject unknown protocol/build/capability, invalid/nonfinite/out-of-contract readings, future/backward/out-of-order times, provider reset, missing identity mapping or retired generations. Proposed 20 Hz freshness policy: accept only if **age plus clock uncertainty <=100 ms**, uncertainty <=25 ms and no future acquisition; these are design limits, not tested tolerances. Clock-domain negotiation is mandatory: matching `GameTime` numbers or two session-relative Stopwatches is insufficient. In-process QPC values can share an epoch only after frequency/origin verification.

Do **not** assume `Rage.PoolHandle.Value` equals SHVDNE's script handle or that their generation fields have the same meaning. A common script/entity identifier and its lifetime mapping need authoritative verification; until then the join is **unavailable**. Model/name, plate, nearest position, pointer guesses or two independent local counters cannot establish identity. Cross-provider identity must fail closed through handle recycling and reacquisition. Supporting only a player-vehicle claim still needs verified occupant/entity identity at acquisition, not just “currently player”.

Each framework samples on its own supported scheduler, copies primitives, then hands a bounded snapshot to a transport worker. RPH reads the latest accepted snapshot without waiting. A background IPC worker must not call game APIs. No framework objects, native pointers or callbacks cross the boundary. Provider shutdown/unload publishes termination, invalidates its epoch and expires retained values; RPH continues movement telemetry with RPM unavailable. No callback into a released domain, unbounded queue or blocking game-fiber handshake is acceptable. These behaviours would need offline mismatch/generation/clock/stale/backpressure/shutdown tests **when an adapter is justified**, not speculative infrastructure today.

SHVDNE's [README](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/b5314686ab534d9cec8914625a0f5ab2dde528ea/README.md) describes a dedicated thread chosen to avoid RPH/fiber/try-catch conflicts. This is coexistence design intent, not our stability proof. It warns about main-thread-dependent scripts and requires matching ASI/API DLL versions. Default console F4 collides with RPH F4; autoload/reload and both independent shutdown paths need an explicit plan. Do not reload the proven RPH plugin merely to repair a second provider. Startup order and absence/failure must degrade to RPH-only, never block it.

## Conditional next live experiment — not authorised or executed here

**No presently deployable RPM recovery candidate passed the exact-build gate.** A future test becomes defensible only after either a vendor-supported RPH correction or an explicitly supported SHV/SHVDNE release/provider for executable 1158.16 is obtained and reviewed. Do not quietly substitute current SHV v3889.0/1158.13 or build an upstream-main DLL to bypass a release gap.

Prefer the smaller RPH correction experiment if available: record exact vendor version/hash, retain DirectStorageFix 1.2 and XInput loader 1.0.0.2 only if still compatible, unchanged RichAudio source except any justified API binding, and replace only journalled temporary files. Otherwise the comparison candidate is **SHVDNE v1.1.0.6 source plus upstream b531468 correction as a requirement for a future supported release**, not an approved binary. Exact future runtime/dependency versions cannot honestly be named before that release/support evidence exists. A native provider would require an equally pinned maintained release; archived Manual Transmission and its behaviour-changing plugin are excluded.

For a separately authorised single launch, RPH remains primary. Compare unfiltered raw RPH and independent ratio observations with timestamp/validity and verified identity, never overwrite one stream with the other. Log the provider capability (so unsupported-offset zero is not accepted as engine-off), player engine state, speed, gear, scenario and bounded NPC subset. No HUD is needed. Use 15–20 s idle, audible stationary revving, acceleration with at least one user-confirmed shift, and braking/idle return. Record raw minima/maxima/deltas and acquisition/cadence/drops, without physical-RPM conversion. Do not infer every shift from getter indices alone.

Success requires the independent signal to vary during stationary audible revving well above idle repeatability/float noise, respond plausibly through acceleration/shift/deceleration, remain within its supported contract, and maintain exact vehicle/time association with no new instability. Define the measurable noise/dynamic threshold from the idle segment before judging revs; range alone is insufficient. Zero with unknown capability, another model-dependent constant, ambiguous identity, stale data, frame stalls or new crashes fails/stops the experiment. NPC response is a separate finding, not implied by the player result. A ratio does not become physical RPM on success.

Prepare an exact new manifest (including any SHV DLL, matched SHVDNE ASI/API DLLs/config and owned observer), dependencies/licences, no-overwrite conflict checks, one-launch journal and independent rollback before seeking installation approval. Preserve the current known-working binary/config separately. Capture disabled by default; no installer or bridge has been written. Verify original executable names/signatures/hashes, all original root files/directories, archive metadata and sampled hashes; remove all introduced and generated files and confirm both runtimes exited. Do not run this plan under the present offline authorisation.

## Validation and publication boundary

This change is documentation and a portable source/capability inventory only. No product code, schema, validator, synthetic replacement value, getter, framework dependency or runtime interface was changed. Existing missing/invalid-RPM and bounded-diagnostic tests remain relevant; no artificial provider was invented to justify new tests. `tools/Test-Offline.ps1` passed: **65 core assertions, 35 drivetrain assertions, 17 metadata-parser tests, 3 diagnostic-analyzer tests, 107 Phase 1 checks, 9 configuration assertions and 8 isolated append expectations**. Core/analyzer/test programs compiled without game dependencies. Product source, tests, tools and CI configuration remain byte-identical to the parent commit. These tests cannot validate SHVDNE/LeFix or game compatibility.

Both sealed prior captures were freshly hashed and still match their recorded normal/sidecar SHA-256 values in the drivetrain report. No new capture was generated. Source comparisons confirm the RPM path is unchanged between SHVDNE v1.1.0.6 and the reviewed main. Documentation links, JSON parsing and publication screening are checked separately; private source clones/helpers are excluded by `.local/`.

Third-party clones/source snapshots, the user HUD archive, static inspection helpers and all raw diagnostics remain ignored/private. Only authored analysis, source links/commit identifiers, hashes and prior sanitised aggregates are committed. No source snippets from the HUD or other third-party projects are reproduced. RichAudio's own licence remains unselected. No issue/support request was sent and no proprietary runtime was redistributed.
