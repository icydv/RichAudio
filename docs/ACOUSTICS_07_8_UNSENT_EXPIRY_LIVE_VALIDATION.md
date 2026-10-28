# ACOUSTICS-07.8 — Unsent expiry live validation

## Outcome

I've completed one freshly approved Enhanced Story Mode attempt using unchanged PR #57 runtime source `d9dfc22880566cd3157b4371d39cd0833778c334`. The publisher discarded one expired **unsent** observation after encoding, then established a useful stream on its single strict connection. The receiver accepted **1,099 observations with zero rejections**. All 1,099 were forwarded to and consumed by the renderer. Both ends completed acknowledged deliberate Stop, the owned processes exited, and independent installation restoration passed.

I could hear the beacon and did not notice anything wrong, but it was quiet and too low in frequency for me. On clarification, I reported **"Too quiet/low to judge direction"**. This is positive audibility feedback, not directional listening acceptance. My requested next candidate is 600 Hz at a higher reviewed level; neither frequency nor gain was changed during this attempt.

| Acceptance item | Result | Evidence boundary |
| --- | --- | --- |
| First transmitted observation acceptance | PASS | First received sequence 7, signed decision age 50.5444 ms; no receiver rejection |
| Unsent-expiry handling | PASS | Sender reports one after-encoding unsent discard at rounded age 372.819 ms, followed by clean acceptance on the same connection |
| Renderer handoff/startup | PASS | Required native camera orientation consumed, two synthetic paths, startup ready, nonzero submitted PCM; no missing-history reads |
| Audible continuity/camera response | NOT OBSERVED | Audibility confirmed and no noticed defect; level/frequency prevented a confident directional judgement |
| Acknowledged deliberate Stop | PASS | Sender and receiver both report connection/sender-stop/deliberate-stop |
| Bounded shutdown | PASS | Host/producer exited cleanly; no retry, reload, replacement host or owned-process kill |
| Installation restoration | PASS | Independent root/signature/directory/archive checks below |

**Procedural deviation:** deliberate Stop completed at approximately 72.8 host seconds, later than the intended 45–60-second window. It remained below the 90-second hard operational limit and the unchanged 120-second runtime caps. I have not represented this as on-target Stop timing. Transport success does not erase that deviation or the incomplete directional listening result.

## Candidate, approval and preparation

The isolated branch `validation/acoustics-07-8-unsent-expiry-live` starts at the exact reviewed PR #57 head. Its parent CI run [40734642136](https://github.com/icydv/RichAudio/actions/runs/40734642136) passed; the actual generated-merge checkout `022dd587a27da813d835391ec29dc74e80fcaaba` has tree `fcbac364744f8163209efd7c5faefdfc0466e6fc`, identical to the runtime candidate's contents. This result PR changes documentation and sanitised evidence only.

I built the production host and read-only bridge in the fresh worktree. Local gates passed **648 host assertions and 71 transport cases**; the bridge compiled against the authentic pinned SDK. Host compilation defines STATE_TRANSPORT; the bridge has no test defines. TRANSPORT_EXPIRY_TEST and EXPIRY_BASELINE are excluded. Reflection confirmed the test-hook fields are absent from both production artifacts. No artificial hold, baseline selector, warmup or dummy transmission entered these binaries.

| Verified component | Value |
| --- | --- |
| Enhanced executable | 1.0.1158.16, original signatures Valid |
| RPH runtime | 1.132.1428.17748, also confirmed in the launcher |
| Compile-time SDK | 1.124.1393.17586 |
| SDK SHA-256 | `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0` |
| Host SHA-256 | `A116FE4588B7015531D75AFA1C741CA1185BC048D829ABBBBC7B5657E9C1B3CF` |
| Bridge SHA-256 | `F0C025E4C914748B96B0D2BCAD295845832304F900459E2EEAC2C1010B7C7C61` |

Only after my explicit approval bound to these binaries and the fresh manifest was a new approval receipt created. The reviewed 26-file temporary deployment and reversible executable-selection rename were verified before the one visible launch. No prior approval, output directory or deployment receipt was reused.

## Console capture and readiness

The operator workflow used direct Process asynchronous stdout events, concurrent stderr draining and open stdin. Private logs were flushed incrementally and output mirrored immediately to the execution terminal. Bounds were 8,192 lines, 16 KiB per line, 8 MiB combined and a 135-second wrapper lifetime, with failure handling rather than silent log loss. The host's own 120-second cap remained unchanged. No PowerShell native-output-to-file redirection was used for the live host.

Before approval, the existing device-free console fixture exposed READY while alive in 105.5312 ms. A separate original control fixture exposed READY in 75.5081 ms and a live status response in 82.132 ms while draining 64 stderr lines. The same execution-terminal/stdin mechanism subsequently passed a device-free control check. These are capture-plumbing measurements, not host, pipe or audio startup benchmarks.

