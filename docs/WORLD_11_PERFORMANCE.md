# WORLD11 processing results and remaining failures

My real-time gate remains open. Codex measured fewer total misses after two small, PCM-preserving changes, but neither local runtime meets zero overruns with the additional 8 ms maximum-block headroom target. Functional success does not qualify an endpoint or the private Bati bank.

The parent is PR90 at `f612bfc5f9f8ecce5565cb9853b1aacfe8179cba`, already containing WORLD10 source preparation. These results must not be pooled with WORLD10's earlier `8a995c8` baseline or its 96/2,688 hosted candidate result. The current harness, lifecycle, process controls and runtime populations differ. The [measurement scope](WORLD_11_MEASUREMENT_SCOPE.md) describes those controls and their limits.

## Matched main comparisons

Both runtimes ran on the same Windows x64 Ryzen 7 5800X machine, exposing 16 logical CPUs. Each main matrix has 128 fresh render processes: parent/candidate, instrumentation off/on, plain/textured authored material, direct/wall scenes, normal/restricted-four affinity, zero/two actual owned contenders and two repetitions. Each implementation has 10,752 measured blocks. No real source is advanced before eligibility. The hard deadline is **10.666666666666666 ms**, evaluated on every common outer render envelope.

Times below are milliseconds, with nearest-rank quantiles. Each row has 5,376 blocks; they summarize heterogeneous conditions within that explicitly identified instrumentation population. Full condition-specific distributions and every missed block are in the linked evidence.

| Runtime | Implementation | Instrumented | p50 | p95 | p99 | Maximum | Misses | Blocks >8 ms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 22.23.4 | Parent | No | 1.2005 | 4.8401 | 8.4850 | 16.6339 | 24 | 68 |
| 22.23.4 | Candidate | No | 1.0973 | 4.5550 | 7.4988 | 15.1948 | 13 | 33 |
| 22.23.4 | Parent | Yes | 1.2992 | 5.1752 | 9.3201 | 18.1385 | 38 | 75 |
| 22.23.4 | Candidate | Yes | 1.2160 | 5.0128 | 9.1332 | 15.5467 | 28 | 83 |
| 24.19.0 | Parent | No | 1.0203 | 3.7233 | 6.6271 | 14.3479 | 7 | 18 |
| 24.19.0 | Candidate | No | 0.9313 | 3.6410 | 6.7904 | 9.9681 | 0 | 13 |
| 24.19.0 | Parent | Yes | 1.1095 | 4.3141 | 7.3496 | 14.2782 | 8 | 37 |
| 24.19.0 | Candidate | Yes | 1.0369 | 4.1564 | 7.2802 | 13.8452 | 9 | 37 |

Node22 totals are **62 parent / 41 candidate misses**. Node24 totals are **15 / 9**. The Node24 instrumented population regresses from eight to nine misses; Node22 instrumented blocks above 8 ms also increase. This is not a uniform improvement across all conditions. Node24's zero uninstrumented misses cover 5,376 short authored blocks, with a 9.9681 ms maximum and only 0.6986 ms hard-deadline slack; they do not meet the 8 ms target or establish long-session safety.

Candidate subpopulations below each contain 1,344 blocks, retaining both real contention and restricted-affinity findings.

| Runtime | Instrumented | Affinity | Contenders | Misses | Maximum ms |
| --- | --- | --- | ---: | ---: | ---: |
| 22 | No | Normal | 0 | 0 | 7.6878 |
| 22 | No | Normal | 2 | 1 | 11.5333 |
| 22 | No | Restricted four | 0 | 3 | 12.6753 |
| 22 | No | Restricted four | 2 | 9 | 15.1948 |
| 22 | Yes | Normal | 0 | 1 | 10.7309 |
| 22 | Yes | Normal | 2 | 0 | 10.5447 |
| 22 | Yes | Restricted four | 0 | 10 | 13.4764 |
| 22 | Yes | Restricted four | 2 | 17 | 15.5467 |
| 24 | No | Normal | 0 | 0 | 8.4106 |
| 24 | No | Normal | 2 | 0 | 7.8846 |
| 24 | No | Restricted four | 0 | 0 | 9.1396 |
| 24 | No | Restricted four | 2 | 0 | 9.9681 |
| 24 | Yes | Normal | 0 | 0 | 10.3313 |
| 24 | Yes | Normal | 2 | 2 | 12.3309 |
| 24 | Yes | Restricted four | 0 | 1 | 12.9706 |
| 24 | Yes | Restricted four | 2 | 6 | 13.8452 |

