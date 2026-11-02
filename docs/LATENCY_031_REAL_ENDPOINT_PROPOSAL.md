# LATENCY-03.1: my newly prepared endpoint-only proposal

**Prepared only. I have not approved a new endpoint query or playback. This candidate requires fresh explicit approval of its exact private proposal and independent review. My previous LATENCY-03 candidate and approval remain consumed.**

I propose one future endpoint-only attempt on the exact historical selected shared output identity, with my unchanged retained Bati PCM and the original 526 synthetic events. No GTA/RPH, installed-map access, deployment, native suppression, microphone, loopback, output recording, source-bank tuning or retry is included. The authoritative private proposal bytes and exact reviewed candidate path must be used; a GitHub-rendered or differently materialized copy is not interchangeable.

## Exact new candidate

Manifest SHA-256: `3c074154fde2c2502ffd5b996d02451dac51da1ef76513c6ae67b1c182565807`

| Binding | SHA-256 |
| --- | --- |
| Clean operational source commit | `14e23ee3ca6e2ca0c571a17deafcc6bde38e40e4` |
| `runtime/Latency03.Experiment.exe` | `1d4735df218a7c7b041027043127c647a7372e97c823c989a1cb727c47bf735b` |
| Original copied Node executable | `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237` |
| Copied future invocation helper | `3f22b7abfd575db15085ea26bed9ed5172ce6a93e22db9a8a7b8b326a399d2c5` |
| Unchanged original authored-event worker | `b923bfe853b0ceaac1d73f6889723ef074e326f00a4cb15758647fd58571e909` |
| Unchanged eight synthetic kernels | `833a27460efc3a9f2774859b7a097cf2c7ea881f0095f7b4091dc9a0a6c4868c` |
| Unchanged original Bati reference WAV | `e86d54d9f305b24dd86264d456f3f8786e741c0aaaaeab42a82bd70016a021fe` |
| New offline preparation receipt | `756a98f6110cb6d84f09e9bf8525ef183c72f438463f610124edfe93df115ef7` |
| New offline-only validation | `93a89db5780cd7eacd62c744768acd7b377e030f3223a90354033ea9c878d56f` |

The new schema-2 manifest binds **68 payload files and 63 operational source files**, including the compiler and Node identities, original recording metadata and historical endpoint identity. It was prepared in a new private directory from a clean committed tree. The independently reviewed receipt must bind that exact fully qualified candidate root. Relocating a copied approved directory cannot satisfy that path gate. The original consumed directory, results, markers and approval are separate and must not be edited, reset, repaired or reused.

The compiled executable's candidate-loading constructor and `--validate` only read bounded files and create unsealed in-memory queues. They do not open/query an endpoint, start Node, create an attempt marker or enter an experiment worker. Offline preparation did invoke the pinned Node executable to build the unchanged kernels; this is not endpoint activation. Subsequent documentation-only commits are permitted only while every bound operational source/payload remains identical.

## What changed in this experiment

The opt-in clock policy is `ArrivedPositionInterval031`. It requires three genuinely advancing positive observations. For an event bracketed by two already arrived correlated timestamps, it retains the entire guarded monotonic position interval and schedules from the conservative upper observed bound. It does not invent an interpolated device position or extrapolate a future sample. Additional scheduling margin is applied once; the interval width is reported, not added a second time. These authored events retain zero additional clock-offset uncertainty; no unknown symmetric clock error is hidden in that value.

Total admitted interval width, including guards/margin, is at most **512 frames / 10.6667 ms**. The maximum anchor gap is **20 ms**. A separate rolling nominal-rate residual budget is **512 frames plus query guards** over at most 128 retained anchors. These are experimental service-admission limits, not measured hardware accuracy, device-position granularity or speaker calibration. The shared-mode processing period is not used as a clock-precision guarantee.

The exact previous six-row trace passes the new interval model while retaining the old reason-4 failure in baseline tests. Its final guarded interval is **[1440, 1922], width 482 frames / 10.0417 ms**. This establishes offline behavior on those retained observations, not reliable mapping of an entire future run. Query containment is a strict local quality gate; raw HRESULTs, query brackets, rate residuals, interval limits and exact rejection reasons remain retained. Regressions, stalled/nonadvancing clocks, missing brackets, excessive gaps/uncertainty, invalid frequencies or failed queries retain safe rejection/stop behavior. No native source expiry is relaxed.

The supervisor retains the original `CreateProcess` kernel handle for waiting and exit-status capture, plus exact PID/creation identity. Signaled process state distinguishes actual exit code 259 from a running process. Actual job/thread/process-handle close results and structured partial-start failures are retained. Timeout, late exit observation, forced containment, missing evidence or failed cleanup cannot pass merely because an exit code is zero. Completed cleanup remains separate from successful audio execution.

## One unchanged controlled sequence

The endpoint uses the unchanged Float32 stereo 48 kHz request, event-driven shared initialization, gain 1 and existing MMCSS `Audio` task. `requestedPeriodFrames=0`: no smaller period is selected, no exclusive mode, alternate endpoint, format substitution, device preference change or reinitialization is allowed. If `IAudioClient3` is exposed, supported-period queries and instantaneous current format/period snapshots before and after initialization are recorded with QPC brackets, before stream Start. Their replies are not promises that other clients cannot later change the shared engine. A required query or exact-format failure stops without fallback.

