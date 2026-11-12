# MIGRATION-SHVDNE-01 — implementation and offline qualification

I am making ScriptHookVDotNet Enhanced the intended primary managed GTA integration for RichAudio. **Codex implemented and compiled the new integration, ran offline regressions and prepared an RPH-free private candidate. Live compatibility with Enhanced 1.0.1158.16 remains unverified.** My existing RPH adapter and all historical Gate A evidence remain available. This is a working implementation candidate, not a claim that release parity or native audio ownership has passed.

The isolated worktree is `C:\Users\Libby\Documents\RichAudio-SHVDNE01`, branch `feature/migration-shvdne-01`, based on `8f1900c47a00d3622b07e929d78b74753d1af692`. Changes are left uncommitted for review. Nothing was pushed, merged, released, installed or executed in GTA. Compilation/tests opened no audio endpoint. Authored fixture processes named like GTA are test executables inside private fixture directories, not the installed game.

## Implemented architecture

```text
SHVDNE GTA.Script Tick / Aborted
  -> ShvdneGameSource -> plain IGameObservationSource observations
  -> SharedFrameSampler + original camera continuity math
  -> unchanged GameplayFrame / ListenerState v1
  -> ShvdneHostController -> existing GameplayRuntime / latest-frame IPC
  -> owned external RichAudio audio host + existing acoustic/synthesis engine

same entry -> existing menu model, preference/recording workers and transitions
           -> SHVDNE keyboard/controller/mouse + native drawing boundary
           -> existing passive SoundMap and world preparation supervisors

separate, disabled experimental DLL
  -> ProfileAssignmentController -> SHVDNE native profile adapter
  -> disposable A/B pair, fixed non-silent ADDER request, journal, guarded stop
```

The engine consumes copied numbers, source identities, generations and measured clocks. GTA entities and pointers do not enter acoustic state. Existing PCM, synthesis, retained-bank, geometry parsing, propagation and GPU solving algorithms are unchanged. No dependency-injection framework, RPH fiber emulation or synchronous audio rendering was added to a game callback.

The [dependency map](MIGRATION_SHVDNE01_DEPENDENCIES.md) inventories all production-facing RPH boundaries and identifies older RPH-only instruments. The [telemetry/execution report](MIGRATION_SHVDNE01_TELEMETRY.md) classifies each implemented signal and the actual SHVDNE scheduling/native-call restrictions. The [package report](MIGRATION_SHVDNE01_PACKAGING.md) covers dependencies, licenses, installation architecture and rollback. The [smoke procedure](MIGRATION_SHVDNE01_SMOKE.md) is prepared for a separate authorization. The [isolated probe report](MIGRATION_SHVDNE_01_PROFILE_PROBE.md) preserves Gate A's experimental controls and remaining evidence requirements.

## Builds and prepared artifacts

Definitive private build directory: `.local/migration-shvdne-01/final-build-01`.

| Artifact | SHA-256 |
| --- | --- |
| `RichAudio.Shvdne.dll` | `fc3af327a6900a88c91a8b31716532850a890afee62a59c2ecf521a2594e96b7` |
| `RichAudio.Acoustics.Host.exe` | `5779c9b06ed92e14e714d3cb384133c768c62b070f567cb3dae013772c375fe1` |
| `RichAudio.GateAProfile01.Shvdne.dll` — separate experiment | `2fe629becf4e05b2776e3bf671ab6dad4e980eb467a51737a7c28eec608188cb` |

`build-receipt.json` binds the main adapter, shared/host sources, probe sources, configuration, compiler build recipe and output digests. All three builds passed the existing Windows x64 .NET Framework compiler with warnings treated as errors. The adapter and probe have explicit .NET Framework 4.8 target metadata and compile against authentic SHVDNE v1.1.0.6 API3, assembly version 3.9.0.0. They do not depend on the audio host sharing a managed runtime or AppDomain.

The current RPH `-Playable` adapter also compiled with its authentic pinned reference SDK after the shared changes; output is `.local/migration-shvdne-01/rph-final-rollback-build`. No RPH source was deleted or mechanically rewritten.

Definitive staged private candidate: `.local/migration-shvdne-01/final-private-package-02`. Its receipt binds **253 files**, with **248 immutable payload bindings** validated by the actual production configuration loader. Static validation resolved **415 relative module imports**. The candidate omits the RPH plugin/prerequisite, profile-probe DLL, SHVDNE distribution, Script Hook V and ASI loader. It is disabled by default. Private retained assets were verified and copied from `C:\Users\Libby\AppData\Local\RichAudio\Playable01-3dd074b70068`; the original was not changed. This private candidate must not be published.

