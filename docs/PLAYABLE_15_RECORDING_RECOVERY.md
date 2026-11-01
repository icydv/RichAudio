# PLAYABLE-15 recording recovery and latency investigation

The first audible Bati result remains established as recorded in [Stage B](PLAYABLE_15_STAGE_B_RESULT.md). My 250–500 ms latency estimate remains subjective. This follow-up changes recording fault handling and adds timing diagnostics offline; it does not tune sound or prove a second live result.

## Confirmed failure and WASAPI contract

The first captured packet had flag `1` (`AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY`), a valid timestamp, and no preceding packet. `RecordingSession.Run` wrote that packet, then `(packet.Flags & 5) != 0` called the session-wide `Fault`. That sealed recording admissions, ending final owned PCM capture as well as loopback. Independent playback continued. The retained 32 ms silent owned WAV and 10 ms endpoint WAV cannot measure live response latency.

Microsoft defines [DATA_DISCONTINUITY](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/ne-audioclient-_audclnt_bufferflags) as lack of correlation with the preceding packet's device position, possibly a stream transition or timing glitch. It separately defines timestamp error as uncertainty in the recorded position time. [GetBuffer](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudiocaptureclient-getbuffer) reports device position and QPC time for the first frame of each packet; the QPC value is converted into 100 ns units, not raw performance-counter ticks.

These contracts permit distinguishing startup without prior history from a break in an established sequence. They do not guarantee that every first packet is flagged, that the flag proves a harmless transition, or that no initial data was lost. The recovery policy therefore accepts only a bounded, timestamp-valid initial packet, retains its original bytes and flag, and explicitly reports unknown initial sample loss. It never manufactures earlier samples or timestamps. Later discontinuities and timestamp errors retain separate failure classifications.

## Implemented recording behavior

The first retained packet can establish a new device-frame history only when it has a positive QPC timestamp, no timestamp-error bit and no unknown flags. `SILENT` still means zero-valued packet bytes under the API contract; it does not authorize padding missing frames. The packet index now associates each payload with `wavFrameStart`, original device position/QPC/flags, the original GetBuffer bracket, startup classification, and an integrity fault when present. Initial missing-frame count is `null`, not an invented zero. Later device gaps/regressions, non-forward QPC, timestamp errors/unavailable timestamps, unknown flags, queue overflow and release/backend failures remain faults.

Loopback has its own admission and failure state. A loopback failure ends that producer, retains already committed packets and leaves healthy final RichAudio capture active. Shared storage, writer, duration, total-byte and owned-output failures still stop the session as appropriate. An approved but unavailable endpoint is also recorded as a requested failed stream; rejected recording permissions do not activate it. No automatic restart or endpoint rebinding is added.

The final manifest separately reports `ownedCaptureComplete`, `loopbackCaptureComplete`, `loopbackRequested`, and `loopbackFailure`. Overall `complete` requires every requested stream to finish without fault. This means completion of the retained capture streams, not full-session coverage or synchronization: `fullSessionCoverageGuaranteed=false` and `synchronizationEstablished=false` remain explicit. A valid startup discontinuity is a visible warning and unknown prefix, while a later fault makes synchronized capture incomplete. The existing snapshot and demo analysis request expose failures to the host/analyser.

The preallocated 16-packet queue, 8,192-frame/262,144-byte packet bounds, existing submission tap, 128-row diagnostic queue, duration/storage caps, exclusive recording lease and producer-owned shutdown are retained. Finalization waits for producer completion and committed queues; no stream is padded or aligned by file start. The render callback, ring, output gain and WASAPI submission code are unchanged.

## Evidence and limits

The exact regression results, candidate hashes and independent reviews are recorded in [sanitized evidence](../evidence/playable-15-recording-recovery.json). [Timing diagnostics](PLAYABLE_15_LATENCY_DIAGNOSTICS.md) describes measured fields, clock domains and unmeasured stages. [The follow-up proposal](PLAYABLE_15_RECORDING_RECOVERY_PROPOSAL.md) is the sole proposed live scope; it requires fresh explicit approval.

| Final offline validation | Result |
| --- | --- |
| Expanded `Test-Offline.ps1` | PASS; 576 Node test executions, zero failures/skips, plus managed/native fixture suites. Recording/finalizer regressions are now included in this runner. |
| Final recorder regression | PASS 2460 C# assertions, 17 existing analysis controls and 25 latency controls. Startup flags 0/1/3 each retain 122880 frames (2.56 seconds) from 240 actual production Fill submissions, with exact retained PCM bytes. |
| Gameplay recording/finalizer | PASS 65 assertions, five findings controls, closed WAV/index/manifest, plots and automatic finalizer. Fake capture only. |
| Actual corrected-package Bati chain | PASS 55 lifecycle/ownership/source/renderer/ring/fade checks; authored telemetry and a device-free sink. |
| Actual corrected-package timing capture | PASS 366 checks; 139200 retained frames (2.9 seconds), 34 Node timing rows, 34 ring rows, 67 control rows, 25 selected source brackets and 33 joined retained submissions. No loopback endpoint in this fixture. |
| Diagnostics transparency | Eight gameplay regressions, zero skips; every byte of 112 stereo blocks identical with instrumentation enabled/disabled. |
| Camera/journal compatibility | 11 listener cases/37 assertions; four strict journal/lease profiles/56 assertions; exact compiled passive/audible integration inspected without executing RPH. |
| Independent final review | Exact final source/package/candidate/proposal/coordinator, protected baseline/settings, 32 absent owned paths and absent relevant processes passed. Review is not live authority. |

The broad suite exposed five older compiler source lists that omitted the recording subtree, and an outdated settings fixture that used numeric Apply/Reset menu positions. These fixture dependencies and positions were corrected; acceptance conditions were retained. The new timing fixture initially encountered concurrent `host.json` publication; its active polling now tolerates incomplete publication only within the original 15-second deadline, with strict closed-file reads afterward. An initial private builder error from a reserved PowerShell variable was corrected before any candidate was accepted.

The broad 576-test run preceded the last two analyser summary-expression corrections for unknown flags and invalid-timestamp startup uncertainty. All affected recording/analysis/finalizer regressions and the exact final package's Bati/timing chains passed again afterward. Earlier private builds/candidates and blocked helper reviews remain preserved; only build03, candidate02 and coordinator03 are selected. The final static reviews corrected transitive helper hashes and observation of shared writer/finalization failures before accepting the proposal. No live mode was run.

No microphone, additional live stems, source mapping, source expiry, calibration, gain, EQ, spatial processing, control delay, producer reserve or endpoint buffer change is authorized by this work. Original proprietary recordings and sealed historical candidates stay private and intact. File-only fixtures and managed fake render/capture drivers do not establish live WASAPI behavior, audible continuity, speaker latency, camera recovery while listening, or restored installation after a future attempt.
