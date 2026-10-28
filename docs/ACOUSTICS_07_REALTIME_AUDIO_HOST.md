# ACOUSTICS-07 — My Windows audio host and owned synthetic-beacon bridge

## Executive outcome

I've built a running Windows shared-mode audio host and a causal acoustic producer. Original synthetic PCM reaches an actual Windows endpoint while source states arrive incrementally. Geometry runs in a separate worker; the endpoint thread consumes bounded, prepared PCM. This is more than a WAV player: the dynamic flyby changes source position, retarded emission time, spectral path gains and stereo direction during playback.

My three gates remain separate: **A**, ACOUSTICS-06's offline renderer, remains preserved; **B**, a measured development audio host, now functions; **C**, audible GTA integration, is **unexecuted**. My listener adapter compiles and its local protocol is tested, but I have not deployed it or launched GTA/RPH. Independent endpoint loopback verifies software delivery; my subjective listening acceptance and physical headset output remain unconfirmed.

This branch is stacked directly on PR #47 at `a695d34581fb167cc6ffacb696b23729b5162708`, through ACOUSTICS-05. It imports no benchmark or source-synthesis history. The separate ACOUSTICS-05 + BENCHMARK-01 milestone remains **60%**. No live credit is awarded for this work.

## Architecture and backend decision

I selected **WASAPI shared event-driven output**, implemented in original C# 5 against the installed x64 .NET Framework. It supports simultaneous ordinary Windows applications without an exclusive device, virtual driver or game hook. The [WASAPI overview](https://learn.microsoft.com/en-us/windows/win32/coreaudio/wasapi), [rendering contract](https://learn.microsoft.com/en-us/windows/win32/coreaudio/rendering-a-stream) and [format negotiation](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient-isformatsupported) define the interfaces used. XAudio2 is a credible alternative, but direct format, padding, clock and loopback inspection made WASAPI a smaller testable boundary here. No NAudio, native middleware or new runtime package was required.

The endpoint must explicitly accept **48 kHz stereo Float32** in shared mode. Unsupported formats are rejected before playback; there is no hidden resampler or channel substitution. The native mix format is reported separately. This is an intentional current compatibility limit, not universal device support. No Windows setting is changed.

```text
Read-only RPH listener / synthetic sender
  -> current-user local named pipe -> validated listener envelope
  -> bounded host control writer -> Node producer
  -> one pending request to geometry/history worker
  -> immutable-in-transit path snapshot
  -> bounded streaming DSP -> credited RA07 Float32 blocks
  -> C# single-producer/single-consumer ring
  -> WASAPI shared output
```

The existing JavaScript numerical implementation remains the oracle. I did not rewrite the geometry in C# merely to open a device. The separate process and credit buffer isolate device submission from JavaScript garbage collection, but do not eliminate deadline risks. The geometry worker remains on the producer's refill dependency path; missed refill deadlines stop output safely.

## Implementation map

| Files | Implemented responsibility |
|---|---|
| `src/acoustics/streaming/causal.mjs` | Rolling observations, causal retarded-time solver adaptation, generation-tagged PCM history, filters, fractional reads, stereo and finite releases |
| `src/acoustics/streaming/simulation-worker.mjs` | Geometry/history worker; one bounded request, current/past states only |
| `src/acoustics/streaming/listener-playout.mjs` | Fixed 100 ms retrospective listener buffer, bounded interpolation/prediction and explicit state-age diagnostics |
| `tools/Run-Acoustics07.mjs` | Live source synthesis, credits, listener mapping, controls, binary PCM, private timing receipts |
| `src/acoustics/host/Windows/` | WASAPI COM boundary, event thread, SPSC ring, process controls, format/device handling and optional private loopback |
| `src/acoustics/host/Transport/` | Bounded framing, strict neutral schema, QPC freshness, current-user pipe and bounded publisher |
| `src/acoustics/bridge/Rph/ListenerBridge.Rph.cs` | Opt-in read-only camera listener adapter |
| `tools/Measure-Acoustics07.mjs` | Independent offline-versus-streaming comparisons and CPU/storage measurements |
| `tools/Replay-Acoustics07.mjs` | Deterministic original five-scene incremental WAV replay, fresh private destinations |