## Verification results

Counts below describe different test units and are deliberately not combined into an inflated total. Authored responses are not live GTA proof.

| Suite | Result and coverage |
| --- | --- |
| New observations/provider | **31 cases / 124 assertions passed**: player/NPC isolation, invalid and reused handles, model/lifetime changes, bounded nearest fleet, freshness/generation/source chronology, missing RPM, copied vectors, exact native arguments, post-getter identity and cross-thread rejection. Includes byte-equivalent RPH listener fixtures. |
| New host boundary | **36 checks passed**: actual Windows processes/jobs and v1 pipes, session isolation, reconnect/stale discard, graceful stop, hung child, actual managed AppDomain unload and three-attempt restart exhaustion. Peer is authored fixture code. |
| New isolated profile probe | **17 cases / 42 assertions passed**: dormant start, durable journal barrier, manual bounded assignment, target/control separation, one-shot exception behavior, invalid/changed lifetimes, partial spawn, cleanup and abort without game calls. |
| New configuration/package/metadata | **41 checks passed**: defaults, conflicting telemetry routes, first-start preferences, preservation and relocation, manifest tampering, actual assembly dependency metadata and the actual retained candidate's production manifest validation. |
| New package builder | **11 cases passed**: output/config pinning, redirected paths, tampering, private output containment, closed static imports, dormant config and retained UI refresh without copying the RPH adapter. |
| Existing listener transport | **81 checks passed** with original freshness/terminal behavior. |
| Existing menu | **1,578 checks passed** for model, input, transitions, status and drawing-command fixtures; SHVDNE rendered pixels were not observed. |
| Existing host/ring/framing | **1,702 assertions passed**, plus eight actual host shutdown fault scenarios and the deterministic connection-boundary regression. Device-free host path only. |
| Existing acoustic/source/ownership regressions | **117 Node tests passed** across acoustic renderer/motion, stock chronology, package PCM boundaries, ownership policy, vehicle observations and components. |
| Existing private-shadow policy | **6 tests passed** using newly prepared authored REL/catalogue fixtures and child-controller failures. No private profile was mounted. |
| Existing settings handoff | Passed actual UI-model/settings/host/producer handoff: 390 received blocks, zero underflow/rejected blocks, zero muted energy, nonzero resumed energy. No endpoint or visible settings window. |
| Existing SoundMap | **10 tests passed**, including real owned-service abort cleanup. |
| Existing world continuation | **51 checks passed**; startup suite also passed, including a real preparation descendant terminated by the new abort path. |
| Existing installer/preparation | **15 checks passed** with its original rollback behavior. This does not invoke the installer against GTA. |

Definitive receipts/logs:

- `.local/shvdne-observations-23a4d4db0f9f4e14a85adab839e86e9e/validation.json`
- `.local/shvdne-host-tests/694a2ad994874d0bb4dba59546a89932/result.json`
- `.local/profile-shvdne-tests-03/fixture.log`
- `.local/migration-shvdne-01/regressions/` — existing regressions, final build, package and RPH rebuild logs
- `.local/migration-shvdne-01/package-builder-fixture-c781bbd762aa42d2ad8a1061a331f442/results.json`
- `.local/street01/continuation-fa559f42a8004366b92c7353793b85d8/validation.json`
- `.local/street01/installer-07ae8053a17f460da6e4967db0a03b82/validation.json`

An initial combined Node invocation omitted the private-shadow fixture argument; that harness error is retained in `regressions/pcm.log`. The correct documented fixture setup and invocation passed separately. An early retained package attempt encountered stale HTML already copied from the old package. The builder now refreshes that owned UI closure explicitly; an authored retained-package regression covers the correction. Failed private directories remain separate from the definitive package. There are no unresolved compilation failures in the final builds.

## Telemetry, ownership and lifecycle boundaries

The gameplay and listener wire formats remain version 1. New framework identity fields are optional additions to the package manifest; absent fields retain existing RPH semantics. A SHVDNE package cannot silently enter the RPH path or vice versa. Existing gain, source history, PCM format and audio deadlines were not relaxed.