During the actual session, the host's startup output was observed at wrapper time **96 ms**, while it was alive. A `status` command responded at **13,426 ms**, before the one bridge activation. The initial status had zero paths and emission disabled, as expected before any listener connection. The startup line follows pipe.Start(), which starts a thread; it is **not** an explicit pipe-bound event. No synthetic probe consumed the real connection.

The real bridge connection and subsequent acknowledgements established transport operation. A later live status showed required native-camera orientation in the synthetic scene, interpolated playout, two paths, 100 ms control delay and emission still disabled before the single host Start command.

## Fixed configuration and execution

The host opened the default output and accepted its exact shared **48 kHz stereo Float32** path. Endpoint identity remains private. This happened only during the approved session; preparation did not probe or open an endpoint.

The fixed configuration was one original harmonic beacon in a **synthetic metric open-road scene**, gain **0.12**, initially muted with emission disabled. Both spatial and orientation buffers were **100 ms**; prediction remained **50 ms**, receiver freshness **[-2, +250] ms**, and experimental orientation **OFF**. Source ownership was entirely RichAudio's. There was no audio capture, native audio mutation, vehicle spawn, collision acquisition, synthetic listener fallback, fault injection, autostart or implementation change.

One visible RPH launch reached Story Mode with plugin autoload disabled. The bridge was loaded once and confirmed READY / sending OFF. After live console/status visibility was established, the bridge was activated once within the original first-connection window. Before enabling emission, retained bridge status showed **208 acknowledged messages**, one attempt, no terminal failure and the unsent-expiry counters. The final acknowledged count increased to 1,099.

The host Start command was issued once at wrapper time **37,284 ms**. Subsequent status showed emission true, startup ready and nonzero PCM. Camera orientation changed during the listening interval. This visible movement and renderer consumption are separate from my inability to judge stereo direction confidently at the chosen level/frequency.

Bridge Stop was the normal shutdown trigger. The receiver's terminal elapsed time was **72,737.2901 ms**; the wrapper observed the terminal line at **72,840 ms** and completed at **72,885.761 ms**. These clocks have different start boundaries and must not be subtracted to claim exact physical Stop latency. The host reported **72.8068809 seconds** wall duration. The intended 45–60-second Stop target was missed; the hard before-90-second boundary was retained.

| Count | Actual result |
| --- | --- |
| Launch attempts / observed GTA launches | 1 / 1 |
| Bridge loads / activations | 1 / 1 |
| Production host sessions | 1 |
| Publisher attempts / receiver connections | 1 / 1 |
| Bridge observations / missed observations | 1,106 / 2 |
| Sender acknowledged / receiver accepted | 1,099 / 1,099 |
| Receiver rejected | 0 |
| Host forwarded / Node listenerMessages | 1,099 / 1,099 |
| Node listenerRejected | 0 |
| Retries / replacement hosts / plugin reloads | 0 / 0 / 0 |

The bridge's missed-observation counter is distinct from a receiver rejection. Latest-value coalescing, unsent expiry, accepted frames, host forwarding and Node consumption remain distinct quantities; unavailable sender detail is not inferred from count differences.

## Unsent expiry and first accepted frame

| Sender status field | Actual value |
| --- | --- |
| expiredUnsentBefore | 0 |
| expiredUnsentAfter | 1 |
| firstExpiredAgeMs | 372.819, displayed to three decimal places |
| Final terminal outcome | connection/sender-stop/deliberate-stop |
| Another Start | Disabled, confirmed in retained bridge output; no second Start attempted |

The sender's full encoding record is not exported by this bridge. Its first expiry age and stage counter are available; exact encode/copy/pre-write durations are not. Receiver-side expiry fields are not the sender's counters and are not substituted for them.

| First accepted receiver-frame field | Value |
| --- | --- |
| FrameSequence | 7 |
| DecisionAgeMs / classification | 50.5444 / within-bounds |
| Permitted signed age | -2 through +250 ms |
| ClockFrequencyAgrees | true |
| ConnectionMs | 17,346.1964 |
| HeaderMs | 382.1046 |
| PayloadMs | 0.0286 |
| DecodeMs | 20.6477 |
| CallbackMs | 2.6035 |
| AckMs | 0.2232 |
| OffendingFrame / receiver error | null / null |

ConnectionMs includes waiting for the client and is not observation age. HeaderMs includes time before the useful transmitted frame arrives, including any sender initialization and unsent discard; it is not isolated serialization cost. Sequence zero was not required to be the first transmitted observation. The discarded expired observation sent no frame, received no rejection and did not consume another connection attempt.

