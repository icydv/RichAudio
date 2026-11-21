# Candidate-06 stopped before the stock ADDER control

I heard no sustained change in A's engine or physical horn after BATI self-assignment. I later reported an engine change while answering the ADDER question, then normal engine and horn after terminal BATI release. The journal shows that ADDER was never dispatched: its arm expired before F7. That engine-change report therefore cannot establish an ADDER signature. The private root was never requested. Deliberate engine/exhaust suppression remains unqualified.

| Observation | What I heard | What this run establishes |
| --- | --- | --- |
| Stock Bati baseline | Normal A engine and horn; B audible | A listening baseline was retained before switching. |
| BATI self-assignment | “No sustained change; engine and horn normal” | This one self-assignment did not produce a reported sustained disruption. Mixed level is not an A-only measure. |
| Stock ADDER | “I heard a change in engine yes” | No ADDER native dispatch occurred. This report cannot pass the stock-positive gate or identify an ADDER sound. |
| Intermediate BATI / private root / scheduled final BATI | Not reached | No private-selection or private-resource-chain result. |
| Terminal BATI release | “A engine and horn sound normal” | The same A survived and received the permitted BATI release. Camera motion invalidated its fixed idle context, so this is my listening report, not a qualified restoration result. F2 recorded the limitation. |
| B post-comparison | “F2 done; B normal; interval complete” | B remained profile-unassigned and running at both snapshots. The endpoint was early and geometry only approximate; no precise preservation claim. |

## Exact run and stop

I approved one run under scope `7a78d774c6d01b0d87dec9b630667d576cbbacf7097f7fac0d972d49a05f44b4`, source `0ef9a600c357f3e161e1497349acb488f8b3147f`, probe `b3af23ebaa529de155ce5af5e1aac70d6f74009401a0a3eb0ec6f4719790c3d5` and DLC `b5a421652ecfef3eda8302f20a6d1d127c46db044c87ea3d96c508e20ad88996`.

The analysis verified 98 prerequisite identities and 19 absent paths, used the sealed temporary installer and requested one Steam launch. SHVDNE completed NativeMemory initialization before probe startup, with no intervening initialization failure or reload. F5 restored the prior locked decorator state before creating A and B. Recording started at 23:05:12.345 UTC on 14 November 2026; F5 was logged at 23:05:21.5107577 UTC, giving 9.1657577 seconds of pre-roll.

A retained handle 2306 / token 406913610; B retained handle 2562 / token 891464325. A was the left white bike, B the right orange bike. B received exactly one permitted manual engine-start request and zero audio-profile assignments. The only audio setter dispatches were `BATI`, then terminal `BATI`, both on A.

ADDER armed at 23:12:25.5976695 UTC. Apply failed at 23:12:37.5783462 UTC, 11.9806767 seconds later. The allowed arm duration was ten seconds. The controller recorded `not armed or expired`, stopped progression and issued its one permitted BATI release at 23:12:37.5790610 UTC, active second 436.0683033, before the second-525 release deadline. There was no retry, ADDER assignment, private assignment, second launch, silent profile or extra native hook.

The operator checked the owning `IdleExperiment.Apply` source offline: the expired-arm test throws before phase consumption, assignment logging and `api.Assign`. The journal independently agrees: no ADDER dispatch intent or return exists. This was the intended expiry guard, not evidence that an ADDER setter call failed. No source or candidate change is justified by treating that absent call as a resource failure.

## Physical horn and operating context

I described the baseline, self-assignment and terminal-release physical horns as normal. Each has its own retained ten-second cue window. The getter was auxiliary: A read `35963676` before and after self-assignment, then `6ABC5E91` at the terminal-release snapshot. B read `6ABC5E91`. This getter change under BATI-only dispatches neither establishes ADDER/private selection nor overrides what I heard. Journal time locates each horn interval; it does not independently prove physical input-to-audio alignment.

Both B-stability endpoints were running/stationary, separated by 10.856 seconds. The separate B baseline endpoints were 16.397 seconds apart. A's engine readback was **off** during both B baseline snapshots, despite my initial impression that it had stayed running. It was off again at both B post snapshots, which matches that part of the comparison. B stayed on. Road traffic appears in the background, so the mixed track cannot quantify either bike alone.

