# GATE-A-OWNERSHIP-01 — compiled ownership boundary

I require native audio ownership to include selective control, replacement readiness and recovery of the actual previous sound state. Codex preserved the completed SHVDNE development in local commits, then added a separate, device-free C# boundary and deterministic fixtures. Production claims remain disabled. No GTA process, native profile assignment, endpoint, installation or process-memory observation was used in this task.

The engineering increment is a compiled contract that can sit beside the existing managed integration when an actual native adapter is qualified. It consumes readiness evidence and emits inert commands. It does not replace the acoustic engine, PCM scheduler, existing JavaScript ownership prototype or 49-component registry. Existing source files remain byte-identical; this increment adds files only.

**A. Current control**

The retained runtime evidence establishes that SHVDNE loaded on the target Enhanced build and observed script lifecycle, player/vehicle and camera state. The earlier isolated native-profile experiment established an A-specific audible change, an ADDER-associated horn configuration, an unchanged observed B, normal behavior and cleanup. Neither observation establishes the complete effective profile or all sources controlled by that profile.

Offline, RichAudio can serialize and validate the original private graph, compile the SHVDNE probe, detect its original horn marker in authored recordings, and exercise bounded supervision and installation/restoration fixtures. PRIVATE03C remains the direct runtime discriminator for private resource mounting and contribution playback. Mechanical telemetry, host IPC and full performance qualification remain incomplete. The retained observation-performance and deadline failures are not overturned by these offline tests; the five-vehicle renderer remains performance-unqualified.

**B. Smallest selective contribution**

Codex constructed no suppression graph. The [resource analysis](GATE_A_OWNERSHIP_01_RESOURCES.md) identifies a possible private redirection of only player granular Channel4 (`engine_idle`, masked stream `1d18b9a1`), while preserving all other channels, original NPC aliases and synthesis routes. It is a hypothesis for one idle-wave contribution, not an engine mute. Grain playback semantics and actual branch activation are not qualified. A silent result would not identify whether the branch was selected, so PRIVATE03C's non-silent marker remains first.

**C. Recovery authority and failure boundaries**

