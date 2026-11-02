# LATENCY-02: device-free measurements and limits

I now have a bounded synthetic transient path that avoids the continuous vehicle history and PCM FIFO. Codex measured it with the existing acoustic renderer, native ring and an authored fake output clock. **No actual WASAPI submission, device-period query, speaker latency or GTA event timing was measured.** The existing live event route remains disabled.

The implementation is on a separate branch based on PR #77 at `d8f82c578d3819569b2e7d198fc469e6517a86b4`. The native late-mix/timing implementation is `84af203`; continuous timing is `b364d3f` plus the authored-only qualifier/clock correction `51efefe`. My PR #76 results, PR #77 branch, consumed live approvals and original retained assets remain separate.

## Synthetic event submission

The native fixture uses eight prepared original impulse kernels from the actual `CausalSimulation`/`StreamingRenderer`. It covers conditional unknown/open space, wall/passage reflections, a qualified alternate camera generation and concurrent impacts. The continuous bed is the **unscaled previously retained final RichAudio PCM**, decoded from its unchanged 33.212 s private recording. It is not a new recording or concurrent live Bati synthesis. A separate genuine-bank producer/ring test is reported below.

The deterministic fake endpoint has an explicitly authored 22 ms capacity and nominal 10 ms opportunities. The host fills the same production ring and mixes events only after the continuous samples leave that ring. `CommitSubmission` is an explicit fake acknowledgement, not a measurement of `ReleaseBuffer` or presentation.

| Scenario | Submitted / sent | Observation → fake submission, median / p95 / p99 / max |
| --- | --- | --- |
| Automatic-fire cadence plus impact groups | 152 / 152 | 4.900 / 9.300 / 9.600 / 9.800 ms |
| Authored 0–4 ms callback jitter | 152 / 152 | 5.100 / 9.833 / 9.967 / 9.967 ms |
| Additional 18 ms ingress contention | 152 / 152 | 22.867 / 27.700 / 28.633 / 28.633 ms |
| Deliberately excessive impact/priority load | 860 / 2,812 | 5.000 / 9.833 / 9.967 / 9.967 ms, **submitted events only** |
| Real Node/native pipe, nominal machine scheduling | 80 / 80 | 15.549 / 16.168 / 16.501 / 16.501 ms |
| Real pipe plus two background CPU workers | 80 / 80 | 15.732 / 16.152 / 16.553 / 16.553 ms |

No nominal/jitter/18 ms ingress case or either actual-pipe arm has continuous underflow, device starvation, callback fault or voice-capacity rejection. The overload arm preserves continuous PCM: 1,952 events never reach first submission because of voice capacity, while 167 of the 860 acknowledged onsets later have their tails evicted. Tail eviction truncates low-priority sound; it is an explicit continuity trade-off, not a production-quality overload policy. These first-submission percentiles are not a successful 2,812-event latency guarantee. The functional test separately verifies high-priority admission while the normal descriptor lane is full. High traffic cannot bypass bytes already on the shared event pipe.

The automatic-fire schedule advances every 61.7 ms, with one/two/four-event groups. The actual-pipe sequence sends 80 events at a nominal 32.7 ms cadence, cycling prepared scene/source slots. These are original authored impulses with fixed source/listener poses and explicit generation changes, not acquired weapon shots or moving gunshot Doppler validation.

The two actual-pipe tests use real QPC timestamps and process IO, but their sink still uses the authored frame clock. Its sleep-paced target is 10 ms; observed callback intervals have medians around 15.276/15.268 ms, p99 16.264/16.246 ms and minima around 0.019 ms during catch-up. A measured 10 ms hardware period is **not** inferred. The background load is two below-normal-priority square-root workers, not actual GTA fiber contention or execution of the static-world loader.

## Onset, uncertainty and processing cost

The actual-pipe authored frame model places first event output about 22 ms after the authored occurrence (median), even though its fake submission happens around 15.5 ms after observation. Median extra software onset lateness is approximately 12.0 ms and p99 approximately 19.1 ms across mixed-distance kernels. Direct distance is included exactly once; whole-kernel late shifts preserve the additional reflected travel distances. These values describe different boundaries and must not be added together.

The synthetic timestamp interval is exact by construction. Functional controls separately test nonzero uncertainty, excessive timestamp width, future/stale events, wrong generations/sessions, duplicate IDs, expired lateness, cancellation and mutable-receipt rejection. Real event clock uncertainty remains unavailable. An exact authored timestamp is not evidence that a native getter or RPH notification offers one.

