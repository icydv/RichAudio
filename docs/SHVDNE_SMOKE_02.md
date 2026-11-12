# SHVDNE-SMOKE-02 — offline preparation result

I asked Codex to prepare one focused timing/host qualification after my successful RPH-free Stage 1. **Preparation passes offline admission. No Stage 2 live attempt is authorized, installed or run.** Native audio ownership remains unresolved and my next engineering priority after this bounded integration qualification is Gate A/private-profile ownership.

Worktree: `C:\Users\Libby\Documents\RichAudio-SHVDNE01`; branch `feature/migration-shvdne-01`; unchanged HEAD `8f1900c47a00d3622b07e929d78b74753d1af692`. No commit, push, merge or publication was performed.

## Established evidence retained

Codex hashed all **324 files** in the complete `smoke-01-preparation` tree, including raw execution-01 logs, result/restoration receipts, sealed proposal, binaries and helper sources, and verified every byte again. The wider preservation check covers **582 historical files**, including the old final build/private package. It archived the original bytes of **1,744 source/worktree files** before editing. Exactly nine existing files changed for this task; the other 1,735 remain identical. The final verification records individual before/after hashes. The original RPH worktree status and protected `Build-Menu02.ps1` hash also match the preserved baseline.

The Stage 1 result remains: matching SHVDNE v1.1.0.6/API3 3.9.0.0 initialized on Enhanced 1.0.1158.16, exactly one RichAudio production script, no RPH participation, 272 diagnostic rows, 267 valid camera rows, 1,883 raw vehicle observations, zero getter failures, one normal reload with a new session, stable controls/pause reported by me, normal exit and exact checked restoration. The authorization is consumed. Its maximum batches of **16.2611 ms** and **17.7357 ms** exceeded 10 ms; frequency, cause and gameplay impact remain unresolved. Camera-cut, initial-velocity and numerical-pause transition qualifications remain incomplete as recorded originally.

## Exact implementation scope

| File | Change |
| --- | --- |
| `bridge/Integration/SharedFrameSampler.cs` | Bounded timing spans, attempted observation count, optional diagnostic observations for admitted valid sources, with existing 10 ms withholding retained. Original synthesis behavior when RPM is absent is preserved. |
| `bridge/Integration/ShvdneConfiguration.cs` | Explicit transport-validation flag; rejects mechanical providers and auxiliary UI/world/output switches in this mode. |
| `bridge/Integration/ShvdneHostController.cs` | Tested passive-entry/command policy and transport arming/retirement; publisher metrics. |
| `bridge/Integration/ShvdnePackageLinks.cs` | Bounded adapter/manifest mode agreement and full transport-manifest validation on the ordinary bootstrap worker. |
| `bridge/Shvdne/RichAudioScript.cs` | Tick/scheduling diagnostics, worker-side serialization/snapshots and session-bound explicit commands. Every reload starts disarmed; observed timing/getter/scheduling failure retires an armed host. |
| `host/Transport/GameplayProtocol.cs` | Optional `vehicleObservations02` metadata in the unchanged version-1 envelope, plus publisher serialization and bounded-mailbox counters. Required synthesis fields stay unchanged. |
| `host/Transport/PlayableConfiguration.cs` | Strict SHVDNE transport-only manifest: exactly one host binding, empty synthesis eligibility, no output/demo/latency/source-policy selection. Normal manifests retain their original requirements. |
| `host/Windows/GameplayRuntime.cs` | Existing owner/permit/job/pipe supervisor gains disarmed transport startup and permanent retirement; no automatic same-session host retry. |
| `host/Windows/GameplayHost.cs` | Early transport branch before PCM-ring/Node/renderer/endpoint creation, using the existing authenticated v1 pipe, stop signal and lifecycle/status evidence. |

New production helpers are `host/Transport/ObservationTiming02.cs` and `TransportObservationState02.cs`. The existing test infrastructure gains `tests/host/TestShvdneSmoke02.cs` and `tools/Test-ShvdneSmoke02.ps1`. Documentation and private packaging/verification fixtures are confined to this worktree. Paths in this table are relative to `src/acoustics` unless otherwise shown.

