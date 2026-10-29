# Roadmap

**Governing acoustic acceptance requirement — 29 October 2026:** Preserve multiple simultaneous early reflections and valid multi-bounce paths per source, extending the existing direct/first-/second-order engine. Future selectively traced higher orders and an environment-dependent, computationally bounded late-reverberation field must fit the same rendering architecture, with plausible delays, directions, band losses, surface interaction and smooth transitions. Sparse observed patches do not establish calibrated enclosure/decay properties. See the [architectural contract and future acceptance criteria](ARCHITECTURE.md#governing-acoustic-requirement--29-october-2026). This is a standing design requirement; it does not expand ACOUSTICS-08.1 into a reverberation implementation or change recorded milestone completion.

**ACOUSTICS-07 — 28 October:** I've built a [Windows shared-mode output host and causal streaming acoustic producer](docs/ACOUSTICS_07_REALTIME_AUDIO_HOST.md), verified actual device delivery, a 60-second synthetic soak and four-source output, and measured a synthetic listener orientation update reaching endpoint PCM. A 16-source device stress run starved and stopped safely; the public host is limited to four sources. The read-only RPH bridge compiles but remains undeployed. My next step is a separately approved, exact-build-reviewed orientation-only synthetic-beacon test; it does not claim physical GTA coordinates or native sound ownership. The independent ACOUSTICS-05 + BENCHMARK-01 milestone stays at **60%**.

**ACOUSTICS-06 — 28 October:** I've implemented a [working offline propagation and stereo PCM engine](docs/ACOUSTICS_06_AUDIO_PROPAGATION_ENGINE.md), with five original WAV demonstrations, finite first/second-order reflections, material/obstruction filtering and quantitatively tested moving-source/listener Doppler. This explicitly authorised synthetic implementation supersedes the older prohibition on standalone renderer work below; it does not clear live Phase 3, native ownership or coordinate-calibration gates. Late diffuse reverberation, HRTF and live output remain deferred. My next acoustic milestone is an owned synthetic-beacon output host with neutral telemetry transport, replay validation and a separately approved live test after scale/ownership preflight. The separate Bati investigation and combined 60% milestone remain unchanged.

Historical checkpoint statements below retain their original dates and must not be read as the current status of ACOUSTICS-06.

**ACOUSTICS-03 — 26 October:** I've completed one separately approved [nine-ray GTA surface reconstruction](docs/ACOUSTICS_03_SURFACE_RECONSTRUCTION.md). All nine real hits support an independently checked, bounded inferred patch; the observer finished without the previous shutdown warning and the fresh installation comparisons pass after normal quit/restoration. Real edges, sub-grid openings, material, permanence and physical scale remain unknown. The candidate stays outside the validated metre-coordinate acoustic tile. My proposed next step is separately authorised bounded multi-surface diagnostic-tile research; source synthesis, native audio ownership and audio rendering remain unchanged.

**ACOUSTICS-02 — 26 October:** I've completed one separately approved Enhanced 1158.16 world-only observation through RPH 1.132.1428.17748. The [point/normal result](docs/ACOUSTICS_02_LIVE_GEOMETRY.md) passes independent validation and is consistent with my supervised wall target. All 27 temporary paths are removed and exact saved installation comparisons pass. Extent, acoustic material, permanent static identity and complete coordinate calibration remain unknown; no real GTA reflection or sound output is claimed. My proposed next step is separately authorised bounded multi-observation surface reconstruction. Source synthesis, P2-03.12 and Phase 3 are unchanged.

**Parallel ACOUSTICS-01 — 26 October:** I've implemented and offline-tested a [bounded local geometry tile and first-order reflection prototype](docs/ACOUSTICS_01_LOCAL_GEOMETRY.md), with original open-road, urban and obstruction scenes and calculated visualisations. Actual GTA geometry acquisition remains untested, materials unknown and live audio ownership unresolved. One separately authorised exact-build world observation is the next proposed acoustic step; no live experiment, source-synthesis change, P2-03.12 trajectory audit or Phase 3 integration is started here.

## Current governing roadmap — 25 October 2026

The expanded world-wide audio vision broadens future source families and acceptance criteria while preserving the existing stage gates. Historical checkpoint paragraphs below retain their original context; their pending-selection statements are superseded by [the controlled attempt](docs/P2_01_ENHANCED_RUNTIME_ATTEMPT.md).

1. **Immediate P2-01:** diagnose RPH's verified startup IOException through preserved diagnostics and supported guidance. Enhanced 1158.16 selection is established on this host; hook/plugin startup and all live telemetry remain unverified. No new runtime experiment is part of this architectural update. After a reviewed remedy and applicable deployment authorization, complete smoke/A–E, including natural urban/rural streaming, handle reuse, RPM availability, missing data, cadence and paired performance measurements.
2. **P2-02 ownership:** only after P2-01 live acceptance, establish isolated native control or a legitimate stock/custom source-provider route, unrelated-sound preservation, no duplication and reversible recovery. Stock compatibility cannot be claimed from container parsing. Failure here requires an explicit scope decision.
3. **Standalone acoustic proof:** only after those integration gates, compare candidate technologies in owned synthetic scenes; validate transforms, band energy, delays, consumer playback and bounded performance. Steam Audio remains optional. No renderer implementation occurs in the current checkpoint.
4. **Controlled road-vehicle slice:** stock V8 and calibrated inline-four, direct propagation, source scale/load response, then validated city/tunnel geometry and indirect paths. Prove stock and supported custom providers with controlled A/B comparisons and clean native coexistence.
5. **Aircraft priority:** separate heavy/tandem-rotor and jet source/state/ownership studies, then altitude/direction, modulation, delay/Doppler and distant audibility tests. Strong aircraft presence is a major milestone, not an incidental volume preset. Shockwaves require reliable actual supersonic state.
6. **Impulses and world expansion:** observed backfire/gunshot/explosion events, environmental echoes/transmission, sirens, interior/exterior transitions, ambience and weather, each with independent source ownership and acceptance gates.
7. **Scale and continuity:** traffic/aircraft coverage measured before promising long range; bounded uncertain persistence/reacquisition, masking/priorities, adaptive ray/source budgets, geometry caching, quality presets, device accessibility and stress/soak/performance validation.
8. **Future FiveM research:** after proven single-player integration and rendering, verify client/platform permissions, resource/native boundaries and optional server-authorized distant-state transport, fairness, clocks, ownership and bandwidth. No implementation now.
9. **Release gates:** source/rights audit, explicit license decision, safe installer/rollback, compatibility matrix, blind listening and quantitative regressions, then a truthful semantic prerelease if justified. No versioned release is created by this documentation update.

Private GitHub setup proceeds independently. The repository exists but push is held for historical personal paths; preserve original commits while agreeing a remediation. CI preparation and issue tracking never count as gameplay validation. See [PROJECT_GOVERNANCE.md](PROJECT_GOVERNANCE.md).

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
