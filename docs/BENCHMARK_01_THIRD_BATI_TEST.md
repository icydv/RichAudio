# BENCHMARK-01: My third supervised Bati attempt

28 October 2026. Tested PR #41 source `7af2030eb351ecce37502993b2826bc72a9128a8`, Enhanced 1.0.1158.16, RPH 1.132.1428.17748, existing DirectStorageFix 1.2 and Alexander Blade XInput loader 1.0.0.2. One launch, one Start, no retry or live code changes. Combined progress remains **60%**: stock setup is now verified, but the moving benchmark is incomplete.

## Actual outcome

**Invocation and indexed stock setup: PASS. Overall benchmark: FAIL, `stalled progression`.** I created one owned Bati and rider, verified mounting, accepted a stationary start and requested the existing AI checkpoint task. The bike did not move in the captured observations. The controller stopped automatically and verified both owned entities absent; the writer closed without failure.

| Stage | Genuine result |
|---|---|
| Runtime / plugin / READY | PASS; no entity creation on load |
| Listener / Arm | PASS; listener distance 0.00, immediate scope guard passed |
| Owned Bati creation | PASS; identity, model, persistence and native presence guards passed |
| Kit before request | 65535, `0x0000FFFF`, System.Int32, RETURNED |
| Requested selector | 0; one invocation attempted |
| Installer result | Returned normally, no exception; native System.Void / invocation System.Int32 |
| Kit after request | 7, `0x00000007`, System.Int32, RETURNED |
| Available kit count | 1, `0x00000001`, RETURNED |
| Kit identity semantics | UNKNOWN; index 7 is not compared with per-model count 1 |
| Functional stock verification | VERIFIED_BY_INDEXED_READBACK, three indexed categories |
| Engine 11 | Count 4, requested 3, observed 3, VERIFIED |
| Transmission 13 | Count 3, requested 2, observed 2, VERIFIED |
| Brakes 12 | Count 3, requested 2, observed 2, VERIFIED |
| Suspension 15 | Count 0, UNSUPPORTED; no fabricated selection |
| Turbo 18 | Requested enabled, observed 1; ENABLED_READBACK_SUPPORT_EFFECT_UNVERIFIED |
| Rider creation / mounting | PASS; mounted throughout all 88 copied readings |
| Driving | Task requested; no measured motion, terminated for stalled progression |
| Checkpoints | Stationary starting condition accepted; no MID1/MID2/MID3/FINISH arrival |
| Highest measured speed | 0 native units/s across this recording; not a mechanical maximum |
| FINISH / braking / stationary completion hold | NOT REACHED; no braking request |
| Cleanup | VERIFIED_ABSENT for both exact owned entities |
| Writer | Closed true, failed false; 88 copied readings |

The RPH invocation correction advanced beyond the previous exception and produced independently matching indexed modification readbacks. A discarded placeholder integer was not interpreted or persisted as success. This proves observed modification state, not a measured performance improvement or the full physical effect of turbo.

## Observation and timing limits

The private stream contains 88 readings spanning approximately **5.042089 seconds**, including initial settling observations. Every measured speed was zero, sampled positions showed no movement, engine-on and mounting remained true, and no collision was reported. The accepted analysis window spans approximately **4.507283 seconds**, with zero recorded analysis gaps, sampled path length and integrated speed distance. These are distinct windows; the full stream includes the initial UNDETERMINED continuity classification before subsequent OBSERVED_CONTIGUOUS readings.

The live task-state field remained **unavailable**. Issuing the driving task is not proof of successful GTA navigation or task acceptance. The immediate detector reported NONE_OBSERVED_IN_MONITORED_SCOPE; distant traffic and continuous route clearance remain unknown. The console remained open during this short attempt, and the distant bike was not independently visually tracked. No conclusion that the console caused the stall is established.

The retained controller uses a five-second stall timer initialized at Start, before settling; it is refreshed only by sufficient route progress. The failure is therefore the actual existing controller guard, not the 120-second run limit or evidence that a new five-second driving grace period elapsed after task issue. I did not alter timing, task strategy, requested speed, flags or route during the attempt. No full-throttle, reliable RPM, top-speed, acceleration, approach/pass/departure or braking success is claimed.

## Preflight, preservation and restoration

I verified PR #41's head and successful CI, rebuilt against the authentic pinned SDK, revalidated the original five-stop route and all 30 survey observations, and retained the saved listener. A fresh private candidate, approval, nonce, output and journal were used. The prior two consumed attempts were not reused. The 27-file deployment and executable-selection rename followed the existing reviewed procedure; no new geometry queries, traffic suppression, sound changes, frameworks or security changes occurred.

After terminal cleanup I requested plugin unload and normal Quit. The game displayed its Quitting screen, and process absence was independently checked before restoration; no force kill was used. Raw records, positions, entity identifiers, approval receipts and machine logs remain private. Independent restoration PASSED against the exact saved 32-root-file / 179-archive-record / ten-sample-hash baseline, including valid executable signatures and absence of all 27 temporary paths. Both prior attempts and the tested source fingerprints remained unchanged.

Only this report and sanitized scalar evidence are published. Runtime source and all driving/cleanup policies remain unchanged. SDK compilation passed for this candidate; the prior focused regression results belong to PR #41, and hosted report CI is independently checked at publication. No new test suite or source-audio experiment is claimed here.

## Next smallest action

My next action is a narrow **offline analysis of the driving-task and stall-clock timeline**, including what task-state evidence is missing. The stock setup blocker is resolved in this attempt; I should not return to mod-kit speculation. No new driving method, timer change, retry or live trial is implemented or proposed here. Movement and FINISH-triggered natural braking remain unverified.
