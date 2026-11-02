# AW-01: camera/source continuity, offline only

I want camera changes to preserve a still-qualified Bati source, and I want loss of driver scope to remain distinct from observed engine shutdown. Codex implemented the opt-in `continuityPolicy: 'camera-source-01'` on the existing `StockGameplay` and listener playout. The default remains `baseline`; this work does not deploy or change my installed game, original recordings, source banks, DSP, gains or live approval.

## Recorded baseline and reproducible boundary

Codex remeasured the original retained Float32 WAV: the two internal near-silent windows are exactly 4,301 and 4,835 frames, or 89.604 and 100.729 ms at 48 kHz. Both channels must remain at or below absolute `1e-6` for at least 20 ms. These samples and original frame/expiry bits remain unchanged.

The code explains an avoidable part of the interruption: each camera generation discarded listener presentation records and vehicle pose brackets, reanchored the observation clock, and waited for the 100 ms retrospective target to reach the new first pose. Dry source rendering paused during that wait even though vehicle identity remained qualified. Retained interpolation brackets independently recover clock-phase changes of approximately +12.1723 ms and -14.2208 ms at the two boundaries.

The trace contains full published observations and host delivery rows, but only one Node timing sample in eight blocks. It does **not** retain the exact acceptance block of every Node command. The replay therefore uses an explicit constructed schedule: original host write-after times mapped by the retained first-generation clock, admitted before the next 512-frame render block. It preserves observations and leases; it does not pretend to reconstruct unrecorded Node scheduling or the exact live WAV.

| Same constructed schedule, original private Bati banks | First camera quiet interval | Second camera quiet interval |
| --- | ---: | ---: |
| Original sealed gameplay module | 89.646 ms | 89.917 ms |
| Current default `baseline` | 89.646 ms | 89.917 ms |
| Opt-in `camera-source-01` | 47.167 ms | 47.229 ms |

The original and current default replay PCM are sample-identical: SHA-256 `be5d36be1d842ef47be8ea3b5d48496ac125b687518b550d07156654b5516e92`. The opt-in replay has one source creation, no source-object replacements or frame regressions, and no missing-history, future-read, affected-history or limiting faults. Private WAVs and per-block lineage remain under `.local`; [sanitized evidence](../evidence/acoustic-world-01-continuity.json) records their fingerprints.

## What the opt-in policy changes

The fixed QPC/audio anchor and bounded arrived listener records survive a camera-only generation change. Sampling is piecewise: it never interpolates between camera generations or uses the new pose at an earlier presentation timestamp. The existing 50 ms forecast ceiling remains unchanged. A longer unobserved listener interval is reported as `generation-gap` and remains unavailable. Spatial path/Doppler/PCM epochs still reset through the existing causal pipeline.

Independent source pose brackets survive only while representation, clock, identity and original lease remain valid. An existing dry/grain source can advance through a listener-only gap. New sources still need a qualified listener. Pause, invalidity, original source expiry, source teleport and identity changes remain separate safety boundaries. The residual approximately 47 ms replay intervals are **not** an uninterrupted-audio pass: an earlier camera baseline was withheld, and the implementation does not invent the missing listener observations to hide that fact.

Lifecycle diagnostics distinguish source absence/identity change, source expiry and unavailable pose from an actual accepted `running=false` observation. The opt-in source applies a discrete false state only at or after its original observation time, rather than early from a later interpolation endpoint. Source scope loss never fabricates ignition-off or a natural engine rundown. My original binary-OFF feedback remains unresolved; continued post-dismount eligibility needs separately validated observations/provider ownership.

An independent original authored fixture also restores each reset separately. It skips one camera observation and moves the listener by 20 authored units; its propagation distances are intentionally separate from my live trace:

| Authored ablation | Source creations | Dry-source paused blocks | Listener unavailable blocks near the change |
| --- | ---: | ---: | ---: |
| Original reset policy | 1 | 9 | 9 |
| Preserve vehicle history only | 1 | 0 | 9 |
| Preserve listener history only | 2 | 0 | 4 |
| Combined opt-in policy | 1 | 0 | 4 |

All four cases have zero affected-history faults. The original policy preserves the source object but pauses its grain clock; listener retention alone exposes the separately cleared vehicle pose history and recreates the source. The combined policy avoids both failures while the spatial epoch remains independent. Its authored quiet interval is 54.688 ms, versus 150.688 ms for the original policy. These durations include the authored changed-distance propagation and are not substitutes for either the exact live WAV windows or the retained-data replay measurements above.

`setQualifiedStaticScene` is a separate branded, session/world/generation-bound entry for original authored static fixtures. Its explicit offline experiment horizon is not a fabricated live-observation lease. Invalidating that exact world generation returns to the existing conditional direct scene without replacing source DSP.

## Validation and reuse

The focused suite exercises common-clock retention, no cross-generation interpolation, the unchanged prediction/expiry ceilings, clock/representation/kind reset, genuine grain-clock continuity, teleport/identity refusal, explicit engine-state timing, scope-loss classification and branded static-scene invalidation. Existing listener generation/playout, gameplay/source ownership and acoustic-streaming regressions also run with the retained full private fixture package; none is skipped in that run.

Run `node --test tests/Test-AcousticWorld01Continuity.mjs tests/Test-AcousticWorld01Ablation.mjs`. The private replay runner is `tools/Run-AcousticWorld01Continuity.mjs`; it requires explicit retained package, capture, journal, original module and new private output paths. It opens no endpoint. This evidence does not establish live camera audibility, physical speaker latency, natural shutdown, installed building geometry or a new live authorization.