The four ACOUSTICS-06 engine modules, local geometry, cache contracts and historical observations remain unchanged. Finite first- and second-order reflections, openings, every-leg visibility, authored material loss, explicit transmission, source directivity and retarded-time mathematics come directly from the existing solver. Unknown geometry remains unavailable. Scene names select geometry fixtures and never select an effect preset in the DSP.

## Causal processing and retained physics

The worker receives a monotonically timed snapshot, never a future movement trajectory. It retains 2.5 seconds of source/listener history, up to 1,024 observations, with a maximum accepted cadence of 240 Hz. Maximum represented propagation delay remains two seconds. Source/listener speed is bounded at 100 metric metres/second. An undeclared teleport, invalid orientation, excessive cadence or malformed session update is rejected.

At arrival time `t`, the unchanged solver obtains `te = t - pathLength(source(te), listener(t))/343`. Historical source poses are interpolated; the newest pose may be extrapolated using its declared velocity for **at most 50 ms**. Beyond that, paths become unavailable. The protocol's 250 ms stale threshold is a separate outer rejection bound; it is not a promise of 250 ms audible extrapolation. An actual 20 Hz device test exposed gaps when raw listener messages were passed directly into this horizon, so the final bridge uses the separately described 100 ms listener presentation buffer. The solver's 50 ms prediction bound remains unchanged.

Each path carries its stable identity, source generation, emission-frame position, read rate, three pressure gains and arrival pan. The DSP follows that emission cursor through circular PCM history. Variable read rate supplies Doppler once; there is no second pitch shifter. Successive causal updates estimate rate, so nonlinear motion is approximate rather than identical to an oracle that knows future movement. A bounded 20 ms cursor correction distributes small update errors. Errors larger than 50 ms restart that path from zero gain and increment a diagnostic counter.

The pressure model remains inverse distance with a one-metre near-field bound. Reflection energy becomes pressure through its square root. Atmospheric losses use amplitude-domain dB conversion. The same complementary 400 Hz / 4 kHz band filters and constant-power stereo remain active. This is geometric stereo, not HRTF; no late diffuse reverb, diffraction, calibrated SPL or new bass enhancement is introduced.

Each source has three Float32 history bands, integer frame tags and collision-free generation tags. New source/session identity cannot borrow old identity's samples. Emission stop writes smoothly reduced dry samples but preserves already emitted delayed sound; identity loss instead retires obsolete paths over a finite **20 ms** release. Path attack and ordinary gain/pan smoothing use a **10 ms** time constant. Missing worker controls independently trigger release after 150 ms. These controls avoid unbounded held sound; they do not prove arbitrary transitions inaudible.

Control or PCM validation failure is fatal for the producer. It is not permitted to resume a partly processed invalid block or partially applied control. The host mutes/stops and a fresh process is required. Distinct overlapping typed-array views are rejected before rendering.

## Beacon, ownership and controls

Every beacon is original generated audio with a stable `beacon-N` identity, bounded gain, generation, source clock and start/stop state. Available sounds are a harmonic tone, a four-harmonic pulse-like source and a periodic diagnostic impulse. None contains GTA recordings. The flyby follows a bounded continuously evaluated synthetic path; other scenes start with a stationary beacon. Multiple source positions and fundamental frequencies are distinct.

The host supports device inventory/probe/selection, scene and beacon selection, one to four sources, initial master gain and a maximum run duration. Interactive commands are `start`, `mute`, `resume`, `emit-stop`, `status`, `stop`; Ctrl+C also mutes/stops. Initial gain is **0.08**, with an explicit maximum of 0.25. Without `--autostart`, output is muted. The producer's source level and propagation master gain are fixed across scenes; files are not independently normalised. A linked 0.98 emergency peak guard is counted and was inactive in the reported tests.

`mute` acts on subsequent endpoint submissions, so already queued samples take finite time to drain. `emit-stop` stops new emission and retains bounded propagation tails. Device loss or producer starvation never automatically resumes sound. Device errors stop the host, release COM/MMCSS state and require an explicit new launch.

## Device thread and resource bounds

The C# ring has eight preallocated 512-frame stereo slots (32,768 PCM bytes). Four slots are initially credited; replenishment follows consumption. Each RA07 packet has a 16-byte magic/sequence/frame/flags header and at most 4,096 PCM bytes. Sequence, size, finite samples and credits are checked. The control queue is bounded at 64 messages and 16 KiB per message. There is only one outstanding simulation request and a bounded worker timeout.

