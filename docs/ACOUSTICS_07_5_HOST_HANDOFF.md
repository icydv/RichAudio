# ACOUSTICS-07.5 — Host handoff and timestamp accounting

I've closed the device-free coverage gap through the **actual** C# host callback, bounded control queue, writer, child stdin, production Node producer/simulation worker, binary PCM framing, ring and credit return. I corrected two demonstrated accounting/attribution defects. This does not identify the historical GTA rejection, which occurred before this callback.

## Baseline, contract and implementation

My isolated branch starts at PR #54's verified open head `0a1bd0ad8838d1f656acc2680a476e263507e92c`. Earlier private matrices, binaries, approvals and result reports remain in their original worktrees. No historical result was rewritten.

I fixed the core matrix before running it: three normal sessions, one unexpected owned-producer exit, and one accepted-first/later-future-rejection session. Normal acceptance requires one strict connection, acknowledged Stop at both ends, positive Node acceptance, finite nonzero PCM, nonzero energy in both predefined windows, directional balance change exceeding 0.1 and bounded child/thread exit. Fault cases require terminal handling without reconnect or replacement producer. No endpoint result is inferred.

The harness is a separate executable entry point compiled with HostProgram's production code. A test-only partial class calls the same ListenerReceived, Enqueue, WriteControls, ReadBlocks, ReadDiagnostics, SendControl and ListenerEnded methods; it does not copy these implementations. Only child-process setup, wall-clock silent consumption and test lifecycle orchestration differ. The normal Windows entry point is never invoked; neither WasapiOutput nor LoopbackCapture is constructed. There is no device fallback.

Each host and synthetic publisher is a fresh process. The host launches the actual Node producer, including its simulation worker, with one harmonic source, open-road scene, required listener input, default 100 ms policies and no experimental orientation or virtual-clock flags. The production policy is **four initial PCM credits**, eight ring slots and 64 queued controls. Credits are returned only when the production ring releases a block. Gain remains 0.08 in this synthetic fixture; no live candidate gain was changed.

## Demonstrated age omission and correction

Previously the callback encoded the state, then sampled QueuedTicks. The writer forwarded the accepted receipt age plus queue wait. That omitted callback encoding time. My deterministic regression uses an observation at 1000 ticks (1000 Hz), an accepted age of 5 ms, 10 ms callback work and 20 ms queue wait: the legacy expression gives **25 ms**, while the real pre-write age is **35 ms**.

The queue now retains the original integer ObservationTicks. ObservationAgeAtWrite computes `max(0, (writeTicks - observationTicks) * 1000 / Stopwatch.Frequency)` at the writer's existing pre-format boundary. This includes callback and queue time once. It does not retimestamp observations, add an offset, widen freshness or clamp stale data into validity. The permitted small-negative input remains forwarded nonnegative; a 251 ms observation remains 251 ms. Protocol validation already requires the same C# clock frequency.

Queue wait remains separately measured from post-encoding QueuedTicks. Forwarded counts now advance after successful WriteLine/Flush, rather than before the write. Bounded receipt records describe the sampled **pre-format/pre-write age**, not completion or Node receipt. Maximum write duration and queue high-water counters are separate measurements. Formatting, blocking write/transit and Node scheduling remain outside that sampled age. Node keeps its own monotonic receipt/queue clock; C# QPC and Node performance.now origins are not equated.

Corrected age can intentionally change presentation of delayed observations. No recordings were normalised or time-shifted to hide that change. Existing deterministic Node PCM fixtures remain unchanged because no renderer code changed.

## First-frame and terminal attribution

PR #54 overwrote FirstFrame.DecisionAgeMs/AgeClass on a later freshness rejection, mixing the first frame's durations with the offending frame's age. A regression now accepts a valid frame, retains its timing, sends a future-dated frame through StatePublisher, and verifies the original record remains within-bounds while a separate bounded OffendingFrame holds ordinal, signed age and classification.

The publisher now carries copy duration alongside its latest-value copied state. A replacement before transmission therefore cannot attach the first publication's copy duration to a different frame. FirstPublishedSequence and FirstTransmittedSequence are distinct; the latter is recorded after write completion, separately from acknowledgement. First-frame sequence is retained on sender and receiver records. A regression publishes sequences 0 and 1 before Start and verifies publication 0 versus transmission 1. No listener wire fields changed.