The acoustic engine, synthesis, source banks, JavaScript producer, PCM callbacks/ring, SoundMap and world algorithms were not edited by this task. Earlier unrelated working-tree edits remain intact; this report does not claim those earlier edits were created here.

## Timing evidence and limits

The sampler measures camera/listener acquisition, nearby enumeration, cumulative vehicle getters, remaining conversion/validation/bookkeeping and complete batches, including early returns/faults. Tick measurement covers the enabled callback. Publication scheduling records lateness and whole missed intervals separately. Conversion is a residual span after measured camera/enumeration/getters; it is not a claim that all residual time is serialization. Wire serialization runs on the publisher worker. Diagnostic packet conversion/serialization and histogram snapshots run on the journal worker and are separately timed; filesystem writes are excluded from that serialization metric.

Fixed 1,002-bin histograms retain lifetime count, exact maximum, total and count/percentage strictly over 10 ms. Percentiles are conservative upper bounds at 0.1 ms resolution through 100 ms, using the exact maximum for an overflow quantile. No rolling reset or sampling discards slow batches. The count histogram retains attempted getter counts per batch, with latest/maximum/total counts. Per-thread allocation totals/latest/maximum are measured only if the CLR exposes `GC.GetAllocatedBytesForCurrentThread`; otherwise the result is explicitly unavailable/null. Unsupported allocation instrumentation is not replaced by a fabricated zero.

QPC measures elapsed time, including SHVDNE marshaling/waits/descheduling during a span. The separate scheduling metric supports diagnosis but cannot attribute CPU execution, OS stalls or GTA frame-time impact. Bounded in-memory histogram updates replace per-sample logging; one-Hz snapshots/serialization stay off Tick. Live diagnostic overhead and game performance still require the proposed experiment. No perf pass is inferred from fast authored fixtures.

## Transport, missing signals and lifecycle

Existing current-user pipe ACLs, exact peer PID checks, owner creation-time verification, startup permit, session names, 32 KiB framing, freshness checks and acknowledgements remain the transport. The version-1 required `vehicles` contract still requires a real operating point. Missing-RPM sources therefore do not enter it. The additive optional metadata array carries only validated admitted identity/generation, pose, running/attachment and explicit null operating point with `unavailable` evidence. Mechanical observations are never synthesized or passed to a renderer. The actual pre-change v1 decoder was compiled from preserved source and successfully ignored the extension while retaining required listener/vehicle fields.

The publisher remains one latest-frame mailbox and reports superseded, unavailable, stale and failed publications. The transport-only host consumes directly with zero pending-frame queue, tracks bounded source lifetimes, rejects malformed/stale/reordered/foreign-session observations and retired-ID reuse, and expires metadata at 250 ms. Lifetime history is capped at 4,096 retired IDs; exhaustion fails closed. Context remains the original bank context; current player attachment is independent. A new handle/model/lifetime cannot inherit a prior source.

Host-only manifests contain no producer or audio assets, so the tested mode cannot rely on a hidden Node process or device-free audio rendering. Normal graceful retirement uses the existing session stop event and is verified before the normal Insert reload and before normal game exit. Direct managed-domain teardown while a host is active is outside the proposed live scope. Existing emergency containment remains intact; it is not exercised live and cannot count as successful graceful cleanup.

## Offline validation

