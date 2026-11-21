# LATENCY-03: first real-device synthetic transient proposal

**Prepared only. I have not authorized an endpoint query, playback, recording, GTA/RPH launch, deployment or retry. This proposal needs my fresh explicit approval before its experiment command is used.** Earlier PLAYABLE approvals are closed and do not authorize this test.

I propose **one attempt on one exact previously selected shared output endpoint**, using original synthetic shot/impact shapes and my unchanged, privately retained final RichAudio Bati PCM as the continuous bed. This is an endpoint-only experiment. It acquires no GTA events, suppresses no native sound and creates no microphone, loopback, stem or output recording.

## Exact candidate

Manifest SHA-256: `58f92cdc399a86e86e70587f6124cb837eaa82d604e86c7ec327b05296640432`

| Binding | SHA-256 |
| --- | --- |
| Operational source commit | `eac0c9f31e5a80db23e93b9ec92c0eac7c507069` |
| `runtime/Latency03.Experiment.exe` | `a436d3925224fb3e8390a3a386385bd16ffeb4bd299cf6ff1ace982d51c88bd0` |
| Copied Node executable | `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237` |
| Independent supervisor/invocation helper | `1f25ef8b036252294fb8d14d8fade7770300182ba61c77361772b99bf9dc2b93` |
| Dedicated authored-event worker | `b923bfe853b0ceaac1d73f6889723ef074e326f00a4cb15758647fd58571e909` |
| Eight original prepared kernels | `833a27460efc3a9f2774859b7a097cf2c7ea881f0095f7b4091dc9a0a6c4868c` |
| Original retained Bati WAV | `e86d54d9f305b24dd86264d456f3f8786e741c0aaaaeab42a82bd70016a021fe` |
| Offline preparation receipt | `d3e12c3e659467055ff3e887f5418fd927e8e5767cabf21acf565b068724a7e0` |
| Offline-only candidate validation | `51685b1ff45b769db89e1c51c083d63a61f4745eefceaf2d87685fc971b03e6b` |

The private candidate was built from a clean committed source tree. Its manifest binds all **65 payload files and 60 source files**, including the exact endpoint identity from the retained approved recording metadata. That historical identity is not proof that the endpoint is currently connected, selected by Windows, or capable of a particular period. The private candidate directory and independent review receipt remain available locally; endpoint identifiers and the retained recording are not published.

The binary is a separate experiment entry point. The ordinary gameplay host retains its null/disabled event bus. Candidate construction and `--validate` load bounded files and unsealed queues; they do not instantiate/query a real endpoint or claim an attempt. A subsequent regression-runner-only change does not alter any candidate payload/source binding. Any changed operational file requires a new candidate and independent review, never substitution under this proposal.

## One controlled sequence

The experiment uses Float32 stereo 48 kHz, the existing event-driven **shared** output initialization and the same MMCSS `Audio` task. `requestedPeriodFrames=0` deliberately retains the existing initialization route. If `IAudioClient3` is exposed, the experiment records its supported/default/fundamental/minimum/maximum and current-format/current-period replies. It does not choose a smaller period, round a request, change formats, switch endpoints or reinitialize after a failure. An unavailable `IAudioClient3` is recorded as unavailable; it does not select another output route. A failed required query or unsupported exact format stops the attempt.

Continuous PCM is preloaded before output starts, without gain, DSP, bank or buffer changes. The eight-block ring remains intact. This is the retained stereo signal, not simultaneous live vehicle synthesis or a new telemetry observation. Its historical camera-related quiet intervals remain part of the reference and must not be relabelled as new underflow.

Events are enabled only after two actual advancing, accepted `IAudioClock` samples establish a qualified observed bracket. The target sequence then lasts **28 seconds**:

| Seconds from qualified event start | Original authored events |
| --- | --- |
| 0–2 | Continuous reference only |
| 2–5 | Six isolated synthetic shots, 2 Hz |
| 5–9 | 64 shots, nominal 16 Hz |
| 9–13 | 128 shots, four-event bursts at 8 Hz |
| 13–17 | 160 overlapping impacts, four at 10 Hz |
| 17–21 | 40 shots with bounded 2 ms artificial transport-delay targets |
| 21–25 | 64 shots with two below-normal-priority CPU workers |
| At 25 | One intentional 64-event overload group |
| 25–28 | Final arrivals and retained tails; no further events |

The exact plan contains **526 events**. Real authoring/transport times are recorded; OS wake timing is not assumed to achieve the requested cadence or 2 ms delay. A missed authoring slot exceeding 100 ms stops instead of manufacturing a catch-up event history. The background load is a controlled CPU fixture, not GTA or full acoustic-map loading.

