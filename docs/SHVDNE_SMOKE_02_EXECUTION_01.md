# SHVDNE-SMOKE-02 execution-01 — Phase A timing failure, exact restoration passed

I authorized one attempt against execution-manifest SHA-256 `5b3a09c0a1d026902e69c7655435e9b7fff4a3f0b15473d1729ede3c9b0eae16`, adapter `1bf387110da02a48984fdcaa65fd9a981576def52d2fc91526832c7d8c43d0ba` and host `df8f53eaad02b4fba3b3efc5c22f546ff08c43d1425bff288a9c181891c631fb`. Codex ran the single normal Steam launch. **Phase A failed the fixed timing gate. No host was armed or started, no Insert reload occurred, and no later phase was attempted.** The game exited normally and all checked originals were restored exactly. My authorization is consumed.

The execution evidence is in `C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\migration-shvdne-01\smoke-02-preparation\execution-01`. The original preparation manifest, procedure, candidate bytes and Stage 1 evidence were preserved; this report is a separate result and does not rewrite them.

## Verdicts

| Item | Result |
| --- | --- |
| Phase A timing | **FAIL** — two complete batches and two ticks exceeded 10 ms. The lifetime gate never became ready. |
| Phase B host/IPC | **NOT ATTEMPTED** — zero arm commands, zero host starts, zero sent frames and zero wire serializations. The host executable was installed as authorized but never launched. |
| Phase C normal reload | **NOT ATTEMPTED** — no Insert key or runtime termination was requested. |
| Normal game exit | **PASS, observed** — the normal GTA quit prompt was confirmed; the process was then absent. Exit code was not captured. |
| Restoration | **PASS** — 24 protected originals match their hashes, both ASIs restored, all ten new files and recognized generated files removed, no game/RPH/host process remains. |

## Timeline — 12 November 2026, London/UTC

| Event | Time |
| --- | --- |
| Ten-file installation completed; two ASIs parked with verified backups | 00:20:45.734 |
| Normal Steam launch; game PID 8300 created | 00:21:28.101 |
| Matching SHVDNE v1.1.0.6/API3 initialized; exactly one RichAudio script started | 00:22:17, core log |
| Runtime package/ownership validation | 00:22:18.220 |
| First journal file created | 00:22:18.222 |
| Codex first read the timing failure; 987 batches / 6,229 ticks retained at that observation | 00:23:12.054 |
| Stop decision recorded; no host arm or reload | `phase-a-stop.json` |
| Normal Alt+F4 quit prompt requested and observed | `normal-exit-request.json` |
| Enter sent to GTA's normal quit confirmation; process first observed absent | 00:23:46.570 |
| Exact restoration completed | 00:24:07.643 |

The journal-file deadline conservatively starts one second before file creation, giving a cutoff of **00:27:17.222**. The absolute ceiling was **00:38:28.101**. Normal exit occurred before both. Actual playable readiness was not separately timestamped before the first ready journal; the journal already showed valid Story context by then. No second launch was attempted.

Codex observed no journal at 00:22:13.950; its next journal read at 00:23:12.054 found the failure. Both overruns were already recorded by the second diagnostic row. No movement handoff was issued after that discovery; the planned 30–45-second controlled camera/walk/vehicle sequence was not performed. This was not a complete movement or vehicle-lifetime qualification.

## Timing findings

The final retained snapshot contains **1,476 batches** and **10,081 ticks**, including startup and the ordinary shutdown transition. The stop-decision snapshot had the same two overruns in 987 batches: 0.202634% at that point. Later normal-exit observations were retained rather than discarded, but no further batch/tick overruns were added.

| Lifetime span | Count | p50 | p95 | p99 | Maximum | Count >10 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Complete observation batch | 1,476 | 0.7 ms | 1.1 ms | 1.4 ms | **47.8650 ms** | **2 / 0.135501%** |
| Enabled script tick | 10,081 | 0.1 ms | 0.8 ms | 1.0 ms | **61.3357 ms** | **2 / 0.019839%** |
| Camera/listener | 1,476 | 0.1 ms | 0.1 ms | 0.1 ms | **46.6392 ms** | 1 |
| Nearby enumeration | 78 | 0.1 ms | 0.1 ms | 4.8533 ms | 4.8533 ms | 0 |
| Cumulative vehicle getters per batch | 1,476 | 0.6 ms | 1.0 ms | 1.2 ms | 6.5644 ms | 0 |
| Conversion/validation/bookkeeping residual | 1,476 | 0.1 ms | 0.2 ms | 0.2 ms | **17.4865 ms** | 1 |
| Journal-worker diagnostic serialization | 82 | 0.9 ms | 1.6 ms | 7.5303 ms | 7.5303 ms | 0 |