| Validation | Result |
| --- | --- |
| New deterministic timing/metadata/actual-host suite | **60 checks PASS**: span attribution, 20 ms overrun retention/withholding, early-return denominator, nullable metadata, malformed/stale/foreign/reordered signals, source retirement, explicit phase gates, one-slot burst of 1,000 frames, actual host startup/IPC, disconnect/reconnect, normal cleanup and two sequential fresh controller lifetimes. No GTA or endpoint. |
| Existing observation/provider/listener parity suite | **32 cases / 127 assertions PASS**; actual provider with authored API responses and unchanged pure RPH listener reference. |
| Existing SHVDNE host boundary | **36 checks PASS**; ownership, v1 transport, normal cleanup and authored offline failure/containment cases. These are fixture processes, not a live game/runtime termination test. |
| Existing configuration/package/assembly metadata | **39 checks PASS**. |
| Actual ten-file projection/package-link fixture | **6 checks PASS**; real staged config, copied portable paths, actual host binding/game disk hash, stock-fallback preferences and mode mismatch rejection. No game execution. |
| Pre-change v1 decoder compatibility | **PASS** against a v1-shaped frame reconstructed from actual host-received copied metadata. The initial PascalCase diagnostic-wrapper attempt was rejected; the corrected wire-shaped fixture is retained separately. |
| Native PCM reserve/callback/starvation/deadline guard | **37 checks PASS**, no endpoint. |
| Private retained-bank causal/PCM regressions | **8 tests PASS, 0 skipped**, including bit-exact sampled diagnostics, source leases/lifetimes, finite geometry, invalid ratios and all nine player/exact Bati NPC mappings. |
| Existing gameplay worker control tests | **2 tests PASS**, including actual persisted C# settings command and no PCM after stop. |

Failed/intermediate receipts remain available. The first observation regression exposed an unintended change to missing-RPM synthesis history; Codex restored the original default behavior and retained the new pose-only history exclusively for diagnostic transport. The first actual-host suite had an expected malformed-packet closure escape the test harness; the corrected harness passes. The first old packaging fixture exposed an overly broad bootstrap load requirement; normal package behavior was preserved while transport-only packages receive strict validation. A package fixture initially confused `richAudioEnabled:true` with the separately selected `stock-fallback` mode; its assertion was corrected without changing product defaults. An initial helper compilation used relative compiler paths and was corrected to absolute paths. These failures are not live attempts or compatibility results.

## Candidate and execution package

The final build is `.local/migration-shvdne-01/smoke-02-preparation/build-final-02`. The ten-file projection is `deployment` beside it. `package-receipt.json` and `deployment-plan.json` enumerate bytes and destinations. The final execution-manifest digest and fresh authorization text are stored beside those receipts after sealing; this report does not embed its own enclosing manifest hash.

| Bound artifact | SHA-256 |
| --- | --- |
| `RichAudio.Shvdne.dll` | `1bf387110da02a48984fdcaa65fd9a981576def52d2fc91526832c7d8c43d0ba` |
| `RichAudio.Acoustics.Host.exe` | `df8f53eaad02b4fba3b3efc5c22f546ff08c43d1425bff288a9c181891c631fb` |
| Transport-only `playable.json` | `f65fde76c4585ec9b063093a17ccfee63f0881a7a807bfa04de2e939b1e9b53c` |

All five runtime files equal their entries in the retained matching distribution; Script Hook V/ASI loader/DirectStorageFix/StraightToStoryMode and original RPH/RichAudio files remain pinned and untouched. The only future parking is TrainerV.asi and OpenRPF.asi. No live installation or configuration modification occurred. [The proposed procedure](SHVDNE_SMOKE_02_PROCEDURE.md) specifies create-new installation, partial-action receipts, normal retirement/reload/exit, exact hash restoration, explicit per-phase gates and four independent verdicts.

## Remaining blockers and authorization boundary

The candidate is ready for a **freshly authorized bounded attempt**, not a declaration of Stage 2 success. The earlier >10 ms batches are a known unresolved performance concern and can stop Phase A before a host starts. The standard SHVDNE nearby-vehicle discovery remains memory-layout dependent; no optional mechanical provider or offset is enabled. Live host compatibility, game performance and full normal-reload sequencing for this new candidate remain unverified. The offline sequential controller fixture is not relabeled as a live SHVDNE reload.

The proposed attempt is one normal Steam launch, 10-minute startup/2-minute initialization/5-minute first-diagnostic bounds and a 17-minute absolute ceiling; no more than one normal Insert reload and two sequential explicitly armed transport hosts. A failed timing gate stops host progression; failures retain separate timing/transport/lifecycle/restoration verdicts. There is no automatic repeat or move into playback, mechanical qualification, profile assignment, native suppression or private registration. Gate A ownership remains blocked and unchanged.
