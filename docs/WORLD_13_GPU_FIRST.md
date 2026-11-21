# WORLD13 GPU-first addendum

My GPU-first directive now applies to this milestone and all subsequent acoustic-engine development through [AGENTS.md](../AGENTS.md). I want qualified medium/large workloads to prefer GPU when complete measured costs improve CPU overhead, deadlines and gameplay impact. CPU remains appropriate where it is faster or safer. The target starts with RTX 2080 Super /Ryzen 7 5800X and remains vendor-neutral; DirectCompute does not require NVIDIA libraries or RTX ray-tracing cores.

The sealed CPU investigation and first hosted run remain at `dd1a2127af752c675fa551b0084e4e802f159127`, with their own [publication seal](../evidence/world13-publication-seal.json). This addendum does not relabel that candidate or its results. It adds a narrow GPU initialization/shutdown correction, offline controls, and a complete-cost qualification plan. It introduces no synthesis, reflection-solver, shader or PCM rewrite.

## What the existing GPU backend actually accelerates

The existing [DirectCompute backend](../src/acoustics/gpu/README.md) returns conservative potential-surface masks. Exact CPU geometry/opening/uncertainty rules, finite reflection preparation/completion, retarded propagation, materials, source synthesis and causal PCM remain authoritative. In the local largest instrumented blocks, CPU visibility is only **0.4203 ms on Node22 /0.3197 ms on Node24** inside the approximately 2.8–2.9 ms control envelope; other CPU path preparation/completion remains. The roughly **10.1 /10.6 ms source synthesis** is separate work.

The first hosted Node22 maximum is **40.4932 ms**. Its visibility CPU interval is **0.0378 ms**, while the observed control-filter and PCM intervals are **17.1924 /17.0918 ms**. Quantized CPU counters are zero in that block; no scheduler, JIT or GC cause is established. A faster existing visibility shader cannot be credited with eliminating those other intervals.

Existing local functional evidence does establish real RTX 2080 Super execution on original fixtures: a 4,068-segment /520,704-pair device comparison records roughly **0.10 ms shader time**, **1.3–1.5 ms helper time** and **15.6–16.1 ms Node roundtrip**. That device test permits 100 ms and therefore does **not** qualify the 8 ms acoustic budget. Other original producer tests apply real GPU results and retain exact CPU/Auto PCM, but Auto chooses differently between runtimes and short quantized CPU baselines can be zero. Neither shader time nor those short tests establish complete-engine savings. Hosted software-adapter skips supply no hardware-performance proof.

## Smallest implemented extension

Independent source review found that calling `AcousticGpuClient.close()` during pending capability initialization killed the helper but left `capability()` unresolved. Its later exit callback reached an already-closed guard. A true pre-fix process fixture reproduces the unresolved promise; its failure and original client hash remain preserved.

The correction settles initialization exactly once, rejects pending dispatch, ignores late protocol bytes and keeps `close()` synchronous. An opt-in bounded `waitForClose()` observer distinguishes no process, failed launch, actual exit and actual child/stdio close. A timeout stays an unjoined/unknown result; it is not zero helper CPU or successful cleanup. This observer belongs to offline supervision or background shutdown, never the PCM/WASAPI callback. It changes no 8 ms dispatch deadline, 5,000 ms default initialization limit, buffers, source history, path count, gain or calibration.

Seven new original process/protocol controls plus twelve existing acceleration/geometry policy controls pass separately on Node22 and Node24. Their helper uses no Direct3D, audio, game or private resource API. These tests qualify cancellation/readiness contracts, not actual GPU speed, device loss or game-rendering contention. CPU fallback remains exact and lazy; CPU mode does not start a GPU client. The [addendum result](WORLD_13_GPU_ADDENDUM_RESULT.md) records the final code, independent review and validation identities.

## GPU work to qualify next

| Work | Smallest useful investigation | Current qualification |
| --- | --- | --- |
| Finite occlusion | Retain conservative masks, exact CPU refinement and unknown coverage; measure complete pack/submission/readback cost and reduce repeated immutable-tile preparation only if it pays | Existing hardware execution/equivalence, complete gameplay benefit unqualified |
| Reflection/path solving | Batch independent finite candidates; preserve exact ordered decisions, uncertainty, topology and material authority | CPU implementation retained; GPU extension unimplemented |
| Material interactions | Evaluate batched path-band work with exact required precision and full remaining CPU cost | No demonstrated GPU net benefit |
| Environmental reverberation | Investigate asynchronous geometry/IR preparation and bounded update publication before any callback DSP offload | Not implemented or qualified |
| Grain matching | Evaluate independent candidate scores in one ordered FP64 batch with resident authored samples and one final same-block readback | Plausible target; capability, exactness and net benefit unqualified |
| Causal PCM | Evaluate only at sufficient independent path/source batch size; preserve sample recursion and exact accumulation/history | No verified benefit over the measured sub-millisecond local PCM path |

