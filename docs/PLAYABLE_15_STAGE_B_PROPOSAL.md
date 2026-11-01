# PLAYABLE-15 Stage B: first audible Bati demonstration

**Prepared only. Stage B is not authorised.** Stage A attempt 2 is independently accepted for changing genuine telemetry, six measured camera-cut recoveries and permanent source-scope retirement; its original installation and owned-process absence are independently restored. The recorded terminal reason was combined model/running scope loss, so direct driver-loss causality remains unproved. This is an explicit acceptance limit, not an audio result. See [the actual Stage A result](PLAYABLE_15_STAGE_A_RETEST_RESULT.md). Separate explicit approval is required for this audible deployment, launch, endpoint and chosen recording scope.

## Exact existing candidate

Use `.local/playable-15/candidate-journal-fix/audible` only. No DSP, source-bank, host, recording-stem or gain change is proposed.

| Item | Bytes | SHA-256 |
| --- | ---: | --- |
| Audible `RichAudio.dll` | 387,584 | `a474df2201b6aa3a370029af479c4f4f62ad6958dfd4f72c7cb8420e2ec7ec5e` |
| Unchanged native SHV producer | 129,024 | `05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40` |
| Private Bati package pointer | 228 | `fafda57aa87a277b670d4a2fa796b85c38062a1158fb220f18986e299cd00387` |
| Existing WASAPI host | 306,176 | `5c64559983b81a19b0c66c7f01fb19a3b584eef30a9980ed6ef2296b5b611f42` |

Private package manifest: `abd313481b5048aa06caab5784cdded948754c8bd4b54e015e643d31dcb8c8c7` (132 bound files). Build receipt: `e7b448b35d577544c64cb030562b4ce0db83490340ae9552af73d7fa9f36d535`. Exact offline validation: `f0ce719c4ff96b290be4796f62e1b5a290786a37cc2f12efade584ff500bacc1`.

Installation manifest: `e583933fad5ae8d3b14e0282608f131559e30f028b381988fd8c87aa49f253dc`. Rollback manifest: `3945c755ca2fe24708c7e3d8d18230f4de2f58555da93d335b87b10577fca3aa`.

The existing Bati-only source mapping, 10:1 exhaust pressure reference, 0.25 common trim, 0.175 master gain, source expiry and bounded shutdown remain unchanged. GTA stock sound stays active. Saved stock-fallback/F10 settings and both disabled global production features remain intact; additive preferences are isolated in the private package.

## Approval scope to select explicitly

One approval must name **one temporary audible deployment, one Enhanced/RPH launch and one fresh Bati session**, targeting **30–45 seconds active**, with a **45-second independent observational stop deadline**. No retry, second Start, restart/rebind, second launch, automatic host recovery or remount replay is included.

The approval must choose one recording scope:

- **Listening only:** the default strict 24-field lease template `ee3c6dbba50bb63386df61ff0b5dd3da4c41f4062d4aeb4b9d53cc3797ef0312`; `recordingAllowed=false`, `loopbackAllowed=false`.
- **Listening plus existing final PCM and selected-output loopback:** the alternative strict 24-field template `1b041ef77627a8cab1ff90f1c061d10e71113e48de7afbff2741444dd3b7b63b`; both flags true. This additionally authorises the existing lossless RichAudio output-submission tap and capture of the actual selected playback endpoint's full output mix. It does not authorise microphone capture or new dry/role stems. Loopback includes GTA and other sounds on that endpoint, not isolated RichAudio alone.

Recording permission is fixed when the lease is first loaded. Neither template is a valid runtime lease until a fresh session ID, exact new game PID/kernel creation time and owned creation receipt are bound. Do not change recording permission during the session.

## One bounded session

1. **Admission:** retain the accepted Stage A attempt-2 result and restoration receipts. After that game/RPH/owned-host lifetime is absent, reverify the 11 protected files and four settings against baseline `8fce329188b82f650f7885e40e54243f8c43bb3a0816ef994dc112d34763b642`, absent owned/pending/backup paths, unchanged package bindings and exact candidate/manifests. Create a fresh Stage B attempt identity and independent monotonic supervision bound to the audible manifests and selected recording template. Do not reuse a consumed passive authorisation or execute a passive-only supervisor against these different payloads.
2. **Deployment and launch:** perform the exact installation-manifest operations once, including the private pointer and exact-owned backup of the 222,208-byte original plugin (`611347ab5828bedf0bd71102e4df125ed13666f6a7e7e3eccbc761a76a7fb657`). Launch through the existing reviewed Enhanced/RPH route once. Observe actual Steam acceptance and the exact new process lifetime, then publish only the fresh process-bound PLAYABLE-15 lease. Retain the existing bounded startup/rollback supervision. No proprietary PCM is installed inside the game.
3. **Arm before source admission:** after current-session READY, the owner is a living player driving the engine-running Bati in offline Story Mode. With the console open, run `RichAudioBatiAudioOn` and verify `enable=true` while it waits for fresh state. Then run `RichAudioHandoffStart` **once** and close the console immediately. AudioOn alone starts no host/endpoint; the existing runtime additionally requires a fresh accepted Bati frame. This ordering avoids reopening the console after the source lease has begun.
4. **Listen for 30–45 seconds:** the independent active timer starts at observed ACTIVE; its stop-request deadline is 45 seconds even if sound begins later. Idle briefly, rev gently, drive slowly and make one ordinary camera change if safe. Establish actual RichAudio source/stereo counters and host state; owner listening feedback remains separately recorded. Native GTA sound is still present and must not be mistaken for RichAudio evidence. Do not adjust volume, mix, EQ, spatial width, source mapping or gain during this first demonstration.
5. **End deliberately:** around 30–40 seconds, dismount once and retain its time/context. Require driver/source retirement and the existing owned-output fade/stop, completed host/tap shutdown and no replay. Do not remount to restart. If driver loss has not ended the session by 45 seconds, issue the existing permanent `RichAudioHandoffStop` once under supervision. On any earlier identity/freshness/source/endpoint/host fault, end and preserve that exact outcome without retry. Bounded queued/fading audio may finish; instantaneous completed silence is not assumed from a stop request alone.
6. **Exit and restore:** exit GTA/RPH normally. Require the owned playback host and Node child to finish before exact-owned rollback. Remove only files matching the selected manifest and actual creation receipts, restore the verified original plugin, then independently reverify all 11 protected files/four settings, saved stock-fallback/F10, false production flags and absence of owned paths/lifetimes. Retain all evidence and recordings privately. No hot replacement, recursive deletion or automatic relaunch.

