# ACOUSTIC-WORLD-10 processing evidence

My audio-block deadline remains **512 / 48,000 = 10.6667 ms**. Codex implemented immutable source-data preparation before gameplay readiness, separate authored JIT work, and initialization of empty reader fields. None of those operations advances a genuine source, supplies invented observation history, changes an actual source's first eligible block, or adds a PCM queue. The source and renderer still begin on the existing eligibility and ownership path.

The final measurement is **fully pinned 07**: **96 independent children and 15,360 blocks**, split between 48 parent-baseline children and 48 prepared-plus-JIT children. The baseline retains **105 misses in 7,680 blocks**; the prepared path retains **zero misses in 7,680 blocks**. All **48** matching-arm comparisons preserve every dry/stereo PCM block, source creation/retirement/reacquisition and renderer history with identical frozen input-helper bindings. All **192** contention workers stopped and joined. The [final pinned comparison](../evidence/acoustic-world-10-processing-pinned07.json) retains every trial, failure finding and source/input binding.

| Final fully pinned 07 workload | Arm | Parent misses / calls | Prepared plus JIT misses / calls | Parent maximum range | Prepared plus JIT maximum range |
| --- | --- | ---: | ---: | ---: | ---: |
| Original untextured bank | Instrumented | 16 / 2,304 | 0 / 2,304 | 19.2013–29.3260 ms | 5.4115–8.6248 ms |
| Original untextured bank | Reference | 16 / 2,304 | 0 / 2,304 | 19.8671–22.3490 ms | 4.2550–8.9550 ms |
| Textured late eligibility and lifecycle | Instrumented | 40 / 1,536 | 0 / 1,536 | 23.6079–27.0541 ms | 9.3276–10.6417 ms |
| Textured late eligibility and lifecycle | Reference | 33 / 1,536 | 0 / 1,536 | 23.7216–25.6639 ms | 7.5989–8.2921 ms |

The worst instrumented textured block has only **about 25 microseconds of measured margin** to my unchanged deadline. Zero observed misses in these short fixtures is not a robust GTA-load or endpoint guarantee. The prepared result also excludes explicitly unprepared budget-overflow banks, whose immediate cold construction can still overrun.

The final 123-member snapshot manifest is `9cdb07dba250669c30b0ebcb741fa97ecf0aebffa227e1b814c607b3a0493d18`. Both arms import the same frozen fixture/accounting helpers, and the actual executed profiler must match its frozen copy; before/after source and input checks remain in each raw report. The later budget fallback and profiler failure-retention corrections changed source/harness hashes, so 07 repeats both baseline and candidate measurements instead of relabelling 06 results. Authored startup JIT work took **81.8481–100.5318 ms** for the untextured topology and **141.3829–173.5243 ms** for the textured topology in this final repeat. It advances no actual bank history and adds no PCM queue.

The earlier **fully pinned 06** repeat also contains **96 children and 15,360 blocks**: baseline **107 misses in 7,680 blocks**, prepared **zero in 7,680**, and **48** exact matching-arm comparisons. Its [separate retained comparison](../evidence/acoustic-world-10-processing-pinned06.json) remains historical evidence.

| Fully pinned 06 workload | Arm | Parent misses / calls | Prepared plus JIT misses / calls | Parent maximum range | Prepared plus JIT maximum range |
| --- | --- | ---: | ---: | ---: | ---: |
| Original untextured bank | Instrumented | 17 / 2,304 | 0 / 2,304 | 19.0327–22.1104 ms | 5.3874–8.6938 ms |
| Original untextured bank | Reference | 16 / 2,304 | 0 / 2,304 | 18.8972–24.2818 ms | 4.3249–8.7757 ms |
| Textured late eligibility and lifecycle | Instrumented | 36 / 1,536 | 0 / 1,536 | 23.2472–29.0794 ms | 8.6586–10.0258 ms |
| Textured late eligibility and lifecycle | Reference | 38 / 1,536 | 0 / 1,536 | 22.4507–28.0090 ms | 7.7272–10.2317 ms |

