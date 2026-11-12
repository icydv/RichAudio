# SHVDNE-SMOKE-02B — execution-01

I authorized one observation-only launch of the sealed diagnostic candidate. Codex executed that attempt on 12 November 2026. **Performance FAIL; attribution D (still inconclusive); diagnostic record integrity PASS; execution deadline compliance FAIL; exact restoration PASS.** My authorization is consumed. No repeat, reload, host/IPC phase or later stage follows from this result.

## Execution control failure

Codex did not enforce my stopping rule. The external monitor detected the first timing failure at **11:02:43.710172 UTC**. All 32 records had drained by **11:02:47.660476**, within the five-second drain allowance, whose deadline was **11:02:48.710172**. Codex nevertheless left GTA running. Its normal quit request was observed by **11:05:29**, and its confirmation key had been sent by **11:05:36.8526275**. Both the failure-drain deadline and the conservative 60-second diagnostic cutoff (**11:03:42.624247**) had already passed. The begin-exit-by-45-seconds requirement was also missed.

The monitor continued emitting stop information, but could not itself operate the normal game quit UI. Codex's orchestration/response delay, including an intervening context handoff, left that stop signal unenforced. This is an executor failure, not evidence of a game timing cause. No new experimental phase was started during the delay. A correct stopping request should have followed the completed drain immediately; the delayed request cannot be relabeled as a permitted drain.

After Alt+F4, Codex observed the game's normal quit confirmation and sent Enter. A later screenshot was black while the game process and journal remained active. Codex handed normal quit to me; I confirmed **“ive quit”**. Process absence was persisted at **11:08:54.6823058**. The exact process exit instant is not known. The recorded process-start-to-confirmed-absence bound is about **7 minutes 0.572 seconds**, within the absolute 17-minute ceiling, but this does not repair the failed earlier deadlines. No forced termination was used. Codex did not issue a save command. My broader stability feedback is separate from the tool observations.

Raw data after the failure-drain deadline is retained to disclose what happened. It is **outside the permitted failure-response interval** and is not additional qualification evidence. The first 32 immutable records were already complete inside that interval, so their startup attribution remains reviewable despite the procedural failure.

## Approved identity and installation

| Item | SHA-256 / identity |
| --- | --- |
| Execution manifest | `bdb9e988483d404359fb2ec4612510f667b50df436639d491c80a62b64a0a42a` |
| Adapter | `42f5dcef00a5773c37ea2b7169c9e8b7faf26b584d00482be41288b55b6d43e3` |
| Installed, never launched host | `19cb50ce808fdee818df690a25000fcb1eee1f5ed7c0b89c95558bbcc6c52f4a` |
| GTA Enhanced 1.0.1158.16 | `b48e80f5fc899eb89e5dcc9f3b68e9551cc8dcfac78b2a940b207e569e9987ea` |
| Runtime | Retained matching SHVDNE v1.1.0.6; API3 3.9.0.0 |

The bound procedure was `docs/SHVDNE_SMOKE_02B_PROCEDURE.md`. Codex checked all 115 manifest bindings, installed only the ten enumerated new files, and temporarily parked only TrainerV.asi and OpenRPF.asi after verified backups. Twenty-four protected originals were backed up. The preserved Script Hook V, ASI loader, DirectStorageFix, StraightToStoryMode and original RPH/RichAudio stack matched their pinned baselines.

There was one Steam Library launch with the existing `-nobattleye` option. GTA PID **26384** was created at **11:01:54.110585 UTC**. The core log reports SHVDNE 3.9.0.6 / distribution 1.1.0.6, API3 resolution to 3.9.0, exactly one discovered script and one RichAudio script start. The framework's own expected startup hook messages are retained; Codex added no hook or compatibility bypass. RPH was not launched and its protected log bytes remained unchanged.

The diagnostic configuration remained permanently disarmed. Every one of the 342 retained journal rows has `startupTiming02B:true`, `transportCommandState:"diagnostic-disarmed"` and host PID zero. Publisher counters and wire serialization activity remain zero. No transport-command file or host-start event was found. There was no reload, RichAudio playback, audio endpoint/producer startup, native audio assignment, suppression or private registration. Optional mechanical observations remained null. Standard nearby discovery and existing player/vehicle/camera observations occurred passively; I was never given the movement start signal because the first batch failed.

## Startup measurements

The two lifetime batch overruns were immutable records **1** and **2**:

| Measurement | Record 1 | Record 2 |
| --- | ---: | ---: |
| Original full batch | 51.1408 ms | 24.1814 ms |
| Through recorder publication | 51.1452 ms | 24.1845 ms |
| Recorded callback CPU delta, coarse | 46.875 ms | 31.250 ms |
| Camera coordinate call plus SDK return conversion | 41.1550 ms | 0.0052 ms |
| Full four-call camera bracket | 42.7887 ms | 0.0161 ms |
| Listener validation | 5.2107 ms | 0.6130 ms |
| Interior stage | Not reached | 3.8255 ms |
| Standard nearby discovery stage | Not reached | 4.9398 ms |
| Frame wire validation | Not reached | 13.8348 ms |
| Recorder tail after original endpoint | 0.0044 ms | 0.0031 ms |
| GC counts before / after | 0,0,0 / 0,0,0 | 0,0,0 / 0,0,0 |
| Outcome | listener-acquisition-invalid | vehicle-batch-over-budget |

