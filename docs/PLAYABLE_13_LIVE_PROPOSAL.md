# PLAYABLE-13: exact live proposals — approval required

**Prepared only. No deployment, launch, playback or recording is authorised.** The consumed PLAYABLE-12 approval does not apply. Phase B and Phase C require separate explicit approvals; Phase C also requires accepted genuine Phase B handoff evidence.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Phase B passive `Plugins/RichAudio.dll` | 343,040 | `720812a0ff9af2890bcc05da998bca17c6db0746145bd76601480e899f07f8e9` |
| Phase C audible `Plugins/RichAudio.dll` | 349,184 | `182903fbcc7ed6e87b5fa20de9f4c78a48d5e9fe796cad18cb8e9fc1875d7b4b` |
| Shared unchanged `RichAudio.OperatingState.ShvHandoff.asi` | 129,024 | `05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40` |
| Private WASAPI host, Phase C only | 306,176 | `5c64559983b81a19b0c66c7f01fb19a3b584eef30a9980ed6ef2296b5b611f42` |

These exact bytes were rechecked in `.local/playable-13/candidate-final/`; candidate receipt SHA-256 is `f3c4770a6b642f41fa83240331185f95e25ed05518f1b1bc8e5af00a7dae2fdd`. The passive installation manifest is `7f634f89a87c4d2976735080203ba1a0a13502bbc19fc2de37d9567c2211aa89`, rollback manifest `9168e3db67df90e1ebd8a9d2ac39fbb8ee1eb5aa1e9d67b3d78fcaf68b9fd970` and preflight `2353c946d553ee6d014480b73ed6df6937f56a9e3b32e407855d1c06f683d2e9`. The exact private package manifest, pointer, lease templates and both modes' manifests are bound in [candidate evidence](../evidence/playable-13-candidate.json). Recheck them before deployment; no substitution is allowed if any bytes drift. Earlier partial candidate/build directories are not this candidate.

The original plugin to restore is 222,208 bytes, SHA-256 `611347ab5828bedf0bd71102e4df125ed13666f6a7e7e3eccbc761a76a7fb657`. All 11 protected files and four settings fingerprints must match the saved baseline before and after the test. Game Enhanced 1.0.1158.16, stock fallback and disabled production flags remain required. No runtime distribution-authentication gate is added.

## Phase B — one passive confirmation

Approval must explicitly permit **one deployment and one Enhanced/RPH launch** using only the passive plugin and shared native hashes above, following this procedure. RichAudio playback, recording and WASAPI access remain excluded.

1. Recheck exact build/source/package pins, 11 protected files/four settings, original plugin backup path, disabled feature flags, saved stock fallback and absence of game/RPH/RichAudio processes and owned ASI/lease/pending/backup/pointer paths. Stop before deployment if anything differs. Preserve before-logs.
2. Follow the passive installation manifest: create only exact receipted pending files, flush/hash them, atomically back up the exact original plugin and install this passive plugin and unchanged producer. The private audio package is not installed in the game. A partial failure requires ownership-verified rollback and no launch.
3. Start the read-only startup observer alongside the independent monotonic coordinator. Invoke the existing reviewed Enhanced/RPH route once. Observe Steam's actual `ShowGameArgs` continuation and any `ShowInterstitials` continuation, not just a dispatched click. Observe exact Enhanced path, PID and kernel creation time before generating the fresh 21-field lease. Do not change arguments/frameworks or invoke another launcher. The startup observation cap remains 120 seconds; failure consumes the attempt. Preserve the actual final stage rather than assuming its cause.
4. In offline Story Mode, use the qualified living player-driven, engine-running Bati. Require the native ABI/Open, measured clock map, functional RPH calls and independent vehicle/driver/pool/address correspondence to succeed. Unknown diagnostic RPH hashes do not reject. A compatibility, ownership or data failure retires terminally.
5. At `ready-for-operator`, use `RichAudioHandoffStart` once. Collect idle, gentle changing throttle, ordinary acceleration/deceleration and camera motion. Verify genuine changing raw float32 engine-state values, their exact gameplay scalar/timestamp lineage, real motorcycle pose/listener data, source sequence and clock bounds. No guessed RPM or synthetic telemetry is permitted.
6. Before the active limit, leave the motorcycle deliberately. Require permanent retirement, no current operating state and no accepted replay beyond original expiry. `RichAudioHandoffStop` is the manual stop. An earlier terminal failure ends the test immediately; no second operator session or retry. Do not label an unobserved stream-loss challenge as live proof.
7. Retain private native returns, admitted observations, independent identities, clock maps, gameplay frames, retirement and actual callback/FIFO/writer completion. Stop request and completed quiescence are distinct. Missing, aborted or unobserved data cannot pass.
8. Exit normally. Independently verify exact game/RPH/owned process lifetimes ended, then perform the ownership/hash/length-verified rollback below. Verify all protected files/settings, saved fallback, disabled flags and no owned paths/processes. Report PASS only if genuine handoff, safe retirement, intact evidence and restoration all pass; otherwise BLOCKED with the actual reason.

