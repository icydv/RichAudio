# STREET-01: retained cold NPC history failure

I have not resolved the hosted Node 24 cold NPC failure. Codex preserved the original failure and added bounded diagnostics to the same exact comparison; no synthesis formula, interval, tolerance, historical assertion or cold case was changed.

The failed job belongs to head `58491c7`, Offline run `42031035453`, functional Node 24 job `127257242432`. Its original log and artifact are retained under `.local/street01/ci-58491c7-retention`. `Test-Synthesis12.mjs` compares the exact five-file PR91 source closure at `3d0642df9588aa46721efd85712fd2ba07446345` with the current source. The affected source/grain/preparation files were already unchanged from the pre-STREET base; this comparison does not establish a new STREET synthesis regression.

## First observable divergence

The failing case is `NPC, long loop, cold`. The first one-frame render passed the exact engine/exhaust buffer comparison, including the untouched suffix of each 512-frame buffer. The first history assertion then failed at block 0. Execution stopped there, so this result does not qualify the remaining output sequence.

The retained difference is the engine idle voice's first feature tuple. The parent expected RMS is `0.027834119477988452`; current RMS is `0.027833171913117096`. The corresponding crest/detail values differ too. Both dumps contain identical 8,184-sample Float32 inputs and the same interval: start `480`, end `6763.1826829913325`, length `6283.1826829913325`. The unchanged integer loop visits 6,284 samples, indices 480 through 6763. Independent recomputation from either retained sample array gives the current tuple exactly. The endpoint is not close to an integer, and the retained operands do not support the proposed one-extra-sample explanation.

The parent expected idle tuple also equals that parent's acceleration tuple despite different idle/acceleration intervals and samples. That is a discriminating observation, not proof of aliasing, a compiler defect, fixture nondeterminism or a particular root cause. The original log did not capture constructor state, so it cannot establish when that tuple first became inconsistent. No source lifetime replacement, phase reset or selection change has been demonstrated as the cause.

## Fixed diagnostic controls

Codex ran one fixed matrix of eight fresh processes: Node 22.23.4 and Node 24.19.0, each with historical constructor order/shared bank, separate input banks, current-first constructor order, and interpreter mode. The original four preceding player cases warm each process. The observer records exact source/voice own state, typed-array byte hashes, object alias paths, source frames, phase/grain selection and clocks, input immutability, all original output blocks and independent feature recomputation. It does not call advancing sample/search methods.

All eight controls found no divergence. The matrix had no automatic retries and retained its source/runtime pins at `.local/street01/cold-npc-controls-5c8a9d86cdcd4b0ba5be12873e6ab087/summary.json`. These controlled passes do not explain or replace the hosted failure, and the receipt explicitly leaves `hostedFailureResolved` false. Earlier full-file local passes remain separate evidence.

## Failure capture in the original gate

The original cold NPC comparison now captures input hashes and immediate constructor state, then retains the latest state before rendering. If an existing assertion throws, the observer writes a new original-only `first-divergence.json` under `.local/street01/cold-npc-failure-*` and rethrows the same error. The payload is bounded at 4 MiB and includes the original assertion stage/block, role output hashes, parent/current source bindings, immutable-input comparison, constructor/pre-render/failure states and feature recomputation. It does not write installed assets or PCM files.

`Test-ColdNpcFailureRetention01.mjs` deliberately corrupts one constructor feature in a private copy of the original fixture. On both supported Node versions, the original history assertion still fails, first-frame PCM still matches, and the diagnostic preserves the constructor divergence and original clocks. The observer's first test exposed inherited Node test-runner context and then a verbose Node 22 reporter exceeding the fixture's capture bound; those harness failures were retained. Explicit child context and a compact reporter fixed the fixture without changing the original comparison.

The instrumented original 26-case file passed locally once on each supported runtime. I still require the final hosted gate and, if it fails again, the newly captured first-divergence evidence. A later passing run alone will not establish why this retained failure occurred.