Affinity is applied after Node startup and matches a logical CPU count only. It does not reproduce hosted CPU performance, SMT, V8 thread-pool startup or GTA load. Node22 ran before Node24; runtime order was not counterbalanced. These two repetitions per main condition do not prove that Node version, instrumentation or scheduling caused an individual spike.

## Lifecycle and measured constraints

Every failure retains source identity/frame, the latest authored observation, wall envelope and available phase intervals. Instrumentation-off failures explicitly have no phase attribution. Observation time can lead delayed source rendering; player-to-unsupported-NPC retirement is not reported as engine shutdown. The fixture separately observes a running player dismount, generation-two reacquisition and explicit engine stop/restart.

| Candidate population | First activation | Next eight | Reacquisition | Next eight after reacquisition | No active source | Other active |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Node22, off | 9 | 1 | 0 | 0 | 1 | 2 |
| Node22, on | 8 | 20 | 0 | 0 | 0 | 0 |
| Node24, off | 0 | 0 | 0 | 0 | 0 | 0 |
| Node24, on | 7 | 1 | 0 | 0 | 0 | 1 |

In Node22's 28 instrumented candidate misses, synthesis is the largest exclusive measured phase in 22, PCM rendering in five and renderer acceptance in one. All nine Node24 instrumented candidate misses rank synthesis largest. Rankings describe measured intervals, not independent causes of lateness. Across all main instrumented candidate calls, synthesis maxima are **9.6931 ms / 11.6910 ms**, PCM renderer maxima **7.8595 ms / 5.4602 ms**. Candidate construction remains small: all 48 instrumented calls per runtime have maxima **0.2806 ms / 0.2328 ms**. There is no evidence here to redirect work to construction.

The Node22 candidate maximum is **15.5467 ms**, restricted-four with two contenders, block 46 after first activation. Its synthesis is **5.0317 ms**, renderer acceptance **5.1782 ms**, PCM renderer **4.2912 ms** and root-exclusive **0.3425 ms**. The root interval's GC temporal union is **0.2731 ms**. The Node24 maximum is **13.8452 ms**, first activation at block 43 under the same affinity/contention category: synthesis **9.7621 ms**, construction **0.1905 ms**, PCM renderer **1.0127 ms**, root-exclusive **0.6325 ms**, GC union **1.0394 ms**. The measured root interval is slightly narrower than the common outer timer; the latter determines failure. Nested intervals are not added twice, and GC overlap is not subtracted as a causal explanation. Coarse CPU counters and bounded V8 samples cannot establish an OS/JIT/GC cause.

The next measured constraint is the tail of first-use and following-block **source synthesis**, with renderer acceptance/rendering also material on Node22. A justified follow-up would isolate those source/grain and path-acceptance operations with matched instrumentation-off controls, preserving full phase/history and path counts. No omitted immutable initializer, safe additional precomputation or further bit-exact optimization has been demonstrated by these results. More blind warmup, larger queues, relaxed deadlines or lower quality are not accepted as a fix.

## Same-implementation warm control

Each runtime also ran 16 fresh candidate children, 2,688 blocks total, comparing immutable data preparation alone with the existing authored throwaway JIT work. Both use wall scenes, no added contenders, both instrumentation modes and both affinities. Each preparation has 1,344 blocks. These controls are separate from the main matrix and do not represent a truly unprepared data constructor.

