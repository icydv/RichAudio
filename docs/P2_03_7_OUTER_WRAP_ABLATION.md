# P2-03.7: outer wrap boundary ablation

26 October 2026. **PASS for this fixed-state, five-second exhaust hold.** My first reply was **“B sounds better”**; when asked about the strength of the improvement and remaining artificiality, I answered **“Clear improvement, natural-sounding.”** This supports consequence **1: outer wrap blending materially contributes to artificiality in this comparison**. It does not establish a complete responsive engine, the native synthesis algorithm, generalisation to other states or safe in-game audio ownership.

The single labelled A/B is finished. No further variant, effect, engine layer, source expansion or tuning followed. This work is stacked on PR #20, `568d3d8278cd5af940e8f7d19d3e7d6d03bb75d2`; earlier PRs remain unmerged. GTA/RPH stayed closed. There was no game/archive access, dependency installation, native mutation, RPM change or Phase 3 work.

## Isolated mechanism and source preservation

A reproduces [P2-03.6 B](P2_03_6_EXHAUST_JOIN_ABLATION.md) byte-for-byte, SHA-256 `FFA2F9369004B3A49659AC84A79A6BE964A2A3C6FD7B318494F8C7AAE1E85F64`. Internal continuation blends remain omitted. Only the twenty outer 96-frame continuation blends are removed from B. Source choice/order, event clock, read positions/rates, gain, interpolation and edge fades are identical. Existing renderers and defaults are unchanged.

Both outputs are 48 kHz mono PCM16, **240,000 frames / 5 seconds**, fixed synthetic normalised state **0.5 / relative marker-state 21**, gain **0.15**, with **1,200-frame / 25 ms** presentation fades. These state labels are not physical RPM or load. There are **105 events**, **84 internal boundaries** and **20 outer wraps**.

The same original Bati-traced player `exhaust_decel` source has SHA-256 `574DBB61C486F18848839300C9D72219957258CEEA6B1F93710EB72EF6270F2F`.

| Interval | Original source frames [start,end) | Frames | Adjacent-mean marker state |
|---|---|---:|---:|
| 93 | 151154–153403 | 2,249 | 21.343925 |
| 94 | 153403–155675 | 2,272 | 21.170318 |
| 95 | 155675–157952 | 2,277 | 21.051951 |
| 96 | 157952–160249 | 2,297 | 20.891971 |
| 97 | 160249–162568 | 2,319 | 20.743399 |

At each outer wrap the scheduled endpoint resets **162568 → 151154**, a backward jump of **11,414 source frames**; unlike an internal boundary, it is not adjacent source material. Both versions retain the same rate-factor sequence **0.983814523–1.014879650**. At wraps the rate changes by approximately −0.03019 to −0.03107. Removing the mixture does not remove this reset or rate schedule.

A retains the previous-end continuation and target mixture: for local frames 0–95, target weight is `sin(pi*j/192)^2`. B uses the identical direct target at `sourceStart + j*speed` instead. The previous continuation can contain material beyond the selected source run. A's unchanged interpolation footprint reaches requested position 162664.413567 and source taps [151143,162676], safely inside the original 374,180-frame source. No extra interval is scheduled. The implementation computes a fresh A internally before overwriting B's wrap windows, so even discarded reference reads remain present; this is a **signal-level ablation**, not a computation-removal benchmark.

## Exact changed windows and numerical result

Only these half-open output-frame windows may differ; every window contains 96 samples:

```text
11429–11525    22857–22953    34286–34382    45714–45810
57143–57239    68571–68667    80000–80096    91429–91525
102857–102953  114286–114382  125714–125810  137143–137239
148571–148667  160000–160096  171429–171525  182857–182953
194286–194382  205714–205810  217143–217239  228571–228667
```

| Measurement | Actual result |
|---|---:|
| Targeted samples | **1,920** |
| Float / PCM16 samples changed | 1,920 / **1,886** |
| Other 238,080 samples changed | **0**, float and PCM |
| Internal-window samples changed | **0 / 8,064** |
| Maximum PCM difference | **0.00982666015625 / 322 LSB** |
| Whole-file PCM difference RMS | **0.000321930436** |
| Wrap-window PCM difference RMS | **0.003599291700** |
| Maximum float difference / whole-file RMS | 0.009830497981 / 0.000321993488 |
| Largest initial wrap step, A / B | 0.003051758 / **0.000061035** |
| Largest local step near wraps, A / B | 0.006195068 / **0.005249023** |
| Mean local envelope RMS near wraps, A / B | 0.042988228 / 0.042136555 |

