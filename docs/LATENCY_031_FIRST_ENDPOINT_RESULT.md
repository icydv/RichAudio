# LATENCY-03.1: my first completed real endpoint result

On 2026-11-02, I approved one endpoint-only attempt after returning to my PC and manually setting comfortable Windows and Astro A50 levels. Codex repeated the exact preflight, obtained my immediate confirmation of **Headphones — Astro A50 Game**, and invoked the copied, reviewed helper once. The run and independent cleanup verification passed. The candidate is consumed.

**All 462 ordinary events reached successful WASAPI submission.** Their observation-to-submission latency was **5.1588 ms median, 9.7815 ms p95, 11.4315 ms p99 and 17.3542 ms maximum**. The intentional overload submitted 27 of 64 events and rejected 37 before onset. Zero ring underflows, measured callback allocation bytes, clock rejections or truncated submitted tails were reported.

This establishes responsive software submission for this one synthetic sequence on this endpoint. It does not establish physical speaker latency, GTA event acquisition, native sound ownership, faster live Bati response or universal endpoint reliability. My subjective feedback did **not** establish that I could distinguish the synthetic events.

The previous failed LATENCY-03 attempt and the earlier unattended/mobile stops remain preserved. Those stops did not open an endpoint or consume this new candidate. This attempt used operational commit `14e23ee3ca6e2ca0c571a17deafcc6bde38e40e4`, approved PR #80 head `e49c3ac3838b5fb941bc09aef0b9cfbebf048a6d`, and the unchanged [private-proposal publication](LATENCY_031_REAL_ENDPOINT_PROPOSAL.md). The private proposal remained authoritative.

## Exact preflight and execution

Codex and a separate reviewer verified all 68 payload lengths/hashes, all 63 source bindings, the original Bati WAV and recording metadata, copied and original Node identities, compiler identity, sealed preparation/validation, and the exact review-bound private root. The reviewer also matched canonical source-commit blobs. The 72 original candidate files were unchanged, unconsumed and free of prior results or linked paths. Forbidden game/host/experiment and candidate-owned processes were absent.

