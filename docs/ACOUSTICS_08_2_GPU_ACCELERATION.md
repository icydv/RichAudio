# ACOUSTICS-08.2 — GPU visibility and functional acoustic quality

RichAudio now has an optional **real Direct3D 11 compute backend**, a complete CPU route, and persistent interactive acoustic controls. The RTX 2080 SUPER executed acoustic visibility batches whose results reached the existing finite-path solver, observed-geometry worker and 48 kHz stereo RA07 producer. No GTA/RPH process, game deployment, audio endpoint, playback/capture, installer or system change was used for this increment.

This increment starts at PR #71's `9c7d48f3543afb9424758358f1851f662394c025`. It preserves the publisher, neutral listener protocol, finite observation support, paired clocks, original geometry leases, source ownership and benchmark research. The existing direct/first-/second-order engine remains the renderer. Higher reflection orders and environment-supported late reverberation remain the [standing architectural requirement](../ARCHITECTURE.md#governing-acoustic-requirement--29-october-2026), not implemented features of Max.

## What actually runs on the GPU

The expensive visibility loop previously tested every finite surface against every candidate path segment. `gpu/FiniteCull.hlsl` evaluates conservative segment/surface AABB overlap and plane-side rejection in parallel. One 128-thread group handles each segment; four uint32 masks describe the potential contacts among at most 128 surfaces. The GPU therefore removes definitely clear CPU intersection tests; it does not merely calculate unused diagnostics.

The CPU still solves retarded emission time and finite image-source reflection vertices. Potential GPU contacts then pass through the unchanged exact double-precision finite rectangle/convex-footprint/opening, grazing, ambiguity and missing-region rules. Material bands, propagation delay, arrival/emission directions, Doppler, path identities and PCM rendering remain shared. CPU/GPU comparisons require exact path controls and bit-identical Float32 PCM; no numerical tolerance was needed in the measured cases.

Coordinates are translated to the tile's local origin before FP32 packing. The 0.005 model-metre culling margin retains boundary cases for exact CPU refinement. It is a numerical guard, not measured GTA scale or additional physical reflector extent. The original observed provenance, uncertainty and finite support remain authoritative.

The standalone helper owns its D3D11 device and selects a supported hardware adapter, preferring greater dedicated video memory. It rejects software adapters rather than calling WARP a hardware result. DirectCompute is vendor-neutral, but only the RTX 2080 SUPER was hardware-tested here; AMD, Intel and hybrid-GPU behavior remain unverified. **This is compute-shader execution, not DXR or RTX ray-tracing-core execution.** Ray-tracing capability is not probed and no hardware ray-tracing backend is implemented. [Backend/API details](../src/acoustics/gpu/README.md).

## Bounds, clocks and failure behavior

- GPU submission/readback runs in the simulation worker and its owned helper process. The synchronous sample loop and WASAPI callback contain no GPU calls or GPU waits. The existing producer still waits for completed worker controls between blocks; a worker/DSP overrun can therefore delay PCM production. No buffer or listener-delay increase hides that limitation.
- One GPU request may be in flight. A batch has at most 4,096 segments and 128 surfaces; a prepared acoustic update is capped at 16,384 segments and splits only within its total budget. Input buffers and D3D resources are bounded/reused. The normal GPU query deadline is 8 ms, including submission, transfer, completion, readback and exact refinement; this is not a promise that the whole acoustic block takes 8 ms.
- Device initialization and one explicitly labelled warmup are asynchronous. CPU processing continues while they run. The warmup is not counted as an acoustic dispatch. Initialization took roughly 160–220 ms and first wire dispatch roughly 8–13 ms in development measurements; cold GPU work must not be presented as steady-state timing.
- Request/generation IDs, framing, finite coordinates, surface-mask range, completed hardware dispatch and actual elapsed deadline are checked. Unsupported/unbuilt devices, bad results, disconnect, contention or deadline failure explicitly select CPU. Cooldowns and at most three initialization attempts bound retry work. The owned helper exits on closure/stdin EOF; a forced-owner-exit check observed cleanup within 4.44 ms without a launcher framework.
- Prepared path frames also carry accepted-observation and preparation sequence tokens. Changed session/source/pose, scene, quality context, duplicate completion or superseded work is rejected before updating path-rate history. The real worker serializes requests. Backend and quality switches retain source IDs, rings and history; they do not manufacture new geometry generations.
- Observed input rechecks its authentic clock/lease before and after asynchronous work and after final path calculation. A GPU result cannot rejuvenate expired geometry. Unsupported geometry fades through the existing mechanisms; no synthetic scene substitutes for unavailable observations.

GPU timestamp-disjoint queries qualify execution/transfer measurements; unavailable timing stays unknown. CPU accounting distinguishes Node stages, helper work and aggregate process totals. Windows counters can quantize individual tasks to zero; those zeros are not evidence of free CPU. Savings below use aggregate Node plus helper CPU deltas for identical audio duration, excluding separately reported startup/warmup.