| `Fill`/mix work only | p99 / maximum |
| --- | --- |
| Deterministic nominal, including cold first use | 0.0171 / 2.6782 ms |
| Deterministic callback jitter | 0.0154 / 0.0187 ms |
| 18 ms ingress delay | 0.0150 / 0.0180 ms |
| Excessive impact load, bounded to 32 voices | 0.0478 / 0.0514 ms |
| Actual pipe nominal | 0.0341 / 0.7468 ms |
| Actual pipe with background workers | 0.0360 / 0.1160 ms |

All eight arms have zero measured `Fill`/mix work overruns against the declared 10 ms fixture budget. This excludes fake commit, producer refill and fixture bookkeeping; it does not prove hardware callback deadlines. Deterministic per-thread counters measured zero managed bytes in the `Fill`/mix region. Allocation was not measured in the actual-pipe arms. The separate IL scan covers listed application helpers, not arbitrary BCL/JIT behavior.

Managed process snapshots range from roughly 28.9–33.9 MB across this ordered run, including retained PCM, previous banks, receipt arrays and harness storage. These are neither peak RSS nor isolated event-bus memory. The actual immutable kernel payload is 524,288 bytes; the declared eight-kernel maximum is 1,536,000 bytes. The voice, queue and lifetime-ID limits remain fixed.

Negative controls are deliberately unsuccessful audio conditions: a 40 ms device-scheduling stall detects 1,344 starved modeled endpoint frames; a 140 ms continuous-producer stall detects 192 ring-underflow frames. Each stops instead of silently resuming or using transient sound to conceal missing vehicle PCM. Their acknowledged-onset percentiles describe only the interval before failure. The raw device-stall snapshot contains one pending event before terminal drain; `FinishCancellation` subsequently succeeds. That measurement-end pending count is not an assertion of failed cleanup.

## Continuous Bati response and the remaining queue

Codex also prepared two fresh private fixture copies from the original reviewed Bati package, rehashing all retained bindings before and after copying. The default and 75 ms arms used the same `camera-source-01` continuity policy, gains, banks, settings and authored 120-value 20 Hz stationary/rev/moving schedule. Real Node source generation, `RA07`, native credits and the production ring ran into the existing device-free sink. No recorder or endpoint was enabled.

| Current genuine-bank fixture | Default 100 ms / eight credits | Reviewed 75 ms / eight cold, six steady |
| --- | --- | --- |
| Newer **authored pose** age at fake submission, median / p95 / p99 / max (76 samples) | 155.403 / 172.434 / 187.065 / 187.668 ms | 126.329 / 154.413 / 159.288 / 168.346 ms |
| Ring residence, median / p95 / p99 / max | 72.476 / 88.930 / 91.642 / 93.112 ms | 55.403 / 62.195 / 76.539 / 93.004 ms |
| Mean ring residence | 71.113 ms | 51.196 ms |
| Qualified six-credit steady mean / median | Not selected | 49.970 / 55.109 ms |
| Cold enable → first nonzero status | 1,427.603 ms | 1,423.860 ms |
| Underflow / source creations / missing history / clipping / limiting | 0 / 1 / 0 / 0 / 0 | 0 / 1 / 0 / 0 / 0 |
| Reported source-worker deadline misses / maximum processing | 1 / 26.500 ms | 1 / 27.107 ms |
| Worker RSS snapshot | 184,975,360 bytes | 192,864,256 bytes |

This pair's ring-median reduction is about 17.1 ms; its newer-pose-age reduction is about 29.1 ms. Ring residence is already included in the pose age, so these are not additive. Actual cold process/clock phases differ; the earlier [LOW-LATENCY-01 report](LOW_LATENCY_01.md) preserves other pairs, including a worse cold-age result. This is not a reproducible claim of a fixed 29.1 ms native or audible saving.

These ages use **authored pose observations**, not the historical live native operating acquisition intervals. The live native baseline remains approximately 146/204 ms, including 62.695 ms ring residence. The newer median <100 ms and mean ring <30 ms targets remain unmet here. All-render cost percentiles are available for the separate stationary source experiment; this actual-chain status records a maximum and count, not unrecorded cost percentiles.

Under four CPU workers with the owned harness/host/Node constrained to two cores, both profiles fail with 64 ring-underflow frames and terminal `Producer starvation`. Affinity/workers are restored/joined before teardown. This is retained failure evidence, not a successful adverse-load acceptance. Reducing reserve further has no evidence-backed safety case from this test.

