# PLAYABLE-08 recording and analysis foundation

The production recording foundation is implemented and tested without opening an
audio endpoint. It is **disabled and unavailable in current gameplay**. A passing
file-writer or signal fixture does not establish supported live playback, audible
quality, synchronized GTA recording or physical speaker latency.

## Reuse of the production path

`WasapiOutput.Fill` already fills the final stereo Float32 buffer from `PcmRing`,
including the existing output gain. The existing `OwnedOutputTap` prepares its
copy before `IAudioRenderClient.ReleaseBuffer` and publishes it only after that
call succeeds. PLAYABLE-08 adds a local sink to that same 64-slot queue; it does
not add another audio renderer, regenerate samples or change source calibration.
The previous SoundMap HTTP recorder remains a separate legacy mode. One callback
uses one captured tap reference through Prepare/Commit/Cancel, including if an
owner detaches or replaces the field while ReleaseBuffer is executing.

The local consumer writes `richaudio.wav` as lossless IEEE Float32 stereo 48 kHz.
Every retained submission has an `owned-index.ndjson` row with actual submitted
and producer-frame lineage, supplied/underflow/end-silence counts, preparation,
copy and successful-commit QPC observations. A failed ReleaseBuffer is cancelled,
not presented as successful playback or written as a submitted buffer.

The new loopback backend reuses the existing public Core Audio declarations. It
requests the exact supplied render endpoint by ID, verifies its flow and returned
identity, and uses shared-mode loopback. Original endpoint mix-format bytes,
channels and sample containers are written to a separate `loopback.wav`; there
is no stereo downmix or resampling. Packet device position, QPC, flags and host
acquisition bounds are retained in `loopback-index.ndjson`. Only an explicit
WASAPI SILENT packet creates corresponding zero bytes. Missing packets are not
silently filled. Native packet data is copied into a bounded queue and released
before the file-writing worker consumes it.

Loopback contains the selected endpoint's digital mix, potentially including
other applications. It captures no microphone and cannot measure the acoustic
response of speakers, headphones or the room. Protected or unavailable content
is not bypassed. Format/API failure stops recording rather than changing devices.

## Activation contract and remaining adapter

`RecordingReadiness` is an immutable process-owned snapshot with seven fields:

- `FeatureEnabled`
- `ExplicitUserStart`
- `TelemetryQualified`
- `HandoffQualified`
- `LivePcmVerified`
- `HumanListeningApproved`
- `LoopbackExplicitlyApproved`

All default to false. The first six are required by
`RecordingSession.TryCreate(workspace, options, readiness, out session, out reason)`.
Configuration alone is not approval or evidence; the production activation
evaluator supplies these facts only for the reviewed current scope/session.
Creating objects, reading settings or opening the menu cannot start capture.

The API provides `CreateOwnedTap`, nonblocking `RequestStop`, immutable `Snapshot`
and bounded completion/disposal. Explicit `StartLoopback(selectedOutputEndpointId)`
additionally requires loopback approval. Queued initialization and pre-Start
cancellation are checked; an already executing Windows API call cannot be
preempted. A fixture capability cannot use the real Core Audio driver.

The existing gameplay product branch remains locked. The qualified
`GameplayHost`/menu recording-controller adapter is **not wired in this increment**.
It must bind the ID of the actual `WasapiOutput` device, stop/quiesce any prior
legacy recorder, attach the approved local tap, and coordinate stop and status.
`WasapiOutput.SelectedEndpointId` is populated by GetId on the already selected
device only during future output startup; its constructor/getter opens nothing.
A failed identity query leaves it unavailable without changing existing playback.
Binding that value remains part of the adapter; the recorder has no default-device
or guessed-index fallback. No current feature flag launches this backend.

`TryDiagnostic` accepts bounded original JSON and explicit source-clock metadata
from an existing host/IPC control worker. It supplies the production extension
point for vehicle state/identity/position, listener/camera, source/playback state,
render processing timings and faults. It is not an implemented GTA telemetry
adapter and must not be called from native game fibers or the audio callback.
Admission is checked atomically after preparation; accepted rows are drained
before normal finalization. No SHV/RPH handle interchange is assumed.

## Files, bounds and failures

Files stay below `.local/recordings/audio-tests/capture-<id>/`:

- `richaudio.wav` and `owned-index.ndjson`
- Optional `loopback.wav` and `loopback-index.ndjson`
- `diagnostics.ndjson`
- `session.json`, including format, clock domains, outcome, frame counts and file hashes

There are no uploads and no automatic recording or deletion. Original failure
artifacts remain available for inspection. Files use CreateNew; existing linked
parents/files are rejected. A workspace lease prevents concurrent local sessions.
The filesystem checks do not constitute a security boundary against a hostile
same-user process replacing paths concurrently.

Duration is 1–120 seconds. The default all-file cap is 128 MiB, configurable from
1 MiB to 256 MiB. A 64 KiB final-manifest reservation, actual per-write admission,
a 1 GiB workspace recording cap, 128-session cap and 16 MiB free-space reserve
prevent unbounded storage. A high-channel/rate endpoint can reach the byte limit
before the duration limit; the actual reason is reported. There is no hidden
format conversion or normalization to fit a budget.

