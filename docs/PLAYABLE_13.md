# PLAYABLE-13: Bati playback prepared; live confirmation still required

The accepted SHV operating-state frame now has an explicitly enabled path into the existing Rockstar Bati source player, acoustic renderer, RA07 transport, PCM ring and Windows WASAPI host. Separate passive and audible managed builds are prepared privately. Optional synchronised recording can accompany the first audible session when its approval explicitly includes PCM and selected-endpoint loopback.

**Offline preparation: PASS. Live passive handoff: BLOCKED pending a new authorised launch. Audible demonstration and human listening: unverified.** This increment deployed nothing, launched no game, opened no audio endpoint and performed no listening. Nonzero fixture PCM is not an in-game success.

## Startup finding and next action

The previous PLAYABLE-12 attempt remains a consumed, blocked attempt with verified restoration. Its unchanged runtime logs are historical. The saved Steam trace for ActionID 10 reaches `ShowGameArgs` at 16:10:57 UTC but records no continuation, process creation or completion. In an earlier successful ActionID 9, the same route/arguments reached `ShowGameArgs`, continued, reached a separate `ShowInterstitials`, continued again and then created Enhanced. Rockstar's Steam-minmode bootstrap reroute/shutdown appears in both sequences. The inspected Windows Application interval contains no Application Error/WER event.

The last recorded boundary is therefore Steam confirmation. This does not establish why the attempted UI continuation failed, exclude a brief process missed by polling, or prove that RPH, the arguments or handoff code are defective. No binary, argument, game configuration or launch-route change is justified by the saved evidence. The minimal correction is to verify actual Steam continuation and any second interstitial during the next separately approved single launch.

`tools/Inspect-PlayableStartup.ps1` is a read-only, bounded observer for the launch marker, Steam transitions, exact process path/creation time and read errors. Only its historical `-SnapshotOnly` mode was run here. Live observation is to run alongside the existing coordinator, not replace its independent monotonic deadline. Raw launcher tails remain private; no runtime was downloaded or modified.

## Actual integration

The native producer, ABI, raw float32 sampling, measured clock map and independent SHV/RPH vehicle correspondence are unchanged. The existing adapter's accepted `GameplayFrame` now carries its original absolute source-expiry tick. Publisher, host and Node worker preserve that deadline instead of renewing engine state from a later listener observation.

The audible profile constructs `BatiPlaybackSession` only after the strict process/session lease and functional API admission succeed. It starts disabled. `RichAudioBatiAudioOn` is a separate deliberate action from `RichAudioHandoffStart`. The host checks enablement and a fresh, accepted, running player-Bati frame immediately before requesting output startup. The lease binds the exact private package pointer; the host rechecks package bindings. Its private startup permit is written, flushed and closed at a pending path before an atomic move makes it visible to the reader. The passive profile contains no `BatiPlaybackSession` type or entry calls.

An independent watchdog retires the session when accepted state expires, the provider retires or the owned runtime faults. A synchronous check also prevents a newer packet from concealing a completed previous expiry. No automatic host retry occurs in this profile. Explicit Off/On can start a new owned host while the same provider remains continuously valid; retirement cannot be reversed. Leaving the motorcycle, losing valid state or encountering unsupported engine-off context ends this one provider session.

Shutdown uses the existing renderer's fade, with a scoped 650–1,500 ms drain allowance for already queued PCM. No source, gain or fade equation changed. RPH cleanup yields cooperatively while waiting for owned workers; it does not block the game fiber for the full join deadline. Legacy gameplay behaviour retains its existing startup, retry and 120 ms shutdown policy.

WASAPI initialisation is asynchronous. Fresh admission before the startup request is not an atomic guarantee that the physical endpoint activates before expiry. Receiver/Node/watchdog checks continue, the existing readiness wait is bounded at five seconds and owned teardown follows. Already buffered/fading audio can remain after source retirement; these checks do not promise instantaneous silence or preempt a stuck COM/OS call. The read-only cross-framework identity proof retains its documented full counter-wrap/address-reuse limitation.

Functional compatibility remains the policy. Neither profile references `EngineRevolutionsRatio` or the historical distribution-provenance gate in the compiled scoped path. Existing typed contracts, owner/session, game/SHV/loader/caller/producer pins, fixed ABI and data validation remain. There is no physical RPM conversion or new telemetry framework.

## Sources, rendering and controls preserved

The private retained package's 132 payload bindings plus manifest were verified before copying. The Bati uses the existing player engine/exhaust idle, acceleration and deceleration material from `v_twin_2.awc`, granular sound `0346A636`; its six 48 kHz PCM files retain their exact hashes. The authored calibration, source gain, pressure shares, histories, camera-relative direction, distance, Doppler, propagation and CPU/GPU paths are unchanged. Exhaust/engine pressure reference remains 10×, common trim 0.25, and product master 0.175. WASAPI volume stays 1 to avoid applying that trim twice.

GTA stock audio stays active. The demo uses additive playback and isolated private package settings. My saved `stock-fallback`, shortcuts and gold menu source are untouched. This scoped first-demo entry uses console controls and does not initialise the gold menu, SoundMap or general recording workers. Both production feature flags remain false; modification-aware loudness is preserved and inactive.

The source registry has nine player mappings from four banks: Bati/Bati2, Lectro, Prototipo, Schafter3/4/5/6 and Thrust. NPC material currently covers Bati. This candidate admits only a running player Bati on Enhanced 1.0.1158.16; it does not qualify those other models or traffic. The current renderer budget is two vehicles/four emitters. After the first audible result, expand telemetry-qualified mappings and traffic capacity, then modification-aware balancing. Unsupported vehicles retain stock GTA audio.

