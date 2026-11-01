# PLAYABLE-14 retest: source stream expired after successful binding

**Decision: BLOCKED — `source-silence-or-expiry`. Startup, fresh-context binding, current-session supervision and restoration passed.** The approved attempt 3 used the exact passive artifacts and corrected coordinator named in the [retest proposal](PLAYABLE_14_RETEST_PROPOSAL.md) at `791a7e82e1f6767edd43d84bfa99f0a3727580ab`. There was one deployment, one existing-route invocation, one new Enhanced process and one operator Start. No retry, extra launch/session, RichAudio playback, endpoint access, recording or configuration/source change occurred.

| Approved artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Passive `Plugins/RichAudio.dll` | 361,472 | `ba19342ce5ceac63d179943e22d324819a42a8c8294d7f15e436f3833e01be0f` |
| Native SHV producer | 129,024 | `05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40` |

The approved coordinator receipt remained `8fb6a5e22f9808bc787126d2245d931a7595e649ed47d9ad91bdce50c7d24f66`; none of its four files was substituted. The installation and ownership-verified rollback manifests were unchanged.

## What actually ran

Steam Action 14 recorded argument-confirmation continuation at 19:40:30 UTC, interstitial continuation at 19:40:31 and CreatingProcess/Completed at 19:40:32. Both continuations happened before a coordinator click; the coordinator dispatched zero Continue clicks and does not attribute their initiator. The exact new Enhanced process began at **19:40:47.2536962 UTC**, 27.7555662 seconds after the launch marker, and matched the fresh 21-field process lease.

The corrected supervisor initially stayed waiting with no owner/active state and rejected the old retained same-profile log. It subsequently admitted only the current process/session entry at **19:41:32.359** and READY at **19:41:34.867**. Independent startup review confirms the new process, installed artifacts, lease and log baseline/epoch correspondence. The prior supervisor attribution defect did not recur.

The owner confirmed the engine-running Bati was ready. The coordinator observed the mounted motorcycle, entered `RichAudioHandoffStart` once and dispatched console closure; it issued no further game input during capture. The recorded readiness path includes **144 console-open waits** and succeeds at attempt **146**, **8,208.463 ms** after arming. This measured delay is retained separately from the intended immediate closure.

The waiting context was genuinely old: sequence 838 reached **40,408.8859 ms** age at Peek while measured maps remained current. The gate safely waited, then admitted new sequence **840** within independent RPH brackets. The retained commit diagnostic reports source age at Peek **5.0343 ms**, mapped age **8.4913 ms**, peer skew **5.1472 ms**, valid ownership/correspondence and a current measured map. No source timestamp or freshness/skew limit was relaxed.

ACTIVE was logged at **19:43:03.679**. The final caller line at **19:43:06.442** reports `source-silence-or-expiry`, **32 accepted/32 frames**, writer completion within its bound and no live writer worker. `listener-discontinuous` did **not** recur. No second Start followed the terminal condition.

## Retained telemetry and completion limits

Independent analysis found **32 completed target-return rows and 32 matching final observations**, forming 64 exact 256-byte rows/16,384 bytes and **32 exact gameplay frames**. Retained raw bits, float32/scalar conversion, source sequence, measured clocks, independent vehicle/pose and listener lineage passed; maximum endpoint skew was **21.6864 ms** and maximum mapped interval width **1.0385 ms**.

Every retained operating value was **0.20000000298023224**, bits `3e4ccccd`. Source speed was zero, with one recorded vehicle position and one recorded listener position. The capture establishes genuine idle telemetry, not changing throttle/vehicle/camera response or deliberate dismount qualification. Later gameplay after permanent retirement cannot add accepted evidence.

**The native total-attempt counter is unknown.** Thirty-two completed returns establish a lower bound; there is no terminal row, completed terminal sequence or retained final attempt counter. An additional blocked/in-flight/unpublished native invocation is not excluded. The native producer's source still enforces the original attempt/rate/deadline policy, but those controls do not let this incomplete audit claim an exact total or preempt a blocked native/OS call.

