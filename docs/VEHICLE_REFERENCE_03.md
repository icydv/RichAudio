# VEHICLE-REFERENCE-03: the hypercar flyby

Continues local review `94bfed6`, based on PR #74 `eef0cbc2e96e09754d87b375975eb1053422121e`. This increment changes authored driving performance only. The original synthesizer, V12/V8 profiles, EQ, causal solver, renderer, component layouts and gain staging are unchanged. No GTA, endpoint, branch reconciliation, benchmark matrix or full CI run was used.

## Controlled pair

Both 10.2-second, 48 kHz Float32 stereo files use seed 731, master gain 0.7, the same stationary listener at `[0,4,1.5]`, eight independent component histories, CPU/Quality processing and identical direct-only geometry. There is no per-file normalisation or loudness matching. Motion and all propagation-control hashes match exactly; tyre and aero PCM hashes also match.

- `constant.wav` keeps the original 7,644 target RPM, 0.82 load, 0.9 throttle and gear 4. It uses the **new shared trajectory**, making it a diagnostic counterfactual rather than a rigidly coupled drivetrain. Original synthesis startup smoothing remains present.
- `dynamic.wav` derives target RPM from road speed, authored wheel radius 0.34 m, final drive 3.4 and gear ratios 1.95/1.60. A 3→4 upshift at 3 s uses a 0.25 s clutch-ratio transition and smooth control reduction; the existing synthesizer's 0.10 s shift envelope and RPM smoothing remain intact. Load/throttle grow during acceleration, then lift at 6.2 s. Pops are explicitly disabled.

Shared speed rises smoothly from 25 to 45 m/s over 0–3 s, holds during the shift, then reaches 60 m/s (216 km/h) at vehicle-origin passage at 5.5 s. After 6.2 s it decelerates smoothly to 42 m/s by 10 s, then continues. Position is the analytic integral of speed. Peak acceleration is 10 m/s²; peak deceleration is 7.105 m/s², requiring authored braking alongside the lift. These are kinematic estimates, not a calibrated Huayra drivetrain/traction model.

The track extends from x=-234.375 to +244.2 m. The old ±125 m fixture would cut it off. Two explicitly empty 256 m regions, x[-250,6] and x[-6,250], switch at the pass using existing scene replacement. Their overlap contains every retarded emitter at the transition. No geometry limit is relaxed, no reflectors are invented, and the direct path histories survive. Both cases retain all eight paths at the end. Initial silence of about 0.68 s is causal travel from simulation startup, not an amplitude gate.

The Pagani reference's rising harmonic trajectories, pitch knee and long recession motivate this performance. The operating controls are authored, not recovered video RPM. No reference audio is used in synthesis. The reference recordings' unknown microphone/gain/edits cannot calibrate SPL or determine perceptual success.

## Measurements

| Whole-file measurement | Constant | Dynamic |
|---|---:|---:|
| Stereo RMS | 0.00107009 | 0.00110645 |
| Peak | 0.02395413 | 0.02786517 |
| Synthesized shifts | 0 | 1 |
| Pops / clipped / nonfinite / limited | 0 | 0 |
| Missing history / cursor resets | 0 | 0 |

Dynamic event measurements below are on receiver time. Source RPM is sampled at that timeline; received firing-family frequency uses RPM at the **retarded emission frame**, multiplied by the independent path Doppler rate. It is a predicted family frequency, not a perceptual pitch score. The nearby Welch peak is a measured descriptor and may overlap other components.

| Window | Source RPM median | Speed m/s | Predicted received firing Hz | Nearby measured peak Hz | Stereo RMS dBFS | Peak |
|---|---:|---:|---:|---:|---:|---:|
| Distant approach 0.9–1.5 s | 5779 | 32.04 | 525.8 | 530.3 | -80.39 | 0.000329 |
| Acceleration 2.0–2.7 s | 7779 | 42.60 | 775.4 | 773.4 | -77.48 | 0.000460 |
| Shift vicinity 3.35–3.65 s | 7263 | 45.53 | 946.4 | 953.3 | -73.28 | 0.000871 |
| Near pass 5.45–5.65 s | 9147 | 60.00 | 915.7 | 915.0 | -44.04 | 0.027865 |
| Lift/braking 6.55–7.05 s | 9079 | 58.80 | 778.9 | 779.3 | -71.24 | 0.001830 |
| Recession 8.0–8.6 s | 7859 | 49.59 | 718.7 | 714.8 | -79.71 | 0.000384 |
| Far 9.7–10.2 s | 6501 | 42.01 | 607.5 | 612.3 | -82.32 | 0.000293 |

The shift's source/receiver timing differs because of propagation; a received pre-shift tone can coexist with a lower current source RPM. Near-to-far dynamic RMS falls 38.27 dB. Its 2–6 kHz / 500 Hz–2 kHz ratio falls from -7.30 to -14.99 dB. That evolution combines changing engine state, directivity, distance and existing air attenuation; it is not attributed to air absorption alone. The recorded tail stays nonzero rather than receiving an artificial cutoff or fade.

## Focused validation and reproduction

Four new focused tests passed: integrated continuous motion, wheel/gear control provenance, bounded empty coverage and sample-level crank/drivetrain phase through the shift. Four existing selected tests passed for distance bands, multi-order Doppler, recession and shift phase behavior. Full renders assert retarded time/distance consistency, identical propagation, eight final paths, stable history, no nonfinite/clipped/limited output and no pops. Numerical continuity passed; absence of perceptible clicks still requires human listening.

The original four-second `05-pass-direct.wav` was separately regenerated through the unchanged original render tool and matched its existing SHA-256 exactly: `d93787dd6595ce813626fcd4281ae3d27c9454359bb8fbf7a3cb18e8dedfed7d`. It remains unchanged. The new matched baseline is deliberately 10.2 s on the new trajectory; it is not presented as the old four-second waveform.

```powershell
node --test tests/Test-VehicleReference03.mjs
node tools/Render-VehicleReference03.mjs .local/vehicle-reference-03-new
# Existing numpy/scipy/matplotlib environment; --dependencies is optional.
python tools/Analyze-VehicleReference03.py .local/vehicle-reference-03-new --dependencies <existing-analysis-dependencies>
```

The private comparison package contains both WAVs, `listen.html` with no autoplay, matched-scale `spectrogram.png`, complete per-block `measurements.json`, windowed `event-measurements.json`, and legacy regression evidence. [Portable measurements](../evidence/vehicle-reference-03.json) contain scalar results without audio or private paths. No generated audio/reference footage is committed.

**Next decision: listen to this pair.** Judge acceleration, the shift, proximity, pitch knee and recession at one common comfortable playback setting. Do not automatically add EQ, reverb or synthesis features. Human perceptual acceptance remains open.
