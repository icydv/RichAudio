# STREET-01: responsive cached scenes under the original freshness limit

My genuine normal warm-start dependency remains **unqualified**. The subsequent approved proposal08 ran and failed: all 10,663 partial representations were currently validated, but none of its nonempty scenes reached my actual consumer. Its last 781-surface window took 1,383.01 ms against the unchanged 1,000 ms lease. Fourteen empty publications, 273 expired worker results and the complete failed evidence remain preserved.

The measurements below describe the earlier repair and its original-only fixtures. They did not reproduce the later demonstrated cache pressure. My follow-up [shared component architecture](STREET_01_COMPONENT_CACHE.md) separates persistent geometry from observation-bound scenes and documents the precise limits of the new authored reproduction. A successful offline repair does not retroactively qualify proposal08 or authorise another installed-data run.

## What the earlier result establishes

Proposal06 took 725.26 seconds, used 1.84 GiB peak aggregate memory, 1,460.16 CPU seconds and 183.12 GiB logical reads. Its persistent reader internally constructed 781 surfaces, delivered 14 empty scenes and discarded 350 expired results. The last internally nonempty preparation took 1,154.85 ms against its original 1,000 ms request lease. All owned processes closed.

The old evidence cannot divide that 1,154.85 ms among refresh, geometry, indexing, encoding, transport and adoption. An internal status was not a delivered scene. The old maximum worker timing covered admitted empty publications and did not bound discarded work. Codex has not fabricated a retrospective decomposition.

The frozen `1bda85484413fab37e59acdf7f1bd6f9276dd694` implementation repeatedly decoded selected collision chunks, reconstructed finite panels and stable IDs, calculated global coverage during status publication and fully decoded/reconstructed a scene already validated by its worker factory. The controlled measurements below demonstrate these costs and the benefit of removing duplicated work. They do not establish the exact cause of the historical miss.

## Integrated changes

Codex retained the existing persistent world worker and implemented:

- A bounded cache of immutable decoded query views, keyed by resource/index/receipt/archive/proof/catalogue identity and exact chunk, analytic and unknown-region candidate sets. Every cache hit still reads and SHA-verifies the current selected chunk bytes. File timestamps never substitute for content integrity.
- Reusable triangle bounds, normals, stable identities and finite panel templates. A template contains no observation time, generation or pose. Only wholly contained triangles reuse it; current boundary clipping, distance ordering, finite reflection selection, unknown coverage and pose-dependent acoustic state are evaluated afresh.
- At most eight query views with 64 MiB of conservative allocation charges, within the existing bounded resident-resource and worker-heap limits. Eviction removes associated views; source/proof/index/receipt/catalogue/epoch changes cannot authorise an old representation.
- Coverage summaries calculated at manifest reload rather than every status call. Unchanged resource bindings survive unrelated preparation progress; changed or revoked rows are evicted.
- A local capability for the exact immutable packet produced by the validated factory. Transfer preparation reuses that scene/index instead of constructing it a second time. Arbitrary or cloned packets still take the complete decoder; the receiver still requires the actual owned worker channel, source identities, request, generation, epoch and packet integrity. No worker flag grants geometry authority.
- Bounded 64-record lifecycle diagnostics and explicit shared-process clock proof. Expired work stops before subsequent expensive stages. A late preparation may populate immutable caches, but only a distinct fresh observation can query them; its old result is never retimestamped.
- Final consumer freshness checks after SoundMap registration and scene replacement. Qualification captures the currently bound scene at work termination, before cancellation/cleanup. Any observed post-acceptance lease gap remains a failure, including after recovery. A failed final verdict now exits nonzero.

The 200 ms observation cadence, 500 ms minimum dispatch interval, one active/one latest pending request and 1,000 ms horizon remain. Same-generation fresh active results retain their original pose/time; discarding every active result merely because a newer observation exists would starve delivery at this cadence. New generations and expired/corrupt/revoked work remain rejected.

