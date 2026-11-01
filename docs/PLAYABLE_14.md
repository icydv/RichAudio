# PLAYABLE-14: fresh-context admission before the single binding

**Subsequent live update:** [The authorised live result](PLAYABLE_14_LIVE_RESULT.md) establishes successful fresh-context binding and 54 genuine idle frames, followed by a terminal listener-continuity rejection. A separately requested manual attempt was cancelled because of an observer attribution defect. Both installations were restored. The preparation record below describes the evidence available before those live attempts.

**Offline correction implemented; the next passive live experiment requires fresh explicit approval.** No deployment, GTA launch, WASAPI access, playback or recording was performed for PLAYABLE-14. The exact candidate and focused validation receipts are bound in [offline evidence](../evidence/playable-14-offline.json) and [candidate evidence](../evidence/playable-14-candidate.json). PR #76 remains draft and unmerged.

## What is established

The [PLAYABLE-13 live result](PLAYABLE_13_LIVE_RESULT.md) is unchanged: startup/READY, source Open and 2,233 measured clock maps succeeded; initial binding rejected with `measured-clock-map-required` before BEGIN or accepted observations. Restoration passed. The failed waiting-context operands were not retained, so their exact age and a console scheduling cause remain unknown.

The focused offline reproduction now establishes the suspected mechanism. The unchanged compiled native producer ran against the existing fake SHV fixture. Its registered waiting callback was actually paused for 6,007 ms: context sequence 6 and its original acquisition timestamps stayed frozen while real QPC Clock exports continued advancing. Independently authored RPH peers and a current, non-expired measured map were available. The frozen PLAYABLE-13 managed core, compiled from ten pinned blobs at `08776ecc31f08b7a7838497b524d5d8b2ba75546`, rejected that old context with the exact `measured-clock-map-required` reason and permanently retired. No native target call or gameplay frame occurred in this fixture. This reproduces a concrete defect in admission; it does not retrospectively prove the missing live operands.

## Minimal correction

The new passive profile arms after one operator `RichAudioHandoffStart`, waits for the RPH console to close and the game to be unpaused, and requires a new SHV sequence and advancing **original** acquisition timestamps after arming. Safe waiting reads do not call terminal `TryBind`, BEGIN or the target engine-state native. Clock calibration continues independently.

Readiness uses a **10-second deadline and 200-attempt cap**, within the unchanged 300-second waiting limit. Attempts are separated by 50 ms. After a genuinely fresh source preview, independently retained RPH observations must enclose a newer mapped source interval. The inner loop uses a 40 ms deadline and at most eight Peek reads; repeated Peek reads do not create another source session. These are cooperative bounds: native/OS calls may return later and cannot be preempted by this loop. Cancellation and the readiness deadline are checked before terminal binding and again after diagnostic queue admission. A window that ends without restored freshness permanently retires with `waiting-context-not-refreshing`.

The original **250 ms freshness, 2 ms future allowance, 50 ms peer skew, five-second map lifetime and measured uncertainty/drift policy** remain. No source time is replaced by the current time. Source ownership, sequence/content progression, independent driver/vehicle/pool correspondence and permanent retirement remain mandatory. The existing terminal binder, BEGIN and active validator have not been relaxed. The native production source and exact ASI are unchanged.

## Evidence before rejection

Each bounded private readiness diagnostic records observed Peek status, API-return/validation status and call QPC; source sequence, acquisition endpoints and selected raw context fields; map source anchor, host measurement bracket, expiry, frequency, measured rate bounds, drift and anchor count; mapped source interval/age/future bounds; independent peer intervals/age/skew; and individual ownership, ordering, freshness, scope, mapping and correspondence results. An unobserved operand is null, not an invented zero or passing result. Source-domain age at Peek remains available even if the source falls outside the map window.

Reasons distinguish `clock-map-unavailable`, `clock-map-expired`, `source-context-outside-map-window`, `source-context-mapping-invalid`, `source-context-stale-or-future`, `peer-observation-stale-or-future`, `binding-peer-skew-exceeded`, `source-context-not-bracketed` and `vehicle-correspondence-failure:*`. The same snapshot operands are reassessed for age and validity after the diagnostic callback before invoking terminal binding.

Required diagnostics use the existing bounded asynchronous writer. Successful queue admission and worker health are checked; this is **not a durable-flush acknowledgement**. A failed admission, exception or detected worker failure cannot pass validation. Writer completion and retained file integrity must be checked separately after the live experiment. Existing 128-item queue, 4,801 source-row and 12 MiB aggregate limits remain. Private addresses, raw process paths and source recordings are excluded from public evidence.