Camera, entity pose/velocity, engine-running, class, health, coarse all-wheel-ground contact, horn/siren and interior queries use source-checked public natives. NPC discovery still depends on SHVDNE's memory-backed pool. Mechanical properties remain nullable and provenance-labelled. The optional Enhanced public-native rev-ratio route uses `0xF9DDA40BC293A61E` with an explicit selector, no fallback and a failure latch; its prior SHV evidence does not prove SHVDNE dispatch. The alternative memory-wrapper RPM/gear/throttle/brake/steering/clutch/wheel-speed path has missing-offset/zero ambiguity and is also disabled by default. Unavailable RPM withholds vehicle wire output rather than manufacturing idle. Per-wheel contact, suspension travel and road-material telemetry have no qualified replacement in this increment.

Host startup, hashing, manifest validation, I/O, rendering and waits run outside Tick. Hosts start suspended, enter owned kill-on-close jobs, then resume. The current-user/session shutdown event provides normal stop; unload can close containment immediately without waiting for an ordinary worker to survive. SoundMap and world preparation received equivalent explicit abort containment. A real startup race in the reused auxiliary job wrapper was fixed: unsuccessful starts now terminate the original child even if closure races assignment. No privileged service or persistent Windows agent was added. A final journal write during forced domain teardown is not guaranteed.

Production code has no profile setter. The isolated probe constructs `Function.Call((Hash)0x4F0C413926060B38UL, targetHandle, "ADDER")`; tests verify the hash and arguments. Its fixed request is non-silent, manual, bounded and journalled. Invocation is not effective-profile readback. Native audio ownership, selective suppression, exact previous-profile restoration, custom-mod arbitration and recovery after controller loss remain unverified. Normal disposal of test vehicles does not satisfy those requirements.

## Modified and created files

| File | Purpose |
| --- | --- |
| `src/acoustics/bridge/Integration/GameObservations.cs` | Plain observation contract and nullable signal validity |
| `src/acoustics/bridge/Integration/CameraListenerTracker.cs` | Shared-boundary copy of original numerical camera continuity policy |
| `src/acoustics/bridge/Integration/SharedFrameSampler.cs` | Bounded source identity/admission, chronology and v1 frames |
| `src/acoustics/bridge/Integration/ShvdneConfiguration.cs` | Disabled defaults and mutually exclusive telemetry selection |
| `src/acoustics/bridge/Integration/ShvdneHostController.cs` | Framework-independent adapter to existing host supervisor |
| `src/acoustics/bridge/Integration/ShvdnePackageLinks.cs` | Worker-side portable pointers and absent-only stock-fallback settings |
| `src/acoustics/bridge/Shvdne/RichAudioScript.cs` | SHVDNE startup, callbacks, journals, service coordination and unload |
| `src/acoustics/bridge/Shvdne/ShvdneGameSource.cs` | Actual supported API3/native observation adapter |
| `src/acoustics/bridge/Shvdne/ShvdneMenu.cs` | Input/drawing adapter reusing existing menu behavior/model |
| `src/acoustics/host/Transport/GameplayStopSignal.cs` | Current-user session stop channel for owned SHVDNE host |
| `src/acoustics/host/Transport/PlayableConfiguration.cs` | Additive framework/package binding, retaining RPH validation |
| `src/acoustics/host/Transport/OwnedProcessJob.cs` | Immediate safe containment close and failed-start cleanup |
| `src/acoustics/host/Windows/GameplayRuntime.cs` | SHVDNE owned host startup/shutdown; existing core reused |
| `src/acoustics/host/Windows/GameplayHost.cs` | Recognize the SHVDNE stop signal; rendering unchanged |
| `src/acoustics/host/Windows/PassiveSoundMapBridge.cs` | Explicit unload containment for owned auxiliary processes |
| `src/acoustics/integration/WorldWarmupSupervisor.cs` | Safe suspended owned startup and immediate unload containment |
| `config/shvdne/integration.json` | Dormant candidate configuration |
| `tools/native-control/ProfileAssignmentController.cs` | Framework-independent isolated experiment state machine |
| `tools/native-control/GateAProfile01.Shvdne.cs` | Separate disabled API3 profile experiment and async journal |
| `tools/Build-Shvdne.ps1` | Pinned authentic API compilation and source/output receipt |
| `tools/Package-Shvdne.ps1` | RPH-free private staging, verified inputs and rollback manifest |
| `tools/Test-ShvdneObservations.ps1` | Compile/run paired boundary and actual-provider fixtures |
| `tools/Test-ShvdneHost.ps1` | Real process/job/IPC and unload fixture runner |
| `tools/Test-GateAProfileShvdne.ps1` | Isolated probe controller/native-argument fixture runner |
| `tools/Test-ShvdnePackaging.ps1` | Config/path/settings/assembly and actual payload validation |
| `tools/Test-ShvdnePackageBuilder.ps1` | Builder tamper/escape, source closure and retained-upgrade fixtures |
| `tests/host/TestShvdneObservations.cs` | Plain observations and verbatim RPH camera comparison |
| `tests/host/TestShvdneGameSource.cs` | Actual adapter with authored native/API responses |
| `tests/host/ShvdneObservationNativeHashes.cs` | Source-pinned declarations used by the provider fixture |
| `tests/host/TestShvdneHost.cs` | Authored peer and real host ownership/transport scenarios |
| `tests/host/TestGateAProfileShvdne.cs` | One-shot probe/lifetime/evidence control cases |
| `tests/host/TestShvdnePackaging.cs` | Defaults, relocation, settings preservation and metadata checks |
| `tests/Test-ShvdnePackageClosure.mjs` | Actual staged hashes, all relative imports and excluded dependencies |
| `tests/host/TestPassiveSoundMap.cs`, `tests/Test-SoundMapPassive.mjs` | Extend existing service regression with framework abort |
| `tests/Test-WorldWarmupStartup.ps1` | Extend existing preparation lifecycle regression with framework abort |
| `docs/MIGRATION_SHVDNE01.md` | This implementation/evidence index |
| `docs/MIGRATION_SHVDNE01_DEPENDENCIES.md` | RPH inventory and replacement comparison |
| `docs/MIGRATION_SHVDNE01_TELEMETRY.md` | Signal provenance, pinned upstream identities and threading |
| `docs/MIGRATION_SHVDNE01_PACKAGING.md` | Dependency/redistribution decisions and layout/rollback |
| `docs/MIGRATION_SHVDNE01_SMOKE.md` | Separate exact-build admission procedure |
| `docs/MIGRATION_SHVDNE_01_PROFILE_PROBE.md` | Isolated native-control experiment implementation and limits |

