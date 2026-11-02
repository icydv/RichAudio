# PLAYABLE-15: exact passive and audible candidate proposal

**Prepared and reviewed only. This document authorises nothing.** No deployment, GTA/RPH launch, audio endpoint, playback or recording has occurred. Each stage requires fresh explicit owner approval for its selected artifacts, one deployment and one launch; Stage A never authorises Stage B. No automatic retry, rebind, hot swap or further launch follows failure.

Private candidate root: `.local/playable-15/candidate-final`. Candidate receipt SHA-256: `94c582f5d961125fe91988698a300405bc0b6849aee5441b34c34359efcd295d`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Stage A passive `RichAudio.dll` | 381,952 | `3a124f3b0bb15e4790645d8ef1b0fa2268639a64386c6ae95f83009465efefda` |
| Stage B audible `RichAudio.dll` | 387,584 | `765b3a8e08b9624ada1c4756ca2dec10fcc2a8ebd11bfd4a35af6568883e0a1a` |
| Shared unchanged SHV producer | 129,024 | `05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40` |
| Stage B private package pointer | 222 | `6c10afe6607331caa56b40f7ee7f746e14ea92abf317d9817053b3135bd95961` |
| Retained WASAPI host | 306,176 | `5c64559983b81a19b0c66c7f01fb19a3b584eef30a9980ed6ef2296b5b611f42` |

New private package manifest: `abd313481b5048aa06caab5784cdded948754c8bd4b54e015e643d31dcb8c8c7` (132 payload bindings). Final build receipt: `30ac14ccac5376c9a246644da9b0031c920cfddffcdb0414d6967df26d6b62ab`. Exact offline validation: `861f9c6c3b6ada4d58b8ce07e12da08549689fdb955a69c4368031f864b9996e`. These are private preparation fingerprints, not live acceptance.

| Prepared manifest | Stage A passive SHA-256 | Stage B audible SHA-256 |
| --- | --- | --- |
| `installation-manifest.json` | `3c39ca0941db90d4d336bbd7df049334347366d7e0da386934f74cb1ee1066df` | `d15fce916cdc2b3eb19cb7d28e4027504e459639ca55e49d47b76dedc024fe3d` |
| `rollback-manifest.json` | `6924cf0b6781d1b869a6a94e304a806549ba3941a5f7615b82b0dfcbb91e86b7` | `dd3b7043371b96ad1aaf2cc4b3da00ce4f0a5b38060af98912d8d0f3bf7d0e46` |
| `session-lease-template.json` | `c003ee1c725855f0b40555d91b8f4efd1d99d86e6b19367f71b5931309b795fb` | `7f2285ae8f2efb1240324455bbc2b5e83a98ef6a1ba2c643836a5fdd79009547` |

Stage B's separately approved optional PCM/selected-endpoint-loopback template is `a6fa5bde14440fc54bc8afe9983b9a69a7b08e3ddff2bb308f3429b7205424a2`. It is unselected by default. Both global production flags remain false.

## Installation and supervision for either separately approved stage

1. Record a fresh attempt identity and exact stage approval. Recheck candidate/build/validation/source/manifest hashes, the 11 protected installation files and four settings against preserved baseline `8fce329188b82f650f7885e40e54243f8c43bb3a0816ef994dc112d34763b642`. Verify saved stock-fallback/F10, both false feature flags, absent game/RPH/owned-host processes, and every proposed owned/pending/backup path absent. Preserve prior captures and prelaunch logs. Failure ends the attempt before substitution or retry.
2. Follow the selected installation manifest: write only the exact native producer and managed plugin to their new `.playable15.pending` paths, flush/hash/retain ownership receipts, move the verified original plugin to the absent `.playable15.original` backup, then atomically install the candidate. Stage B additionally installs the exact pointer. Its proprietary package stays outside the game. Change no game/SHV/loader/RPH binaries, configuration or saved preferences.
3. Use the existing Enhanced/RPH launch route once, with independent monotonic supervision and a read-only startup observer. Observe actual Steam argument/interstitial acceptance and exact new Enhanced PID/kernel creation lifetime. Retain the established 120-second startup observation limit and owned-process restoration supervision. Historical PLAYABLE-14 coordinator/authorisation receipts are consumed and must not be reused; any execution supervisor must be freshly bound to this candidate's manifests, stage and attempt.
4. Create a new strict **PLAYABLE-15** process-bound lease from the selected template only for that observed process lifetime, with a fresh session ID and exact caller hash; publish by owned pending write/flush/atomic move. The templates' zero PID/time/session placeholders are not valid execution leases. Record the actual lease digest and creation receipt for rollback. Never replace acquisition timestamps or renew stale source data.
5. Wait for current-session READY. The operator confirms a living player driving an engine-running Bati in offline Story Mode with menus closed. Active handoff remains capped at 120 seconds/2,400 targets/20 Hz; use a shorter 30–45-second demonstration where possible. Independent supervision owns timeout/cleanup; chat pacing does not enforce these limits.

