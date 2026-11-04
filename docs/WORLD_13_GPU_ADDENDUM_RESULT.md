# WORLD13 GPU addendum result

My GPU-first requirement is now recorded in [AGENTS.md](../AGENTS.md) for this and subsequent acoustic-engine work. This addendum's smallest implemented extension fixes a demonstrated GPU-client cancellation hang and adds bounded closure observations. It makes **no GPU speedup, new Auto qualification or real-time acceptance claim**. The synthesis/PCM kernels, reflection quality, buffers, source history and Bati calibration remain unchanged.

## First sealed candidate and hosted result

The original 35-file candidate remains immutable at `dd1a2127af752c675fa551b0084e4e802f159127`, directly on PR92. Its [run 41847073761](https://github.com/icydv/RichAudio/actions/runs/41847073761), attempt one, has **two successful functional jobs, two failed processing jobs and a failed required aggregate**. The GPU directive arrived while that run was in progress; it was neither cancelled nor rerun. These original results are not attributed to the subsequent client correction.

Both hosted functional populations pass **836 inherited tests with two explicitly named hardware-GPU skips**, **191 portable passes /24 named research skips**, **23 WORLD11**, **45 WORLD12**, and **13 cleanup controls**. Node24's inherited machine parser does not retain the two skip names, but the actual retained suite log names both as missing supported hardware compute adapters, excluding software. Neither hosted population proves GPU performance. Both processing populations pass all **72 original focused controls**, complete all 144 selected trials and preserve all 64 parent/candidate, 72 off/on and eight preparation comparisons per runtime.

Each main row below represents **5,376 blocks**, times in milliseconds:

| Runtime /implementation | Instrumented | p50 | p95 | p99 | Maximum | Hard misses | Blocks >8 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Node22 parent | No | 1.2174 | 5.1255 | 8.5718 | 15.5833 | 26 | 71 |
| Node22 candidate | No | 1.2167 | 5.1673 | 9.3065 | 16.4673 | 32 | 82 |
| Node22 parent | Yes | 1.3331 | 5.5820 | 11.7657 | 34.2375 | 81 | 135 |
| Node22 candidate | Yes | 1.3442 | 5.6812 | 12.0442 | 40.4932 | 76 | 137 |
| Node24 parent | No | 0.7507 | 3.2393 | 5.3552 | 12.5829 | 1 | 13 |
| Node24 candidate | No | 0.7645 | 3.2625 | 5.4086 | 11.1133 | 1 | 9 |
| Node24 parent | Yes | 0.8614 | 3.6353 | 6.4783 | 19.7871 | 13 | 23 |
| Node24 candidate | Yes | 0.8589 | 3.6042 | 6.1545 | 12.7418 | 9 | 24 |

Main parent/candidate hard misses are **107 /108 on Node22** and **14 /10 on Node24**. Including preparation controls, each candidate has 13,440 blocks: **140 misses /274 above 8 ms on Node22**, **17 /53 on Node24**. The data-prepared/authored-JIT controls respectively retain **23 /nine misses** on Node22 and **six /one** on Node24. Both hard and headroom gates fail. The unchanged DSP makes these fresh timing differences observations, not implementation improvements.

Node22 reports **AMD EPYC 9V74**, Node24 **AMD EPYC 9V45**. Both have four logical/available CPUs, and both normal/restricted-four conditions actually use mask **15**. Those labels do not establish different CPU counts or equivalent hardware. All 544 owned children, 544 affinity helpers and 160 scene workers join across the two runtimes. Every raw block, long-block classification, PCM/control/history comparison and profile limitation remains in the [hosted numeric derivative](../evidence/world13-hosted-41847073761.json).

The [retention receipt](../evidence/world13-hosted-retention.json) binds all four canonical ZIP digests, raw job logs, 210 expanded members and the actual aggregate job failure. Original downloaded bytes remain private. Locally rehashed published reports are distinct from original unredacted host-report hashes attested by the publisher. One premature Node22 artifact readback rejected incomplete download bindings; its failed receipt remains unchanged. A separately identified readback completed after the download, with the same limits and archive identity. No test or measurement was rerun to repair that readback ordering error.

Independent Codex review checks canonical remote commit/tree/all 35 blobs, hosted source/runtime/checkout bindings, raw numeric distributions and every candidate block above 8 ms. Hosted numeric projection receipt SHA-256: `c8ae5e276a7c11795e8c56abd8901cfacdd753d7baba13860bea96c6a535a143`; functional/source receipt: `0e34c833fad53c1fc8723a0e908ce71d3a5bb045fc7c7ed7084917e8e3fdcc0b`. These are agent reviews, not human approval or gameplay qualification.

## GPU readiness correction

A true original-protocol process test reproduces the previous unresolved capability promise after synchronous `close()`. The failed pre-fix test and original client identity are preserved. The corrected client settles initialization exactly once, rejects pending dispatch, ignores late frames and retains synchronous close. Its opt-in `waitForClose()` records actual spawn/exit/close operands and distinct no-start, launch-failure and timeout states. It is not called by PCM rendering, does not kill/retry work itself and does not turn unknown helper CPU into zero.

Seven new controls pass separately on Node22/Node24, with 14 retained actual lifecycle records; the earlier overlapping seven-new-plus-twelve-inherited suite passes **19/19 per runtime**. All helpers in these new tests are original protocol fixtures with **no actual GPU API**. The [readiness evidence](../evidence/world13-gpu-readiness.json) binds logs, source and the failed attempt. Independent receipt: `45f75e626fcff17a82b82b9070d07b2d234e6c510e6d48a3a8b1d21e118ddbb2`.

The separate [CPU-fallback experiment](WORLD_13_GPU_FALLBACK_COST.md) uses **24 fresh children /6,144 actual geometry queries** with an explicitly unsupported, no-process capability fixture. All geometric results match. Wall means and tails are mixed; one aggregate CPU baseline is zero and its ratio stays unknown. This measures CPU selection/fallback overhead only, with no native helper or GPU work; real late GPU/helper CPU tails remain unmeasured. It does not qualify a full worker/PCM deadline or GPU crossover.

The new test file is selected automatically by the processing controller, making **79** focused tests for the addendum revision. The original run's 72 tests are not relabelled. Fresh hosted validation of the changed revision must have its own head, run, artifacts and verdict; an additional code-validation run is not a rerun of the original candidate for a more favorable result.

## GPU-first continuation

The [GPU-first plan](WORLD_13_GPU_FIRST.md) retains DirectCompute, explicit GPU mode, CPU fallback and truthful qualification scopes. The [source assessment](WORLD_13_GPU_SOURCE_ASSESSMENT.md) identifies batched ordered grain scoring as a plausible target, with actual FP64 support, strict arithmetic, resident-input and complete same-block readback costs still unqualified. Finite path solving, materials and environmental reverberation remain future measured extensions.

Before Auto promotes additional medium/large work, a bounded original-only hardware experiment must include complete Node/helper CPU, GPU transfer/readback, remaining exact CPU work, full worker/PCM and scene/source latency, resource budget, cancellation/late-result handling and contention. Short quantized zeros cannot prove CPU savings. The current GPU benchmark's supervision/accounting gaps are explicit; no shader-time-only acceptance or unverified startup policy change is introduced here.

I keep the 512-frame/48-kHz deadline and 8 ms target, exact required PCM, source continuity and quality. Actual GTA frame-time/FPS testing requires separate live authorization. No game/private resource, real endpoint, recording, deployment, native suppression, developer contact or merge occurred. My overall real-time and complete-engine GPU benefit remain unqualified.
