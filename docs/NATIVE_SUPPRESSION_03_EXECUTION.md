# Native suppression: the pair spawned, but empty B stopped idling

## Audio result

The Bati pair spawned. I heard normal native sound while seated on B, but its engine stopped when I got off. A second normal entry and quick exit gave the same result. The required empty-and-idling B condition was unavailable, so the run stopped progression before any profile assignment.

| Observation | Result |
| --- | --- |
| Disposable A/B pair | Created and independently tagged |
| Preserved private variant | Not tested |
| Marker B1 activation | Not tested |
| Silent C suppression | Not admitted or tested |
| Marker B2 return | Not tested |
| Normal native sound returning on the same A | Not tested; A never received an override |
| Unaffected B during A assignments | Not tested; there were no assignments |

This is an operating-setup failure, followed by a separate retirement fault. It is not evidence against private resource lookup, branch activation, profile persistence or silent PCM. No frequency-band measurement or suppression conclusion was produced.

## Approved run and registration

I approved one run of candidate-03 under scope `f5ec2445b92397b7f95216173f714672cd5e14de8873578e61614fb28d414464`, including the guarded SHVDNE decorator-lock operation. The analysis verified the clean worktree at `d3479068853bfb75e2fd58c546b506f05324d883`, its own build receipt, DLL `bd6fa535657d20bddbb40f8d8aa222fe00eb13613d3d727a03bafb2c0d4c91e8`, framework identities and installation files. Earlier candidate binaries and approvals were not substituted.

The current launch logged successful `NativeMemory` initialization at 01:51:09 UTC, followed by probe startup without an intervening failure or reload. The operator checked this before F5. At 01:52:23.2321498, the probe recorded `initialInt=false finalInt=True priorLocked=True lockRestored=True`. The single private integer tag was registered, and the original locked state was read back before model request and creation. This is positive runtime evidence for the prepared registration path; initialization logs alone do not independently prove every binding's semantics. Restoring the lock does not unregister the session-wide name or qualify concurrent registry users.

One F5 request created A with handle 1794/token 971077682 and B with handle 2050/token 2080214356. At the mounted stock-B snapshot, B's engine-running readback was true and speed was 0.0109274024 m/s. At the later on-foot observation, the same B handle/token had engine-running false and speed zero. The journal's snapshots do not themselves contain seat occupancy; video and my reports provide that context.

| UTC, 14 November 2026 | Recorded event |
| --- | --- |
| 01:52:01.640 | OBS recording-start notification |
| 01:52:23.1838069 | Single spawn request; ten-minute active bound starts |
| 01:52:23.2321498 | Integer registration and original lock restoration verified |
| 01:52:23.2388954 | Both tagged vehicles recorded |
| 01:53:02.6465977 | Mounted stock-B baseline snapshot, engine running |
| 01:55:28.1763985 | Both engines off; original handles/tokens retained |
| 01:55:31.6687048 | Manual F9 STOP |
| 01:56:15.4472234 | Manual cleanup received |
| 01:56:15.4491911 | Retirement argument-conversion exception |
| 01:56:49.956 | Recording stopped and finalized after normal GTA exit |

There was one Story Mode launch, one pair, zero arm events and zero audio-profile assignments. Replacement playback remained disabled. Silent C was never authorized or requested. The two normal dismount observations occurred during setup, before any phase request; there was no assignment retry, resource substitution, script reload, second launch or forced termination. New progression stopped when B's required operating state could not be established.

## Retirement and installation restoration

My first F10 input produced no journal event and both bikes remained visible. The run then sent the permitted cleanup control once. The probe logged manual cleanup but threw `InvalidCastException: Unable to cast object of type 'System.Int32' to native value`. Both bikes remained visible under the fault STOP overlay. The operator did not retry deletion or patch the running script. I exited GTA normally through its menu.

The exact retained SHVDNE API explains this fault: `OutputArgument(object)` boxes the integer handle, while `Function.ObjectToNative` accepts only null, strings and `INativeValue` implementations. The exception occurs while constructing the argument, before the deletion native is called. This is a managed argument-conversion defect, not evidence that GTA rejected deletion or that either vehicle's identity was reused. The old test double accepted arbitrary boxed objects and missed the defect.

The run stopped and closed OBS normally, preserved the new logs and recording, restored the enumerated files/settings and retained the rollback ledger. Independent verification passed at 01:59:58 UTC: 125 file identities, the exact 49-file root DLL/ASI inventory, base/granular archives, four original settings/log files and Trainer bytes/timestamps/attributes matched. All eleven temporary installation destinations, the generated journal, created directories and Live03 scene backup are absent. GTA, PlayGTAV, RPH and OBS are closed. Candidates 01, 02 and 03 remain unchanged; candidate-03 remains clean at its approved commit. The unrelated protected World13 menu file also matches its separately supplied contextual baseline.

