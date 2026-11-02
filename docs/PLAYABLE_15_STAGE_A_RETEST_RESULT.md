# PLAYABLE-15 Stage A attempt 2: live camera recovery accepted, restored

**Scoped Stage A result: PASS for changing genuine Bati telemetry, measured camera-cut recovery and permanent source-scope retirement/completion. Restoration: PASS.** The specific driver-loss branch was not isolated: the recorded retirement reason is `rph-model-or-running-scope-lost`. This limitation remains explicit. The result supports presenting the existing audible candidate for separate Stage B approval; it does not authorise playback or establish audibility.

One exact deployment, one existing Enhanced/RPH route invocation and one operator-initiated Start ran under my approval of `be52fe927ef9bd5585a6af98dd2a06d0028ede05`, [the exact retest proposal](PLAYABLE_15_STAGE_A_RETEST_PROPOSAL.md), candidate `a9449e06172e53167a2a3c9bc9da22c2b4aa3b21e29d6e157f1c3857d8e0a5e3` and fresh scoped-02 coordinator. Passive DLL `9d353872451e17149f10052232af278f5240b996cd0f227445b0cc0c1ab7970c` (381,952 bytes) and native producer `05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40` (129,024 bytes) matched throughout. No retry, substituted artifact, audible deployment, RichAudio endpoint/playback or live audio recording occurred.

## Actual startup and admission

Steam Action 17 recorded argument continuation at **22:05:49 UTC on 1 November 2026**, interstitial continuation at **22:05:50**, then CreatingProcess/Completed at **22:05:51**. Root's attempted Continue target was no longer available in cached app state; delivery was not established and no click retry followed. The actual continuation initiator is unestablished. The exact new Enhanced process began at **22:06:06.1435461**, **28.359 seconds** after the launch marker, within the 120-second startup bound. Its fresh strict 21-field lease matched the exact process lifetime and caller/native hashes. Lease digest: `0f0f286a1913680ba643ac84f662395d6a2511bd7471d9599d745c8da8bbe0f6`.

The corrected journal started successfully. Current-session READY was recorded at **22:06:53.573**. I confirmed an engine-running mounted Bati with menus closed before Start. Enter returned at **22:08:00.230**, and the caller armed at **22:08:00.255**. The console-close input returned at **22:08:04.707**: **4,477 ms after Enter**, a retained deviation from the intended immediate closure. A trainer menu was visible just after console closure. Neither deviation is hidden or used to rewrite sample time.

The existing fresh-context gate safely waited on old source sequence 960, whose peek age was **11,371.1226 ms**, and on 79 console-open waits. It admitted fresh sequence 962 at attempt 81, **4,541.2717 ms after arming**. Original mapped source age **7.2777 ms** and peer skew **4.2145 ms** passed the unchanged 250/50 ms limits. ACTIVE followed at **22:08:04.804**. Root sent no driving, camera, dismount or further Start input.

## Changing genuine source and spatial evidence

| Retained measurement | Actual result |
| --- | ---: |
| Completed native returns / matching final observations | 545 / 545 |
| Completed native terminal row | One, sequence 545, CallerStopped |
| Total retained raw rows | 1,091 |
| Accepted source observations | 544 |
| Published gameplay frames / private discarded cuts | 538 / 6 |
| Distinct published operating values | 342 |
| Published operating range | 0.20000000298023224–0.8605108857154846 |
| Distinct published vehicle/listener positions | 447 / 480 |
| Native completed-return span | 31.4421625 seconds |
| Minimum/maximum native return spacing | 54.0239 / 199.415 ms |
| Maximum endpoint skew / mapped interval width | 24.3145 / 0.4726 ms |

All 538 published frames passed independent exact raw float32/scalar, original source/clock interval, vehicle/driver/pose/listener lineage and expiry checks. Completed paired audit, final terminal sequence and callback/FIFO completion establish **545 total target attempts**, within the 2,400-attempt/20 Hz/120-second caps. A native Begin export-entry counter was not independently recorded. Source 545 was retained but not published because the RPH scope guard retired the provider. The other six unpublished source observations are precisely the measured camera cuts below.

## Six actual cuts recovered without fabricated velocity