The A baseline and self steady views were stable in the retained review frames. The terminal release view turns within its fixed +5/10-second idle window; the analysis rejected its restoration context rather than moving the cut. I used F2 at 23:14:29.1707878 UTC to record an uncertain/context-limited release outcome. No setter retry followed.

B's post endpoints were 14.176 seconds apart, 0.824 seconds short of the requested 15-second endpoint. The fixed +5/10-second recording is retained without a replacement take. The post comparison is limited by this endpoint timing and approximate viewpoint matching.

## Retained capture and its refusal

The raw MKV is 170,941,752 bytes and 642.300 seconds, SHA-256 `7120b368ff1cac89e162bff031fa26cf1f41ecd1ceeaefba8c511df7780d88bf`. It is within the size, pre-roll, active-window and recording-closure duration bounds. Eleven predetermined windows were retained: B stability, B baseline, A baseline idle/horn, self transition/steady/horn, terminal release transition/steady/horn and B post. No diagnostic cut was retimed.

All eleven live extractions passed the unchanged pinned extractor. After finalization, the unchanged finalized extractor **refused** the recording: `Finalized audio truncated before container end`. The last audio frame ends at 642.176333 seconds, about 123.667 ms before the 642.300-second container/video end. This is after all selected observation windows. The frozen tolerance was not changed, the failed receipt was retained and there was no substitute recording or admission attempt.

A separate diagnostic comparison reproduced all eleven selected WAV files byte-for-byte from finalized decoded PCM. Their audio timestamp prefixes and video timestamps through each used window end also matched exactly. That diagnostic reproduction does not overrule the finalized admission failure. Finalization changed 174 header bytes in each retained prefix comparison. Most growing-prefix video tails differ after the used intervals; the complete video prefixes are not claimed identical.

The raw recording, immutable prefixes, extraction receipts, failed finalized receipt, timestamp arrays, exact diagnostic reproductions, visual context, original listening feedback, journal, loader/framework/OBS logs, original OBS settings and temporary OBS serialization are retained under the execution directory. No acoustic classifier, A-only attenuation estimate or source-exclusive B level claim was produced.

## Closure and restoration

I confirmed ENDED, visible disappearance of both bikes, normal GTA exit and normal OBS exit. The journal records ENDED at 23:15:25.9961463 UTC, active second 604.4853886. Retirement was therefore 4.485 seconds after the 600-second active boundary. This is retained as a timing deviation; no diagnostic assignment occurred after the earlier stop. The controller's retirement path performed containment, and its ENDED result includes both native deletion/nonexistence results. A retained video frame at recording second 614 shows ENDED and the empty bike position. The earlier review frame named `video-review/retirement.png` is actually before deletion; `analysis/retirement-actual.png` is the correctly timed closure frame.

The validation ran the retained rollback only after GTA, PlayGTAV and OBS were closed, then ran a separate verifier. All 22 enumerated temporary paths were absent. Five original files, including Trainer and OBS settings/logs, matched their original hashes, creation/write times and attributes. Fifty-three original identities matched, including the game, base/granular/resident archives and exact root DLL/ASI inventory. The transaction is `restored-independently-verified`. Disk restoration, vehicle retirement and audible restoration remain separate results.

## Remaining native-suppression obstacle

This run stopped **before the native stock-selection positive control**. It therefore does not locate a failure inside private mounting, root lookup, graph traversal or bank resolution. The immediate missing evidence is a dispatched stock ADDER request with an attributable engine/exhaust signature, followed by normal BATI reset and the private-root comparison. None of that can be inferred from a level change, a native return, or the horn getter.

No silent graph was tested, and no selective engine/exhaust suppression or recovery authority was established. Candidate-06 and its approved source remain unchanged. This one-run approval is consumed; this report grants no further launch or audio assignment.

Evidence: `C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-06` (`RESULT.json`, `analysis/live-observations.json`, `analysis/capture-finalization.json`, `analysis/B-post-finalized.receipt.json`, `cleanup-verification.json`, `runtime-retention.json`, and `retained-runtime/`).