Local derivative/envelope windows cover frames n−64 through n+191 at each wrap. Twenty 4,096-frame Hann windows, each containing one wrap and excluding presentation fades, have mean relative complex-spectrum difference **0.013404536**, maximum **0.013429211**. These include phase differences and are descriptive, not naturalness scores.

| Output property | A: existing outer blends | B: outer blends omitted |
|---|---:|---:|
| Peak | 0.119628906 | 0.119628906 |
| RMS | 0.066358118 | 0.066346463 |
| DC | −0.001915421 | −0.001931264 |
| Maximum adjacent step, whole file | 0.008514404 | 0.008514404 |
| Clipped / nonfinite samples | 0 / 0 | 0 / 0 |
| Silent 20 ms windows | 0 | 0 |

**Safety PASS before playback.** The existing raw continuation-mismatch bound of 0.25, scaled by unchanged gain, gives **0.0375**, with one PCM16 LSB quantisation allowance. B's maximum residual against natural continuation is **0.003118684**. Direct-target interpolation is independently checked throughout every candidate window; maximum PCM error is **0.000015221**, less than half an LSB. Negative controls reject altered target values, confounded samples, excessive added mismatch, clipping and nonfinite input. A fast periodic synthetic control with large natural derivatives passes: natural slope is not itself a splice error. This is a technical safety screen, not a universal audibility threshold or proof of perfect joins.

The difference also clears the predeclared resolution screen of window RMS ≥1 LSB and peak difference ≥2 LSB; this alone does not establish audibility. No difference-amplified preview or separate gain normalisation was used.

Both files still repeat exactly at **80,000 frames / 1.666667 seconds** over the measured interior. The complete integer-lag search through two seconds excludes 100 ms presentation edges. Correlation at lag 80,000 is 1 in both; near-pass lag 11,429 has correlation **0.999870916 A / 0.999871074 B**. The same five-event source pattern and seven-event rounded clock align after 35 events. No source variety or recurrence removal is claimed.

## Listening and consequence

The local playback helper completed A, then B, five seconds each, at unchanged gain. **I preferred B and found it a clear improvement and natural-sounding.** The labelled, informal comparison was not blind or independently repeated. My reply did not separately assess clicks, roughness or pitch changes. The bounded PASS follows the actual listening verdict plus numerical isolation and safety; it is not general engine certification.

B SHA-256 is `3BD4C814A3EB88B5B6D6616581B9220623BA3B49515F85D7F9BBCDC3B99CC81F`. An independent reverse-order numerical render reproduced both hashes. It was not a further listening variant.

**One next proposed direction, not executed:** a separately authorised second-state generalisation test, using one predeclared source-valid state within the existing 14–28 range and unchanged eligibility/rate/safety bounds. Compare only retained versus omitted outer blending there. This tests whether the improvement is specific to the current endpoints before adopting it more broadly. Do not launch another crossfade-duration search, expand the source bank or add effects. Live RPM, native engine-only suppression, per-instance ownership, crash-safe handoff and Phase 3 remain unresolved.

## Implementation, tests and cost

Original additions are `tools/audio/outer-wrap-ablation.mjs`, `tools/Render-OuterWrapAblation.mjs` and `tests/Test-OuterWrapAblation.mjs`. The existing P2-03.6 renderer supplies the exact reference; B overwrites only its permitted windows with the existing sampler. Default `omitOuterBlends=false` retains A. The CLI refuses changed historical fingerprints, linked/private-path escapes, existing outputs and unsafe audio. Unsafe results save only a diagnostic report; numerically safe but below-resolution synthetic controls are not listening-ready. No new dependency is required.

| Render cost | A | B |
|---|---:|---:|
| First pair, A then B | 33.929 ms | 29.796 ms |
| Numerical repeat, B then A | 28.828 ms | 34.525 ms |
| Actual interpolation calls | 241,920 | **243,840** |
| Computed reference wraps | 20 | 20 |
| Signal wrap mixtures retained | 20 | 0 |