## Measured sessions

Sanitised individual results are in `evidence/acoustics07-5-host-handoff.json`.

- All three final normal sessions accepted, forwarded and acknowledged **84 observations**, with one connection each, and completed acknowledged deliberate Stop.
- Actual Node final records independently report listener consumption and zero rejected envelopes. Transport acknowledgement alone is not counted as Node acceptance.
- The normal silent outputs were finite and nonzero, with peak approximately **0.00304336** at the fixture gain. Balance `(R-L)/(R+L)` changed from approximately **-0.984 to 0**, with nonzero energy in both fixed wall-clock windows (1.5–2.1 s and 3.0–3.6 s). A zero balance here is measured centre presentation, not missing sound.
- The owned Node exit case retained **Unexpected producer EOF**; the sender failed without retry and all owned threads/processes exited.
- The later-rejection case accepted the initial stream, then retained a separate future-dated offending frame. The host's existing terminal handler stopped silent consumption, the sender failed without retry, and no replacement producer was launched.
- Final local cases recorded **zero missed sink block budgets and zero ring underflow frames**. Ring high-water was four; queue high-water was at most two. These observations certify neither WASAPI reliability nor hard real-time performance.

The first exploratory sink used Thread.Sleep(1). Windows timer granularity caused it to miss most intended 10.667 ms consumption budgets. Those results remain private and are not reported as correctly paced runs. I corrected only the test sink to yield with Sleep(0) while checking its monotonic schedule, and strengthened the check that both stereo windows contain energy. The final sender also schedules observations against a 50 ms monotonic cadence. This bounded yielding harness can consume substantial CPU; CPU/wall costs are retained in the evidence and it is not a proposed playback backend.

No artificial queue-stall case was added: the deterministic callback/queue regression establishes the omission, and measured normal queue/write costs were small. Failure evidence is the actual first boundary observed, not a tuned Node freshness outcome. A killed producer cannot produce its normal final record; Node-consumed counts in that case remain unknown rather than invented.

## Reproduction and validation

```powershell
./tools/Test-HostHandoff.ps1 -Output .local/handoff-new
./tools/Test-BeaconTransport.ps1
./tools/Build-AcousticsHost.ps1 -Tests
./tools/Build-BeaconBridge.ps1 -SdkPath <authentic-pinned-SDK-path>
./tools/Test-Offline.ps1
```

Use a fresh ignored output. The harness rejects overwrite/reparse destinations, never plays PCM, and kills only its owned test children if their lifetime bound expires. Detailed receipts, Node diagnostics and numeric results remain private. The normal host cap and transport deadlines are unchanged; test-process lifetime limits are separate safeguards.

Focused tests pass **69 transport cases** and **648 host assertions**. The authentic pinned-SDK bridge compiles with shared diagnostic changes. The registered offline runner includes this five-case handoff matrix and the existing acoustic/producer/reference tests. Hosted CI and actual generated-merge checkout/tree verification are recorded in the draft PR. Publication screening excludes all private outputs and binaries.

## Preservation, limits and readiness

No acoustic solver, reflection, material, Doppler, history, startup, fade, listener policy, prediction, freshness, beacon, RPH camera getter, build guard or WASAPI implementation was changed. Strict one-attempt/one-connection, one-use activation, acknowledged Stop and fail-closed behaviour remain enforced. Production queue/scheduling code has device-free coverage; Windows device timing and GTA scheduling do not.

ACOUSTICS-07.3 remains an **executed failed clean-session validation**. The original signed age remains unavailable, and the downstream accounting fix cannot directly explain a pre-callback rejection. PR #49's earlier unidentified rejection also remains unexplained. Audible startup and acknowledged Stop remain unvalidated live.

I did not launch GTA/RPH, deploy anything, change the game installation, open/probe an endpoint, play/capture sound or create/reuse a live approval. Experimental orientation remains OFF; the combined ACOUSTICS-05 + BENCHMARK-01 record remains **60%**.

The instrumented candidate can now be reviewed for one separately authorised supervised validation, subject to its final hosted checks and ordinary candidate/deployment review. That assessment is not approval and starts no new test.