The original unlooped Bati PCM is preloaded, unchanged and untrimmed, into the existing eight-block ring. Its first 10,240 frames are silent and its historical camera quiet intervals remain in the reference. They are not new underflows. This is prerecorded PCM, not live vehicle synthesis or a new throttle-to-ear measurement. Event mixing uses the next available uncommitted output packet after continuous PCM leaves the ring; no new fixed PCM queue or vehicle-history delay is introduced.

The target sequence runs 28 seconds from qualified event enable:

| Seconds | Original authored events |
| --- | --- |
| 0–2 | Continuous reference only |
| 2–5 | Six isolated shots, 2 Hz |
| 5–9 | 64 shots, 16 Hz |
| 9–13 | 128 shots, four-event bursts at 8 Hz |
| 13–17 | 160 overlapping impacts, four at 10 Hz |
| 17–21 | 40 shots with bounded 2 ms transport-delay targets |
| 21–25 | 64 shots with two below-normal-priority CPU workers |
| At 25 | One intentional 64-event overload group |
| 25–28 | Final arrivals and tails, no new events |

All 526 actual occurrence/observation QPC brackets, source identities, sequences and generations must be retained. OS scheduling is measured rather than assumed to meet requested cadence or jitter targets. An authoring miss over 100 ms stops without a fabricated catch-up history. The original fixed poses/geometry and kernels are authored fixtures, not acquired GTA events. Conservative kernel peaks remain at most 0.001; the unscaled bed, calibration, gains and ordinary sound defaults remain unchanged. My intended device and comfortable listening conditions must be confirmed immediately before audible output; Windows master volume and default-device preferences must not be set by the experiment.

## Capacity, diagnostics and acceptance

`ProtectActiveTails03` retains 32 voices, eight reserved against normal-priority occupancy, two 64-entry lanes and 128 combined pending/admitted descriptors. It rejects excess new events rather than stealing active tails. The 0.95 continuous peak budget and at most 0.032 event budget remain. No new limiter, loudness compensation, stem or source bank is added.

Retain every planned/observed/written/decoded/admitted/rejected/submitted event, including unreached events. Event receipts include interval bounds, supporting anchor timestamps, effective uncertainty, first writable consumer frame, successful release brackets and available endpoint-position crossing evidence. Raw clock values include a post-join decimal-string copy of unsigned QPC returns; exception provenance is separate from a surrogate failed-query marker. Supported/requested/mix/current-format fields and period-query brackets are retained. No serialization, file IO, geometry preparation or blocking wait is added to the render callback.

Report p50/p95/p99/maximum for available event stages, packet acquire/fill/release and callback/scheduling costs, with sample counts and actual timer boundaries. Keep prefill separate from callbacks, and complete callback-start intervals separate from the legacy wake array. Retain allocation availability/bytes, clock uncertainty, padding, underflow, memory scope, overload rejection, completed/truncated tails, stop/reset and process cleanup. Zero observations mean unavailable event timing, not zero latency or transport loss. Ordinary-phase missing onsets or unknown allocation evidence fail audio acceptance; overload outcomes remain separate.

Compare actual observation-to-WASAPI submission against the historical fake-sink median 15.5493 ms only when actual transient onsets exist. Approximately 20–30 ms is an engineering target, not an expected result or physical speaker claim. Endpoint-reported position is not microphone evidence, physical sound output or human input-to-ear latency. My listening feedback, if supplied, is separate.

## One-use admission, supervision and rollback

Before any future device action, independently reverify this exact private proposal hash, the new independent review hash/root, manifest, all 68 payloads/63 sources, compiler/Node, original WAV/metadata, selected endpoint identity, QPC/allocation instrumentation, completed applicable regressions and absent forbidden host/game/experiment processes. The new candidate must have no `attempt-consumed.json`, result directory or worker claim. Any unexpected difference stops without regeneration, repair, substitution or retry.

Only the copied bound helper/binary may execute, with the approved proposal and review hashes. It claims once before the suspended child starts, assigns containment before resume and admits the original handle's PID/creation lifetime. The worker claims once before Node or endpoint startup. Node descendants inherit the kill-on-close job. No replay or second worker is admitted.

The internal output bound remains **30 seconds from stream Start**. The independent monotonic supervisor requests Stop at **35 seconds** and closes containment at **42 seconds**, followed by at most **three seconds** of original-handle exit verification. Its timer starts before child creation, conservatively preceding worker lifetime. OS scheduling can delay observation; actual request/close timestamps and late-exit flags must be retained. These are control/containment bounds, not independently measured acoustic silence. Startup qualification can shorten the 28-second target under the internal bound.

Normal cleanup stops/resets the owned client, joins all worker threads and Node, completes event cancellation after joins, closes the job and captures/closes the original process handle. The supervisor attempts a truthful new receipt even after start/wait/query/cleanup errors. If serialization, write, flush or disposal fails, the helper must fail and preserve the incomplete file/error. A parseable receipt alone cannot override an unsuccessful outer invocation or prove completed supervision.

Mandatory independent **manual postflight** must verify every original owned lifetime absent by PID/creation identity, all original inputs and 68 payload/63 source bindings unchanged, actual Stop/Reset/joins/handle results, one consumed marker and complete raw results. Missing or forced cleanup remains failed/incomplete evidence even if later process absence is verified. There is no game deployment or configuration to restore; no recording is attached. Preserve all diagnostics and markers. Another attempt needs another reviewed candidate, proposal and fresh approval.
