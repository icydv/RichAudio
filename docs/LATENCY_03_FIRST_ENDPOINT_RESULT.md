# LATENCY-03: my first real endpoint attempt stopped before the transient phase

**Result: experiment and audio acceptance FAILED; independent postflight restoration PASSED. The single approval is consumed. No retry occurred.**

I approved exactly one endpoint-only attempt of the private candidate prepared at PR #79 head `62886953077efb374ac5f5c1c3340724da852d15`. Codex invoked its copied, unchanged helper once after an independent preflight and my explicit confirmation of Headphones — Astro A50 Game at a comfortable listening level. Windows volume and default-device preferences were not set or changed.

The real shared-mode endpoint opened and accepted six PCM packets. The clock qualified briefly, then rejected a position/time pair before the first two-second event slot. **None of the 526 planned synthetic events was observed, authored, admitted or submitted.** Direct inspection of the unchanged reference WAV confirms that all 3,456 submitted frames were its initial zero-valued prefix. No nonzero Bati or transient PCM was submitted. This attempt therefore establishes neither audible Bati continuity nor real transient responsiveness.

The worker reported successful Stop/Reset and joins. A separate supervisor exit-code exception prevented `supervision.json` from being written. Codex preserved this incomplete evidence and performed the required independent manual postflight rather than treating helper exit as a cleanup pass.

## Exact approval and preflight

| Binding | SHA-256 |
| --- | --- |
| Authoritative private proposal | `0cfcb4577178186ef41e493bb660aa29ebce69956782c980e5d998b1818b2c79` |
| Independent exact-candidate review | `bb3cc1f50fcab2bb0e60e7bf1455331c2e79b1518c4a45685ebf318a951c6c36` |
| Candidate manifest | `58f92cdc399a86e86e70587f6124cb837eaa82d604e86c7ec327b05296640432` |
| New independent execution preflight | `d70696ceb71e2d0e185c7fb2931b87aa2ebc4f3548d8a22dcd33b0cfbc6fdd6b` |
| New independent manual postflight | `263f084c1d95c18099ec39591d7e11d470845a81da192904996031a498b7a0ec` |
| Independent retained-result analysis | `ef482487aadbd60fe1ad98883859fe7133ccb707ed1d5a949a1fd536ff45caba` |

The verifiers checked the exact private bytes, all 65 payload lengths/hashes, 60 source/current/copied/Git bindings, original/copied Bati PCM, original recording metadata and historical endpoint identity, compiler/Node binaries and source-review receipts. The exact implementation tree was clean. Earlier attempt/result/worker claims and forbidden processes were absent. Current device-free `--validate` confirmed QPC/allocation instrumentation and all 526 planned fixtures; it opened no endpoint and consumed no attempt. The complete earlier local regressions and exact-head CI remained passed. No artifacts were regenerated or substituted.

The actual attempt retained 48 kHz stereo Float32, gain 1, the original eight-block ring, unchanged period initialization and the approved synthetic bank. No GTA/RPH, deployment, installed-world access, native suppression, microphone, loopback or output recording was involved. Ordinary live gameplay and acoustic-world implementation were not edited.

## What the endpoint actually reported

`IAudioClient3` was exposed. Supported-period and current-period queries both returned `S_OK`; default, fundamental, minimum, maximum and current period were **480 frames / 10 ms**. The current-period query preceded initialization. The current-format snapshot was read by the candidate but not serialized, so it is unavailable in the retained report. The experiment requested no smaller period and did not switch or reinitialize an endpoint.

The original shared initialization returned `S_OK`. Endpoint buffer size was **1,056 frames / 22 ms**; the reported device period was 100,000 units of 100 ns. Reported stream latency was zero, which is not a measured zero-latency physical output. Callback padding was 576 frames / 12 ms in all six retained callback rows; the prefill packet had zero padding. MMCSS registration and reversion succeeded, with error code zero.

## Clock rejection

The device frequency was 384,000 position units/second and QPC frequency was 10,000,000 ticks/second. Position units were converted using that reported frequency rather than assumed to be audio frames. Six clock queries returned `S_OK`: one initial zero position, four accepted positive samples and one final rejected sample. The event gate enabled 24.8406 ms after `Start` returned; Stop began 26.6483 ms later.

The final pair advanced 3,840 device units, representing **10.0000 ms**, while its correlated QPC values advanced **10.7013 ms**. The absolute residual was **0.7013 ms**. `Latency03PresentationClock.Observe` permits `(previous.UncertaintyFrames + current.UncertaintyFrames) / 48000 + 2 / QpcFrequency`, which was **0.0418667 ms** for this pair. Earlier guards pass for these retained rows; this identifies pair-consistency rejection **reason 4**. The worker then recorded `sessionFailure=Clock` and cancelled before any event.

This locates the failed qualification rule. It does not isolate device timestamp granularity, driver behavior, position latching or OS scheduling as the sole cause. Recorded per-query uncertainty estimates were nine frames for the initial zero sample and one frame thereafter; the failing pair shows they cannot be promoted to a validated ongoing clock-mapping bound. No threshold was relaxed, no future position was extrapolated and no invalid mapping was accepted to keep the experiment running.

## Measured packet and scheduling costs

Values below are actual retained QPC measurements in milliseconds. Percentiles select sorted index `ceil((n-1) * q)`. With only five or six samples, p95/p99 equal the maximum; these are short startup observations, not steady-state or adverse-load distributions.

