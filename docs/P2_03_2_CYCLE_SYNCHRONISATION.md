# P2-03.2: engine/exhaust cycle and state evidence

Subsequent [P2-03.3 responsive playback](P2_03_3_RESPONSIVE_ENGINE.md) implements synthetic-state holds and transitions, but listening rejects their naturalness. Its partial result does not replace the successful bounded excerpt or the accepted continuous-recording reference below.

26 October 2026. Offline-only, stacked on open PR #15 at `d011364127d5e2095e501802d015a708f1c45567`; main inspected at `e5fbd8f3502d3e28169a224caa07471e090e368f`. Earlier PRs remain unmerged. No production telemetry, RPM validator, runtime adapter or accepted renderer change.

## Result and scope

**A relative cycle/state relationship is strongly supported but incomplete. PASS for one bounded interior playback experiment.** Marker spacing, independently measured waveform repetition, acceleration cross-checks and listening support using shared marker-state/cycle coordinates instead of a shared elapsed file time. This does **not** establish physical RPM, crankshaft order, Rockstar's complete scheduler, native source phase or full-range acoustic reconstruction.

An experimental 3.393771-second excerpt retains the accepted engine waveform and selects exhaust intervals by matching their metadata state. Exhaust local read-speed adjustments are −2.84% to +1.87%; no whole-file stretch, correlation-based delay or phase inversion is used. At unchanged gains, the owner heard **clear improvement** over the accepted timing. A separate balance comparison retains that timing and reduces engine amplitude to 0.35; this was the preferred exhaust-led balance. More physical exhaust presence remains desired. Complete elimination of ghosting was not explicitly confirmed.

The 19.322479-second accepted reference remains byte-identical. The rejected 27-second grain prototype and prior −2.5 dB balance candidate remain historical evidence, not new defaults. No GTA/RPH launch, game write, archive access/re-extraction, sound-bank edit, live memory access or new dependency occurred. No stock audio was uploaded.

## Inputs and evidence provenance

Reused the six named player WAVs and private original AWC metadata, [Bati graph trace](../evidence/vehicle-trace.json), [AWC summary](../evidence/bati-awc-summary.json), [P2-03](P2_03_STOCK_AUDIO_RECONSTRUCTION.md) and [P2-03.1](P2_03_1_DECELERATION_REFINEMENT.md). Source fingerprints are checked before analysis/rendering. Final preservation checks match **12 original decoded WAVs and 25 historical WAVs**, including accepted/rejected previews, both earlier isolation packs and the gain candidate. Original source-manifest and extraction-metadata hashes are recorded privately and in the [sanitised results](../evidence/publication/cycle-synchronisation.json), then rechecked after processing. Every output destination is new and private; no original audio or metadata is overwritten.

