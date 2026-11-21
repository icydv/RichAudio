# PLAYABLE-15: one recorded Bati follow-up

**Prepared only. No deployment, GTA/RPH launch, playback, real endpoint or recording is authorized.** This proposal requires the owner's fresh explicit approval for exactly the scope below. The earlier Stage B approval is consumed. The accepted first audible result and passive camera-recovery result remain unchanged; no repeat passive milestone is proposed. PR #76 remains draft and unmerged.

## Exact candidate

Use only `.local/playable-15/candidate-recording-recovery-02/audible`, pointing to the private `build-recording-recovery-03/package`. The rebuilt host contains recorder recovery and bounded timing diagnostics. The RPH/native binaries are unchanged. All 133 package bindings and 34 host-source pins were checked; source banks, calibration, settings and buffer limits match the prior package.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Audible managed DLL | 387584 | `a474df2201b6aa3a370029af479c4f4f62ad6958dfd4f72c7cb8420e2ec7ec5e` |
| Native SHV producer | 129024 | `05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40` |
| Corrected WASAPI host | 324096 | `ebdf8df6563bb38480bfd84484247886f63ac3ac395c36ea08bd874eb26f6988` |
| New private-package pointer | 238 | `87ee2b12e1d4231547d960523e94ea8952955ecdf74a562ebec369f79fed6f4b` |

| Bound receipt/manifest | SHA-256 |
| --- | --- |
| Build receipt | `2c13ab8fffd84e58b35f70071f06c82bb85da2d74f3d6c845890aef39cdc0156` |
| Exact-artifact component validation | `e45afb73c3a680023636fc03647aa119781b7809a0d72789b1ecaad7e5a0fa68` |
| Candidate receipt | `fbd3b8a03601fa6aada0966dfd7e993b291142b48b220d0410b58518e6a5afc3` |
| Package manifest | `68217b8b15a24f1ad395a39ed3a29938ffd579e6e2fecf082bf8f1c2a1ea52cb` |
| Audible installation manifest | `8db6e234f5e4cf29064e83175cc92339ed61afcdd9085cebe1d2d38489bbca4c` |
| Audible rollback manifest | `9c08aca1b183b30b043b5904c41aaf26d1ae610b245e4af34e44e603de9373f9` |
| Selected 24-field PCM+loopback template | `b0cae2ea47c0d5609ecd9aabee3617d0785fe0b3a90687e9e7f6d8977d127ffa` |
| Default recording-disabled template | `e29e7a3609d22e07fa39b1fe8b03c0863fc9df723f34947052d411a710260965` |

The recording-enabled template is selected only by explicit approval for **final RichAudio PCM plus the actual selected playback endpoint's full loopback mix**. It includes stock GTA and potentially other endpoint audio. No microphone or additional stem capture is included. Template identity is not a valid runtime lease: fresh session, exact newly observed process PID/kernel creation time and creation receipt remain required. Permissions are fixed at initial load.

## One controlled attempt

