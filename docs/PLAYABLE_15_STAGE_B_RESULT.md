# PLAYABLE-15 Stage B: I heard my first live Bati audio; recording incomplete

I heard actual RichAudio output in GTA V Enhanced during my single approved Stage B attempt on 1 November 2026. The unchanged engine/exhaust source chain produced nonzero output through the selected WASAPI endpoint, with changing genuine Bati telemetry. I thought the sound was good, apart from noticeable latency that I estimated at **250–500 ms**. This is a subjective estimate, not an independently measured response delay.

**The complete Stage B acceptance is not established.** Recording failed at startup, leaving only a silent 32 ms RichAudio fragment and 10 ms of endpoint loopback. I did not perform the camera-mode change. Permanent retirement, completed audio shutdown and exact restoration passed; direct driver-loss causality and subjective silence after dismount remain unproved. There was no retry, second launch or source modification. PR #76 remains draft and unmerged.

See [the approved proposal](PLAYABLE_15_STAGE_B_PROPOSAL.md), [sanitised evidence](../evidence/playable-15-stage-b-live-01.json) and [the preceding scoped Stage A pass](PLAYABLE_15_STAGE_A_RETEST_RESULT.md).

## Exact authority and preserved artifacts

I explicitly approved Option 1, listening plus final RichAudio PCM and selected-endpoint loopback, under proposal commit `b4ccba6b2910ab67bc5efb204d67a2f192135dea`. The local authorization receipt is `125793700e513e42c81cb6785364f6988a8287e7995ae56a5f2cbcfca26d1beb`. It binds the candidate receipt `a9449e06172e53167a2a3c9bc9da22c2b4aa3b21e29d6e157f1c3857d8e0a5e3`, proposal `ae26ca96be4999c875f1b12264234518c07f41ee99b7d0824248499f8b5d135e`, scoped-b-01 revision-2 prepared receipt `0d72f4c34f6eb2320f377991aa00585aff29ca7cf96fa3ea1d474e430698feaf`, exact manifests and recording-enabled 24-field template `1b041ef77627a8cab1ff90f1c061d10e71113e48de7afbff2741444dd3b7b63b`.

| Actual artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Audible managed DLL | 387,584 | `a474df2201b6aa3a370029af479c4f4f62ad6958dfd4f72c7cb8420e2ec7ec5e` |
| Native SHV producer | 129,024 | `05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40` |
| Private Bati package pointer | 228 | `fafda57aa87a277b670d4a2fa796b85c38062a1158fb220f18986e299cd00387` |
| WASAPI host | 306,176 | `5c64559983b81a19b0c66c7f01fb19a3b584eef30a9980ed6ef2296b5b611f42` |

All 132 package bindings, 48 audible source pins, native inputs and five coordinator helpers were reverified. The existing DSP, original Bati assets, 10:1 exhaust pressure reference, 0.25 common trim, 0.175 master gain, mapping and expiry were preserved. Stock GTA audio stayed active; there was no microphone capture or additional live stem integration. Both recording permissions were true at initial lease load and were not changed.

## Observed session and output

One exact installation and one reviewed Enhanced/RPH route invocation occurred. Steam Action 18 accepted the arguments and completed process creation. The exact new Enhanced lifetime began at 22:47:25.9321251 UTC; its fresh lease was installed at 22:47:26.0182730. Current-session READY was 22:48:14.234. Startup and waiting remained inside their original bounds.

AudioOn was acknowledged at 22:49:16.775 with `enable=True`, waiting for fresh accepted state. One Start armed at 22:49:27.605; ACTIVE followed at 22:49:27.758. The console-close input returned 82.6934 ms after the Start Enter call returned, or 187.9001 ms after that call began. These are input timings, not proof of exact game processing latency. A trainer menu was visible after console closure; retain that observation rather than claiming all menus stayed closed.

