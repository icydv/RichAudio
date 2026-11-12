# SHVDNE-SMOKE-02A — startup timing investigation

I asked Codex to recover and precisely isolate the two Stage 2 outliers without weakening the lifetime-inclusive 10 ms requirement. **The investigation narrows both paths, but does not establish a live root cause that justifies a production correction. Codex therefore preserved all production code and retained only offline tests and this report.** No new candidate was built, installed or executed. GTA and the native SHVDNE runtime were not launched; no endpoint, hook, patch, audio assignment, suppression or privileged tracing was used.

Worktree: `C:\Users\Libby\Documents\RichAudio-SHVDNE01`, branch `feature/migration-shvdne-01`. The independent investigation directory is `.local/migration-shvdne-01/smoke-02a-investigation`. `preservation-before.json` records 1,751 existing source/worktree files and 2,589 historical files, including both smoke preparations, the complete execution evidence, original builds and private package. Original source bytes were archived before testing. No original RPH worktree edit, commit, push or publication was made.

## Evidence recovered

The original journal is `smoke-02-preparation/execution-01/artifacts/game/scripts/RichAudio/logs/session-ee339bbb325c463485462c0f1135c67a.jsonl`, SHA-256 `25e80b239febe8ad1d18ed6b94373721c26f1f7deefc71a21d875dc605ee2e1f`. The retained analysis SHA-256 is `e86fd72aa8fa20fdf9f7cb7abbcc5d542cea9a1feb4f727e574c974c1419b98b`. Neither was rewritten. `recovered-evidence.json` in this investigation stores the original relevant snapshots and explicitly bounded deductions.

The first diagnostic row reports one completed batch, `listener-acquisition-invalid`, batch 47.8650 ms, camera/listener maximum 46.6392 ms and tick 61.3357 ms. The older completed-path maximum is zero. By the second row, 18 batches had completed, two exceeded 10 ms, the legacy maximum was 18.659 ms and the residual conversion maximum was 17.4865 ms. The final snapshot reports 1,476 batches and the same two overruns.

The remaining **1,458 batches added no overruns**. Their derived aggregate mean is about **0.5846 ms**, obtained from the difference of cumulative per-series totals (`mean × count`). This is diagnostic evidence of early concentration in this attempt, not a newly qualified steady-state interval, a guarantee that the issue never recurs, or permission to exclude startup. The original Stage 2 result remains **FAIL**.

The journal is asynchronous: its first row already shows two camera observations while the batch series reports one completed batch. Each series is internally copied under its own lock, but fields across series are not one atomic event record. Neither an exact duration for the second complete batch nor an exact per-operation ordering can be reconstructed from those snapshots. Maxima from separate series must not be added as if they belonged to one measured event.

## Exact first expensive path

`src/acoustics/bridge/Shvdne/ShvdneGameSource.cs:61` implements `ReadCamera`. Its acquisition bracket is:

1. Bind/check the callback thread, then acquire the `before` QPC timestamp.
2. `GET_FINAL_RENDERED_CAM_COORD`, including the API's `Vector3` return conversion.
3. `GET_FINAL_RENDERED_CAM_ROT` with rotation order 2, including the same return type conversion.
4. `GET_GAME_TIMER`, including its `uint` conversion.
5. `IS_PAUSE_MENU_ACTIVE`, including its boolean conversion.
6. Acquire `after` and calculate the midpoint.

Camera basis construction, coordinate-array copying, UTC conversion and allocation of `CameraObservation` happen **after** `after`. The sampler's broader camera/listener series also includes those operations and `CameraListenerTracker.Observe` (`SharedFrameSampler.cs:84`, `CameraListenerTracker.cs:31`).

The listener rejects null/malformed acquisition metadata or a bracket exceeding 10 ms before checking pose, pause or continuity. With this provider's non-null return and ordered midpoint construction, the recorded classification is consistent with an acquisition bracket over 10 ms. Basis/UTC work after the bracket or JIT of the listener validator alone cannot explain that classification, although they can add to the broader 46.6392 ms span. The original raw `before`/`after` values and per-call durations were not retained, so a specific native call or precise bracket duration remains unknown.

At `SharedFrameSampler.cs:87`, a terminal listener decision invalidates continuity and returns null. It does **not** perform interior sampling, player-vehicle lookup, nearby enumeration, vehicle getters, source admission or wire validation. The `finally` timing path still executes. The new lifetime series therefore records the failure correctly, whereas the older maximum at line 176 is never reached. This explains the zero legacy maximum without treating the new 47.865 ms result as an instrumentation error. No invalid listener is published.