The only changes after the operational source commit were documentation/evidence. [CI run 41486724046](https://github.com/icydv/RichAudio/actions/runs/41486724046) passed at the approved head. Fresh device-free `--validate` output matched the sealed validation hash exactly, with high-resolution QPC and callback allocation instrumentation available; it opened or queried no endpoint. No new operational artifact was generated or substituted.

Immediately before execution I replied: “Confirmed — Astro A50 Game, comfortable and ready.” The reviewed helper then made the only real invocation. Windows master volume and device preferences were not changed by the experiment.

| Approval binding | SHA-256 |
| --- | --- |
| Authoritative private proposal | `1f50da0effe5716467d54f10d03076dee709391003e32bf90600d4b664ae52bb` |
| Independent candidate review | `f49a908a7c58f5163a05adaefd87cac95e043f9ca73c47ef768e2ccda9ad6702` |
| Candidate manifest | `3c074154fde2c2502ffd5b996d02451dac51da1ef76513c6ae67b1c182565807` |

The endpoint accepted unchanged stereo 48 kHz Float32 shared-mode output. `IAudioClient3` was available; the queried default, fundamental, minimum, maximum and current periods were all **480 frames / 10 ms**. The post-initialization current-period snapshot was also 480 frames. No smaller period, alternate endpoint, exclusive mode, fallback format or reinitialization was requested. These queries are instantaneous observations, not a guarantee against later shared-engine changes.

The endpoint buffer was **1,056 frames / 22 ms**. Every steady callback observed **576 frames / 12 ms** of padding and wrote 480 frames. Initial prefill was separate: 1,056 frames, 3.1621 ms filling and 3.5436 ms from acquire-before through release-after. No additional retrospective vehicle-history queue was introduced.

## Event counts and submission timings

All 526 original occurrences were observed, written, decoded and accepted into the ingress bus with their original identities/timestamps. Voice admission subsequently rejected 37 intentional-overload events. The ingress counter `Rejected=0` therefore does **not** mean every event sounded. All 37 have retained negative voice-capacity receipts and no submission timestamp; none is represented as zero latency.

These are authored synthetic occurrence/observation brackets on the host QPC clock, not observations from a GTA weapon API. Their measured occurrence-bracket widths were 0 ms median, 0.0001 ms p95/p99 and 0.1191 ms maximum across 526 events. Zero-width brackets reflect clock resolution and the authored sampling calls, not perfect physical event timing. The fixture's additional clock-offset margin remained zero; endpoint-position uncertainty is reported separately below.

All values below are milliseconds. Quantiles use sorted index `ceil((n-1)*q)`, including the upper middle value for even sample counts. Maximums are observed values, not guaranteed bounds.

| Phase | Planned / submitted | p50 | p95 | p99 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Isolated shots | 6 / 6 | 7.7050 | 17.3542 | 17.3542 | 17.3542 |
| Automatic cadence | 64 / 64 | 5.4702 | 9.7309 | 10.1011 | 10.1011 |
| Four-event bursts | 128 / 128 | 5.6232 | 9.4004 | 10.5728 | 10.6046 |
| Overlapping impacts | 160 / 160 | 4.4180 | 9.6516 | 10.3177 | 10.3979 |
| Bounded transport jitter | 40 / 40 | 6.0115 | 11.9212 | 12.0613 | 12.0613 |
| Bounded CPU contention | 64 / 64 | 5.3253 | 9.5636 | 10.1731 | 10.1731 |
| Intentional overload | 64 / 27 | 1.8557 | 2.2371 | 2.3034 | 2.3034 |
| Ordinary phases together | 462 / 462 | **5.1588** | **9.7815** | **11.4315** | **17.3542** |
| All successfully submitted | 526 / 489 | 4.9706 | 9.7309 | 11.4315 | 17.3542 |

The [sanitized measurement artifact](../evidence/latency-031-first-endpoint-result.json) includes counts, stage distributions and mapping uncertainty for every phase, plus aggregate means/minimums where available. All raw timestamps and rejected-event identities remain private and unchanged.

| Measured stage or bracket | Count | p50 | p95 | p99 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Observation → write start | 526 | 0.0028 | 2.0000 | 2.0001 | 2.0002 |
| Observation → completed write | 526 | 0.0311 | 2.0673 | 2.0785 | 2.0974 |
| Observation → native decode | 526 | 0.3571 | 2.2807 | 2.3211 | 3.4655 |
| Observation → ingress acceptance | 526 | 0.3582 | 2.2812 | 2.3217 | 4.8526 |
| Observation → first-writable packet fill-before | 526 | 4.9393 | 10.1324 | 11.2043 | 14.8023 |
| Observation → first-writable packet fill-after | 526 | 4.9700 | 10.1727 | 11.2199 | 17.3525 |
| Ingress acceptance → successful submission | 489 | 4.3529 | 9.1955 | 9.9304 | 12.5016 |

`FirstWritableFrameAtConsumer` identifies the actual consumer frame. Its precise QPC selection instant was not separately instrumented: the matched packet's fill-before/fill-after measurements bracket the work containing that selection. Packet acquisition is separate context. Every submitted first-nonzero frame was independently matched to exactly one successful `ReleaseBuffer` packet. These brackets and stage quantiles must not be summed into an invented total.

The 40 jitter-phase writes retained the reviewed approximately 2 ms pre-write delay. The two below-normal-priority CPU workers ran only in the approved contention stage. The overload reached 32 concurrent voices, with 37 capacity rejections; 10 were the protected-tail rejection subset, not another 10 dropped events. There was no tail stealing, expiration, generation invalidation, queue-full rejection or post-submission retirement. All 489 submitted voices completed.

## Clock qualification and remaining scheduling delay

`ArrivedPositionInterval031` remained qualified: **2,804 accepted clock observations**, one unaccepted startup row, zero rejected/repeated accepted samples, **526 mappings**, and zero unavailable, awaiting-bracket, deferred or rejected mappings. There were no clock-query, fill or release exceptions or HRESULT failures. Raw unsigned clock returns and all query/format brackets remain retained.

| Clock measure | Count | p50 | p95 | p99 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mapping interval width, ms | 526 | 10.0417 | 10.0625 | 10.0625 | 10.0833 |
| Nominal-rate residual, frames | 2,804 | 0.4944 | 52.4528 | 108.6768 | 145.4512 |
| Composite scheduling lateness, ms | 489 | 22.6250 | 26.1042 | 32.6250 | 32.6250 |

Mapping widths stayed below the reviewed 512-frame / 10.6667 ms total admission limit. The maximum nominal-rate residual remained below the separate 512-frame-plus-guards budget. These are service-admission limits, not calibrated hardware accuracy.

The median occurrence-to-arrived-right-anchor interval was **4.0430 ms**, p95 9.3713, p99 9.8587 and maximum 10.3632 ms. It describes the bounding anchor already available at mapping, rather than a separately added waiting stage. The 10.0417 ms mapping width was reported once and not added again as a fixed delay.

The composite `LatenessFrames` statistic compares the scheduled emission coordinate with the conservative mapped upper coordinate and the kernel's direct-delay guard. It also reflects the already-committed output frontier and prepared-kernel offset. It cannot isolate how much extra real delay was caused solely by conservative clock mapping. The actual device position within an admitted interval is unknown. The experiment therefore provides a bounded scheduling diagnostic, not a measured counterfactual clock-only penalty.

The nominal isolated/automatic submission median was **5.4977 ms**, compared with the historical fake-sink median **15.5493 ms**. The arithmetic difference is 10.0516 ms. Different fake and real scheduling conditions prevent treating that difference as controlled software latency removal. The fake median was a design comparison; this run supplies actual successful-release evidence instead.

## Endpoint position is later than submission

All 489 submitted first-nonzero frames had an observed endpoint-position crossing bracket. The lower and upper edges are separate distributions:

| Observation → endpoint-reported crossing | Count | p50 | p95 | p99 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Lower edge, ms | 489 | 34.9482 | 39.5743 | 41.4298 | 44.8183 |
| Upper edge, ms | 489 | 44.8447 | 49.5549 | 51.4258 | 55.4967 |

The median crossing-bracket width was 9.9971 ms and maximum 10.7322 ms. The p50 lower and upper columns do not describe one particular event. This evidence uses the endpoint's nominal-rate position/QPC correlation and the submitted frame coordinate. **Neither the approximately 5 ms submission median nor these position brackets establish physical headphone output, audibility or human input-to-ear latency.** No microphone, loopback or PCM-output recording was attached.

## Callback cost, continuity and nonzero PCM

| Measurement | Count | p50 | p95 | p99 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Complete measured callback work, ms | 2,805 | 0.0204 | 0.0346 | 0.0453 | 2.5571 |
| Steady callback fill work, ms | 2,805 | 0.0143 | 0.0268 | 0.0377 | 2.5502 |
| Callback-start interval, ms | 2,804 | 9.9999 | 10.6990 | 10.7080 | 10.7384 |
| Packet acquire call, ms | 2,806 | 0.0008 | 0.0013 | 0.0017 | 0.1880 |
| Packet release call, ms | 2,806 | 0.0007 | 0.0011 | 0.0014 | 0.1933 |
| Clock query, ms | 2,805 | 0.0009 | 0.0018 | 0.0026 | 0.1954 |

Measured callback allocation was **zero bytes**; no measured callback execution exceeded the 10 ms period. There were 1,375 callback-start intervals greater than exactly 10 ms, none over 20 ms. Those intervals describe scheduling jitter; crossing the nominal period alone does not establish a missed audio deadline. Ring underflow, empty-padding events and wake timeouts were all zero. MMCSS registration and reversion succeeded.

The 2,806 successful packets form a contiguous **1,347,456-frame / 28.072-second** output sequence, including initial prefill. Their gain remained one and release flags zero. Exact retained-input analysis found **2,656,764 nonzero Bati samples** within that submitted prefix, RMS 0.0336881 and peak 0.1677012. The ring and mixed peak counters both reached 0.1677012. The original 10,240-frame silent prefix and historical camera-related quiet intervals remain in the reference; those are not new ring underflows.

For each of the 489 submitted events, the retained first-nonzero frame matches the scheduled original kernel and was acknowledged by successful release. This establishes nonzero software contribution through the reviewed mixing path. It is not an independently captured waveform or proof that I heard those quiet contributions. All eight synthetic kernels retained their conservative peak limit of 0.001, with no gain, sound-bank or calibration change.

The managed-memory snapshot after cleanup was **49,938,872 bytes**, from `GC.GetTotalMemory(false)`. It is not peak memory, process working set, a collection-normalized figure or a leak test. No callback allocation, blocking operation, file IO, geometry preparation or heavy DSP was added for this run.

## My listening feedback

I said the bike sounded like a retained in-game ride and resembled an attempt from the previous day. I could not distinguish anything other than the bike and asked whether that was intentional.

The bed was the exact retained Bati recording, so its earlier driving character was expected. The synthetic events intentionally retained very low reviewed levels; that may explain my report, but neither masking nor their audibility was measured. My feedback establishes that I heard the bike. It does not establish that I heard individual shots/impacts, prove their absence, or independently certify uninterrupted playback or comfortable sound throughout. No further audition or level adjustment was performed.

## Supervision, postflight and preserved evidence

The stream interval from Start-after to Stop-before was **28.0470812 seconds**; event enable followed Start-after by 31.6681 ms. The supervisor observed normal completion in **28.8683228 seconds**, and the outer invocation returned successfully after 29.5795483 seconds. These remain distinct from the submitted-frame duration. No internal-limit failure, 35-second Stop request, late-exit flag or 42-second forced containment occurred. The final exit-verification allowance remained unchanged. These timestamps measure process/control actions, not independently observed acoustic silence.

Stop and Reset returned zero. Output, reader, producer, driver and CPU joins completed; Node and the native worker exited zero. Original-kernel-handle exit evidence, job close and process-handle close all succeeded. The supervisor receipt is complete and the outer invocation succeeded, so acceptance does not rely merely on parsing a JSON `passed` field.

Codex and a separate reviewer independently verified absence of all four original PID/creation lifetimes: invocation shell, native supervisor, native worker and Node. All 68 payloads, 63 sources, original inputs, compiler/Node and sealed approval files remain unchanged. The candidate now contains exactly the original 72 files plus its consumed marker and five expected result files. All 74 files in the previous consumed LATENCY-03 candidate also remain unchanged.

| Preserved evidence | SHA-256 |
| --- | --- |
| Raw real-endpoint result | `ac69bacc6d7f3bd42668aec103d9110521485d53848bcd3c15edc8e274d3f0f5` |
| Raw complete supervisor receipt | `4e87c4bcaec3af52cdbbe8ca294461fb367e5c128c79e989d1ce9b296c341aa8` |
| Independent fresh preflight | `f6999cb619ca44de236412ea96de45dcd212a97317034c04bcdb5588bd8b4279` |
| Independent postflight | `e990864de9f9f818e1837b5aa31b98461fb13b398161f77b0dc8090a7fff7c8c` |
| Independent corrected measurement analysis | `58539b1aa3c4fc9c21757060a82c27092684faa3549503ad6ebd39c402febfd0` |

The first analysis receipt remains preserved alongside its correction, which labels the one unaccepted startup row accurately and adds actual first-writable packet brackets. Raw results, unsuccessful overload events, listening feedback, historical failures and closed authorizations are retained privately. The public artifact contains aggregate measurements and evidence hashes, without raw device IDs, process identities, private paths or audio.

This publication changes documentation/evidence only. The completed offline regression/CI results remain applicable because all operational bindings are unchanged. PRs #76–#79, game files, acoustic-world work and ordinary gameplay defaults were preserved. No GTA/RPH launch, deployment, installed-map scan, recording, native suppression, source tuning, retry or merge occurred. This one-use authorization is closed; another endpoint attempt would require another reviewed candidate and fresh approval.