Read local CodeWalker source at **`485d56bec00262ed7fa472261cce7bbc6202b96e`**, including [AWC grain/loop parsing](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/FileTypes/AwcFile.cs#L2265) and [REL granular sound/channel parsing](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/FileTypes/RelFile.cs#L3509). The reviewed file is unchanged in that source checkout. No third-party source or binaries are redistributed, and the source commit is not asserted to reproduce the supplied dev46 binary.

Also read the **already existing** private dat54 XML export through a bounded streaming XML reader with external resolution prohibited. The archival development repository was read only for that existing export; no code or Git ancestry was imported. No game archives were opened.

## Metadata relationships

The parser names remain authoritative labels, not established physical semantics:

- `UnkUint1`: increasing integer positions within source sample extents; a sample-marker interpretation is supported by the waveform/spacing evidence.
- `UnkFloat1`: consistent with a reciprocal marker-period coordinate. It is **not declared physical RPM**.
- `UnkUshort1/2`: source comments suggest peak-related quantities; these were not used to calibrate gain or timing.
- `GranularLoops[].Grains`: ordered numbers in range under a candidate zero-based record interpretation. Native index base and walk semantics remain unverified. These identify candidate regions; their ordinal is not a cross-component identity or a proven playback sequence. The experiment does not use loop-group numbers to schedule audio.

For each adjacent marker interval, compare `field * spacing / sampleRate` against one. Choose among current field, next field and adjacent-field mean using even record intervals; evaluate on odd intervals. The adjacent mean wins for all four moving streams:

| Stream | Grain count / loop groups | Odd held-out median error | Reversed-field control | Half-rotation control |
|---|---:|---:|---:|---:|
| Engine deceleration | 174 / 6 | **0.228%** | 60.48% | 63.88% |
| Exhaust deceleration | 155 / 6 | **0.172%** | 62.32% | 66.04% |
| Engine acceleration | 155 / 5 | **0.429%** | 53.45% | 55.99% |
| Exhaust acceleration | 155 / 5 | **0.113%** | 54.14% | 56.97% |

Controls use the same selected model with mismatched field ordering. These results reject an arbitrary-position interpretation for this material, but adjacent held-out records are temporally correlated—not independent vehicles or a calibrated confidence probability. Maximum errors are larger than medians; no exact equality or universal scheduling law is claimed. Idle provides only eight intervals per component and little variation, so its spacing evidence is weaker.

Marker positions are strictly increasing, while field values include plateaus and reversals. Engine acceleration has 150 increases and four plateaus; exhaust acceleration has 148 increases, one decrease and five plateaus. Engine deceleration has 165 decreases, one increase and seven plateaus. Exhaust deceleration has 146 decreases and eight increases, concentrated near the beginning and tail. **A strict full-file inverse state map is rejected**, rather than sorting away reversals or inventing values.

Loop groups have similar structure but different state coverage. For example, the second deceleration group averages ~31.250 in engine and ~29.296 in exhaust; the third averages ~24.461 and ~21.676. Their first groups are much closer (~36.561 and ~36.804). Equal group numbers, equal record indices or equal file lengths therefore do not establish correspondence. The experiment matches the field coordinate on a contiguous monotonic interior branch instead.

### Native clock cross-check and limitation

Existing dat54 record `hash_0346A636` stores clock pairs **(12,50)** and **(11,11)**. In the old export, `ChannelSettings0..3.UnkFlags1` is 0 for moving engine/exhaust channels, while idle channels 4/5 have value 1. Current reviewed source names the second byte in each eight-byte channel-settings structure **`GranularClockIndex`**, and the first **`OutputBuffer`**. This is consistent with a shared moving clock and a separate idle clock, providing a source-layout cross-check on the relative-state hypothesis. Idle waveform repetition near 11 is compatible with the second pair.

**Stored values are observed; the old-name/new-name byte correspondence is inferred from reviewed layout.** An optional reflection-only check of the supplied binary did not complete: initial dependency resolution failed and a subsequent Windows PowerShell script attempt was policy-blocked. That restriction was left in place; no third-party method was invoked or persistent policy setting changed. Thus this report does not certify the exact field renaming in the supplied binary. A first XML probe's string-property lookup returned null for clock text; explicit node access recovered the actual pairs above. Neither that failed lookup nor absent friendly names is evidence of an absent clock.

The source parser describes data, not the running GTA clock evaluator. Its clock fields, pitch-stretch flags, loop proportions and randomisation parameters do not establish native equations, physical units, phase reset behaviour or load control. They are not automatically applied by the experiment.

## Independent waveform evidence

Analyse 0.5-second unmodified waveform windows centred at predeclared file fractions 0.12, 0.25, 0.4, 0.55, 0.7 and 0.85 for each moving recording, plus one centre window per idle recording: **26 windows total**. Mean removal and FFT-based, overlap-energy-normalised linear autocorrelation search repetition rates 6–200 Hz, retaining multiple positive local peaks. The waveform analysis does not need metadata to find its peaks. Metadata and controls are compared afterward.

| Component / centre frame | Bracketing field value (derived) | Strongest independent repetition candidate | Correlation | Interpretation |
|---|---:|---:|---:|---|
| Engine decel / 106,127 | 27.480 | 55.300 Hz | 0.316 | Near twice field; harmonic ambiguity |
| Exhaust decel / 93,545 | 28.102 | 56.206 Hz | 0.723 | Near twice field; stronger periodicity |
| Engine decel / 169,803 | 21.698 | 43.204 Hz | 0.347 | Near twice field |
| Exhaust decel / 149,672 | 21.553 | 43.049 Hz | 0.870 | Near twice field |
| Engine decel / 297,156 | 12.400 | 24.781 Hz | 0.684 | Near twice field |
| Exhaust decel / 261,926 | 11.937 | 23.845 Hz | 0.657 | Near twice field |
| Engine accel / 131,300 | 18.494 | 36.895 Hz | 0.268 | Cross-check, weaker noisy periodicity |
| Exhaust accel / 131,300 | 18.545 | 37.094 Hz | 0.665 | Cross-check |

Exact marker brackets, group membership, control correlations and alternative peak information are in the structured results. The strongest independent peak is within 5% of **twice** the interpolated field in **20/24 moving windows** (engine decel 5/6; exhaust decel 6/6; engine accel 5/6; exhaust accel 4/6). This supports a shared relative repetition coordinate; it does not reveal cylinder count, crankshaft RPM or whether a marker spans one or several physical excitations.

Half-rotated metadata values and 1.37-times mistuned values act as controls. They usually reduce correspondence, but a control near a harmonic can still score highly. Synthetic tests explicitly demonstrate that a wrong octave/subharmonic can pass correlation. A nearest-peak search can also find an accidental nearby peak; it is reported as proximity, not a uniquely recovered fundamental. No numerical confidence percentage is assigned.

Marker waveform values tend to be small relative to whole-record RMS (decel ratios ~0.232 engine and ~0.047 exhaust), but slope signs are mixed (~53%/~59% positive). These are useful join anchors, **not evidence that both components have the same acoustic phase**. Synthetic phase-shift controls preserve marker-spacing relationships while changing waveform phase, demonstrating the limit directly.

## Shared time, state, cycle and phase

- **Time:** original playback starts both files together. This is preserved as comparison A, not assumed correct.
- **State:** the reciprocal-spacing field tracks a relative operating sweep. At selected engine fractions 0.2/0.35/0.5/0.65, matching the same elapsed time produces field discrepancies of ~4.27/9.09/12.53/15.96%; matching normalised file fractions reduces them to ~1.64/4.59/1.73/1.26%. That is supporting evidence, not a whole-file resampling prescription.
- **Cycle:** independently measured waveform repetitions and metadata intervals support using a common marker-interval clock over a conservative interior domain.
- **Phase:** emission phase and native phase continuity remain unverified. No cross-correlation maximum is used to choose a delay or align waveforms.

A whole-file duration warp would alter exhaust pitch as well as time and would not by itself preserve the desired state. The bounded experiment instead selects appropriate source cycles and makes only small local rate adjustments. Full-file tails/plateaus/reversals are deliberately unsupported, not forced into a monotonic law.

## One bounded audio experiment

`cycleSchedule` uses an observed contiguous decreasing branch with adjacent-mean field values **14–28**. It retains engine intervals in their original order and selects the exhaust interval closest in field value; equal record indices are never assumed. Predetermined gates reject state errors >2%, local read-speed changes >5%, noncontiguous/reversing branches, invalid positions or duration >6 seconds.

For the actual stock sources: **70 engine intervals**, source frames **[102,511,265,412)**, accepted global frames **[515,242,678,143)**. All comparisons are **162,901 frames / 3.393771 seconds / 48 kHz mono PCM16**. Actual worst field error is **0.957%**; exhaust read speed ranges **0.971589–1.018689**. The engine uses the exact accepted stem slice. There is no global pitch or time transformation of engine audio.

Exhaust is read with the existing bounded band-limited resampler. A **96-sample (2 ms) convex join** blends the previous interval's continuation into a changed interval at the same common cycle boundary; weights sum to one. This is estimated join handling, not an arbitrary 80 ms grain window or a claim of native phase. It changes local pitch as well as time within the declared small bound. No whole-record stretch, phase inversion, artificial reverb, EQ, compression or bass boost is used.

Identical 25 ms file-edge fades are applied to A/B/C; the accepted full reference is not edited. The maximum measured exhaust step at cycle joins is **0.003244 full scale**, below the predeclared 0.05 rejection threshold. This numerical check is not an audibility certificate.

| Comparison | What changes | Peak / RMS | Listening result |
|---|---|---|---|
| A accepted excerpt | Original timing/gains; presentation edge fades only | 0.273804 / 0.076585 | Baseline |
| B marker-state | Exhaust interval selection, small retiming and join handling; gains unchanged | 0.237549 / 0.071245 | Clear improvement over A |
| C exhaust-led | Same B timing; engine amplitude ×0.35, exhaust unchanged | 0.154297 / 0.064712 | Preferred balance; more exhaust presence desired |

All have **zero clipped/nonfinite samples and no silent 20 ms windows**. B engine/exhaust remain separate stems. C is reconstructible from those components with its declared engine scalar; its engine RMS is about **13.49 dB below exhaust RMS** in this excerpt. This is an authored listening preference, not calibrated emission SPL or a universal vehicle balance.

A/B holds component gains fixed; B/C separately tests balance. No loudness normalisation was applied. Combined RMS differs (~−0.63 dB B versus A), so this is an informal labelled comparison, not a blinded loudness-matched proof. The mode also includes small resampling/join changes: listening does not isolate which sub-operation contributes how much. It supports the tested method as a whole, not a unique native causal reconstruction.

The owner heard each excerpt twice and confirmed clear improvement for B, then preferred C's balance. Full removal of all ghosting and behaviour over the complete 19-second sequence remain untested. The desired “rolling thunder” exhaust presence is a separate quality target. These are dry source-component previews with no world acoustics/presence processing; stock timbre may limit the ultimate result. GTA's original engine/exhaust balance is not the quality target, and no effect is added here to disguise a defect.

## Tools, repeatability and validation

New original files: `tools/audio/cycle-analysis.mjs` (metadata/independent autocorrelation and map guards), `Inspect-CycleEvidence.mjs` (private evidence CLI), `tools/audio/cycle-experiment.mjs` (bounded separate experiment), `Render-CycleExperiment.mjs` (private A/B/C and stem writer), and `tests/Test-CycleEvidence.mjs`. Existing reference/grain renderers and production telemetry are unchanged. No additional package or third-party binary is required.

Six-stream/26-window analysis took **733.786 ms** locally, process RSS ~96.9 MB. Experimental renders took **97.982 and 97.632 ms**, with **all five output WAV hashes equal** across runs. The experiment timer includes scheduling, rendering, encoding, hashing and metering, excluding input reads and final disk writes; the analysis timer includes source reads after metadata loading. These are offline file/analysis measurements, not audio-callback or game-performance budgets. Original-source, accepted-reference, rejected-preview and previous-candidate hashes remain matched. No installed archive was accessed, so no new archive-hash verification is claimed.

Twelve new synthetic tests exercise known/phase-shifted periodic signals, dominant harmonics and subharmonic false matches, analytic chirp tracking, amplitude invariance, constant/short/invalid inputs, held-out spacing models and negative controls, marker corruption, unequal counts, reversals/plateaus, bounded warps/positions, deterministic playback, immutability and private output boundaries. The local suite passed these plus **8 deceleration tests, 19 stock-audio tests, 8 extraction/publication guards, 15 ownership tests, 65 core assertions, 35 drivetrain assertions, 17 parser tests, 3 diagnostic-analyser tests, 122 Phase 1 checks, 9 configuration assertions and 8 append expectations** through `tools/Test-Offline.ps1`. Hosted CI is reported separately. No proprietary content or playback endpoint is required by CI.

Reproduce using private inputs already prepared by P2-03:

```powershell
node tools/Inspect-CycleEvidence.mjs .local/audio-reconstruction/decoded-final .local/audio-reconstruction/NEW-cycle-evidence
node tools/Render-CycleExperiment.mjs .local/audio-reconstruction/decoded-final .local/audio-reconstruction/reference-01 .local/audio-reconstruction/NEW-cycle-preview
# Explicit local playback when desired, never invoked by CI:
.\build\audio\PlayPrivatePreview.exe .local\audio-reconstruction\NEW-cycle-preview\B_marker_state.wav
```

Source/layout/fingerprint, size, reparse/symlink, output isolation and no-overwrite guards remain in force. Audio, full marker arrays, raw XML, parser binaries and workstation paths stay private. Public results contain original code/tests, scalar/reference findings and numeric measurements only. No project licence is selected. Existing PR listening observations are written in first person at the owner's request; technical results remain factual and separate.

## Next decision

**Ready for a bounded synthetic-relative-state research prototype, not a production RPM/load renderer.** Minimum scope: slow holds/sweeps inside the validated 14–28 marker-state branch, separate engine/exhaust components, bounded rate/join controls and the preferred exhaust-led mix. Inputs must be labelled authored normalised state, never live/crankshaft RPM. Idle/acceleration transitions, full-range tails, rapid shifts, stationary revs and load-dependent source behaviour need further evidence. Native clock evaluation, general source phase and physical engine-order calibration remain unknown.

Do not automatically implement that next prototype or add presence effects. Live RPM, native engine suppression, per-instance ownership, crash-safe handoff, real-time GTA audio and propagation remain separate unresolved gates. The accepted reference remains intact; this milestone does not begin Phase 3.
