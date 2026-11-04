# WORLD13 GPU addendum implementation review

My GPU addendum received independent review from separate Codex agents. The renderer review agent did not implement the GPU client correction or author its seven tests. This is agent review, not human maintainer approval, hardware qualification or gameplay acceptance.

## Source and cancellation contract

The only production change is in `src/acoustics/gpu/client.mjs`: closing during pending initialization now settles capability once, and an optional bounded observer retains actual launch, spawn, exit and ChildProcess close operands. Synchronous `close()` and the existing initialization/dispatch limits remain. The observer does not close or retry a process. A failed launch can have a ChildProcess close event without a started process; `processStarted`, exit and close remain separate. A timeout remains a frozen failed/unknown observation, and helper CPU remains null.

Static review covered initialization, backend closure, pending dispatch rejection and late protocol bytes. Existing acceleration controls cover mode-switch supersession, malformed/generation/late/unsupported fallback, occupied-slot CPU continuation and Auto policy. The new observer has no production callers. `VehicleAcousticPipeline.process()` and `StreamingRenderer.process()` remain synchronous; no PCM callback wait, added buffer, source reset, quality reduction or shader/synthesis rewrite is introduced. A worker shutdown acknowledgement still does not establish helper closure.

The independent reviewer rehashed the final client/test, four retained validation logs, genuine pre-fix failure and all 14 bounded lifecycle observations. The earlier combined population passes 19/19 on each Node runtime; the final frozen seven-test population passes 7/7 on each, with zero skips. These overlapping populations are reported separately. The fixtures construct original native processes and protocol bytes, not Direct3D or an audio endpoint. Review receipt SHA-256: `45f75e626fcff17a82b82b9070d07b2d234e6c510e6d48a3a8b1d21e118ddbb2`.

## Preserved hosted evidence

The original `dd1a2127af752c675fa551b0084e4e802f159127` candidate and run 41847073761 remain distinct from this correction. Both functional jobs pass; both processing jobs and the required aggregate fail. No measurement rerun repaired those failures.

Independent review recomputed the inherited/portable/WORLD11/WORLD12/cleanup counts, both actual hardware-GPU skip reasons, 83 expiry assertions over ten authored holds, bounded diagnostics and process termination. It checked 20 cleanup records, 20 publication records and four actual Node unlink controls per runtime. All eight public Node26 copies per runtime were deleted on their first native attempt; six followed joined execution and two were not launched. Nine intentional failed cleanup copies remain failed in the records. The budget-exhaustion holds do not become successful acceptance above two seconds. Functional/source receipt: `0e34c833fad53c1fc8723a0e908ce71d3a5bb045fc7c7ed7084917e8e3fdcc0b`.

All four 128-member snapshot manifests match canonical parent/head Git content or explicitly identified Windows checkout line endings. Their 117 production source members have no parent/head content change. Controller bindings and seven functional/four processing published records per runtime were rehashed. Independent numeric projection reparsed all four full published reports, all 288 trials, twelve overall duration distributions, raw deadline flags and every one of the 327 candidate blocks above 8 ms, including exact spans and source/observation context. Candidate totals remain 140 misses/274 above 8 ms on Node22 and 17/53 on Node24. Numeric projection receipt: `c8ae5e276a7c11795e8c56abd8901cfacdd753d7baba13860bea96c6a535a143`.

Original unredacted host-report hashes are publisher attestations because those bytes are absent from uploaded artifacts. They remain distinct from independently rehashed published bytes. The Node24 summary parser retains the two GPU skip counts without names; the actual suite log retains both names and reasons. Neither hosted population supplies supported hardware-GPU performance evidence.

## Assessment and publication limits

The reviewer independently rederived the four cold source-only matching records and all 24 fallback children: 6,144 actual geometry queries, twelve paired ratios, duration distributions and exact source/input/result bindings. Mixed wall tails and a zero-valued CPU baseline retain their stated limits. Cold matching intervals are not matching-only attribution of the warmed main source operation. No real helper/GPU cost or complete-engine benefit follows. Assessment receipt: `5a2e4cf22235f155cc9e7a581c6d041b95d1e0432587e8ae6fa906056df3902a`.

The staged documentation keeps current visibility masks separate from future reflection, material, reverberation and ordered FP64 grain experiments. Auto startup/qualification changes remain unimplemented. Complete transfer, remaining CPU work, helper closure/CPU, resource use, same-block latency and contention remain prerequisites for hardware promotion. The seven added controls are selected by the existing processing-test glob; 79 is the changed revision's expected focused count, not a relabelled result of the original 72-test hosted run.

The staged evidence was checked for absolute local paths, user-profile identifiers, LUIDs and secret patterns. Authored relative artifact names and digests remain. Prior sealed documentation/evidence and the workflow/harness are unchanged by this addendum. No game/private resource access, endpoint, recording, deployment, native suppression, developer contact or merge occurred. The following publication seal binds the exact reviewed Git bytes separately from this prose.
