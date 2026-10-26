# P2-03.8: second-state generalisation of exhaust playback

26 October 2026. **PARTIAL: conclusion 2, partial improvement reproduced.** At the independently selected marker-state **27**, my A/B verdict was **“B slightly more natural.”** Asked about new clicks, ghosting, unnatural transitions, exhaust character and repetition, I replied **“no it sounded fine.”** I reported no new problem in that follow-up, but did not separately grade repetition or standalone realism. This is not another clear-naturalness breakthrough or complete responsive-engine acceptance.

The single experiment is finished. No further state, endpoint, blend duration, source ordering, gain, effect or engine variant followed. State 21 remains historical supporting evidence, not a controlled comparison against state 27. Each intervention is judged only against its own same-state control. No GTA/RPH launch, game/archive access, new extraction, dependency installation, audio mutation or Phase 3 work occurred.

## Baseline and ancestry

Fetched canonical main at `e5fbd8f3502d3e28169a224caa07471e090e368f`. PR #21 was open and unmerged at `003f9b10f1fda4ae2de2fe02bd8bef0bc28c8ba3`; this research branch starts there. No existing PR is merged, rebased or rewritten. The original unsanitised repository is untouched.

The [successful state-21 B](P2_03_7_OUTER_WRAP_ABLATION.md) still hashes to `3BD4C814A3EB88B5B6D6616581B9220623BA3B49515F85D7F9BBCDC3B99CC81F`. The original Bati-traced player `exhaust_decel` hashes to `574DBB61C486F18848839300C9D72219957258CEEA6B1F93710EB72EF6270F2F`. Manifest and metadata fingerprints are bound to the selection receipt and historical reference. Existing source files, renderer defaults, telemetry/schema and RPM validation are unchanged.

## Selection preregistration and result

Before rendering or listening, I fixed a metadata-only ranking rule and saved its receipt privately. Candidate control values are **integers 14–28 excluding 21**, not a scan of arbitrary fractional values. Each candidate must have a run of **3–16 consecutive intervals**, source states within 14–28 and within **2%** of the requested state, both possible rounded event-length read rates within **0.95–1.05**, and the existing **16-frame start / 96 × 1.05 + 16-frame tail** margins. These existing tolerances are not widened. Three intervals is a predeclared minimum contextual run; sixteen is a resource bound. The state lattice, run minimum and ranking are experimental design choices, not native engine semantics.

Rank eligible runs by: **greatest absolute separation from 21; longest consecutive run; greatest minimum state/rate safety margin; lower state; lower first interval index**. The margin is the minimum remaining headroom to the unchanged state/rate limits. No listening, waveform similarity or perceived quality enters selection. Waveform safety is checked only after the choice; a failure stops the comparison with no fallback candidate.

| Candidate state | Separation from 21 | Consecutive eligible intervals |
|---|---:|---:|
| **27, selected** | **6** | **4** |
| 15 | 6 | 3 |
| 26 | 5 | 4 |
| 16 | 5 | 4 |
| 25 | 4 | 3 |
| 24 | 3 | 4 |
| 23 | 2 | 4 |
| 19 | 2 | 3 |
| 22 | 1 | 7 |
| 20 | 1 | 3 |

States 14 and 28 have no run meeting the minimum; neither do 17 and 18. State 27 wins over equally distant state 15 because four intervals precede three in the fixed ranking. This does not establish that 27 is the best-sounding or most representative state. The selection was reported before implementing the comparison.

| Selected interval | Source frames [start,end) | Frames | Adjacent-mean marker state |
|---|---|---:|---:|
| 66 | 97034–98782 | 1,748 | 27.41861725 |
| 67 | 98782–100544 | 1,762 | 27.15200235 |
| 68 | 100544–102329 | 1,785 | 26.83685095 |
| 69 | 102329–104134 | 1,805 | 26.52469615 |

Total source context is **7,100 frames / 0.147916667 seconds**. State range **26.52469615–27.41861725**, rate range **0.983127109–1.015756894**, minimum state/rate headroom **0.002396154**. Synthetic normalised control is **(27−14)/14 = 0.928571429**. These labels are not physical RPM or throttle/load observations.

## Exact controlled comparison