| Actual stage | N | p50 | p95 | p99 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| PCM `GetBuffer` call | 6 | 0.0009 | 0.1910 | 0.1910 | 0.1910 |
| PCM fill, including pre-start prefill | 6 | 0.0079 | 3.1600 | 3.1600 | 3.1600 |
| PCM `ReleaseBuffer` call | 6 | 0.0008 | 0.1815 | 0.1815 | 0.1815 |
| Acquire-call start → successful release end | 6 | 0.0096 | 3.5330 | 3.5330 | 3.5330 |
| Writable-buffer access → successful release end | 6 | 0.0088 | 3.3420 | 3.3420 | 3.3420 |
| Post-start PCM fill only | 5 | 0.0078 | 0.0108 | 0.0108 | 0.0108 |
| Recorded session callback bracket | 6 | 0.0206 | 1.6140 | 1.6140 | 1.6140 |
| Completed legacy output-loop work | 5 | 0.0171 | 1.8568 | 1.8568 | 1.8568 |
| All callback-start intervals, including terminal callback | 5 | 10.0003 | 10.7004 | 10.7004 | 10.7004 |
| Device-clock query call | 6 | 0.0015 | 0.1803 | 0.1803 | 0.1803 |

The six packet rows include one 1,056-frame pre-start prefill and five 480-frame post-start packets, all successful non-SILENT releases. The 3.160 ms fill is prefill, outside the timed event-loop callback. The session callback bracket excludes its own diagnostic bookkeeping; the separate completed-loop timer includes additional work but omits the terminal failed-clock iteration. Its legacy wake array also includes an initial 0.4569 ms wake and omits that terminal callback; its different maximum must not replace the complete callback-start intervals above.

Recorded callback allocations were **zero bytes in all six rows**. Ring underflow, empty-padding events, wake timeouts, fill exceptions and release exceptions were zero. No explicit deadline-miss counter was retained. This short, all-zero-signal run cannot establish uninterrupted nonzero vehicle output, allocation behavior during event mixing, starvation immunity, CPU/jitter tolerance or tail survival.

Managed memory after cleanup was **39,017,160 bytes**, from `GC.GetTotalMemory(false)`. Peak managed memory, OS working set and peak process memory were not measured. The job's 1,024 MiB limit is containment, not measured usage. No source-observation ages or PCM ring-residence distribution were measured from this prerecorded bed.

## Event timing: unavailable, not zero

| Planned phase | Planned | Observed/authored/admitted/submitted |
| --- | ---: | ---: |
| Isolated shots | 6 | 0 |
| Automatic cadence | 64 | 0 |
| Bursts | 128 | 0 |
| Overlapping impacts | 160 | 0 |
| Transport jitter | 40 | 0 |
| Bounded CPU | 64 | 0 |
| Intentional overload | 64 | 0 |
| Total | 526 | 0 |

All phases were unreached. There were no observed events lost in transport, no actual admission/overload rejections, no acknowledged onsets, no completed event windows and no capacity-truncated tails. Zero counters do not validate those paths. The 462 ordinary planned events and 64 overload fixtures must not be presented as 526 transported events dropped by WASAPI.

Observation → transport/admission, observation → first writable output frame, observation → successful WASAPI submission and observation → endpoint-position crossing have **N=0**. Their p50/p95/p99/maximum values are **unavailable**. The approximately 15.5493 ms LATENCY-02 fake-submission median consequently has no actual transient counterpart to compare against. Packet-copy costs above are not a substitute. Physical speaker and input-to-ear latency were not measured.

## Failure cleanup and process evidence

The stream's `Start`-return → Stop-call interval was 51.4889 ms. Its enclosing Start-before → Stop/Reset-after bracket was 53.3451 ms; these are API/QPC boundaries, not measured acoustic duration. The helper returned failure after 1,212.0381 ms, which encloses worker startup and cleanup. Six packets represent 72 ms of submitted PCM, not proof that all queued frames reached the endpoint position before Reset. The first nonzero reference frame is 10,240 / 213.3333 ms, beyond every submitted packet.

The worker reports Stop and Reset `S_OK`, joined output/reader/producer/authoring/two CPU threads, Node exit code zero, and completed event cancellation/cleanup. The supervisor then threw `InvalidOperationException` in `Process.get_ExitCode`: “Process was not started by this object, so requested information cannot be determined.” The bound job helper returns an ID-associated `Process` after unmanaged child creation; the retained stack and source locate the failing exit-code read. The supervisor's independently captured native-worker exit code and its complete `supervision.json` remain unavailable. No replacement supervision receipt was manufactured.

The planned 30-second internal limit, 35-second stop-request and 42-second containment thresholds were not reached. No stop-request marker exists. This early return does not validate their behavior under a long stall. On unwinding, the reviewed job's disposal path closes containment; actual lifetime absence was separately checked rather than inferred from that source path.

Codex and the independent postflight verifier checked the original supervisor, worker, Node and invocation-shell **PID plus creation-time lifetimes**, all absent, and found no remaining candidate-path or forbidden game/host process. All 65 payloads, 60 source bindings and original inputs retained their approved hashes. `attempt-consumed.json`, admission/claim files and raw results remain preserved. Independent restoration passes; experiment/audio acceptance and complete supervision evidence do not.

Twelve original result/invocation files are hash/length pinned privately, including the supervisor stderr and failed helper return. The [sanitized actual evidence](../evidence/latency-03-first-endpoint-result.json) retains counters, distributions and receipt hashes without endpoint IDs, session tokens, PIDs, private absolute paths or proprietary audio. No subjective listening report is inferred from the silent submitted prefix.

## Next boundary

My next required work is offline reproduction of this exact failed clock pair and the supervisor process-handle/exit-code contract, with evidence-backed corrections and regression coverage before preparing any replacement candidate. A changed operating artifact requires a new independent review, exact proposal and fresh approval. This consumed candidate cannot be repaired or replayed under my approval. No further endpoint experiment, launch, recording or merge is authorized by this result.
