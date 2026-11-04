# WORLD12 implementation and independent review

Codex implemented two small production changes for my existing render path. Separate agents reviewed the source and renderer edits; neither reviewer approved their own production change. The owned-process measurement harness and fixture-only timeout diagnostics received independent review too. The [measurement scope](WORLD_12_MEASUREMENT_SCOPE.md) keeps functional, processing-deadline and headroom gates separate.

## Grain matching

`stock-grain.mjs` reuses interpolation indices already computed for bounds/statistics, keeps one available-room result per candidate and a fixed reference-room result within a synchronous search, and replaces temporary score/best objects with local scalars. Candidate order, RNG draws, score arithmetic, strict comparison/tie behavior, refinement centres, final finite guards, chosen heads and persistent voice state remain unchanged. Construction, preparation and product warmup are unchanged.

An authored first block previously creates 464 score-result objects and 18 best-object copies; an observed self-splice block creates 464 plus 20. The new code removes those intermediate authored JavaScript allocations. It also reduces one observed splice block's available-room scans from 3,222 to 2,296. These are operation/site counts from separately instrumented original source copies, not measured heap allocations or a claim about a particular GC event.

All 26 focused tests pass on Node22 and Node24 against exact PR91 source, including exact PCM/suffixes, complete enumerable voice state, 24/32/48 kHz, player/NPC banks, finite events, stop/restart, self/cross searches, sparse/fragmented/gapped pools and rejection-state mutations. The independent reviewer reran Node24 successfully. Review receipt SHA-256: `9a10b1fa1a4086bdaa8bfd4bf05e96b34137cbfcff4e6204980b8fb4e995f395`.

## Renderer acceptance

`causal.mjs` replaces per-path find/some callbacks with ordered first-match/first-free scans. Stable arrivals avoid repeated generation-suffix parsing; only fresh slots consume the derived path key. Every reserved three-band target is still cleared, including inactive negative-zero values, using three ordered scalar writes. No PCM sample-loop, source ring, capacity, path count, smoothing, pan, gain, rate or queue change is made.

All eight focused tests pass on both runtimes. They compare full source rings/tags/filter and slot state, validation/overflow behavior, signed-zero clearing, long fractional wrap, movement, reflections, retirement and reacquisition against PR91. The independent reviewer reran Node22 successfully. Review receipt SHA-256: `858ef388c666ee88661d5f7712e51c0802d529edad378853e548d0b176b49b48`.

## Evidence boundaries

The short source-only final comparison preserves exact PCM/history and has lower totals/maxima in its four populations, but textured first-use misses remain three parent/three candidate in each runtime. An earlier source variant retains an additional following-block miss and mixed timing totals. Final renderer acceptance batches improve while some PCM tails regress; a slower coefficient-hoisting experiment and an exact-state-unsafe clear-skipping idea were rejected. All original trials, failed development invocations and variants remain private and unchanged. None is substituted for the final matched full-pipeline measurements.

The WORLD12 profiler reuses WORLD11's reviewed process and accounting controls while binding exact PR91 as the new parent. Its additional common outside-timer hashes cover dynamic phase/grain history and complete direct/reflected path controls; the helper belongs to every 128-member snapshot. A missing state hash cannot become an equality pass. The independent harness/workflow/scope amendment receipt is `5e1a68c07d5d4327439a3562075f03c6170e7b8fad325565ecaf046ea9f93f21`; the original separate harness receipt is `e5eea7b62c9b42fae9d8947f8f937c52ee58e364257da70a77f06705bf1f0f4f`.

After timing, independent review inventoried five signed-negative V8 sample intervals and retained the initial stronger-check failure. Only the post-analysis summarizer changed: affected sample timelines are unqualified, disabled collection stays distinct, and source/timing/raw values remain unchanged. Four added reporting controls pass on each runtime. Independent amendment receipts: `d3226ea3286fd2e4ba423d90bfdd24d2706e88b8362296f65d99219ebe4e979d` and `5085a6fb9d5bcab4812706715593c1c4dffbc0d24b91fb70081eb543040894b6`.

The [expiry report](WORLD_12_EXPIRY_DIAGNOSTICS.md) records the original unclassified hosted failure, initial journal setup rejection, corrected monotonic budget charging and bounded forced-termination controls. Review caught that new marker overhead initially preceded the wait; the final revision charges it against the existing 2,000/5,000/6,000 ms budgets and rejects late observations conservatively. The final independent diagnostic review is `4436f359bdcffe3e7ebf5c1ceb7f068fd5fa9a40f469c2774c757e9c260977e9`. Earlier pre-correction receipts/hold results remain historical rather than being relabelled.

No CodeWalker integration/dependency, installed resource, private capture, encryption key, game executable, actual endpoint or deployment was involved. My Bati calibration, grain behavior, LOW-LATENCY-01 buffers/queues, camera continuity and acoustic-world architecture remain unchanged. Exact authored comparisons are not a private Bati-bank audition or genuine-gameplay proof.
