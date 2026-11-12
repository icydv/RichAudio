# MIGRATION-SHVDNE-01: isolated profile probe

I am keeping the profile experiment separate from the intended RichAudio release. Codex ported the disposable Bati A/B experiment to SHVDNE API v3 without changing my historical RPH probe, its evidence, the consumed LIVE-01 authorization, or the PROFILE-02 evidence-method refusal. The new implementation is compiled and covered by authored offline fixtures. It has not been installed or run in GTA. Gate A remains blocked.

The two implementation sources are `tools/native-control/ProfileAssignmentController.cs` and `tools/native-control/GateAProfile01.Shvdne.cs`. The first contains the framework-independent one-pair/one-assignment state machine. The second contains a separate `GTA.Script`, callback-scoped native adapter, explicit key commands and an asynchronous durable journal. The normal product package excludes both sources and their resulting DLL. `tests/host/TestGateAProfileShvdne.cs` executes the actual controller and native adapter source against authored APIs; `tools/Test-GateAProfileShvdne.ps1` compiles and runs those fixtures.

The candidate was compiled as x64 with the installed .NET Framework C# compiler, language version 5 and warnings treated as errors, against the authentic SHVDNE v1.1.0.6 API3 DLL. That DLL has assembly version `3.9.0.0` and SHA-256 `1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48`. It is a build reference, not bundled in the probe. Runtime prerequisites remain the matched SHVDNE distribution, its required Script Hook V and ASI loader, .NET Framework 4.8 and the upstream VC++ runtime. The probe itself uses only Framework libraries and API3; it has no Rage reference.

## Default state and explicit controls

With no sidecar, or without the exact line `Enabled=true` in `RichAudio.GateAProfile01.Shvdne.ini` beside the script DLL, the probe remains dormant: it creates no vehicles, registers no decorator and performs no profile assignment. A disabled sidecar is the only example suitable for the prepared package. A future enabled sidecar and installation require separate authorization after the non-mutating SHVDNE smoke test passes. The implementation checks the running executable's version is exactly `1.0.1158.16`; this is an admission restriction, not evidence that SHVDNE supports that build.

All controls require **Ctrl+Shift**, are processed through SHVDNE's script key events, and ignore repeated key-down events until key-up:

| Key | Action |
| --- | --- |
| F5 | Request the single pair of disposable Batis. No audio assignment. |
| F6 | Arm the fixed ADDER request for A for 10 seconds. |
| F7 | Confirm the armed ADDER request. Neither key alone dispatches it. |
| F8 | Record identity, default horn, engine-running and speed samples for A and B. |
| F9 | Stop and retire only validated, empty, stationary test lifetimes. Retry explicitly after dismount if retirement was deferred. |

The journal is `RichAudio.GateAProfile01.Evidence/session-<unique-id>.log` beside the experiment. It records each requested phase, lifetime identity, assignment intent, invocation return/failure and cleanup result. There is no command accepting arbitrary profiles, no silent profile, no ownership takeover and no automatic fallback assignment. An invocation exception consumes the one assignment attempt because dispatch may have partly executed.

## Lifetime, scheduling and evidence boundaries

The disposable identity combines the full script handle, required Bati model, SHVDNE script-ownership native and a unique integer decorator token. A and B have distinct tokens. This avoids a memory-address dependency. The decorator is registered only after explicit spawn activation, its integer type is verified, and a failed/locked registration refuses the experiment before creation. Each newly created entity receives its token in the same uninterrupted callback. A missing or changed token permanently loses that lifetime; the probe will not assign to or delete a replacement entity. The marker does not prove exclusive ownership against another mod deliberately copying it. Registration, token retention and exact-build handle semantics still need live qualification.

Model loading uses a nonblocking request and later tick polling, with a five-second deadline. Spawn space is validated before each creation. The probe does not modify engine state, handling, damage, health, horn settings, sirens or gain. Mission ownership and the marker apply only to the two disposable lifetimes. The experiment has a 12-minute absolute bound.

No disk flushing runs in a game callback. A bounded worker queue writes records and calls `Flush(true)` on the journal stream. The controller waits across ticks for durable acknowledgement of spawn and assignment intents. It revalidates Story scope, both exact identities and empty/stationary/driveable state after the acknowledgement, immediately before assignment. A queue failure or journal failure prevents assignment and requests guarded normal cleanup. The worker never calls GTA APIs. The native adapter rejects calls from another managed thread.

The assignment is exactly `Function.Call((Hash)0x4F0C413926060B38UL, targetHandle, "ADDER")`. The native returns void. Returning without exception is recorded as `profile-resolution=UNVERIFIED`; horn readback does not establish complete effective-profile identity. My prior audible change and control-vehicle observations remain historical evidence, not claims about the new adapter.

Normal F9 cleanup runs from the script callback and checks identity, occupancy and speed again. Loading, pause, Online or lost identity leaves an explicit unresolved cleanup result. No restore profile is guessed. On `Aborted`, the script performs no native cleanup: upstream can raise that event from the domain thread, distinct from the script thread. It requests journal shutdown without joining. Forced unload can interrupt pending records and can leave disposable vehicles; independent recovery remains unqualified. Normal explicit cleanup must precede unloading. The probe is intentionally not a recovery authority for production audio ownership.

## Offline verification and remaining admission

The final probe-only fixture run currently records **17 cases and 42 assertions**. Coverage includes dormancy, durable intent barriers, bounded model loading, explicit confirmation, A/B isolation, target/control identity replacement, movement during the journal wait, assignment exceptions without retry, evidence failure, partial spawn cleanup, retryable occupied cleanup, forbidden-scope cleanup refusal, the 12-minute bound, abort without native calls, absent lifetimes and the actual native hash/argument construction. The native adapter also rejects an authored worker-thread call. These checks do not establish actual native dispatch, decorators, SHVDNE callback scheduling or audible outcomes on Enhanced `.16`.

Pinned upstream evidence is in the migration's `.local/shvdne-reference/source`, revision `d756d479337a677cce9853b0cce63471c1fc7b7c`: `source/scripting_v3/GTA/Shvdn/Script/Script.cs` documents `Tick`, key events and `Aborted`; `source/core/Script.cs` implements key processing in `DoTick` and documents the abort-thread race; `source/scripting_v3/GTA.Native/Native.cs` defines `Function.Call`/`OutputArgument`; `NativeHashes.cs` declares the invoked hashes. No undocumented hooks or patches were added.

The first live step remains the separately authorized RPH-free, observation-only smoke procedure in the main migration documentation. Only after it passes can a new bounded profile experiment be considered. That subsequent review must pin the exact DLL, dependency and game identities, enabled sidecar, keyboard collision check, evidence location, controlled listening procedure, deployment/rollback manifest and acceptance limits. The old profile authorization cannot be reused. PROFILE-02's missing natural rendered ADDER reference corpus and failed comparator admission are unchanged; this port does not claim to solve them.
