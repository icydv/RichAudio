# WORLD12 local processing results

My processing gate still fails. The fresh matched comparison records **50 parent / 39 candidate misses on Node 22** and **9 / 8 on Node 24**, each over 10,752 blocks per implementation. The parent is exactly PR91 at `3d0642df9588aa46721efd85712fd2ba07446345`. WORLD11's historical 41/9 candidate counts use another harness and earlier run; they are not the new baseline. Codex implemented the reviewed changes and ran the new comparisons with original authored material only.

The result is mixed. Most medians and upper percentiles improve, but the worst candidate blocks are slower than their parents in both runtimes. Node 24 uninstrumented goes from zero parent misses to one candidate miss. Neither zero misses nor the 8 ms headroom target is achieved. The [scope](WORLD_12_MEASUREMENT_SCOPE.md) identifies runtime identities, controls, additional common outside-timer history/path bookkeeping and limits.

## Main distributions

Each row has 5,376 blocks. Times are milliseconds; quantiles use nearest rank. These aggregates combine explicitly identified scenes/topologies/masks/contention within each row. Every finer condition and every failure remains in the derived/raw evidence.

| Node | Implementation | Instrumented | p50 | p95 | p99 | Maximum | Misses | Blocks >8 ms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 22 | parent | No | 1.1241 | 4.4568 | 7.7100 | 15.4041 | 16 | 39 |
| 22 | parent | Yes | 1.1997 | 4.9831 | 9.1633 | 18.7428 | 34 | 74 |
| 22 | candidate | No | 1.0882 | 4.3274 | 7.6733 | 15.6010 | 12 | 40 |
| 22 | candidate | Yes | 1.1723 | 4.8456 | 8.6466 | 19.9924 | 27 | 65 |
| 24 | parent | No | 0.8983 | 3.5706 | 6.1917 | 10.3968 | 0 | 11 |
| 24 | parent | Yes | 1.0097 | 4.1413 | 7.6046 | 13.5434 | 9 | 42 |
| 24 | candidate | No | 0.8952 | 3.4189 | 5.6090 | 11.8683 | 1 | 9 |
| 24 | candidate | Yes | 0.9860 | 4.0335 | 6.5423 | 14.5682 | 7 | 23 |

Both populations use Windows x64 on the same Ryzen 7 5800X machine exposing 16 logical CPUs. Node 22 ran before Node 24; runtime order was not counterbalanced. Each main condition has two fresh-process repetitions, with parent/candidate and instrumentation order reversed on the second. Four restricted logical CPUs do not reproduce hosted physical cores, SMT, V8 startup topology or game load. The differences are measured conditions, not explanations for a particular miss.

Each candidate condition below has 1,344 blocks. Groups with normal affinity, instrumentation off and no added contenders meet 8 ms in this short capture, but that result does not extend to restricted CPU or contention conditions.

| Node | Instrumented | Affinity | Contenders | Misses | Maximum ms |
| --- | --- | --- | ---: | ---: | ---: |
| 22 | No | normal | 0 | 0 | 7.7174 |
| 22 | No | normal | 2 | 0 | 8.8295 |
| 22 | No | restricted4 | 0 | 4 | 11.8454 |
| 22 | No | restricted4 | 2 | 8 | 15.6010 |
| 22 | Yes | normal | 0 | 0 | 10.1112 |
| 22 | Yes | normal | 2 | 0 | 10.5854 |
| 22 | Yes | restricted4 | 0 | 10 | 13.8345 |
| 22 | Yes | restricted4 | 2 | 17 | 19.9924 |
| 24 | No | normal | 0 | 0 | 7.7933 |
| 24 | No | normal | 2 | 0 | 8.7812 |
| 24 | No | restricted4 | 0 | 0 | 7.5950 |
| 24 | No | restricted4 | 2 | 1 | 11.8683 |
| 24 | Yes | normal | 0 | 0 | 10.2383 |
| 24 | Yes | normal | 2 | 0 | 10.5645 |
| 24 | Yes | restricted4 | 0 | 2 | 11.1649 |
| 24 | Yes | restricted4 | 2 | 5 | 14.5682 |

## Failure lifecycle and measured phases

| Candidate Node | Instrumented | First activation | Next eight | Reacquisition | Next eight after reacquisition | No active source | Other active |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 22 | No | 9 | 2 | 0 | 0 | 0 | 1 |
| 22 | Yes | 7 | 20 | 0 | 0 | 0 | 0 |
| 24 | No | 1 | 0 | 0 | 0 | 0 | 0 |
| 24 | Yes | 7 | 0 | 0 | 0 | 0 | 0 |

The Node 22 candidate instrumented population has **27 misses**, with synthesis the largest exclusive interval in 16 and PCM rendering in 11. All seven Node 24 instrumented misses rank synthesis largest. These are measured interval rankings, not independent causes of lateness. Instrumentation-off misses explicitly have no per-phase attribution.

Node 22's candidate maximum is **19.9924 ms**, block 46 after first activation, restricted-four CPUs with two contenders: synthesis 5.6647 ms, renderer acceptance 2.0006 ms, PCM renderer 11.2981 ms and root-exclusive 0.4323 ms. Its observed GC temporal union is 0.1932 ms, entirely within synthesis; there is no observed GC overlap with that PCM interval. The PCM renderer interval alone exceeds the hard deadline. This preserves a worse maximum than the 18.7428 ms parent maximum.

Node 24's candidate maximum is **14.5682 ms**, first activation at block 43 under restricted-four/two-contender conditions: construction 0.3969 ms, synthesis 9.5085 ms, PCM renderer 0.9607 ms and root-exclusive 0.8075 ms. Its root GC temporal union is 0.9049 ms, including 0.7462 ms in synthesis. The parent maximum is 13.5434 ms. The uninstrumented candidate maximum 11.8683 ms is also a retained regression against 10.3968 ms parent.