## Preserved evidence and minimum remaining work

The original repository remains `C:\Users\Libby\Documents\RichAudio-World13`. Relevant resources were found at their actual paths:

- `.local/street01/audio-capability-audit-01/REPORT.md`
- `.local/street01/silent-profile-independent-01/FRAMEWORK_SOURCES.md`, `RESOURCE_FINDINGS.md`, `DISTRIBUTION_FINDINGS.md`, `DECISION.md`
- `.local/street01/rph-archive-reference-01/REPORT.md`, `SDK_CROSS_REFERENCE.md`, `LIFECYCLE_NATIVE.md`
- `docs/GATE_A_PROFILE_01.md`, `GATE_A_PROFILE_01_LIVE_01.md`, `GATE_A_PROFILE_01B.md`, `GATE_A_PROFILE_02.md`
- `tools/native-control/GateAProfile01.Rph.cs` and `tests/host/TestGateAProfile01.cs`
- Existing `docs/UPSTREAM_RPH_ENGINE_TELEMETRY_REPORT.md`, native SHV producer declarations and telemetry/runtime tests.

Those historical files were read in place, not altered or copied into a new approval. `tools/Build-Menu02.ps1` in the original worktree retains SHA-256 `c293df261cb2e261c2ed4d2e7b5b465767c1a8adaee81ce46c7b082b6d5d678a`, matching the initial check. Private recordings, proprietary assets, memory samples and credentials are excluded from the source changes.

The next engineering admission is the [bounded smoke](MIGRATION_SHVDNE01_SMOKE.md): exact dependency identities, RPH-free initialization, ticking, Story/player/camera/vehicle reads, ordinary unload/reload and disk restoration. That requires new live authorization; this task stops before it. The smallest remaining parity work is evidence-driven: qualify native RPM/pool reads and real host transport, fix any measured native text/focus differences, validate SoundMap/world-preparation and rendering deadlines under actual scheduling, and add SHVDNE adapters only for older raw geometry/contact instruments still needed in the intended product. Cross-installation packaging needs a freshly prepared executable-bound manifest. Gate A then needs its separate non-silent identity experiment and subsequent suppression/recovery work; none of those criteria has been weakened.