The unchanged producer permits at most **300 seconds waiting**, **120 seconds active**, **2,400 target native attempts** and **20 Hz** (50 ms minimum interval), with a 128-record FIFO. Writer bounds remain 128 queued items, 4,801 source rows and 12 MiB aggregate. Existing setup/clock/operator waits and the 500 ms returned-control drain bound remain. Application deadlines cannot preempt a stuck native/OS call; an independent supervisor must track completion rather than chat/UI pacing. Stop at the first terminal condition. No second launch, automatic retry, native sound suppression, feature activation, recording or configuration edit is included.

**Next approval requested:** the exact Phase B passive test above only. An explicit affirmative authorisation must identify these two hashes and this proposal before any live step.

## Phase C — separate approval after genuine passive acceptance

The audible candidate is implemented and staged now so that Phase B does not lead to another development-only round. The private package manifest is `c4406978e5f97384f4b3ddab26ebbecfd67529a9665d021419275b90c785f750`; the 219-byte pointer is `1bf2c9ba802d7b20437fe883888ab46168aedb619a3ab1e3436e1a249d30c2ee`. Phase C must name the exact audible plugin, unchanged producer, private host/package manifest and pointer digests; allow one deployment/launch and one provider session, capped by the same 300-second wait/120-second active/2,400-attempt/20 Hz limits. It must explicitly authorise additive WASAPI output while retaining GTA stock audio. Approval is invalid if the accepted passive evidence no longer applies or any artifact/baseline differs.

The audible installation manifest adds only `Plugins/RichAudio.Bati13.json`, a hash-bound pointer to the private package. The strict 24-field lease binds that pointer and the exact session/process/caller. Audio starts disabled; the operator separately uses `RichAudioHandoffStart`, then `RichAudioBatiAudioOn`. Use `RichAudioBatiAudioOff` before leaving the motorcycle and verify the fade; the independent accepted-state watchdog also retires safely if state expires. A deliberate Off/On is allowed only while the same provider remains valid and only if included in the approved listening procedure. No automatic retry follows faults or retirement.

Follow [the short listening procedure](PLAYABLE_13_LISTENING.md). Human listening, source PCM, processed PCM and endpoint evidence must be reported separately. Nonzero PCM alone cannot establish a playable result. Engine-off/restart telemetry, other vehicles, NPC traffic, global loudness activation and native muting remain excluded.

### Optional recording in that same first audible session

Recording is ready for an optional, separately specified per-run approval. To select `session-lease-template-recording.json` (template SHA-256 `1d7fa85958a3baae51195141edd6580f140d00288193b927672ba36b81f6f18c`), the Phase C approval must explicitly authorise **actual RichAudio stereo PCM and WASAPI loopback from the selected output endpoint**, synchronised diagnostics, up to 120 seconds/128 MiB, private lossless WAV retention and automatic post-session analysis. The default audible lease keeps both recording flags false. No microphone or global feature activation is included.

Capture attaches the existing owned output tap and loopback to the actual selected endpoint. Record capture startup, coverage and faults honestly. If the recorder/loopback cannot start or reaches a terminal fault, stop capture, preserve incomplete files/reason and continue the already approved listening demonstration if playback itself is healthy. Do not retry recording or delay the first demo for new capture development.

After output/host shutdown, run the supplied finalizer automatically as a coordinator completion step. It validates ownership/finalized WAV digests, analyses recorded files, retains waveform/spectrogram SVGs and objective findings/recommendations, and verifies unchanged source recordings. Its availability limits and lack of subjective listening are mandatory report fields. No posting of private recordings to GitHub or external services is authorised.

## Rollback for either phase

Require normal GTA/RPH and owned host/Node exit before removal; do not hot-unload. Use the exact installation receipt to remove only this attempt's unchanged ASI, generated lease, optional pointer and pending files with matching path/hash/length. Refuse unknown or changed bytes. Remove the owned candidate plugin only after verifying it, verify the exact original backup and move it to the absent original path. Never recursively delete or modify third-party runtimes/settings.

Recheck all 11 protected files, four settings fingerprints, saved stock fallback, both false feature flags and absent owned paths/processes. Keep private packages, logs, recordings, analysis and creation/rollback receipts. A restoration failure is BLOCKED and requires reporting the actual remaining state, not automatic relaunch or replacement. Each approval covers one attempt only.
