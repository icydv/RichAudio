# PLAYABLE-15: controlled listener recovery and prepared Bati audio

**Offline correction and integrated candidate: PASS. Corrected live listener behaviour and in-game audibility: pending separate approval.** Continued from `25fdfadd77784f2d600508c9c650ccc1f33fe0af`; no deployment, game launch, audio endpoint access or recording occurred. PR #76 remains draft.

The [attempt 5 result](PLAYABLE_14_RETEST_05_RESULT.md) still establishes genuine changing SHV engine state and valid RPH spatial frames. Its exception identifies the old position-difference speed guard. The rejected camera operands were absent, so dismount, camera mode, focus and timing remain unproved causes. This work does not reopen that handoff architecture or reinterpret the missing observation.

## Failure reproduced and policy corrected

The offline fixture extracts and compiles the **actual original `Listener()` method** from the starting commit. A controlled 20-native-unit camera jump over 60 ms reproduces `listener-discontinuous`. This establishes that the policy can terminate otherwise valid source state on a presentation-camera cut; it does not reconstruct the last live failure.

The new PLAYABLE-15 entry uses the actual `CameraSampler` cache and a small `CameraListenerTracker`. The existing 100-native-unit/s threshold remains a continuity boundary, rather than an unconditional terminal session failure. A finite, orthonormal, unpaused camera observation with valid acquisition timing that crosses this boundary is consumed privately, advances listener generation and is **not journalled as a gameplay frame or sent to playback**. Near-inverted orientation and game-clock rollback similarly declare a spatial boundary. An unchanged cached observation cannot resume publication. A later independently acquired camera observation must form a valid continuous difference within the new generation.

The private discarded baseline passes the existing adapter before its source sequence is consumed. Every original raw-float, source/peer identity, 250 ms freshness, 50 ms skew and absolute-expiry check remains active. No continuous velocity across the jump is published. Initial velocity has `unavailable` provenance; the first post-cut published velocity is measured only against the cut's original acquisition. Invalid numeric/basis values, changed observations at an identical time, intervals below 1 ms, reversed time, gaps above 250 ms, pause/scope loss and source failures remain terminal. No threshold or lease was widened.

Recovery is deliberately bounded: the next valid publication must also reach the audible session **before its previous original accepted-state expiry**. A slow or repeated transition can still retire audio permanently. Skipping a cut does not renew the old source lease, replay its source observation or guarantee uninterrupted sound. Existing queued PCM and bounded release can finish; instantaneous physical silence is not promised.

## Actual operands and ownership

Immediately before terminal rejection or controlled discard, one compact private `listener-rejection` event retains the exact previous/current camera position, acquisition before/after/midpoint and Unix timestamps, game time, pause state, calculated dt, delta, velocity and squared speed, listener sequence/generation, original source raw bits/operating point/map/expiry, source peer, and pre/post-camera relationship observations. Call ordering is distinguished from original cached acquisition ordering. Nonfinite operands remain explicit parseable strings. Journal admission failure is terminal (`listener-diagnostic-write-failed`), and existing journal health/drain/completion evidence remains required. Ordinary cached reads do not emit rejection records.

The retained RPH owner is qualified before and after the camera call. A driver/lifetime failure already observed by Poll, or at either camera bracket, retains its concrete reason before camera motion processing can obscure it. Dismount permanently retires the source; remount cannot revive it. This cannot make several game getters atomic, so later unobserved relationship changes still depend on the next poll/expiry. Private identities, addresses, captures and sound remain excluded from Git.

## Spatial and audible integration

Listener generation already resets listener interpolation and causal propagation/Doppler history and advances the renderer's spatial PCM epoch. The one discovered integration defect was retained **vehicle-pose snapshots** in `StockGameplay`; these now clear when the accepted listener generation changes. Vehicle ownership/generation remains unchanged. The focused renderer test verifies no old PCM reappears after the existing 20 ms release and no weighted-history fault.