Both outputs use the same four intervals in forward order, constant requested state 27, **48 kHz mono PCM16**, **240,000 frames / 5 seconds**, gain **0.15**, 24-tap bounded sampler and **1,200-frame / 25 ms** edge fades. The cumulative fractional clock rounds each event boundary, exactly as the previous fixed experiment. There are **135 events**, **101 internal boundaries** and **33 outer wraps**. The last partial four-interval pass contains three events; no extra EOF wrap is invented.

Internal blends remain omitted. A retains the established 96-frame outer continuation mixture: target weight `sin(pi*j/192)^2`, previous continuation at its previous rate, target at its current rate. B uses that identical direct target instead. Source positions, read rates, times, gain, interpolation and fades remain identical. At every wrap the scheduled endpoint resets **104134 → 97034**, a jump of **−7,100 source frames**. A's existing continuation and interpolation support include neighbouring samples outside the scheduled run; this context remains within the original source. No interval or recording is added.

The research helper computes a fresh common reference before overwriting only B's wrap samples. Thus discarded reference arithmetic/reads are still counted. This preserves exact signal-level isolation and is **not** an efficiency claim. Historical/default renderers are untouched.

Permitted half-open output sample windows are exactly these **33 × 96 = 3,168 samples**:

```text
7111–7207      14222–14318    21333–21429    28444–28540
35556–35652    42667–42763    49778–49874    56889–56985
64000–64096    71111–71207    78222–78318    85333–85429
92444–92540    99556–99652    106667–106763  113778–113874
120889–120985  128000–128096  135111–135207  142222–142318
149333–149429  156444–156540  163556–163652  170667–170763
177778–177874  184889–184985  192000–192096  199111–199207
206222–206318  213333–213429  220444–220540  227556–227652
234667–234763
```

## Numerical isolation and safety

| Measurement | Result |
|---|---:|
| Changed float / PCM16 samples | **3,168 / 3,102** |
| Changed samples outside windows | **0 / 236,832**, float and PCM |
| Changed internal-window samples | **0 / 9,696**, float and PCM |
| Maximum PCM difference | **0.014984130859375 / 491 LSB** |
| Whole-file / targeted PCM difference RMS | **0.000791961539 / 0.006893140420** |
| Maximum float difference | 0.014989650961 |
| Whole-file / targeted float difference RMS | 0.000792072957 / 0.006894110184 |

An independent raw-WAV comparison constructed its own masks from `round(k*4*48000/27)`, k=1..33, and verified the same 3,102 changed samples and zero unexpected differences. A/B are driven by one immutable prepared schedule. Original synthetic tests independently evaluate the retained continuation formula and direct target sampling, including internal traversal.

| Output property | A: existing outer blends | B: direct wraps |
|---|---:|---:|
| Peak | 0.119659424 | 0.119659424 |
| RMS | 0.053943170 | 0.053952309 |
| DC | −0.006692413 | −0.006761960 |
| Largest initial wrap step | **0.000854492** | **0.001281738** |
| Largest local step near wraps | 0.005493164 | 0.005493164 |
| Mean local RMS near wraps | 0.026263681 | 0.026791676 |
| Whole-file maximum adjacent step | 0.009002686 | 0.009002686 |
| Clipped / nonfinite samples | 0 / 0 | 0 / 0 |
| Silent 20 ms windows | 0 | 0 |

Unlike the historical state-21 comparison, B's initial wrap step is **larger**, not smaller. That is not by itself an unsafe splice or a perceptual verdict. The largest raw preparation mismatch is **0.012529701**, below the unchanged **0.25** bound; the wrap mismatch itself is approximately **0.002844245**. B's maximum added residual against natural continuation is **0.000414530**, below **0.0375 + one PCM16 LSB**. Maximum direct-target quantisation error is **0.000015137**, below half an LSB. These unchanged technical gates passed before playback. A fast synthetic control with large natural derivatives passes; excessive introduced mismatch, corrupt targets, clipping and nonfinite data fail. No threshold is a universal click detector, and none was weakened to produce a favourable result.

The same resolution screen requires targeted RMS ≥1 LSB and peak difference ≥2 LSB. Both pass. It is not a perceptual threshold. No gain normalisation, offset removal, alternate smoothing or difference-amplified audio was introduced.

## Recurrence, frequency and texture

Both outputs repeat exactly at **64,000 frames / 1.333333 seconds**, with interior correlation 1 and zero different samples at that lag. The complete integer-lag search through two seconds excludes 100 ms presentation edges and did not hit its candidate cap. Four source events and the nine-event rounded-clock pattern realign after **36 events**. At near-pass lag **7,111 frames**, correlation is **0.999932922 A / 0.999932911 B**. Repetition has not disappeared and was not separately rated in my reply.

