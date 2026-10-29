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

**Classification:** the historical hosted transport failure remains unclassified. No production transport defect has been demonstrated, and no production transport, engine, SoundMap, recorder or host implementation was changed. The correction is the demonstrated harness observability defect, with strict failure retention rather than relaxed acceptance. Successful local runs are not grounds to call the historical failure flaky.

## Affected regressions and complete audio proof

After the diagnostic correction, the following passed:

- 54 PowerShell diagnostic checks, including each composite predicate, missing/malformed/oversized records, missing children, native/parent cleanup faults, sanitisation, output bounds and evidence surviving actual assertion/retention failure.
- 10 native record/schema roundtrip checks without constructing transport or an endpoint.
- 81 production listener-transport checks and seven listener-publisher evidence checks.
- The complete actual-component A–E chain, including the exact old startup negative control.

The retained fresh chain is `.local/ci73-audio-proof/result.json` with full sample analysis in `corrected/analysis.json`. It accepted 116 native listener packets, delivered 115 to the producer and generated 670 blocks. No geometry was published during the direct-only phase. Actual captured post-host Float32 stereo amplitudes were:

| Phase | Peak | RMS |
|---|---:|---:|
| No geometry, conditional direct | 0.02362404 | 0.01412081 |
| Qualified fixture reflections | 0.05649731 | 0.02580227 |
| Expired, including reflection release | 0.05454896 | 0.01452067 |
| Expired, settled direct | 0.02399320 | 0.01442825 |

Matched replay of the actual path controls reproduced **685,056 pre-host samples exactly**; removing only reflected paths changed PCM with contribution RMS **0.02207128** before host gain. The original source generation **4294967297** survived geometry introduction and expiry, with one initial context reset and zero affected history frames. All stale, future, wrong-session, reordered and interrupted listener cases stopped submissions and preserved their primary failures with zero secondary failures.

The actual owned recording finalised with **340,992 stereo frames / 7.104 seconds**, complete integrity, zero gaps and exact post-gain lineage. Normal shutdown exited zero and joined owned threads, with no primary/secondary errors or ring underflows. The reviewed **600 Hz / 0.44 / guarded +12 dB / 0.20** profile was preserved. Maximum pre-host peak was **0.28248653**, below the unchanged **0.5** ceiling; no limiter activation, nonfinite sample or trim rejection occurred.

Limitations remain explicit: two processing deadline misses and 206 late device-free consumer wakes, maximum **15.8917 ms**, were retained. Bounded catch-up maintained the same 48 kHz sample clock without underflow. This proves actual processing and capture through the real components with WASAPI unstarted; it does not prove physical audibility, GTA reflections or GTA-load timing. Exact final source, hosted result, retained artifact and any new candidate bindings are published in PR #73 and the final review; Candidate 09 is not resealed or reused for changed files.

The standing combined milestone remains **60%**. After successful live acoustic playback, the next development priority remains one real vehicle driving an original RichAudio engine source. Video references remain future acceptance guidance; no reference recording is reproduced, distributed or introduced as a game asset here.
