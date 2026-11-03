# My offline processing investigation

I retain the earlier 144-call measurements: local maxima of **61.1894 ms** and **84.8955 ms**, each with one call above **10.6667 ms**, and the separately reported hosted maximum **20.7482 ms** with two overruns. These are processing findings. They do not measure fixed output latency, an endpoint dropout or the cause of the spikes. The historical public figures remain in [my WORLD04.1 result](ACOUSTIC_WORLD_041_RESULT.md); this investigation does not reopen its private evidence.

Codex added `tools/Profile-AcousticBudget042.mjs` around my existing production source, gameplay, solver and PCM renderer. The runner supplies original analytic mono PCM to the Bati source class and finite authored scene contexts. It calls no bank loader, installed-resource reader, audio endpoint or recording API. It changes no core implementation, acoustic coefficient, timing gate or default setting.

The full diagnostic runs each condition in a fresh Node child, sequentially, reversing condition order on alternate repetitions:

- Uninstrumented direct-scene reference.
- The same direct workload with local method wrappers.
- Instrumented geometry changes through the existing joined background scene worker: finite wall replacement, cancellation, explicitly missing geometry, invalidation and expiry.

Each child labels its initial configured render calls as a **cold prefix** and its remaining calls as **later blocks**. Module import time precedes those intervals; this is not proof of completed JIT compilation or steady state. Child wall time and engine construction remain separate. The fixed CPU/balanced profile matches my existing continuity test; a separate regression compares unchanged constructor settings. The deterministic observation clock does not pace an endpoint and does not measure the gameplay quality controller's real-time reaction.

For an instrumented call, `sourceConstructionMs` covers the unchanged `StockVehicleSource` constructor; `sourceSynthesisMs` covers its `renderInto`; `controlPreparationMs` covers solver preparation and control acceptance; `pcmRendererMs` covers synchronous `pipeline.process`. The remainder includes gameplay bookkeeping and instrumentation overhead. Observation acceptance, authored scene construction, joined worker preparation and scene attachment are recorded outside each render. An aborted worker may still overlap the following render before its separate join; that interval is retained explicitly rather than subtracted from a PCM call.

The report retains every call and every overrun against **512 / 48000 seconds**, plus calling-thread CPU time when Node provides it (otherwise process CPU). A `PerformanceObserver` records actual local-isolate GC event intervals. The report associates temporal overlap only: it cannot establish that GC caused a spike, identify worker GC, or infer OS descheduling by subtracting CPU from wall time. The event-loop histogram samples at 10 ms; burst workloads may produce zero samples. Before/after `setImmediate` probes are separate scheduling observations, not per-render scheduling measurements.

The wrappers and digest work introduce diagnostic overhead. Equal dry/stereo digest work runs outside timed calls in every condition. The reference and instrumented direct workloads must produce bit-identical dry PCM and stereo PCM. Geometry changes may deliberately change acoustic output, so that comparison checks bit-identical dry source PCM, stable source object and sample cursor, retained renderer histories, equal renderer frame counts and zero added PCM queue frames. This establishes an offline continuity property, not unchanged acoustic output through changed geometry or measured physical latency.

To retain a fresh report, the test runner uses a new filename directly under this checkout's `.local` directory:

```powershell
node tools/Profile-AcousticBudget042.mjs --run --out .local/world042-processing-01.json --blocks 144 --cold-blocks 24 --repetitions 2
node --test tests/Test-AcousticBudget042.mjs
```

Existing report files are never overwritten. Selected source hashes and runtime/CPU metadata identify the measured implementation; they are not a full transitive module or operating-system closure. No timing threshold controls test success; the tests check interval accounting, retained overruns, bounds, bit identity and worker/source continuity. A quiet sequential run reduces known interference but does not establish a controlled operating-system scheduler. Fresh measurements cannot retrospectively assign a cause to my historical local or hosted overruns.

## Fresh findings

Codex ran two coordinated, sequential local profiles using Node **v24.19.0**, six fresh children and **144 calls per child**, with a 24-call cold prefix. The initial report is retained unchanged (SHA-256 `2926d68e10c6c73ca51984f42a3048b4bd0f5d96d99b50e2b2824840b06f78c8`). It showed the same zero-based block **10** overrun in every child, including the reference without scene workers. Its large remainder motivated adding a separate source-construction interval. That refinement has its own fresh report, SHA-256 `7cabe12802c02b119ed09972ce902d11ac6e4eb882d21330d513ff7ab3bf5e43`:

| Condition | Repetition | p50 / p99 / maximum (ms) | Overruns / calls |
| --- | ---: | --- | ---: |
| Reference direct | 0 | 0.6399 / 4.7133 / 17.9156 | 1 / 144 |
| Instrumented direct | 0 | 0.7140 / 4.7737 / 18.4549 | 1 / 144 |
| Instrumented scene changes | 0 | 0.7203 / 4.6442 / 18.9164 | 1 / 144 |
| Instrumented scene changes | 1 | 0.7344 / 4.5369 / 19.4476 | 1 / 144 |
| Instrumented direct | 1 | 0.7389 / 4.5175 / 18.9848 | 1 / 144 |
| Reference direct | 1 | 0.7063 / 4.6988 / 18.9280 | 1 / 144 |

Again, every overrun occurred at block **10**, where the cumulative source-creation counter first became one. No acoustic paths were selected and no surfaces were present in those calls. Across the four instrumented children, the unchanged production source constructor occupied **11.4398–12.0730 ms**, synthesis **3.9202–4.3596 ms**, control preparation **1.4727–2.0043 ms**, synchronous PCM rendering **0.4984–0.6366 ms**, and the remainder **0.6558–0.7735 ms**. This localizes a substantial first-source cost in this original workload. It does not assign a cause to my historical **61/84 ms** or hosted spikes, and the overrun remains unresolved.

Each child's remaining 120 calls had zero overruns, with maxima **1.6254–2.7471 ms**. This short observation does not guarantee a deadline. The joined scene-worker preparations took **31.1196–50.4318 ms** outside rendering; cancellation joins took **7.1585–7.2805 ms**. Those operations do not constitute a measured PCM render cost or prove live queue continuity.

The six overrun intervals overlapped observed GC events by a summed **0.4001–1.3550 ms** each. Temporal overlap does not explain the entire call or establish causality. The runtime exposed process CPU timing rather than calling-thread timing; other V8 threads may contribute. The timer histogram observed long burst-level delays, with just one sample in each direct child and 14 in each scene-change child. These samples cannot locate an OS scheduling delay inside a particular render.

Both repetitions retained bit-identical reference/instrumented direct dry and stereo PCM. The geometry-change comparisons retained bit-identical dry PCM, one stable source object, continuous source cursor, stable renderer histories, equal **73,728** rendered frames, zero limiter events and zero added PCM queue frames. Both source and listener crossed the authored tile boundary. The five focused diagnostic tests passed after each run, including the separate constructor-settings bit-identity regression. My installed-world, endpoint and audibility evidence remains unchanged; no real Bati bank was read.

The subsequent complete offline suite retained another inherited 144-call measurement: p50/p99/maximum **0.7797 / 3.9639 / 56.6579 ms**, with **one** call above **10.6667 ms**. Its log is SHA-256 `9fd15c12e57b929cad3c120489b0f0a00a6a08cdf7b4cfe2c8fdb42979b50682`. That inherited measurement has no new per-stage instrumentation, so the separate first-source findings cannot identify its spike's cause. The successful functional suite does not remove this overrun.
