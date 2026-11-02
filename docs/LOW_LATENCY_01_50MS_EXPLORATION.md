# LOW-LATENCY-01 — why 50 ms is not qualified

I asked for aggressive delay exploration without sacrificing continuity or weakening the camera/physics protections. After the 75 ms candidate and CI were complete, Codex checked a private 50 ms variant against the same retained Bati inputs. **The 50 ms variant is not qualified by this comparison. The published 75 ms profile is unchanged.**

The private harness creates a fresh anchored `ListenerPlayout` with 50 ms before accepting any observation or rendering a frame. It keeps the original 50 ms forecast ceiling, source expiry, identity checks, source banks, gains and acoustic solver. It does not introduce a production profile, change a live binding or edit an approved artifact.

With baseline continuity, three 75 ms arms complete 1,594,368 frames: retained deliveries, authored 0–15 ms jitter, and every-eleventh-sequence omission. All three 50 ms arms stop at attempted frame **612,352 / 12.757333 seconds**, when the unchanged `CausalSimulation.observe` throws `undeclared position discontinuity`. The retained 75 ms PCM still matches the earlier fingerprint. Completion is not a dropout-free claim: the 75 ms omission case also reports prediction expiry and source recreation.

This is a rendered **listener** transition within camera generation 2: a previously forecast pose (6.467 ms forecast age) is followed by an interpolated pose. Its 1.212837-unit step over 10.667 ms implies approximately **113.7035 model units/s**, exceeding the existing 100-unit/s guard. The selected engine/exhaust emitter steps stay below 14 model units/s. The original adjacent camera observations imply approximately 65.797 native units/s over 55.936 ms; this is not evidence that the raw camera itself crossed the guard or that GTA units are calibrated metres.

For a fair comparison, prediction counts below use the same **1,196 successfully rendered blocks** before the failed 50 ms block, rather than comparing its partial run with a complete 75 ms run:

| Baseline-continuity delivery schedule | Listener prediction blocks, 75 ms | Listener prediction blocks, 50 ms |
| --- | ---: | ---: |
| Retained | 4 | 185 |
| Authored jitter | 12 | 338 |
| Authored omission | 83 | 244 |

Omission-related `prediction-expired` blocks increase from 1 to 33 in that matched prefix. Partial 50 ms processing/age distributions are not presented as full-run throughput or latency results.

Codex also checked the combined camera policy, to avoid attributing the failure only to legacy camera reanchoring. With `camera-source-01` in both arms, retained 75 ms completes 3,114 blocks with one source creation; retained 50 ms hits the same listener guard at the same attempted frame and speed. The combined-policy jitter/omission arms were not run after that clear retained-input failure. No guard was relaxed, failed source resumed or listener pose fabricated.

The first private harness stopped on the uncaught original exception and was preserved. A new harness recorded each arm's failure independently; a third checked the combined policy. Their receipts, sources and original package bindings remain private and hash-bound in [sanitized evidence](../evidence/low-latency-01-delay50.json). Independent review confirmed the failing entity, unchanged throw path, matched-prefix counts and both continuity-policy scopes.

This supports keeping 75 ms for the present candidate. It does not establish a universal minimum history delay, rule out a different independently validated design, measure physical camera speed or prove speaker latency. Addressing prediction-to-observation recovery while preserving genuine positions and causal timing is further engineering work; merely accepting the larger step or borrowing a future pose is not a correction. The existing [future A/B proposal](LOW_LATENCY_01_LIVE_AB_PROPOSAL.md) remains for the unchanged 75 ms candidate and requires fresh explicit approval.
