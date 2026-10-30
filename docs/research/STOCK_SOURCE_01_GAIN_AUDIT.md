# STOCK-SOURCE-01: source-to-output gain audit

Read-only audit of the existing PR #74/reference source at the start of this increment. No game or audio endpoint was opened. This document does not certify stock decoding or human perceptual quality.

## Existing transfer path

`engine/paths.mjs` applies each material's square-root **energy** coefficient once, followed by pressure spreading, authored directivity and frequency-dependent atmospheric loss. The steady pressure factor is:

`sqrt(materialEnergy) * radiation * referenceDistance / max(distance, referenceDistance) * 10^(-airDbPerMetre * distance / 20)`.

For zero directivity, no material/air loss and reference distance 1 m, distance 4 m is -12.041 dB. `StreamingRenderer` decomposes input into complementary bands (`low`, `upper-low`, `x-upper`); equal band coefficients reconstruct the source. Equal-power stereo panning preserves summed channel energy, while RMS averaged over the two channels is 3.010 dB below the mono source. The ordinary master 0.7 is a further -3.098 dB. Those conventions must be accounted for when comparing a mono dry asset with stereo output.

A private actual-pipeline test used a steady 1 kHz signal, no air/directivity/reflections, master 0.7 and the production causal renderer. Measured stereo RMS / mono-source RMS ratios were:

| Distance | Predicted | Measured | Residual |
|---|---:|---:|---:|
| 1 m | 0.494975 | 0.494769 | -0.0036 dB |
| 4 m | 0.123744 | 0.123581 | -0.0115 dB |
| 16 m | 0.030936 | 0.030925 | -0.0030 dB |

Small residuals are compatible with fractional-delay interpolation. This found no hidden large loss or duplicate material/filter attenuation. It does not measure genuine source power or prove that the resulting preview is sufficiently audible.

## Live policies are separate

GitHub metadata was checked on 30 October 2026: PR #73 head is `84e6df094c77ca6e694bcd140191de9b7e47c77c`; PR #75 head is `4b520f225246a019129a41b4b7f503eb4f8f57ab`. Both were read only; neither was merged or modified.

PR #75 uses renderer 0.35 and native host 0.20. Their combined factor 0.07 is -23.098 dB before distance and panning. An offline stock-source WAV must not accidentally inherit that additional native-host attenuation. Conversely, a strong offline WAV is not evidence of an approved live gain setting.

PR #73's new 10 m finite-emitter calibration is explicitly restricted to its original 600 Hz beacon. Its pressure cap and derivative continuity address the beacon's near-field guard rejection; it is not a stock-vehicle calibration. The newer continuous rate/pan transition policies are absent from the PR #74-based offline path. Do not claim that reading the corrections reconciles this branch with them; evaluate actual offline motion and preserve that limitation.

## Late-field finding

The current vehicle audition sends **already propagated direct-stem PCM, after renderer master gain**, into the existing FDN. The FDN's input is `0.5 * (left + right)`. Its room excitation consequently follows receiver distance attenuation, and diffuse/phase-opposed stereo content can cancel on downmix. This is not a source emitted-power send. It is a documented model limitation, not proof that changing the scalar wet parameter is the correct fix.

The FDN already uses `sqrt(1-g^2)` feedback-energy input normalization; replacing it with `1-g` would reintroduce avoidable attenuation. Orthogonal feedback and damping keep decay bounded, but the declared coherent-input L2 bound remains relevant. A stochastic/white-noise calibration does not bound every tonal resonance peak.

A bounded improvement may feed calibrated original source energy into the existing late field only while the source occupies a fully authored enclosure. Keep direct and finite early arrivals on the existing renderer. Report the source-send construction, mono/stereo convention and any coherence approximation. Measure late-only, early-only and total energy over the **same time windows**. Do not infer a tunnel T60 or arbitrary wet-gain target from an edited phone recording.

One linear source-send construction for the two independently located engine/exhaust streams is:

