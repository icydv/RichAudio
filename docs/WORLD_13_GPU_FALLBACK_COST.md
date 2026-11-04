# WORLD13 CPU fallback cost

Codex measured my actual `AcousticAcceleration.query()` CPU geometry path against its unsupported-capability fallback using an **explicit no-process client fixture**. The fixture returns unsupported capability and rejects any dispatch. It creates no acoustic helper or graphics device. This measures fallback routing around real finite geometry queries; actual device/helper startup, IPC and GPU costs remain unmeasured.

The [compact evidence](../evidence/world13-gpu-fallback-cost.json) binds 24 fresh Node benchmark children, 6,144 queries, all per-query results, source/runtime hashes, three paired repetitions and every observed tail. Each child performs 256 queries without unmeasured query warmup. The second repetition reverses CPU/fallback and workload order; the third repeats the first. Node 22 runs before Node 24. The original policy fixture has three fixed segments and either four or 128 finite surfaces, including hit, ambiguity and unknown-region behavior. No CPU geometry routine is replaced or supplied with an invented cost.

Each row contains 768 queries per mode. Times are milliseconds; percentiles use nearest rank. Values are **CPU / fallback**.

| Runtime | Surfaces / segment-surface pairs | Mean | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Node 22 | 4 /12 | 0.033182 /0.032264 | 0.0664 /0.0615 | 1.0387 /1.0368 |
| Node 22 | 128 /384 | 0.195480 /0.203750 | 0.2868 /0.3108 | 1.3509 /1.4247 |
| Node 24 | 4 /12 | 0.025876 /0.027036 | 0.0447 /0.0469 | 0.8196 /0.8219 |
| Node 24 | 128 /384 | 0.134301 /0.132312 | 0.2211 /0.2150 | 1.3317 /1.2818 |

Fallback/CPU mean, p95 and maximum ratios are respectively **0.9723 /0.9262 /0.9982** for Node 22's small fixture, **1.0423 /1.0837 /1.0546** for its larger fixture, **1.0448 /1.0492 /1.0028** for Node 24's small fixture and **0.9852 /0.9724 /0.9625** for its larger fixture. The mixed tails remain retained. Every actual geometry result and input hash agrees across the matched modes. First-query and following-eight distributions remain separate in the evidence.

Aggregate observed Node process CPU-counter deltas, in milliseconds, are **77 /32**, **219 /329**, **0 /109** and **203 /218** in table order. Those windows include the real queries and common timing/result storage, and can include other Node-thread activity. Windows counter quantization limits interpretation. Node 24's small CPU-mode counter is unresolved at zero, so its CPU ratio is explicitly **unknown**, with the zero readout retained. The other arithmetic aggregate ratios are descriptive counter quotients; none qualifies a CPU-saving claim. Thread-counter observations and per-repetition deltas are retained too. A signed wall/CPU residual does not identify scheduler waiting.

Construction/readiness is outside query timing and separately recorded: observed mean CPU/fallback startup ranges are approximately **0.096–0.114 /0.244–0.304 ms** across these four populations. This is fixture readiness, with no actual GPU/helper cost. Result checks and independent reference queries occur after the wall and aggregate CPU windows.

Raw report basenames follow `node{22|24}-rep{0|1|2}-surfaces{4|128}-{cpu|fallback}.json`; all 24 names and SHA-256 values are in the public evidence. Its SHA-256 is `1b098762b40efaeffc6349a1cea633acf319feff43fa7ef3e542c0a617aaa827`. Original raw reports, execution order and the private micro remain retained. No failures occurred in these selected children.

This result supplies a narrow fallback-overhead observation. It establishes no full acoustic-worker deadline, 8 ms headroom, GPU crossover, shader performance or gameplay benefit. My production backend/shader, source PCM, buffers, queues and latency are unchanged by this experiment. The [GPU-first protocol](WORLD_13_GPU_FIRST.md) still requires actual supported hardware and complete transfer, synchronization, fallback and remaining-engine costs before Auto promotion.