This session demonstrates the new guard operating successfully in a real RPH session. It does **not** recover the sender timings of previous attempts or establish their causes. The pre-write guard cannot prevent subsequent scheduling/transit/decode expiry; the unchanged receiver remains authoritative.

## PCM, performance and listening limits

The host received **6,816 blocks**, rejected none, and the renderer produced **3,489,792 frames**. The endpoint consumed/submitted **3,488,736 frames**. These counts describe different pipeline boundaries and are not interchangeable.

| Measurement | Value |
| --- | --- |
| Submitted peak | 0.0025503926444798708 |
| Submitted RMS | 0.00081209130351760973 |
| Renderer peak / limited samples | 0.021253272709220394 / 0 |
| Missing-history reads / rejected controls / cursor resets | 0 / 0 / 0 |
| Startup status / ready frame | ready / 1,782,784 |
| Startup fade / deadline | 480 / 120,000 frames |
| Maximum paths | 2 |
| Listener interpolated / predicted / unavailable selections | 5,148 / 3 / 5 |
| Underflow frames / empty-padding events / wake timeouts | 0 / 0 / 0 |
| Device error / producer error / renderer exit | null / null / 0 |
| Output muted / host stopped at termination | true / true |
| Submission median / p99 / maximum | 0.0153 / 0.0252 / 0.2911 ms |
| Simulation median / p95 / maximum | 0.1191 / 0.2132 / 1.6833 ms |
| DSP median / p95 / maximum | 0.0462 / 0.0913 / 2.5204 ms |
| Endpoint buffer | 1,056 frames / 22 ms |
| Host CPU / working set | 1.4375 CPU seconds / 40,898,560 bytes |

The ready frame belongs to the renderer's continuously advancing clock, which ran silently before emission. It is not a 37-second history-priming delay. The five unavailable playout selections and pre-connection idle/stale updates are not automatically audible gaps; no recorded audio permits independent waveform inspection. Zero underflows and missing-history reads do not prove perceptual continuity, headset latency or general device reliability.

My actual feedback was:

> I could hear it yes, didn't notice anything wrong with it, however it wasn't that loud and it's too low of a frequency for my ears, try 600hz and make it louder

When asked specifically about left/right movement, I answered:

> Too quiet/low to judge direction

No human listening PASS for stereo response is inferred from transport success, camera movement or nonzero submitted PCM. No capture was made. The low submitted levels are retained without normalisation or a gain change to make this attempt appear more convincing.

## Shutdown and independent restoration

The bridge reported acknowledged sender-stop and disabled another Start. The receiver agreed, muted/stopped owned output and reported controlled-stop. The producer and host exited cleanly; the capture wrapper retained stdout/stderr EOFs, no overflow/failure and child exit 0. This was not host-first disposal, timeout, clean EOF or a duration-limit shutdown.

The bridge was unloaded, normal GTA close was requested and its window/process disappeared. No owned or unrelated process was killed. The reviewed restoration reversed the executable-selection rename, preserved the 26 introduced files and generated logs, and removed only verified introduced paths. The recurring three-byte generated Code1.cs was inspected for links and preserved before the introduced empty directory was removed. No unexpected file was discarded to obtain a match.

Independent verification against this attempt's fresh baseline passed:

- **32 original root-file hashes** excluding RPF archives.
- Both original executable signatures **Valid**.
- **Five original top-level directories**.
- All **26 introduced destinations** and the temporary executable alias absent.
- **179 archive lengths and UTC timestamps**, with linked paths rejected.
- **Ten sampled archive SHA-256s**.
- Game, RPH, host, capture wrapper and the selected producer absent.

This is the stated metadata/sample-hash scope, not a full content hash of every archive. Historical observations, audio, failed attempts, Bati research and source-synthesis work remain unchanged.

## Publication and next decision

Sanitised scalar evidence is `evidence/acoustics07-8-unsent-expiry-live.json`. Full console/renderer/RPH logs, coordinates, endpoint identity, manifests, approvals, binaries and backups remain private and ignored. This branch adds no runtime, transport, DSP or deployment implementation changes. Publication screening and Git integrity checks precede publication; final CI checkout/tree verification is recorded in the draft PR. No merge, licence or release is introduced.

The combined ACOUSTICS-05 + BENCHMARK-01 record remains **60%**. Experimental orientation remains **OFF**. The earlier failed live attempts remain historically accurate.

The next action is a bounded **offline 600 Hz beacon and level preparation**: retain the successful transport/runtime policies, prepare an original higher-frequency owned beacon and a measured higher-level candidate with explicit headroom, then review it before any separately authorised live session. No further launch, playback, endpoint opening or live approval is implied by this report or its next prompt.
