# SHVDNE-SMOKE-02B — targeted diagnostic candidate

I asked Codex to implement one narrowly targeted diagnostic candidate for the unexplained startup spans. **Offline admission passes; live performance and attribution remain unqualified.** No GTA launch, candidate execution/installation, host IPC, audio endpoint or privileged tracing occurred. Earlier candidates, raw evidence, RPH work and unrelated edits are preserved.

The private preparation directory is `C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\migration-shvdne-01\smoke-02b-preparation`, on `feature/migration-shvdne-01`. This is diagnostic instrumentation, not a correction claim for the original 46.6392 ms camera or 17.4865 ms residual event.

## Implemented changes

| File | Focused change |
| --- | --- |
| `src/acoustics/bridge/Shvdne/ShvdneGameSource.cs` | QPC boundaries around the existing coordinate, rotation, game-time and pause calls; raw acquisition timestamps, returned-call masks and post-native managed construction. Call order, values and exceptions retained. |
| `src/acoustics/bridge/Integration/SharedFrameSampler.cs` | Independent readiness/interior/handle/getter/bookkeeping/admission/construction/validation boundaries, including invalid-listener and not-ready early returns. |
| `src/acoustics/host/Transport/ObservationTiming02.cs` | Returns the existing full-batch endpoint to the recorder; the original timestamp and 10 ms counting semantics are retained. |
| `src/acoustics/bridge/Integration/ShvdneConfiguration.cs` | Explicit `startupTiming02B` mode restricted to the existing transport-only/no-mechanical/no-auxiliary configuration. |
| `src/acoustics/bridge/Shvdne/RichAudioScript.cs` | Constructs the recorder on the bootstrap worker; drains through the existing journal; records bootstrap/sampler-creation milestones; diagnostic mode ignores arm commands and independently blocks host publication. |
| New `src/acoustics/host/Transport/StartupTrace02B.cs` | Preallocated, lock-free callback recorder; bounded immutable records, stage/CPU/GC evidence and separate first-32/after-32 histograms. No new worker/service. |

The wire protocol, acoustic engine, synthesis, renderer, PCM callbacks and SoundMap are unchanged. No changing game-state cache, fake warm-up observation, optional telemetry provider or private SDK preparation was added. The new tests are `tests/host/TestShvdneTrace02B.cs` and `tools/Test-ShvdneTrace02B.ps1`.

## Evidence and bounds

There are 21 timing categories. The first 32 captures are retained, followed by at most 64 additional full-batch budget anomalies/exceptions: **96 immutable records maximum per script lifetime**. Saturation increments a dropped counter. Subsequent ordinary batches still update bounded phase aggregates. At most eight records drain per journal packet. Preallocation happens on the existing bootstrap worker; callback recording adds no per-record allocation, filesystem/console/network operation, service, stack capture or lock. The older lifetime histogram locks are preserved, not redesigned; their cost can appear in the instrumentation/unclassified span.

The four camera stages measure whole `Function.Call` operations, including managed return conversion. The SDK is not patched to separate its internals. Raw before/after/midpoint, stage masks, returned-call masks, outcome and exception fields preserve rejected or incomplete observations. Callback managed/native thread IDs and current-thread CPU samples supplement QPC. Windows reports kernel/user thread CPU in 100 ns units; these units are not a precision guarantee. [Microsoft GetThreadTimes documentation](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getthreadtimes).

The fixture observed a **15.625 ms minimum positive CPU increment**. Sub-operation CPU may therefore be zero or charged in a later sample despite real work. CPU probe offset timestamps are retained; no instruction-level attribution is claimed. GC counts are process-wide correlation. An elapsed/CPU gap cannot alone distinguish OS descheduling from a native/lock wait.

Stage wall sums reconcile to the original batch endpoint, with **zero raw-tick residual** in deterministic checks and within one QPC tick in actual-provider stand-in checks. Start/end CPU probes and finalization occur at explicitly recorded offset boundaries. `TraceTailTicks` exposes work after the original endpoint; original overall Tick timing still includes it. No overhead is subtracted from formal acceptance. Records, phase counters and legacy snapshots have stated asynchronous scopes.

## Overhead admission

