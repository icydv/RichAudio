# STOCK-SOURCE-02: optional distance presentation

The reviewed default loses only 0.99 dB more nominal high-band than low-band energy at 100 model metres. The previous accelerating flyby could not isolate that response because source state, orientation and Doppler also changed. Lower absolute high-frequency level alone was an insufficient distance-tone test.

`vehicleDistanceSceneOptions('authored-detail-loss-v1')` now offers an explicit optional scene configuration through the existing path-band coefficients. It uses `[0.0001, 0.01, 0.10]` dB per model metre. `physical-default` retains `[0.0001, 0.001, 0.01]`, equal to the untouched core defaults. The source, renderer, filters, master gain, causal propagation, pressure spreading and room model are unchanged.

The authored coefficients are a conservative presentation assumption for listening comparison, not recovered recording calibration or a universal atmospheric model. Relative to the default, their nominal additional loss at 2 m is only 0.018 dB mid and 0.18 dB high; at 100 m it is 0.9 and 9 dB. No additional low-band attenuation is introduced. Selection is explicit per scene; this profile is not enabled globally.

Two focused tests use identical original harmonic and transient PCM at 2, 10, 25, 50, 100 and 200 model metres, with stationary source/listener, fixed orientation and no surfaces or reverb. A 256 m-long valid synthetic visibility tile contains all six positions. Audible outputs retain the same gain and physical 1/r loss. Diagnostic measurements compensate only the known distance/master factor to distinguish relative spectral and temporal effects from overall level. No output is independently normalized.

The actual renderer measures approximately 0.107, 3.821 and 5.335 dB additional high/low loss at 2, 100 and 200 m respectively. At 200 m, the diagnostic pulse's energy centroid shifts by 2.253 ms and its RMS-relative adjacent-step detail falls by about 48%; at 2 m its centroid changes by only 0.085 ms. Retarded delay remains distance/343, stationary Doppler rate remains one, and no renderer/history faults occur. These are objective diagnostic changes, not an assessment that the result sounds convincing.

The existing complementary bands use first-order filters around 400 Hz and 4 kHz. Mid-band leakage into higher frequencies makes the actual response much gentler than the nominal band coefficients; this increment does not provide a steep low-pass cutoff or establish a full distant/foggy impression. Existing linear fractional-delay interpolation also produces modest high-frequency ripples with fractional path delay. Comparing the authored and default profiles at the same distance controls that shared effect.

The corrected source-clock player was then checked with genuine Schafter PCM at the same six distances. `tools/Render-StockSource02Distance.mjs` recreates the held material from a supplied private decoder manifest. Operating point 0.7 and load 0.9 remain constant from startup, with the existing internal state/running smoothing. Common source gain remains 1.5956559506856056 and engine/exhaust shares remain the explicitly authored 0.4/0.6 candidate. Their energy-equivalent mono sum is placed at one co-located diagnostic emitter to isolate distance from the full car's two distinct positions. This is not a recovered native Schafter mix.

The reproduced 3-second held input's SHA-256 is `b2901d207a72f2162993c861f5aa0e2872d64a94997bfe9f4f7df5f8ceedeeb5`, matching the separately prepared held reference exactly. Every profile/distance uses those same samples. The measured additional high/low loss is **0.096 dB at 2 m**, **3.259 dB at 100 m** and **4.502 dB at 200 m**. The 40–400 Hz body band remains the reference for the 4–10 kHz detail ratio; the additional mid/body change at 200 m is only 1.069 dB. RMS-relative adjacent-sample detail at 200 m is 82.6% of the default profile at that distance. The 10 ms envelope coefficient of variation rises by about 8%, which is reported as an observed redistribution of modulation, not assumed to be a perceptual improvement.

Both private listening WAVs concatenate 2, 10, 25, 50, 100 and 200 m in that order. Segment starts are **0, 3.25, 6.50, 9.75, 13.00 and 16.25 seconds**, each lasting 3 seconds with a 0.25-second gap between segments. Total duration is 19.25 seconds. `fixed-state-distance-default.wav` and `fixed-state-distance-authored.wav` use the same master and source gain, with no delivered gain compensation or normalization. The far segments are consequently much quieter. Each 3-second output truncates the final emitted material by its propagation delay; spectral/detail analysis uses the common **0.65–2.10-second emitted-time window**, which arrives fully at every distance.

`tools/Analyze-StockSource02Distance.py` produces matched 40 Hz–10 kHz compensated spectra, raw arrival envelopes with distance/343 markers, and an aligned emitted-time waveform zoom in `fixed-state-distance.png`. The actual largest output sample is **0.1968247890**; every case is finite, unclipped and free of renderer/PCM-history faults. The retarded-frame error is zero and stationary rate error is below 2.1e-14. Startup pose-history exclusions remain separately reported. This was a focused distance comparison, not another timing campaign.

Numerical evidence is in `evidence/stock-source-02-distance.json`, including `genuineHeldSource`; PCM and plots remain private. No changing operating point, bearing or physical Doppler was used to tune this profile. Native recognition, realism and whether the optional presentation is preferable remain human-listening decisions.

Reproduction takes explicit private paths rather than embedded extraction locations:

```text
node tools/Render-StockSource02Distance.mjs <private-decoder-manifest> <fresh-private-output-directory>
python tools/Analyze-StockSource02Distance.py <private-output-directory>
```

The analysis script uses NumPy, SciPy and Matplotlib. The output directory must be inside the checkout's ignored `.local` storage; existing comparison artifacts are not overwritten.