B includes discarded reference computation plus **1,920** direct-target overwrite reads; it is not an optimisation. Overwrite time is **0.477 / 0.437 ms** in the two runs. Order reversal shows warm-up confounding, so no causal speedup is claimed. First-pair preparation **42.785 ms** includes shared source/manifest validation; CPU across the two renders is **93 ms user / 0 ms system**. Recorded process RSS **62,738,432 bytes** is neither peak nor isolated allocation. Render timings exclude PCM conversion, output writing and subsequent analysis. No audio-thread performance is established.

Ten new original synthetic tests cover reference equivalence/defaults; exact wrap windows and clocks; unchanged direct targets/rates/order/gain/fades; float/PCM isolation and internal preservation; deliberate non-wrap corruption; safety negatives; the fast-natural-derivative control; malformed/unprepared/immutable/bounded sources; deterministic CLI reproduction; and historical/hash/link/output guards. **30/30 focused tests** passed with existing join/recurrence tests. The new suite is included in `tools/Test-Offline.ps1`.

The full local offline suite passed: **10 outer-wrap, 10 internal-join, 14 model-analysis, 10 recurrence, 18 responsive, 12 cycle, 8 deceleration, 19 stock-audio, 8 extraction/publication guards, 15 ownership, 65 core assertions, 35 drivetrain, 17 parser, 3 diagnostic-analysis, 128 Phase 1, 9 configuration and 8 append expectations**. After adding this roadmap link, Phase 1 was rerun separately and passed **129 checks**. Existing offline helpers/core/tests compile; no adapter is deployed. Hosted CI is reported separately from local results and listening.

## Preservation, publication and reproduction

The fresh preflight inventory protects **1,990 existing private files / 35 fixture-link targets**, recording links without following them. It also rechecks the prior **1,742 files / 27 links** receipt. Original decoded WAVs, accepted/rejected references, metadata/manifests, earlier diagnostics and legacy renderer defaults remain intact. New audio, numerical repeats, playback logs and original synthetic fixtures stay in fresh ignored locations. No game/archive access occurred; no new installed-archive hash claim is made.

The public [numeric evidence](../evidence/publication/outer-wrap-ablation.json) allowlists scalar/aggregate results, the five interval descriptors, twenty boundary rows and fingerprints. Full 105-event schedules, proprietary metadata blobs, WAVs, raw logs and private absolute paths are excluded. No new licence, third-party source or binary is added. Publication pattern screening supplements manual origin/allowlist review; it does not prove redistribution rights or absence of every possible secret. Four previously reviewed GitHub service-committer history flags are retained as explicit exceptions, not described as an automated history all-clear.

Final pre-commit screening of **eight explicitly staged files** found **zero index findings**, **one valid JSON document** and **22 valid local documentation links**. Whole-history screening matched exactly those four existing service-committer flags; their identities were independently reviewed. Git integrity passed, with only previously known unreachable development objects. The 1,990-file / 35-link inventory, private preview/repeat hashes and unchanged legacy renderers were independently verified again after listening. No GTA/RPH or relevant game-file tool process was running.

```powershell
node tools/Render-OuterWrapAblation.mjs .local/audio-reconstruction/decoded-final/source-manifest.json .local/audio-reconstruction/join-ablation-01 .local/audio-reconstruction/NEW-wrap-ablation
node --test tests/Test-OuterWrapAblation.mjs
```

The first command requires the existing privately held, hash-matching source/metadata and P2-03.6 pack. Public CI uses wholly original generated fixtures and does not reconstruct stock audio. The source is not distributed.

## Weighted progress record

| Stage | Weight | Completion evidence |
|---|---:|---|
| Repository/baseline | 10% | Parent and original private inventory verified |
| Mechanism/design | 15% | Endpoint reset and one-variable design established |
| Implementation | 25% | Exact reference and wrap-only candidate implemented |
| Numerical validation | 15% | Isolation, resolution, continuity and safety passed |
| Regressions/safety/preservation | 15% | Full offline regressions and private inventory passed |
| Listening/evaluation | 10% | Actual A/B verdict: clear improvement, natural-sounding |
| Documentation/audit/PR | 10% | Complete only after final audits, commit and PR readback |

Actual progress checkpoints communicated were **0 → 10 → 25 → 50 → 65 → 80 → 90%**. Stage 7 remained pending at the 90% update. Final completion percentage, publication readback and CI disposition are reported when that stage finishes; a listening PASS does not by itself mean the milestone is 100% complete.