The fully pinned snapshot manifest is `55420e694990509972b2dc5ef47390b08087f8277454ff0dfd6bb69fa33ee630`. It includes 122 owned MJS members: the measured runtime, actual executed profiler, fixture-10 helper and accounting helpers. Both arms import the same frozen helper bytes and verify input bindings before and after processing. All **192** contention workers stopped and joined. The measured audio/input closure is identified by those bindings; this does not claim that every unrelated module in that snapshot equals every later checkout edit.

An independent review found a limitation in the earlier 04/05 reports: their runtime sources were frozen, but their new fixture-10 helper was imported from the working tree without a contemporaneous helper hash. No helper drift was observed, but that full input closure was not sealed. Some earlier reference PCM comparisons also selected an instrumented baseline because the comparator did not prefer or report the baseline arm. The raw PCM comparisons remain real; I do not relabel their provenance. Fully pinned 06 repeats both baseline and prepared measurements with the complete input closure and explicit matching baseline report/arm metadata. Its fixture helper hash is `ca0ff7ee29d755f6b3b946d3a31881e87b74807cd0bad02a9f6f7c27b428ed20`.

## What the retained hosted evidence establishes

The exact WORLD09 hosted report from the approved original-only profiler archive contains **34 overruns in 2,304 blocks**, with per-child maxima **36.4524–42.8739 ms**. Its raw JSON SHA-256 is `cfc43d88e4eba19f967076b998e5bde8f276af26197f6b7d412b49ea4c2bfb1a`. Codex read that report through the exact permitted archive; no installed resource, private bank, game/tool executable or key was inspected.

In its eight instrumented first-source blocks, construction cost **19.9680–24.0432 ms**, and first synthesis cost **9.3656–10.3744 ms**. Construction therefore exceeds my complete deadline by itself in that workload. It does not explain the other early misses: block 11 retains **7.4755–9.1285 ms** of source synthesis, while block 13/14 retains PCM-renderer costs up to **6.7698 ms**, alongside separately nested control/filter/renderer-accept work. Those measured intervals identify specific costs; they do not identify JIT, garbage collection or OS scheduling as their complete cause. The earlier independent 42.9559 ms maximum remains a separate historical result.

## Preparation and actual source ownership

`prepareStockSource10` validates the existing source bank and prepares waveform-matched loop metadata, interval features, source-time timelines and role peak bounds. A private branded token binds exact assets, options and content. Source activation checks that binding and rejects changed PCM or metadata. A later `StockVehicleSource` receives fresh reader state at frame zero. Each active reader has its own ordinary interval/feature arrays; private immutable data cannot be corrupted through another source's exposed reader fields.

The installed registry retains preparation for at most **eight banks**, within a **64 MiB conservative preparation-data budget**, with one synchronous preparation operation at a time. This limit covers charged retained preparation data, not total process RSS or all active reader allocations. Only explicitly configured, resolved eligible banks are considered before `gameplay-ready`. A typed preparation-budget failure leaves an overflow bank explicitly unprepared and preserves its existing **immediate cold RichAudio constructor** at genuine eligibility. That bank can retain the known construction overrun; this is not a claim of native `stock-fallback`, and the prepared-path zero-miss measurements exclude it. Its full source validation can also occur at activation: a malformed unprepared bank still fails the original constructor, and validation errors are never swallowed as budget failures. Source activation never starts a preparation job. These startup operations run on the existing Node producer thread; I do not claim worker CPU isolation or interruption of synchronous preparation.

Activation still checks bound PCM/signatures and allocates source-owned metadata. Its cost scales with admitted bank data; these short fixtures do not prove that every permitted private bank size fits my processing deadline.

The separate JIT routine generates and discards only original analytic data. Its selected player/NPC and interval topology matches the prepared bank's boolean topology. It exercises one mature authored source and eight additional untouched authored instances at bounded operating points: **nine authored sources and 24,576 authored frames per distinct topology**. Real banks, vehicle identities, eligibility leases and playback cursors are absent from this exercise. Predeclared empty reader fields still contain no head, phase trajectory or playback history.

## Independent processes and retained failures