Conditional installation geometry remains conditional. Native units, unmeasured material assumptions, unsupported regions and unobserved GTA activation retain their existing labels. No acoustic quality, path limit, source history, PCM buffer or GPU fallback was reduced.

## Original-only paired measurements

Codex froze the tracked baseline and measured baseline/candidate sequentially on identical original data, settings and input sequences. Each workload has 10,663 authored metadata entries, several valid nearby source-bound resources and current archive proofs. The primary region has 781 finite surfaces; moving into its neighbour adds 260. Listener/source positions and declared velocities change, with generation changes at discontinuous moves.

A separate heavier workload adds 158 available analytic primitives with three nearby candidates, producing 2,436 approximate triangles plus the 781 authored triangles:3,217 finite surfaces, or 3,477 at the neighbouring boundary. This is explicitly larger than the historical final 781-surface scene.

Each cadence run sends 60 observations at 200 ms through the actual production worker, transport, StockGameplay queue and application, without PCM rendering. The dispatch interval and original 1,000 ms lease are unchanged. A separate 11-pose direct probe measures cold/warm stages and compares exact geometry, materials, selected reflections and actual path geometry/propagation. All 22 paired poses match exactly.

| Request creation → actual accepted consumer | Baseline | Candidate |
| --- | ---: | ---: |
| 781-surface accepted publications | 24 | 24 |
| Median / p 95 / maximum | 221.33 /321.33 /332.78 ms | 176.21 /260.22 /266.70 ms |
| First cold acceptance | 286.50 ms | 248.72 ms |
| Expired results | 0 | 0 |
| Heavier analytic accepted publications | 21 | 23 |
| Median / p 95 / maximum | 695.82 /786.14 /803.11 ms | 395.62 /544.15 /600.01 ms |
| First cold acceptance | 730.02 ms | 600.01 ms |
| Expired results | 1 | 0 |

The heavier baseline's natural expired result remains in the raw evidence; accepted-latency statistics exclude it. Each heavier run also discarded one superseded generation, correctly, with no relabelling. Candidate publications all reached the consumer within their own original lease. Neither workload reproduces the historical 1,154.85 ms result exactly, and no artificial delay was added to make the baseline fail.

| Warm direct-probe median | Baseline | Candidate |
| --- | ---: | ---: |
| 781 surfaces: window / transfer preparation | 32.94 /32.29 ms | 23.57 /5.10 ms |
| 3,217 surfaces: window / transfer preparation | 139.01 /162.98 ms | 97.80 /27.08 ms |
| 781 surfaces: encoding / SoundMap preparation | 12.05 /5.06 ms | 11.13 /5.36 ms |
| 3,217 surfaces: encoding / SoundMap preparation | 55.41 /31.82 ms | 54.62 /28.54 ms |

Whole-worker cadence medians fell 105.40→59.17 ms and 477.34→272.15 ms. Parent adoption stayed approximately 1.6 ms and 6.3 ms; consumer application stayed approximately 0.46 ms and 2.2 ms. Scheduling still matters: candidate median request waiting was 94–95 ms, with maxima around 200 ms. This time consumes the original lease and is not hidden inside a new timestamp.

Cold direct window construction did not improve:60.80→72.40 ms finite and 197.62→201.26 ms analytic. Reuse benefits subsequent observations and removes duplicate transfer reconstruction even on the first scene. Remaining warm work includes full fresh tile validation/index preparation: about 12 ms finite and 64 ms analytic in the last direct probe. Analytic encoding remains about 55 ms. These remain measured costs, not completed optimisations.

The 11-pose candidate reuse probes recorded 31 hits/5 misses and 30 hits/6 misses. Both retained four resources, with five/six views charged 4,266,496/15,309,824 bytes under the eight-view/64 MiB cap. The last warm analytic query still read 75,048 current bytes in three calls:0.259 ms read-call latency and 0.055 ms SHA time, with no JSON parse, chunk decoding or analytic tessellation on that hit.