Requested state is constant; the same source-marker/rate sequence cycles in both files. Thirty-three 4,096-frame Hann windows centred on wraps have mean relative complex A/B spectrum difference **0.031741502**, maximum **0.031742781**. Separate adjacent pre/post-wrap 4,096-frame Hann windows have mean normalised magnitude change **0.104158408 A / 0.104158226 B**. This finite-window variation includes different source portions and internal markers; it is not a click, harmonic coherence or naturalness score. All observed pre/post dominant spectral bins are **105.46875 Hz** in both versions; this is not identified as combustion frequency or physical crankshaft RPM.

Across 32 fixed interior observations, RMS variation coefficient is **0.011846584 A / 0.011843798 B**, spectral-centroid means **240.881208 / 240.915215 Hz**, and centroid ranges **235.990157–245.796831 / 236.109562–245.860003 Hz**. Mean normalised spectral flux is **0.021578836 / 0.021443442**. Local source interval harmonic summaries remain private. These measurements describe broadly stable texture under a fixed synthetic state; they do not prove perceptual steadiness or authentic native scheduling.

## Listening and engineering decision

The existing local playback helper completed A, then B, once each for five seconds at identical gain. **I found B slightly more natural; my follow-up was “no it sounded fine.”** No new variant followed. The comparison was labelled, informal and not blinded or independently repeated. I did not explicitly certify every requested perceptual attribute, so no independent repetition, standalone realism or universal artefact-free claim is made.

Conclusion **2: partial improvement reproduced**, not clear improvement reproduced. The preference extends to a second source/state configuration, but the degree differs. This supports configuration-dependent benefit and does not justify a global direct-wrap default. Changing both source region and requested state prevents attributing that difference specifically to endpoints, speed or another individual feature. We have not established native granular semantics or finished sustained responsive synthesis.

**Exactly one next proposed direction:** a separately authorised, exhaust-only **slow transition feasibility experiment between the two tested hold regions**, with eligibility and transition behaviour specified before rendering and per-region safety gating retained. First verify that the intervening state/source mapping can be traversed without widening bounds; an invalid transition must stop rather than trigger tuning. This would test naturalness while moving between states, not adopt direct wrapping everywhere. No transition implementation, render or further experiment is performed here. Live RPM, native suppression/ownership, real-time integration, full telemetry certification and Phase 3 remain separate unresolved gates.

## Implementation, validation and performance

Original additions: `tools/audio/second-state-wrap.mjs`, `tools/Render-SecondStateWrap.mjs` and `tests/Test-SecondStateWrap.mjs`. The new bounded research preparation accepts 3–16 consecutive intervals at whole-number states 14–28; state 21 is accepted only for historical-equivalence tests, while deterministic second-state selection excludes it. No public binary ABI or full synthesiser is introduced.

The CLI binds its metadata-only selection receipt to current source fingerprints and the historical state-21 pack. It refuses changed selection, source, manifest, metadata or reference identity, existing outputs, linked destinations and private-path escapes. Unsafe preparation writes only a diagnostic report, with no WAVs or fallback state. Float and PCM safety are checked before listening-ready files are written. Source-backed parameter variants are limited to the selected state; numerical repeats reproduce identical hashes without being additional listening variants.

| Measured offline cost | A | B |
|---|---:|---:|
| Render time, A then B | 29.960 ms | 30.331 ms |
| Equivalent numerical repeat, B then A | 28.207 ms | 30.316 ms |
| Actual interpolation calls | **243,168** | **246,336** |
| Computed reference wraps | 33 | 33 |
| Wrap mixtures retained in output | 33 | 0 |

B's additional **3,168** direct reads overwrite reference results; discarded work is counted. Overwrite costs **0.492 / 0.489 ms**. Shared source/preparation time is **45.538 ms**; CPU across both renders **63 ms user / 16 ms system**; recorded RSS **61,464,576 bytes**, not peak or isolated memory. Render timing excludes subsequent spectrum/recurrence analysis, encoding and disk writes. Warming and order confound small timing differences; no speedup, optimisation or real-time audio-thread suitability is claimed.

