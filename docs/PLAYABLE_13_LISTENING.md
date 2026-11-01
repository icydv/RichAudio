# PLAYABLE-13: eventual Bati listening and recording procedure

**Use only after accepted genuine passive handoff and separate exact audible approval. Nothing here authorises a launch, deployment, playback or recording.** The operator/coordinator prepares the exact receipt-bound installation and fresh process/session lease from [the live proposal](PLAYABLE_13_LIVE_PROPOSAL.md).

In offline Story Mode, use a living player-driven Bati with its engine already running. Keep GTA's own audio active. The first candidate uses console controls; the saved gold menu/shortcuts remain intact, but that general menu is not initialised in this scoped profile.

| Console command | Behaviour |
| --- | --- |
| `RichAudioHandoffStatus` | Inspect passive integration readiness/state. |
| `RichAudioHandoffStart` | Begin the one bounded native handoff session. Does not enable audio. |
| `RichAudioBatiAudioStatus` | Inspect disabled/running/retired audio state. Audible build only. |
| `RichAudioBatiAudioOn` | Explicitly enable the existing audio path; requires fresh accepted running-Bati state. |
| `RichAudioBatiAudioOff` | Fade/stop owned output while the provider can remain active. |
| `RichAudioHandoffStop` | Stop and permanently retire the provider/session. |

During the approved active window, use a short continuous route rather than spending the limit in menus:

1. Begin the handoff, verify accepted changing real state, then explicitly enable Bati audio. Listen briefly at idle.
2. Gently rev, accelerate and decelerate. Note delayed/stuck response, pitch stepping, clicks, silence, clipping, doubling or an implausible engine/exhaust balance, with approximate session time.
3. Rotate the camera and vary its available view/distance. Note stereo-side changes and abrupt spatial/level transitions. Camera availability does not prove a calibrated physical distance or qualified environmental reflections.
4. While the provider remains fresh, turn audio Off and verify it fades. If the approved scope includes one deliberate Off/On control check, re-enable once and listen briefly. Do not re-enable a retired/faulted session.
5. Turn Off, leave the motorcycle and verify permanent provider retirement, then exit normally for verified rollback. Engine-off/restart telemetry is outside scope. Stop immediately on an earlier terminal failure.

The owner must provide actual listening feedback before anyone calls this a playable demonstration. Record precisely who heard what. Codex must not claim subjective listening unless the actual recording is accessible to an audio-capable analysis system. Numeric PCM, endpoint submissions and loopback capture each establish different facts.

If the approval includes recording, select the separate recording-enabled lease before starting this one session; no UI toggle or global feature flag is needed. The actual post-gain stereo tap and selected-endpoint WASAPI loopback start with owned output. Capture failures are diagnostic, with no automatic retry; they must not hold up healthy, already approved playback.

Raw recordings remain under the private package's `.local/recordings/audio-tests/capture-<id>/` directory:

- `richaudio.wav`: lossless float32 stereo frames actually committed to owned output.
- `loopback.wav`: lossless endpoint-native PCM/float mix, when loopback succeeds; it includes GTA and other output, not just RichAudio.
- `owned-index.ndjson`, `loopback-index.ndjson`, `diagnostics.ndjson`: submission/packet clocks, accepted vehicle/listener/operating-state timestamps, buffer state and faults.
- `session.json`, `demo-analysis-request.json`: finalized hashes/completion and matching owned host session. Initial loopback coverage is explicitly unguaranteed.

After the host has stopped, the coordinator automatically invokes the following offline completion step from PowerShell 7, using the exact approved package root and actual session ID:

```powershell
pwsh -NoProfile -File tools/Finalize-Playable13Capture.ps1 `
  -PackageRoot '<approved private package root>' `
  -Session '<actual 32-character handoff session>'
```

The finalizer opens no endpoint and plays no audio. It refuses active hosts, mismatched sessions and altered/finalization-missing recordings, retains WAVs unchanged, and creates a fresh analysis directory under `.local/playable-13/recording-analysis/`. Retain `analysis.json`, `finalization.json`, owned/loopback waveform and spectrogram SVGs beside the capture manifest links/digests for independent Codex/ChatGPT examination. If output is incomplete or analysis fails, keep the raw files and actual failure; do not invent a clean result.

Report measured clipping/nonfinite values, underflow/discontinuity evidence, candidate silence/dropouts, pitch/transient candidates, stereo correlation/mono cancellation risk, recorded dry engine/exhaust energy and clock-mapped latency candidates. Apply the analyzer's specific recommendations to the measured fault; do not increase global gain to hide a routing problem. Mixed stereo alone cannot separate engine/exhaust cancellation or native-audio interference. Pitch estimates can select harmonics, and real throttle/camera changes can explain transitions. Physical spatial correctness, perceptual balance and speaker latency remain unestablished without the additional aligned evidence described in the report.

Retain all original lossless WAVs and diagnostic hashes privately so the owner can share them for further analysis. No proprietary audio is published through PR #76. The subsequent tuning task should use these real findings and human feedback, then broaden vehicle coverage and modification-aware traffic balancing.