The cleanup receipt is `cleanup-verification.json`, SHA-256 `47293b2eb05d9e75909bfb3eea74778665a6e99ee86eae931ad3457718f97901`. Disk restoration passed; in-game retirement failed. Session exit is containment and is not audible restoration on a surviving A. No audio restoration call was necessary because no override had been assigned.

## Retained capture and limits

Private evidence is under `C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-03`.

- Final recording: `capture/2026-11-14 01-52-01.mkv`, 95,541,689 bytes, 287.766 seconds, SHA-256 `638af558c6dd2b5f25688165d23c71706c3185db5f7f8c0b5e824df19025ea5f`.
- H.264 1920×1080/30 fps; AAC 48 kHz stereo. Full decoding and the unchanged timestamp policy passed. The maximum video interval was 100 ms, at the policy limit. OBS reports 8,632 output frames; the finalized container decodes 8,631 video frames. These are retained as separate counts.
- The predeclared stock-B interval is 66.0065977–76.0065977 seconds. Its WAV, PCM and decoded timestamp arrays reproduce exactly from the finalized recording. A passing background road vehicle is visible within this interval, so possible traffic contamination remains a limitation.
- `analysis/capture-finalization.json`, `analysis/B-stock-final-reproduction.json`, `analysis/capture-visual-review.json`, `RESULT.json` and retained runtime logs distinguish capture evidence, my listening reports and native-call observations.

There is no preserve/B1 comparison, frozen calibration, C/B2 measurement, wider-spectrum suppression test or collateral-isolation result. Residual engine/exhaust coverage remains untested. Capturing ordinary B audio does not establish that the private player idle-wave branch is selected.

## Offline correction and the next suppression step

The operator completed the directly justified source corrections in the separate `RichAudio-NativeSuppressionFixes` worktree. The approved candidate-03 source, scope and DLL remain intact. No audio resource was rebuilt or expanded, and no new live scope was sealed as part of this work.

The deletion correction follows the retained SDK's own `Entity.Delete`: a pointer to a local integer handle is passed only during the synchronous deletion call. The helper creates an `InputArgument` through the SDK's supported pointer conversion. It does not inspect game memory or change the existing ownership and retirement checks. The authored adapter fixture now rejects the old boxed-integer form and validates the pointer during dispatch.

The real-API regression passed 24 assertions against the exact retained API DLL. It checked the production argument helper's pointer identity, 32-bit handle contents and writable output for both live handles and boundary values. It made zero native calls and loaded no SHVDNE core. The live exception and retained source establish the old conversion defect; the test does not claim to reproduce that exception against the real mixed-mode core offline. Preliminary compiler/dependency refusals remain recorded in `.local/native-suppression-fixes/deletion-attempts.json`.

The setup correction adds Ctrl+Shift+F11 as an explicit manual, one-shot request to start B's engine while B is empty, stationary, driveable and still matches its lifetime token, with the player idling on A. It is available only before the first phase and while unarmed. It sends `SET_VEHICLE_ENGINE_ON(B, true, true, false)` after a final deadline/health check; the attempt is consumed even if dispatch throws or final admission fails. It remains separate from audio assignment. The strict requirement for running B stays in place. There is no automatic restart or use of engine-off as suppression. A terminal refusal also blocks a later spawn request. This new setup operation requires fresh live approval before use and has no runtime qualification from this run.

The final combined controller/adapter suite passed 55 cases and 328 assertions. It covers the existing six-phase sequence and ownership/release checks, the one-shot B-only setup path, unsafe or reused identities, seats and operating conditions, expired/revoked admission, failure without retry and terminal-before-spawn refusal. The full probe compiled against the exact retained framework with x64, the existing C# 5 compiler and warnings treated as errors. Its receipt explicitly marks it as an offline build, with `finalCandidate=false`, `defaultEnabled=false`, `installed=false` and `gameLaunched=false`. Compilation and fixtures do not qualify the new engine-start effect or deletion in GTA.

Final offline evidence is under the correction worktree's `.local/native-suppression-01/final-controller-tests`, `final-deletion-tests` and `offline-build`. The source hashes in those receipts bind the tested edits; the build records the uncommitted-source state used for offline compilation rather than presenting the old candidate-03 commit as the corrected binary's complete source identity.

The single next suppression step is to establish that controlled idle setup and reach the existing preserve/B1 activation check on A with these unchanged resources. Expanding engine/exhaust coverage is not justified until this selected contribution activates, disappears under admitted C, returns under B2 and hands back audibly on the same surviving A.