## Settings that work

Build the existing host, GPU helper and small WinForms editor:

```powershell
./tools/Build-AcousticsHost.ps1
./tools/Build-AcousticGpu.ps1
./tools/Build-AcousticSettings.ps1
```

Run `build/acoustic-settings/RichAudio.Settings.exe` to use the five-position **Acoustic Quality** slider and independent **Auto / CPU / GPU** acceleration selector. Save writes validated JSON atomically to private `.local/acoustic-settings.json`. This editor does not open an audio endpoint or launch the host/game.

```json
{"schemaVersion":1,"revision":1,"acousticQuality":"quality","acousticAcceleration":"gpu"}
```

The next incremental host launch automatically loads the saved file. Existing host and producer command paths also accept `--acoustic-quality auto|performance|balanced|quality|max` and `--acoustic-acceleration auto|cpu|gpu`; the host accepts `--acoustic-settings <private-file>` for a custom file. These are processing arguments, not authorization to launch a live session.

Save before the first configured host startup so its maximum renderer capacity can be reserved. Later saves hot-apply through a 250 ms background monitor and the existing bounded host control queue; they do not restart the host. CLI values override the initial file selection; a later higher revision can apply new UI values. A legacy host started without these controls needs a configured startup before live quality changes are possible. Malformed/non-increasing revisions are rejected while the last accepted settings remain in use. Known-WAV playback ignores implicit saved incremental preferences and rejects explicit processing controls, preserving that existing route.

The editor displays selected values and fresh **actual** worker status, active quality/backend, device/capability, fallback reason and deadline/drop counts. Offline, stopped, stale or invalid status is labelled unavailable. Its active labels do not infer GPU execution from the requested selector. Detailed diagnostics include submission/execution/readback, CPU reference/task timing, memory and automatic decisions.

| Quality | Total direct + early-path ceiling per source | Selected reflector ceiling |
|---|---:|---:|
| Performance | 12 | 8 |
| Balanced | 16 | 8 |
| Quality | 32 | 12 |
| Max | 64 | 16 |

These are genuine contribution budgets, including direct sound, not a demand to invent reflections. A valid direct path is retained when selecting the explicit quality budget. With only two qualified GTA patches there may be few valid paths in every preset. The demanding authored scene actually supplies 12/16/32/64 selected paths per source; a simpler enclosure supplies fewer than 64. Order remains at most two and no late reverberation is synthesized.

The solver, offline preparation, causal simulation and streaming renderer share the expanded absolute bounds. Without a settings file/flags, legacy defaults remain 12 paths / eight reflectors and the original beacon fingerprints remain unchanged. Opted-in renderers preallocate 64-path capacity and bounded release banks, then visit occupied slots; switching budgets does not allocate new source rings.

**Auto acceleration** leaves small workloads on CPU without initializing a GPU device. Larger workloads obtain actual equal-input CPU/GPU timing evidence; one shadow calibration uses the already-computed CPU result immediately rather than holding it for GPU completion. Repeated measured CPU/wall wins, workload bins, deadline evidence and two-second dwell/cooldown decisions govern offload. New/late inputs do not inherit an unsupported qualification. Explicit GPU forces genuine offload where supported, even when CPU would be faster, and reports any fallback.

**Auto quality** starts/requalifies at Performance. It increases only with additional valid path demand, at least 128 fresh samples and eight seconds of measured headroom. Moderate pressure lowers quality with a two-second downgrade hold; severe overruns immediately return to Performance. Fixed presets retain the user's selection and report misses. Quality and acceleration remain independently selectable.

## Measured comparison

The quiet comparison used 27 cases: small one-source and demanding four-source scenes, all four fixed qualities with CPU/GPU/Auto acceleration, plus runtime budget transitions. Each measured case rendered 160 × 512 stereo frames (1.7067 audio seconds) from identical original 95 Hz harmonic sources, poses and geometry. All 18 CPU-versus-GPU/Auto control and PCM comparisons were bit-identical. Every fixed GPU case used 160 completed/applied acoustic GPU results. No clipping, nonfinite samples, limiter action, cursor resets, path overflow or missing weighted history occurred; history initialized once.

The demanding scene has 128 finite authored surfaces. Its four sources produce 48/64/128/256 selected contributions. Measurements below cover the complete causal simulation method, not merely the shader; the additional DSP column is separate.

| Preset | CPU time, CPU → GPU (ms per fixed audio interval) | CPU saving | Simulation p95, CPU → GPU (ms) | GPU DSP p95 (ms) | GPU full-block misses / 160 |
|---|---:|---:|---:|---:|---:|
| Performance | 2,063 → 781.5 | 62.1% | 10.99 → 3.43 | 0.76 | 0 |
| Balanced | 1,953 → 797.6 | 59.2% | 11.65 → 3.78 | 1.40 | 0 |
| Quality | 4,218 → 1,436.6 | 65.9% | 24.70 → 6.42 | 2.05 | 5 |
| Max | 6,860 → 2,499.5 | 63.6% | 38.44 → 10.60 | 5.08 | 155 |