```text
e = commonSourceGain * enginePressureWeight * enginePCM * rendererMaster
x = commonSourceGain * exhaustPressureWeight * exhaustPCM * rendererMaster
sE = [1,-1,1,-1,1,-1,1,-1]
sX = [1,1,-1,-1,1,1,-1,-1]
u[i] = sqrt(1-gMax^2)/sqrt(8) * (sE[i]*predelay(e) + sX[i]*predelay(x))
```

The normalized injection vectors are orthogonal, so the input-vector energy is `(1-gMax^2) * (e^2 + x^2)`. This retains the real waveforms and avoids cancellation from averaging two distinct source locations into a single scalar send. It does not rectify signals, add noise or manufacture a transient. The existing FDN feedback, damping, onset and 0.22 output wet calibration can remain intact. A second predelay buffer is needed. This construction models two inputs to one diffuse enclosure; it does not recover exact positions, axial modes or an impulse response. Final room peaks and coherent tonal cases still require measurement.

The proposed fixed pressure weights 0.5/0.5 are an explicit two-emitter amplitude budget and preserve their decoded level ratio. For a declared four-vehicle coherent headroom reserve, let `P` be the largest **pre-limiter** single-vehicle peak over all supported, uncalibrated close/flyby/environment cases. A common attenuation `min(1, 0.8/(4*P))` bounds four identical, aligned worst-case outputs to 0.8. This is a conservative digital design budget, not a universal loudness target or runtime capacity proof. It must be applied once, frozen for all previews, and followed by final renders showing no actual limiter activity. A limited/clipped WAV cannot supply the calibration peak.

A residual-loss gate against a combined dry reference must also account for the different retarded delays of engine and exhaust. Physical interference can make the positioned sum differ from `0.5*(engine+exhaust)` at one point. Diagnose the individual stem transfer and expected phase relation before treating a band loss as an implementation defect or compensating it with EQ/gain.

## Reusable calibration and quality gates

1. Preserve decoded engine/exhaust sample levels and graph-proven level relationships. Raw REL numeric fields are not decibels unless their semantics are verified. Never substitute one vehicle's bank for another.
2. Declare what amplitude at the model's reference distance means. Decoded bank PCM alone does not establish a one-metre acoustic source pressure. If a monitor-equivalent audition reference position is chosen, state it as an authored digital calibration, not measured source power or SPL.
3. Prefer one explicit common calibration factor derived from all supported states and vehicles, with engine/exhaust relationships retained. Freeze it across close, flyby and environmental comparisons; no per-file normalization or AGC. Publish the factor and the reason it is sufficient, rather than hiding it in the master gain.
4. Before acceptance, evaluate actual 50 ms RMS, momentary/short-term loudness, band power and crest factor around the near pass, plus whole-file LUFS. Compare the output to the matched unprocessed source at that operating state, not an unrelated full-file average. Do not use nonzero PCM or lack of clipping as a loudness gate.
5. Account for the expected directivity/distance/master/pan loss independently, then investigate residual loss or excessive band removal. Increasing master gain cannot diagnose a missing/mis-scaled source stage.
6. Test the fixed source calibration against near-range positions, the actual finite reflected-path sum and late field, and a declared simultaneous-source case. Retain a positive peak margin. State which concurrency and geometry were tested; do not extrapolate a single-vehicle peak to an unrestricted four-car mix.
7. Gate on finite output, no limiter activity/clipping, intact histories, explicit source provenance, bounded transition discontinuities and retained deadline misses. A partial source matrix or uncalibrated physical sensation remains incomplete even if these digital checks pass.

These are digital evidence requirements. Chest impact, recognition and convincing immersion still require the user's comparison on real playback hardware.

## Measured source-allocation revision

The first matrix used common source gain 0.8154645116, derived from four perfectly coherent copies of the single largest output peak. Its near-pass level review still found approximately -31 to -32 dBFS maximum 50 ms RMS and about -33 LUFS in the selected 400 ms windows. Absence of clipping was insufficient grounds to call those examples forceful. The ordinary 1 m reference spreading law was not identified as defective.

