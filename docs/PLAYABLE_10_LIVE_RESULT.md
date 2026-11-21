# PLAYABLE-10: launcher/API mismatch measured

**The one authorised diagnostic succeeded. The actual API has different bytes from the reviewed launcher and the same FileVersion. Runtime distribution provenance remains UNREVIEWED; handoff and audio remain BLOCKED.** The original installation is restored, all 11 protected files/four settings match, and owned probe paths/processes are absent.

This actual result supersedes the readiness status in the frozen [preparation report](PLAYABLE_10.md), [proposal](PLAYABLE_10_LIVE_PROPOSAL.md) and [candidate receipt](../evidence/playable-10-candidate.json). Their exact-artifact approval was granted and consumed by this single attempt. No second launch, revised candidate or further live test is authorised.

## Actual result

The approved 66,560-byte plugin, SHA-256 `cb2555ba00169af86d2728ba545c808a825df0ab04ba08026f1268e02d3caf3a`, loaded through the existing reviewed RPH route on 1 November 2026. Its strict lease matched the observed game process and kernel creation time. No diagnostic ASI was installed.

RPH logged entry at 14:31:57.021 and terminal completion at 14:31:57.520. The terminal was **`api-runtime-policy-unreviewed`**, `reportWritten=True`, 8,687 bytes, SHA-256 `ce2155c918c6cfc3e16f1ecaa9a3574c6f864084dd208749a2d135e772f47326`. The independently retained report has that exact length/digest. Its internal monotonic capture interval was 70.0792 ms; that interval excludes bootstrap/installed-scope work and is not a whole-launch latency measurement.

| Operand | Installed launcher | Actual assembly supplying `Rage.Game` |
| --- | --- | --- |
| SHA-256 | `73f05b3f7973d4731f4151ae061dd3c991065e8bf3ece51ea1d9ab728b9b42ac` | `ea18ddff9ccd41898a9bdc8c2ec2b7866176543e126810279e8732ab2e0a6d62` |
| Bytes | 12,237,182 | 28,720,128 |
| FileVersion | `1.132.1428.17748` | `1.132.1428.17748` |
| Location | Reviewed installed executable | Different temporary DLL; sensitive path/token retained privately |

The actual API full name is `RagePluginHook, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null`; module `RagePluginHook.dll`; MVID `4c493f3e-e913-497c-a0d6-b293f9b8c3ef`. The actual assembly reference was present in the current AppDomain and was not dynamic. File and loaded metadata agreed, the file remained stable during inspection, link count was one, and no capture error was recorded. The certificate table was absent and the public-key token empty; signature/chain verification was not performed. None of those metadata observations authenticates a distribution.

The caller was the exact approved `cb2555ba…` plugin, including its RPH cache copy. Fourteen individual scope/caller/capture checks passed; seven API-policy checks remained unreviewed, with null expected API operands. No observation became policy. Source, Open, BEGIN, gameplay and audio permissions all remained false in the report. The terminal caller log independently reports false source/handoff/audio permissions and false provenance match.

The report and a read-only, pinned/hash-verified copy of the observed API bytes were preserved privately before exit. That byte witness was never installed or executed separately. The private index and logs are referenced by digests in [sanitised live evidence](../evidence/playable-10-live-01.json); no proprietary runtime, sensitive path, process/session ID or absolute QPC is published.

## What is proved and what remains unknown

In **this PLAYABLE-10 run**, evaluating the obsolete PLAYABLE-09 API-versus-launcher rule gives **hash FAIL, FileVersion PASS**. The assumption that the launcher digest also identifies the loaded API is directly contradicted by the measured distinct files and bytes. This resolves the identity-model error without weakening the check.

The same conflation is the most practical explanation for PLAYABLE-09's combined rejection. However, PLAYABLE-09's actual operands were never retained. This capture cannot retrospectively prove its precise API hash/path or which operand failed then. The [historical live result](PLAYABLE_09_LIVE_RESULT.md) remains unchanged.

The capture establishes which file supplied the typed API in this process. It does **not** establish an independently authenticated distribution/extraction chain from the reviewed launcher to those bytes, prove the extraction mechanism, prove stability across future launches, or establish a framework defect. Temporary placement, matching version/name/MVID or an observed hash alone cannot approve a runtime. The production policy therefore remains UNREVIEWED. The earlier restricted Bati telemetry acceptance is unaffected; no vehicle native or source telemetry was sampled here.

## Scope, exit and restoration

The single-player world was visually observed before normal exit; no vehicle action was needed. The diagnostic ran automatically after RPH startup. No game-mode native was queried, and no separate mode timestamp was attached to the capture. There was no source attachment/Open/BEGIN, binding, clock calibration, gameplay publication, RichAudio audio host, playback, endpoint capture, menu service, loudness or recording. No producer/FIFO/native-call counters were sampled; initial/default or absent values are not presented as measured counters.

The normal quit prompt was observed and confirmation input returned successfully. Window disappearance and game/RPH process exit were independently verified. No force termination or second launch was used. Exact ownership/hash-verified rollback removed only the temporary managed plugin and its generated lease and restored the original 222,208-byte plugin, SHA-256 `611347ab5828bedf0bd71102e4df125ed13666f6a7e7e3eccbc761a76a7fb657`.

All 11 protected files and four settings fingerprints match. Stock fallback and disabled modification-aware loudness/synchronised recording remain selected. The 723 original tracked files, 579 pinned PLAYABLE-09 private files and all compiled diagnostic source pins remain unchanged. No ASI was deployed or deleted, no recursive deletion occurred, and all private captures remain retained. [Rollback evidence](../evidence/playable-10-live-rollback.json).

Independent read-only review checked the raw report, matching caller completion, retained API witness, sanitised findings and rollback receipts. It found no contradiction in the diagnostic result; distribution authentication remains the blocker. [Live review](../evidence/playable-10-live-review.json). No implementation changed after the passing offline suite; no fixture rerun is represented as new live evidence.

## Next actionable step

**GO: targeted independent provenance review. BLOCKED: accepting `ea18ddff…` in a passive provider, another launch, live handoff and audio.** Do not create a reviewed policy from this observation alone. No new live experiment is justified until the missing distribution provenance is addressed.

Use the official maintainer channel referenced by the retained [upstream report](UPSTREAM_RPH_ENGINE_TELEMETRY_REPORT.md), without submitting automatically. The narrow question is ready:

> With the reviewed 1.132.1428.17748 launcher digest `73f05b3f7973d4731f4151ae061dd3c991065e8bf3ece51ea1d9ab728b9b42ac`, the typed `Rage.Game` assembly in one Enhanced 1.0.1158.16 run had digest `ea18ddff9ccd41898a9bdc8c2ec2b7866176543e126810279e8732ab2e0a6d62`, 28,720,128 bytes, the same FileVersion and MVID `4c493f3e-e913-497c-a0d6-b293f9b8c3ef`. Can you authenticate this API artifact or provide an official verifiable distribution/extraction relationship and a supported identity-verification method? Is its temporary location/byte identity stable by design? Our plugin kept the runtime unreviewed and never opened a source.

Do not attach the private DLL, paths or logs externally without separate authorisation. This is a provenance question, not a newly demonstrated native bug. The existing upstream native report remains unsubmitted. Any future passive candidate needs defensible separate launcher/API identities, offline regression and independent review, then fresh exact-artifact approval. The eventual listening and synchronised audio-analysis requirements remain unchanged.
