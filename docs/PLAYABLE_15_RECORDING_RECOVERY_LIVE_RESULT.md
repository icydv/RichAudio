# PLAYABLE-15: my second live Bati demonstration

On 2 November 2026, I approved and participated in one recording-recovery Bati session in GTA V Enhanced. Codex reverified the exact sealed candidate and approval prerequisites, performed one temporary deployment and one launch, issued one AudioOn and one Start, and independently checked the closed files and restoration. I completed the camera transition, dismounted and exited GTA normally.

**Continuous recording recovery passed. Software timing is now partly located. Total audible latency and a natural engine shutdown remain unresolved. Exact restoration passed.** The first-packet discontinuity remained visible without ending capture; both lossless files retained approximately 33 seconds. My feedback was that delay was still noticeable, the sound stopped with a binary OFF after dismount, and the bike sound itself was brilliant. I could not confidently say whether delay had improved.

The first audible milestone remains preserved in [the original Stage B result](PLAYABLE_15_STAGE_B_RESULT.md). This run used the unchanged [recording-recovery proposal](PLAYABLE_15_RECORDING_RECOVERY_PROPOSAL.md); its approval is now consumed. [Sanitized evidence](../evidence/playable-15-recording-recovery-live-01.json) binds the private receipts and independent reviews. No additional launch, retry or implementation change followed.

## Exact admission and authority

The runtime implementation remained `fc6559e6fcd254cd3e9b2b9f72e6049ac9beb9de`. Codex fetched and inspected the subsequent documentation commits through `19d372516ad79510020063f6889a63a86e7d9faa`: 42 documentation/guidance files changed, with no runtime source, package or sealed proposal change. The new first-person guidance explicitly preserves immutable approval artifacts. Codex fast-forwarded those documentation updates and rechecked all bindings before proceeding.

Independent preflight verified all 133 package bindings, 34 host sources, 48 audible and 47 passive RPH source pins, four native inputs, six component receipts, all five supervision helpers and their transitive references. All 11 original protected files and four settings matched; 32 owned paths and the relevant processes were absent. The original stock-fallback/F10 preferences and both disabled global production flags were preserved. There was no unexpected artifact drift, regeneration, substitution or repinning.

| Exact selected artifact | SHA-256 |
| --- | --- |
| Proposal | `11d6dab69ed6d5cfa44b68f1e2a7001bc48c0ca371b62e86495dd712050a3ddf` |
| Candidate02 receipt | `fbd3b8a03601fa6aada0966dfd7e993b291142b48b220d0410b58518e6a5afc3` |
| Build03 receipt | `2c13ab8fffd84e58b35f70071f06c82bb85da2d74f3d6c845890aef39cdc0156` |
| Coordinator03 prepared receipt | `3f4664ad7571aab172bfff41e769052292ef78b6badf51ac7eabb836d68475a0` |
| Fresh approval receipt | `669069225ec382c4b7a16b56b86c15818e5c2f0b487cc3d42f9d0a2362759e23` |
| Package manifest | `68217b8b15a24f1ad395a39ed3a29938ffd579e6e2fecf082bf8f1c2a1ea52cb` |
| Corrected host, 324096 bytes | `ebdf8df6563bb38480bfd84484247886f63ac3ac395c36ea08bd874eb26f6988` |
| Unchanged audible DLL, 387584 bytes | `a474df2201b6aa3a370029af479c4f4f62ad6958dfd4f72c7cb8420e2ec7ec5e` |
| Unchanged native producer, 129024 bytes | `05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40` |
| Selected recording/loopback 24-field template | `b0cae2ea47c0d5609ecd9aabee3617d0785fe0b3a90687e9e7f6d8977d127ffa` |

My approval selected final RichAudio PCM and the selected output endpoint's full WASAPI loopback mix. The fresh process-bound lease had both recording flags true at initial load. The loopback includes stock GTA and potentially other endpoint audio. No microphone, additional live stems, source assets, DSP, gains, calibration, source mapping, expiry or buffers were changed. Proprietary source material and recordings stayed private and outside the game installation.

## Actual session and completed ending

Steam's startup logs confirmed acceptance of the existing RPH launch arguments and process creation. The independent startup observer found the exact new Enhanced lifetime within the 120-second startup limit; Codex then published its fresh process-bound lease. The game reached current-session READY. I replied ready while seated on the engine-running Bati, which Codex also observed before arming. AudioOn acknowledged `enable=True` while waiting for fresh state.