The actual-chain pair precedes the final authored-stationary-only lease/clock hardening; that option was not selected in either arm. The final stationary benchmark and regressions bind its exact hardened source separately. No historical receipt was overwritten to make its source pins appear current.

The newer stationary control option has a narrower result: first source-control departure is 29.333 → 5.333 ms median on a positively declared stationary authored world, about 24 ms at that control boundary. The unchanged source smoothing, acoustic travel time and queues follow it. The safe arrived-only 50 ms camera experiment worsens near-silent windows to approximately 108 ms and is rejected as an upgrade. See the [complete continuous evidence](LATENCY_02_CONTINUOUS_TIMING.md), including jitter/omission costs and the distinction between first departure and reaching the exact control value.

## Provenance, reproduction and review

[Sanitized timing evidence](../evidence/latency-02-timing.json) retains full percentile objects, source/Node hashes, counter scopes and the failing arms without private recordings, coordinates, paths or process identities. Its final native timing validation is `5b26b723cb7c22d3ec83d7e4bafa7be41baab19bfb430f431b6ddfe8660ae1eb`; the raw timing JSON is `3bdca77ae8c46bf0761a424f83c00352204df92e0faaae652b16053535ca0fd6`. The retained WAV hash remains `e86d54d9f305b24dd86264d456f3f8786e741c0aaaaeab42a82bd70016a021fe`; its decoded interleaved PCM hash is `9114d699cdc0a0188e5f73cc2618bc6672219c292f7e2f0748d4a157ecec3c0c`. Native event/callback percentiles select sorted index `ceil((n−1)×q)`; the existing Bati/continuous tools retain their documented interpolation conventions. These groups are not pooled.

An independent reviewer checked all 17 native/worker/preparation source references, Node executable/version, payload and retained audio hashes, clock math, callback boundaries and the literal-null live integration. The earlier native review receipt is `70f7334a9c16c5f7a8baefac357b7c437243c448d7fefafc46a647db9805c831`; a final per-event review binds the corrected harness in the adjacent evidence. The timing harness correction is `2aaf8ad`: an acknowledged onset remains counted even after later tail retirement, and private rows plus explicit QPC frequency retain the underlying CDF data. Earlier survivor-status summaries stay preserved as historical outcomes. Independent acquisition, Node implementation/transport, documentation and continuous-control reviews are also recorded there. Review is offline evidence, not live approval.

For an original-only reproduction, run `node tools/Prepare-TransientEventFixture.mjs --output <fresh-private-output>` and then `pwsh -NoProfile -File tools/Test-TransientTiming02.ps1 -Prepared <preparation.json>`. The default continuous bed is an original sine; `-RetainedPcm <private-final-PCM-WAV>` explicitly selects the unchanged retained signal. The tool verifies the prepared bank, executed worker dependency closure and Node before/after execution, and emits a new receipt. It has no endpoint, game or native event path. Quantitative results depend on scheduling; previous outputs remain preserved.

The expanded `tools/Test-Offline.ps1` passed, including the new continuous/acquisition/kernel tests, actual bounded Node transport, native bus controls, existing waveform/source-history, native host, transport, device-free recording and geometry regressions. The complete 72-file Node test run then finished with **779 cases: 775 passed, zero failed, four skipped**. Those four require older private catalogue/NPC report inputs; the eight genuine-package gameplay tests and all new LATENCY-02 cases ran. The original-ring oracle passed 69,087 checks across 16 exact-original scenarios and 64 queue explorations. Native camera controls passed 11 cases/37 assertions, and cancellation controls exercised 16 concurrent rounds. These groups overlap and should not be added into one invented test total. CI status is recorded on the draft PR; original-only CI does not possess my private source banks or retained recordings.

Early exploratory receipts, the broad test-discovery failure and missing-build-prerequisite outcomes remain in private logs. Discovery initially selected command-line fixtures requiring arguments; a legacy hash check also encounters this worktree's materialized CRLF evidence. The original preserved checkout's ten acceptance checks pass unchanged. No sealed evidence was normalized or repinned. Correct harness runs build their prerequisites and keep optional private-data absence separate from an executable failure.

My next live boundary remains [freshly reviewed controlled Bati A/B validation](LATENCY_02_FUTURE_VALIDATION.md). The event target of 20–30 ms is supported only as a **device-free synthetic submission experiment** here. Actual event observation → WASAPI submission and total input-to-ear timing remain unverified.