CPU user+system fell 4.672→3.015 seconds finite and 15.515→11.281 seconds analytic. Peak process RSS was 255,385,600→262,791,168 bytes finite and 425,123,840→420,356,096 bytes analytic; the finite candidate used more peak memory. Queues ended empty, cached views remained bounded and final RSS fell below its peak in these bounded runs. This does not establish indefinite-session memory behaviour. Every worker joined with exit 0.

## Timing and IO interpretation

Diagnostics separate original request/wait/dispatch, worker arrival, refresh, resource loading/query, triangle selection, panels, tile/index validation, reflection selection, acoustic construction, encoding, GPU/index packing, SoundMap preparation, message delivery, parent adoption and actual consumer application/final expiry. Refresh and query operations expose read-call duration/logical bytes, SHA, UTF-8/JSON parse, decode including its existing SHA, tessellation and classification. Worker thread CPU is reported where supported. Expired results retain timing even when no scene is delivered.

Parent and worker compare process ID, performance time origin and clock kind before subtracting timestamps. `postMessage` call duration includes structured cloning/enqueueing; observed delivery includes that work plus scheduling/deserialisation. It is not a pure network or physical-transfer measurement. Read-call latency includes OS caching and scheduling; it is not physical disk latency. Nested timings/counters overlap their enclosing stages and must not be summed twice. Worker heap snapshots cover admitted publications; aggregate Job monitoring remains the authority for rejected intervals.

Codex reviewed retained proposal06 IO without reopening installed resources:

| Retained logical-read attribution | GiB |
| --- | ---: |
| Archive-content hashing before/after cache work, including local verification | 126.91 |
| Other measured geometry phases: cache validation/binding, metadata and queue work | 32.07 |
| Geometry driver/initialisation and other work outside those phase counters | 9.65 |
| Remaining normal outer stages | 1.05 |
| Work outside the normal outer Job, including reader/harness | 13.44 |
| Inclusive aggregate | 183.12 |

The counters are inclusive process logical IO. The retained evidence cannot exactly split the residuals into manifest, catalogue, receipt, index, chunk and library reads. It does record 111 reader manifest loads, 24.39 seconds manifest processing and 25.88 seconds catalogue/index processing, plus 6.49 GiB of geometry metadata publication. These are not physical-disk totals. Required archive hashes remain; Codex did not remove validation stages or undertake a storage redesign. The reader now avoids repeated geometry decoding, panel construction, global status calculation and duplicate scene validation, while new diagnostics can attribute the next approved genuine miss.

## Correctness, complete startup and qualification boundary

Focused tests reject same-size chunk corruption with restored mtime, changed source/index/receipt, revoked archive proof, wrong catalogue, a new startup epoch, generation changes, region boundaries/teleports, conditional activation, superseded work, corrupted prepared packets, eviction, cancellation, incompatible clocks and worker failure/restart. Reused and freshly constructed geometry match, including conservative unknown-region behaviour. Existing 4,096-support tests preserve exact visibility predicates and PCM. Focused pipeline/source-history/airflow/latency checks also pass.

The complete actual aggregate wrapper → measurement/inner wrapper → normal catalogue/resolver → geometry driver → persistent reader → actual StockGameplay pathway passes in two clean-process working directories. Only protected CodeWalker initialization/metadata uses a declared original public-API fixture DLL. In the final bankless rehearsal, first consumer acceptance occurred 11.359 / 10.816 seconds from measurement entry; terminal scenes remained fresh, with zero observed post-acceptance lease gaps, retained archive proof and full broader completion. Inclusive aggregate peaks were 581,955,584 / 585,388,032 bytes. Controlled initializer failure exits 1 with zero acceptance. All Jobs/readers join and scoped independent fixture-process checks are empty. The main performance demonstration is the 781-surface workload, not this two-surface startup wiring control.