## Focused evidence

| Check | Actual result and limit |
| --- | --- |
| Accepted-frame adapter | 14 cases / 64 assertions; original source expiry reaches the gameplay frame. Fake peer/observation inputs, no GTA. |
| Node gameplay/source suite | Seven tests passed, including source-expiry independent of listener/playout, real Bati PCM and all existing source mappings. Device-free. |
| Bati session and production chain | 42 checks: explicit enable, correct model/session, expiry, permanent retirement, Off/On, fault without automatic restart, saved preferences unchanged, genuine sources through renderer/RA07/ring. |
| First enabled final-candidate snapshot | Engine 36 nonzero blocks, peak 0.43751; exhaust 36, peak 0.78081; stereo 34, peak 0.072764. Ring 24,000 frames, energy 14.37474, zero underflow. Injected valid observations and a device-free sink. |
| Actual shutdown sink | Disable ends with 29,953 consecutive exact-zero frames; complete feed loss ends with 30,849. Last-buffer peak/energy zero and fade reserve consumed in both; zero underflow. Independent expiry observed 47.4195 ms after the original deadline, including fixture polling/scheduling. These are fixture timings, not a hard 20 ms or live scheduling guarantee. |
| Processing limits | Each final Bati host records one processing deadline miss; maximum measured block work spans 26.28–32.43 ms. Clipping, limiting, missing history and ring underflow remain zero. No deadline-free or 60 FPS claim is made. |
| Legacy gameplay regression | Unchanged canonical 71-check test passed using the earlier build03 host/current DSP and legacy metadata. It records three processing deadline misses. The later runtime change is confined to demo-only atomic permit publication; this is not an exact final-build legacy rerun. |
| Recording integration | 64 assertions, five findings controls and automatic analyzer/finalizer; actual existing post-gain tap/WAV lifecycle with fake loopback. Existing recording regression: 105 assertions plus 17 analysis controls, before the final demo-only startup fix; recording production code is unchanged. No endpoint or listening. |
| Compiled profiles | Exact images inspected: zero legacy engine-ratio references/provenance types in either scoped build; passive contains no Bati playback type/calls. Static inspection does not execute RPH. |
| Preservation | All 11 protected files, four settings fingerprints and 1,596 retained private files match. Existing source/calibration/renderer/menu/loudness files remain intact except the listed integration/control changes. |

The final private build, candidate and exact validation digests are recorded in [offline evidence](../evidence/playable-13-offline.json) and [candidate evidence](../evidence/playable-13-candidate.json). Earlier partial build directories and a fixture-authoring typo failure are retained as incomplete attempts, not passing candidates. Independent reviews found no remaining blocking source issue; actual RPH execution, endpoint output and audible quality still require live evidence.

## Recording during the first audible session

The additional owner requirement supersedes the earlier plan to postpone recording until a later session. The same audible binary supports a separately approved optional 24-field lease with `recordingAllowed=true` and `loopbackAllowed=true`. Its default lease has both false. This narrow first-demo measurement capability does not set global feature flags, fabricate prior live PCM qualification or grant human listening approval.

The existing recorder taps actual committed, post-gain RichAudio stereo output and binds loopback to the endpoint actually selected by WASAPI. It retains lossless `richaudio.wav`, `loopback.wav` when available, submission/packet indices, accepted vehicle/listener/operating-state QPC timestamps, buffer counters, faults and a digest manifest. The native-to-host clock lineage remains in the handoff journal. Initial loopback coverage is not guaranteed. Capture remains capped at 120 seconds and the existing 128 MiB aggregate budget; queue or capture faults are reported and stop recording without restarting it or delaying otherwise safe playback.

After the owned host stops, `Finalize-Playable13Capture.ps1` verifies session ownership and finalized file digests, invokes recorded-file analysis automatically and rechecks original WAVs. It retains waveform and spectrogram SVGs, JSON metrics, measured abnormalities/candidates and specific correction recommendations. Analysis covers clipping, discontinuities/underflow, silence, stereo correlation/mono cancellation risk, pitch/transition candidates, recorded source-energy balance and clock-mapped latency candidates.

The endpoint mix also includes GTA and other output. Mixed stereo and dry source counters cannot prove engine/exhaust destructive cancellation, correct physical spatialisation, perceptual balance or speaker latency. Missing alignment/stems/loopback remain unavailable evidence, with targeted next measurements recommended. Harmonic/octave ambiguity and legitimate vehicle transients can create pitch candidates. No subjective listening or perceptual approval was performed by Codex or an audio-capable system here. Future WAVs remain private, retained and shareable by me for Codex/ChatGPT review; they are not published with proprietary source material.

## Next authorised work

Follow [the exact live proposal](PLAYABLE_13_LIVE_PROPOSAL.md) for one new passive test first. Only after genuine live handoff acceptance may the separate audible candidate be authorised. Its optional recording approval can include both stereo PCM and selected-endpoint loopback in that first audible session. If capture proves unavailable, retain its failure and continue the already authorised short listening demonstration safely; do not postpone the demo for recorder development or retry capture automatically.

My [listening and recording procedure](PLAYABLE_13_LISTENING.md) separates source PCM, rendered PCM, actual endpoint submission and human feedback. This is an offline candidate, not a working in-game build or public release. PR #76 remains draft and unmerged.
