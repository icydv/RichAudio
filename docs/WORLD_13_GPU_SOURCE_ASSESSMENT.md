# WORLD13 GPU source assessment

My GPU-first direction includes source synthesis where complete costs justify it. Codex's current assessment identifies **batched grain-candidate scoring** as a plausible bounded extension. Hardware FP64 capability, exact shader behavior and an end-to-end GPU benefit remain unmeasured. This increment implements no synthesis shader or source-kernel replacement. Auto promotion requires the [GPU-first complete-cost qualification protocol](WORLD_13_GPU_FIRST.md).

## Measured work and its scope

The original textured source fixture's first block performs two `matchHead` searches, with **464 valid scores of 64 samples: 29,696 scoring PCM reads** within **31,872 total head/PCM reads**. Candidate scores are independent once the reference samples, ordered candidate list and plan are fixed. Each score's interpolation and ordered accumulation remain dependent operations. These are authored operation counts, rather than a measured hardware instruction count or allocation estimate.

Codex derived these nested walls from the retained instrumented, data-prepared **cold source-only** records already bound in the [experiment evidence](../evidence/world13-experiments.json). Each runtime has two fresh-process repetitions; each first block contains two matching calls. Times are milliseconds.

| Runtime | First whole-source block | Sum of its two matching intervals |
| --- | ---: | ---: |
| Node 22 | 19.7586–19.9400 | 9.0608–9.1176 |
| Node 24 | 13.2397–13.4145 | 5.9431–6.0470 |

The separate local main-matrix first-activation source intervals are **10.0554 /10.6483 ms** on Node 22/24 with existing authored-JIT preparation. They cover the entire source operation and use a different preparation condition. The cold matching table supplies no matching-only attribution for those main intervals and no forecast of recoverable GPU time. The [processing results](WORLD_13_PERFORMANCE.md) retain those populations separately.

## Candidate architecture

The smallest source experiment would keep the unchanged authored PCM bank and interval metadata resident, with creation/upload costs recorded separately and no real source clock advanced. CPU work would supply the exact ordered candidates and original RNG decisions. A GPU group could evaluate independent candidates while each lane retains the original 64-term binary64 accumulation order.

An ordered best-candidate fold would preserve strict comparisons, ties and the existing exact-phase early-exit policy. The two refinement stages would use the same fixed centres and ordered selections. Keeping those stages within a group is an engineering hypothesis that could permit **one final readback per search batch**, rather than a host round trip between refinements. Microsoft documents that group synchronization requires every participating thread to reach the barrier; diverging barrier branches have undefined behavior. Uniform phase/barrier control therefore needs explicit verification. [Microsoft group-barrier documentation](https://learn.microsoft.com/en-us/windows/win32/direct3dhlsl/groupmemorybarrierwithgroupsync).

Extra scores computed speculatively would not qualify extra reader-history updates. Only the original consumed prefix could commit read counts, bounds, correlation, head choice and rejection behavior. The GPU result must preserve the same future PCM/state suffix. Custom reader methods, getters, proxies and numeric coercions need a truthful compatibility path: the [rejected batching experiments](WORLD_13_PERFORMANCE_EXPERIMENTS.md#observable-state-and-rejected-batching-designs) show why ordinary-data assumptions require guards.

The remaining source work includes sample-to-sample IIR state, phase/chronological heads, splice timing, mode entry, envelope/mix statistics and independent engine/exhaust histories. Current `renderInto()` is synchronous; the existing asynchronous GPU helper serves visibility masks. A synthesis experiment needs an explicit owned-worker integration boundary. The WASAPI/PCM callback must never wait for GPU completion, and the result must satisfy the existing block cadence without an added audio queue or block of latency.

## Precision and complete-cost gates

Codex verified the primary API requirements. Feature-level or Shader Model labels alone do not prove double support. `D3D11_FEATURE_DOUBLES` reports `DoublePrecisionFloatShaderOps`; even a true result does not establish double-precision division. Extended division/reciprocal instructions have a separate `ExtendedDoublesShaderInstructions` capability. Both must be assessed against the compiled scoring operations on the actual supported hardware. [Microsoft double-support documentation](https://learn.microsoft.com/en-us/windows/win32/api/d3d11/ns-d3d11-d3d11_feature_data_doubles), [Microsoft extended-double options](https://learn.microsoft.com/en-us/windows/win32/api/d3d11/ns-d3d11-d3d11_feature_data_d3d11_options).

HLSL `precise` can constrain reassociation and contraction for contributing operations. It does not by itself establish equality with JavaScript interpolation, division, square roots, boundary guards or accumulation. Exact scores, strict tie outcomes, complete voice/RNG/history state and output bytes remain comparison obligations. [Microsoft HLSL precision controls](https://learn.microsoft.com/en-us/windows/win32/direct3dhlsl/dx-graphics-hlsl-variable-syntax).

Qualification must charge CPU packing, helper IPC, upload, submission, GPU execution, synchronization, readback/decode, state commit and all remaining source/renderer work. Cold creation and resident-bank costs must also remain visible. The existing 512-frame/48-kHz deadline and 8 ms headroom target apply to the complete path. Neither a fast score shader nor a capability response promotes Auto. My current sealed CPU and hosted evidence remains unchanged; actual GPU execution and a complete-cost win require the separate bounded experiment.
