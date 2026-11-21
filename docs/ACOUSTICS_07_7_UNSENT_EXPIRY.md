# Offline first-observation-to-header diagnosis and unsent expiry correction

I've reproduced a first-frame expiry mechanism naturally in a fresh synthetic .NET Framework AppDomain and corrected the demonstrated publisher gap. This **does not recover the historical RPH sender timings or prove the cause of either previous live rejection**. No GTA/RPH process or audio endpoint was started.

## Baseline and bounded comparison

My isolated branch starts at verified open PR #56 head `61fa719635bad23e76da129e55ac23459d5bb123`. Its recorded live first observation was 390.0582 ms old, with 363.844 ms header wait and 22.8697 ms decode time; no sender encoding timing was exported. Those records remain unchanged.

Before changing acceptance behaviour I ran three ordinary fresh-process pairs, three fresh synthetic AppDomain sender pairs, and two controlled 350 ms hold cases. Each pair used production StatePublisher/StatePipeServer/codec, one isolated pipe, one strict connection attempt and short original approximately 20 Hz observations. The receiver remained a separate process. There was no warmup, dummy transmission, device, Node renderer or game runtime. A synthetic AppDomain is an initialization context, not an authentic RPH execution environment.

All three ordinary baseline pairs passed. **All three AppDomain baseline pairs naturally failed freshness**: encoding segments took 272.6176–278.9553 ms and received ages were 315.6681–320.9587 ms. Encoding itself exhausted the 250 ms freshness budget in these runs. Writes took approximately 2.2 ms. The before/after controlled holds also produced too-old rejection, but their delay is injected evidence, not a natural serialization measurement.

Every result was retained. Failures were not rerun until successful. Subsequent executions tested changed code, improved attribution or reproducibility, and remain in separate private directories. No parameter/state search or broad load campaign was performed.

## Why the original publisher could transmit stale data

The original code checked age before Protocol.Frame. Encoding and scheduling could then consume the budget, after which the original timestamp was transmitted unchanged. The receiver correctly captured its decision clock after decoding and rejected it. Header wait can include these sender-side operations; it is not itself an encoding-duration measurement.

My compile-time test seams distinguish work before encoding, actual Protocol.Frame duration, controlled work after encoding and pipe-write completion. These seams exist only with TRANSPORT_EXPIRY_TEST and are absent from normal host/bridge builds. No delay injection or baseline policy selector is exposed as a live option.

The baseline reproduction flag retrieves pinned original StatePipe source from Git into a fresh ignored directory and adds only the test hooks. It does not replace repository runtime files. Baseline fault EncodeMs includes the injected hold segment and must not be interpreted as pure codec cost. Candidate timing separates the hold from actual encoding.

## Small correction

StatePublisher now checks the **same original observation timestamp again after encoding, immediately before BeginWrite**. If age exceeds +250 ms, it sends no bytes, expects no acknowledgement for that unsent observation, increments ExpiredAfterEncoding and consumes the existing latest-value slot on its next iteration. Existing pre-encoding expiry is counted separately. There is no retimestamping, fabricated clock offset, first-frame exemption, connection retry or session restart.

The first expired unsent observation has one bounded record containing sequence, signed age, age before encoding, actual encode duration and stage. Later expiries increment counters without building a trace. Counters and the first record survive in publisher terminal diagnostics; the read-only bridge status displays live/retained counters and first-expiry age without exporting payloads. Its camera getters, version guards and one-use activation remain unchanged.

The inclusive receiver interval remains **[-2, +250] ms**. The new sender predicate rejects only ages greater than +250 ms; future-dated frames still reach normal receiver rejection. Schema, sequence/generation, first-header, connection, write, acknowledgement and idle deadlines are unchanged. No warmup was added. An observation can still expire after this guard through preemption, pipe transit or receiver work; the receiver remains authoritative and any transmitted rejection remains terminal.

## Results after correction

All three candidate AppDomain pairs accepted useful observations and completed acknowledged Stop on the **same single connection**. Each dropped one initial expired UNSENT observation, then transmitted an already-published newer observation with its original timestamp. This is latest-value coalescing before transmission, not recovery from a rejected frame.

