# PLAYABLE-10: one diagnostic-only runtime identity measurement

**PROPOSED ONLY. Not deployed or authorised.** User PLAYABLE-10 §8 requires fresh explicit approval. Prior PLAYABLE-09 approval was consumed. This proposal authorises neither a passive handoff nor a listening test.

The exact new managed diagnostic is 66,560 bytes, SHA-256 `cb2555ba00169af86d2728ba545c808a825df0ab04ba08026f1268e02d3caf3a`. Private candidate directory: `.local/playable-10/candidate/`. Installation manifest SHA-256 `d57027bf0a6cb554b94674a9f5101f9033522ff65ed0a182689413d314bf9839`; rollback manifest SHA-256 `7405c888caa84d062ccdbddf784f4fd4c1ff79cc16cbec7108b8843b1bf3d802`. Exact paths and baseline inventories are in those private manifests. [Public candidate summary](../evidence/playable-10-candidate.json).

## Narrow procedure after separate approval

1. Recheck the exact payload, build/profile receipts, 11 protected files, four settings, stock fallback, disabled loudness/recording flags and absence of game/RPH/owned processes. Refuse changed, linked or occupied owned paths. No framework or audio installation changes.
2. Install only `Plugins/RichAudio.dll`: create and pin a pending copy, flush and verify the approved hash/length; move the verified original plugin to an absent same-volume owned backup; move pending into place and verify both. Record exact operation ownership. Do not install or delete any ASI.
3. Launch GTA Enhanced **once** through the existing reviewed RPH route. Stay in offline Story Mode. No Bati, arming chord, driving phases or target native call is needed. The new plugin waits at most 60 monotonic seconds for its diagnostic lease, yielding with `GameFiber.Sleep(50)`.
4. Once the actual game PID and kernel process-creation FILETIME are known, create the strict lease from the reviewed template, recording its exact bytes, length, digest and ownership. Use create-only pending storage and verified atomic rename to `Plugins/RichAudio.RuntimeProvenance.json`. Its state must remain `UNREVIEWED`, diagnostic true, source/audio/ASI false. The all-zero template identifiers are deliberately not a valid lease.
5. Permit one provenance capture. Independently retain the private report and terminal RPH log if written, including individual old hash/version comparisons. Record missing, failed or unobserved completion honestly. No automatic retry, plugin reload, second launch or alternative candidate. A normal complete report still rejects `api-runtime-policy-unreviewed`; that is expected diagnostic completion, not source acceptance.
6. Exit GTA normally, verify game/RPH/owned-process exit, then perform the ownership/hash-verified rollback below. Preserve reports and logs privately. Publish only sanitised observations and digests. Independently review runtime distribution provenance before preparing any subsequent passive candidate; never promote the observation in this session.

## Bounds and limits

- One entry/capture; 60-second monotonic lease wait. Invalid existing lease ends immediately. No automatic retry.
- Lease at most 8 KiB; inspected files at most 64 MiB each; recorded strings at most 1,024 characters; final report at most 32 KiB. Existing report/session output is never overwritten. No ongoing telemetry or journal.
- Deadline checks do not preempt native/OS/CLR/RPH calls, hashing, reflection-only metadata reads or flushes. No watchdog can guarantee recovery from a hang, fatal error or process/fibre abort. Missing completed output is unobserved, not a pass. No forced termination is implied by this proposal.
- Bootstrap or installed-scope failure can occur before core capture; retain bounded terminal logging when available. A report file alone does not establish caller survival or authentic runtime provenance.
- Same-user/equivalent-privilege tampering is outside the guarantee. Session context is not independent human authentication. Signature availability is not a verified signature or trust chain.
- No source attachment/Open/BEGIN, clock calibration, vehicle binding, gameplay publication, target native, audio host, source playback, endpoint capture, menu, loudness or recording. The binary contains none of those components.

## Exact rollback ownership

After verified process exit only:

| Owned path relative to game | Permitted action |
| --- | --- |
| `Plugins/RichAudio.dll` | Remove only the recorded temporary file matching approved 66,560-byte `cb2555ba…` payload. Refuse unknown or changed bytes. |
| `Plugins/RichAudio.dll.playable10.pending` | Remove only if owned and matching the same exact payload. |
| `Plugins/RichAudio.dll.playable10.original` | Verify original 222,208 bytes and SHA-256 `611347ab5828bedf0bd71102e4df125ed13666f6a7e7e3eccbc761a76a7fb657`, then restore to an absent plugin path without overwrite and verify again. |
| `Plugins/RichAudio.RuntimeProvenance.json` and `.json.playable10.pending` | Remove only files matching the generated lease ownership receipt's exact hash and length. Never use a wildcard. |

No recursive deletion, other ASI removal or capture deletion is permitted. If any owned file changed, stop and preserve it for review. Verify all 11 protected files/four settings, stock fallback, disabled flags and owned-path/process absence afterward. Historical PLAYABLE-09 candidates and evidence remain untouched.

**GO: request approval for this diagnostic only. BLOCKED: actual runtime authentication, passive handoff and all audio development that depends on it.**
