# Risks and fallback decisions

## Feasibility and uncertainty matrix — 25 October 2026

The mission now covers a coherent, immersion-first world-wide overhaul with stock preservation and custom-content support. That is an **aspiration**, not a feasibility conclusion. The historical Phase 1/2 risk records below are preserved; their runtime-not-installed wording is superseded by the controlled attempt and rollback.

| Requirement / capability | Evidence class now | Decisive uncertainty / next gate |
|---|---|---|
| REL/AWC reference research and one collision composite | Established file/GUI observations | Does not establish a dry voice API, full acoustic geometry, source ownership or redistribution rights |
| Runtime-independent telemetry, bounded logger, replay analysis | Implemented, built, offline-tested | Real getters, frame impact, lifecycle and time behavior still require live acceptance |
| Enhanced executable selection | In-environment verified for this installation | Supported version identified and Enhanced process launched; RPH append-related IOException blocked hook/Story Mode/plugin verification |
| Independent standalone RPH plugin | Built against authentic SDK; unverified in game | SDK/runtime binding, non-LSPDFR operation and coexistence must actually run; OpenRPF coexistence not tested |
| Useful distant NPCs and aircraft | Untested hypothesis | Streaming, synthetic visual traffic, field detail and handle recycling; no observed maximum distance exists |
| Stock audio through per-source processing | Product requirement; unproven | Isolated native PCM or legitimate local reproduction plus suppression/restore; final-mix DSP cannot meet this gate |
| Custom sound packs | Product requirement; unproven | Per-format native/adapter/unsupported classification, optional metadata and provenance; no automatic universal compatibility claim |
| Source identity, engine/rotor/jet/impulse character | Design / aspiration | Calibrated state, genuine event access, source emission references and consumer listening results |
| Geometry-driven propagation and perceptual rendering | Design; not implemented | World transforms/state/material confidence, path/energy validity, bounded CPU/DSP and device behavior |
| Smooth distant continuity | Design hypothesis | Prediction TTL/uncertainty/fades/reacquisition; cannot create indefinite ghost vehicles or know unloaded RPM |
| Optional FiveM client/server adapters | Future research only | Platform permissions, native renderer delivery, server policy, authoritative distant state, fairness, clock mapping and budgets |
| Private GitHub distribution | Destination created; upload held | Personal-directory references in reachable history; preserve original commits pending explicit remediation decision |
| Production/release readiness | Not established | Integration, licensing, installation, listening and stability criteria all remain incomplete |

The largest product risks remain **source access/ownership**, **distant-state coverage**, **matching acoustic geometry to the live world**, and **convincing consumer playback within a measured budget**. Renderer sophistication alone resolves none of these. Preserve dynamic contrast and avoid turning physical presence into indiscriminate loudness. Hearing-safe digital gain management is a requirement, not a guarantee of physical SPL safety on unknown hardware.

The verified RPH failure is a separate immediate integration blocker. Its file-append stack does not establish antivirus, permission or storage causation. Do not add security exceptions, undocumented patches or repeated uncontrolled starts. Repository pattern screening found no prohibited binary or credential-pattern match in the initial five-commit audit; that is a bounded audit result, not proof of complete legal/security clearance. [Governance](PROJECT_GOVERNANCE.md) records the upload hold.

Phase 2 update: RPH is now the selected public-API adapter candidate on author evidence of 1158.16 support, and the managed prototype compiles using the existing .NET Framework compiler. Exact runtime binary preflight, standalone operation, OpenRPF coexistence, live getter reliability, NPC coverage and gameplay performance remain unverified. No runtime was installed. See [compatibility](docs/RUNTIME_COMPATIBILITY.md) and [validation](docs/PHASE2_VALIDATION.md); the Phase 1 matrix below remains a historical risk record, not a statement that C++ is required for the current logger.

24 October 2026. Severity concerns the eventual project, not an observed failure in the game. Phase 1 did not run GTA or install hooks.