Both new managed profiles carry the accepted PLAYABLE-14 fresh-context binding correction and PLAYABLE-15 listener policy. The audible profile also carries the existing Bati session, RA07/PCM transport, owned WASAPI host and optional recording hooks. The passive image contains no Bati playback type. The host, recorder, source banks, six genuine player Bati PCM files and calibration are reused unchanged; only the existing gameplay JavaScript binding changes in the private package. Its `demoProfile=PLAYABLE-13` remains the established host protocol, while the strict process-bound handoff lease is `PLAYABLE-15` (21 passive / 24 audible fields).

The Bati-only package preserves 10:1 exhaust pressure, 0.25 common source trim and 0.175 master gain. GTA stock sound, saved stock-fallback/F10, gold-menu source and both disabled production feature flags are preserved. This is additive first-demo audio, with the existing conditional direct-acoustics/native-scale assumptions.

## Focused verification

| Check | Result and boundary |
| --- | --- |
| Actual old/current camera and retained RPH sampler | 11 cases / 37 assertions: reproduced old failure; continuous motion, rotation, measured cuts, cache, fresh recovery, invalid timing/numbers/pause, exact diagnostics, visible diagnostic failure, dismount/no resurrection. Fake SDK/native responses; no GTA. |
| Actual frame adapter | 15 cases / 74 assertions, including privately consumed cut source and preserved expiry/skew gates. Authored owned candidates. |
| Existing fresh binding/native producer | Seven focused cases / 624 assertions: normal/resume, wrong identity, expired map, stale source, peer skew and journal failure. Actual unchanged producer; fake SHV and RPH observations. |
| Existing bounded journal/bootstrap | Eight cases / 67 assertions; actual private writer/codec and fixture-process lease. |
| Listener, streaming and spatial generation | 64 tests pass, including the two new generation/history cases. Device-free renderer. |
| Actual Bati production chain and shutdown | 55 checks against the final private package. Nonzero engine/exhaust/stereo; enable/disable, expiry, fault/no retry, deliberate driver-loss retirement, remount denial and clean host shutdown. Device-free sink. |
| Driver-loss sink specifically | 31,489 trailing exact-zero frames; final peak/energy zero; fade reserve consumed; zero underflow; no host restart. Controlled retirement reason, not live dismount proof. |
| Existing recording/finalizer hooks | 64 assertions plus five findings controls; finalized lossless files, plots and automatic analysis with fake loopback. No endpoint or live recording. |
| Exact compiled integration | Both source manifests and images checked, fresh binding and tracker/two ownership brackets integrated, legacy ratio/provenance absent, Bati lifecycle in audible image only. Static inspection, not RPH execution. |

The production-chain fixture still records processing deadline misses (maximum measured work 30.0499 ms). There is no deadline-free, device-latency, 60 FPS or subjective-quality claim. The original expiry remains strict.

The first build is retained as superseded because final diagnostic refinements changed its source pins. The final build is `.local/playable-15/build-final`, candidate `.local/playable-15/candidate-final`. Earlier fixture-authoring/validation-script errors were corrected; only the final passing exact receipts are selected. Full private receipts remain local; [sanitised offline evidence](../evidence/playable-15-offline.json) binds them and the independent reviews.

## Independently listenable genuine-trace sample

The optional render succeeded: **all 670 original gameplay frames**, in order and original timing, produced a private 39.658667-second 48 kHz stereo float32 WAV. Peak 0.0558993, RMS 0.0157166; no nonfinite/clipped/limited samples, missing history or interior exact-zero gap of at least 5 ms. The final source retires. No rejected camera observation or throttle data was invented. See [replay method, metrics and limitations](PLAYABLE_15_OFFLINE_REPLAY.md). Numerical analysis is not human listening or live GTA output.

The remaining action is the [exact separately approved live procedure](PLAYABLE_15_LIVE_PROPOSAL.md): corrected passive confirmation, then separately authorised Bati output and optional recording using the already prepared audible candidate.