## Focused verification and its limits

The compiled-component matrix passed **11 cases/1,405 assertions** covering the old frozen-context rejection, corrected normal admission, resumed callback, never-resumed timeout, wrong identity, missing/expired map, stale source, stale peer, peer skew and required diagnostic-write failure. The resumed case paused the actual callback for 6,001 ms, then accepted a genuinely newer source sequence inside an independent peer bracket. It reached one binding and one successful BEGIN admission, producing six exact native-return/gameplay-frame pairs. Duplicate and retired managed BEGIN probes are recorded separately; no independent native BEGIN export-entry counter exists.

Three passing cases came from an interrupted batch without contemporaneous compile-input/per-case source receipts. Their original result/image hashes are retained; all 1,401 compiled type/field/method definitions match the fully receipted resumed-case image, and fake-SHV bytes match except two PE build timestamps. This establishes component-image equivalence, not complete historical source provenance. The reproducible runner now writes compile inputs and per-case receipts before proceeding to another case.

The existing clock/consumer/composition regression passed 13 cases/43 assertions, plus the existing validator's 69 cases/255 assertions. The new console contract passed six cases/18 assertions, including absent/wrong-type API rejection without executing game API getters. The exact authentic-SDK passive image is inspected through Cecil for the reachable new gate/console contract, unchanged policy constants and absence of reachable audio/host/menu/recording startup. Exact matrix totals and artifact/receipt hashes are in [offline evidence](../evidence/playable-14-offline.json).

The native fixture enforces its real foreground-window check. Setup attempts that lacked foreground and one resumed case that lost foreground were preserved and excluded from passing evidence; the source's rejection was not bypassed. No game process was involved. The fake SHV/import values and authored RPH peers are fixture inputs, not genuine GTA telemetry or live correspondence proof. The compiled RPH fiber and external SDK behaviour remain live-unverified. No unrelated audio/recording matrix or new CI pass is claimed.

Reproduction from the repository root uses PowerShell 7 and the existing pinned compiler/SDK inputs:

```powershell
pwsh -NoProfile -File tools/Test-ShvWaitingBinding14.ps1
pwsh -NoProfile -File tools/Test-ShvHandoffComposition.ps1
pwsh -NoProfile -File tools/Test-ShvPrebind14Console.ps1
pwsh -NoProfile -File tools/Test-PassiveShvHandoff14Profile.ps1 -BuildReceipt .local/playable-14/build-01/playable14-build-receipt.json
```

For native fixture cases, activate only the owned `RichAudio offline handoff fixture - awaiting foreground` window when it appears and leave it foreground until the case exits. The test must refuse missing foreground; do not substitute foreground readers. All outputs use new private directories and do not deploy to GTA. The existing final receipts are retained; these commands document reproduction rather than an instruction to rerun passed checks before approval.

## Preservation and readiness

All prior private evidence, the protected installation/settings, native producer and PLAYABLE-13 audio package are rehashed against the pre-edit baseline. The original plugin, saved stock fallback, gold-menu shortcuts, disabled production flags and existing gains remain. Installation and rollback manifests describe a passive-only temporary replacement; their preparation does not execute them. The [single-attempt live proposal](PLAYABLE_14_LIVE_PROPOSAL.md) names exact bytes and requires all 11 protected files/four settings before and after the attempt.

**Decision: PASS for offline correction and candidate preparation; live handoff and audible demonstration remain unverified.** One freshly authorised passive test must now establish genuine changing Bati engine state, actual SHV/RPH correspondence, pose/camera lineage, clock alignment and permanent retirement on leaving the motorcycle. A terminal failure consumes that attempt; there is no automatic retry.

The next milestone remains hearing Bati idle, revving, acceleration/deceleration and camera-relative positioning. The existing genuine engine/exhaust assets, source playback, renderer, RA07/PCM transport, WASAPI host and optional synchronised PCM/loopback recorder/analyser are preserved byte for byte. No new framework work is required. The preserved PLAYABLE-13 audible DLL still has the older immediate binding path: it has **not** acquired this passive-only correction. After genuine passive acceptance, assess that managed entry path and carry over only the necessary admission correction into a newly pinned audible DLL if required. The host, source assets, DSP, gains and recorder need no rebuild for this correction.

Audible output and optional actual stereo PCM/selected-endpoint loopback capture require separate explicit per-run approval. Recording remains available for that first approved audible session; lossless WAV retention, automatic waveform/spectrogram/anomaly analysis and objective limitations remain as documented in [PLAYABLE-13](PLAYABLE_13_LIVE_PROPOSAL.md). No subjective listening or new recording analysis was performed here.
