# WORLD11 measurement and acceptance scope

My hard block deadline remains **512 / 48,000 = 10.6667 ms**. Every individual miss remains a failure; functional success, PCM equality and averages do not pass this timing gate. For reporting meaningful headroom, Codex also checks an additional **8 ms maximum-block target**, leaving 2.6667 ms (25%) below the hard deadline. This target neither changes the renderer deadline nor adds latency. Results must retain the actual maximum and every missed block even when a group meets a percentile target.

## Controlled comparisons

The parent is exactly PR90 commit `f612bfc5f9f8ecce5565cb9853b1aacfe8179cba`. Candidate and parent execute separately frozen owned-source closures with the same authored PCM, observations, source lifecycle and geometry inputs. Each closure includes the actual executed profiler, input fixture, process-control code, span accounting and summary helpers. Source/input and Node executable bytes are checked before/after; summaries bind their own working helper closure separately. No captured real directory, private sound bank, game executable or key is used.

The main design crosses parent/candidate, instrumentation off/on, original loop/textured material, direct/finite-wall scenes, normal/restricted-four-logical-CPU masks, zero/two owned contenders and two independent process repetitions: **128 children / 21,504 blocks per runtime**. A separate same-implementation control compares data-prepared execution without authored JIT work against data-prepared execution with it: **16 children / 2,688 blocks per runtime**, using the wall scene. These are separately identified populations, not interchangeable repetitions. Any restricted-one-CPU contention exercise is an overload/cleanup diagnostic and cannot establish normal realtime acceptance.

All children are new owned processes held at an IPC gate. The supervisor qualifies their PID, parent, nonce and creation-time evidence, applies only their affinity mask and retains actual readback and joined process closure. A failed startup or stop preserves preceding work and ends that matrix without retry. Memory, output and lifetime guards remain explicit; a Node heap/RSS guard is not described as a private Windows source-containment qualification.

CPU affinity is applied **after Node startup**. Four permitted logical CPUs do not reproduce a hosted VM's physical cores, SMT topology, V8 worker-pool startup or CPU performance. Windows affinity masks are processor-group scoped; unsupported or ambiguous masks fail qualification. [Microsoft's API contract](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getprocessaffinitymask).

Instrumentation-off retains the common render wall-clock envelope and identical bounded PCM/continuity bookkeeping outside it. It starts no inspector, GC observer, phase wrappers, heap sampling or per-phase CPU counters. The RSS bound and pre-render event-loop yield are common outside the timer; no independent dispatch-latency statistic or OS scheduler trace is captured. Instrumentation-on adds phase intervals, heap deltas, GC temporal overlaps, thread/process CPU-counter scope and bounded V8 samples. Nested inclusive durations are not added as independent costs; reviewed accounting validates child containment/seriality, subtracts the union of direct children, preserves signed quantized CPU residuals and retains GC interval unions. These diagnostics do not prove a JIT, GC or OS-scheduler cause for a particular spike.

## Runtime identity

Codex obtained two public Windows x64 runtimes directly from Node's official distribution and checked each ZIP against its exact official SHA-256 manifest. Only `node.exe` and its licence are extracted for local tests. They are test tools, not a new product dependency or deployment.

| Runtime | Official ZIP SHA-256 | Extracted `node.exe` SHA-256 |
| --- | --- | --- |
| 22.23.4 | `cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20` | `dccc52de28d8df2ee22d2062424f8c563070d95d8ad70c54c4bf01d590dec14f` |
| 24.19.0 | `57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73` | `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237` |

Sources: [Node22 manifest](https://nodejs.org/dist/v22.23.4/SHASUMS256.txt), [Node24 manifest](https://nodejs.org/dist/v24.19.0/SHASUMS256.txt). Actual process/runtime hashes, affinity masks, CPU model, OS and available parallelism belong to each raw trial. Different runtime/hardware populations remain separate; version differences alone are not a causal explanation. The hosted workflow selects the same Node22 version explicitly, with a pinned official setup action and package-manager caching disabled. [Official setup action](https://github.com/actions/setup-node).

## Preserved failures and limits

The first 16-child Node22 pilot is exploratory: parent **8/1,344** misses versus candidate **11/1,344**, with exact PCM/lifecycle comparisons. It predates the validated span-union accounting, complete runtime pre/post checks and the explicit running-player-to-unsupported-NPC dismount fixture. Its frozen input/source identities and raw results remain unchanged; newer evidence cannot retrospectively qualify those older exclusive-phase estimates.

The initial full-wrapper attempt also failed before tests because command discovery returned multiple Node application paths. The corrected wrapper selects one executable, and the failed result/log remain preserved. Early source/renderer diagnostic invocation mistakes and noisy microbenchmark tail regressions remain retained as development evidence.

No endpoint is opened. Endpoint underflows, physical latency, audibility, private Bati-bank performance, long GTA sessions and genuine installed geometry remain unmeasured. Existing device-free ring/ownership/continuity regressions run, but a burst processing trace cannot be converted into a claim of zero WASAPI underflows. My source calibration, phase/history, 75 ms opt-in profile, default buffers and acoustic paths are unchanged. The [CodeWalker API question](WORLD_11_CODEWALKER_API_REQUEST.md) remains prepared text only.
