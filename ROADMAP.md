# Roadmap

## Current governing roadmap — 25 October 2026

**Current integration update (25 October 2026):** The single instrumented RPH launch proved GTA V Enhanced's `dstoragecore.dll` opens `RagePluginHookLauncher.log` incompatibly with RPH's later write-open (Windows `0x80070020`); see [PR #3](https://github.com/icydv/RichAudio/pull/3). Story Mode, RichAudio initialisation and genuine live telemetry remain blocked/unverified. The [DirectStorageFix](docs/RPH_IO_FAILURE_INVESTIGATION.md) and publisher-recommended ASI loader require compatibility, provenance, licensing, safe deployment and startup-order review before any newly authorised runtime experiment. ProcMon's `PROCMON25` filter remained registered after an unsuccessful supported unload; verify cleanup after a user-controlled restart before any further runtime test. The audited GitHub initial push is complete. The [Acoustic Benchmark design issue #8](https://github.com/icydv/RichAudio/issues/8) is explicitly deferred, not a Phase 3 implementation.



The expanded world-wide audio vision broadens future source families and acceptance criteria while preserving the existing stage gates. Historical checkpoint paragraphs below retain their original context; their pending-selection statements are superseded by [the controlled attempt](docs/P2_01_ENHANCED_RUNTIME_ATTEMPT.md).

1. **Immediate P2-01:** review the evidence-backed DirectStorage file-sharing correction and required ASI-loader provenance/compatibility, independently confirm diagnostic-driver cleanup, and only then consider a newly authorised single reversible Story Mode attempt. Enhanced 1158.16 selection is established; RPH hook completion, RichAudio initialisation and all live telemetry remain unverified. After an actually successful integration smoke test, proceed to authorised A–E checks, including urban/rural streaming, handle reuse, RPM availability, missing data, cadence and paired performance measurements.
2. **P2-02 ownership:** only after P2-01 live acceptance, establish isolated native control or a legitimate stock/custom source-provider route, unrelated-sound preservation, no duplication and reversible recovery. Stock compatibility cannot be claimed from container parsing. Failure here requires an explicit scope decision.
3. **Standalone acoustic proof:** only after those integration gates, compare candidate technologies in owned synthetic scenes; validate transforms, band energy, delays, consumer playback and bounded performance. Steam Audio remains optional. No renderer implementation occurs in the current checkpoint.
4. **Controlled road-vehicle slice:** stock V8 and calibrated inline-four, direct propagation, source scale/load response, then validated city/tunnel geometry and indirect paths. Prove stock and supported custom providers with controlled A/B comparisons and clean native coexistence.
5. **Aircraft priority:** separate heavy/tandem-rotor and jet source/state/ownership studies, then altitude/direction, modulation, delay/Doppler and distant audibility tests. Strong aircraft presence is a major milestone, not an incidental volume preset. Shockwaves require reliable actual supersonic state.
6. **Impulses and world expansion:** observed backfire/gunshot/explosion events, environmental echoes/transmission, sirens, interior/exterior transitions, ambience and weather, each with independent source ownership and acceptance gates.
7. **Scale and continuity:** traffic/aircraft coverage measured before promising long range; bounded uncertain persistence/reacquisition, masking/priorities, adaptive ray/source budgets, geometry caching, quality presets, device accessibility and stress/soak/performance validation.
8. **Future FiveM research:** after proven single-player integration and rendering, verify client/platform permissions, resource/native boundaries and optional server-authorized distant-state transport, fairness, clocks, ownership and bandwidth. No implementation now.
9. **Release gates:** source/rights audit, explicit license decision, safe installer/rollback, compatibility matrix, blind listening and quantitative regressions, then a truthful semantic prerelease if justified. No versioned release is created by this documentation update.

**GitHub publication status:** the audited sanitised history has been uploaded; original unsanitised commits remain archival only. The remote is currently reported public (owner should review visibility); public licensing is undecided. CI preparation, passing offline tests and issue tracking never count as gameplay validation. See [PROJECT_GOVERNANCE.md](PROJECT_GOVERNANCE.md).

Phase 2.2 preparation: six installed Steam depot manifests and normal Rockstar logs corroborate the extra-executable selection hypothesis. The exact temporary rename/26-file redeployment experiment is prepared with a verified backup, awaiting fresh approval. Positive local RPH Enhanced 1158.16 identification and a successful telemetry smoke test remain gates; no new game launch or A–E result exists. [Investigation](docs/PHASE2_2_EXECUTABLE_SELECTION.md).

Latest P2-01 gate: the approved 24 October runtime attempt reached RPH Settings but reported unsupported 1013.34 instead of the expected Enhanced 1158.16. Game-file additions were rolled back; the approved VC2010 prerequisite remains installed. Establish an author-supported target-selection/launch plan before another deployment or A–E run. No live player/NPC data or meaningful distance has been obtained. See [actual attempt evidence](docs/P2_01_FIRST_RUNTIME_ATTEMPT.md). Phase 3 stays blocked.

Date: 24 October 2026. All future milestones are **UNTESTED** until a run record exists. Gates are cumulative, not calendar promises.

Phase 2 current record: [validation](docs/PHASE2_VALIDATION.md), [standalone RPH compatibility](docs/RUNTIME_COMPATIBILITY.md), [deployment](docs/DEPLOYMENT.md). P2-01 is built/offline-tested but unverified in game; no live capture or Phase 3 implementation has occurred.

Phase 2.1: official RPH 1.132.1428.17748 package acquired and fingerprinted, 26-file conditional proposal prepared, signed Microsoft prerequisite staged but unrun. Next gate: explicit prerequisite/install approval, standalone startup/API binding, then A–E and paired performance measurements. See [readiness](docs/PHASE2_1_READINESS.md). NVMe DirectStorage and actual session setup remain launch-time checks; no acoustic work proceeds from this static inspection.

| Stage | Deliverable | Acceptance / dependency | Current status |
|---|---|---|---|
| 1. Resource investigation | Versioned docs, read-only parsers, real vehicle chain, derived evidence | Actual files/GUI inspected; no archive writes; unknowns classified; local Git commit | Accessible investigation complete; runtime facts deliberately incomplete |
| 2a. Compatibility + telemetry | P2-01 logger and replay schema | Exact Enhanced runtime preflight; compiled SDK target; authorized A–E/10-min run passes telemetry, lifecycle and timing criteria | Core/RPH/analyzer compiled and offline-tested; deployment authorization/runtime preflight and all live tests PENDING |
| 2b. Source ownership | P2-02 native profile/isolation matrix | Per-instance engine isolation, collateral sound preservation, known-state restore and failure recovery demonstrated | UNTESTED, critical go/no-go |
| 3. Standalone acoustics | Owned synthetic sources, free field/plane/corner/portal tests | P2-01 live acceptance first; then transforms, analytic attenuation/arrival times, bounded energy, latency and no starvation | Deferred until P2-01 validation; no acoustic implementation in Phase 2 |
| 4. Local geometry pipeline | One validated acoustic tile + tunnel/interior samples | Correct placements, primitive conversion, materials with provenance, doors/portals, cache invalidation by build and state | YBN data accessible; conversion and world match UNTESTED |
| 5. One owned vehicle | Source profile + direct rendering + chosen native ownership policy | RPM/load calibration, source direction, no duplicated direct engine, no unrelated sound loss; A/B capture and failure test | UNTESTED; depends on 2a/2b/3 |
| 6. Environmental slice | Four scenario experiments | Valid paths and geometry-dependent response; documented approximations; acceptable CPU/latency and listening results | UNTESTED; depends on 4/5 |
| 7. NPC scale | Measured visibility/telemetry coverage, priority tiers, reduced-detail sources | Natural crowded traffic, fixed budgets, lifecycle correctness, 30-min stress and 2-h soak, explicit far-NPC limitations | UNTESTED; entity availability may limit product scope |
| 8. Broader sound families | Aircraft, gunfire, weather, ambience/interiors | Separate source ownership/telemetry validation for each family; coherent propagation and device mix | Future research, no blanket native replacement assumption |

## Phase 1 definition-of-done audit

| Requested item | Evidence / disposition |
|---|---|
| Environment inspected | VERIFIED OS, CPU/GPU/RAM, executable/Steam versions, Framework/Git/Node; C++ tools not located in checked paths |
| Tool access verified | VERIFIED all three supplied roots; CodeWalker GUI and core used; OpenIV/OpenRPF version/presence inspected |
| Actual audio inspected | VERIFIED base/update/two DLC REL sets, occlusion samples, selected AWC containers |
| Vehicle chain | VERIFIED Bati data references into player/NPC AWC stream tables; blank-identifier runtime fallback remains INFERRED |
| Telemetry feasibility | Source-assessed matrix complete; actual values on installed build BLOCKED/UNTESTED |
| Native integration limits | Documented selective-mute/profile/routing uncertainties and experimental gate |
| Candidate technologies | Source-backed comparison and integration/licensing/performance constraints documented |
| First in-game plan | P2-01 exact logger implementation, procedure and pass/fail criteria |
| Classified findings | VERIFIED / INFERRED / UNTESTED / BLOCKED used; source facts distinguished from game tests |
| Consistent repository | Nine requested documents, source contracts, ignore rules, tests/evidence and named local commit |
| No original game changes | No game write/hook/install actions; ten inspected physical archives hashed unchanged |
| Full runtime compatibility | INCOMPLETE; do not mark as verified from documentation |
| Clean audio handoff | INCOMPLETE; no experimental evidence yet |
| Whole-world export/real-time acoustics/benchmarks | INCOMPLETE; outside Phase 1 implementation scope |

## Scope decisions after gates

If exact-build telemetry cannot be supported through a maintained framework, continue offline replay/geometry/source research and keep in-game deployment blocked. Do not bake undocumented offsets into an assumed universal adapter.

If per-instance ownership fails, keep native audio and evaluate narrow metadata improvements or a separate offline demonstrator. A delayed/quiet supplemental engine still duplicates native content and does not automatically satisfy the mission.

If distant NPC identity is unavailable, offer clearly labelled statistical traffic ambience only as a scope change; it cannot be described as simulating the actual unstreamed traffic population. If collision geometry has unresolved live state, restrict validation to explicitly verified static scenes rather than extrapolating from one successful YBN parse.

Expand source count, simulation quality and world coverage only after the preceding configuration has measured headroom. Version every accepted test record with game/tool hashes so a game update can invalidate only the affected claims.