| Risk | Evidence/status | Mitigation and stop/fallback |
|---|---|---|
| Script framework/build mismatch | VERIFIED installed 1158.16 vs official SHV 1158.13 listing | BLOCKED runtime; await explicit compatibility evidence. No executable rename, patch or assumed minor-version compatibility |
| Missing C++ toolchain | Not found in PATH/standard paths checked | Install a reviewed x64 build toolchain/Windows SDK in a later setup task; standalone XML research remains usable |
| RPM/gear/throttle offset drift | VERIFIED SHVDNE getters use memory offsets and missing-value zeros | Capability checks and null validity; no inference that zero proves engine off. Disable adapter fields when unsupported |
| No selective native source control | UNTESTED engine-only mute, reroute, PCM tap and restore | P2-02 go/no-go. Native-only mode is the default; metadata-only research fallback |
| Collateral sound suppression | Silent native docs concern door/horn; profile reassignment may affect multiple sounds | Test doors, horn, tires, radio, collision, sibling vehicle and NPC independently; never globally mute bank/category to hide duplication |
| Failure leaves target silent | Persistent native state may survive renderer/plugin failure | No ownership until restoration/self-expiration proven. External watchdog cannot fix a dead in-game adapter; hard restart recovery is not seamless fail-open |
| Doubled/phase-conflicting audio | Separate output clocks, unknown native phase/delay | Avoid concurrent direct stems; measure latency/correlation. Crossfade choice alone cannot solve phase or native LOD jumps |
| NPC source missing at distance | Only streamed entity pool established; no citywide traffic feed | Measure natural population/lifetime. Do not force streaming/persistence for every vehicle or mislabel synthetic far traffic |
| Audio LOD/voice limits unknown | Community native docs mention five granular cars; not Enhanced measured | Measure actual voice behavior; no global max-priority setting. Independent renderer still needs telemetry and source ownership |
| Enhanced decoder partial support | Supplied dev46 parsed tested data; schema differs from newer upstream | Pin DLL fingerprints and source references; validate each new resource family. Do not silently use newer binaries or call one YBN proof of every format |
| Geometry placements/winding/materials wrong | One BoundComposite decodes; world transform pipeline UNTESTED | Landmark/raycast checks, basis tests, primitive conversion and material provenance; restrict to local validated tiles |
| Dynamic state differs from bake | Doors, destruction, IPL/DLC changes can invalidate paths | Epoch/state keyed caches, portal updates, local bake invalidation; suppress unsupported wet paths when state is unknown |
| Diffraction overpromised | Ray/reflection features do not establish a full-wave solver | Explicit geometric/path approximation and band tests; state limits instead of marketing accurate wave acoustics |
| Source calibration inaccurate | Normalized RPM and visual engine identity insufficient | Owned recordings/physical profiles; load confidence and normalized/physical RPM separation. Do not call Bati trace an inline-four validation |
| CPU/GPU contention and glitches | No benchmark yet on 5800X/2080 SUPER | Fixed source/ray/time/memory caps, prioritize audibility, drop solver updates, preserve direct continuity; CPU-first baseline |
| Blocking/unsafe worker behavior | Native calls thread-affine; output callback timing strict | POD snapshot transfer; no worker game calls; no blocking/IO/allocation in callback; stable buffer/effect lifetime |
| Device loss/pause/focus | Separate renderer may continue while game pauses | Listener/source epochs, explicit pause/focus policy, endpoint reset and stale-telemetry fade; test resume and output-device switch |
| Cache leaks/stale entity reuse | High NPC churn and IR lifetimes | Handle generations, bounded pools, high-water tracking, soak test, off-callback reclamation |
| Proprietary asset redistribution | Audio, meshes and exported metadata belong to game content | Exports only under ignored local directories; Git has references/counts/hashes only; stage allowlisted paths and scan before commit |
| Third-party maintenance/license | Native framework, CodeWalker and SDK dependencies have separate obligations | Pin versions, review notices before distribution, no binary vendoring in Phase 1; Steam Audio Apache-2.0 does not license Rockstar assets |
| Baseline misrepresented | Existing root includes empty OpenIV.asi and two exe versions | Preserve current state, record fingerprints; no assertion that entire installation is pristine. Verify originals separately before a later deployment |
| Online/anti-cheat interference | Single-player requirement; no Phase 1 runtime work | Never start Online with RichAudio, do not bypass anti-cheat. Future deployment must follow supported Story Mode procedures; uncertain session mode leaves adapter off |

## Achievability assessment

**INFERRED:** a substantial local acoustic overhaul for a controlled source set is plausible. Actual data access supports source research, geometry conversion and native configuration experiments. Steam Audio plus an independent output pipeline is technically plausible outside GTA.

**UNPROVEN:** comprehensive replacement of the game's moving-source acoustics, including all NPC traffic, seamless native coexistence, accurate load/RPM and world state. The decisive uncertainties are access/ownership/coverage, not whether a library can produce reverb. No honest Phase 1 conclusion can promise the complete mission yet.

The most promising approach is a hybrid: a minimal supported game adapter, owned source generation, locally cached simplified collision/portal geometry, bounded Steam Audio simulation and XAudio2 playback, with native audio retained wherever ownership is unproven. Keep native metadata refinements as a separate lower-integration option. P2-01 and P2-02 should determine whether the full renderer belongs in the product roadmap.
