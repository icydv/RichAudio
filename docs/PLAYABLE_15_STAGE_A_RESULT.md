# PLAYABLE-15 Stage A attempt 1: startup failure, restored

**Result: BLOCKED before operator Start. Restoration: PASS.** One exact passive deployment and one Enhanced/RPH route invocation ran under the owner's explicit approval of `4c07d448fdd4a280965c1ae2d1d6f80feee2c86f` and candidate receipt `94c582f5d961125fe91988698a300405bc0b6849aee5441b34c34359efcd295d`. No retry, second launch, audible DLL deployment, RichAudio playback, endpoint access or audio recording occurred.

The installed passive image was 381,952 bytes, SHA-256 `3a124f3b0bb15e4790645d8ef1b0fa2268639a64386c6ae95f83009465efefda`; native producer was the unchanged 129,024-byte `05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40`. Fresh independent preflight and coordinator reviews passed; the original plugin was retained in the exact owned backup. The Stage A selector was separately adapted to the actual PLAYABLE-15 entry text while preserving its 120/300/120-second policy.

## What actually happened

Steam Action 16 recorded custom-argument continuation at **21:30:56 UTC on 1 November 2026**, interstitial continuation at **21:30:58**, then CreatingProcess/Completed at **21:30:58**. Root dispatched one observed argument Continue click, returning at **21:30:56.939**. Root dispatched no second-interstitial click; its continuation initiator is not established. No launcher argument or route was changed.

The exact new Enhanced process began at **21:31:14.2797137**, **42.3730854 seconds** after the launch marker, within the 120-second startup observation cap. Its strict 21-field PLAYABLE-15 lease matched the observed PID/kernel creation lifetime, fresh session and exact caller/native hashes; playback permissions remained false. Lease SHA-256: `54c9c457dc79c0610ef37d73b657fef06ee4edd3583a342e28117bf18b283717` (1,279 bytes).

The current process/session log records:

| UTC | Actual caller observation |
| --- | --- |
| 21:32:06.304 | PLAYABLE-15 passive profile entry |
| 21:32:06.782 | `passive-handoff-failed:ArgumentException` |
| 21:32:06.783 | RETIRED, accepted=0, frames=0 |

READY and ACTIVE were absent. The independent supervisor admitted the exact new log epoch and raised a terminal stop request. The owner subsequently confirmed being mounted on the Bati, but **no operator Start was dispatched**. Camera movement, camera-cut recovery, changing telemetry and deliberate driver-loss qualification were therefore not exercised in this attempt. The failed session's capture directory was absent.

The caller reports `producerCompleted=False`, writer completion false, writer worker false and native FIFO drain false. Those fields must not be turned into successful worker/producer completion. No raw native audit or Begin counter exists for this attempt, so its actual native attempt/Begin count was not independently measured. Zero published frames is established; missing native audit is retained as missing evidence.

## Concrete startup defect and minimal correction

The sealed passive DLL was inspected and its actual constructors invoked in an offline .NET Framework process. Its `ShvHandoffBootstrap.Configuration` constructs a PLAYABLE-15 evidence path successfully, and `CreateReview` succeeds. Its actual `ShvHandoffJournal` constructor still selects `.local/playable-14/live-session` because the combined build defines SHV_HANDOFF_14 as well as SHV_HANDOFF_15. Passing the actual configuration path deterministically throws **`ArgumentException("compiled private evidence root")` before writer creation**.

This is a proven startup integration defect sufficient to explain the live outcome. The live catch retained only exception type, so the offline stack is not a captured live throw stack. It does not establish any new camera, native-value or physical-causality finding.

The correction adds the missing PLAYABLE-15 branch in the journal's root selection and summary profile only: six added lines/two replaced lines. Listener policy, source identity, clocks, expiry, renderer, assets, host, recorder and calibration are unchanged. The previous checks had exercised the journal under another profile and inspected the new image without constructing its journal; that coverage gap is now addressed directly.

Four focused actual-component profiles (15/14/13/12), 56 assertions, verify actual configuration/review construction, correct profile-root selection, bounded event writing, summary, completion/external join and rejection of other profiles' paths. The corrected **exact passive DLL** also constructed the actual journal, wrote one explicitly labelled offline event and joined cleanly with zero source records. The exact audible DLL's configuration/constructor IL agrees on profile 15 without constructing playback or a host. These offline fixture files use a distinct, explicitly identified session; they are not this failed live capture.

The corrected passive/audible candidates are prepared under new private directories. The original sealed artifacts and consumed receipts remain preserved. Only their historical journal source pin differs from the corrected working source; the installed baseline is a separate verified state. No correction was deployed or live retested.

## Exit, restoration and next decision

Root requested normal exit with Alt+F4 at **21:33:00.054**; game/RPH absence was subsequently observed. A follow-up console-close input reported no foreground process and was not retried. No forced termination, final quit-dialog observation or numeric game exit code is claimed. Closed source/copy log hashes matched before rollback.

Exact owned rollback removed only the installed producer, passive plugin and process lease, restored the original 222,208-byte plugin, and passed all **11 protected files, four settings, stock-fallback/F10, both false production flags and 32 absent owned paths**. Game/RPH/audio and all three owned supervisor/startup/launch processes were absent; the independent supervisor completed naturally. Private captures, packages and prior evidence were retained. Independent restoration review passed 98 checks.

The failed attempt is consumed. The [narrowly corrected Stage A proposal](PLAYABLE_15_STAGE_A_RETEST_PROPOSAL.md) requires fresh explicit approval; Stage B remains blocked on genuine Stage A acceptance. The separate [audio review](PLAYABLE_15_AUDIO_REVIEW.md) confirms the owner's findings using offline stems and leaves calibration intact. [Sanitised live evidence](../evidence/playable-15-stage-a-live-01.json) binds the exact closed result and restoration without publishing private runtime identities or addresses.
