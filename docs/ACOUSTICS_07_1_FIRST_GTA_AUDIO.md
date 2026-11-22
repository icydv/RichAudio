# RichAudio ACOUSTICS-07.1 — First GTA Spatial Audio Integration

## Outcome

I've completed one approved Enhanced Story Mode attempt using the unchanged ACOUSTICS-07 source at `998a8f9f81ca8ead8e2f1f63afc70b38df325b0b`, stacked on PR #48. The bridge loaded successfully, camera observations reached the independent Windows host, and my synthetic beacon became audible. My exact response to the camera-rotation listening question was **“Sounds like it does yes”**. This supports a qualified first audible connection; it is not a blind directional accuracy or latency certification.

The overall result is **PARTIAL**: the functional connection worked, but one rejected transport message and an automatic IPC reconnect occurred inside the existing implementation. This does not meet my strict no-retry expectation. I did not relaunch GTA, issue another bridge Start, change implementation or repeat the experiment. The connection event was identified in the final saved transport diagnostics; the intermediate host status did not expose that counter. The first attempted connection's exact rejection cause remains unresolved: only `InvalidDataException` was retained.

## Verified execution

- GTA Enhanced **1.0.1158.16**, valid executable signature; RPH **1.132.1428.17748**, independently checked from the preserved runtime and launcher.
- Authentic pinned SDK **1.124.1393.17586**, SHA-256 `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0`.
- Sealed 26-file temporary deployment, fresh executable backups and prior-build preservation; original executable selection restored after normal exit.
- One RPH/game launch, one plugin load and one `RichAudioBeaconStart`. READY explicitly reported sending OFF before Start.
- One original harmonic beacon, open-road synthetic metric scene, gain **0.08**, initially muted. No system or game audio capture was enabled.
- Camera orientation only; game positions were not converted to metres. Existing GTA world and native sounds received no mutation from the bridge. No source spawning, benchmark work, game collision acquisition or sound interception occurred.

## Objective measurements

The host ran for **120.033 seconds**, accepting **1,841 listener messages**, with **one rejection and two pipe connections**. The renderer completed **11,243 control updates**, using up to **two paths**. It reported no producer error, zero exit status, zero cursor resets, zero path overflow and zero limiter activation. Actual submitted output peak was approximately **0.0017003** full scale.

The Windows endpoint explicitly accepted shared-mode 48 kHz stereo Float32. Audio counters show **zero underflow frames, zero empty-padding observations and zero wake timeouts**. Submission cost was 0.0152 ms median, 0.0238 ms p99 and 0.3006 ms maximum. These counters do not establish absence of every audible defect. There were 5,654 unavailable history-tap reads across startup/state transition boundaries, without an interval-resolved audit.

The host reported native-orientation-only mapping and interpolated listener presentation with the existing **100 ms** buffer. Maximum accepted receipt age was approximately **16.80 ms**, and maximum Node pending age approximately **29.20 ms**. Neither is end-to-end camera-to-ear latency. Per-channel rendered metrics, timestamped turn markers and a live control-to-output latency measurement were not retained. Shared-endpoint loopback was deliberately disabled. I therefore do not claim an independently quantified left/right change or a new live latency figure.

The beacon was manually started only after valid live observations appeared. The host later muted/stopped automatically at its existing two-minute cap before the manual bridge Stop. The bridge subsequently stopped and was unloaded through RPH; GTA exited through its normal shutdown command. No process kill was used. A live telemetry-disconnect-to-silence interval and interactive mute timing were **not independently measured** in this attempt. Previous synthetic measurements remain separate.

## Listening and native-audio boundaries

My listening reply indicates that I heard the effect and perceived an apparent camera-dependent balance change. I did not give a separate verdict on delay, dropouts, exact turn angles or unrelated native sounds. Native playback was left enabled by construction; preservation of every native sound category was not separately auditioned. Synthetic ground reflections do not demonstrate audible GTA-building acoustics.

## Cleanup, evidence and validation

Private deployment, executable backups, original runtime logs, host receipts and the exact approval remain in ignored storage. Public evidence contains only selected scalar measurements and binary fingerprints in `evidence/acoustics07-1-live-result.json`. No raw coordinates, private device identity, recordings, vendor binaries or workstation paths are published.

The preflight rebuilt the original host/bridge and passed **642 host assertions, 47 transport cases and 42 producer/playout tests**. The source implementation was not changed during the live experiment. Restoration is recorded separately by the final independently verified receipt: original root hashes/signatures and directory membership, all 26 temporary paths absent, 179 archive metadata records and 10 archive sample hashes. A cleanup PASS must be supported by that receipt, not inferred from game exit.

## Next decision

My smallest remaining issue is the transport's rejected initial frame/reconnect and its lack of immediately visible failure reporting. The next action should be a narrowly scoped **offline diagnosis of that handshake**, including a strict single-connection mode and diagnostics adequate to stop immediately on rejection. No new live attempt is authorised here. A more enjoyable sustained beacon also needs separately evaluated responsiveness and a smoother startup, but this result does not authorise another engine redesign.

The independent ACOUSTICS-05 + BENCHMARK-01 milestone remains **60%**. No prior PR is merged.
