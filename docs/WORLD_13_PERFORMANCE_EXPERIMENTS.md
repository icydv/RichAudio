# WORLD13 rejected performance experiments

My WORLD13 branch selects **no source/grain or renderer/control DSP optimization**. Codex evaluated seven timed source candidates and three timed renderer candidates against exact PR92 commit `85646ec65f2f88f0eb935374a79260a75e96b728`, preserved the regressions, and kept the original production kernels. Lower medians and fewer authored operation sites did not establish a consistent upper-tail benefit.

Codex ran **160 fresh source processes / 10,240 blocks** and **48 fresh renderer processes / 8,064 blocks** using original authored material. These are separate focused experiments. The [main processing results](WORLD_13_PERFORMANCE.md), [measurement scope](WORLD_13_MEASUREMENT_SCOPE.md) and [implementation review](WORLD_13_IMPLEMENTATION_REVIEW.md) describe the full-pipeline assessment. My hard deadline remains `512 / 48000 seconds = 10.666666… ms`, with the separate 8 ms headroom target.

The [compact experiment evidence](../evidence/world13-experiments.json) retains all 80 source and 16 renderer population summaries, individual repetition maxima, source-copy identities, raw report basenames/SHA-256 values, functional-log bindings and rejection reasons. Full raw blocks, inspector profiles, negative results and development failures remain private. The public derivative contains no private filesystem paths.

## Source and grain candidates

Each source child prepares the unchanged original `Processing12.mjs` / `Processing10.mjs` bank, constructs one genuine zero-history source, and renders 64 blocks. Textured and long-loop forms are separate populations. Authored controls change position, load and lift, then stop and restart the same source. This micro does not exercise owned-vehicle retirement or reacquisition. No authored-JIT warmup is run. Preparation and construction costs are measured separately outside the source render timer and remain in the evidence.

Each population has two fresh-process repetitions, with implementation and instrumentation order reversed on the second. Node 22 completes before Node 24; runtime order is not counterbalanced. Each table cell below is **candidate maximum / its matched parent maximum**, in milliseconds, over 128 textured blocks. The initial five candidates share one matched parent cohort; `scalars2` and `scalars4` each have a new parent cohort. Percentiles use nearest rank. Full p50/p95/p99, first-block, following-eight, later-block and construction/preparation distributions remain in the JSON, including long-loop results.

| Candidate | Node 22 off | Node 22 on | Node 24 off | Node 24 on |
| --- | ---: | ---: | ---: | ---: |
| `rate` | 19.9225 / 18.4757 | 20.2557 / 19.9400 | 12.1939 / 12.1120 | 13.0940 / 13.4145 |
| `room` | 18.6003 / 18.4757 | 19.5548 / 19.9400 | 12.2448 / 12.1120 | 13.4820 / 13.4145 |
| `combined` | 21.0034 / 18.4757 | 20.3830 / 19.9400 | 12.0841 / 12.1120 | 13.1982 / 13.4145 |
| `energy` | 18.2217 / 18.4757 | 20.3093 / 19.9400 | 12.5468 / 12.1120 | 13.1439 / 13.4145 |
| `combined2` | 19.0336 / 18.4757 | 20.4859 / 19.9400 | 12.2125 / 12.1120 | 13.5062 / 13.4145 |
| `scalars2` | 18.1361 / 18.1425 | 18.8732 / 19.4027 | 12.7897 / 12.0901 | 13.9072 / 13.0139 |
| `scalars4` | 18.4106 / 18.0386 | 20.5619 / 20.2161 | 12.8489 / 12.2230 | 14.1508 / 12.9840 |

Codex tested these changes separately before considering a combination:

- `rate` repeats `pair()`'s ordered scalar search/arithmetic inside `rateAt()` to avoid a temporary pair-result object.
- `room` caches one integer contiguous endpoint inside a synchronous matching search, then subtracts each exact candidate coordinate.
- `combined` combines those two changes.
- `energy` computes the fixed target's ordered squared-energy sum once per matching search, preserving every candidate PCM score and read.
- `combined2` combines all three changes.
- `scalars2` keeps ordered interpolation/read statistics in local scalars and publishes them after each score, including partial failures, through a call-local sampler.
- `scalars4` inlines that sampler into the score loop and adds stricter ordinary-data and original-method guards.

The initial five versions retain mixed upper tails. `scalars2` improves the following-eight maximum in all four textured runtime/instrumentation populations, but its Node 24 first-block maxima regress as shown above. Its Node 22 uninstrumented p95 also rises from **5.3876 to 6.3311 ms**. `scalars4` regresses every textured maximum; Node 22 p95 rises from **5.5561 to 8.4624 ms** with instrumentation off and **7.0498 to 8.8721 ms** with it on. Node 24 uninstrumented p99 rises from **11.8755 to 12.5540 ms**. These failures remain part of the result.

A separate wrapped count-only comparison records first-block pair-result sites falling from **5,126 to 2,052**, `available()` calls from **2,526 to 2,076**, and contiguous scan steps from **6,650 to 5,174**, while all **31,872** sample/read calls remain. Those are executed authored JavaScript operation/site counts. They do not measure heap allocations or explain an individual GC event. Their own worse first/following-block timings remain retained and are excluded from candidate selection.

## Observable state and rejected batching designs

Two additional source designs were rejected before timing. The first, `scalars`, publishes read statistics only at the end of the whole search. An overridden `available()` could then observe stale statistics between completed scores. Codex changed the design to publish after each probe in `finally`, preserving the ordered successful-read state even when a later interpolation throws.