`Profile-Processing10.mjs` starts each measured workload in a fresh Node process. The baseline is an immutable original-MJS export from parent commit `8a995c8c8f5e7ab1461af64e756f30eafb7667a3`; the archive hash is `f67997621bf15626106251a589cc10e138c4fa277bf201826c862bc29d1951e7`. Independent review checked all 118 members: they match parent Git content after Windows CRLF normalization and exactly match their retained archive bytes. This is not a claim that every exported byte equals its Git blob byte. Current measurements use create-new snapshots containing only RichAudio-owned MJS files. No CodeWalker upstream source, executable, DLL, game geometry, private PCM or asset loader is copied into a snapshot.

The original bank uses the inherited WORLD09 analytic PCM. A broader arm adds 32 authored source intervals to that same PCM. Both direct and authored finite-wall scenes execute the production gameplay, source, causal solver and streaming renderer. Constructor-default and fixed Balanced/CPU profiles are separate controls. The usual arm retains 24 cold-prefix blocks and 120 later blocks. A second arm deliberately leaves the vehicle absent, admits it later, removes it, reacquires a fresh generation and changes its running state while the listener and source move. That arm runs 192 blocks and starts actual source playback only at blocks 43 and 113.

Half the repeated trials add four separate CPU worker processes. Each worker acknowledges readiness before measurement, has a 15-second self lifetime and a 17-second parent termination limit, and receives an explicit stop followed by a joined process-close check. A three-second stop deadline kills and joins any unresponsive worker. A failed, prematurely ended or uncertain worker makes contention qualification fail. This is bounded partial-core contention on a 16-logical-CPU Ryzen 7 5800X, not a GTA-load simulation.

All measured failures remain in create-new raw files. In particular:

- The first prepared implementation removed first-source overruns in the small untextured fixture but increased later median synthesis cost from about **0.45 ms** to **0.76 ms**; broad three-topology JIT warming raised it to about **1.33 ms**. Copying private immutable metadata into ordinary source-owned hot arrays removed that regression.
- The initial topology warm routine passed the untextured fixture, but the broader textured lifecycle retained **20 prepared overruns**, with maxima **14.1832–18.6564 ms**. A single trial also retained later synthesis misses. The baseline retained 32 misses in that experiment.
- A nonperiodic authored warm bank alone still retained first-source misses around **14 ms**. Reference trials without diagnostic method wrappers also failed around **13.9 ms**, so wrapper overhead did not explain the remaining failure.
- Initializing empty reader slots reduced the broader later median from about **3 ms** to **1.35–1.53 ms**, but first-source maxima still reached about **11.2–12 ms**. Exercising several fresh authored instances then removed those observed first-source misses in the subsequent repeated controls.
- The final data-prepared-only control still retained one **11.4435 ms** miss. Immutable preparation by itself is not the measured complete optimization.

The first early report contains two grain-source hashes because a preparation-budget accounting change landed during its first two children. Those trial-specific hashes and measurements remain visible. Subsequent reports use frozen source closures, check their complete manifest before loading, and check selected measured source hashes again after the workload.

## Earlier frozen comparisons retained unchanged

The repeated frozen-04 matrix contains **128 independent processes and 19,968 render calls**. The prepared-plus-JIT path accounts for **48 processes and 7,680 calls**, with **zero observed deadline misses**. The corresponding parent baseline retains **97 misses in 7,680 calls**. These counts do not include the separate cold-constructor and preparation-only controls.

| Workload | Arm | Parent misses / calls | Prepared plus JIT misses / calls | Parent per-child maximum range | Prepared plus JIT maximum range |
| --- | --- | ---: | ---: | ---: | ---: |
| Original untextured bank | Instrumented | 16 / 2,304 | 0 / 2,304 | 19.1693–21.5843 ms | 4.9479–6.6727 ms |
| Original untextured bank | Reference | 16 / 2,304 | 0 / 2,304 | 19.2678–21.9079 ms | 4.4233–5.7818 ms |
| Textured late eligibility and lifecycle | Instrumented | 32 / 1,536 | 0 / 1,536 | 22.6145–25.1061 ms | 8.8437–10.4345 ms |
| Textured late eligibility and lifecycle | Reference | 33 / 1,536 | 0 / 1,536 | 22.5668–28.3155 ms | 6.6646–8.6709 ms |

