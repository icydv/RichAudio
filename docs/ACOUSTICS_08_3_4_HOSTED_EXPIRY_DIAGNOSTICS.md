# Hosted cold-AppDomain expiry diagnosis

This correction continues PR #73 from `d6390f1c125264d4fa6f0c1e9b53eddeb1f15046`. It preserves the working listener/source initialisation, explicit conditional direct processing, observed reflections, source history, owned recording and normal shutdown. No deployment, GTA/RPH launch, audio endpoint, approval or live retry is part of this work. Candidate 09 remains unchanged historical reviewed material; its seal does not cover subsequent source changes.

## What the historical failure establishes

[Run 40958223045](https://github.com/icydv/RichAudio/actions/runs/40958223045), attempt 1, failed at `tools/Test-UnsentExpiry.ps1:33` with `Case failed; no retry: domain-1`. The job log remains available, but the run's artifact endpoint returned `total_count: 0`. No failed sender/receiver record was retained or printed. Existing local expiry records are separate executions and cannot replace the missing hosted records.

The **exact historical failed predicate cannot be recovered**. At least one of these six conditions was true:

1. Receiver connections differed from one.
2. Sender connection attempts differed from one.
3. Receiver accepted no frame.
4. Receiver rejected at least one frame.
5. Receiver terminal outcome differed from `deliberate-stop`.
6. Sender terminal outcome differed from `deliberate-stop`.

Reaching that assertion establishes that the original readiness/lifetime/child-exit checks and both JSON reads completed. It does not identify which transport condition failed. The earlier description of this as an unrelated failure was unsupported.

The test compiles **current production transport sources**, not a fixed historical test implementation. Relative to PR #73's base, `ListenerProtocol.cs` and `StatePipe.cs` changed in commit `14f4625`, including startup stale-discard handling, acknowledgements, startup deadlines and lifetime synchronisation. Those files did not change in the immediate `d6390f1` patch, but an unchanged test script does not establish independence from the PR. The historical CI merge and candidate head had the same source tree.

## Bounded reproduction matrix

Before running reproductions, the operator declared this fixed budget:

| Row | Source and execution | Cases |
|---|---|---|
| A | Exact archived `d6390f1`, original assertions, one execution | Original nine cases: none-1/2/3, domain-1/2/3, before, after, late |
| B | Equivalent production transport with additive failure diagnostics, one execution | Same nine cases |
| C, conditional | Only if A/B require an isolated comparison | At most one cold-AppDomain `domain-1` and one direct-process `none-1` |

There are no retries-to-pass. Each execution has the existing finite child lifetimes. Production freshness, original observation timestamps, acceptance predicates, connection limits and transport deadlines remain unchanged. Serializer warm-up is not introduced.

Row A passed all nine original assertions. Its cold `domain-1` accepted 16 frames, rejected zero, attempted one connection and stopped deliberately. The first unsent sequence 0 expired at 296.5182 ms after 271.6846 ms of cold encoding, then the existing latest-value publisher continued on the same connection. Domain-2/3 had the same intended expiry path. This observation does not recover or explain the historical hosted failure.

## Diagnostic correction

The demonstrated harness defect is loss of the useful evidence before a composite assertion throws. The corrected fixture and script preserve bounded, sanitised failure records before throwing, including missing children or missing/malformed JSON. The original six acceptance predicates remain enforced individually. Child start/exit/wait outcomes, connection and frame counts, startup discards, unsent expiry, original age measurements, actual terminal stage/code/outcome, harness failures and cleanup failures are separate fields.

`FirstWireStage` means `transmitted` or `received` only when the corresponding actual count is positive. A timing object for an unsent encode candidate is labelled `FirstCandidateFrame`, not presented as wire evidence. First accepted evidence remains separate from the first wire observation and the final terminal stage. Native lifecycle measurements separate AppDomain activation/unload from first publication, cold encoding, production and shutdown. Diagnostic collections and serializers are created after transport disposal; no codec warm-up precedes the cold case.

Raw child JSON reads are capped at **64 KiB**, each sanitised output at **16 KiB**, and case selection at the original nine distinct names. The whitelist excludes personal paths, pipe/session identifiers, absolute observation ticks, raw payloads, messages, stack traces, capabilities and approvals. Failed predicates are printed before assertion failure. Console evidence is emitted before retention IO; failed writes produce a second bounded record with secondary retention errors while preserving the original case failure. Each destination is attempted once. A surviving file may contain the primary pre-retention snapshot; the final console record discloses any later retention failure.

The existing workflow always retains only `.local/expiry-ci-evidence/*.json` for **seven days**. That directory is fresh and contains only explicit projections from the actual hosted cases. Whole private directories, executables, game assets, raw records, recordings and approval material are excluded. No unchanged CI run is retried.

Row B passed all nine assertions once. Its cold `domain-1` used one attempt and accepted 16 frames with zero rejections/discards. First unsent expiry was **324.8258 ms** after **299.5761 ms** encoding; the first wire and first accepted receiver decision ages were both **58.5135 ms**. Both child exits were zero, both transport terminals were `deliberate-stop`, and cleanup errors were zero. The `late` control still accepted zero frames and failed at the existing receiver header deadline. Row C was not needed or run.

**Classification:** the historical hosted transport failure remains unclassified. No production transport defect has been demonstrated. The expiry correction fixes the demonstrated harness observability defect, with strict failure retention rather than relaxed acceptance. Successful local runs are not grounds to call the historical failure flaky.

## Stop-boundary failure exposed by the first changed-source CI

[Run 40968656231](https://github.com/icydv/RichAudio/actions/runs/40968656231), attempt 1 at `d1cfd4ac07fb46b90efd7c88fcebd05932c7bf89`, failed **before reaching the expiry test**. The actual A–E checker failed `no output submitted after strict listener terminal mute`. No mode or numeric boundary values were printed, and the expiry artifact directory was correctly empty because expiry had not run. The exact hosted mode/interleaving cannot be recovered. This failure is preserved; the run was not retried. The focused expiry checks now run once, before later audio checks, so another suite cannot prevent their requested evidence from being collected.

Static inspection identified a concrete fixture admission gap and a misleading completion claim. `ListenerEnded` requests output Stop, records a boundary, then reports the primary error before setting the host stop flag. The device-free consumer checked only the host flag. Two controlled probes were declared before execution and each ran once against privately archived exact `d1cfd4a` sources, using real methods, an unstarted output and a prefilled ring, with no source hooks or audio endpoint:

- **R1:** holding the existing failure lock naturally paused the terminal callback after output Stop but before the host flag. The fixture then admitted one extra **512-frame / 4096-byte muted-zero** fill, stamped **10.3703 ms after** the request boundary. The original strict comparison failed. This demonstrates the extra fixture admission, not nonzero audio leakage or the exact historical CI interleaving.
- **R2:** blocking the real file write held an already-filled buffer in flight. Admission was **2.3391 ms before** the request; capture completion was **10.8640 ms after** it. The old comparison passed despite **1024 nonzero samples / 512 frames** completing afterward. Thus its pre-fill timestamp never proved completed output quiescence.

The narrow correction makes the device-free fixture observe the existing authoritative output stop flag at callback admission. The native output gains only an internal read-only `StopRequested` getter; production `Stop`, `Fill`, renderer, gain, timing limits and transport behavior are unchanged. The fixture captures candidate admission time before reading that flag and publishes admission only for accepted work. It separately records actual completion time and frame lineage after the existing ring/tap/write work. No new lock, buffer discard, invented silence or atomic device guarantee was introduced.

The checker retains strict refusal of **new admissions after the Stop-request boundary**, validates the same 512-frame buffer lineage and permits at most one previously admitted buffer to complete after the snapshot. It prints bounded scalar mode/order evidence before asserting. It explicitly distinguishes a Stop request from quiescence; already-admitted completion is disclosed rather than hidden. Permanent R1 now captures **zero** extra frames while the host flag is still false. Permanent R2 retains the exact original nonzero buffer and owned-tap lineage while reporting its post-request completion. Both permanent native tests and four Node contract/privacy cases passed.

## Affected regressions and complete audio proof

After the diagnostic correction, the following passed:

- 54 PowerShell diagnostic checks, including each composite predicate, missing/malformed/oversized records, missing children, native/parent cleanup faults, sanitisation, output bounds and evidence surviving actual assertion/retention failure.
- 10 native record/schema roundtrip checks without constructing transport or an endpoint.
- 81 production listener-transport checks and seven listener-publisher evidence checks.
- 1702 host/ring/framing assertions, eight existing actual shutdown fixtures and the two permanent admission/completion probes after the fixture correction.
- The complete actual-component A–E chain, including the exact old startup negative control.

The final retained fresh chain is `.local/ci73-audio-proof-after-boundary/result.json` with full sample analysis in `corrected/analysis.json`. It accepted 116 native listener packets, delivered 115 to the producer and generated 669 blocks. No geometry was published during the direct-only phase. Actual captured post-host Float32 stereo amplitudes were:

| Phase | Peak | RMS |
|---|---:|---:|
| No geometry, conditional direct | 0.02362397 | 0.01412081 |
| Qualified fixture reflections | 0.05649862 | 0.02580181 |
| Expired, including reflection release | 0.05455000 | 0.01452076 |
| Expired, settled direct | 0.02399302 | 0.01442832 |

Matched replay of the actual path controls reproduced **684,032 pre-host samples exactly**; removing only reflected paths changed PCM with contribution RMS **0.02208754** before host gain. The original source generation **4294967297** survived geometry introduction and expiry, with one initial context reset and zero affected history frames. All stale, future, wrong-session, reordered and interrupted listener cases refused new admissions after Stop and preserved their primary failures with zero secondary failures. In this ordinary full-chain run, all five last completions preceded their request boundaries; the deterministic R2 regression separately retains and verifies already-admitted completion.

The actual owned recording finalised with **340,480 stereo frames / 7.093 seconds**, complete integrity, zero gaps and exact post-gain lineage. Normal shutdown exited zero and joined owned threads, with no primary/secondary errors or ring underflows. The reviewed **600 Hz / 0.44 / guarded +12 dB / 0.20** profile was preserved. Maximum pre-host peak was **0.28249308**, below the unchanged **0.5** ceiling; no limiter activation, nonfinite sample or trim rejection occurred.

Limitations remain explicit: two processing deadline misses and 207 late device-free consumer wakes, maximum **16.0588 ms**, were retained. Bounded catch-up maintained the same 48 kHz sample clock without underflow. This proves actual processing and capture through the real components with WASAPI unstarted; it does not prove physical audibility, GTA reflections or GTA-load timing. Exact final source, hosted result, retained artifact and any new candidate bindings are published in PR #73 and the final review; Candidate 09 is not resealed or reused for changed files. Its package/seal remain unchanged, but the externally bound installed `chrome.exe` has drifted, and its validator correctly refuses the old binding.

The standing combined milestone remains **60%**. After successful live acoustic playback, the next development priority remains one real vehicle driving an original RichAudio engine source. Video references remain future acceptance guidance; no reference recording is reproduced, distributed or introduced as a game asset here.