The later `scalars3` guard still admits concrete counterexamples. A writable data property can hold an object whose `valueOf()` observes `voice.stats.reads`; the parent publishes each increment before `Math.min` performs that coercion. Batching hides those increments. Sample/interval getters and proxies can expose the same difference. A writable-data-descriptor check alone is insufficient.

The timed correction, `scalars4`, falls back for customized instance or prototype reader methods, reflective statistics, nonprimitive statistic coercions, and reflective sample/interval/allowed-set access. It compares captured original method identities, requires primitive statistic/count values and ordinary data descriptors, and checks original typed-array length and `Set.has` behavior. This is a bounded guarded case, with focused counterexample tests; it is still rejected for its measured tails.

The earlier five candidates pass 27 focused tests per runtime, `scalars2` passes 32, and the final private `scalars4` copy passes **40 on each runtime**. The [current focused suite](../tests/Test-Synthesis13.mjs) covers raw output/suffix bytes, complete enumerable source/event/grain state, RNG, heads, phase, history, rates, player/NPC forms, preparation, finite events, stop/restart, fragmented/gapped/sparse material, partial rejection mutations, instance/prototype overrides, and ordered accessor/proxy/coercion observations. These bounded authored comparisons do not establish every possible API customization.

No candidate moves synthesis work into source construction or adds a source warmup. The selected constructor, preparation and source/grain kernels remain exactly PR92. My Bati engine/exhaust calibration, source PCM, lifecycle, block size, audio buffers, queues, latency and path quality remain unchanged.

## Renderer and control candidates

The renderer micro uses 168 blocks of deterministic authored Float32 dry inputs and six manually authored direct/reflection-ID paths, with up to twelve overlapping generations. First activation is block 4, generation replacement 60, geometry identity replacement 80, absence 104–115 and reacquisition 116. It contains no grain synthesis or actual geometry solver. Raw block rows retain those events; separate first/following cohort distributions were not derived.

Codex ran three paired fresh-process repetitions for each of four source copies, with instrumentation off/on, on both runtimes: 48 children total. The second repetition reverses implementation/instrumentation order; the third repeats the first order. Each row below has 504 instrumented PCM intervals. Times are milliseconds.

| Renderer source copy | Node 22 p95 | Node 22 p99 | Node 22 maximum | Node 24 p95 | Node 24 p99 | Node 24 maximum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| PR92 parent | 1.0488 | 7.9175 | 8.5866 | 0.9618 | 4.6429 | 4.9407 |
| `variant01-factor` | 3.0567 | 7.8302 | 8.5809 | 0.9294 | 4.9268 | 5.1330 |
| `variant02-age` | 1.4606 | 7.6552 | 8.3191 | 1.0852 | 4.6078 | 5.4569 |
| `variant03-factor-age` | 3.3079 | 7.8368 | 9.5546 | 0.8979 | 4.7619 | 5.3516 |

The three candidates factor occupied-path gain work, reuse path age, or combine both. All regress Node 22 instrumented PCM p95 and Node 24 PCM maximum. Their uninstrumented outer timers, paired repetition deltas and maxima/dispersion are also retained. Codex selected none.

The separate equal-settings reuse candidate, `variant04-control`, fails a retained-reference check on both runtimes before timing. PR92 detaches a previously exposed settings object at the next setter call. Reusing it lets a retained reference change live path quality. The actual count workload makes 338 settings calls, all with changed values because `maxReflectors` changes, so this idea would avoid **zero** settings-object replacements there. The proposed setter timing micro was intentionally left unexecuted. The operation run shares current grain code once for both variants and identifies the exact PR92 renderer; it is an untimed count experiment with a narrower binding than a frozen whole-pipeline comparison.

A failed first experimental builder is preserved too. Its exact replacement did not match the private parent's CRLF source, so no variant was written. A separately named corrected builder normalizes only experimental-copy newlines. The original failure and both builders remain bound in the evidence.

## Equality and measurement limits

Every source micro block records matching SHA-256 values for raw engine/exhaust output bytes and dynamic source/grain history. The common history helper preserves signed zero, nonfinite numbers, undefined values, Set order and typed-array values. It excludes static asset/sample/interval/feature data and represents the current interval by index; the source micro contains no finite events. The focused source tests separately compare original PCM and complete state, including finite event readers.

Renderer micros retain byte-based stereo and complete source-ring/tag hash agreement. **No dry-input hash was captured.** Final renderer/slot metadata uses `JSON.stringify` hashing, which loses signed-zero and nonfinite distinctions. That evidence is reported as hash agreement. The twelve selected [renderer tests](../tests/Test-Renderer13.mjs) use direct deep-state assertions and explicit PCM byte checks on the final unchanged production code; they do not expand the encoding coverage of the rejected copies' metadata hashes.

Source instrumentation on includes inspector sampling, GC observation, heap reads and matching/pool wall spans; off includes only the common source wall timer. Source profiles remain raw and are unqualified for temporal attribution. Renderer instrumentation on includes nested acceptance/PCM wall timers and a GC observer, with no inspector or CPU profiler. Its off population has no nested PCM attribution. These instrumentation modes are distinct from the main full-pipeline measurement protocol.

Both micros use the public Node 22.23.4 and 24.19.0 runtimes in fixed runtime order, without affinity or contention controls. Common outside-timer control/hash work remains part of each experiment's surrounding process history. Short authored bursts cannot establish universal deadlines, explain the historical WORLD12 PCM spike, or identify JIT, GC, scheduler or other OS causes. No private bank, installed resource, encryption key, game executable, endpoint, capture, launch or deployment is involved.