The measured startup cost is explicit: authored JIT work took **77.3643–90.3952 ms** for the untextured topology and **130.2392–146.1245 ms** for the textured topology in these frozen-04 trials. It runs before rendering readiness. The usual arm's later medians remain approximately **0.67–0.91 ms**; the textured lifecycle's prepared later medians are **1.45–1.78 ms**, compared with roughly **3.06–3.36 ms** in its parent baseline. Different observation schedules and source material are separate workloads and must not be combined as one throughput distribution.

Frozen-04 snapshot manifest SHA-256: `4a75752ed356acb9cb11f2bc05558488fb2ca5d59e0174f88194d730fb91c775`. A subsequent validation-only JIT argument change rejects sparse topology arrays. A fresh frozen-05 snapshot and repeated prepared-path measurements retain that final validation revision separately; the earlier measurements are not relabelled as a later source version.

The final frozen-05 revision repeated **48 fresh prepared-plus-JIT children and 7,680 calls**, again with **zero deadline misses**. Its manifest SHA-256 is `0e90953c02c5246bd99f718e38f91bb95fa3cdc1afc4bb83b2cdf00b325d2c53`. All 96 contention processes in this refresh stopped and joined successfully.

| Final frozen-05 workload | Arm | Misses / calls | Per-child maximum range |
| --- | --- | ---: | ---: |
| Original untextured bank | Instrumented | 0 / 2,304 | 5.1860–7.1128 ms |
| Original untextured bank | Reference | 0 / 2,304 | 4.1396–5.3004 ms |
| Textured late eligibility and lifecycle | Instrumented | 0 / 1,536 | 8.4898–9.9192 ms |
| Textured late eligibility and lifecycle | Reference | 0 / 1,536 | 7.3605–8.3444 ms |

The final refresh retains **76.9249–89.3567 ms** of authored startup JIT work for the untextured topology and **130.6484–140.3483 ms** for the textured topology. Across the final frozen-04 controls and frozen-05 refresh, **128** baseline-to-current PCM/lifecycle comparisons pass, including every block and the instrumented/reference arms. The [portable final evidence](../evidence/acoustic-world-10-processing.json) retains individual trial timings, phase costs, startup costs, source bindings, exact raw report hashes, every overrun and all comparisons. The separate [retained development evidence](../evidence/acoustic-world-10-processing-history.json) preserves the earlier failures and mixed-revision observations; its additional 128 PCM/lifecycle comparisons also pass.

## Timing interpretation and functional validation

Every raw block retains its wall duration and unchanged deadline decision. Instrumented arms retain nested wall/thread-CPU spans for source construction, synthesis, listener/source pose, control preparation, acoustic observation, path construction, visibility, path completion, filtering, renderer acceptance and PCM rendering. Exclusive wall costs subtract the union of direct children. Inclusive parents must not be added to their nested children. Signed CPU residuals and wall-minus-CPU remain visible because Windows CPU counters are coarse. Neither is an OS scheduling measurement.

Main-isolate GC overlap is a temporal annotation inside those measured costs; it is not subtracted, added again, or treated as proof of causation. Raw V8 stack samples retain profile-to-wall clock bounds, and counts remain counts. A stack sample is assigned to a phase only when its full clock-uncertainty interval fits that phase. Per-block dispatch probes and the event-loop histogram include workload, runtime, queued-work and OS effects. No independent OS scheduler trace was captured. A separate `--trace-deopt` diagnostic confirms observed V8 deoptimizations but does not qualify their precise contribution to any timing maximum.

Both reference and instrumented arms retain every dry/stereo block hash, source creation block, identity, generation and source cursor. The portable summary compares those with the parent implementation and checks unchanged renderer frame count, continuous source advancement, stable renderer histories, zero history resets and zero limiter events. The moving wall arm produces real reflection paths through the existing solver; it is an authored wall, not installed-world geometry.

