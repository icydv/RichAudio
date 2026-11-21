# NATIVE-SUPPRESSION-11 — Observe the complete setup and cleanup

I want the existing automatic sound comparison to run without using each GTA launch to discover another immediate-state assumption. The operator has corrected the existing runner and native adapter offline. This candidate has not been installed or launched. My candidate-10 approval remains consumed.

## What candidate-10 actually establishes

The retained execution-10 report, result, raw journal, recording and restoration receipt are unchanged under `C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-10`.

Background capture worked and coverage admission completed at recording second 16.934563. The bridge accepted Begin, the old adapter moved to its fixed exterior, and A/B were created. Seating intent followed placement by about 22ms; the A-start guard refused about 10ms later, before its setter. The stationary-dismount guard then refused before its exit task. Both guards combined several predicates without recording the failed operand. No profile assignment, explicit engine-start setter or horn event occurred. In-game retirement was unverified. GTA later closed normally; the final confirmation actor was not established. Independent disk restoration passed.

The scenery frames are consistent with an unsettled placement, but neither they nor the combined exceptions prove which predicate failed. The operator has not relabelled motion, seating, automatic engine start or private audio resources as the historical cause.

## Assumptions corrected

The old location path treated coordinate readback as world readiness. The old seating path treated a seat request as sufficient preparation for an immediate engine guard. Engine setup required an engine-off predicate even when a legitimate automatic start could satisfy the desired running state. A benign transition through motion/contact or occupancy readback could become the same terminal exception as an unsafe identity. Dismount reused operating guards that included requirements unnecessary for retiring an exact empty owned vehicle. Deletion and final view/position restoration needed later completion observations, not just successful native returns. A stop inside the controller could also bypass pre-audio retirement.

Candidate-11 keeps the same runner and adds explicit READY, PENDING, UNSAFE and TIMED_OUT results. A single callback observation records original player identity, exact A/B model/token/mission ownership, actual current occupancy, engines, speed, driveability, contact, positions, heading, Story state, frame bounds and command reservation. Unavailable operating fields are labelled unavailable. Logging uses that observation rather than querying a second, potentially different scene for the explanation.

The adapter now selects one suitable nearby layout around the current loaded exterior. It considers the current heading plus 0/90/180/270 degrees, with A/B offsets (-5,+8)/(+5,+8) metres. It retains the 3m ground-height allowance, 0.20m corner-slope allowance and radius-3 clearance checks. There is no distant fixed-site teleport, streaming-focus override, forced freeze, collision disabling or velocity forcing. The optional single normal exit from a stationary pre-existing vehicle does not adopt or alter that vehicle's engine or lifetime.

## Forward transition audit

All allowances below run inside one immutable 600-second active deadline. The active clock now starts before local location readiness, after durable Begin and saving the original view. Bounds never restart because a response is pending.

