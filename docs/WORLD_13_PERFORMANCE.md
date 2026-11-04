# WORLD13 processing results

My real-time acceptance remains **failed**. Codex selected no production DSP change after the [focused experiments](WORLD_13_PERFORMANCE_EXPERIMENTS.md) regressed their upper tails. The fresh main comparison records **39 parent /39 candidate misses on Node22** and **eight /seven on Node24**. The candidate Node22 main maximum is **26.1185 ms**. Different timings from unchanged DSP do not establish an implementation improvement.

Codex ran the exact PR92 parent `85646ec65f2f88f0eb935374a79260a75e96b728` and the frozen candidate with identical original inputs and harness on the local Ryzen 7 5800X /16 logical CPUs. Node22.23.4 completed before Node24.19.0. Normal and restricted-four masks, zero/two qualified contenders, scenes, repetitions and actual executable/source identities remain distinct in the [raw-derived evidence](../evidence/world13-local-processing.json). The [measurement scope](WORLD_13_MEASUREMENT_SCOPE.md) defines the common timer and limits.

## Main matrix

Each row contains **5,376 blocks**. Times are milliseconds; percentiles use nearest rank. The unchanged strict hard deadline is **10.666666666666666 ms**. Every block above **8 ms** fails the separately required maximum-headroom target.

| Runtime | Implementation | Instrumented | p50 | p95 | p99 | Maximum | Hard misses | Blocks >8 ms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Node22 | Parent | No | 1.1248 | 4.4570 | 7.6675 | 14.1266 | 13 | 48 |
| Node22 | Candidate | No | 1.1108 | 4.4634 | 7.6867 | 26.1185 | 14 | 41 |
| Node22 | Parent | Yes | 1.1923 | 4.8705 | 8.7961 | 14.9571 | 26 | 68 |
| Node22 | Candidate | Yes | 1.1889 | 4.9718 | 8.5019 | 14.6621 | 25 | 69 |
| Node24 | Parent | No | 0.9017 | 3.4986 | 5.5788 | 11.8822 | 2 | 8 |
| Node24 | Candidate | No | 0.9383 | 3.4868 | 5.4652 | 10.3674 | 0 | 6 |
| Node24 | Parent | Yes | 1.0151 | 4.0231 | 6.7385 | 15.0791 | 6 | 25 |
| Node24 | Candidate | Yes | 0.9939 | 3.9150 | 6.5786 | 15.2208 | 7 | 24 |

Node24's uninstrumented candidate main population has zero hard misses but still fails the 8 ms target. Its instrumented population and both selected preparation conditions also retain hard misses. No percentile, population choice or rounded threshold converts these results into acceptance.

## Existing preparation control

Each row contains **1,344 candidate blocks**, pooled over the selected off/on, topology and mask conditions. This is an experiment with existing preparation choices, not added product warmup.

| Runtime | Preparation | p50 | p95 | p99 | Maximum | Hard misses | Blocks >8 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Node22 | Data prepared | 1.0472 | 5.1349 | 11.9897 | 27.9503 | 17 | 28 |
| Node22 | Authored JIT | 1.0511 | 4.4497 | 7.2186 | 13.2414 | 4 | 9 |
| Node24 | Data prepared | 0.8649 | 3.9743 | 8.9820 | 22.0907 | 7 | 18 |
| Node24 | Authored JIT | 0.8749 | 3.3487 | 5.4876 | 10.6671 | 1 | 4 |

The Node24 authored-JIT maximum **10.667100000000005 ms** exceeds the exact deadline and remains failed. Across main plus preparation experiments, each runtime has **13,440 candidate blocks**: Node22 records **60 hard misses /147 blocks above 8 ms**; Node24 records **15 /52**. Both wrappers exit with failure at their required timing verdict after all selected measurements and publication complete.

## Long blocks and lifecycle

The largest main candidate block is Node22 trial 110, block 139: **26.1185 ms**, textured/walls, restricted-four mask, two contenders, later active-source playback, instrumentation off. No phase/CPU attribution exists for that spike. The experiment does not identify an OS, JIT, GC or lock cause.

Node24's main candidate maximum is trial 108, block 43: **15.2208 ms**, textured/walls, restricted-four, two contenders, first source activation, instrumentation on. Its nested source synthesis takes **10.6483 ms**, PCM rendering **0.6289 ms**, and source construction **0.1613 ms**. Main-isolate GC temporal union is **0.8056 ms**, including **0.6187 ms** overlapping synthesis. These intervals overlap; GC is not subtracted and construction is not identified as the bottleneck. The measurement does not explain the historical WORLD12 11.2981 ms PCM interval.