The predeclared offline limits are median added time ≤0.1 ms, p95 ≤0.25 ms, p99 ≤0.5 ms, first-32 maximum paired addition ≤2 ms and direct cold recorder invocation ≤2 ms. Comparisons use archived pre-instrumentation sampler source, authored identical inputs/clocks, alternating call order, actual self-thread CPU interop and charged QPC-read cost. All 1,024 signed paired differences and absolute times are retained; these are fixture measurements, not live qualification.

The first direct cold-recorder test measured **2.6001 ms** and failed admission. Codex retained that failure. The justified diagnostic-only correction prepares this recorder's own managed callback method bodies on the bootstrap worker through `RuntimeHelpers.PrepareMethod`, without executing those methods, any native game call or fabricated observation. Its preparation duration is separately journaled. It does not prepare SDK internals or claim to fix the original outliers.

The final qualified run measured:

| Measurement | Result |
| --- | ---: |
| Direct cold recorder after bootstrap preparation | **0.0109 ms** |
| Median paired added time | **0.0047 ms** |
| p95 / p99 paired added time | **0.0077 / 0.0097 ms** |
| Largest later paired addition | **0.2072 ms** |
| First-32 maximum paired addition | **0.0107 ms** |
| Disabled-instrumentation p99 difference | **0.0055 ms** |

Admission passes without relaxing the limits or deleting the failed run. Live native behavior, scheduler contention, GC and instrumentation impact remain unqualified.

## Offline verification

| Suite | Result |
| --- | --- |
| Targeted trace fixtures | **113 checks PASS**: 48 exact archived/current frame comparisons, original identity/lifetime behavior, early returns, authored readiness/interior/identity delays, all four actual-provider camera call boundaries, exception/order/value preservation, endpoint reconciliation, bounded capacity/drain, concurrent immutable publication, GC evidence and diagnostic failure isolation. |
| Overhead admission | **PASS**, separate process and full raw paired data retained. |
| Existing observation/provider/listener suite | **32 cases / 127 assertions PASS**, including pause/cut/recovery and pure RPH listener parity. |
| Existing pure boundary checks | **10 configuration + 32 protocol/timing + 2 cancellation/mode checks PASS**. No host or pipe was started; existing test methods that launch hosts were not invoked. |
| Existing package/assembly metadata | **39 checks PASS**. |
| Actual ten-file projection/package links | **6 checks PASS**; diagnostic flag verified, portable paths, exact game/host disk hashes and stock fallback; no candidate execution. |
| Private retained-bank PCM regressions | **8 tests PASS, 0 skipped**, device-free arrays only. |

Intermediate harness failures are preserved: array deserialization shape, a test accidentally consuming a drain twice, and an unset fixture owner path were corrected in test code. The cold overhead failure and its measured preparation correction remain separate evidence. Authored delays are not GTA timing proof.

## Candidate and next boundary

The independently versioned build is `build-final`; the ten-file projection is `deployment`, both under this preparation directory. No Node runtime, source bank or profile probe is bundled. The manifest/procedure/authorization text are sealed beside the package receipts after verification.

| Artifact | SHA-256 |
| --- | --- |
| `RichAudio.Shvdne.dll` | `42f5dcef00a5773c37ea2b7169c9e8b7faf26b584d00482be41288b55b6d43e3` |
| Bound, never-launched `RichAudio.Acoustics.Host.exe` | `19cb50ce808fdee818df690a25000fcb1eee1f5ed7c0b89c95558bbcc6c52f4a` |
| Transport-only `playable.json` | `dc3c0d3bc93f9e35f40954b9c81c29686153d9139272e00970121eec83633211` |

[The proposed procedure](SHVDNE_SMOKE_02B_PROCEDURE.md) permits one separately authorized observation-only launch, no arm command or reload, at most 60 seconds from first diagnostic, normal exit and exact restoration. It preserves the lifetime 10 ms gate and adds independent diagnostic-data acceptance. First-32 and after-32 statistics are diagnostic partitions, not a warm-only performance gate.

After that measurement, require A computational defect, B initialization defect, C scheduling/external-runtime limitation or D inconclusive. Do not invent a correction for C, silently relax acceptance or automatically plan an extensive campaign for D. Assess separately scoped host/IPC work while explicitly retaining failed performance if appropriate; this mode cannot start that experiment. The intended priority remains essential integration qualification followed by Gate A ownership/restoration.