The common outer render timer decides failures; the nested root is slightly narrower. Inclusive children are not added twice, GC temporal overlap is not causally subtracted and quantized CPU counters are not converted into OS waiting time. No JIT/GC/scheduler cause is established.

Five of the 144 collected V8 profiles contain one negative sample interval each: Node 22 main trial 109/sample 326: -58 microseconds; Node 22 preparation trial 9/sample 78: -74; Node 24 main trials 27/30: -75, 43/8: -5 and 62/344: -166. Those five timelines are explicitly unqualified for temporal sample attribution; 139 pass the bounded structural/clock checks, and 144 instrumentation-off trials report no collection. No interval is clamped, reordered or dropped. The [protocol schema](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/#type-Profile) describes these fields as microsecond sample intervals; it supplies no cause for these anomalies. The initial stricter audit failure remains preserved. Common wall/phase timing, GC interval unions and all deadline decisions are independently consistent and unchanged.

## Separate preparation control

Each row has 1,344 candidate blocks in wall scenes, zero added contenders, both instrumentation modes and both affinities. These are distinct fresh-process populations, not extra main repetitions. Both preparations already have immutable data; only the existing authored throwaway JIT work differs. No real source advances before eligibility and no product warmup is added.

| Node | Preparation | Misses | p95 ms | p99 ms | Maximum ms | Blocks >8 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 22 | data-prepared | 17 | 5.1877 | 11.7660 | 28.3441 | 30 |
| 22 | authored-jit | 3 | 4.5010 | 7.5334 | 12.6588 | 10 |
| 24 | data-prepared | 6 | 4.0008 | 8.4893 | 21.7760 | 16 |
| 24 | authored-jit | 0 | 3.2471 | 5.3342 | 9.7175 | 3 |

Node 24's zero-miss authored-JIT control still has three blocks above 8 ms and a 9.7175 ms maximum. This smaller control cannot erase its main-matrix failure or establish compilation as a cause. Data-only failures remain preserved.

## Identity and evidence

All 288 trials / 48,384 blocks complete. All 128 parent/candidate, 144 instrumentation-off/on and 16 preparation comparisons preserve every-block authored dry/stereo PCM, dynamic phase/grain history, selected direct/reflected paths, ownership lifecycle, settings and observations. All 544 owned children and 544 affinity helpers join; 256 actual contenders report qualified work. All 160 scene workers join. Memory/runtime/source controls remain satisfied. No automatic matrix retry occurs.

Each frozen source closure has 128 members. Parent manifest SHA-256: `4d7cadb9c93ea59557d46cc9fcbbb322283b99fc5e080661e73d378db3f20c11`; candidate: `50e68f35383763999bf546cbf8ffa8bb1ef1afd140cff04376345d0e51fbd33e`. Only stock-grain and causal renderer production source differ after explicit newline normalization. Earlier inputs, WORLD11 raw evidence and private capture approvals remain unchanged.

- [Node 22 final02 derived evidence](../evidence/world12-processing-node22-final02.json), SHA-256 `47dcdea7dc7d98be085f921f7991389fab55c8dfe0b94190d43d39acd96b8183`.
- [Node 24 final02 derived evidence](../evidence/world12-processing-node24-final02.json), SHA-256 `7783764d6e8dbb6ac9a4e31d2311df44f5f4b7581b93f7e28903f1a56fe743e5`.

Final02 is derived revision 3. After timing completed, only the separately bound summarizer changed to add CPU-sample qualification. All measured source/profiler/process-control bytes, raw reports, original final01 derivatives, numerical values and gates remain unchanged. The frozen summarizer is retained inside both original snapshots; it differs from the new post-analysis helper, SHA-256 `712d39ec6a1140d6a3f74288ef8b9b11e0f0f8ab46bb9f6a20eb6849e0873a7b`. Four additional pure reporting tests pass on both runtimes. Independent raw audit receipt: `07c69a12d86731432c5b41847eaaa5c6a0196891e1c0519cecf24f34c53166db`; post-analysis audit: `5085a6fb9d5bcab4812706715593c1c4dffbc0d24b91fb70081eb543040894b6`.

Original raw files are preserved privately; all inputs are authored rather than proprietary:

| Raw report | Bytes | SHA-256 |
| --- | ---: | --- |
| world12-final-node22-main-01.json | 137,212,543 | `12fb5fbd29cb8e599b6cd4667d85c365b2ce26eb6eceac9bb82097c51ad4da25` |
| world12-final-node22-warm-01.json | 18,084,782 | `d5370a83ecf064e9288a7dce11bd9c0b957163636114533dfa5e395d2b0eb435` |
| world12-final-node24-main-01.json | 136,533,897 | `55207aa9e4055abdff7930228aca544f00f30ba27de56a7678c722d9c07f680d` |
| world12-final-node24-warm-01.json | 17,917,088 | `3509435847126832874217148154623f3d7c9706bc685440e4fd9a3ba98367cb` |

The [implementation review](WORLD_12_IMPLEMENTATION_REVIEW.md) retains operation counts, earlier source micro regressions and mixed PCM micro tails. A functional CI pass cannot qualify these failed timing/headroom gates. Endpoint underflows, physical latency, real Bati-bank performance and long GTA sessions remain unmeasured.

The next measured engineering constraint is the tail of first-use/following-block synthesis together with the Node 22 PCM renderer spike. A focused follow-up should isolate grain sampling/scoring and occupied-path PCM processing with the same exact-state controls, rather than increasing queues, source-expiry limits, warmup or reducing paths. No safe further precomputation is demonstrated by this run. My audio calibration, block size, buffers, reflection/Doppler quality and fixed-latency architecture are unchanged.
