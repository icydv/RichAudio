# P2-03.6: coherent exhaust playback and internal join ablation

26 October 2026. **PARTIAL.** My labelled A/B verdict was **“Slight improvement”** for B. The best-supported implication is **2: internal joins contribute only slightly in this comparison**. This does not quantify their share of the remaining defect, establish complete naturalness or reconstruct native scheduling. Clicks, roughness and pitch changes were not separately assessed in my reply.

The single comparison is finished. No additional blend duration, ordering, source region, wrap variant, engine layer or effect was tried. Work is stacked on open PR #19 at `bf36af90d2bc884ba43bd5ad42912e40f2b7f2aa`; earlier PRs remain unmerged. No GTA/RPH launch, game/archive access, dependency installation, native mutation or Phase 3 work occurred.

## Baseline and experiment validity

Reviewed the [model investigation](P2_03_5_NATIVE_GRANULAR_MODEL.md), [recurrence results](P2_03_4_CYCLE_RECURRENCE.md), [responsive prototype](P2_03_3_RESPONSIVE_ENGINE.md), source manifest/metadata and current interpolation/join implementation. The legacy responsive renderer is unchanged. A is a new controlled reference with the requested five-interval forward order, **not** a claim to reproduce the earlier three-pair selection walk.

For each event, the existing target position is `sourceStart + j * speed`, with `speed = originalIntervalFrames / outputEventFrames`. At genuinely adjacent internal intervals, the previous source end equals the new start: this path already has position continuity. The per-marker recalculation is retained in both A/B, avoiding a new accumulated-cursor rounding error. Read velocity can still change at markers; neither version invents a phase model or smooths that rate schedule.

A applies the existing continuation rule during local frames **0–95** after every transition: weight `u = sin(pi * j / 192)^2`; combine previous-end continuation at its previous rate with the current target at its current rate using weights `1-u` and `u`. B omits that operation **only at internal boundaries**, using the identical current target. At outer wraps both retain the entire unchanged 96-frame blend, including its previous-rate interpolation kernel.

Both have 48 kHz mono PCM16, **240,000 frames / 5 seconds**, constant normalised state **0.5 / relative marker-state 21**, gain **0.15**, identical interpolation and **1,200-frame / 25 ms** presentation fades. There is no independent normalisation, engine contribution, phase inversion, source-selection randomness or extra processing. Existing state/rate/margin/safety bounds remain unchanged. State 21 is not physical RPM or load.

This is a single-variable comparison: source selection/order, target path, event times, rates, gains and outer wraps are shared; only the internal continuation mixture is removed. It has **zero float or PCM changes outside the targeted windows**. An independent test evaluates A against the unchanged legacy join formula, while B is checked directly against source interpolation; validation is not based solely on the policy's own flags.

## Exact source region and boundaries

Original Bati-traced player `exhaust_decel`, verified SHA-256 `574DBB61C486F18848839300C9D72219957258CEEA6B1F93710EB72EF6270F2F`.

| Interval index | Original frames [start,end) | Length | Adjacent-mean marker state |
|---|---|---:|---:|
| 93 | 151154–153403 | 2,249 | 21.343925 |
| 94 | 153403–155675 | 2,272 | 21.170318 |
| 95 | 155675–157952 | 2,277 | 21.051951 |
| 96 | 157952–160249 | 2,297 | 20.891971 |
| 97 | 160249–162568 | 2,319 | 20.743399 |

The scheduled source run is **11,414 frames / 0.237791667 seconds**, with marker range **20.743399–21.343925**. All five intervals independently pass the existing 2% requested-state and 0.95–1.05 rate bounds. Actual rates are **0.983815–1.014880**. Maximum internal rate-factor step is **0.010496**, present in both schedules, not a new pitch-control law.

The same cumulative fractional clock advances by 48,000/21 and rounds event boundaries. Events contain 2,285 or 2,286 output frames. There are **105 events**, **21 passes**, **84 internal boundaries** and **20 outer wrap joins**. The first event has no incoming blend; EOF has no added wrap. A pass occupies about 0.238095 output seconds, distinct from the original source duration.