Parent-observed status callbacks can follow consumer callbacks. Internal computation timing comes from verified worker `windowCompletedAt`/first-internal milestones; status-observation timestamps are not exact internal completion times. All raw observations and clock operands remain retained.

Independent review found and verified corrections for terminal lease starvation, failure exit propagation and CPU/IO profiling separation. It also reviewed cache invalidation, timing methodology, exact consumer integration and the disabled successor.

The first hosted STREET check passed all 222 active Node tests, including the moving representative consumer; one platform test was skipped. Its PowerShell resolver fixture subsequently failed at a generic child-exit guard, and its child stderr was absent from the old artifact selection. The exact original hosted cause remains unknown. Codex corrected that fixture's assumption that the frozen publisher must fail on every long-path configuration: success now requires exact replacement bytes, and failure requires exact preservation of the previous bytes. Actual short-path success and an exclusive-sharing failure verify both outcomes; corrected publication, confinement and cancellation remain strict. Four local Windows PowerShell children pass and close. Child stderr and per-child closure evidence are now retained on failure. This follow-up changes no acoustic production code or proposal07 source pin. The automatic inherited processing check separately failed an affinity-helper deadline; it remains a failure, with no manual retry or relaxed assertion.

A final audit found that the earlier qualification helper constructed an 8,192-sample authored analytic bank even when it rendered zero frames. Zero rendering did not establish zero sample generation. Codex replaced that setup with the actual StockGameplay geometry consumer and a bankless registry. Harness-only guards reject bank resolution, source creation, rendering and PCM processing before action; all five attempt counters remain zero in every final startup case. Queue, scene application, validation and replacement remain the actual production methods. Independent fresh-process inspection trapped the old bank factory, verified that the new construction/adoption makes no such call, and checked imports for side effects. Blank renderer/history buffers remain allocated; no waveform bank is generated. Proposal07 and its earlier review are preserved and superseded before any genuine execution. The original performance and PCM regressions remain separate, authorised original-only experiments.

The hosted STREET workflow at `5394587` passes on Node24. Its Node22 run passes the new scene tests but fails the existing airflow wall-preparation result/join guard. That fixture discards the returned state/reason; a 5.506-second duration does not prove the cause. Its unchanged preparation budget is 2,000 ms, and an independent source audit found all ten owning files unchanged from the baseline. No deadline extension or blind retry was made. This failure and the inherited processing deadline failures remain open; neither is reclassified as success.

The subsequently consumed proposal was `street01-normal-proposal08-4afd188b085c40889b7e5d2a265370cd`, private template `.local/street01-normal-readiness01/proposal08/qualification-template.json`, SHA-256 `2df36ddf788502d64ac76013790efc993bb3aeb7bdefcb0d6755b4806f1e0ed4`. Its 291 pins bound that source checkpoint and its review fixtures. Named installation/software/cache/pose expectations and 3 GiB preparation / 4 GiB aggregate / 1,800-second work / bounded cleanup limits remain unchanged. Up to two sequential normal metadata helpers, maximum concurrency one, zero geometry decoding and zero PCM remain explicit. Its false-approval guard rejected before workload intent. My later explicit single-use approval was consumed by the failed genuine execution described at the top of this report; it cannot authorise a retry.

No fresh installed-resource/vendor bootstrap read, historical cache rewrite, GTA/RPH launch, deployment, endpoint, playback/capture, native muting, quarantine change or merge occurred during this task. Passive candidate04 remains unchanged and unexecuted. The 512-frame/48 kHz audio block, 10.6667 ms hard deadline, 8 ms target, source/grain causality, airflow, reflections, GPU Auto/CPU fallback and F10 sidebar/first-open correction remain intact. These scene-worker measurements do not qualify audible latency, GPU hardware, GTA FPS, world activation, selective takeover or a playable release. Earlier complete-processing timing failures remain failures.
