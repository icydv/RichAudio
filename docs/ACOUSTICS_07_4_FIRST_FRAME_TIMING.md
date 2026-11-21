# ACOUSTICS-07.4 — Offline first-frame timing

I've added a device-free, fresh-process transport matrix and bounded first-frame diagnostics. I have **not established the historical GTA failure's cause**, and I have not added speculative warmup or changed runtime acceptance behaviour.

## Baseline and declared matrix

My isolated branch starts at PR #53 head `90b4342e5e9c579a8f65f368bf40a1798ccbb265`; the failed runtime source remains `e08ad31d1822b052af169741476d94301b062e21`. The earlier launcher failure and subsequent executed strict-session failure remain separate historical records. I preserved private evidence and binaries in their original worktree.

Before instrumentation I fixed a matrix of cold/cold, warm/cold, cold/warm and warm/warm sender/receiver states, three independent process pairs each. Each executable process loads production StatePublisher, StatePipeServer and codec directly; no preceding schema suite runs in those processes. Warm conditions explicitly discard one local synthetic Frame/Decode roundtrip before starting transport, without seeding a validator or connecting. This is fresh-process initialization, not a cold-machine test.

The unchanged transport completed all twelve pairs with acknowledged Stop and one strict connection each. An additional unchanged matrix was retained after an unavailable Python command prevented instrumentation from being applied; it is not represented as an instrumented result. The subsequent instrumented twelve-pair matrix also completed every pair. No failed trial was retried. Original synthetic observations are generated after process startup at approximately 20 Hz for 600 ms; no timestamp is created before launching processes. Readiness files, process waits and child cleanup are bounded. Only owned test children may be terminated on harness failure.

## Actual first-frame path and coverage gap

The publisher checks age **before** Frame/Encode. Subsequent encoding and scheduling remain part of the first-frame budget. The receiver captures its freshness decision clock **after** decoding, then executes the callback and acknowledgement. The production host callback re-encodes and queues the observation; its queue writer later wraps and writes child stdin. Existing transport tests warm codec roundtrips before strict connection tests, so they did not measure this fresh-process path.

My harness callback performs the same production EncodeJson operation and retains its length. It does **not** execute the exact Windows host control queue, anonymous-pipe writer or Node consumer. Its acknowledgement results establish transport plus re-encoding timing, not the complete host handoff. No normal Windows audio-host entry point is invoked.

## Diagnostics and findings

A fixed first-frame record retains publication copy duration, pre-encode and pre-write ages, encoding/write/acknowledgement durations, receiver connection/header/payload/decode/callback durations, decision signed age, age class and clock-frequency agreement. Inapplicable or uncompleted stages remain null. Connection waiting is distinct from observation age. There are no payloads, coordinates, session identities or unrestricted exception messages in these records. No synchronous logging was added to the game or audio thread.

StateValidator now stores DecisionAgeMs and AgeClass before the original age check throws. LastAgeMs, sequence and session acceptance bookkeeping still change only on acceptance. The existing safe terminal code remains invalid-age for compatibility; the nested record distinguishes too-old from future-dated. The decision still uses the actual post-decode monotonic clock with inclusive **[-2, +250] ms** bounds. No wire field, deadline, reconnect rule or timestamp changed.

Measured instrumented results (all individual values retained in sanitised evidence):

- Cold encoding: approximately 11.2–12.4 ms; warm encoding: 0.05–0.07 ms.
- Cold decoding: approximately 18 ms; warm decoding: approximately 0.1 ms.
- Cold receiver first acknowledgement wait: approximately 21–22 ms; warm receiver: approximately 1.4–1.7 ms.
- Receiver decision ages remained within the original bounds for every matrix trial.
- Explicit discarded roundtrip preparation cost approximately 24–25 ms. This is an experimental condition, **not a new production warmup**.

These small measurements show first-use cost but do not reproduce a budget failure. They cannot recover the live frame's missing signed age or distinguish its original stale/future direction. No runtime correction is justified by them. Deliberately old/future synthetic timestamps reproduce freshness rejection through actual local pipes; deterministic numerical tests model time consumed after encoding/receipt without pretending injected conditions prove the historical mechanism.

## Tests and reproduction

```powershell
./tools/Measure-FirstFrameTiming.ps1 -Output .local/timing-new-run
./tools/Test-BeaconTransport.ps1
./tools/Build-AcousticsHost.ps1 -Tests
./tools/Build-BeaconBridge.ps1 -SdkPath <authentic-pinned-SDK-path>
./tools/Test-Offline.ps1
```

The matrix tool requires a fresh direct child of ignored `.local`, rejects overwrite/reparse output and compiles with the existing .NET Framework x64 compiler; no dependencies or vendor binaries are committed. Production transport is compiled directly into the test executable. Matrix tests are registered in Test-Offline. Reproduce baseline measurements from the baseline revision plus the original harness; candidate measurements use this branch. Do not interpret timings from independent runs as controlled hardware-performance comparisons.

Transport regressions pass **67 cases**, including exact inclusive boundaries, immediately adjacent invalid ticks, production-codec timestamp/frequency preservation, rejected-state bookkeeping, signed stale/future rejection through named pipes and terminal peer behaviour. Existing tests retain malformed-frame, acknowledgement/timeout, lifecycle, sanitisation and development reconnect coverage. Host tests pass **645 assertions** and the authentic pinned-SDK bridge compiles. The registered offline suite was run locally; final hosted CI and its actual checkout/tree verification are recorded in the draft PR.

Limitations: no test-only post-encode worker-stall or pre-validation decode-stall hook was added; deterministic decision-clock cases test expiry arithmetic instead. The full host handoff and RPH scheduling remain unmeasured. No source-code claim of a confirmed live repair is made.

## Preservation and next decision

Only transport diagnostics and original test/tool code changed. Acoustic propagation, PCM history, startup fade, 100 ms buffers, 50 ms prediction, 250 ms freshness, four-source cap, gain, orientation experiment default, WASAPI behaviour, camera getters and version guards remain unchanged. Strict one-attempt/one-connection, one-use activation and terminal fail-closed handling remain enforced.

I did not launch GTA/RPH, deploy a plugin, open an audio endpoint, play/capture sound, modify the game installation or create/reuse a live approval. ACOUSTICS-07.3 remains an **executed failed clean-session validation** with fail-closed behaviour observed. Audible startup and deliberate Stop remain unvalidated live. The combined ACOUSTICS-05 + BENCHMARK-01 record remains **60%**.

My next decision is to review this diagnostic candidate's remaining host-handoff gap before considering a separately authorised supervised run. This increment does not authorise or request that run.