The owned queue is 64 × 2,048 stereo Float32 frames (1 MiB of sample storage).
Optional loopback queue storage is 16 × 262,144 bytes (4 MiB), with packets capped
at 8,192 frames. Diagnostics have a 128-row admission queue and 4 KiB row limit.
Queue overflow, storage failure, invalid timestamp/discontinuity, failed render
submission or lost lineage marks capture incomplete; it does not block or repair
the audio renderer. WAV headers and hashes are finalized off the audio thread.
Only complete output should be treated as a successful recording; data from a
failed capture can still be inspected with its missing/indexed-frame evidence.

Stop and joins are bounded. A Windows native/filesystem call can remain blocked;
the recorder reports an incomplete/stopping outcome and retains ownership of
resources rather than closing a stream underneath an active writer or claiming
hard preemption. Late producer completion may finish cleanup. No indefinite
caller wait or forced process termination is used.

## Time and alignment

Owned submission bounds use host `Stopwatch` ticks plus their frequency. A buffer
commit is an endpoint submission acknowledgement, not its physical presentation
time. WASAPI capture packet QPC is **converted to 100 ns units**, rather than raw
Stopwatch ticks. Both original values and domains are retained. See Microsoft's
[IAudioCaptureClient::GetBuffer contract](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudiocaptureclient-getbuffer)
and [WAVEFORMATEX contract](https://learn.microsoft.com/en-us/windows/win32/api/mmreg/ns-mmreg-waveformatex).

Independent game, telemetry and renderer origins are not equated by matching a
frequency or UTC. `ClockAlignment` requires an explicit source observation bracket
in host time and reports its minimum half-bracket uncertainty. Actual handshake,
drift validation and source-to-output presentation mapping remain integration
work. Original diagnostic records explicitly retain `clockMapping:null` until
such evidence exists. No absolute speaker or vehicle-response latency is claimed.

## Offline diagnostics

`src/acoustics/recording/analyze.mjs` reads bounded lossless WAV files and uses
built-in Node APIs only. Float64 decoding preserves normalized PCM32 low bits.
Duration and decoded-memory bounds are checked before allocating a sample array.
Measurements include peaks/near-full-scale samples, RMS/crest factor, windowed
dynamic range, silence runs, waveform edge candidates, stereo energy/balance,
bounded Hann FFT bands/centroid and conditional autocorrelation pitch changes.
These are measurable candidates, not automatic judgements about musical/vehicle
quality; real transients, gear changes and harmonic ambiguity remain possible.

The CLI can also read original submission indexes and diagnostic events:

```powershell
node src/acoustics/recording/analyze.mjs --owned <richaudio.wav> `
  --index <owned-index.ndjson> --events <diagnostics.ndjson> `
  --loopback <loopback.wav> --loopback-index <loopback-index.ndjson> `
  --output <new .local/analysis.json>
```

Recorded underflow/frame gaps, packet discontinuity/timestamp flags and explicit
processing timing/overrun events remain separate facts. If instrumentation was
not supplied, the result is unavailable rather than evidence of zero faults.
Envelope lag requires substantial overlapping activity and has at least a 10 ms
bin uncertainty; it is not absolute playback latency. Vehicle-response estimates
require an explicit source-clock-to-audio-frame mapping and a bounded search.

Final stereo cannot identify engine/exhaust component cancellation. The optional
component analyzer requires exact stems with matching recording/timeline identity,
sample index, format and zero declared alignment uncertainty. Such stems are
**not captured by the current final-output tap**; this diagnostic remains
unavailable for actual captures until those references are independently supplied.
Paired stock/RichAudio comparisons require separate approved recordings and
controlled conditions; no paired test or listening session occurred here.

## Offline validation and dependencies

Run `pwsh -File tools/Test-SynchronizedRecording.ps1`. It builds the actual host
and dedicated test executable into a new `.local/playable-08` folder. It never
launches the product host or activates an endpoint. Tests invoke the actual
production `WasapiOutput.Fill` with a managed fake render client and compare WAV
payload bytes against the exact post-gain buffers accepted by that client.

Additional controls cover failed submissions, callback-local tap swaps, queued
loopback cancellation before activation/Start, stop/admission races, raw/SILENT
packets, timestamp faults, byte/duration caps, queue overflow, storage exceptions,
PCM24 padding and explicit clock uncertainty. Signal tests cover known RMS,
spectral/pitch estimates, clicks/silence/clipping candidates, stereo imbalance,
conditional aligned-stem cancellation, lag negatives, PCM32 precision and actual
production-tap WAV/index analysis.

Dependencies are the installed x64 .NET Framework compiler/runtime, standard
Windows Core Audio APIs for future approved capture, PowerShell 7, and the existing
Node runtime for offline analysis. No package, driver, service or runtime install
was performed. Actual endpoint compatibility, sustained live throughput,
game/renderer timestamp handoff, listening and production readiness remain
**unverified and blocked by the acceptance sequence**.