## Existing recording and analysis route

If separately selected, the existing `GameplayHost` attaches `GameplayRecording.Tap` to `WasapiOutput` before starting output, then starts loopback against `audio.SelectedEndpointId`. It retains final submitted PCM, submission/QPC indices, gameplay diagnostics and endpoint packet timing. Loopback starts after output startup, so coverage of the very first submitted samples is not guaranteed and must be measured rather than claimed.

After the host is stopped and the existing recorder has finalised `session.json` and `demo-analysis-request.json`, preserve/reverify their listed files, hashes, lengths and host-session identity. Use the existing repository analyzer directly, from the repository root:

```powershell
& '.local/playable-15/build-journal-fix/package/runtime/node.exe' `
  'tools/Analyze-Playable13Recording.mjs' `
  --session '<exact final private capture directory from stopped host.json>' `
  --output '<new private .local/playable-15 Stage-B analysis directory>'
```

This is a post-session file analysis command, not authority to record or play anything. Analyzer SHA-256: `d4d4aad8195837f1d7350ef562d54604f6eb67a51c05a4c6b952852302e197d6`. Its private-path policy supports the new `.local/playable-15` package/capture location. Do **not** use `Finalize-Playable13Capture.ps1` for this package: that wrapper restricts paths to `.local/playable-13` and would refuse this location. The preserved recorder/host protocol intentionally remains PLAYABLE-13; the handoff lease/journal profile is PLAYABLE-15. No code change is needed to run the existing analyzer directly.

Record completion/failure, nonzero owned PCM, clipping/underflow/gaps, recorded pose/operating changes and selected-endpoint loopback coverage. Missing or failed capture remains visible and does not authorise a retry. These files cannot independently prove subjective quality, physical speaker latency, native/RichAudio cancellation or source-isolated live stems.

## Preparation boundary

The audible payloads, source/package/host bindings, default/recording alternatives and existing capture integration have been independently inspected without loading the DLL, opening an endpoint, deploying, launching GTA or recording. The Stage A acceptance and restoration receipts are bound as prerequisites; direct driver-loss cause remains unproved and Stage B must verify actual audible fade/stop and no replay. Fresh Stage B authorisation is still required. Separately prepared scoped-b-01 helpers bind this proposal, the exact audible manifests, selected 24-field lease and Stage A receipts; they have not executed any live mode. The passive supervisor/lease cannot be reused or silently promoted.


## Deadline and exact approval boundary

The 45-second observer is an independent monotonic stop-request limit, not OS/native preemption or an instantaneous physical-silence guarantee. Plan dismount/stop at 30–40 seconds so normal retirement precedes that deadline. The unchanged native/RPH backstop remains 120 active seconds, 2,400 attempts and 20 Hz; source expiry remains 250 ms. A stop request is separate from completed queued-PCM/fade drain and host exit. Report any deadline, input or completion fault rather than claiming the backstop itself enforced 45 seconds. No automatic retry is allowed.

Recommended approval scope is one exact audible deployment and one existing Enhanced/RPH launch with the final RichAudio PCM plus selected-endpoint loopback option, at most one AudioOn and one Start, planned 30–45-second listening, deliberate source retirement, normal exit and exact ownership rollback. It includes no source balance, EQ, gain, spatial-width, extra live-stem or broader-vehicle change. Both recording flags must be selected explicitly in the approval; the default remains off. All proprietary recordings stay private.

Candidate receipt: a9449e06172e53167a2a3c9bc9da22c2b4aa3b21e29d6e157f1c3857d8e0a5e3. Exact preparation and review pins are in [Stage B evidence](../evidence/playable-15-stage-b-prepared.json). No Stage B authorisation receipt or live-b-01 operational directory is created by preparation.
