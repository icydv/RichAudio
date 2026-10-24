# Roadmap

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