The largest original conservative Tick was **67.6472 ms**, already present in the first packet. Its difference from that packet's batch maximum is **16.5064 ms**, outside the detailed batch stages; the new trace does not identify that surrounding Tick cost. Both original Tick and batch requirements fail. No startup exclusion or overhead subtraction has been applied.

At the last packet before the five-second failure-drain deadline, the lifetime counters were **91 batches, two batch overruns, 494 Ticks, two Tick overruns, zero missed full publication intervals and zero getter failures**. Its after-32 aggregate contained 59 batches, zero over 10 ms, maximum **0.9571 ms**. These later fast batches do not repair the startup failures.

For disclosure of the delayed stop only: the last packet before the 60-second cutoff had 1,056 batches and 6,929 Ticks; after-32 maximum was 2.0505 ms with no batch overrun. The final archived counters were 6,335 batches and 47,835 Ticks, still two batch and two Tick overruns, with **one missed publication interval** observed near the final quit. All of this continuation after the five-second failure allowance is outside the approved stopping interval and is not used to claim qualification or stability.

The journal worker's diagnostic serialization counter also reports a **13.2685 ms** maximum and one over-10-ms event. This is separately scoped worker serialization, not transport publication and not a detailed observation-stage measurement. It remains visible rather than being omitted from the overhead discussion.

## Capture quality and attribution limit

All ordinals 1–32 appear exactly once. All were published and drained, with zero pending records, drops or diagnostic faults. Every stage sum equals the original EndQpc minus BeginQpc exactly; every reported reconciliation residual is zero. All records use managed thread **9**, native thread **27896**. All four camera calls returned in both overruns; neither record reports an exception. The first early return and the second over-budget path preserve the stage masks rather than inventing unexecuted stages.

The maximum individual CPU-probe wall span was **0.0029 ms** and the maximum recorder tail **0.0044 ms** across the retained records. Those measured spans do not encompass every possible first-use/JIT instrumentation effect. In particular, record 1's Instrumentation stage is 1.1938 ms, while the record's summed measured probe spans are only 0.0134 ms. It would be incorrect to equate probe time with total instrumentation cost or subtract it from acceptance. Recorder managed preparation before observation was 3.5848 ms; its sampler-setup bracket was 0.8741 ms. These facts do not establish the cause of the observation overruns.

The smallest observed positive thread CPU increment is **156,250 100-ns units = 15.625 ms**. Record 2's CPU delta exceeds its wall duration, illustrating the quantization/boundary problem. Individual stages can receive a full CPU quantum larger than their own wall span. Zero CPU delta is not proof of waiting, and wall minus CPU is not a trustworthy wait estimate at this precision. GC counters are process-wide context; no change inside the retained records is evidence against a coincident counted collection, not proof of a runtime cause.

**Outcome D — still inconclusive.** The first expensive camera-coordinate invocation becomes very small in the next record, and the next record spends most of its remaining cost in first frame validation. The substantial coarse callback CPU deltas are consistent with cold execution/initialization work and do not support attributing the entire delay to descheduling. However, the combined native/SDK conversion stage cannot identify whether the first camera delay came from GTA, SDK conversion, JIT or another runtime cost. The frame validation span also does not identify a defective computation or prove a safe initialization remedy. The surrounding 16.5064 ms Tick difference remains unlocalized. These limits prevent a defensible A/B correction and do not prove C's external-scheduling explanation.

I retain the lifetime-inclusive zero-overrun requirement and performance FAIL. Codex has not implemented a speculative warmup, moved work outside acceptance, or designed another diagnostic campaign. Separately scoped host/IPC correctness work is worthwhile for migration progress if I choose it, while this performance failure remains explicit; it would require a reviewed candidate and fresh authorization that deliberately separates correctness from performance qualification. It cannot proceed under this consumed authorization or arm this diagnostic candidate. Gate A and later stages remain unqualified.

## Restoration and retained evidence

After process absence, Codex archived 21 game-side installed/generated/log files plus post-run settings, removed only recognized attempt files, restored protected originals, and removed created directories only after they were empty. Restoration completed at **11:08:55.661056 UTC**. Independent verification subsequently checked:

- All 24 originals and their retained backups match original hashes and lengths, including both parked ASIs and settings.
- All ten temporary destinations, the created scripts tree and new SHVDNE runtime log are absent.
- The selected Steam entry is still exactly `-nobattleye`; no whole Steam configuration was restored.
- All 115 bound source/package/evidence inputs remain unchanged.
- All 4,400 historical files are preserved; the original RPH worktree/status and protected menu edit are unchanged.
- No GTA, RPH or RichAudio host process remains.

The evidence root is `.local/migration-shvdne-01/smoke-02b-preparation/execution-01`. It retains authorization, approved manifest/procedure copies, original backups, action journal, process polls, monitor failure/deadline/timeline, complete game journals and lifecycle files, installed bytes, loader logs, post-run settings, raw immutable records, analysis, restoration and independent verification. `game-process-start.json` is the initial empty poll; the actual process creation identity is in `game-process-identity.json`. `process-exit.json` is an intermediate still-running observation; `process-exit-final.json` establishes later absence and my quit confirmation. Neither intermediate file is rewritten to imply a successful exit.

The sealed preparation files remain historical preparation evidence, including their original “not yet authorized/executed” flags. This execution report and `result.json` record the later authorization and consumed attempt. No production source or candidate bytes changed during execution or analysis. No commit, push or publication occurred.
