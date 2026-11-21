# WORLD13 result

My functional validation is restored locally, and my real-time acceptance remains **failed**. Codex implemented bounded fixture cleanup and independently observable CI, retained the rejected DSP experiments, and kept my production synthesis, renderer and sound unchanged. This draft stacks on PR92 at `85646ec65f2f88f0eb935374a79260a75e96b728`.

## Inherited cleanup

The original WORLD12 [hosted run 41811430122](https://github.com/icydv/RichAudio/actions/runs/41811430122) remains a failure. Its exact staged public Node26 copy reached the final Node22-controller cleanup after the deadline, joins, containment and profile-deletion assertions, then returned actual `EBUSY`. The retained hosted evidence does not identify a lock owner or numeric errno.

Original authored handle/mapping controls reproduce distinct actual Node outcomes: delete-sharing denial produces `EBUSY`; a mapped image produces `EPERM`; compatible sharing and a held data mapping permit deletion on the tested machine. Those mechanisms do not establish the historical owner's identity. The [cleanup correction](WORLD_13_CLEANUP.md) instead binds the exact prepared copy before launch and deletes it through an independently checked native handle. It retains identities, first failures, every availability observation and completed joins. A separate strict 2,000 ms cleanup budget and 16-attempt ceiling extend no worker, supervisor, AppDomain or original execution deadline. Only observed native sharing violation 32 permits recorded polling. Persistent locks, drift, unknown errors and incomplete joins remain failures with the copy retained.

Independent source/raw-evidence review qualifies this fixture mechanism. Namespace absence is checked after the native helper closes; it is not proof that every possible external reader has closed. There is no hidden rename, attribute change, worker relaunch or whole-test retry.

## Local validation and preserved failures

Both public runtimes pass the complete selected local functional suite: **838 inherited Node passes**, **191 portable passes /24 named research skips**, **23 WORLD11 controls**, **45 WORLD12 controls** and **13 separate cleanup controls** per runtime. The final processing preconditions add **72 passes /zero skips** per runtime. The ten normal expiry cases and **83 assertions over ten authored holds** remain separate populations. The [functional evidence](../evidence/world13-local-functional.json) preserves counts, exclusions, source revisions and raw bindings; these are not invented unique totals.

The Node22 full inherited wrapper predates publication-only amendments; the Node24 wrapper includes sanitized publication. Later final processing wrappers execute all 72 final controls on each runtime. These revisions are recorded explicitly rather than relabelling earlier executions. Fresh hosted execution uses the final reviewed controller and its own receipts.

Every main/preparation trial completes: **288 trials /48,384 blocks** across the two runtimes. All **128 parent/candidate**, **144 off/on** and **16 preparation** comparisons preserve authored PCM, dynamic phase/grain history, direct/reflected paths and lifecycle. All **544 owned children, 544 affinity helpers and 160 scene workers** join, with **256 qualified contenders**. Counts exclude the separate injected controls.

| Runtime | Main parent /candidate hard misses | Candidate main maximum | Candidate hard misses including preparation | Candidate blocks >8 ms including preparation |
| --- | ---: | ---: | ---: | ---: |
| Node22.23.4 | 39 /39 | 26.1185 ms | 60 | 147 |
| Node24.19.0 | 8 /7 | 15.2208 ms | 15 | 52 |

Each implementation has 10,752 main blocks per runtime; candidate main plus preparation has 13,440. Neither hard deadlines nor the 8 ms maximum-duration target passes. Candidate Node22's largest main spike is later active playback with two contenders and four allowed logical CPUs, uninstrumented; its phase cause is unknown. Instrumented first-activation maxima retain approximately **10 ms source synthesis**, **2.8–2.9 ms control preparation** and **0.6–0.8 ms PCM rendering**. No new source-construction problem is demonstrated. Quantized CPU counters and signed-negative profiles remain genuine limitations. The [processing report](WORLD_13_PERFORMANCE.md) retains percentiles, conditions, every miss, headroom blocks and lifecycle detail.

Codex rejected all **seven timed source candidates and three timed renderer candidates**, plus the separately documented static counterexamples. Their **160 source /48 renderer fresh processes** and negative outcomes remain retained. There is **no selected DSP optimization** and no causal improvement claim from the fresh comparison's different timings. See the [experiment report](WORLD_13_PERFORMANCE_EXPERIMENTS.md).

## Required CI and next step

The workflow independently schedules functional and processing jobs for Node22 and Node24. Each matrix keeps fail-fast disabled. The final always-run aggregate accepts success from both job families only. Required functional, hard-deadline and 8 ms headroom failures therefore fail CI; missing/skipped/cancelled work cannot become success. All selected measurements finish before a timing verdict fails. Structural failures preserve their partial report and explicitly unexecuted dependent stages without retry. Both job families preserve the original 30-minute job limit.

Original reports remain private. Create-new publication copies redact checkout/profile prefixes from JSON strings, bind original/published SHA-256 values and preserve numeric findings. The final publisher's negative controls retain growth, truncation and partial-publication failures. Fresh hosted job/artifact outcomes are reported separately in the draft PR after the committed candidate runs; they are not preclaimed by these local results.

Separate Codex agents independently reviewed the cleanup mechanism, raw receipts, source/renderer rejections, workflow, exact-state controls, publication and local results. The [review](WORLD_13_IMPLEMENTATION_REVIEW.md) identifies their receipts and limitations. My next justified milestone is the [bounded tracing experiment](WORLD_13_PERFORMANCE.md#next-justified-experiment), with matched untraced controls, before selecting another kernel rewrite.

My Bati calibration, 48-kHz/512-frame blocks, freshness/source-expiry safeguards, reflections, Doppler, camera continuity and LOW-LATENCY-01 buffers/queues remain unchanged. CodeWalker integration/dependencies, cache, SoundMap and the unsent API request remain unchanged. Native suppression and post-dismount continuation remain separate unresolved work. No installed resource, bootstrap, private capture/key or game executable was accessed. No GTA/RPH launch, endpoint playback, recording, deployment, developer contact or merge occurred. Offline success is not gameplay, private-bank, endpoint-underflow or physical-latency proof.