The largest instrumented Node22 candidate block is **14.6621 ms**, trial 63/block 43, first activation. Selected inclusive phase walls at each runtime's instrumented maximum are:

| Phase | Node22 | Node24 |
| --- | ---: | ---: |
| Source construction | 0.2094 | 0.1613 |
| Source synthesis | 10.0554 | 10.6483 |
| Control preparation | 2.8337 | 2.9169 |
| Renderer acceptance | 0.1996 | 0.1596 |
| PCM renderer | 0.7677 | 0.6289 |

The root's exclusive wall intervals are **0.5612 /0.6913 ms**. The observed synthesis exclusive CPU counters are **16 /0 ms** respectively, despite approximately 10 ms walls. These quantized observations remain in the raw records; they cannot establish that either interval was external waiting. Candidate main first-activation/following-eight maxima are **13.9403 /13.3254 ms** on Node22 off, **14.6621 /14.0762** on Node22 on, **10.3674 /8.7563** on Node24 off and **15.2208 /8.3393** on Node24 on.

Candidate main hard misses retain these mutually exclusive activation classifications:

| Runtime / instrumentation | First activation | Next eight after first | Reacquisition | Next eight after reacquisition | No active source | Other active blocks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Node22 off | 7 | 5 | 0 | 0 | 0 | 2 |
| Node22 on | 8 | 17 | 0 | 0 | 0 | 0 |
| Node24 off | 0 | 0 | 0 | 0 | 0 | 0 |
| Node24 on | 7 | 0 | 0 | 0 | 0 | 0 |

All six lifecycle cohorts, including passing blocks, first/following maxima, engine restart and authored dismount/reacquisition observations remain in the evidence. Every candidate hard miss and every block above 8 ms retains its exact trial, block, conditions, source history, selected paths and available phase spans. Parent failures remain in the original reports and derived cohort data; none is rewritten as a candidate pass.

## Identity, memory, CPU and closure

Both runtimes complete all **144 trials /24,192 blocks**. Per runtime, all **64 parent/candidate**, **72 off/on** and **eight preparation** comparisons preserve dry/stereo PCM, dynamic phase/grain history, direct/reflected paths, settings, observations and lifecycle. All **272 owned children, 272 affinity helpers and 80 scene workers** join; **128 contenders** report qualified completion. These counts exclude separately reported functional/injected controls.

Largest candidate main RSS observations are **77,320,192 /89,882,624 bytes** for Node22 off/on and **88,125,440 /96,145,408** for Node24. They are outside-render samples, not instantaneous absolute peaks. Instrumented signed heap deltas range **−5,961,448 to +5,211,904 bytes** on Node22 and **−6,442,480 to +8,015,136** on Node24. Heap deltas and operation-site counts are not allocation measurements. Off has no heap probe, rather than zero allocations.

Nested wall/CPU distributions, exclusive accounting, signed residuals and GC unions are retained. CPU-counter granularity and whole-process fallback limit interpretation; wall-minus-CPU is not scheduler waiting time. Each runtime collects 72 profiles and leaves another 72 uncollected. **71 collected profiles per runtime qualify for diagnostic temporal mapping; one does not**: Node22 main trial 39/sample 43 retains **−15 µs**, and Node24 main trial 63/sample 31 retains **−59 µs**. Their signed intervals remain unchanged and unqualified. No sample is clamped or discarded.

The independent raw numeric audit binds original reports, snapshots, summaries, final wrapper results, focused logs and publication copies. Its public derivative SHA-256 is `787000b036831325378397c8d014902822fd6217e660a109f545e165e260d838`. Raw reports remain privately preserved; this is original-fixture evidence, with no actual endpoint, private bank, installed geometry or gameplay proof.

## Next justified experiment

My next smallest milestone is a bounded, device-free tracing experiment around the exact first/following synthesis stalls and later-playback contention outlier, paired with untraced controls. It should distinguish time executing the owned render thread from compilation/deoptimization, observed GC and external waiting before another kernel rewrite is selected. The current observations do not justify more construction work, added warmup, weaker quality, buffers, queues or an assumed OS cause. The separate [hosted result](WORLD_13_RESULT.md) must retain its own hardware and gates.