**19 new original synthetic tests** cover deterministic selection and independent eligibility, invalid metadata/states, 3/4/7-interval plans, source bounds/consecutiveness, unchanged limits, same state/clock/rates, independent retained and omitted wrap formulas, exact internal preservation, float/PCM isolation, deliberate confounding, excessive mismatch/clipping/nonfinite rejection, fast natural slopes, deterministic WAVs, immutable source data, exact state-21 algorithm/default equivalence, fingerprint/selection/link/output guards, reverse-order reproduction and unsafe diagnostic-only stopping. No stock audio is used by public tests. **39/39 focused tests** passed with existing outer/internal ablation tests.

The full local suite passed: **19 second-state, 10 outer-wrap, 10 internal-join, 14 model-analysis, 10 recurrence, 18 responsive, 12 cycle, 8 deceleration, 19 stock-audio, 8 extraction/publication guards, 15 ownership, 65 core assertions, 35 drivetrain, 17 parser, 3 diagnostic-analysis, 129 Phase 1, 9 configuration and 8 append expectations**. After adding the roadmap link, Phase 1 passed **130 checks**. A final diagnostic-guard rerun caught an undefined local frame constant; it was corrected to the immutable prepared extent, and all 19 new tests passed again. The **full offline runner was then rerun successfully, including 130 Phase 1 checks**. No audio sample, selection, safety result or listening verdict changed. Existing offline helpers/core/test executables compile. Hosted CI is verified separately from listening and local results.

## Integrity and private reproduction

Before this milestone, the previous **1,990-file / 35-link** receipt and accepted state-21 SHA-256 matched. A fresh receipt protects **2,272 existing private files / 43 link targets**, without following fixture links. It covers the original twelve decoded WAVs, the 19.322-second reference, synchronisation/deceleration examples, responsive/recurrence/join/wrap previews, metadata and previous diagnostics. These files and historical renderer sources were independently checked again before listening; numerical repeats match their original hashes. New files use fresh ignored directories. No original archive was accessed, so no new installed-archive hash claim is made.

Private A SHA-256: `90440947872CC5EE180E755A48A1D43A74CD7C70497405CEB7D8E85A99607546`.

Private B SHA-256: `944D59F31B453CE82C464968649ECAD2C303BAA04BC519D762047FB1195E4911`.

The public [numeric record](../evidence/publication/second-state-wrap.json) includes allowlisted selection summaries, the four selected interval descriptors, aggregate metrics, exact wrap windows and hashes. Full schedules, stock PCM, proprietary metadata blobs, raw logs and absolute workstation paths remain private. No third-party binary/source or new project licence is added. Publication screening and origin/allowlist review remain required before push; pattern screening alone cannot prove rights or absence of every secret. Existing reviewed service-committer history flags must be distinguished from new findings.

Final pre-commit publication screening covered **eight explicitly staged files**, with **zero index findings**, **one valid JSON document** and **21 valid local documentation links**. Whole-history screening retained only the same **four reviewed GitHub service-committer flags** on already published commits; identities were independently checked, not treated as an automated all-clear. Git integrity passed with harmless unreachable development objects. The 2,272-file / 43-link receipt, successful historical reference and all equivalent preview hashes matched after listening. GTA/RPH and relevant game-file tools remained closed.

```powershell
node tools/Render-SecondStateWrap.mjs .local/audio-reconstruction/decoded-final/source-manifest.json .local/audio-reconstruction/second-state-selection.json .local/audio-reconstruction/wrap-ablation-final .local/audio-reconstruction/NEW-second-state-wrap
node --test tests/Test-SecondStateWrap.mjs
```

The private selection receipt is created before rendering by applying the exported metadata-only selector to the existing, hash-matching decoded source and saving `{schemaVersion:1,sourceSha256,...selection}`. It must not be replaced to choose another state after a negative result. The CLI does not access game archives or play audio. Public tests generate original local fixtures and do not require GTA or proprietary dependencies.

## Actual weighted progress

Reported checkpoints: **0 → 10 → 25 → 50 → 65 → 80 → 90%**. Stage weights are repository/baseline **10%**, independent selection/design **15%**, implementation/private rendering **25%**, numeric isolation/safety **15%**, regressions/preservation **15%**, listening/interpretation **10%**, documentation/audit/PR/readback **10%**. At 80%, engineering validation was complete and listening pending; at 90%, actual listening supported PARTIAL and publication remained pending. Final 100% is reported only after the last stage is verified; PARTIAL scientific acceptance does not imply unfinished engineering work.