## Concrete first-use work, with bounded attribution

The retained v1.1.0.6 source at `.local/shvdne-reference/source/source/scripting_v3/GTA.Native/Native.cs:97` contains the pure managed `InstanceCreator<T1,T2,T3,TInstance>` static constructor. For `Vector3` return conversion, `Function.ObjectFromNative<T>` uses that factory (around line 3059). If it is still cold, the factory reflects the three-float constructor and compiles an expression into a cached delegate. Primitive return conversion can also lazily emit managed conversion delegates through `NativeHelper<T>`.

This is **verified one-time work on a possible camera-call path**, not proof that it was cold during this game's first RichAudio sample or caused the 46.6392 ms event. Another framework operation could already have initialized it. Its existence does not establish native execution, JIT, GC or scheduling causality for the original record.

Codex tested the verbatim retained factory body on the installed .NET Framework with an authored vector type, in five fresh processes. First initialization measured **1.9765–2.1873 ms**; repeated initialization checks measured **0.0548–0.0592 ms**. Constructor values were preserved. These are source-level CLR fixtures, not actual GTA/API native-call timings and not a reproduction of the live spike.

An initial direct managed-API probe could not initialize the authentic type without resolving the native SHVDNE core's constructor-signature dependency. An authored signature-only stand-in was then rejected by strong-name binding. Codex did not load the native runtime, disable binding checks, re-sign a dependency or bypass the loader. Those unsuccessful probes remain in the private investigation. The subsequent successful fixture explicitly uses the extracted factory body and an authored vector, rather than relabeling a stand-in as the authentic runtime.

The matched release's `core/NativeFunc.cs:246` calls `ExecuteTaskWithGameThreadTlsContext`; `core/ScriptDomain.cs:1499` takes a TLS-variable read lock and executes the task synchronously in the selected TLS context. This ordinary path differs from the separate queued `ExecuteTaskInScriptDomainThread` path. The recorded span is therefore not evidence of a queued-domain wait. A TLS lock wait, native work, return conversion, JIT or descheduling may still contribute; the live record does not distinguish them.

## Exact second expensive envelope

The label `conversionValidation` is the arithmetic residual at `SharedFrameSampler.cs:183`: capture elapsed time minus measured camera/listener, enumeration and vehicle-getter durations. It is **not** an individually bracketed conversion function. Its possible work includes:

| Operation | Location / role |
| --- | --- |
| Recheck `StoryReady` | Line 83; live loading/network/player/death guards inside Capture, in addition to the outer Tick check. |
| Camera timing histogram update and early-return bookkeeping | Lines 85–88; outside the measured camera span. |
| Interior native readback | Line 90 and `ShvdneGameSource.cs:144`; still obtains raw readback when activation's world epoch is absent. |
| Player vehicle lookup and tracked/candidate handle lists | Lines 93–105; ordinary native lookup, lists, iteration and discovery bookkeeping. |
| Copied-observation validation and source history | Lines 120–158; pose/time/distance guards, dictionary/ID/context/generation handling and copied arrays. |
| Candidate ordering, admission and retirement | Lines 165–174; sort, sets, lists and array copies. |
| Completed-path budget check and frame construction | Lines 175–180; retains the existing 10 ms withholding. |
| Frame validation | Line 181; listener/vehicle invariants and regular-expression identity checks. It validates but does not serialize. |
| Timing bookkeeping | Residual/full-batch instrumentation costs; short histogram locks can also contend with worker snapshot copies. |

The 17.4865 ms maximum cannot be assigned to one row of that table. Enumeration's own 4.8533 ms maximum and getter-span 6.5644 ms maximum do not identify the residual event. The legacy 18.659 ms completed-path timestamp is taken **before** final frame construction/`GameplayWire.Validate`; blaming only final wire validation would not explain that older maximum.

No filesystem operation, JSON serialization, pipe write, host launch, audio processing or explicit thread wait occurs on this ordinary sampler path. Frame encoding/IPC are on a worker and sent/serialization counts were zero in this attempt. Journal serialization/I/O is also on its worker. Concurrent startup/journal/runtime work could affect scheduling or GC, but cannot be assigned as the cause without correlating evidence. Histogram locks and framework TLS locks are real potential blocking points; no contention event was retained.

## What had initialized, and what had not

SHVDNE's core log recorded completion of NativeMemory initialization (6,418 ms), API loading and creation of exactly one RichAudio script before observations. The adapter had read/validated its configuration, checked the exact game/API identity, prepared package links and started the existing host supervisor before publishing `initialized=1`.