1. Reverify the protected baseline `8fce329188b82f650f7885e40e54243f8c43bb3a0816ef994dc112d34763b642`: all 11 protected files, four settings, stock-fallback/F10, both disabled global production flags, absent owned/pending/backup paths, and absent game/RPH/owned-host processes. Reverify all candidate, package, source and reviewed coordinator pins. Retain the accepted Stage A and first Stage B restoration receipts. Do not reuse an old authorization, session, consumed operational directory or helper bindings.
2. After approval only, create a fresh one-shot authorization bound to this proposal, the candidate/manifests, recording-enabled template and newly reviewed preparation receipt. Deploy exactly once with ownership receipts and same-volume verified backup of the original 222208-byte plugin (`611347ab5828bedf0bd71102e4df125ed13666f6a7e7e3eccbc761a76a7fb657`). Install only the native producer, temporary managed DLL, private pointer and process-bound lease described by the installation manifest. Source banks and recordings stay outside the game.
3. Launch the existing reviewed Enhanced/RPH route exactly once, observing Steam acceptance and the exact new game lifetime. Keep the existing 120-second startup and 300-second waiting limits. In offline Story Mode, living player driving an engine-running Bati, run `RichAudioBatiAudioOn` once, confirm enable waiting for fresh state, then `RichAudioHandoffStart` once and immediately close the console. No menu/settings change during listening.
4. Aim for 30-40 seconds of active, continuously recorded output: roughly 5 seconds idle, gentle stationary revving, then gentle slow driving. Make one safe ordinary third-person/first-person camera transition while active and report its direction/time. Retain exact telemetry, source/camera-generation, queue and recording state. The owner reports heard response, interruptions and quality separately from numerical evidence. Do not adjust sound balance, volume, EQ, spatial settings, DSP, buffers or expiry.
5. Dismount once around 30-35 seconds. Require source retirement, completed software fade/output drain, final recording manifest and owned host/Node exit. Do not remount or start another session. An independent monotonic observer requires permanent `RichAudioHandoffStop` at 45 active seconds if retirement has not occurred, or earlier on identity/freshness, output, host or genuine recording failure. A valid initial-discontinuity warning alone is not a failure. After a loopback failure, preserve independent PCM through the controlled ending; never discard it or retry. At most one explicit Stop command is allowed. A stop request is distinct from completed queued audio/fade and physical silence.
6. Exit normally and verify the exact game/RPH/host/Node lifetimes are absent before rollback. Use only exact creation receipts, lengths and hashes for owned files/lease/pending paths; refuse unexpected content. Restore the verified original plugin, then independently rehash all 11 protected files/four settings, stock-fallback/F10, false production flags and absent owned paths/processes. Preserve private packages, original recordings and new evidence. No recursive deletion, hot replacement, automatic recovery, second deployment, second launch, second Start or retry.

The native backstop remains 120 active seconds, 2400 attempts and 20 Hz; original source expiry remains 250 ms. The separate 45-second observer is a stop-request bound, not OS/native preemption or an instantaneous speaker-silence guarantee. Prior combined model/running retirement did not establish direct driver-loss cause; the next result must retain the actual cause and operands available rather than assume them.

## Measurement and acceptance

After finalization, verify file hashes/lengths before analysis. Use the package-pinned Node and analyser from the package root, with a new private output directory:

```powershell
& 'runtime/node.exe' 'tools/Analyze-Playable13Recording.mjs' `
  --session '<exact stopped host recording directory>' `
  --output '<new private .local/playable-15 analysis directory>'
```

Require sustained nonzero owned PCM, submission/WAV frame agreement, packet/byte association, visible startup uncertainty and fault status, and retained clock/source lineage. A successful finalized capture does not imply full start coverage or established synchronization. Report retained duration and missing prefixes/tails separately. Join selected source-bracket listener sequences with the original native acquisition/mapped interval in the private SHV journal; the vehicle wire tick itself is pose timing. Preserve Node/host mapping intervals and uncertainty.

Report recorded PCM/loopback offset only if continuous packet timing, explicit Windows QPC identity and a unique waveform match across independent windows support it. Otherwise report unavailable, including ambiguous repetitive engine signals or stock/mixed endpoint interference. Separate observation age, control scheduling, processing, stdout/ring residence and submission/capture timing. Do not add configuration values into a latency measurement. Physical speaker latency and the original physical throttle-change instant are not measured by these captures.

The complete scoped pass requires substantial continuous capture, normal idle/rev/gentle driving, a recorded safe camera transition without unexpected interruption, no stale/replayed audio, completed fade/retirement and independently verified restoration. Missing evidence is a partial result, never authority to repeat. See [recorder recovery](PLAYABLE_15_RECORDING_RECOVERY.md), [latency provenance](PLAYABLE_15_LATENCY_DIAGNOSTICS.md), and [offline evidence](../evidence/playable-15-recording-recovery.json).

This exact proposal and candidate require independent review before approval. Preparation creates no live authorization or operational attempt directory. The previous Stage B helper set is bound to different hashes and must not be executed for this candidate.
