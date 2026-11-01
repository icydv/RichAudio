# PLAYABLE-15 isolated offline audio review

The owner's spectral measurements are independently confirmed: the genuine-trace WAV has **96.8242% of unweighted power below 600 Hz**, **99.8067% below 1.2 kHz**, stereo correlation **0.997036**, peak **−25.0519 dBFS** and RMS **−36.0728 dBFS**. A separate Hann/Welch calculation gives 96.8167% and 99.8047%, respectively. Gated file loudness is approximately **−34.61 LUFS**; no endpoint or physical sound-pressure measurement is implied.

The dominant cause is already visible before acoustic processing. The actual dry exhaust output is strongly bass weighted and the preserved pressure calibration makes its post-acoustic stem **27.915 dB RMS louder than the engine stem**. The original decoded exhaust recordings are themselves bass weighted. The brighter engine recording survives the source player, but contributes little to this particular final balance.

| Signal | Power below 600 Hz | Power below 1.2 kHz |
| --- | ---: | ---: |
| Original engine acceleration recording | 45.15% | 52.79% |
| Original engine idle recording | 76.82% | 81.12% |
| Original exhaust acceleration recording | 94.79% | 99.74% |
| Original exhaust idle recording | 99.91% | 99.98% |
| Actual dry engine in genuine trace | 60.47% | 66.38% |
| Actual dry exhaust in genuine trace | 97.18% | 99.87% |
| Unchanged final stereo output | 96.82% | 99.81% |

Whole raw recordings are not controlled equivalents of the trace's selected operating intervals. The dry taps provide the stronger stage comparison because they use the actual source controller and the captured observations. All six raw layers were analysed at their declared native 48 kHz rate; no sample-rate reinterpretation occurred.

## What the actual path shows

[The gameplay source](../src/acoustics/vehicle/gameplay.mjs) selects the existing `authored-detail-loss-v1` direct scene, master gain 0.175 and existing source-state mapping. The independently sampled source/listener path distances were approximately **4.84–5.28 native units for engine** and **4.44–5.82 for exhaust**. They retain the existing one-metre-per-native-unit assumption; this review does not calibrate that assumption.

[The distance profile](../src/acoustics/vehicle/distance-presentation.mjs) supplies per-metre low/mid/high loss `[0.0001, 0.01, 0.10]` dB. At these measured path lengths, the nominal high-band attenuation relative to the low band is only **0.44–0.58 dB**. [The path calculation](../src/acoustics/engine/paths.mjs) applies broadband inverse-distance spreading and directivity in addition to those band losses. The final nominal coefficients were retained in the private report. This small high-band loss cannot explain the large engine/exhaust spectral difference.

[The renderer](../src/acoustics/streaming/causal.mjs) uses complementary first-order bands around 400 Hz and 4 kHz: `low`, `upper − low` and `input − upper`. With equal band gains their sum is the original signal. These crossover frequencies do not constitute a 400 Hz or 600 Hz output low-pass. The replay uses conditional direct sound with no collision tile or material interactions, so no measured terrain/occlusion filter is present in this WAV.

[The preserved pressure policy](../src/acoustics/vehicle/stock-pressure.mjs) applies 0.25 to engine and 2.5 to exhaust. Those factors include the accepted 10:1 relative pressure change and common 0.25 trim; they are not a measured native GTA mix. The actual source-controller exhaust RMS is already about 7.96 dB above engine RMS before these factors. Together with small path differences, that produces the measured 27.915 dB post-acoustic difference. Master gain, spreading and conservative headroom explain much of the low absolute file level; increasing global gain would raise the same bass-heavy balance.

Engine/exhaust cross-correlation is approximately **−0.0103**. Their destructive cross term changes total energy by only **−0.00359 dB** relative to an incoherent sum. There is no evidence here of broad cancellation removing the engine's upper spectrum.

The two sound emitters remain close to the forward camera axis: sampled pans were within roughly **±0.125**, and the renderer applies equal-power left/right gains to each common arrival signal. A nearly centred direct source therefore produces highly correlated stereo. Mono fold-down retains **99.904% of stereo RMS**. This is not proof of a phase fault, nor does this renderer demonstrate binaural head/ear cues or a diffuse room field in the conditional-direct scene.

## Diagnostic method and unchanged boundaries