The private rejection records retain original previous/current camera acquisitions, dt, delta, calculated velocity/squared speed, source/map/expiry and three RPH relationship observations. All arithmetic reconstructs exactly. At every cut those three retained peer observations still qualified the current Bati/player-driver relationship. No cut frame was published; each next fresh source/camera observation resumed in the new listener generation.

| Cut source sequence | New generation | Measured camera position-difference speed, native units/s | Next published source | Cut-to-recovery journal interval, ms | Previous published original expiry still remaining, ms |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 294 | 2 | 122.801 | 295 | 54.587 | 122.944 |
| 369 | 3 | 295.344 | 370 | 70.443 | 109.429 |
| 373 | 4 | 293.993 | 374 | 56.301 | 122.589 |
| 378 | 5 | 685.667 | 379 | 56.919 | 123.259 |
| 388 | 6 | 680.309 | 389 | 56.458 | 122.495 |
| 520 | 7 | 108.523 | 521 | 56.454 | 123.306 |

These values classify presentation-camera discontinuities; they are not physical motorcycle speeds. Published listener generations advance **1→7**. Every published velocity reconstructs exactly from the preceding recorded acquisition, using the actual cut baseline for first recovery; maximum reconstruction error is zero. The old speed threshold was not increased, the jump velocity never reached the wire, and the previous original source lease was not extended. Minimum remaining prior lease at recovery was **109.4291 ms**.

I reported revving, gentle driving, ordinary camera motion, entering first person twice, then dismounting. That report exceeds the single planned camera-mode transition and is retained as actual operator context. The precise camera-key sequence and mode-to-cut timestamps were not captured, so a particular cut is not assigned to a particular key action. This live passive test establishes listener-frame generation and continuity; actual renderer/Doppler reset remains supported by the existing offline production-chain tests, since no audio host ran here.

## Retirement and its evidence limit

The caller stopped at **22:08:36.277** with **`rph-model-or-running-scope-lost`** and retired at **22:08:36.295**, about **31.473 seconds after ACTIVE**. The source was cleared and no later gameplay frame was published. The last published original source lease still had **177.9757 ms** remaining at clear, so source expiry was not the recorded terminal cause. Callback, source retirement, complete native FIFO drain, zero pending audit rows and zero remaining queue agree. The copied RPH caller independently reports writer join true and worker alive false; the journal summary alone is not self-join evidence. All 1,091 admitted rows were written, with 2,447 events, zero dropped/pending rows and queue high-water three.

I confirmed dismount and was visibly standing off the Bati afterward; no separate engine-off action was reported. However, the last native pre/post bracket still identified a running, player-driven Bati, and the rejected RPH model/IsEngineOn operands were not retained. The combined model/running scope reason is therefore not relabelled as the direct `rph-current-driver-changed` branch. Getters are not atomic, and exact dismount timing/cause remains unknown. Permanent source retirement/completion is established; direct driver-loss causality, live audio fade and remount behaviour were not separately exercised. The unchanged ownership and original-expiry guards remain mandatory in Stage B.

## Normal exit and independently verified restoration

I reported normal exit; exact game/RPH absence preceded rollback. Root requested the normal game menu once with Escape but did not establish a visible menu effect or send a forced termination. No numeric exit code is claimed. Closed source/copy logs and the complete closed journal were preserved and rehashed.

Ownership-bound rollback removed only the exact producer, plugin and process lease and restored the original 222,208-byte plugin. Independent verification passed all **11 protected files/four settings**, saved stock-fallback/F10, both false production flags, **32 absent owned paths**, absent game/RPH/audio lifetimes and all three owned coordinator/observer lifetimes. The supervisor completed naturally. All 47 current compiled source pins and the sealed candidates remain intact. No production source, calibration or installed baseline change was needed after this retest.

Independent source/frame, camera, startup/ownership and restoration reviews found no scoped blocker to presenting a short audible trial. Their limits remain part of the [sanitised result](../evidence/playable-15-stage-a-live-02.json). The next step is the [existing corrected Stage B audible candidate](PLAYABLE_15_STAGE_B_PROPOSAL.md), under separate explicit approval including the chosen recording scope. There is no further passive milestone proposed merely to rename the retirement branch.