| RPH wall-clock event, UTC on 2 November | Actual observation |
| --- | --- |
| AudioOn acknowledged | 00:08:57.864 |
| One Start armed | 00:09:22.131 |
| ACTIVE | 00:09:22.291 |
| Source scope stopped | 00:09:55.879; 33.588 seconds after ACTIVE |
| Joined retirement logged | 00:09:56.920; 1.041 seconds after scope stop |

The console-close input call returned 83.0382 ms after the Start Enter call returned. These are computer-use API timings, not exact game processing or audio response measurements. A trainer menu was visible during the console-closing transition; this observation is retained. No settings changes were made through it.

The recorded retirement reason was `rph-model-or-running-scope-lost`. I confirmed dismounting. The last complete native observation still retained running state, and rejected RPH decision operands do not establish direct driver-loss causality. That limitation remains open. The independent observer requested ending on the terminal state at about 33.55 seconds from its own ACTIVE observation, before its 45-second bound; Codex issued no explicit Stop command because retirement had already completed. The observer's elapsed-since-ACTIVE field continues increasing after terminal and must not be mistaken for active playback duration.

Original bounds remained 120 active seconds, 2400 attempts, 20 Hz and 250 ms source expiry. Raw native/wire bits, identity and original expiry lineage passed independent review. There were 582 native observation pairs plus one terminal record, and 580 published frames; two native observations were withheld for camera-generation baselines. The published operating state had 523 distinct values spanning approximately 0.2-1.0. These remain normalized operating values, not calibrated physical RPM.

The trace retained camera generations 1, 2 and 3. I confirmed completing the third-/first-person transition and said it worked. Codex did not perform a remount replay test. No later source publication, second Start, host recovery or orphaned worker was observed after retirement.

The host reported completed fade reserve, output stopped and MMCSS reverted. Host QPC places output stop 886.6667 ms after the RPH retirement event and 676.4024 ms after the host fade request. The final ring snapshot retained 2752 generated frames; the stopped host and Node lifetimes were independently absent, so this is not a claim that every generated frame was submitted. Submitted audio and consumed frames both totaled 1594176.

## Recording recovery and waveform findings

| Closed capture evidence | Result |
| --- | --- |
| Final RichAudio PCM | 1594176 frames / 33.212 seconds, 48 kHz stereo Float32 |
| Selected-endpoint loopback | 1593120 frames / 33.190 seconds, exact endpoint mix format |
| Owned submission rows / loopback packets | 3320 / 3319; contiguous frame and payload association |
| Retained capture completeness | Both streams complete; all five final-manifest files pass length/SHA verification |
| First loopback packet | Flag 1, valid timestamp; startup discontinuity and unknown initial loss explicitly retained |
| Later discontinuities, timestamp errors, device gaps/regressions | Zero in retained packet evidence |
| Playback underflow | Zero reported frames |
| Owned WAV peak / RMS | 0.1677011997 / 0.03202727856; agrees with host aggregates |
| Nonfinite / over-full-scale samples | Zero independently measured in both WAVs |
| All-block worker deadlines | One miss; maximum processing 35.7461 ms |

Each WAV matches its own index and final-manifest frame total; the owned PCM total also matches the host submitted/consumed counters. The existing offline bit-exact tap regression remains relevant; the live output was not separately captured twice to prove independent sample-for-sample equality. The 22 ms difference between file lengths is capture coverage, not a measured latency. `complete=true` describes finalized retained capture streams. Unknown initial samples, full-session prefix coverage and synchronization remain explicit limitations.

The owned WAV contains a 213.33 ms thresholded near-silent prefix, two internal near-silent intervals of **89.604 ms** and **100.729 ms**, and a 676.38 ms near-silent tail. The analyser's threshold requires both channels at or below absolute 1e-6 for at least 20 ms. These are recorded PCM findings, not physical silence or automatic capture-dropout diagnoses. The two internal windows follow the two camera-generation changes. At least one sampled block in each interval has no selected source brackets; source brackets subsequently resume while the vehicle generation remains unchanged. Packet continuity and underflow counters remain healthy. Uninterrupted audible camera behavior is therefore not established by the counters or my general report that the transition worked.

My ending feedback was a **binary OFF**, rather than the bike sounding as though it was shutting down. Independent examination also found rapid final decay to zero followed by quiet submitted PCM. Completed software fade/drain does not establish a natural engine-rundown sound. This quality issue remains open; Codex made no compensating sound change.

