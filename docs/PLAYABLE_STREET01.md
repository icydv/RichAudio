# My next private Bati demonstration

I have a testable private Bati build prepared for a separately approved GTA V Enhanced session. Codex has not deployed it, launched GTA, opened an audio endpoint or recorded sound for this checkpoint. My earlier listening results remain historical evidence; this build still needs my ears in GTA.

The build reuses the previously heard PLAYABLE-15 SHV/RPH telemetry route and exact retained native producer/source banks. Codex rebuilt the managed plugin and audio host from this checkout and packaged the current JavaScript modules. It preserves the existing engine/exhaust mapping, pressure ratio, gains, source expiry, 48-kHz/512-frame processing and baseline buffering. It adds the missing player-driver attachment flag and observes the existing gameplay/follow-vehicle camera predicates so the existing rider airflow can activate. Unknown camera mode withholds local airflow. Camera orientation still drives the existing spatial renderer.

This is additive audio. GTA's own bike sound remains enabled. There is one RichAudio engine/exhaust source pair; the first listening comparison must assess how it combines with stock sound. This is not native replacement or proof of phase compatibility with GTA's simultaneous mix. No gain increase or additional buffer was introduced.

## What I can evaluate

- Bati engine/exhaust at idle, revving and during gentle acceleration.
- Camera-relative directionality, using the existing listener and source poses.
- Speed-dependent procedural airflow, including rider-local pressure only with qualified player attachment and an observed vehicle-follow camera. Its still-air and native-unit scale assumptions remain explicit.
- RichAudio ON/OFF through `RichAudioBatiAudioOn` and `RichAudioBatiAudioOff`. F10 and my saved preferences remain intact; this scoped session uses console controls for its playback gate.

Genuine building reflections are **disabled** in this first demonstration. The closed Bati profile reports `closed-demonstration-profile`, conditional direct geometry and zero reflection paths. It does not read the installed acoustic cache or start broader world preparation. The asynchronous world integration has no passing genuine qualification after its architecture change. I can evaluate useful direct Bati audio now without substituting an authored scene as GTA environmental proof.

## CI findings and narrow corrections

Codex inspected hosted runs [STREET-01 functional](https://github.com/icydv/RichAudio/actions/runs/42264138839) and [offline validation](https://github.com/icydv/RichAudio/actions/runs/42264138783) for checkpoint `73da43e`.

The two normal-startup scene tests reproduced locally. Asynchronous metadata preparation returned `not-ready`, and the service discarded the only waiting observation. The service now retains at most one still-fresh observation under a new ordered transport ID, preserving its original request, geometry and expiry timestamps. A newer observation takes precedence. The existing dispatch floor and expiry remain strict: if preparation plus rate limiting consumes that lease, only a distinct fresh observation can produce a scene. The normal-startup tests now observe installation and supply that fresh observation when needed, rather than assuming synchronous reload during one query. A dedicated regression proves a retained observation is not retimestamped.

The reader test was also waiting for `manifestLoads` to count an epoch-mismatched read; the new architecture incremented it only on successful installation. The helper now reports actual read/parse attempts, including mismatch, while scene-thread manifest-read time remains zero. The test verifies one unchanged mismatched read and the off-thread measurement.

The Node 22 moving-scene failure passed the cold/warm/neighbour/generation assertions but missed the final twelve-acceptance population. The fixed eight-second observation window previously included asynchronous metadata startup. Codex bounded startup separately at five seconds, retained the same movement window, acceptance counts, one-second leases and stale-result assertions, and verified the resulting test. This is a test-population correction, not a guarantee of every hosted scheduler's timing.

The independent processing workflow remains red: Node 22 completed its sixteen trials with the functional gate passing and processing deadline gate failing; Node 24 failed its affinity-helper deadline in a control. Codex did not rerun or loosen these historical populations. They do not exercise the installed metadata reader, and the isolated direct demonstration does not start it.

## Focused evidence

- Scene, reader, moving-consumer, lifecycle and readiness population: 21/21 passed before the additional pending-observation regression; service plus airflow population: 14/14 passed with that regression. These overlap.
- Real SHV frame adapter: 15 cases / 75 assertions, including driver attachment and unknown view; camera listener: 11 cases / 37 assertions.
- Final private package: 56 actual runtime/secured-pipe/source/renderer/RA07/ring checks passed using authored observations and a device-free final sink. Engine, exhaust and stereo were nonzero, rider airflow activated, ON/OFF worked, expiry and driver loss retired playback, remount did not revive it, and shutdown joined. No endpoint was opened.
- Authentic-SDK plugin and current host compiled. Metadata inspection found one plugin identity and exactly one public Main/OnUnload pair.

The final device-free chain retained one hard processing miss in each of its four host lifetimes: complete-render maxima 18.402, 15.798, 16.218 and 17.782 ms against the unchanged 10.667 ms block target. Recorded host underflow was zero in all six evidence snapshots. These short checks do not establish sustained live deadline compliance, physical latency, FPS, clipping across a session, or subjective quality. The existing first-packet recording history and earlier noticeable latency are preserved. Recording is disabled for this proposed listening session.

## Concrete deployment and listening boundary

Private build, inventory, exact destinations, baseline hashes, disabled session template and approval scope are retained under `.local/playable-street01` and `.local/playable-15/build-street-prototype02`. The reviewed game executable is 1.0.1158.16; all eleven protected installation files and four saved settings matched their retained hashes. Installed DirectStorageFix, loader, SHV, RPH, existing mods and the empty OpenIV quarantine marker were inspected read-only and preserved.

After my approval of the concrete private manifest, the procedure is:

1. Reverify the source/package hashes, installation baseline, absent owned paths and absent game/RPH/RichAudio processes. Stop on drift.
2. Back up the exact existing `Plugins/RichAudio.dll` to the declared absent same-volume backup. Temporarily install only the new plugin, retained native ASI and private-package pointer. Record exact ownership and hashes. Keep source banks, host and Node outside GTA.
3. Launch once through my existing `Launch RAGE Plugin Hook.cmd`. Bind a fresh nonfixture, recording-OFF lease to the independently observed new Enhanced PID and creation time. No old coordinator or consumed approval is reused. Stop for a new loader, integrity or DirectStorage error.
4. In offline Story Mode, settle on the engine-running Bati. Issue `RichAudioBatiAudioOn`, then `RichAudioHandoffStart` once and close F4. Within at most 90 seconds of active listening, compare idle/revs, gentle acceleration, camera rotation, and airflow at increasing safe speeds. Use OFF/ON up to twice while the same provider remains fresh. Console/pause transitions can retire this strict demonstration; retirement ends the attempt. No dismount/remount recovery is promised. Do not assess building reflections in this build.
5. Issue OFF and `RichAudioHandoffStop`, exit normally and verify all owned lifetimes closed. Remove only exact receipt-owned ASI, pointer and fresh lease; remove the exact candidate DLL, restore the verified backup and recheck the original eleven files/four settings. Retain logs and packages. Refuse unexpected bytes; no broad deletion or hot replacement.

The proposed envelope is one launch, at most fifteen minutes including startup and normal exit, at most ninety seconds active listening, with the existing hard 120-second provider limit and eight-second playback join. Existing 1.5-GiB owned runtime process-job limits remain. No recording, capture, native suppression, game archives/cache modification, quarantine change, automatic fault retry, deployment beyond this payload, proposal12 or PR merge is included. A startup failure consumes the attempt and is reported.

The decision now is approval of this concrete direct-Bati listening session, with its timing and additive-audio limitations. Genuine environmental integration remains a separate subsequent milestone.
