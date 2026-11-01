# PLAYABLE-14 attempt 5: changing Bati telemetry, then listener rejection

**Decision: BLOCKED — `listener-discontinuous`. Changing engine telemetry, vehicle/camera movement, recorded frame lineage and shutdown completion passed; permanent retirement on driver loss remains unverified. Restoration: PASS.** The separately approved [attempt 5 proposal](PLAYABLE_14_RETEST_05_PROPOSAL.md) at `4c395b4da8456679367e014bf17da781492b9bc5` used one deployment, one Enhanced/RPH route invocation and one operator Start. There was no retry, additional session/launch, RichAudio playback, endpoint access or recording.

| Exact payload | Bytes | SHA-256 |
| --- | ---: | --- |
| Passive `Plugins/RichAudio.dll` | 361,472 | `ba19342ce5ceac63d179943e22d324819a42a8c8294d7f15e436f3833e01be0f` |
| Native SHV producer | 129,024 | `05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40` |

The exact coordinator receipt remained `f94ea3cf3eba1dd1d0226a3eca4e7ca47a194ecbb8744da40d677d29b94a9bab`; authorization receipt `32c3c08cb864edc869f2b708c9c1ef626bbd955a6676ec0f90d7fba5f58ee3df`. Candidate, source, installation/rollback and strict 21-field lease pins were unchanged. Independent preflight and the exact coordinator preflight passed before deployment.

## What ran and what the capture establishes

Steam Action 15 recorded argument continuation at **20:30:51 UTC on 1 November 2026**, interstitial continuation at **20:30:52**, then CreatingProcess/Completed at **20:30:53**. The coordinator dispatched zero Continue clicks; their initiator was unobserved. The exact new Enhanced process began at **20:31:07.2842326**, **31.1206943 seconds** after the launch marker. Its kernel lifetime, current session, installed lease and immutable prelaunch log baseline matched. Independent supervision rejected prior retained state and admitted only the current profile entry at **20:31:52.184** and READY at **20:31:54.662**.

After owner readiness confirmation, the mounted Bati and closed trainer menus were observed before console opening. Start was submitted once. Enter returned at **20:32:53.695**, and the immediate F4-close input returned at **20:32:53.779**: **84 ms** later, **172 ms** after Enter dispatch began. These are input timestamps, not a substitute for observed plugin execution. The caller independently logged Start armed at **20:32:53.716** and ACTIVE at **20:32:53.868**. No further game input was sent by the coordinator.

The gate safely waited on genuinely old sequence **692**, with current maps and source age reaching **19,337.7313 ms**. It admitted fresh sequence **694** on attempt **3**, **145.752 ms** after arming, with one console-open wait. Mapped source age was **7.5918 ms**, peer skew **4.6418 ms**, and all retained ownership, original-timestamp, freshness, independent bracket and vehicle-correspondence checks passed. Neither the 250 ms freshness nor 50 ms skew limit changed.

Independent closed-capture analysis found **671 completed native returns, 671 matching final observations and one completed caller-stop terminal row**, producing **670 exact gameplay frames**. Source sequence 671 has no published frame because listener construction threw before serialization. The caller's `accepted=670, frames=670` counters describe completed frame publications; they are not the total native target-attempt count.

| Recorded result | Measurement |
| --- | --- |
| Distinct operating values | **417** |
| Raw/scalar operating range | **0.20000000298023224–0.9425421953201294** |
| Source vehicle speed range | **0–24.211889266967773**, retained native values |
| Distinct vehicle/listener positions | **395 / 603** |
| Native completed-return span | **38.6428359 seconds** |
| Minimum/maximum completed-return spacing | **55.1387 / 187.6288 ms** |
| Maximum endpoint skew / mapped interval width | **22.306 / 0.496 ms** |

All 670 recorded frames passed exact raw float32/scalar/sequence/clock and independent vehicle/pose/listener lineage checks. The completed terminal sequence, paired complete raw audit, callback completion and drained FIFO establish **671 total target native attempts** within the 2,400-attempt, 20 Hz and 120-second caps. No independent native BEGIN export-entry counter was recorded. These are genuine changing engine and spatial observations; no physical RPM calibration, audio output or audibility result is inferred.

The trainer Main Menu was visible after console closure and during a subsequent driving observation, despite being closed before Start. This operator-condition deviation is retained. The published listener frames were valid and unpaused; no continuous foreground/pause trace or causal connection between that overlay and the later rejection is established.

## The recurring listener failure