A private, read-only linear probe then used all 24 existing matrix WAVs and a predeclared set of **40 four-distinct-vehicle mixtures**: six same-case ensembles plus two mixed-case ensembles, each evaluated at offsets `[0,0,0,0]`, `[0,.001,.003,.007]`, `[0,.009,.019,.031]`, `[0,.137,.421,.913]`, and `[0,.5,1,1.5]` seconds. Delays pad the complete waveform; nothing is trimmed, normalized or pitched. This is an explicit offline test policy, not arbitrary game concurrency.

Using one common source factor, the proposed limits are:

```text
G <= 2                               declared source-calibration cap
G <= 0.9 / maxUnscaledDryPeak         dry reconstruction headroom
G <= 0.8 / (2*maxUnscaledSinglePeak)  two coherent worst-case outputs
G <= 0.8 / maxUnscaledFourMixPeak     forty declared four-distinct mixtures
G <= 0.98 / maxUnscaledEmitterPeak    individual renderer input validity
```

The measured maximum dry reconstruction across **all states, including flyby**, gives the historical 24-case probe's binding limit: **G = 1.5956559621**, or +5.83068 dB relative to the first matrix. The two-coherent and four-mixture limits are 1.6309289988 and 1.6052381389 respectively. With the unchanged 0.5 pressure shares, the fixed multiplier per blended source is 0.797828 (-1.96 dB), before the bounded running envelope. This removes overconservative source allocation while retaining the master, EQ and individual files' relative levels. It is not an instruction to reuse that numerical gain after the scene set changes.

Linear predictions at that gain are: individual input peak 0.663526, dry reconstruction peak 0.900000, largest single processed peak 0.391349, two coherent outputs 0.782698, and the largest declared four-distinct mixture 0.795225. These are predictions from the initial matrix; final renders and their mixtures must reverify them before acceptance.

**Known out-of-policy failure is retained:** aligning each distinct vehicle's positive/negative extrema across selected cases produces predicted peaks of 1.24–1.34 at this gain. It would be false to claim unrestricted four-vehicle headroom. The revised calibration policy is two coherent worst-case outputs plus the declared 40 distinct mixtures. Arbitrary four-vehicle phase alignment, different source placement or unknown geometry needs a separate mix-capacity policy before live use. The earlier four-identical bound is preserved above as the rejected conservative audition policy, not silently relabelled as passing at the higher gain.

## Final expanded calibration policy

The final scene set adds a controlled `wall-open`/`wall` pair to the previous six cases. Calibration was derived afresh from **32 scouting renders** (four distinct vehicles times eight cases) at common gain 0.25, followed by **32 final renders** at the newly derived common gain. The earlier 24-case linear prediction remains historical evidence; final confirmation comes from the expanded run below.

The predeclared four-distinct-vehicle mixture policy expands to **50 mixtures**: all eight same-case ensembles plus the same two mixed-case ensembles described above, each at the same five offset sets. All four models appear exactly once in every mixture. Integer sample delays pad complete stereo waveforms, preserving both channels and the entire late tail. Mixed-case ensembles are digital headroom stresses, not a claim that their different environments share one physical location.

For each scouting waveform, divide its actual unmodified source, dry and processed peaks by 0.25. Sum the retained scouting PCM to measure the 50 mixture peaks before applying the final factor. Derive one common factor from the smallest of the source-calibration cap 2, dry ceiling 0.9, two-coherent-output ceiling 0.8 and measured 50-mixture ceiling 0.8. Verify the individual emitter input ceiling 0.98 as well. No scouting output with limiter activity, clipping, missing history or nonfinite samples may be used to infer unscaled peaks.

The expanded run's binding limit is the dry reconstruction ceiling. Its frozen common source gain is **1.5956559506856056**, with common renderer master **0.7**, fixed engine/exhaust pressure shares **0.5/0.5**, and no native-host gain or independent normalization. The measured final maxima are:

| Quantity | Actual final peak |
|---|---:|
| Individual emitted input | 0.6635256343 |
| Dry stereo reconstruction | 0.9000000358 |
| Single processed vehicle | 0.3913489580 |
| Two coherent worst-case copies | 0.7826979160 |
| Fifty declared four-distinct mixtures | 0.7952245548 |