`Test-Processing10.mjs` additionally checks exact PCM across reference/prepared/instrumented paths, genuine late eligibility, retirement and frame-zero reacquisition, plus pre-aborted, in-flight-aborted, invalidated and closed scene-preparation workers. Cancelled workers must join without publishing a scene. `Test-SourcePreparation10.mjs` covers 24/32/48 kHz interval sources, external atlas/spectral features, private plan integrity, source-owned metadata, stale PCM/metadata rejection, preparation bounds, exact installed-registry fixture resolution and authored JIT isolation.

The retained pre-budget focused run passed **14 tests, zero failures/skips**. Its TAP SHA-256 is `cc9e62775e41041d529f537fae8511cbcf912799ce9d2e720dc389b541d2bc11`. The final source/processing focused run passes **19 tests, zero failures/skips**, including direct invalid-count/config rejection before worker startup. Original-only profiler failure controls retain a preceding actual 36-block trial after an injected startup failure, and retain actual block data after synchronous/asynchronous stop-send failures. Every affected worker must join, errors remain in receipts, and a terminal startup failure never retries or starts later matrix trials. Each control writes a separate create-new JSON.

The source-free full functional run passed its inherited original suite, including **838 Node test passes**, plus **190 portable passes and 24 explicit research/native skips**, **22 original metadata controls** and **57 separately invoked retained-research API controls**. That full run preceded the final reporting/failure-harness corrections; the additional 19 focused tests and **23 reproducible reporting/redaction controls** validate those later changes separately. Counts derive from retained TAP/SPEC footers, and original raw logs/results remain unchanged. The final CI entry point includes the current controls; no later hosted result is invented here. Functional checks and actual processing measurements remain separate evidence.

My conclusion is limited to these short offline original-only fixtures. Burst processing with synthetic observation time does not establish private-bank size coverage, long-session stability, WASAPI continuity, physical latency, GTA-load safety or audibility. The strict deadline remains unchanged, and every remaining failure remains a finding.

## Reproduction

From this checkout, freeze a new authored snapshot, then choose fresh report names:

```powershell
node tools/Freeze-Processing10.mjs world10-current-my-check
$config = '{"selectedModes":["baseline-cold","current-prepared-jit"],"repetitions":2,"contentionCounts":[0,4],"snapshot":"world10-current-my-check","instrumented":true}'
node tools/Profile-Processing10.mjs --run --out .local/my-processing10.json $config
node --test --test-reporter=tap --test-concurrency=1 tests/Test-Processing10.mjs tests/Test-SourcePreparation10.mjs
```

The supported default regression entry point is `pwsh -NoProfile -File tools/Test-Offline10.ps1`. It runs the original inherited audio/host suite with CodeWalker source research disabled, original XML containment, portable WORLD042-through-10 controls and a bounded independent processing profile. `-SkipProcessingProfile` separates a comprehensive functional run from already retained timing measurements. Native research-only cases remain explicitly skipped and counted; a separately supplied `-RetainedResearchCoreRoot` enables only the retained research API probe and does not qualify a standard DLL. The default clears and restores optional private/research environment inputs before any test, builds no Core, copies no research Core and creates no research distribution package. Older runners preserve their previous default behavior.

CI uses this WORLD10 entry point and retains sanitized TAP/result/performance JSON, the original-only raw processing reports, their snapshot manifest and the injected failure-control JSON. It uploads no CodeWalker DLL, upstream source ZIP or research application package. Functional completion and processing-deadline success are separate result fields, and measured misses remain visible even when functional tests pass.

The parent baseline directory is local evidence, not a distributable component. To reconstruct it, export only parent-tracked `src/acoustics/**/*.mjs`, the two WORLD09/042 profiler MJS files and their two original fixture MJS files from `8a995c8` into `.local/world10-baseline-8a995c8`, retaining the archive as `.local/world10-baseline-8a995c8.zip`. No upstream source checkout or game directory is part of that operation. Use `instrumented:false` for the matching reference arm, and `texture:true,lifecycle:true,blocks:192,selectedProfiles:["fixed-cpu-balanced"]` for the broader lifecycle control. Reports and snapshots are create-new; failures never overwrite earlier evidence.