The endpoint thread only waits on the Windows event, reads padding, copies/attenuates ring samples, submits buffers and records preallocated scalar timing. It performs no geometry, game call, pipe I/O, file logging, compilation or network request. A separate thread writes controls. This follows the same callback discipline described in [Microsoft's XAudio2 guidance](https://learn.microsoft.com/en-us/windows/win32/xaudio2/xaudio2-callbacks). COM interop and managed scheduling remain present; I do not claim hard real-time or isolated zero-allocation certification.

The DSP supports at most 16 sources and 12 selected paths/source, plus one equally bounded bank of retiring paths. Candidate counts inherit ACOUSTICS-06's geometry limits. Rank/prune uses current path gain, not future peak. Memory is allocated before the sample loop for source history and path banks. Worker/producer control objects still allocate. Host AppDomain allocated-byte counts cover **all host threads**; Node heap deltas are not allocation counts.

At the first real producer underflow, missing frames are counted and output stops. It does not insert silence indefinitely and later resume temporally stale PCM. EOF silence is tracked separately. Endpoint empty-padding observations, wake timeouts, producer shortages and loopback packet discontinuities are separate diagnostics.

## Neutral transport and read-only RPH adapter

The named pipe is `RichAudio.Acoustics07.Listener.v1`. A four-byte little-endian length prefixes strict UTF-8 JSON, maximum 4,096 bytes. The server ACL permits the current Windows user and explicitly denies network identities. There is no public socket, cloud endpoint, game-memory export or reverse command channel. Same-user processes remain a trust boundary; the ACL does not authenticate a particular executable.

The schema carries protocol version, ephemeral session, adapter generation, increasing sequence, QPC observation ticks/frequency, game clock, camera/player kind, position/velocity/orientation, velocity provenance, pause/validity/reason, coordinate/units and a null source identity. No persistent account identifier is collected. Malformed, oversized, stale, future, repeated and out-of-order observations are rejected; session/restart handling is explicit. The writer uses a latest-value slot, eight maximum connection attempts and bounded writes. Consumer failure cannot make the game thread wait indefinitely.

The adapter compiles against the genuine pinned RPH SDK **1.124.1393.17586**, SHA-256 `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0`. Its exact-build guards remain GTA Enhanced **1.0.1158.16** and RPH **1.132.1428.17748**. Compile success does not establish compatibility with any updated installation. It refuses unreviewed runtime/build combinations.

The adapter starts with sending OFF. `RichAudioBeaconStart`, `RichAudioBeaconStop` and `RichAudioBeaconStatus` control observation only, with a 20 Hz target, 120 seconds per start and three starts per plugin instance. Getters copy final rendered camera position/rotation, pause and game clock. Camera velocity is explicitly estimated from successive positions. ZXY orientation conversion is numerically tested; its actual GTA interpretation requires supervised validation. Network-session checks stop the observation loop outside the intended single-player environment.

The plugin has no world setter, spawning, physics change, audio mutation or collision query. It neither receives nor renders PCM. Its binary and vendor SDK remain private build artifacts and are not included in Git.

## Coordinates, clocks and latency

Synthetic replay uses `research-rh-z-up-metres-v1` / `metres`. The adapter declares `gta-native-unscaled` / `native-unverified`. For native messages the host **discards position and velocity for acoustic mapping** and applies orientation to a fixed listener in a labelled synthetic metric scene. This assumes the documented axis/orientation conversion only; it makes no GTA-unit-to-metre claim and no assertion that synthetic walls correspond to game buildings. Synthetic metric senders may supply position as well, within existing scene/bounds checks.

The first external listener changes session/generation and source history safely. It also stops the automatic synthetic flyby movement: the external-mode beacon is fixed. This keeps the first GTA experiment focused on orientation, not a hidden combination of independently moving test sources.

Negative mapped observation times are preserved, never clamped to zero and promoted to fresh evidence. The retrospective buffer may legitimately use such an observation after its warm-up; unavailable brackets, prediction expiry and wall-clock staleness still withhold output. An actual child-process regression caught and now rejects the falsely fresh 200 ms-old startup case. Both the C# pipe and the Node boundary validate the neutral schema, monotonic sequence/timestamp, generation, coordinate pairing and ownership fields.

The transport uses Windows QPC observation age, not GTA game-time deltas, for freshness. A game clock rollback or pause transition advances generation. The host adds control-queue wait to receipt age. Node maps receipt to its current **render-frame clock** and subtracts known receipt age. It does not assume Node and RPH monotonic clocks have the same epoch. Unknown pipe transit and scheduling jitter remain clock uncertainty.

For external listeners, a bounded 128-record / 2.5-second buffer evaluates the pose at `renderTime - 0.100 s`. It interpolates only between observations already received; it can predict at most 50 ms beyond the newest observation. A presented pose is then tagged with the current **presentation clock** for the acoustic worker. This is an explicitly delayed virtual listener, not a falsely fresh measurement of the current real player. Diagnostic status retains original observation age, interpolation/prediction mode and the 100 ms control delay. Source state in this first external mode remains stationary. Paused/invalid latest state is rejected immediately; missing data expires after the retrospective buffer and bounded prediction, and still obeys the independent wall-clock stale gate. Session/generation changes flush the buffer. Coordinate representation changes, teleports and ambiguous orientation changes cannot be blended across an unchanged generation.

This mapping is deliberately **receipt-anchored**, not hardware-clock synchronisation. Render time leads audible device time by queued PCM and the endpoint. The four-credit operating depth is up to 42.67 ms; the eight-slot hard capacity is 85.33 ms. The observed endpoint buffer is 22 ms, with a 10 ms device period. These queue budgets, the new 100 ms presentation delay, IPC age and acoustic travel time are separate. A reported zero `GetStreamLatency` value does not mean zero physical output latency. RPH 20 Hz sampling adds up to a nominal 50 ms sampling interval before transport. End-to-end GTA motion-to-ear latency remains unmeasured.

## Numerical validation and replay

The independent oracle comparisons retain a declared 300 ms dry-emission warm-up in both implementations and perform no fitted phase/time alignment. Predeclared relative RMS limits were 0.1% for static scenes, 5% for linear motion and 12% for the nonlinear flyby; frequency error must remain below 0.5 Hz.

| Test | Actual result |
|---|---|
| Static direct | Exact compared waveform |
| Ground, canyon, obstruction | Approximately `4e-8` to `9e-8` relative RMS |
| Approach/departure/moving listener | Main-channel relative RMS below 0.72% |
| Flyby | 11.35% left / 10.86% right; passes the declared 12% gate but is materially different from the oracle |
| 1 kHz approach at 20 m/s | 1061.919505 Hz, analytical `1000*343/323` |
| 1 kHz departure at 20 m/s | 944.903581 Hz, analytical `1000*343/363` |
| Moving listener at 20 m/s | 1058.309038 Hz, analytical `1000*363/343` |
| Ground impulse | After emission: direct 1399.416910 frames; reflection 1427.130826 frames; two-tap fractional arrival/amplitude checks pass |
| Evaluated slower 1,024-frame control cadence | Flyby 19.96% / 19.13% error: **rejected**; actual host retains 512 frames |

Nominally silent channels have tiny numerical leakage; relative error there is ill-conditioned and absolute RMS is reported. Sample-level frequency precision is a deterministic synthetic result, not perceptual or device-clock accuracy. These tests do not establish smoothness under arbitrary low-rate GTA telemetry.

Original five-scene incremental WAV replays were generated in a new private directory, with finite PCM and zero clipping. All 16 historical ACOUSTICS-06 WAVs matched both their preserved hashes and fresh regeneration, and all four historical engine modules remain byte-identical. See `evidence/acoustics07-streaming-validation.json` for sanitised scalar evidence.

## Actual Windows output and performance

The tested default Windows endpoint accepted exact 48 kHz stereo Float32. Known-WAV loopback independently matched **670,080 individual channel samples (335,040 stereo frames) exactly**, including the commanded mute interval, after Float32 conversion and fixed 0.08 master gain. This verifies format, channel delivery and software mute, not human hearing. One loopback startup packet discontinuity was reported; no timestamp errors were reported. Loopback is opt-in, contains the shared endpoint mix, and remains private. It is never permission to capture GTA or unrelated application material.

Dynamic and soak receipts are separate from this known-file device smoke test:

| Actual device workload | Duration | Maximum paths | Producer underflows / empty-padding events | Relevant measured cost |
|---|---:|---:|---|---|
| Incremental moving flyby | 8.03 s | 4 | 0 / 0 | Host submission median 0.010 ms, max 0.216 ms; producer DSP median 0.070 ms |
| Incremental urban beacon soak | 60.02 s | 6 | 0 / 0 | Host submission median 0.0087 ms, max 0.233 ms; DSP median 0.102 ms; simulation median 0.179 ms |
| Four incremental urban beacons | 15.03 s | 30 | 0 / 0 | DSP median 0.502 ms, max 2.855 ms; simulation median 0.651 ms, max 3.648 ms |

The 60-second host used 0.328 CPU-seconds, approximately 25.6 MB working set and 2.312 MB AppDomain allocations; the producer used 3.203 CPU-seconds and approximately 80.9 MB RSS. The four-source producer used 1.672 CPU-seconds and approximately 90.8 MB RSS. These are separate process measurements, not percent CPU utilisation during GTA gameplay.

The offline 16-source/192-path workload measured approximately 3.18 ms median DSP, 4.01 ms maximum, and 6.64 ms median / 8.30 ms maximum observation-plus-simulation cost. Source/path typed-array storage was approximately 46.1 MB. This did **not** predict successful device operation: the attempted 16-source run reached 92 paths and stopped after approximately **0.208 seconds**, with its first missing frame at 3,072 and 384 underflow frames. Cold DSP reached 11.377 ms and simulation 6.935 ms. It was not a completed ten-second run or the identical 192-path offline workload. The host failed closed, and I limited its public source count to **four**; the producer's 16-source capacity remains available only for offline measurement. I did not tune/retry that stress case to hide the result.

An independent silent starvation fault deliberately withheld PCM after four prefilled blocks. The device stopped at the first missing frame, exactly 2,048, rather than replaying late data. These negative tests demonstrate safe stopping, not a larger performance envelope.

The initial named-pipe-to-PCM-to-endpoint test accepted 101 synthetic listener states with zero transport rejection or producer underrun. A timestamped 90-degree listener change altered captured stereo energy balance from approximately -0.959 to zero, with a 96.45 ms half-change measurement. However, a subsequent independent capture check exposed **27 exact-zero runs totalling 5,851 frames** (approximately 122 ms; longest 577 frames) during valid updates, before disconnect. That unbuffered implementation is **not accepted as continuous**. Zero device underruns did not reveal these DSP gaps. All failed captures and receipts remain preserved. The 100 ms retrospective buffer was added specifically to correct this measured defect; it trades additional control latency for supported interpolation rather than extending prediction indefinitely. Final buffered results are recorded separately in `evidence/acoustics07-device-validation.json`.

The final buffered device rerun accepted **101 states**, with zero transport rejection and zero device/producer underruns. Independent analysis of the identical **0.5–4.9 second window found zero exact-zero runs and zero all-zero PCM frames**. This does not prove every interpolation tap was available: the aggregate missing-history tap count remained 2,906, without an interval-resolved tap audit. The direction-step energy balance changed from approximately -0.984 to zero; the half-change measurement was **149.22 ms**, using a 5 ms analysis window. Complete silence occurred approximately **239.21 ms after the last observed state**. There was an explicit initial history-priming gap at approximately 0.105–0.153 seconds, outside that steady-state check, plus one startup loopback discontinuity. This is a qualified steady-state continuity result, not a claim of gap-free startup or physical listening. Capture contained 379,680 stereo frames, finite samples, peak 0.001522 and no timestamp errors. Host submission p99 was 0.0139 ms and maximum 0.2479 ms. An independent synthetic jitter-to-playout-to-DSP regression also checks over 120,000 continuous post-warm-up frames, rather than relying only on endpoint counters.

Device-loss behaviour is implemented as fail-closed and offline lifecycle tested; no physical headset unplug/replug is claimed unless separately recorded. No GPU claim, two-hour soak or hard real-time certification is made. The one-minute soak is deliberately bounded research evidence.

## Build, replay and launch

Prerequisites: Windows x64, installed .NET Framework 4.x compiler, Node.js (development used 24.19.0), and an endpoint explicitly accepting the requested format. There are no npm or NuGet runtime dependencies. RPH is required only for the optional bridge build and future separately approved game test. Framework/Windows binaries are operating-system dependencies, not redistributed artifacts. No project licence has been selected.

From the research checkout:

```powershell
./tools/Build-AcousticsHost.ps1 -Tests
./tools/Test-BeaconTransport.ps1
node --test tests/Test-AcousticStreaming.mjs
./tools/Test-Offline.ps1
node tools/Replay-Acoustics07.mjs .local/my-fresh-a07-replay
./build/acoustics-host/RichAudio.Acoustics.Host.exe --list-devices
./build/acoustics-host/RichAudio.Acoustics.Host.exe --probe-device --device default
./build/acoustics-host/RichAudio.Acoustics.Host.exe --scene flyby --beacon harmonic --sources 1 --seconds 15 --gain 0.08 --autostart --output .local/my-fresh-a07-host
```

Use `--scene open-road`, `urban-street`, `obstructed-corner`, `enclosure` or `flyby`. `--beacon pulse` and `impulse` select the original diagnostic sources. Every output destination must be new, under `.local`, and free of unexpected reparse points. The host never overwrites historical recordings. Optional `--loopback` records a bounded private endpoint validation capture; close unrelated audio first and do not use it to capture the game.

For synthetic listener transport, start the host with `--listener-pipe`, then run the built transport test executable with `--send --seconds 5` in another console. Build the optional plugin offline with:

```powershell
./tools/Build-BeaconBridge.ps1 -SdkPath <authentic-private-SDK-path>
```

The build produces `build/acoustics07/transport/RichAudio.Beacon.Rph.dll`; it does not install it. The private receipt records SDK and output fingerprints. Treat shell angle-bracket placeholders as values to replace, not literal commands.

## Limitations and next safe live experiment

My next step is **one separately approved orientation-only synthetic-beacon test**. First review the actual installed Enhanced/RPH versions against the strict bridge guards; a changed build requires a compatibility decision before deployment. Prepare a reversible, fingerprinted deployment using the existing runtime procedure. Keep the independent host at conservative gain, one fixed owned beacon and a synthetic open-road scene. Start listener transmission manually, rotate the camera while stationary, then stop transmission and verify bounded silence. Confirm native GTA sound continues normally. Quit and restore/verify every temporary deployment path.

That test would establish only a read-only GTA-state-to-owned-audio connection. It would not prove metric GTA propagation, real-building reflections, native sound suppression, calibrated environmental mapping, Bati control or stock-sound replacement. No new scans, vehicles, native sound hooks or acoustic ownership transfer are part of it. I have not executed this test.

Before broader use I still need independent human listening, exact-build bridge execution, real movement/latency measurements, longer stressed device tests, richer endpoint format support, measured recovery from physical device loss, and a better clock mapping if physical timing requires it. The nonlinear flyby error and 50 ms prediction limit are explicit engineering bounds, not hidden successes.

## Publication record

The final registered offline workflow passes **333 Node tests**, including 44 streaming/replay tests, 25 actual producer subprocess tests and 17 listener-playout tests; **642 host assertions**, **47 transport cases**, and **498 existing managed/file checks** also pass. Device tests are separate and opt-in; hosted CI never opens an endpoint or requires GTA/SDK binaries. The plugin's private SDK build succeeded separately. Current test counts are assertions/cases as labelled, not a claim of hundreds of distinct hardware experiments.

Branch: `research/acoustics-07-owned-beacon-host`. Base: PR #47's verified commit above. Implementation commit: `947bf0c1c5bdbc71830ae24d8c58ece5c43d043d`. [Draft PR #48](https://github.com/icydv/RichAudio/pull/48) contains the implementation and publication follow-up; its [Checks view](https://github.com/icydv/RichAudio/pull/48/checks) identifies the current tested head. The exact final publication revision and completed hosted result are recorded in the PR description after readback, avoiding a self-referential commit hash in this document.

The staged publication scan has zero findings. Full-history review retains only five previously reviewed non-personal GitHub committer exceptions; no new identity exception was introduced. Git integrity passes. Private output, endpoint identities, QPC traces, raw coordinates, vendor binaries and audio captures are excluded. Source snapshots and game recordings from prior milestones are unchanged. The nine ACOUSTICS-07 implementation/publication checkpoints are separate from subjective listening and the unexecuted GTA gate.
