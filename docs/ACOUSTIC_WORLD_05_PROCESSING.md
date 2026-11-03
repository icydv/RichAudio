# My first-source preparation change

My WORLD04.2 investigation retained a first-source constructor cost around **11–12 ms**, plus the earlier larger local and hosted processing overruns. Those reports remain unchanged. Codex added a small opt-in control API around my existing `StockVehicleSource`; its constructor, grain implementation, synthesis, gains, renderer and audio block budget remain unchanged.

`StockGameplay` still defaults to `sourcePreparationPolicy: 'disabled'`. An explicit `sourcePreparationPolicy: 'explicit-control05'` enables `prepareSources05({sourceIds, maximum, validForMs, signal})`. Trusted startup/control code can call it after accepting an original observation and **await completion before beginning a render deadline**. No call to `accept`, `render`, scene loading or an audio callback starts preparation automatically.

The API yields once, then calls the existing registry's `createSource` synchronously on the same Node event loop. **This is not asynchronous CPU isolation.** Calling it between imminent audio deadlines could still delay later work. It moves the known constructor work to an explicit startup/control phase; it does not eliminate the work or establish a real-time scheduling guarantee.

At most two untouched, sample-zero sources remain ready for at most 250 ms, bounded further by the accepted observation's lease. Each binds the exact engine session, vehicle identity/generation/model/context, loaded bank object and source gain/pressure profile. The existing render selection consumes a matching source once. A miss, expiry, cancellation or mismatch follows the original immediate constructor path without waiting, inserting silence or adding a PCM queue. Existing active sources retain their object, cursor and histories. Geometry changes do not cancel active sources.

New observations prune disappeared source identities. Source generation, bank/profile changes, invalid/reversed control time, an aborted signal, explicit `cancelPreparedSources05()` and closure prevent stale readiness from being used. Preparation refuses an active opt-in render, including after its initial yield. Closing the opt-in engine joins pending preparation without starting construction afterward. Loaded bank memory is trusted as in the existing registry contract; changing assets must replace the bank object. Consumption does not rescan or hash PCM during rendering.

Codex used original analytic PCM through the existing Bati source class. No real Bati bank, installed resource, endpoint or recording was accessed. The nine focused tests compare bit-identical dry/stereo PCM and sample counts, frame-zero consumption, immediate fallback, exact bindings, bounded readiness/reuse, abort/close behaviour, and source/history continuity through moving tile boundaries, unknown geometry, cancelled scene workers and expiry.

## Coordinated local measurements

The test runner ran six fresh sequential Node children in a coordinated quiet slot, reversing condition order in the second repetition. Each child processed **144 blocks of 512 frames at 48 kHz**, with a 24-call cold prefix. These are burst-mode, instrumented offline measurements with deterministic observation time. They do not measure endpoint pacing, physical output latency or universal deadlines.

| Condition | Repetition | p50 / p99 / maximum render (ms) | Calls above 10.6667 ms |
| --- | ---: | --- | ---: |
| Default | 0 | 0.6286 / 4.6673 / 20.0293 | 1 / 144 |
| Opt-in, readiness missing | 0 | 0.7013 / 4.8726 / 20.3150 | 1 / 144 |
| Opt-in, prepared beforehand | 0 | 0.6943 / 4.7436 / 8.4716 | 0 / 144 |
| Opt-in, prepared beforehand | 1 | 0.6871 / 4.4663 / 7.1320 | 0 / 144 |
| Opt-in, readiness missing | 1 | 0.7165 / 4.8700 / 20.8761 | 1 / 144 |
| Default | 1 | 0.7040 / 4.8885 / 20.7178 | 1 / 144 |

The four default/missing-readiness overruns all occurred at zero-based block **10**, the first source activation. Their constructor intervals were **11.1328–14.0291 ms**. In the prepared arms, no constructor ran inside rendering. The external registry-construction brackets were **11.9673–12.0166 ms** in the separate control phase; the API's broader construction brackets were **12.0067–12.0542 ms**, and its total awaited control wall time was **12.6256–12.6456 ms**. The API yields, wrapper bookkeeping and constructor brackets have distinct boundaries; these durations are not interchangeable.

The prepared arms' largest render calls were still block 10: synthesis **4.3554 / 5.8091 ms**, control preparation **1.4350 / 1.3550 ms**, synchronous PCM rendering **0.7329 / 0.6116 ms**, and remaining gameplay/instrumentation **0.6087 / 0.6959 ms** (repetitions 1 / 0). The remaining 120 calls per child had maxima **1.5795–1.7590 ms**. Future scheduling, source transitions or other workloads can still overrun.

The profiler retains actual local-isolate GC intervals and their temporal overlaps. The four overrun calls overlapped observed GC by **1.1838–2.9155 ms**; no causal attribution follows. No OS scheduler cause or worker-GC contribution was measured. The older **61/84 ms** and hosted spikes remain unexplained by this new workload.

All three arms in both repetitions produced the same dry PCM digest and the same stereo PCM digest. Each rendered **73,728 frames**, retained one continuously advancing source with final cursor **68,608**, and reported zero affected history frames and zero limiter events. There is no source pre-roll and zero added fixed PCM queue frames. This is an offline functional property; no new audible or physical latency claim follows.

The fresh private report is SHA-256 `5ca3c748666587f0da3f9b210390d46c1fb1d85df89e830a15d0d22acdd1af6a`. It includes selected source hashes, runtime metadata, every render interval, stage measurements, constructor phases, GC overlaps and matched PCM hashes. Later input-validation/bookkeeping corrections reject falsy counterfeit AbortSignals and count every returned cancellation outcome; these measurements used omitted signals without cancellations and are retained against their original source hashes. No timing rerun or retrospective change was made. Selected hashes are not a complete transitive runtime closure. Its fresh filename and the earlier reports are never overwritten.

```powershell
node --test tests/Test-SourcePreparation05.mjs
node tools/Profile-SourcePreparation05.mjs --run --out .local/world05-source-preparation-fresh.json
```

The profiler should run sequentially while other heavy tests are paused. No performance threshold controls regression-test success, and neither the block budget nor acoustic correctness gates were relaxed.