The first enabled Tick then constructs `ShvdneGameSource` and `SharedFrameSampler`, including fixed histogram arrays and the allocation-counter delegate's lazy setup. That construction is outside `Capture` but inside the overall Tick. It is possible one-time Tick work; the original record does not isolate its elapsed cost. Moving it alone would not address the independently failed camera acquisition/batch.

The bootstrap worker constructs its `JavaScriptSerializer` **after** publishing the initialization barrier (`RichAudioScript.cs:71–72`), so serializer initialization and the supervisor's package validation can overlap early callbacks. The first diagnostic's supervisor state is `validating`; the second's is `GTA stock fallback`. Runtime readiness is journaled at 00:22:18.220, but the asynchronous snapshots do not establish its exact order relative to the second anomalous batch. No host, producer or endpoint started.

Live-state readiness checks, four camera calls, basis conversion, listener continuity, interior readback, candidate handling and invariant validation normally repeat. Generic conversion delegate setup, sampler construction, some CLR/JIT/regex setup and bootstrap serialization initialization can be one-time work. QPC includes both execution and interruption. There are no live callback CPU, JIT, GC or context-switch measurements to separate those cases.

## Correction decision and before/after findings

**No production correction was retained.** The current evidence does not establish a narrow operation responsible for either outlier, and the bounded tests do not reproduce their cause.

| Considered change | Why it was not retained |
| --- | --- |
| Warm a private SDK conversion factory | The isolated cost is real, but was not shown to explain the live spike or even to be cold in that sample. Adding a private-framework preparation dependency is unjustified on this record. |
| Move sampler construction off Tick | May remove some one-time Tick work, but its cost was not isolated and it is outside the independently failed camera bracket. It would not resolve the demonstrated batch failure. |
| Remove the repeated readiness guard | Would change the safety check against live scope transitions; it is not a validated redundant cache. |
| Skip interior readback while world activation is off | Would remove existing raw observation semantics without proof that this operation caused the spike. |
| Skip/cache validation or changing-state data | Could change accuracy, lifetime or source admission. No justified redundant operation was established. |
| Replace histogram locks / redefine the measured interval | No live contention was proven. Changing the diagnostics or excluding startup to get a pass would not fix the identified uncertainty. |

There is no claimed before/after patch speedup. Production sources and candidate bytes are identical to the investigation baseline. The useful comparisons are: the original early versus later aggregate; cold versus repeated pure factory work; and deterministic scenarios where different operations produce the same existing residual metric. An authored 25 ms wait and busy interval also produced similar elapsed magnitudes with different coarse process CPU observations, illustrating why elapsed duration alone is insufficient. Quantized process CPU is not per-callback CPU, and zero recorded CPU is not proof of no computation.

## Offline verification and changes

Only these repository files were added:

- `tests/host/TestShvdneStartup02A.cs`: focused deterministic early-return/residual/correctness fixtures plus bounded managed-factory measurements.
- `tools/Test-ShvdneStartup02A.ps1`: existing C# test-build pattern, verbatim pure factory extraction and private-output receipts.
- `docs/SHVDNE_SMOKE_02A.md`: this report and the minimum next evidence plan.

Private investigation scripts, snapshots, test executables and results remain under the independent `.local` directory. No production, acoustic, synthesis, protocol, RPH, original test or historical evidence file was edited.

| Check | Result |
| --- | --- |
| New startup-specific fixture | **33 checks PASS**: invalid native bracket, no downstream calls after rejection, full early-return count, recovery generation, 200 repeats retaining the failure, delay outside the bracket, ambiguous residual causes, fixed-budget withholding, identity/attachment/retirement, fresh session, not-ready path and 20 exact repeated frame-byte comparisons. |
| Existing observation/provider/listener suite | **32 cases / 127 assertions PASS**; includes the actual provider against authored API responses, pause/cut/recovery and parity with the unchanged pure RPH listener reference. |
| Existing host/lifecycle/protocol suite | **36 checks PASS**; real current-user IPC/jobs with authored owner/peer executables, including normal cancellation, session changes, freshness and authored containment-failure cases. No candidate or native SHVDNE runtime was executed. |
| Existing private-bank PCM suite | **8 tests PASS, 0 skipped**; includes bit-exact sampled diagnostics, source history/leases, geometry, invalid ratios and stock mappings. Device-free arrays only. |