The dry value exceeds the analytical 0.9 ceiling by 3.58e-8 from Float32 rounding and passes the explicitly declared 1e-5 verification tolerance. All final processed outputs have zero clipping/nonfinite samples, limiter activity, renderer missing history, cursor resets and affected PCM-history frames. The simulation separately records **2,264 `missingPast` exclusions**: paths whose retarded emission precedes the first available pose key are withheld. This counter is retained and is not relabelled as a renderer PCM-history fault. Invalid geometric path candidates are also rejected normally; neither counter means every proposed reflection became an audible path.

An independent read-only check decoded the existing 32 final Float32 WAVs and summed all 50 mixtures in Float64 at their declared sample delays. Their maximum peak error against the report was **zero**; the largest RMS error was 1.69e-14. No audio was regenerated for that verification. Actual measurements and source/motion/control bindings are published in `evidence/stock-source-01-render.json` through an explicit data-only allowlist.

Both the 32 scouting cases and the 32 final cases contain **27,496 instrumented blocks** apiece, with **zero reported deadline misses** in source, DSP/late and complete-block timings. Against the 10.6667 ms block budget, the complete-block maximum was **7.6899 ms** for scouting and **5.8321 ms** for final rendering; the largest individual-case 95th percentiles were **2.1122 ms** and **2.0278 ms**. The first instrumented Bati close scout's maximum was 5.3596 ms. Process/cache coldness was not independently controlled, so these results must not be promoted to cold-cache or live-game performance proof.

Scouting entries retained peaks and timings but not individual diagnostic counters or source hashes. The evidence distinguishes the assertions enforced by every completed scouting render from independently serialized final counters; absent scout counters/hashes are not fabricated. Regenerated deterministic control/motion bindings are labelled as such. Neither the expanded policy nor passing it guarantees arbitrary four-vehicle phase alignment or untested geometry; the known extrema-alignment counterexample remains relevant.

## Source playback review and limits

The source player retains the decoded sample rate through linear interpolation at 48 kHz, with no independent pitch automation. The actual loader admits only 24, 32 and 48 kHz assets, so it does not use the helper's generic higher-rate downsampling path. Complementary smoothstep overlaps use weights zero and one at the endpoints; promoting an incoming head continues at its next native sample. Engine-state weights and the running envelope are smoothed independently. No necessary sample discontinuity was found in that transition logic.

Focused source/grain fixtures demonstrate interpolation, deterministic state/overlap processing, bounded interval reads, convex gain allocation, smooth weight endpoints and nonoverlapping output buffers. They do not recover native granular phase alignment or absolute RPM, and they do not establish that real-bank seams are inaudible. Actual source transition diagnostics and human listening remain necessary. The source API now rejects output views overlapping any verified source sample range **before mutating playback**, closing the gap identified during review. A fixture covers that rejection, and all **eight focused source/grain tests passed** after the correction. Shared calibration is explicitly bounded at 2, preserving each stem's convex decoded-amplitude bound through its fixed 0.5 pressure share.

## Implemented bounded source send

`BoundedLateReverb.processSourceStemsInto(engine, exhaust, outLeft, outRight, { enabled })` now provides the orthogonal two-stem excitation above. It uses one existing FDN, one added exhaust predelay and caller-owned output buffers. It fixes the input basis per instance, so an already-running received-stereo field cannot silently switch to source energy. A disabled initial call starts with zero injection; disabling an active field preserves its decay with the existing send smoothing.

No wet/decay/onset value was retuned. Unsupported/outdoor evidence still returns silence. The legacy received-stereo method produced byte-identical PCM on the captured 48,000-frame seeded-input regression: SHA-256 `0ec3d840f0a80caaba3adc4c8859ddd7bea9604d7c3d909a7d986b42e2ed5be4`.

Six focused new tests and all nine existing environment tests passed (15 total). They cover antiphase inputs, linear superposition, caller chunk boundaries, joint-input L2 bounds, a flat-room T60 check, silent unsupported/disabled startup, complete-buffer validation, non-overlap and fixed input-basis ownership. This is numerical source-send validation, not a perceptual approval or a complete four-vehicle audition result.
