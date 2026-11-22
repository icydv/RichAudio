# BENCHMARK-01: My supervised NPC driving activation test

28 October 2026. I tested PR #43 at `61743bceef6d31a4c2825eaaeb39c4b03c933fc6` in Enhanced 1.0.1158.16 with RPH 1.132.1428.17748, DirectStorageFix 1.2 and the existing Alexander Blade XInput loader 1.0.0.2. I used one fresh launch, one Start, one owned Bati and rider, and no retry or live implementation changes. Combined ACOUSTICS-05 + BENCHMARK-01 progress remains **60%**: movement is newly observed, but the route, FINISH and natural braking are incomplete.

## Result

**Activation and measured movement: PASS. Overall benchmark: FAIL, `stalled progression`.** My bike moved before stopping short of MID1. The controller then allowed its existing five-second progression watchdog to terminate the attempt. This is no longer the previous all-zero-speed result, but it is not a completed controlled approach/pass/departure benchmark.

| Check | Observed result |
|---|---|
| Runtime / plugin / READY | PASS; no entities created on load |
| Listener / separate Arm | PASS; saved listener distance 0.00, scoped Start guard passed |
| Mod-kit | Before 65535, after 7, available count 1; indexed verification passed, global index semantics remain UNKNOWN |
| Engine / transmission / brakes | Counts 4 / 3 / 3; requested and observed indices 3 / 2 / 2 |
| Suspension / turbo | Suspension unsupported; turbo enabled readback, physical effect unverified |
| Rider | Created and mounted; mounted true in all 181 raw observations |
| Gameplay admission | PASS; I closed F4 immediately after Start; all 120 accepted observations report console closed and game unpaused |
| Driving invocation | Attempted and returned normally; no invocation exception |
| Generic task status | First accepted pre-invocation observation NoTask, subsequent 119 InProgress; not specific task identity |
| Motion | 30 raw observations above 0.25 native units/s; position-derived path 73.537084 native units |
| Highest reported speed | 58.177933 native units/s; mechanical maximum and full throttle NOT PROVEN |
| Route progress | Maximum/final 73.408274 native units; START accepted, no MID1/MID2/MID3/FINISH arrival |
| FINISH / natural braking | NOT REACHED / NOT TESTED |
| Termination | `stalled progression`; 5.014012 seconds after last qualifying progress |
| Collision / interference | No collision flag; NONE_OBSERVED_IN_MONITORED_SCOPE throughout; distant clearance UNKNOWN |
| Cleanup / writer | Both exact owned entities VERIFIED_ABSENT; writer closed true, failed false; drawing detached |

## Clocks and actual observations

The following times use the existing copied monotonic observation epoch, in seconds. Equal request/return timestamps do not measure native call duration.

| Milestone | Time |
|---|---:|
| Start accepted | 32.7367423 |
| First eligible controller observation / first driving request / normal return | 36.3290993 |
| First nonzero movement | 36.3851870 |
| Reported peak speed | 37.2306424 |
| Last qualifying progress / last speed above 0.25 | 38.0188158 |
| Terminal observation | 43.0328279 |

The 181 raw readings span 10.296086 seconds, including setup/readiness/settling. There are 54 console-open setup readings and 127 console-closed readings; all report unpaused. Game time spans 64,423–71,522 ms, including repeated values before admission. The 120 accepted observations span 6.703729 seconds, with game-time increments of 56–57 ms and total advancement 6,704 ms. Maximum raw observation gap is 0.197120 seconds; accepted analysis reports zero gaps.

The bike's sampled path is 73.537084 native units and trapezoidally integrated reported speed gives 74.665394. Listener distance decreases from 505.720555 to 433.033806 native units. These independent calculations corroborate movement; I did not visually follow the distant bike. Final sampled position repeats for 90 accepted observations. The 89 observations strictly after the last moving observation retain engine-on, mounted rider, InProgress and advancing game time while speed is zero. Maximum route deviation is 0.390546 native units, below the unchanged 3-unit guard.

The reported rise to 58.177933 occurs in only 0.901543 seconds after the accepted stationary observation; maximum finite-difference acceleration is 71.181991 native units/s². I retain those actual readings without presenting them as normal Bati acceleration or tuning efficacy. Position/speed distance agreement supports motion, but does not certify physical realism, distant simulation fidelity or top-speed measurement. The RPM validator remains unchanged and rejects the out-of-contract raw RPM values.

## Interpretation and next smallest action

This is **Case F followed by Case E**: measured movement began, then stopped while generic task status remained InProgress and game time advanced. Closed-console admission and the corrected watchdog permit this new result; one changed-code/procedure trial does not isolate which change caused it. InProgress does not prove the long-range task remained accepted or that AI physics remained active. No task error, rider loss, collision, detected local interference or route-deviation guard explains the terminal condition. Navigation, distant simulation and other task/vehicle state remain hypotheses.

My single next action is an **offline review of the recorded movement-to-stop timeline against the existing first destination and task lifecycle**, including the unusually rapid reported acceleration. That review should decide what missing observation warrants a separately approved diagnostic; it must not assume distance-dependent freezing or immediately switch driving strategy. No extra launch, retry, task reissue or code correction is part of this report.

## Safety, validation and evidence boundaries

I verified PR #43's exact head and successful hosted source CI, built against the authentic pinned SDK, checked the original five-stop route and 30 survey observations, and used fresh binary/route-bound approval, nonce, journal and empty private output. The deployed set remained exactly 27 temporary files. No survey, traffic suppression, audio changes, new dependency, forced motion, teleport or security change occurred.

After terminal cleanup and writer finalization I requested plugin unload, exited GTA normally and independently checked game/RPH process absence before restoration. The existing restoration procedure preserved temporary files and generated logs privately, reversed the executable-selection rename, and compared the exact saved root/archive manifests rather than counts alone. **Restoration PASS:** 32 root files, 179 archive metadata records, ten sampled archive hashes, valid original executable signatures and all 27 temporary paths absent. Raw positions, entity identities, approval receipts and logs remain private. All 96 protected evidence files, 12 previous runtime files and four finalized files from this attempt retain their recorded hashes.

Only documentation and sanitized scalar evidence change. Runtime source, default settings, task native/arguments, five-second watchdog, 120-second deadline, route, upgrades, cleanup and existing research are preserved. The tested source's preflight validation includes 28 activation assertions, 132 mod-kit assertions, 155 Bati assertions, 88 five-stop assertions and their registered independent checks; full offline validation and pinned-SDK build passed before launch. The full registered offline suite passed again after this live attempt, including those focused tests and 715 Bati / 191 mod-kit / 44 five-stop independent checks. Eight independent scalar comparisons against the private record passed. Publication screening of the complete index returned zero findings, and Git integrity passed; reviewed historical identity exceptions remain separate. Exact-head hosted report CI is recorded in the draft PR after completion. No new runtime test or synthetic suite is invented for a documentation-only result.

No full-route clearance, certified maximum speed, full throttle, reliable RPM, FINISH stopping or acoustic result is established. The benchmark remains incomplete despite the useful activation advance.