The [source assessment](WORLD_13_GPU_SOURCE_ASSESSMENT.md) distinguishes cold score-call measurements from the main warmed source phase. Sequential clocks, heads, RNG, grain selection and custom-reader observation cannot be assumed parallel or silently changed. No extra PCM queue or block of lookahead is available to hide a readback.

## Auto policy and complete-cost qualification

Current Auto already keeps small workloads on CPU and runs bounded shadow comparisons for eligible visibility batches. It requires repeated wall/CPU wins before applying GPU results. That qualification is visibility-only. Short zero-valued CPU counters are an unresolved measurement, not evidence that GPU is slower or free. The current stock startup also declares Auto settings before the default-CPU backend receives a settings update; that startup-policy mismatch must be addressed with explicit readiness tests before broader Auto promotion. Neither policy is silently changed in this addendum.

The next qualification must extend Auto toward GPU-preferred medium/large execution using **aggregate complete-cost evidence** keyed to actual adapter/driver, backend/shader version, workload/scene class and resource generation. It must retain CPU where faster/safer, explicit GPU mode, hardware/software identity, fallback reasons and unqualified measurements. A change of scene, device, workload or late/invalid result must withdraw stale qualification. GPU saturation and game-rendering contention require bounded asynchronous work and safe CPU continuation, with no source reset or indefinite wait.

The existing `Measure-AcousticAcceleration.mjs` is a useful original-core comparison, but its helper close is not independently awaited, rejected/late helper CPU tails are unknown, and it lacks an outer owned-process lifetime bound. Its warmup/order and simulation-only scheduling scope are explicit. It is not reused as complete-cost acceptance merely because a device test passes.

The smallest next **original-only hardware experiment** must:

1. Freeze exact CPU/GPU/Auto code and original bank/finite-scene inputs. Keep 512 frames /48 kHz, hard 10.666666666666666 ms and 8 ms target. Counterbalance preselected repetitions and cold/initialized cases; never retry a slow or failed case.
2. Independently supervise and join the Node coordinator and native helper with fixed time, output, CPU-memory and GPU-resource bounds. Record failed launches, cancellation, late work and helper CPU through terminal closure; unknown tails remain unknown. The new joined-close observer is one prerequisite, not a complete supervisor.
3. Measure actual StockGameplay source/control work and PCM: CPU preparation and remaining exact solving, serialization/submission, upload/copy/readback, helper plus Node CPU, full worker/PCM deadlines and source/scene publication latency. Retain every block, maximum, p95/p99, source history, paths and exact required PCM.
4. Compare CPU baseline and CPU fallback separately from successful GPU execution and shadow-calibration overhead. Test bounded queue pressure, supersession and late results with original fixtures; distinguish simulated disconnects from observed hardware device removal.
5. Record GPU buffer ownership, driver/runtime usage and budget separately; measure contention with a bounded owned graphics/compute workload before any separately approved GTA frame-time/FPS experiment. No offscreen test is game-performance proof.
6. Require repeated end-to-end CPU and deadline benefits before promotion. A fast shader with slower total worker, changed PCM, extra buffering, resource overrun or uncertain cleanup remains unqualified.

DXGI event completion can also signal device removal, so hardware diagnostics must retain the actual query/map HRESULT and device-removal reason; an event alone is insufficient. GPU timestamp results require qualified non-disjoint frequency data. Memory CurrentUsage is not total device saturation or free game headroom. Relevant primary references are [event completion](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_2/nf-dxgi1_2-idxgidevice2-enqueuesetevent), [timestamp qualification](https://learn.microsoft.com/en-us/windows/win32/api/d3d11/ns-d3d11-d3d11_query_data_timestamp_disjoint) and [video memory budget/usage](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_4/ns-dxgi1_4-dxgi_query_video_memory_info).

No new hardware benchmark or GTA/frame-time experiment is claimed by this increment. No installed resource, private bank, key, bootstrap or capture is accessed. No actual endpoint, recording, game launch, deployment, native suppression, developer contact or merge is authorized or performed by this addendum.