| Transition | Command and observed completion | Pending versus unsafe | Bound and failure action |
| --- | --- | --- | --- |
| Recording → Begin | Existing actual coverage, capture identity, foreground and simulation-progress admission; durable bridge acceptance | Existing incomplete coverage may wait under its original preroll; wrong/stale/stopped recording fails | Existing 50s admission/60s preroll, no recorder restart; no pair before Begin |
| Loaded local location | Optional one initial normal exit; original player on foot, finite stopped motion, exterior, loaded collision/contact, qualified nearby ground/clearance, two continuous ready seconds | Loading ground/contact and the reserved exit wait; changed player/current vehicle, interior or four blocked layouts stop | 12s; restore saved view, no pair |
| Models | One Bati request after site admission and existing decorator registration | HAS_MODEL_LOADED false waits; Story/player contradiction stops | 5s; release requested model and restore view |
| Pair creation | One local create per A/B, mission ownership and unique token, one ground-placement call each | Subsequent placement completion is observed; failed token or unknown creation outcome stops | Same callback creates at most one pair; never respawn or reacquire an unknown handle |
| Physical settling | Exact pair empty, speed finite and strictly below 0.15m/s, collision loaded, not in air, all wheels; two continuous ready seconds | Motion/contact may settle; token/model/owner/occupant contradiction stops | 8s; independent retirement if safe |
| Driver seating | At most one request per initial/baseline seating; exact original player currently in exact A as driver | Reserved seating and empty-driver readback lag wait; another vehicle/occupant stops | 5s each; observe any in-flight seat before cleanup exit |
| A engine | Already-running valid A succeeds with zero setter; otherwise one reserved setup start and later running readback | Post-seat motion/contact and issued start may wait; invalid identity/occupancy/dead/undriveable state stops | 5s initial and 5s baseline, at most two distinct starts; no maintenance after baseline |
| B engine | Already-running B needs no start; otherwise existing core guard admits one engine start on exact empty B | Issued start waits; A engine loss or B identity/occupant contradiction stops | 5s, at most one B start, never assign a B profile |
| Initial camera | Existing normal follow mode/relative heading/pitch request; actual gameplay/final camera and player pose become stable | Interpolation, valid operating-state settling and foreground return wait | 7s request stage and 7s pose stage; two continuous stable seconds; no replacement take |
| B stability | Both engines on, A exact driver, B empty; fixed pose and capture for original 10s | A selected window has strict operating/pose/capture requirements; contradiction stops immediately | Existing 10s, no restart |
| B-pre comparison | One A exit, one A-off request only if still running, one qualified local move behind B, normal follow view; observe each readback | Normal exit, engine-off, ground/standing placement and camera settling wait; ownership or conflicting occupant stops | Exit 6s; A-off 5s; local placement 5s; view 7s; pose 7s; original 15s B window |
| A baseline | Second distinct seating/start if needed, normal view, matched stable player/camera pose; original physical-horn and idle windows | Same observed seating/engine/pose rules; no user keyboard/camera duties | Seat/start 5s each, view/pose 7s each; original horn 10s and idle 15s |
| First assignment | Reviewed B/baseline evidence, durable acceptance and dispatch reservation; local Arm then Apply adjacent in one callback | Ordinary listening delay is unarmed; insufficient time or ambiguous/context/capture evidence stops | Existing 7s foreground resume; at least 100 active seconds remaining and full phase before second 450 |

The same physical/current-occupancy observations govern the B-post comparison and final retirement. The existing camera/player tolerances remain 0.10m and 0.5 degrees. Actual initial placement and operating values are retained in the journal; model loading is never used as world-readiness proof.

## Reverse transition audit

| Transition | Completion evidence and exactly-once rule | Refusal and reserve |
| --- | --- | --- |
| Stop progression | No further diagnostic dispatch; controller stop and runner terminal state | Same local callback; no launch/reload/recording retry |
| Permitted BATI release | If an assignment changed A, exact surviving A and safe release state; one reserved known-BATI call, then existing recording/listening gate | Safe state may be observed for at most 10s, ending by 490; unknown setter outcome never resends; no deletion masquerading as audible restoration |
| Leave A | Already-out is complete without a task; otherwise safe stationary contact and exact driver relationship, one normal exit and later full occupancy readback | 6s. Pending seat/exit/local move must resolve first. Engine-on and driveability are not cleanup prerequisites. Other occupants and unknown identity still refuse |
| Retire | Every created known lifetime revalidated empty, stationary, contacted and exact token-owned; one corrected caller-owned SDK delete argument per entity, then later DOES_ENTITY_EXIST disappearance | 8s. Missing before an issued delete, reused handle/token, unknown ownership or unknown creation inventory cannot become success. Unknown delete return may only be observed, never resent |
| Restore temporary view/control context | One saved-view restoration; later modes/relative heading/pitch readback. If an original clear on-foot position return was requested, its position readback must arrive | 7s. Occupied-space return is skipped and recorded unresolved. Unknown restoration outcome is never resent. Per-frame clamps cease automatically on terminal state. Unsafe terminal closure records unverified restoration honestly |
| Normal exit and disk restoration | Existing exact-process normal WM_CLOSE/dialog path, recorder finalization, retained original evidence, transactional rollback and separate verification | No forced termination. If reliable final-dialog control fails, report an unavoidable human quit-confirmation exception. Original bytes, metadata, inventory and temporary absence independently checked |