Intermediate test failures remain retained. One new fixture incorrectly expected immediate nearby rediscovery after retiring every tracked handle despite the existing one-second discovery cadence; its authored scenario was corrected to supply a current player handle. No production discovery change was made. Probe variants are preserved; only `startup-tests-final` supplies the reported factory range. None of these authored tests qualifies the live 10 ms gate.

## Minimum next evidence method and approval boundary

I do not have a new correction candidate or an actionable live approval request from this investigation. The shortest useful next step is a **small diagnostic-only proposal**, separately implemented, tested and sealed before any installation is considered. It should preserve the same 20 Hz, 16-vehicle, lifetime-inclusive 10 ms requirements and the same disarmed ten-file startup configuration, so it does not silently remove the original concurrent bootstrap conditions.

The proposed instrumentation needs a preallocated bounded record for the first 32 captures and a bounded set of later overruns. It should copy raw QPC boundaries for each of the four camera calls, post-native basis/UTC construction, listener validation, inner readiness check, interior readback, player/handle collection, conversion/history, admission/sort/retirement, frame construction and final validation. Record capture ordinal, actual before/after/midpoint, result classification and initialization milestones. No values should be synthesized or reused across live state changes.

Collect callback-thread CPU deltas through an ordinary supported self-thread clock, and GC collection-count changes at the affected capture boundary if their offline overhead is acceptable. Report clock quantization and process-wide GC scope. A wall/CPU difference can show unaccounted elapsed time, but by itself cannot distinguish scheduler interruption from lock/native waits. No privileged ETW, hooks, native runtime patching, fake warm-up observations or additional service is proposed.

Records should be fixed-size values copied to the existing journal worker; no per-operation JSON or file writes on Tick. Deterministic fixtures must verify the boundaries and measure added cost separately. Preserve the original full-batch measurements and acceptance gate. Do not use a warm-only reset or subtract tracing overhead to manufacture a pass.

A future live diagnostic attempt should allow **one normal Steam launch, no arm command, no host process, no reload**, stop for ordinary exit on a failed gate or after at most 60 seconds from the first diagnostic, and retain the original 10-minute startup, two-minute initialization and 17-minute absolute ceilings. Normal exit and exact hash restoration remain mandatory. Host/IPC qualification remains a later freshly authorized Stage 2 attempt, contingent on a genuinely clean entry gate. This proposal does not automatically authorize either run.

Before that live diagnostic can be approved, its actual updated adapter, manifest, ten-file plan, tested instrumentation overhead and rollback procedure must exist and be hash-bound. The exact authorization must then name those **new** hashes. The following is only the required wording structure, not a ready-to-execute approval:

> I authorize one SHVDNE-SMOKE-02A observation-only diagnostic execution-01 using execution-manifest SHA-256 `<new sealed digest>`, adapter SHA-256 `<new diagnostic adapter digest>`, and its bound procedure. Install only its ten enumerated files; temporarily park and exactly restore TrainerV.asi and OpenRPF.asi; preserve the pinned existing framework/loader/DirectStorageFix/StraightToStoryMode and original RPH/RichAudio stack. Launch Enhanced 1.0.1158.16 once through normal Steam with the existing -nobattleye option into offline Story Mode, without RPH. Permit only the reviewed bounded per-operation timing records; never arm or start the host, reload, enable optional mechanical providers or play RichAudio output. Retain the lifetime-inclusive 10 ms gate. Exit normally on failure or within 60 seconds of the first diagnostic, respecting ten-minute startup, two-minute initialization and seventeen-minute absolute bounds. Restore all manifest-owned files/settings exactly and retain evidence/backups. No native audio assignment/suppression/private registration, extra hook/patch, compatibility bypass, game process memory inspection, privileged tracing, forced termination, second launch or further stage is authorized.

The placeholders must be replaced by verified new artifacts before that statement can authorize anything. The unchanged Stage 2 manifest `5b3a09c0a1d026902e69c7655435e9b7fff4a3f0b15473d1729ede3c9b0eae16` and its consumed authorization cannot authorize new instrumentation or another launch. Existing adapter `1bf387110da02a48984fdcaa65fd9a981576def52d2fc91526832c7d8c43d0ba` and host `df8f53eaad02b4fba3b3efc5c22f546ff08c43d1425bff288a9c181891c631fb` remain preserved, not republished as a corrected build.

The unresolved limitation is precise and bounded: the first failed native-acquisition envelope lacks individual-call/CPU/GC correlation, and the second residual lacks operation-level boundaries. The offline work has not established a live fix or changed Gate A ownership. Once host/IPC is actually qualified, my priority returns to selective native audio ownership and restoration under its own approval scope.