A separate, private diagnostic script consumed all 670 original frames with the original replay schedule. It tapped the real dry engine/exhaust buffers immediately before acoustic processing. Two independent instances of the existing renderer then received the exact accepted controls, original gains and original role inputs, with the other role zeroed. The independently rerendered combined WAV is **byte identical** to the original `f65361738e36ce0e1bdb248ff1b724ba85e6be8e22b8d2d6c59fdd7efb0d73d8` file. Engine-only and exhaust-only post-acoustic stems sum to the combined output within **3.73 × 10⁻⁹**, consistent with float32 rounding.

The isolated review also evaluated arithmetic role recombinations; these are measurements, not selected calibration changes. Reducing the relative exhaust factor from 10 to 1 with engine unchanged would still leave approximately **91.96% below 600 Hz**, while reducing total RMS from −36.07 to −55.46 dBFS. A simple reduction alone therefore does not establish an acceptable final sound. No modified-balance WAV was created and no production setting was changed.

Private artifacts under `.local/playable-15/audio-review-01` include the actual dry role streams, post-acoustic role WAVs, waveform/spectrogram and spectral comparison plots, exact renderer/control observations and complete numeric analysis. These sound files and source data remain proprietary/private. The analysis helpers and plotting dependencies live only in that isolated directory. The public [sanitised evidence](../evidence/playable-15-audio-review.json) contains hashes and measurements, not assets, runtime identities or paths.

`listening-index.json` pins all owner-review files and their exact hashes. Nine additional WAV containers make the raw float streams directly reviewable without adding processing:

| Private file | Exact meaning |
| --- | --- |
| `dry-engine-mono.wav` | Actual source-controller engine samples before acoustic processing |
| `dry-exhaust-mono.wav` | Actual source-controller exhaust samples before acoustic processing |
| `dry-engine-left__exhaust-right__NOT-spatial-stereo.wav` | Same dry streams assigned engine left/exhaust right for comparison; **not spatial stereo or a physical premix** |
| `original-bati-<engine-or-exhaust>-<idle-or-accel-or-decel>-native-mono.wav` | Six original decoded recordings wrapped at their native rate, with original float32 sample bits unchanged |
| `enginePost.wav`, `exhaustPost.wav`, `combined.wav` | Existing exact post-acoustic role stems and unchanged combined stereo output |

The six trace-derived containers share the same 1,903,616-frame timeline; the original source recordings have independent lengths and phases. No normalisation, rebalancing, filtering, resampling or playback was performed to create the new containers. `per-block-alignment.csv` exports all **3,718** output blocks with their exact frame ranges, original-clock alignment, latest admitted recorded operating value, actual rendered/interpolated operating control and existing source-controller weights/rates. Unavailable controls are blank. `alignment-report.json` defines every field and proves that this independent control-export replay reproduced the original combined PCM hash again.

The directly reviewable figures are `waveform-spectrogram.png` and `spectral-role-comparison.png` in that same private directory. The listening index pins their hashes together with all WAVs, numeric reports and isolated helpers.

## Recommended next decision

Preserve the existing accepted pressure calibration and headroom for the initial separately approved audible demonstration. These isolated findings support a later informed balance decision; they do not authorise changing a candidate or weaken listener/identity/source-retirement acceptance requirements. The live startup outcome and any corrected candidate are documented separately in [the PLAYABLE-15 result](PLAYABLE_15.md).

Use the existing final-PCM and optional loopback hooks for that initial demonstration if separately authorised. Additional synchronised live dry/role/pre-acoustic stems require a future reviewed tap integration; they must not delay the first audible demonstration or be represented as already integrated into the candidate.

Before selecting a new audible balance, compare the original six layers, actual dry role taps and exact post-acoustic stems at deliberately matched listening levels under the appropriate separate authorisation. Establish whether the intended Bati demonstration should preserve this exhaust-dominant presentation or expose substantially more engine detail. A future isolated audition can vary the role balance and then set common headroom from measured peaks; global gain or added stereo width would not resolve the demonstrated balance issue by itself.

The operating-state-to-recording/interval mapping is authored and lacks a synchronised native-GTA reference. It may warrant a later matched reference comparison, but these measurements do not establish a mapping defect, wrong physical RPM, invalid asset decode or atmospheric-filter bug. No endpoint, live RichAudio playback, recording or human listening occurred during this review, and it did not modify any production source, sealed build, candidate, asset, host or calibration.