| Runtime | Preparation | Misses /1,344 | Maximum ms |
| --- | --- | ---: | ---: |
| 22 | Data prepared, no authored JIT | 18 | 30.5851 |
| 22 | Data prepared, authored JIT | 5 | 13.0739 |
| 24 | Data prepared, no authored JIT | 9 | 20.5241 |
| 24 | Data prepared, authored JIT | 1 | 12.4789 |

Warmup helps this comparison but leaves failures. This intervention is not proof that a particular overrun was compilation. It advances no real source and introduces no product change to WORLD10 warmup.

## Integrity, regressions and retained evidence

Across both runtimes, all **288 trials / 48,384 blocks** completed. All **544 owned children and 544 affinity helpers** joined; 256 actual contenders reported qualified work. An independent reviewer recomputed 334,160 phase spans and 8,984 GC intervals. All **128 parent/candidate**, **144 instrumentation-off/on** and **16 preparation-control** comparisons preserve every-block dry/stereo PCM, lifecycle, settings and observations exactly. Memory guards remained satisfied; no failed main child or automatic matrix retry occurred.

The source-only microdiagnostic has lower total time in four cases, approximately 3–10%, but retains worse warm-loop and cold-texture maxima. Renderer microdiagnostics show lower warm medians with noisy tail regressions. Those short diagnostics and the exploratory pilot are not substituted for the final matrix. The pilot recorded **8 parent versus 11 candidate misses /1,344 blocks**, predating the corrected final method. Initial invocation, newline-review and wrapper failures remain privately retained.

Authoritative derived reports:

- [Node22 final revision 2](../evidence/world11-processing-node22-final02.json), SHA-256 `2a0875c69a362a17fddc6d56753d5270596664bc69321ed24bbd7a3358ff0e82`.
- [Node24 final revision 2](../evidence/world11-processing-node24-final02.json), SHA-256 `0fa6bcf33502349bd8312e7056ac88deb81152b3600e1925864db608b991e416`.
- [Earlier Node22 derivative](../evidence/world11-processing-node22-final01.json) is preserved unchanged. Revision 2 changes only post-processing: first activation/reacquisition labels, latest observed context and the advisory 8 ms headroom calculation. It changes no measured source, runtime, timer or raw value; only the separately bound summarizer differs from the frozen helper closure.

Original raw reports remain private; no proprietary inputs are present:

| Raw report | Bytes | SHA-256 |
| --- | ---: | --- |
| Node22 main | 130,489,821 | `4cae4b34c56ca081bda07716a81f8ab9cfd885fa30e0708d7628525f251f9e16` |
| Node22 warm | 17,163,664 | `578795df332e27900dd928773a49fda3608df0aa61efa027f44fc34e3193a190` |
| Node24 main | 129,740,094 | `4812282f63755db5f022cc62472624f72957412d26d46d092fb1c3c5c22f3ecf` |
| Node24 warm | 17,060,288 | `ea14208cf7ac8169ee4b711a7cb6f0ae413f89684ae7f6fe9a8ef0ab3ddffce2` |

The independently reviewed freezes bind 127 members each: parent manifest SHA-256 `1e7b7c1f97d8b86b5aa84c7675fa8657b0ff5ae590e3fa04cebc2527f49b5036`, candidate `bb1ef75c597234823013912466c415da05d27d4e28a33a6ed6ea0938dc0bd4aa`. Raw audit receipt: `8c7a648b731eea36f235e31f54b1ab5153a3a5d44cf901de5704f87da80fde23`. Revision-2 derived audit: `f8f55d27753e0419763e7f327c57e0e4f302abb82183610d6214ce376c533e08`.

The [full functional result](../evidence/world11-functional.json) and [independent implementation review](WORLD_11_IMPLEMENTATION_REVIEW.md) are separate evidence. Endpoint underflows and physical latency remain unmeasured. My calibration, source grain/phase/history, buffers, queue stages, 75 ms opt-in profile and acoustic path quality remain unchanged. No real-time acceptance, real-bank audition or genuine installed-world qualification is claimed.