All 64 admitted source rows were written, with **1,792 events, zero dropped rows, zero pending consumed-audit rows and no observed unmatched return**. The writer's clean join is independently confirmed by the copied caller log. Source control was observed Retired and the native queue was observed at zero during shutdown. However, **producer callback completion and full FIFO completion remained unobserved through the approximately 500 ms drain**. Queue zero and clean writer shutdown do not establish that no native operation remained in flight. The summary correctly preserves `nativeOutcomeMayRemainUnobserved=true`.

The source-cleared journal row establishes empty consumer control state, not a newly sampled empty gameplay frame. The exact consumer-worker retirement timestamp was not retained; subsequent source-cleared/retirement event timestamps describe observed cleanup.

## Diagnosis from the actual operands

After the last native target return, **four new advancing Clock-derived maps** were journalled at **55.4350, 111.6616, 168.0577 and 224.4584 ms** relative to that return. Each map still had nearly five seconds of life. The last gameplay candidate expired **249.9790 ms** after the last target return; source-cleared followed at **267.1170 ms**, or **17.1380 ms after candidate expiry**. The retirement event followed source-cleared by **507.0068 ms**, consistent with the bounded shutdown drain.

This is **not measured-clock-map expiry**. The managed RPH clock-observation/journal path continued during the missing source stream, so an uninterrupted whole-fiber stall throughout that interval is inconsistent with the retained maps. A valid conversion map does not refresh the original engine observation's validity. The unchanged 250 ms expiry control correctly removed stale state.

The observed failure is missing source-to-consumer progress; its exact stage remains unknown. An unscheduled SHV callback, a blocked game/native/context call or delayed producer publication is consistent with the capture. Partial managed capture/read/drain delays and brief managed stalls between clock events also remain unresolved. There is no continuous post-sample foreground/pause witness, per-Poll entry/exit trace or in-flight native-stage witness, so no focus/tab-out, exclusive producer-side cause or specific native-call cause is asserted.

The existing ABI already returns source state, target-attempt count, queue count and last-target timestamp in Clock/control replies; the clock-map journal does not retain those full replies. The next focused diagnostic work should retain those original status operands together with bounded caller/Poll timing and callback-progress witnesses before another experiment. Detailed callback-stage instrumentation may be needed if those fields cannot separate an unscheduled callback from a blocked context/native call. This identifies the remaining observability gap; it is not evidence for a particular implementation fix. No larger freshness window, timestamp replacement, fabricated value, automatic reconnect or blind further retest is justified by this result.

## Restoration and next milestone

The owner reported normal game exit after the terminal result. Exact game/RPH lifetimes were observed ended before rollback. After rollback, verification and capture preservation, the supervisor was signalled to finish; final independent verification found all owned game, launcher and observer lifetimes absent. No forced termination or hot unload occurred. The final quit dialog and numeric game exit code were not observed by the coordinator.

Ownership/hash/length rollback restored the original plugin and independently verified **all 11 protected files, four settings, 27 absent owned paths, saved stock fallback/F10 and both false production flags**, with zero mismatches. The audit also rehashed 3,138 prior private files, 132 audio-package bindings, all 47 approved compiled source pins, four native source inputs, previous captures/reviews and all 12 sealed attempt helpers. Prior evidence, the approved binaries and the original audible host/assets/renderer/gains/recorder remain unchanged.

[Sanitised retest evidence](../evidence/playable-14-live-03.json) and [restoration evidence](../evidence/playable-14-live-03-rollback.json) bind the private capture/analysis/startup/diagnosis/restoration reviews without publishing private addresses or runtime paths. The [earlier results](PLAYABLE_14_LIVE_RESULT.md) remain historical and unchanged apart from a link to this retest.

No further launch or session is authorised or prepared as a blind retry. Full passive acceptance has not occurred, so preparation of a newly corrected audible DLL has not advanced under the conditional approval. The existing genuine-source playback and optional synchronised PCM/loopback recording chain remain available for that later separately authorised audible milestone. No subjective listening or audio recording/analysis was performed in this passive test.