Each event retains its own actual authored occurrence bracket, sequence, identity, generation, origin and clock uncertainty. The existing renderer prepared direct/reflected travel times. Mapping uses only already observed clock brackets, with bounded pending descriptors when a newer observation cannot yet be mapped. It does not inherit the vehicle 75–100 ms history policy, extrapolate a future device position or add direct travel time twice.

The source shapes and geometry are original fixed-pose fixtures, not GTA gunshots or installed buildings. Their conservative uncalibrated kernel peaks remain at most 0.001; the unscaled Bati bed and normal audio preferences remain unchanged. This is a software timing/reliability experiment, not weapon loudness calibration or a promise that a small nonzero sample is perceptually audible.

## Capacity and failure policy

The selected opt-in `ProtectActiveTails03` policy keeps 32 voices and two 64-descriptor lanes, with a globally bounded 128 descriptors across clock-pending/transport admission. Eight voices remain reserved against normal-priority occupancy. It rejects excess new arrivals instead of cutting an active tail. In the matched offline stress fixture this removed 16 capacity tail cuts while reducing acknowledged onsets from 496 to 480. It is a continuity/admission trade-off, not unlimited polyphony. No additional fixed PCM queue is introduced.

The declared continuous peak budget is 0.95 and event budget at most 0.032, without a new limiter or source gain change. Invalid identity, generation, uncertainty, freshness, clock, capacity/headroom, recording attachment, underflow or output-buffer failure is reported. Acquired packets receive exactly one release attempt; a failed fill is released as silence without acknowledging a transient onset. There is no retry of a rejected event or failed device attempt.

## Measurements and acceptance

The retained diagnostics must include every planned/observed/written/decoded/admitted/rejected event, first consumer-owned writable packet, acknowledged/reserved frontier snapshots, clock-anchor provenance/uncertainty, first output frame, successful WASAPI release bracket and available endpoint-reported stream-position crossing interval. Source occurrence, observation, acceptance, writable-buffer access, submission and presentation evidence are separate boundaries.

Report per-phase counts and median/p95/p99/maximum submission latency, full callback and fill costs, callback allocation counters, wake/padding observations, ring underflow, mapping deferrals/rejections, overload rejection, completed/truncated windows, memory scope and cleanup. The intentional overload is separate from ordinary phases. A protocol/cleanup pass cannot conceal missing ordinary onsets, unknown callback allocation evidence or tail evictions. Keep all raw rows, including failures and observations that never reach submission.

The principal comparison is whether ordinary-phase observation-to-**actual WASAPI submission** is comparable to the LATENCY-02 fake-sink median of approximately 15.5 ms. The sink clock and scheduling differ, so a difference is not automatically an isolated software saving. Approximately 20–30 ms is an engineering target; actual results are currently **unavailable**. `IAudioClock` evidence is an endpoint-reported stream position, not a microphone measurement, physical speaker output or human input-to-ear latency. My listening feedback, if supplied, remains separate.

## Admission, bounds and cleanup

Before any device action, reverify this exact private proposal hash, independent review hash, manifest, all binaries/source/input bindings, the original reference audio, required QPC/allocation instrumentation and absent prior experiment/host/GTA/RPH lifetimes. `attempt-consumed.json`, `results` and a worker claim must be absent. An unexpected difference stops; no artifact is regenerated or replaced to fit approval.

The future invocation must identify both the approved proposal SHA-256 and independently reviewed receipt SHA-256. Those mechanical arguments are not a substitute for my explicit approval. Only the copied, bound helper and binary may run. The supervisor consumes the candidate once before starting a suspended child in its kill-on-close job. It admits the exact child PID/creation lifetime; that worker claims once before Node or endpoint startup. Node inherits containment. No replay or automatic second attempt is admitted.

There is an internal **30-second output limit from stream Start**. Startup/clock delay can therefore terminate the planned 28-second sequence early. An independent monotonic supervisor requests Stop after **35 seconds of worker lifetime**, and closes the owned job at **42 seconds** if needed, followed by at most three seconds of exit verification. These are stop-request/containment bounds, not claims of independently measured acoustic silence.

Normal cleanup stops and resets the owned client, joins output/producer/ingress/authoring/CPU workers, closes the owned Node child, completes event cancellation only after joins, and independently verifies original owned lifetimes absent. Record Stop/Reset results, MMCSS results, join completion and failures separately. The shared route changes no Windows master/session preference or game file, so there is no deployment or original game configuration to restore. Original candidate bindings and reference inputs are rechecked; runtime diagnostics and consumed markers are preserved. Any failed or forced cleanup ends the experiment without retry.

No device query or live audition has been performed during preparation. No endpoint access is authorized by publishing this proposal, its hashes, a draft PR or passing CI.