**Scheduled bounds are not the complete interpolation footprint.** The established outer wrap uses a short natural continuation beyond interval 97; the 24-tap interpolator also reads around nominal positions. This context is retained identically, not cropped, moved or introduced by B. Requested positions reach **162664.413567**; derived source-tap bounds are **[151143,162676]**, safely inside the original 374,180-frame WAV. No additional interval is scheduled and no source is extended or re-extracted. Eligibility describes selected intervals, not every sinc-support or wrap-continuation sample. Requiring literal zero reads outside the scheduled run would conflict with preserving the existing interpolation/wrap algorithm.

## Measured differences

| Metric | Result |
|---|---:|
| Internal windows | 84 × 96 = **8,064 samples** |
| Float samples changed | 8,001 |
| PCM16 samples changed | **6,573** |
| Unaffected samples | 231,936, all identical |
| Outer-wrap window samples | 1,920, all identical; included in unaffected count |
| Maximum PCM difference | **0.000610352 = 20 LSB** |
| Whole-file difference RMS | **0.0000327533** |
| Internal-window difference RMS | **0.000178684**, about 5.86 LSB |
| Maximum float difference / RMS | 0.000620579 / 0.0000327103 |

The numerical screen required internal-window RMS at least one PCM16 LSB and peak difference at least two LSB; both passed. This is a quantisation-resolution screen, **not a validated audibility threshold**. Nothing was tuned to pass it, and no difference-amplified preview was generated.

| Output property | A: existing internal joins | B: internal blends omitted |
|---|---:|---:|
| Peak | 0.119628906 | 0.119628906 |
| RMS | 0.066358249 | 0.066358118 |
| DC | −0.001915531 | −0.001915421 |
| Maximum adjacent step, full output | 0.008514404 | 0.008514404 |
| Largest local step near internal joins | 0.006744385 | 0.006805420 |
| Largest initial internal-boundary step | 0.003540039 | 0.003540039 |
| Clipped/nonfinite samples | 0 / 0 | 0 / 0 |
| Silent 20 ms windows | 0 | 0 |

The slightly larger local derivative in B is not evidence of worse sound; natural derivatives are not splice-error scores. Four nearby genuine source boundaries have unscaled adjacent steps up to **0.0238953**. Filtering, rates and gain differ from raw-source derivatives, so those values are descriptive rather than an audibility comparison. Local envelope RMS around internal joins averages **0.04822975 A / 0.04822436 B**. Outer-wrap local metrics match exactly.

Spectral comparisons use **82** edge-fade-free, 4,096-frame Hann windows centred on internal boundaries. Each contains one join because half-width is below the event spacing. The relative complex-spectrum difference averages **0.000615146**, maximum **0.000884650**. This includes phase as well as magnitude changes; it is neither a timbre nor naturalness score.

Both outputs repeat exactly at **80,000 frames / 1.666667 seconds** over the measured interior. Search checks every integer lag through two seconds, excluding 100 ms presentation edges, without reaching its cap. The five-event source sequence and seven-event rounded-clock pattern align after 35 events. Shorter near-repetition of the ~0.238-second source context remains. This experiment intentionally does not solve source-bank recurrence.

Independent identical renders reproduce both WAV hashes:

- A: `53C2DE3C3934A6393CB3ADFA69D69F19C053B10B81EBBCD94F46B04A9A3D38A2`
- B: `FFA2F9369004B3A49659AC84A79A6BE964A2A3C6FD7B318494F8C7AAE1E85F64`

## Listening and implication

The local helper played A for five seconds, then B for five seconds, at the same gain. Both completed successfully. **I heard a slight improvement in B.** The labelled comparison was informal, not blinded or independently repeated listening. No new-artifact clearance or complete naturalness is inferred from that short reply.

This supports a small contribution from internal blending in this test. It does not show that removing joins solves sustained engine synthesis, quantify the remaining problem, establish native group semantics or justify broad renderer changes. The implementation remains explicit research-only and defaults to keeping internal blends. Historical/default renderers remain untouched.

**Next single proposed step:** a separately authorised **wrap-only ablation**, with B as the fixed reference: preserve internal-blend omission, all five intervals, timing, rates and gains; compare only the existing outer wrap treatment against its omission if numerical safety/isolation permits. No blend-duration sweep or expanded eligibility. Worsening would support retaining the current wrap; no meaningful improvement would point away from that blend as a sufficient explanation. No such file or variant was produced here.

