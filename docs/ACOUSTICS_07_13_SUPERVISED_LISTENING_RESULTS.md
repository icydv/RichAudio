# ACOUSTICS-07.13 — Supervised listening results

**FAIL: the single authorised launch did not establish a visible GTA/RPH session. No bridge or audio-host session began.** The attempt ended without retry and the reviewed temporary installation was restored and independently verified. This is not a listening result or a runtime compatibility diagnosis.

Approved operator source: `c3f6c81952ceeb63d5db2b1e23378693efabfd02` (draft #64). Candidate SHA-256: `D8E07531B2C80F9F322940A6770B462E7FEDC28DCAF870DFEDA7A13E38981C41`. Preserved runtime: `b5143db8c99decef49a8c9fdf1473f0c3db4840f`. No runtime, operator helper, profile or deadline was changed in this results task.

## Observed sequence

Fresh device-free preflight verified the approved candidate and execution bindings. The reviewed installation verification passed against 32 original root files, five directories, 179 archive metadata records and ten sampled archive hashes, with valid executable signatures and no introduced paths, temporary alias or relevant processes. Enhanced version `1.0.1158.16` and RPH version `1.132.1428.17748` matched the sealed manifest.

The user's fresh one-attempt approval was recorded at `2026-10-28T23:54:53Z`, with explicit expiry one hour later. The reviewed helper deployed exactly 26 additions and temporarily renamed `GTA5.exe` to `_GTA5.exe`.

One computer-use `launch_app` call targeted the reviewed installed RPH executable. It returned `launched app did not expose a targetable window`. A subsequent desktop-window inventory contained no GTA/RPH window; process inspection found no GTA/RPH process, and neither expected RPH launch log was present. This evidence does not distinguish failure to create a process from rapid process exit or another launch-layer problem. No second launch, alternate launch method, reload or reconnect was attempted.

The audio adapter was never invoked in live mode. Consequently the host clock never started, the startup/activation/emission/Stop cues were not reached, and no host launch or Start token was created. No audio endpoint was probed or opened by this attempt, and there was no playback or capture. Listening feedback is not solicited as though a beacon had played.

The reviewed restoration helper restored the original executable name/hash and quarantined only the enumerated additions. Independent verification completed at `2026-10-28T23:55:46Z`. No normal-close input was necessary because no game/runtime process was present. No process was forcibly terminated. The approval was preserved in private attempt evidence as consumed/closed and removed from the adapter's fresh-approval path; it cannot authorise another attempt.

## Acceptance matrix

| Acceptance item | Result | Evidence or limitation |
|---|---|---|
| Exact source, candidate and executable/helper/runtime bindings | PASS | Device-free preflight and exact candidate hash matched |
| Fresh game/RPH version and installation baseline | PASS | Reviewed versions, root hashes/signatures and archive checks matched |
| One fresh candidate-bound approval with expiry | PASS | Recorded once; closed after launch failure; earlier approvals untouched |
| Exactly reviewed temporary installation | PASS | 26 additions and one executable rename; deployment hashes verified |
| Visible GTA/RPH launch and Story Mode | FAIL | One launch API call exposed no targetable window; subsequent process check empty |
| Bridge READY/sending OFF, one activation and connection | NOT OBSERVED | Launch stage failed before bridge load |
| Accepted/forwarded/consumed observations, rejections, expired-unsent observations | NOT OBSERVED | No telemetry session |
| Startup and activation cues; gated Start before 25 seconds | NOT OBSERVED | Host never launched; clock never started |
| Start issued and producer emission observed | NOT OBSERVED | Zero host sessions and emission commands |
| Nonzero submitted PCM, clipping and history metrics | NOT OBSERVED | No host or producer result |
| Audibility, comfort, directional response, smoothness and interruptions | NOT OBSERVED | No beacon playback |
| Sender/receiver deliberate Stop and timing | NOT OBSERVED | No transport session or acknowledgement evidence |
| Timed owned-job normal/forced cleanup | NOT OBSERVED | No owned host/producer tree created; no termination performed |
| Independent post-attempt relevant-process absence | PASS | Restoration verifier found no game, RPH, host or selected producer |
| Exact restoration and independent installation verification | PASS | 32 root files, five directories, valid signatures, 179 archive metadata records, ten sampled hashes; additions/alias absent |
| Candidate preserved, no retry or runtime fix | PASS | Candidate hash unchanged; source remains sealed; one launch call only |

Original host SHA-256 remains `847D5B59464A75DF67D9D2B51E5E444F1DF9D1D934C1CE8AD6F1F6ED20C5BAB7`; bridge remains `96EE4100BA2C2CCB2AB75A0664A3047A3BC293D5A8F43A3D37F21D09247EAFAD`; deployment manifest remains `64FC1B32CDEAE1877FA82B124EC827F0307005833A6EF36E9F444303E3A71BBA`. Archive verification includes metadata and sampled hashes, not a full content hash of every archive.

Private evidence retains approval provenance/closure, baseline verification, deployment/restoration journals, quarantined additions and the launch failure observation. Only the portable scalar outcome is published. Local repository validation and staged publication auditing accompany this results commit; hosted CI must be checked against the final published tree. Full-history review retains inherited identity findings already in #64 without rewriting ancestry.

ACOUSTICS-07.9 remains incomplete with failed Stop timing. ACOUSTICS-05 + BENCHMARK-01 remains **60%**. No new listening success, benchmark completion or live approval is claimed.

## Next task

Investigate the launch-layer failure offline using retained evidence and the sealed invocation. Distinguish computer-use launch failure from RPH startup failure; do not infer a cause from absence of a window. Do not launch GTA/RPH or the host, redeploy, change runtime, or create replacement approval. Present any proposed next attempt separately for fresh explicit authorisation.
