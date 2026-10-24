# Phase 2 executed validation

**Built and offline-tested; no live gameplay validation.** Results below are measured in the local .NET Framework test process, not inferred from a successful build.

## Build and tests

Base commit: e00878d. Built x64 core DLL, standalone RPH plugin DLL, analysis executable and test executable with the existing .NET Framework C# compiler, optimization enabled and warnings treated as errors. The adapter uses the authentic reviewed SDK. Exact output/source fingerprints and API/attribute audit are under evidence/phase2/. No runtime SDK stub, LSPDFR gameplay dependency or acoustic library was added.

Executed UTC: 2026-10-24T21:47:14.6253468Z. 48 offline assertions passed.

Coverage: monotonic 20 Hz deadlines, low-frequency polling/stalls, backward/invalid clocks, entity identity and model changes, missing fields, invalid entities, disappearance/reappearance, complete versus truncated census, source timeout, finite-difference acceleration, camera cuts, nullable serialization/string escaping, bounded queue backpressure, 10,000-record concurrent FIFO order, writer drain/overwrite errors, unknown schema, duplicate sequences and truncated captures. The recorded fixture is explicitly authored mock data.

The compiled attribute audit checks explicit RichAudio console-command names, entry/exit signatures, dependency references and the four allowed native call names. It also checks the adapter source for direct vehicle setters/unsafe memory operations/synchronous output writes. This is a static/metadata check, not proof of RPH execution.

Paced 32-source offline run: 40 frames, 0 missed deadlines, 0 queue drops; 2111.72 ms wall time including writer shutdown. The acquisition window was two seconds; this is not a GTA sampling measurement.

## Actual offline benchmarks

Machine: Ryzen 7 5800X, 16 logical processors, Windows 11; source acquisition is an authored managed mock. Each case was warmed up and ran for at least 500 ms. Per-frame percentiles include the selected mock/core/serialization work and timer overhead. CPU figures are total test-process CPU with OS accounting granularity.

| Sources | Workload | Frames | Mean us/frame | p50 us | p95 us | p99 us | Process CPU ms | Wall ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | mock acquisition + tracking | 340000 | 1.47 | 1.40 | 1.60 | 2.00 | 500.00 | 501.10 |
| 32 | mock acquisition + tracking | 20000 | 26.48 | 24.90 | 28.00 | 89.10 | 531.25 | 529.65 |
| 128 | mock acquisition + tracking | 5000 | 113.26 | 99.60 | 240.80 | 364.40 | 562.50 | 566.31 |
| 32 | mock acquisition + tracking + JSON serialization | 600 | 928.93 | 825.10 | 1511.50 | 1863.30 | 546.88 | 557.36 |

JSON serialization runs on the background writer in the plugin. The table does not include RPH getters, native calls, cooperative game scheduling or game frame-time cost. Its serialization case excludes actual disk writes; writer IO/draining is exercised separately in integration tests. Managed heap delta/private-byte observations are retained in the raw results and are not leak-free or resident-memory-cap proofs. These are short microbenchmarks, not a soak test.

## Game validation status

- Live player/NPC telemetry: NOT OBTAINED.
- Meaningful in-game tracking distance or urban/rural population coverage: UNTESTED.
- Frame-time impact, in-game CPU/memory, crashes, standalone RPH startup and OpenRPF coexistence: UNTESTED.
- Physical RPM and calibrated engine load: UNAVAILABLE. Ratio/gear getter reliability remains to be checked against gameplay.
- Exact supporting RPH runtime acquisition: BLOCKED by official HTTP 403/redirect errors in this session; no mirror or access-control workaround.
- Deployment: NOT AUTHORIZED; no game-root installation or overwrite.

## Input preservation and completion gate

Final checks confirm ten inspected archive hashes and six binary hashes still match the Phase 1 evidence. The original Phase 1 test result is preserved; the Phase 2 rerun is written separately to evidence/phase2/phase1-tests.json. Package fingerprints describe the actual reviewed RichAudio-only artifact.

P2-01 is ready as a compiled candidate for deployment review, but is not cleared to run immediately: the supporting runtime inventory, supported standalone Story Mode setup and explicit installation authorization are still required. Tests A–E then establish whether it works. A footer or passing offline test does not validate gameplay. Phase 3 remains deferred.