## Engineering and resource use

Original additions: `tools/audio/exhaust-join-ablation.mjs` and `tools/Render-ExhaustJoinAblation.mjs`. They reuse existing source/manifest validation, PCM conversion, band-limited sampling, metering, diagnostics and private path guards. The standalone renderer has a fixed five-second state-21 design and boolean `omitInternalBlends=false`; it does not change the production renderer or introduce a general granular framework.

| Measured cost | A | B |
|---|---:|---:|
| Render time, first pair | 30.232 ms | 26.332 ms |
| Render time, identical repeat | 29.237 ms | 25.950 ms |
| Render interpolation calls | 249,984 | 241,920 |
| Internal blend operations | 84 | 0 |
| Outer-wrap blend operations | 20 | 20 |

B removes exactly **8,064 continuation interpolation calls**. Shared preparation takes **40.289 / 40.906 ms** and includes existing two-component source validation even though only exhaust is rendered. Fixed-join safety preparation additionally makes 210 sample calls. Render timing excludes PCM conversion, writing and diagnostics. First-pair whole-process CPU is **78 ms user / 47 ms system** across both renders; recorded RSS **66,863,104 bytes**, not peak/isolated allocation. A runs before B, so JIT/filter warm-up confounds a causal time comparison. These are offline measurements, not audio-thread or real-time certification.

Ten new original synthetic tests cover source order/adjacency, internal/wrap classification, exact clocks/rates/gains, independent legacy-formula equivalence, direct B interpolation, float/PCM difference localisation, wrap identity, deliberately confounded negative controls, determinism/immutability, malformed/ineligible/silent sources and protected CLI paths/fingerprints. Pre-listening validation passed these plus the 18 responsive and 10 recurrence tests: **38/38**. Full offline regression and hosted CI are reported separately; neither establishes perceptual quality.

The full local suite passed: **10 new ablation, 14 model-analysis, 10 recurrence, 18 responsive, 12 cycle, 8 deceleration, 19 stock-audio, 8 extraction/publication guards, 15 ownership, 65 core assertions, 35 drivetrain, 17 parser, 3 diagnostic-analysis, 128 Phase 1, 9 configuration and 8 append expectations**. The Phase 1 increase from 127 is the new root roadmap link check. Existing helpers/core/test executables rebuild; no game adapter is deployed. The final strengthened rate-contract assertion also passed all ten focused tests.

## Preservation and private reproduction

The P2-03.5 **1,175 files / 15 fixture-link targets** still match. A fresh inventory additionally protects **1,742 existing private files / 27 link targets**, recording links without following them. This covers the twelve original WAVs, accepted/rejected historical audio, P2-03.1 through P2-03.5 evidence, manifests and metadata. New A/B files, identical numeric repeat and original synthetic fixtures use fresh ignored locations. No previous source, preview or diagnostic file was overwritten.

The public [numeric evidence](../evidence/publication/exhaust-join-ablation.json) contains scalar/aggregate measurements, five selected interval descriptors and hashes; full schedules, WAVs, local playback logs and absolute workstation paths remain private. No Rockstar audio, metadata blob, third-party binary or new licence is published. No game/archive access occurred, so no new installed-archive hash claim is made.

Publication screening covers eight explicitly staged files: zero findings, one valid JSON document and 22 valid local documentation links. Whole-history screening retains only four existing service-committer identity flags, independently reviewed as the same GitHub identities on published commits; this is a reviewed exception rather than an automated history all-clear. Git integrity passes. The full 1,742-file preservation inventory, 27 link targets and all four A/B/repeat WAVs were independently verified again before publication.

```powershell
node tools/Render-ExhaustJoinAblation.mjs .local/audio-reconstruction/decoded-final/source-manifest.json .local/audio-reconstruction/NEW-join-ablation
node --test tests/Test-ExhaustJoinAblation.mjs
./tools/Test-Offline.ps1
```

The private pack contains `A_existing_internal_joins.wav`, `B_continuous_internal.wav` and `analysis.json`. Destinations must be new and beneath the protected ignored audio area; linked/existing/unprotected paths fail. No playback is performed by the render CLI or CI. Live RPM, native suppression/ownership, full telemetry certification and Phase 3 remain unresolved and unchanged.