| Closed actual evidence | Result |
| --- | ---: |
| Completed native returns / final observations | 490 / 490 |
| Raw rows including terminal sequence 490 | 981 |
| Accepted / published frames | 490 / 490 |
| Distinct normalized operating values | 401 |
| Operating range | 0.20000000298023224–0.8445644378662109 |
| Completed native-return span | 28.2326404 s |
| Minimum / maximum return spacing | 50.1557 / 91.2908 ms |
| Distinct listener / vehicle positions | 448 / 388 |
| Maximum endpoint skew / mapped interval width | 24.1204 / 0.6513 ms |
| Actual submitted / consumed output frames | 1,335,936 / 1,335,936 |
| Submitted frame duration at 48 kHz | 27.832 s |
| Engine / exhaust / stereo nonzero blocks | 2,540 / 2,540 / 2,540 |
| Host submitted peak / RMS | 0.0590708256 / 0.0160501746 |
| Host underflow frames / renderer limited samples | 0 / 0 |
| Worker deadline misses / maximum processing | 2 / 34.5746 ms |

The worker status field `clippedSamples=0` is a literal placeholder, so no independently measured full-session clipping count is claimed. The measured submitted peak was below unity. The independent closed-file review checks exact raw float32/scalar/sequence, identity, SHV/RPH clock and original-expiry lineage for all 490 publications. No freshness, velocity or expiry bound was widened. Continuous listener velocities reconstruct with zero error from consecutive camera acquisitions; the initial unavailable velocity remains unavailable. Spatial generation remained 1, with **no cuts or recoveries exercised in this audible run**. The prior six Stage A recoveries remain passive evidence and are not relabelled as live audible camera-cut proof. A native Begin export-entry counter was not independently retained.

The host confirms real, nonfixture endpoint opening and output start, a single Bati source with two emitters, nonzero engine/exhaust/acoustic output and no output/worker error. These are host observations, not a recovered full-session WAV, physical speaker timing, geometry validation or a 60 FPS/deadline-free claim. Shared output was 48 kHz Float32 stereo. The render route remained conditional direct sound without observed collision coverage.

## Retirement and completed drain

Actual scope stop was 22:49:56.064, **28.306 seconds after ACTIVE**, slightly shorter than the planned 30–45-second listening target. The recorded reason was `rph-model-or-running-scope-lost`. Root observed me standing off the Bati. The last native bracket still showed a running player-driven Bati, and rejected RPH operands were not retained; direct driver-loss causality is still unproved.

The first root running-host inspection already showed recorder failure at observer ACTIVE elapsed 17.8518 seconds. Root opened the console to end the attempt, but retirement had already occurred by the subsequent console/log inspection; **no Stop command was submitted**. No later publication, second AudioOn/Start, restart or launch occurred. Remount replay was not tested.

Playback shutdown joined at 22:49:56.993, **929 ms after scope stop**. Final retirement at 22:49:56.994 independently confirms writer join, no writer worker, completed native callback/FIFO and zero queued audit rows. The host ended with `fadeReserveConsumed=true`, output stopped, MMCSS reverted, zero active sources and one retired source. Its owned host and Node lifetimes were absent before rollback. This establishes completed software output/fade drain and process shutdown; it does not measure instantaneous acoustic silence. The last original source lease still had 191.8042 ms remaining at clear, so recorded scope loss, rather than expiry, caused retirement.

No 45-second observer stop was needed. The unchanged 120-second intrinsic, 2,400-attempt, 20 Hz and 250 ms expiry bounds remained in force. The independent observer ended normally without failure; no OS/native preemption is claimed.

## Recording failure and actual file analysis

The existing analyzer ran once against the closed, hash-verified capture using the proposal's direct route. All seven finalized capture/request files were retained privately and their lengths and hashes matched. `session.json` and analyzer output correctly retain `complete=false`.