## Stage A: passive confirmation

Install the passive image and 21-field lease; no pointer, audio host, endpoint or recording. Submit `RichAudioHandoffStart` once and close the console immediately. Observe changing engine state and vehicle/listener movement, ordinary camera rotation and a normal camera-mode transition. Inspect compact cut diagnostics if a cut is measured; acceptance requires no fabricated cross-cut velocity and either valid fresh-generation continuation or an accurately classified safe terminal observation.

Deliberately dismount near the end while preserving its time/context. Require permanent current-driver/source retirement, complete raw audit/journal drain and no remount resurrection. A source expiry or unrelated identity failure is retained as its own outcome, not renamed as a camera pass. If the intended transition/driver loss is not captured, report that limitation; do not run another blind attempt. Exit normally and restore/verify before requesting Stage B approval.

## Stage B: audible demonstration, separately authorised after Stage A acceptance

Use the already built audible image, private pointer and 24-field lease for one fresh session. Recording/loopback permission must be explicitly included in this approval to select the alternative template. Reuse the exact source/calibration, host, fade, recorder and analyzer.

Before any accepted gameplay frame exists, submit `RichAudioBatiAudioOn` to arm output, then `RichAudioHandoffStart` once and close the console immediately. Arming alone opens no host: endpoint startup still requires fresh accepted Bati data. This ordering avoids reopening the console after a live accepted-state lease has begun; attempt 5 showed that an open console can stall genuine SHV source progress. Do not change expiry to accommodate input.

Listen briefly while idling/revving/driving gently and making a normal camera change. GTA stock sound remains active, so this is additive output; compare actual RichAudio stage counters and optional recorded output rather than inferring RichAudio audibility from GTA sound. Deliberate dismount at the end must retire/fade/stop the owned audio host permanently. No endlessly sounding retired source, automatic host retry or remount replay is permitted. Stop/end on fault or expiry and preserve the exact outcome. Existing queued/fading audio can finish within its bounded drain; do not claim instantaneous silence.

If explicitly approved, retain the existing post-gain lossless PCM and selected-endpoint loopback, then run `Finalize-Playable13Capture.ps1` against the new private package/session after owned-host shutdown. Its established host protocol remains PLAYABLE-13. Retain automatic measurements/plots and unavailable capture fields. Capture failure must remain visible; it does not authorise a retry or recorder rewrite. Owner listening feedback remains separate from numerical analysis.

## Can both stages use one game lifetime?

The two exact images above differ, so the default passive-image procedure requires normal exit/restoration followed by a separately approved audible deployment/launch. Hot replacement is unsupported. A same-lifetime conditional session is technically possible only with **upfront explicit approval for the audible image and its capability lease**, audio kept disabled through Stage A, and an independent later explicit Stage B decision while the same source remains valid. That is a different approval scope from passive-only installation; the prepared passive manifests do not authorise it.

It also has a practical limit: accepted-state expiry remains active while disabled, opening the console may stall source progress, and deliberate Stage A dismount permanently consumes the session. A same-lifetime variant must postpone dismount until the end and enable without crossing the original expiry; that operator transition is not established safe live. Recording permissions are immutable at initial lease load. There is no demonstrated restart-free shortcut that preserves a Stage A dismount and then restarts the retired source. The separately approved two-session route is the exact default proposed here.

## Rollback and acceptance boundary

Require normal game/RPH and owned host exit before any removal. Follow only the selected rollback manifest and actual creation receipts: remove own candidate/pending/native/pointer files only on exact owner/hash/length match; remove the lease only against its actual creation digest; verify the original backup and move it into the absent original plugin path. Refuse unexpected bytes. Reverify all 11 protected files/four settings, owned paths/process absence, stock-fallback/F10 and disabled flags. Retain every capture, recording, private package and receipt; no recursive deletion, forced hot unload or automatic retry.

The next requested action is approval of this **Stage A passive candidate only**. Stage B remains a separate decision after genuine corrected passive acceptance. Offline results, the listenable trace WAV and compiled audio integration do not constitute that acceptance or in-game listening proof.