The final measured matrix retained all three ordinary and all three AppDomain runs, both 350 ms hold cases, and one 900 ms first-write stall:

- Ordinary runs: 22 accepted observations each, no rejected observations.
- AppDomain runs: 16 accepted observations each, zero rejected observations, one expired unsent initial observation each.
- Both 350 ms hold cases: 14 accepted observations, zero rejections and one expired unsent observation each.
- The **900 ms stall still failed** at the original receiver header deadline, with zero accepted observations and terminal sender failure. No deadline was extended or retry introduced.

Exact ages, encode/write times, acknowledgements and classifications are in `evidence/acoustics07-7-unsent-expiry.json`. The initial accepted frame's timing remains distinct from the first unsent-expiry record. Existing first-frame and later-rejection attribution tests still pass.

## Console-readiness visibility

A separate owned console fixture emits and flushes a READY line, then stays alive for 1.2 seconds. It constructs no host, listener server or audio backend.

Direct redirected StandardOutput.ReadLineAsync observed the line in **43.1994 ms**, while the child was still alive. A PowerShell native-output-to-file wrapper had **zero visible file bytes** even 100 ms after a separate child emission marker confirmed the line had been produced. The wrapper remained alive and retained the complete line after exit. This isolates a capture-visibility problem rather than assuming child startup had finished.

This supports direct asynchronous stdout capture for a later reviewed operator workflow. It does **not** prove that a production pipe is bound, open an endpoint, or introduce a new live launcher. Actual server readiness must still be distinguished from the console fixture marker. No production Console/Windows audio behaviour was changed to conceal the problem.

## Reproduction and validation

```powershell
./tools/Test-UnsentExpiry.ps1 -Baseline -Output .local/expiry-baseline-new
./tools/Test-UnsentExpiry.ps1 -Output .local/expiry-candidate-new
./tools/Test-BeaconTransport.ps1
./tools/Build-AcousticsHost.ps1 -Tests
./tools/Build-BeaconBridge.ps1 -SdkPath <authentic-pinned-SDK-path>
./tools/Test-Offline.ps1
```

Fresh .local paths are mandatory; overwrite and reparse paths are rejected. Parent waits are bounded and cleanup targets only owned child processes/AppDomains. The yielding synthetic observation scheduler is a test harness, not a proposed audio-thread implementation. Detailed numeric evidence and compiled fixtures remain private. No external dependency was installed.

Focused transport tests pass **71 cases**, including exact +250 ms and next-tick expiry, preserved future rejection, expired-before-encode counting, acknowledged Stop and no-reconnect regressions. Host tests pass **648 assertions** and the authentic pinned-SDK bridge compiles. The required registered offline runner passed locally; final affected tests were rerun after diagnostic/test refinements. Hosted CI and its actual checkout/tree relationship are recorded in the draft PR. The new bounded experiment is registered in Test-Offline; inherited geometry/PCM/continuity fixtures remain unchanged.

## Preservation and limits

I changed publisher expiry handling and directly related bounded diagnostics/tests only. Receiver acceptance, acoustic propagation, PCM history, gain, buffers, prediction, orientation defaults, WASAPI, game installation and restoration code remain unchanged. Historical reports and private attempts are preserved. Publication screening excludes private receipts, identities, audio, SDK binaries and local paths; no licence or PR merge was introduced.

The natural AppDomain reproduction proves one technically sufficient mechanism. It does not establish whether encoding, initialization, scheduling or other work produced the exact historical 390.0582 ms live age. No CPU contention was manufactured to force a favourable result. RPH-specific timing, device behaviour and audible startup remain unvalidated. The new sender status provides useful evidence for a future reviewed candidate, but no live approval is created or requested here.

GTA/RPH were not launched; no plugin was deployed; no audio endpoint was opened; no sound was played or captured; no game files changed. ACOUSTICS-07.3 and 07.6 remain executed failed clean-session validations with fail-closed behaviour observed. The combined ACOUSTICS-05 + BENCHMARK-01 record remains **60%**.