Percentiles are the sealed histogram's conservative upper bounds, at 0.1 ms resolution through 100 ms. They are not exact order statistics. Counts/series are copied asynchronously and individual fields in a row need not describe one atomic sampler instant. The first row, for example, already had two camera samples visible while its batch count still reflected one completed batch. Final counter values are retained as reported, not reconstructed into fictitious per-batch traces.

The first row reported `listener-acquisition-invalid`, a 47.865 ms complete batch, a 46.6392 ms camera/listener maximum and a 61.3357 ms tick. Its legacy `maximumObservationMs` was still **0**, because that older counter does not include the early-return path. By the second row, the batch overrun count had reached two and the residual conversion/validation/bookkeeping maximum was 17.4865 ms. The legacy completed-path maximum reached 18.659 ms.

This establishes where the instrumented elapsed-time spikes appeared and why the new full-batch maximum exceeds the older counter. It does **not** establish whether JIT compilation, SHVDNE marshaling, native work, scheduling or another cause produced them. QPC includes descheduling within a measured span; this is not CPU-time or frame-time attribution. Both spikes appeared during early initialization, but the authorized gate explicitly includes startup. Low percentiles or a possible future warm-state result cannot convert this failure into a pass.

Scheduling showed **zero missed full publication intervals**, with maximum measured lateness 14.0582 ms. Lateness above 10 ms occurred 24 times, separately from execution-span overruns. No CPU/GTA frame-time impact is inferred. Per-callback-thread allocation measurement was available: 29,730,472 bytes across 1,476 batches, about 20,142.6 bytes per batch on average, maximum 39,048 bytes. These are measured callback-thread batch allocations, not process-wide allocation or GC-pause attribution. Maximum attempted vehicle getter count was six.

## Runtime and scope evidence

The archive contains **83 diagnostic rows**, **79 valid listener rows** and **283 raw vehicle observations sampled in the one-Hz journal**. Those 283 rows are not all 5,332 sampler getter observations and are not admitted or transported frames. Getter failures remained zero. The only observation/transport sessions were `ee339bbb325c463485462c0f1135c67a` and `bef985e22b654e1ba613accff1f875ac`, respectively; no reload session was created.

All journal host PIDs are zero, command state is always `passive`, and `passiveGateReady` is always false. Publisher sent/expired/failure/superseded/unavailable counts and wire-serialization count remain zero. The runtime lifecycle records package readiness, stock-fallback selection and later Story-not-ready state; there is no `host-started` event or host lifecycle/status receipt. Consequently live handshake, vehicle transport, queue handling and host cleanup are still unqualified. The existing offline passes remain offline evidence only.

RPM ratio, gear, throttle, brake, steering, clutch, aggregate wheel speed and engine-starting values are null in all 283 raw sampled observations. Both optional provider flags remain false in the archived installed configuration. The existing public-native vehicle class, health, wheels/horn/siren status getters are part of the sealed baseline source and did produce values; they were not newly enabled optional providers. No operating point was invented and no synthesis vehicle was transported.

The loader identifies only DirectStorageFix, ScriptHookVDotNet and StraightToStoryMode ASIs. TrainerV/OpenRPF were parked as approved. The original RPH log remained unchanged and no RPH process was observed. The normal SHVDNE framework initialization hooks appear in its own log, as in Stage 1; Codex added or invoked no extra hook/patch or compatibility bypass. No profile probe was installed, no assignment/native suppression/private registration was performed, and no RichAudio audio endpoint/producer/renderer ran.

I reported **“No unexpected behaviour noticed”** during startup and the normal quit. This is my subjective observation, not a game frame-time measurement. There is no final script `stopped` row or runtime-closed row; final journal drain during process teardown is best effort. The normal quit prompt, process cessation and zero host activity corroborate ordinary exit, without claiming a live normal-reload or active-host teardown result.

## Restoration and next boundary

Codex archived every installed file, recognized generated file, loader/core log and post-run settings copy before removing or restoring anything. All 24 protected originals match their baseline SHA-256 values; TrainerV.asi and OpenRPF.asi are restored. All ten installed files, new SHVDNE root log and created `scripts` tree are absent. The selected Steam entry remains `-nobattleye`; unrelated Steam metadata and saves were not replaced. Backups, raw evidence and partial-action receipts remain available.

The final independent verification rechecks the sealed 119 bindings, all 582 historical files including all 324 Stage 1 preparation/evidence files, the original RPH worktree/menu, current protected originals and process absence. No production source/candidate change was made during this execution. Gate A ownership is unchanged.

The bounded attempt is finished. The smallest follow-up is offline investigation of the startup camera/listener and conversion/validation spans, including whether candidate-side initialization can be moved off the measured callback without weakening the 10 ms gate. That work is not a second launch or live approval. Host/IPC and reload qualification remain outstanding, and this consumed authorization cannot be reused.