Normal cleanup and recovery after the controlling component disappears are different. No inspected API provides a previous-effective-profile getter, atomic owner token, conditional restoration primitive or engine-enforced expiry. The pinned [SHVDNE setter](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/d756d479337a677cce9853b0cce63471c1fc7b7c/source/scripting_v3/GTA/Entities/Vehicles/Vehicle.cs#L143) returns no previous-state receipt and affects broader vehicle audio, including horn, doors, suspension and starting sounds.

A small separately resident ASI is a possible future recovery executor, with native work confined to the ScriptHookV registered script callback and appropriate yielding. The [official SDK](https://www.dev-c.com/files/ScriptHookV_SDK_1.0.617.1a.zip), linked by the [author's page](https://www.dev-c.com/gtav/scripthookv/), prohibits native calls from Present callbacks. Its samples use `scriptRegister`/`ScriptMain`/`WAIT(0)`; its documentation warns that entity handles can be reused across yields. Codex read the SDK without installing it: version `1.0.617.1a`, 459,541 bytes, SHA-256 `56b6ad265b2b93aa4e73f79f97949d72f3683a35576b977e63dde91c6485fe22`. This is scheduling/interface evidence, not qualification of a recovery ASI on my current stack.

The retained SHVDNE source is commit `d756d479337a677cce9853b0cce63471c1fc7b7c`. Its [main loop](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/d756d479337a677cce9853b0cce63471c1fc7b7c/source/core/DllMain.cpp#L892) waits indefinitely for the CLR tick before yielding; its own comment says other GTA script threads cannot execute during that work. Therefore a separate ASI does not establish a recovery deadline through a stuck managed/native tick. An external process can report missing progress but cannot supply a lawful GTA native execution context.

| Failure or transition | Required behavior | What remains unqualified in GTA |
| --- | --- | --- |
| Normal disable, script abort, reload or managed exception | Revoke replacement permission; restore only an exact owned prior state through the surviving authority | `Aborted` can race across threads; an exception handler is not proof of restoration |
| SHVDNE AppDomain loss | Separate authority retains the ledger and observes controller expiry | Survival and callback progress on the actual stack; no such adapter is implemented |
| Renderer crash, IPC loss, missing PCM or output/device loss | Expire readiness; request bounded conditional restoration | External host liveness alone cannot attest PCM, native state or restoration |
| Pause/resume | Use one monotonic timeline; stale readiness never revives on resume | Paused/stalled callbacks cannot enforce a wall-clock native expiry |
| Vehicle despawn or handle reuse | Refuse writes to absent or mismatched generations; report unresolved outcome separately | An integer handle and model are insufficient lifetime proof |
| Another mod changes the profile | Refuse stale restoration; preserve the competing change | Exact effective readback plus atomic compare-and-restore or proven exclusivity is missing |
| Native controller or scheduler disappears | Report UNKNOWN; no success from timeout, unload or process termination | No demonstrated surviving authority can guarantee in-session recovery |

The boundary's fixture receipts model the conditional operation that a future backend must actually supply. A guessed stock profile is never substituted for a custom baseline. Even a read-before-write check has a race unless the backend provides atomic ownership checking or proven exclusivity. A timer in managed policy is not an engine lease.

**D. Implementation and validation**

The new implementation is isolated in [Boundary01](../src/acoustics/ownership/Boundary01/OwnershipBoundary.cs), [ReplacementReadiness](../src/acoustics/ownership/Boundary01/ReplacementReadiness.cs), and the [fresh-output build/test runner](../tools/Test-OwnershipBoundary01.ps1). It has no GTA, RPH, endpoint, process, IPC or resource-loader dependency. The production library is compiled without the positive fixture authority; positive transitions are exercised only in separately compiled fixture executables.

The states distinguish `NATIVE`, `PREPARED`, `CLAIMED`, `RESTORING`, `FAILED` and `UNKNOWN`. No dispatch and possible dispatch are different outcomes. A claim request is not native suppression, an acknowledgement is not accepted after its identity/deadline is obsolete, and a missing recovery receipt cannot return the state to `NATIVE`. Terminal uncertainty does not silently authorize another claim. Multiple vehicle generations retain distinct baselines; a broad vehicle-audio-object control scope cannot be split into independent category leases by relabeling it.

Readiness binds the same source and generation to mechanical observations, profile/asset provenance, prepared PCM, render timing, output progress and generations, handoff/tail bounds and an expiring monotonic interval. It consumes evidence without rendering or scheduling audio. Authored fixture evidence is explicitly labelled and never promoted to runtime qualification. The production gate remains closed even when fixture-shaped evidence is internally consistent.

The boundary's accepted snapshots and command/receipt records are immutable. The serialized fixture authority exercises exactly-once admission and competing ownership. This does not supply GTA-level atomicity, native entity generations, an independent watchdog or authenticated runtime evidence. Production integration must not connect this boundary to suppression until those requirements are qualified.

The command for an offline rebuild is:

```powershell
pwsh -NoProfile -File tools/Test-OwnershipBoundary01.ps1
```

It uses the existing .NET Framework compiler, C# 5, x64, warnings as errors and .NET Framework 4.8 assembly metadata. Outputs go only to a fresh child of `.local/gate-a-ownership-01`. No dependencies are installed. Tests and receipts are local evidence, not runtime suppression/recovery proof.

The final combined run is [boundary-build-20261112T1926181879976](C:/Users/Libby/Documents/RichAudio-SHVDNE01/.local/gate-a-ownership-01/boundary-build-20261112T1926181879976/build-receipt.json). Codex independently compared every recorded source hash with the final files after the run. `NativeRecoveryVerified` remains false even in fixtures; simulated recovery has its own `FixtureRecoveryVerified` field and evidence scope. The fixture authority requires an explicit exact prior-state-to-replacement-graph mapping, rather than equating the old custom profile with the new private profile. Delayed polling cannot restart recovery time: the deadline stays anchored to the original lease/health expiry.

| Verification performed in this task | Result |
| --- | --- |
| New ownership boundary | **29 cases / 324 assertions PASS**: concurrent admission, shared vehicle control scope, independent vehicles, source reuse/deletion, custom baseline mapping, foreign receipts, renderer/controller loss, pause/resume, shutdown, stale and delayed completion, absolute recovery deadlines, terminal uncertainty |
| New readiness evaluator | **87 cases / 369 assertions PASS**: missing/estimated mechanics, source/clock/generation mismatch, digest/closure rejection, PCM chronology, output cadence, full-cost deadline budget, expiry, handoff and tail bounds, immutable snapshots |
| Separate production DLL surface | **19 checks PASS**: no positive fixture authority, no native imports, zero native adapters, no production claim even with internally consistent authored readiness |
| Existing observation/provider/listener suite | **32 cases / 127 assertions PASS** |
| Host lifecycle, transport and menu suites | **36 host checks, 60 transport assertions and 1,578 menu checks PASS**; startup, passive SoundMap and preparation-worker containment also pass |
| Package tests | **11 builder cases and 39 metadata checks PASS** |
| Existing renderer/streaming/PCM/ownership regression batch | **93 tests PASS, zero skipped** |
| Genuine stock catalogue, installed registry and retained ownership tests | **11 tests PASS, zero skipped**; all four published 10.3-second PCM hashes match at native 24/32/48 kHz; 37 retained input identities unchanged |
| Private resource and marker regressions | **8 resource cases and 16 marker cases PASS** |
| Private probe and frozen final-probe source regression | **24 cases / 65 assertions**, then **26 inherited cases / 88 assertions**, **14 phase cases / 42 assertions**, and **3 actual API-method tests using authored native stand-ins PASS** |
| Pending preservation-source syntax | **32 Python files**, PowerShell and JavaScript parsing PASS; staged diff checks PASS |

The frozen generators were not rerun into their old output paths. The final-probe tests were compiled into fresh OWNERSHIP-01 output and used the same explicit phase-guard adaptation as the frozen final builder. One initial fixture compilation used unsuitable relative source paths and failed before execution; the corrected absolute-path build passed. One early production-boundary compilation exposed an unused fixture reservation field under warnings-as-errors; the source was corrected before the final successful run. Failed-attempt output directories remain private. Existing failed live/performance evidence was not changed.

These freshly compiled artifacts remain private and undeployed:

| Artifact | SHA-256 |
| --- | --- |
| `RichAudio.Ownership.Boundary01.dll`, version 0.1.0.0, 47,104 bytes | `ce7f20fa3b5f8cb3cb603b81afa731e9c596c99380a48e7d6c1f58f40cc8c710` |
| `TestOwnershipBoundary01.exe` | `c758e45ca5dbfcf956c9a43c4bd97d8de122bb40bf732f0d384d1eb10038db4a` |
| `TestReplacementReadiness01.exe` | `18c47c0b31a9405f4f6bce8de4beb37df63ef0a875bf6770ca1a8f9cb7d7a809` |
| `TestOwnershipProduction01.exe` | `191170828524246dc0c7f8cabe6883ed11845033f9e1fb041e28f7ad7f55126a` |
| Fresh preservation build `RichAudio.Shvdne.dll` | `834afa4d68e6e409a34597113428ea4d6c101b1bc75cfd3a4fae68a905b9dd47` |
| Fresh preservation build `RichAudio.Acoustics.Host.exe` | `019c0f7f1648f9dc923dcbb44d7d5e5dbd94c9566187c0c0e37273a4889d8504` |
| Fresh preservation build `RichAudio.GateAProfile01.Shvdne.dll` | `f429256420f39fa272e8c706bc6a3899b3d63af9bf00e5e62506d43f6b529b11` |

The migration build receipt is [ownership01-preservation-build](C:/Users/Libby/Documents/RichAudio-SHVDNE01/.local/migration-shvdne-01/ownership01-preservation-build/build-receipt.json). It uses the authentic API3 assembly SHA-256 `1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48`. Fresh compile identities are not substituted into PRIVATE03C or treated as live-qualified binaries.

Completed development was committed before this new implementation:

| Local commit | Preserved milestone |
| --- | --- |
| `7ce78f8f846c5d6a77ec0fd0505f5e99d2577906` | RPH-free integration, observations, host/lifecycle/IPC, controls, regression and packaging tooling, with explicit remaining qualification limits |
| `d70b19f5d9657ab151f858ac2cee5697102876f7` | Original private resource/probe/supervision source and tests, retaining historical runtime limits |
| `ab67cb07ac359dd44f478a1bdefc180f89383b53` | Byte-preserved PRIVATE03B/03C tooling and review-ready reports; sealed HEAD-preflight consequence documented |

The integration changes form one coherent current snapshot: the sampler, host and entry point depend on the later smoke/timing additions. Reconstructing historical intermediate versions would have changed frozen source. The new ownership/readiness source, its tests and this report form a separate subsequent local milestone. No push, merge, tag, release or publication occurred.

**E. Exact remaining live evidence**

I still need a positive original marker after private profile assignment; exact lifetime/contribution association; preservation of unrelated and competing custom audio; demonstrable selective suppression; the actual previous effective graph and a conflict-safe restoration operation; recovery-authority survival and progress across the claimed failure cases; qualified mechanical observations and output handoff; and full rendering deadline acceptance. Private graph validation, a successful native return, filesystem rollback and disposable vehicle retirement do not substitute for these observations.

The category boundary retains vehicle source identity and category labels so future qualified adapters can reuse acoustic positioning, propagation, headroom, scheduling and output. Native control remains domain-specific. No gunfire, explosion, aircraft, siren or environmental suppression adapter is added. Transients would require their own admission and failure semantics.

**F. One next runtime milestone**

Run the already prepared PRIVATE03C marker discriminator only after its exact continuation is reviewed and I provide fresh live authorization: the original 31-symbol RichAudio marker on admitted A, with authentic baseline/control capture and unchanged observed B, followed by the existing retirement and installation-restoration procedure. This is private contribution selection evidence only; it does not enable a silent profile or production takeover.

The sealed manifest remains `6b3e34811ad3aac1dcfc629e22733171d6fcf70b3de9b0cf2e645bdb86732087` and the sealed final probe remains `fbed6a147abf8575825996198eb4cb60cddcaa02929c9d00fa43e5dba0bda4b0`. Codex did not regenerate either. There is one concrete provenance issue caused by my requested local commits: the inherited installer preflight checks `HEAD == preservation-before.json.head`, whose value is `8f1900c47a00d3622b07e929d78b74753d1af692`. Current commits deliberately advance HEAD, so the unchanged guard refuses with `Preparation HEAD drift` even though its source/resources are unchanged. No guard was bypassed. A narrowly reviewed provenance continuation must account for that mismatch while retaining the same experiment bytes; another general resource/marker qualification campaign is not proposed.

The private before/after preservation audit checks 1,864 pre-existing source files and 59,659 protected files, including 4,334 execution-manifest bindings and 50,038 evidence-index entries. It also compares the original RPH worktree status and menu identity. Private assets, DLLs, archives, captures, credentials, backups and raw evidence remain ignored and outside all commits. The existing `.gitignore` already covers those categories and was left unchanged.
