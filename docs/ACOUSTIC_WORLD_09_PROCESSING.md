# ACOUSTIC-WORLD-09 processing investigation

I retain the hosted **42.9559 ms** maximum and earlier 30–80 ms maxima as unexplained historical overruns. Their original aggregate timings do not contain the nested phase, CPU, GC and scheduling observations needed to reconstruct a cause. Codex added a separate original-only profiler so fresh measurements can distinguish those observations without changing my production source or DSP.

[`Profile-Processing09.mjs`](../tools/Profile-Processing09.mjs) executes the existing `StockGameplay`, `StockVehicleSource`, `CausalSimulation` and `StreamingRenderer`. The Bati bank contains wholly original analytic PCM from the inherited original fixture. The reflected arm adds one wholly original finite wall through the existing joined scene worker. No installed resources, private banks, audio device, recording or GTA launch are involved.

The profiler records every measured block and keeps the original **512 / 48,000 = 10.6667 ms** budget. It compares reference and diagnostic wrappers in fresh children, in both orders, with constructor defaults and a separate Balanced/CPU control. Both arms use the same per-block event-loop yield and V8 sampling. These are burst diagnostics with deterministic observation time; my gameplay quality controller's synthetic-clock statistics are not substituted for the independent measured wall durations.

Each instrumented block retains nested start/end wall stamps and raw calling-thread CPU stamps for source construction, source synthesis, listener/source-pose work, acoustic observation, path preparation, visibility query/CPU geometry, path completion, control filtering, renderer acceptance and PCM rendering. Inclusive parent spans are nested: they must not be added to their children. Exclusive wall costs subtract the union of direct children; the signed CPU residual uses the same serial nesting. The remaining root residual includes gameplay work, instrumentation and asynchronous continuation gaps. It is not an attributed cause. Async spans also retain the time when their synchronous invocation returned.

Main-isolate GC intervals are associated with each span by temporal overlap, retaining a union to avoid double counting. GC is neither subtracted from CPU nor added to already measured wall time. Overlap is not proof that GC caused an overrun; worker GC remains unobserved. Heap-usage observations are not an allocation attribution.

The Windows thread CPU readings in this run were coarse: short phases often reported zero, while maximum blocks reported 15, 16, 31 or 32 ms. Some wall-minus-CPU and exclusive CPU residuals are negative and remain visible. Zero does not establish zero work. Codex also captured raw V8 node IDs, stack frames, sample IDs and time deltas, requesting 500 µs sampling through an in-process inspector session. Start/stop brackets bound the profile-to-wall clock offset. A sample belongs to a measured phase only when its entire clock-uncertainty interval fits that phase. Counts remain counts; they are not converted into exact CPU durations. This run's instrumented mapping uncertainty was **2.3212–2.8512 ms**, so most short phase samples remain at a containing parent or outside/boundary category. Raw stacks still independently retain observed source, geometry, path and renderer functions.

Per-block `setImmediate` probes retain request/callback/CPU stamps, alongside a 1 ms event-loop-delay histogram. They measure callback dispatch effects, including queued work, GC, runtime and operating-system effects. Wall minus CPU is not scheduler time. No independent OS scheduler trace was captured; OS descheduling is therefore unqualified. The histogram also includes the workload's own synchronous execution and cannot be presented as additional delay on top of it.

## Fresh local results

Codex ran **16 fresh children × 144 blocks = 2,304 calls** on Node **v24.19.0**, Windows x64, Ryzen 7 5800X. Every child retained **one overrun**, all at block **10**, when the first source was constructed and synthesized. The maximum range was **19.0586–20.7515 ms**. All **eight** reference/instrumented pairs matched every original dry/stereo PCM block, source cursor, renderer frame count and continuous history. The wall arm exercised actual solver reflection paths. No fixed PCM queue, source reset, gain change, renderer change or budget increase was introduced.