| Retained signal | Actual content |
| --- | --- |
| Final RichAudio WAV | 1,536 frames, 32 ms at 48 kHz stereo; all samples zero; SHA-256 `74bf9e362457b95e4b032005ec768ee9d8c1d9e7d6b4ad59ec56c830a17b76f9` |
| Endpoint loopback WAV | 480 frames, 10 ms; nonzero selected-endpoint mix; SHA-256 `168f43f7216daa3229f56970f3c5a02698332615445189496098dc9d43151e57` |
| Loopback index | One packet, flags 1, `timestampValid=true`, no prior device-frame history |
| Recording outcome | `loopback-discontinuity-or-timestamp-error` |

The captured trigger is the first packet's discontinuity flag, not a captured timestamp-error flag. The unchanged recorder's `(packet.Flags & 5) != 0` branch faults on that packet and ends recording admissions. No later audible RichAudio samples were retained. Playback continued independently until normal source retirement. The combined error string must not be described as proof of a timestamp error or persistent endpoint-output failure.

The analyzer produced private waveform and spectrogram SVGs and numeric results. The owned fragment is silent and the loopback is only 10 ms of the full endpoint mix, including stock GTA and potentially other application audio. These fragments cannot support full-session harmonic, engine/exhaust balance, stereo phase/correlation, loudness, camera-transition or response-latency conclusions. No missing sound was reconstructed, and no loopback content was attributed solely to RichAudio. Existing offline source/stem comparisons in [the audio review](PLAYABLE_15_AUDIO_REVIEW.md) remain available and unchanged.

## My listening feedback and evidence limits

I spontaneously said **“IT WORKED I HEARD IT”**, then described the sound as good apart from noticeable latency that I estimated at 250–500 ms. I confirmed revving and gentle driving, and explicitly stated that I did not change camera mode. Subjective fade/stop on dismount was not explicitly confirmed. No numerical counter replaces that missing feedback.

The retained host configuration includes 100 ms control delay, 85.3333 ms producer startup reserve and a 22 ms endpoint buffer. These are separate pipeline facts, not a measured additive end-to-end latency or an explanation established by this failed capture. No gain, buffer, renderer or calibration was changed. A complete synchronized recording is required to locate the perceived delay before tuning.

Some journal gameplay-frame/summary fields and caller messages still contain hardcoded passive labels (`passiveOnly=true`, `audioPlaybackAllowed=false`, “passive handoff”). The actual session record and process-bound 24-field audible lease, exact audible DLL and real opened/started host establish the authorized audible execution. The original contradictory labels are preserved and reported as a diagnostic metadata defect; they were not silently corrected. Host/recorder `humanListeningApproved=false` is also initial qualification metadata, not a later collection of my direct listening report. The retained PLAYABLE-13 host/recorder protocol is intentional, as documented in the proposal.

## Restoration and independent review

I reported exiting GTA normally. Exact owned game/RPH/host/Node process absence preceded ownership-verified rollback at 22:51:56.433. Root verification passed at 22:52:00.434; a separate 315-check review rehashed all 11 protected files and four settings, the original 222,208-byte plugin, stock-fallback/F10, both false production flags, 32 absent owned paths and owned launch/supervisor lifetimes. All sealed candidate/source/package bindings remain unchanged. Closed original/copied evidence matches. No forced GTA/RPH termination, numeric game exit-code, recursive deletion or capture removal was established by the retained evidence. The exact owned Node exit mechanism was not independently observed; normal host cleanup supports job/process termination.

Private independent review digests:

- Telemetry/lifecycle: `c98508d0bb07a5e251bd4466cfc1bb734df4bab705532068a9ea864cf9177af2`.
- Later owner-feedback supplement: `8a46c9f105d2db36fc3880781c8f10ead771ab49b49b89a0645806168933291b`.
- Audio/capture: `70587a160f009ab4fa246647760c60b349c4424118f97754e8ad723aedccace5`.
- Restoration: `d7f4a405ad8c785d45d82dba107795a2aff7de4852aa57842f62512a568280e8`.

The next focused work should review first-packet recorder handling and obtain a complete synchronized capture to locate latency, then perform evidence-based sound tuning. Any source change requires a newly reviewed build; any deployment, playback, recording or retry needs fresh explicit authorization. This result authorizes none of those actions.