The runner initiates ordinary release at active second 450, ends terminal listening wait by 490 and begins retirement by 540. The absolute 600-second deadline remains unchanged. Cleanup stages do not reset themselves at the retirement reserve. A failure before audio admission still reaches retirement; a pending or failed engine start is not required to succeed first. Unsafe retirement remains unresolved rather than broadening deletion.

## Compiled tests and evidence limits

The validation ran 29 authored delayed-response cases with 307 assertions through the actual compiled candidate-11 runner, controller and native adapter, referencing the exact retained ScriptHookVDotNet3 DLL. Native operations reach a test backend only after the retained SDK constructs actual InputArgument objects. The backend reads real arguments, writes the actual float ground pointer and caller-owned integer delete pointer, and supplies delayed state on later callbacks.

The test executable is hosted by PowerShell 7 outside GTA. A disposable, explicitly labelled string-pinning stand-in supplies the SDK's string-lifetime dependency; it supplies no game observations, native dispatcher, scanner or controller logic. The real mixed GTA core and decorator initialization remain unexecuted. No machine strong-name policy was changed. Neither stand-in nor backend is compiled into the live candidate; reflection-only inspection checks their absence and verifies the production default forwards to the retained SDK.

Cases cover delayed world ground/contact, models, spawn physics and post-seat physics; delayed seating and driver readbacks; automatic engine-on; delayed and absent engine starts; valid 4.8s seating versus late/never completion; camera interpolation; B stability failure; unknown engine/seat/create/delete outcomes; sticky token loss; conflicting occupants; stop at every 22 intermediate setup stages and inside already-issued seat/exit/move operations; already-out cleanup; delayed exit and delete; safe dead/undriveable retirement; unsafe ownership retirement; delayed restoration; absolute expiry; complete approved assignment order; and ambiguous stock ADDER preventing private progression.

A separate preserved old-runner regression reproduces both old guard errors for an authored post-seat-motion response. That demonstrates an allowed failure pattern in the old compiled runner, not the historical failed predicate and not native-adapter qualification. The corrected real-adapter case observes the same class of settling before its one engine request. Failed draft test outputs remain retained; they are not counted as passing qualification.

The successful recorder/coverage/bridge implementation is unchanged apart from candidate/execution labels. An exact normalization check records this, and the historical candidate-10 background, capture, bridge and readiness receipts remain pinned. No OBS session was added for this task. The changed installation labels are tested against disposable files through the actual installer, rollback, preflight and independent verifier, with only fixed roots redirected; the real installation remains untouched.

Reflection-only final DLL inspection checks the compiled phase order, one A-only native setter location, real SDK conversions/default dispatch, adjacent Arm/Apply, four outcomes, reservations, nearby-site path, disabled default and absence of test code.

These are authored response tests and source/compiled-path checks. They do not prove motorcycle contact-native behavior, suitability of the actual loaded scene, GTA task completion, camera restoration timing, audibility, stock ADDER selection, private-resource resolution or deliberate engine/exhaust suppression. The next approved run can still fail safely and must preserve its exact failure evidence.

## Native suppression remains the objective

The unchanged sequence is BATI baseline → BATI self-control → stock ADDER → BATI return → private `ra_ns06_adder_select` → final BATI return. My ordinary listening replies remain evidence gates. Stock ADDER must establish an attributable engine/exhaust signature before the private request. Physical horn observations are recorded separately from the default-horn getter. A successful native call, stock-like sound or mixed loudness alone proves neither private selection nor suppression. All assignments remain A-only; B is profile-unassigned.

This work clears immediate-state assumptions on the way to that comparison. It does not solve the still-unverified audio-object selection boundary or authorize a silent profile, new resource variant or additional experiment. Candidate-11 is disabled and requires one fresh complete-run approval under its sealed scope.