| Profile | Arm | Repetition | Maximum ms | Source construction ms | First synthesis ms | Acoustic update ms | PCM renderer ms | Root residual ms | GC overlap union ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Constructor defaults | Direct | 0 | 19.5488 | 11.7780 | 4.9463 | 1.0805 | 0.4810 | 0.4603 | 0.3869 |
| Constructor defaults | Wall | 0 | 19.7693 | 11.3244 | 4.4268 | 2.2161 | 0.4984 | 0.4452 | 0.3227 |
| Constructor defaults | Wall | 1 | 19.9485 | 11.5572 | 4.3898 | 2.1939 | 0.4828 | 0.4910 | 0.2816 |
| Constructor defaults | Direct | 1 | 20.1356 | 12.4513 | 4.9304 | 1.0127 | 0.4837 | 0.4784 | 0.2764 |
| Balanced/CPU control | Direct | 0 | 19.8572 | 11.9699 | 4.7969 | 1.0836 | 0.5893 | 0.5296 | 0.3020 |
| Balanced/CPU control | Wall | 0 | 20.4385 | 11.7976 | 4.7335 | 2.1137 | 0.4895 | 0.4651 | 0.3556 |
| Balanced/CPU control | Wall | 1 | 20.2137 | 12.0765 | 4.2294 | 1.9417 | 0.5809 | 0.4930 | 0.3114 |
| Balanced/CPU control | Direct | 1 | 20.7515 | 12.6629 | 5.1299 | 1.1240 | 0.4942 | 0.5085 | 0.3581 |

These are the eight instrumented maximum blocks. The selected columns are not a complete partition; acoustic update is nested inside control preparation, whose filtering/acceptance/remaining work is also preserved in the raw report. GC overlap is an annotation inside measured intervals. Source construction occupied more than one full block budget in this fresh workload. That identifies a concrete fresh-workload cost; it does not explain the hosted maximum, prove an optimization, or establish how an installed private bank behaves.

The later 120 calls per child retained **zero** overruns in this short run. Instrumented later-block maxima were **1.7917–2.2804 ms**. Per-child dispatch-probe maxima were retained independently, including **0.6210–0.9266 ms** in the instrumented arms. Neither result establishes realtime safety under GTA load, endpoint continuity, physical latency or audibility. My processing deadline remains unmet on first-source construction.

## Reproduction and retained evidence

From this checkout, the original-only checks and fresh profiler run are:

```powershell
node --test --test-reporter=tap --test-concurrency=1 tests/Test-Processing09.mjs
node tools/Profile-Processing09.mjs --run --out .local/fresh-processing09.json
```

The report path must be a new file directly inside this checkout's `.local`; existing reports are never overwritten. Failed child status, stderr and output hashes remain in the report, and a child failure or PCM mismatch makes the CLI fail. `passed` means the diagnostic completed and the PCM controls matched. `performanceGatePassed` remains false: an overrun is retained as a finding rather than hidden by the diagnostic's completion status.

The five focused tests passed, with zero failures/skips. They check nested accounting and signed quantization residuals, overlapping GC unions, uncertain CPU-sample mapping, exact original PCM/history preservation under constructor defaults, and actual reflected-path/visibility work under Balanced/CPU. Full regression is recorded separately by the WORLD09 wrapper.

The sanitized [processing evidence](../evidence/acoustic-world-09-processing.json) retains every trial summary, maximum block's nested phase costs, source bindings and artifact hashes. The complete raw report retains all 2,304 blocks and original per-block PCM hashes. Exact final bindings:

| Artifact | SHA-256 |
| --- | --- |
| Raw `world09-processing-02.json` | `ab86018826433c8d654fa5e9791363385b002731ad6dee16656ecdfe162c148b` |
| CLI `world09-processing-02.log` | `1370a542ff50e12343223482ad7fce43fdad22cd2f7e78480925a61557e7f2dc` |
| Focused `world09-processing-tests-02.tap` | `b43d12b42819d72377a6cb9715d82dc62b496e24f28b0e9b58365a85297005ee` |
| Measured `tools/Profile-Processing09.mjs` | `7c86597635ed05677c5382e943a68524322bf2718358208d3ab26d9740787b35` |
| Original `tests/fixtures/Processing09.mjs` | `ad8c457165708b6297ddf6a5d90ad2be098162a020b970afdda2fee530bc94fb` |

The earlier profiler-development measurement is retained unchanged as `world09-processing-01.json`, SHA-256 `a6717af2568fffa9c235a6e699b7ac72da46a79ecc780c0903194025d670ff6d`. Before V8 sampling was added, it also retained 16 overruns, with maxima **18.9385–28.5935 ms**. The initial PowerShell wrapper invocation failed before Node started because the fresh checkout had no `.local` output directory. Codex retained that failure as a separate note, SHA-256 `628d6921e97ae5939aa5e3996d56de643830e786066b862ca528ee7e8da55a1c`, then created the directory before the fresh measured attempts. The failed invocation generated no test/profile measurements.
