# First Bati underflow: credit delivery and fixture cadence

I want the direct Bati prototype I heard to survive its intended listening window. Codex retained the failed timeout/underflow populations and corrected two demonstrated mechanisms without changing synthesis, thread priorities, gains, source mapping, buffers, prefill or the status watchdog.

## Evidence before correction

The old 64/192-frame duration failures occurred while the fixture was still publishing authored observations: its error path rejected a fresh frame inside the active loop, before its deliberate-stop call. The periodic 89.635-second sample alone did not establish that boundary. The original records lacked the callback/credit history needed to identify the exact first shortfall.

One bounded first-underflow diagnostic now freezes the latest 128 metadata events in memory. It associates Node output, pipe reads/admissions, credit return/send and sink requests by block sequence and host QPC; Node milliseconds are not subtracted from host QPC. At the first actual ring shortfall it retains source validity and stop state. It writes one private `first-underflow.json` only outside the callback path during finalisation. It captures no PCM, allocates no growing event queue and does not run on the WASAPI callback.

The controlled and instrumented results distinguish two issues:

1. **Device-free catch-up burst.** A deliberately delayed callback resumed about 102 ms late. The old absolute schedule then issued five 960-frame requests in about 0.07 ms, emptying the ring before the control worker/producer could be scheduled. The fifth callback supplied zero frames. Stop intent was false and the source lease still had about 169 ms remaining. This was a fixture scheduling error, not evidence of slow synthesis.
2. **Production credit-return dependency.** After the fixture cadence correction, the instrumented duration run still failed with 64 missing frames around 52 seconds. The last returned/sent credits preceded the underflow by over 76 ms; the last admitted block was 4932 and the first missing frame was exactly the start of block 4933. Callback requests continued, but no further credits returned while the ring drained from 3,776 to 896 frames. Stop intent was false and the source lease had about 184 ms left. That trace establishes the credit-service shortfall; it does not retrospectively identify the precise filesystem call in the earlier uninstrumented runs.

A focused control then held the host's status-publication phase for 120 ms. The bounded trace showed `status-start` without completion, no subsequent credit return, continued consumption, and an 832-frame active underflow. Observations remained fresh. The main loop was responsible both for synchronous settings/status I/O and for returning consumed ring slots to the producer. This coupling is the demonstrated production weakness.

## Narrow corrections

Credit return now runs on the **existing control-delivery worker** before it sends credits and observations to Node. No thread or queue was added. The same one-way credit-window reduction still applies; ring capacity, startup reserve and credit counts are unchanged. Status/settings I/O can no longer withhold credit return merely by occupying the host main loop. A genuinely blocked/dead producer still retires safely.

The device-free sink now explicitly defers missed callback periods instead of consuming an unbounded backlog instantaneously. Ordinary sub-period jitter retains its scheduled phase. Deferred wall time is reported separately and is not counted as rendered audio or hardware underrun qualification. This changes only the fake sink; it does not alter WASAPI cadence or production latency. A no-supply control still reports fatal starvation with the original ring capacity.

The duration fixture verifies **consumed active output frames**, not only elapsed wall time. It requires increasing nonzero engine/exhaust/stereo counters, checks session publication health using the host's compatible monotonic publication timestamp, records deliberate stop intent, and checks the stopped terminal status and first-fault receipt. It no longer uses the racy `GetLastWriteTimeUtc` query for its publication assertion. Unexpected retirement cannot be counted as intentional shutdown. Terminal underflow is retained separately from active underflow.

## Focused outcome

| Check | Result |
| --- | --- |
| Cadence, jitter, delayed-callback and real-starvation contracts | Passed; original 8 × 512-frame capacity retained. |
| Same injected callback delay after fixture correction | 20.820 seconds verified active output; zero active/terminal underflow; about 94 ms deferred fixture time reported explicitly. |
| Same 120 ms publication stall after credit correction | 20.960 seconds verified active output; zero active/terminal underflow; clean stop. One 12.393-ms hard render miss was retained. |
| Final actual runtime/host/Node chain | **90.240 seconds verified active output**, continuing nonzero engine/exhaust/stereo; zero active and terminal underflow; no fault/retirement before deliberate stop. |
| Final duration timing | Maximum complete render 9.420 ms; zero 10.667-ms hard misses; two 8-ms headroom misses. No fixture-clock deferral was needed. |
| Publication withdrawn while PCM remains supplied | Existing watchdog retired safely and preserved the first fault. |
| Node producer terminated | Safe retirement, original `producer ended` evidence, bounded closure and no revival. |

All owned test processes joined; an independent scoped process probe was empty. The failed intermediate duration run and all original failures remain retained. The successful full-duration run followed the credit-owner correction; Codex did not repeat an unchanged failing build until it passed. These are authored, device-free contracts, not GTA frame-time, physical latency or live output guarantees. The earlier live native completion/FIFO-drain limitation remains unchanged.

Raw evidence is under `.local/playable-15/first-underflow01`, with the intermediate wrapper run under `.local/playable-15/runtime-health-e75f713587c645789c9d6f8db1d64716`. The updated focused runner is `tools/Test-BatiRuntimeHealth01.ps1`.

## Next manual-arming boundary

The checkpoint is suitable for proposing one new controlled manual-arming Bati listening session. It combines the already corrected Bati status watchdog with the rebuilt host containing this credit-delivery correction. Direct engine/exhaust, camera-relative sound and airflow remain the purpose; stock GTA audio remains enabled and genuine building reflections remain disabled. No live approval is implied by the offline result.

Only affected components are rebuilt. Unchanged private package payload can be linked into the successor's new private package without reading proprietary bank bodies; their retained hashes and file identities remain bound, and a complete body-hash preflight is mandatory after fresh execution approval. The installed baseline is likewise retained, not freshly read during this task. No successor may deploy or launch before approval of its exact new scope. Earlier attempts remain consumed. Unrelated `Build-Menu02.ps1` work is preserved.
