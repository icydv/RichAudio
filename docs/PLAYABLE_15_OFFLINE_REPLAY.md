# PLAYABLE-15 genuine-trace offline listening sample

All **670 actual published frames** from PLAYABLE-14 attempt 5 were replayed through the existing Bati player source controller, original private Rockstar engine/exhaust PCM and acoustic renderer. The result is a private **39.658667-second, 48 kHz stereo float32 lossless WAV**. This is offline rendering of captured gameplay observations, not live GTA playback or recorded GTA sound. No endpoint, playback host or recorder was opened.

`tools/Replay-Playable15Trace.mjs` verifies the original capture and private PLAYABLE-13 package hashes before rendering, and verifies the assets, capture and renderer source hashes again before writing output. It consumes every frame once in original order. Acquisition timestamps, positions, velocity, orientation, operating state, session and source identity remain unchanged. Original journal-admission QPC schedules delivery at the next existing 512-sample render boundary, with a measured maximum scheduling quantisation of **10.648 ms**. No future observation is admitted. Original source expiry, 100 ms listener playout and 50 ms prediction limits remain active.

The retained listener acquisition span is **38.578700 seconds**; journal publication span is **38.413714 seconds**. These differ from the 38.642836-second native-return span because the first journal publication follows acquisition and the final native observation never produced a gameplay frame. That missing camera observation is not reconstructed.

The offline run used CPU acceleration, the existing balanced acoustic quality, output level 1, existing **10:1 exhaust pressure**, **0.25 common source trim** and **0.175 master gain**. Source phase starts in the existing engine's normal initial state; no original GTA audio phase exists in the telemetry capture. The existing operating-state-to-source mapping supplies its usual authored load/lift behaviour; no measured throttle, physical RPM or new geometry is claimed. Acoustics remain the existing conditional direct sound with the declared native-unit scale assumption.

| Numerical observation | Result |
| --- | ---: |
| Genuine frames accepted / rejected | 670 / 0 |
| Source creations / retirements / active at end | 1 / 1 / 0 |
| Stereo peak / RMS | 0.0558993 / 0.0157166 |
| Nonfinite / clipped / limited samples | 0 / 0 / 0 |
| Missing history / affected history frames | 0 / 0 |
| Maximum adjacent sample step | 0.00651062 |
| Maximum PCM block or frame-delivery boundary step | 0.00409857 |
| Stereo correlation / mono-to-stereo RMS ratio | 0.997036 / 0.999041 |
| Exact-zero interior gaps of at least 5 ms | 0 |

The WAV retains **32 ms** of startup silence and approximately **1.068 seconds** of final silence, including the existing bounded release and retirement. Stereo-to-mono energy does not show gross cancellation in this render. Numerical step, history and gap checks found no corresponding fault; they do not establish perceptual smoothness, phase quality or enjoyment. Human listening remains pending. The original rejected 671st camera frame, dismount timing and any remount are still absent from the capture.

The WAV and full report stay under the ignored private `.local/playable-15/replay-01` directory. They contain proprietary sound and must not be committed, uploaded to the PR or distributed. Portable hashes and measurements are in [the sanitised replay evidence](../evidence/playable-15-offline-replay.json). The waveform is independently listenable by the owner; rendering it did not play it.

WAV SHA-256: `f65361738e36ce0e1bdb248ff1b724ba85e6be8e22b8d2d6c59fdd7efb0d73d8` (15,228,972 bytes).

Reproduce privately from the unchanged retained inputs with a fresh output directory:

```powershell
node tools/Replay-Playable15Trace.mjs .local/playable-15/replay-new
```