One host receive/connection I/O rejection remains unclassified because its exception details and time were not retained. There were zero expired host snapshots. Node emitted 390 sampled timing rows; 389 were retained and one was rejected. The missing sample is producer frame 0, but its exact rejection reason is unrecorded. Host snapshots, coalesced controls, recorder events and producer acceptance have different scopes: 570 received snapshots, 10 superseded snapshots, 560 retained control rows, 559 receiver-frame rows and 559 accepted worker observations. No missing timing row is fabricated or relabeled as an audio packet gap.

## What the timing now establishes

The unchanged analyser rejected a clock-qualified PCM/loopback offset because independent retained windows did not confirm one stable waveform offset. Envelope/amplitude-response candidates retain their candidate-only status. They do not establish response latency, and no offset is selected to force agreement with my listening estimate.

| Measured stage or lineage age | Actual result | Scope |
| --- | --- | --- |
| Mapped native acquisition to recorded host receipt | Median interval 14.929-14.956 ms | Original native-to-RPH mapping bounds retained |
| RPH publication to recorded host receipt | Median 0.611 ms | Host QPC lineage |
| Host control queue | Median 0.241 ms; mean 0.312 ms; maximum 32.170 ms | 560 retained deliveries |
| Sampled Node processing | Mean 2.844 ms; sampled maximum 8.380 ms | 389 sampled blocks; all-block maximum is 35.7461 ms |
| PCM pipe read | Mean 11.051 ms; maximum 55.136 ms | Includes waiting for production; not pure transfer cost |
| Ring admission to first overlapping submission preparation | Mean 62.695 ms; median 63.274 ms; range 34.713-76.577 ms | Preparation follows ring consumption; a conservative first-consumption bound |
| Older selected native interpolation endpoint at submission | Median age interval 203.892-203.921 ms, 377 samples | Age of source observations used in generated blocks |
| Newer selected native interpolation endpoint at submission | Median age interval 146.043-146.076 ms, 376 samples | Separate endpoint statistic; not one response-time interval |

The ring interval is **already included** in the selected-native observation ages. These values must not be added again. The observation ages locate a substantial software component before endpoint output, but do not identify the physical throttle-change instant or exact audible onset. Source synthesis, interpolation and causal propagation can further distinguish an observation's use from a perceptible change.

Native mapping interval width reached 1.2416 ms. Node/host exchange bound half-width had median 0.167 ms and maximum 10.788 ms. A diagnostic label also needs care: `observationAgeAtWriteMs` was sampled before encoding; recomputing from the original pose tick and actual write-before QPC gives median approximately 0.862 ms and maximum 32.751 ms, rather than interpreting its reported maximum 26.495 ms as the final write boundary. The original rows remain unchanged. These pose times are distinct from native operating acquisition.

The configured 100 ms retrospective control delay, 85.3333 ms startup reserve and actual 22 ms endpoint buffer remain unchanged. They are not an additive measured total. Absolute PCM-to-loopback alignment, physical speaker latency, input-to-ear response and a numerical improvement over the first run remain unestablished.

## Analysis, preservation and restoration

The first file-only analyser invocation rejected an output directory under the outer repository because the packaged analyser resolves its allowed private root to the package. It created no analysis output. Codex retained that exact failed invocation, then ran the same package-pinned Node/analyser with output inside the package's permitted private root. The analysis completed, producing numeric results and four private waveform/spectrogram SVGs. No code, candidate, capture bytes, acceptance condition, endpoint or live attempt was changed or repeated.

All seven capture/request files remain intact. Codex additionally preserved 15 closed private files totaling 31926034 bytes: the seven capture files, three handoff files, stopped host status and four game logs. A separate reviewer rehashed every original and copy. No proprietary audio or raw session identifiers are published here.

I confirmed normal game exit. Codex waited for the exact game/RPH/host/Node lifetimes to be absent, then ran the sealed ownership-based rollback and verification once. A separate review passed **379 hash/length checks**: all 11 protected files and four settings, the original 222208-byte plugin, unchanged candidate/source/package/helper artifacts, 32 absent owned paths and eight absent owned PIDs. The observer finished normally with no reported failure. Stock-fallback/F10 and both disabled production flags remain intact. Captures were retained; no recursive deletion or hot replacement occurred.

Historical journal fields still label this route passive and initially report `humanListeningApproved=false`. The fresh audible lease, exact DLL, real nonfixture host/endpoint and this separately recorded feedback establish the approved execution and my later listening report. Original contradictory metadata was preserved.

This is a successful recording-recovery demonstration and a partial response-quality result. My next priorities are an offline review of the measured queuing/retrospective selection, camera-related quiet intervals and abrupt retirement envelope. No tuning or implementation is included in this result. Another live attempt requires its own exact reviewed proposal and fresh approval. PR #76 remains draft and unmerged.
