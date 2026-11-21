# Native suppression: first execution and spawn correction

## What happened to native audio

The approved attempt ended before either disposable Bati was created. No private audio profile was assigned, so it produced no result for resource resolution, marker activation, silence, marker return, normal audible restoration or control isolation.

I approved one execution of scope `bfc40239474832aeb3c69c6eeb1809456c329dc9cce47605ce6d32a943f9a0bb` and participated in the run. The installer deployed the exact prepared candidate at source commit `03c1dc139586bae887bfcadc1e40d781bbafa1a3`, started the approved OBS recording and used one normal Story Mode launch. The fresh SHVDNE log confirmed that the probe loaded; its `DORMANT` status was visible.

After I dismounted in an open parking area and pressed Ctrl+Shift+F5, the journal recorded:

| UTC on 14 November 2026 | Event |
| --- | --- |
| 00:54:35.3403737 | Spawn request accepted; ten-minute window began |
| 00:54:35.3435744 | `STOP: spawn preparation failed` |
| 00:54:35.3452060 | `InvalidOperationException:stand on foot in a clear flat exterior area` |
| 00:54:35.3452060 | `STOP: command or callback fault` |

That exception occurs before the offset/space checks, decorator registration, model request and vehicle creation. There was no second spawn request, profile assignment, silent-phase confirmation or second game launch. I confirmed that no pair appeared and exited GTA normally. OBS then finalized the recording and closed normally.

## What the failure establishes

The previous `IdleNativeApi.Prepare()` used `GET_VEHICLE_PED_IS_IN(ped, false) != 0` to decide that I was currently in a vehicle. The retained SHVDNE source documents that this native returns the last vehicle on b2699 and later even when its second argument is false. Its `Ped.IsInVehicle()` implementation instead uses `IS_PED_IN_ANY_VEHICLE(Handle, 0)`.

The concrete reference is the retained source at `.local/shvdne-reference/source/source/scripting_v3/GTA/Entities/Peds/Ped.cs` in the preserved SHVDNE worktree: `IsInVehicle()` around line 1732 and the `CurrentVehicle` warning around line 1813. This is a source-backed flaw in the admission check and fits the observed dismount followed by rejection. The old exception combines the dead, vehicle and interior predicates without logging their values, so the exact predicate returned by GTA during this attempt remains unproven.

The corrected adapter queries current vehicle occupancy directly. It retains the dead-player and interior exclusions and gives each a distinct refusal message. The regression runs the actual adapter source with an on-foot player whose last-vehicle handle remains nonzero. It also checks that genuinely occupied, dead or interior states remain blocked before requesting a model or creating a vehicle. These are offline dispatch tests, not proof of GTA behavior or native audio control.

The updated controller/adapter suite passed 31 cases and 131 assertions. Running those same tests against the original adapter reproduced the old `stand on foot` exception in the stale-last-vehicle case. The corrected suite also verifies that a failed preparation stays stopped after the context recovers, with no automatic retry, model request, vehicle creation or audio assignment. The private receipts are under the new worktree's `.local/native-suppression-02/controller-tests-01` and `old-check-regression` directories.

No audio graph, marker, silent PCM, ownership controller, renderer or resource archive was changed. The resource mechanism has not failed an acoustic test: it has not yet reached one. This result supplies no reason to invent an Enhanced audio hook or expand engine/exhaust coverage before the selected idle contribution has been observed.

## Evidence and restoration

Private evidence remains under `C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-01`:

- `AUTHORIZATION.txt`, `scope.json`, `transaction.json` and `runtime-retention.json` preserve the authorization, exact installation and restoration record.
- `retained-runtime/session-9b39b3602a124710b94bd2e0acdb6fd4.log` preserves the controller refusal, SHA-256 `9812a96357d98af4105ca6ef7715bfe26b7fb32d2e4d6a034c17c8a751514547`.
- `capture/2026-11-14 00-53-40.mkv` preserves the continuous recording, 35,084,696 bytes, SHA-256 `0d64878a1bf68a41f6b4f1c811d1fff18317c9a69b97310f76ee20b6164fb11d`.
- `cleanup-verification.json` records independent restoration verification, SHA-256 `caa7195f7868e6234cc74a7fdad9583073c974e35a85fabf901773bfc4acdc27`.

The finalized recording is 93.566 seconds, H.264 at 1920×1080/30 fps with AAC 48 kHz stereo. Full audio/video decoding and the retained timestamp checks passed. The frame at 54.367 seconds still shows `DORMANT`; the next frame at 54.400 seconds shows `STOP: command or callback fault`. Both show the character on foot in the paved exterior with no pair visible. This supports the visual sequence but cannot reveal the native predicate values. `capture-finalization.json`, `capture-finalized-timeline.json` and `capture-visual-review.json` retain that review. No marker calibration or suppression measurement was performed.

The independent audit passed all 95 identity checks, including the base archives, original executable, exact 49 root DLL/ASI inventory, Trainer and preserved candidate. The nine game and two OBS installed destinations are absent. The four restored settings/log files and Trainer match their original bytes, creation/write timestamps and attributes. Generated probe evidence, scripts/mods directories and the temporary OBS profile/collection were removed after retaining evidence. The ordinary new OBS log remains in OBS's log directory and matches its retained copy. No GTA, PlayGTAV, RPH or OBS process remained at verification.

Disk restoration passed. Audible restoration was not exercised because the probe never changed audio. There are no preserve/B1/C/B2 measurements or 20 dB/6 dB results to report. No inference about total engine silence, control isolation, arbitrary custom override restoration or failure recovery follows from this attempt.

## Next runtime dependency

The corrected source lives in a separate worktree and branch so the approved candidate and its history remain intact. Only the changed probe needs recompilation; the original private DLC, full update shadow and runtime are reused by exact hash.

The next decisive observation is whether the corrected adapter admits the same on-foot setup, creates its one pair and produces an attributable B1 marker through the preserved resource graph. A new bounded run requires separate approval. It retains the original ten-minute limit, A-only assignments, unassigned B, manual phase progression, continuous capture, explicit silent-phase confirmation after frozen positive B1 calibration, normal exit and exact rollback. A repeated refusal must now name its predicate. No new hook, memory observation, second pair or automatic retry is included.