The block period is 10.67 ms. **Max at four sources in this demanding scene is not deadline-safe; Quality also has misses.** The block measurement includes benchmark control hashing; even without that overhead, Max's simulation plus DSP costs do not establish adequate headroom. These controls are functional capacities, not certification of reliable live Max playback. The earlier 11.5 ms cold observation and 231 ms hosted maximum remain historical timing evidence, not resolved by a small shader time.

GPU shader p95 across these presets was approximately 0.011–0.023 ms; submission, transfer, exact CPU refinement, retarded-time solving and DSP account for the rest. The small scene's visibility median was approximately 0.006 ms CPU versus 0.256 ms forced GPU, so Auto correctly chose CPU throughout. Auto used GPU throughout the demanding fixed-preset measured intervals. During a changing-load case, Auto rejected one late GPU result and conservatively returned to CPU; PCM remained exact, but CPU savings were smaller. This is useful adaptation in the measured cases, not an optimality guarantee for every workload.

Renderer-owned typed storage is 2,886,656 bytes per configured source, approximately 11.55 MB for four. Explicit D3D buffers total 270,352 bytes; observed DXGI process local usage was about 7.61 MB and helper working set about 53 MB. The long sequential harness's Node RSS high-water mark includes accumulated fixtures/comparisons and is not an isolated host memory budget. Scalar evidence retains CPU utilization, process/resource memory and latency scope separately.

## Actual transport/producer verification

- The real C# observation publisher, named-pipe transport and host relay were exercised with the GPU-enabled worker and actual RA07 producer, using deterministic collision fixtures and authentic paired clocks. The RTX 2080 SUPER completed/applied 91 acoustic batches; exact Float32 replay and first/second-order reflection contribution checks passed. Original leases expired correctly, with one source-history initialization and no PCM/history violations.
- That observed route measured GPU-query p95/max 1.419/4.542 ms and no GPU deadline misses. One overall startup scheduling miss occurred while emission was idle, geometry unavailable and the backend CPU; it is retained, not hidden as a GPU success.
- A separate actual credit-paced CPU/GPU/Auto producer comparison used matching Quality settings and identical input. All stereo Float32 samples matched exactly; real GPU controls were applied. Worker scheduling latency was measured separately from core calculation, including an approximately 53 ms initial scheduling maximum. No device-underrun claim follows from this silent replay.
- Actual WinForms slider Save → persisted file → host monitor/queue/writer → worker → status and PCM was tested. Performance → Max → Performance increased valid enclosure paths above 12 while preserving identity, rings and clean shutdown. No visible window or WASAPI object was required by that fixture.
- A real monotonic-time, measured-feedback producer run with Auto quality and CPU acceleration promoted Performance to Balanced after sustained headroom (321 samples), while preserving history and unclipped finite PCM. Unit fixtures separately exercise pressure, cooldown, stale measurements and severe downgrades.

Reproduce with `./tools/Test-Offline.ps1`. Real GPU checks run only on supported hardware; elsewhere CPU/selection regressions run and hardware execution is explicitly unverified. `node tools/Measure-AcousticAcceleration.mjs --require-hardware` generates fresh private comparisons and original WAVs. The observed route can be checked with `./tools/Test-GeometryLive.ps1 -AcousticQuality quality -AcousticAcceleration gpu`. No command here is a game launch or deployment procedure.

Public [scalar evidence](../evidence/acoustics-08-2/result.json) omits raw machine identifiers, paths, transport captures and WAVs. Final publication/CI status is recorded against the exact head/tree in the draft PR. No live authorization was created.

## Completion and next engineering step

25%: CPU/GPU interface and authentic capability detection. 50%: completed hardware visibility results connected to the existing solver. 75%: independent quality/acceleration settings and matched real-GPU PCM comparisons. 100%: focused regressions, benchmarks, diagnostics, documentation and publication gates; actual hosted CI status belongs to the published PR record.

The next practical work is reducing the remaining CPU retarded-path, control and DSP cost at 32/64 paths, and validating the producer's deadline behavior under bounded contention. Actual GTA rendering competition, game frame rate, endpoint underruns and subjective sound remain unverified. A future supervised game test needs reviewed fresh host/helper/producer bindings and the existing applicable authorization; nothing in this increment launches or authorizes it. Historical sealed candidates and all results remain intact: original CI failure cause unknown; 07.9 incomplete with failed Stop timing; 07.13 failed at launch; combined ACOUSTICS-05 + BENCHMARK-01 remains **60%**.