The caller stopped with `listener-discontinuous` at **20:33:32.543** and reported retirement/completion at **20:33:32.562**. The approved source identifies this exact branch: for consecutive camera observations with `0 < dt <= 0.25 seconds`, Listener divides position differences by the original observation-time difference and rejects when summed squared velocity exceeds **10,000**, equivalent to speed greater than **100 native-coordinate units/s**. A time gap above 250 ms instead has a different reason, `listener-time-discontinuous`. This rejection is position-derived; it is not the forward/up orientation check.

The final published listener was sequence **669**, valid/unpaused and stationary. Its predecessor **668**, **70.3569 ms** earlier, had the same position. Native observation **671** still had valid source pre/post brackets, current vehicle/driver/running flags and operating value 0.2. The exact rejected camera position, timestamp, `dt` and computed speed were **not retained**. The exception string plus unchanged compiled source identify the branch; they do not measure the rejected operands or prove why it fired.

Execution ordering narrows the investigation. Each Poll first validates independent RPH vehicle/driver observations and source correspondence. After the new current candidate is accepted, Listener samples the camera; its velocity check runs before assignment of the new predecessor and before frame serialization. Therefore a relationship/camera change between the earlier eligibility checks and camera acquisition could reject before a later ordinary driver-loss retirement is sampled. The failed frame's exact peer/camera operands are absent, so this remains a possible transition-ordering explanation, not an established cause.

The owner initially recalled dismounting uncertainly, then clarified: **“I know I did dismount, but I can't remember if I got back on.”** Both operator reports are preserved; a new supplement records the correction without editing the sealed earlier analysis. Human dismount is confirmed, while its time relative to retirement and any remount remain unknown. It does not establish driver-loss-triggered retirement, a camera snap or tab-out causality.

The preceding attempt's `source-silence-or-expiry` did not recur during this capture. The last published candidate still had approximately **178.828 ms** validity remaining at observed source-cleared cleanup. That is evidence against source expiry causing this rejection, not evidence that the unchanged producer's earlier progress failure is fixed.

The next focused diagnostic should retain the original previous/current camera positions and acquisition timestamps, `dt`, squared-speed operand, game-time/pause/generation state and the immediately preceding source/peer driver qualification before this rejection. Those missing operands are needed to distinguish a camera transition, legitimate rapid motion, timestamp/sampling effects or another discontinuity. Do not widen the speed/freshness gates, rewrite timestamps, fabricate continuity or propose another blind retest from the current evidence.

## Completion and restoration

Producer callback completion, completed native terminal sequence and FIFO drain/zero queue agree. The writer independently joined cleanly with **1,343/1,343 source rows**, **2,412 events**, zero dropped or pending consumed-audit rows, and no live writer worker. The summary alone does not prove caller join; the copied current-session caller line supplies that separate observation. Source-cleared means empty consumer control state, not a new empty gameplay frame.

The owner reported normal exit; exact game/RPH absence was verified before rollback. The original 222,208-byte plugin was restored by the exact ownership/hash/length procedure. After rollback/Verify, closed capture and log preservation, and the observer finish request, independent verification confirmed **all 11 protected files, four settings, 27 absent owned paths, saved stock fallback/F10, disabled production flags and all owned game/launcher/observer lifetimes absent**, with zero mismatches. No forced termination, hot unload, observed final quit dialog or independently measured numeric game exit code is claimed.

The preservation audit rehashed the prior attempt's 60 files, preflight-4 seals and correction chain, 3,138 prior private files, all 47 compiled source pins, four native source inputs, 132 audio-package bindings, the exact candidate and the four approved attempt-5 helpers. Original and copied captures matched. The restoration seal explicitly excludes newly generated analysis/review files; those are bound individually by their own final hashes, avoiding an implied seal of later revisions.

The initial derived analysis used an older capture-index key and retained its three reader-compatibility failures. It remains unchanged. A new version-2 analyzer strictly handles the actual `name`/`file` index forms and binds the UI receipt; its final integrity/frame review has zero failures. No capture, approved source or prior analysis was rewritten to obtain that result.

[Sanitised live evidence](../evidence/playable-14-live-05.json) and [restoration evidence](../evidence/playable-14-live-05-rollback.json) bind the startup, final handoff, listener diagnosis, corrected operator context and restoration reviews without publishing private addresses or runtime paths. No further launch is authorised or prepared as a blind retry. Full passive acceptance remains incomplete, so the conditional corrected audible candidate has not advanced; the existing host/assets/renderer/gains/optional recording chain remain preserved.
