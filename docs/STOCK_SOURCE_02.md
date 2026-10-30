# STOCK-SOURCE-02: source fidelity and presentation repair

**Audition-02 remains REJECTED. Corrected perceptual acceptance is PENDING.**

This isolated increment starts at `9ba87f2e5bac7e3d46e057a2fd0ad6dcfc775abf`. The earlier player had a real source-clock defect. Its bounds/energy checks missed pitch corruption; the prior 60 checks do not override the user's verdict. All 72 files in the rejected private audition still match their recorded hashes, and the old tracked checkout is unchanged.

Open `.local/stock-source-02/audition/listen.html` for the compact comparison. It has 18 manual audio players, one common volume control, exclusive playback and optional position carry for A/B. No autoplay, hidden normalization, limiter or compression is used. Original audio and plots stay local and uncommitted.

## Reproduced defect and correction

Before changing code, the attached `reproduce_grain_pitch.mjs` ran against the unchanged implementation and returned **169/85/85 Hz from 100 Hz**, for intervals containing one/two/four cycles. It returned exit status 1 with zero bounds violations, exactly as reported. The four old dry WAVs were independently reproduced bit for bit; all 24 original mono WAVs match their decoded Float32/PCM bindings. Schafter isolated propagation sums reproduce its old close WAV within `1.49e-8`. No archive extraction was restarted.

The old player consumed part of the incoming interval while overlapping it, so successive starts were approximately one interval minus overlap apart. Native read increment alone did not preserve repetition pitch. Its fixed seven-entry neighbour pattern, start jitter and zero-crossing search also changed material at a held operating point.

`StockGrainVoice` now has an explicit continuous phase clock. Complete observed offset spans supply interval durations. Adjacent spans are sampled at the same interval phase and blended continuously as the authored operating point changes:

```text
periodFrames = interpolate(adjacent complete interval lengths, state)
phase += nativeSampleRate / (48000 * periodFrames)
```

Fractional phase carries through wraps and state changes; it is never reset by selecting another span. No repeating neighbour pattern, start jitter or incoming-reader time consumption remains. State interpolation is continuous, with a 10 ms response inside the voice, after the existing source controller's 40 ms response. This changes the source clock, rather than hiding its error with a longer crossfade or EQ.

A bounded end-of-period blend can use genuine preceding context ending at the selected start. It occupies the end of the **full** interval instead of shortening its schedule. It is enabled only when the natural context join is smaller than the untreated self-loop join; interpolation cannot escape the original PCM. This is a local approximation, not a guarantee of inaudible seams. Idle has no verified offset atlas and uses a long waveform-matched loop. `NativePcmVoice` separately provides finite native-rate playback without loops, state selection or scheduling; the six untouched native Schafter WAVs remain the primary unmodified reference.

Engine and exhaust retain separate phase histories under shared operating state. They are not forced into a common oscillator phase. The paired acceleration/deceleration recordings have related state trajectories but not universally equal durations, counts or sample clocks.

### What the metadata supports

Across all 16 moving streams, `UnkFloat1` correlates with native sample rate divided by adjacent offset span at **0.9934–0.99997**, with median relative differences **0.10–1.12%**. Adjacent Schafter intervals support same-phase blending: median correlations are approximately **0.819/0.773 engine** and **0.961/0.958 exhaust**, acceleration/deceleration respectively. Intervals contain different repeated-pulse and harmonic structures; their duration is not divided by a presumed cylinder count or dominant harmonic.

These are **interval/cycle-rate observations**, not measured crankshaft RPM, identified native field units or a recovered GTA granular algorithm. Same-phase interpolation retimes neighboring source intervals to the interpolated period. Exact native transient texture and all loop semantics remain unresolved. See [cycle evidence](../evidence/stock-source-02-cycle-evidence.json).

## Fidelity evidence before spatial processing

The supplied reproducer now returns **100/100/100 Hz**, with zero bounds violations. Added analytical regressions cover 24/32/48 kHz, one/two/four cycles per interval, a harmonic stack, seam-inclusive sample identity, held-state modulation, a noncommensurate 107 Hz idle reference, and slow/rapid state ramps. Harmonic levels stay within 0.02 dB; the known periodic output matches an independently indexed native reference within `1e-6` at every sample, including seams.

Short genuine-source diagnostics start with Schafter, then Bati, Lectro and X80. All 16 held moving voices preserve the independently measured raw intervals' dominant harmonic orders. Raw/output order-distribution cosine is at least **0.99573**. The fitted peak/order error is at most 0.01174 Hz, with a **0.7324 Hz FFT-bin resolution**; the fitted value is not a calibrated frequency-accuracy claim. Held sources have no state hopping, all 24 PCM memories remain unchanged, and all source overread/finite checks pass.

Eight idle checks exercise two or three full wraps. Sixteen slow/rapid sweeps and four six-layer acceleration/lift/deceleration/stop sequences preserve phase history. Actual source-controller interval-rate changes peak at 0.10046/0.02755/0.12001/0.13820 Hz per sample for Schafter/Bati/Lectro/X80 under deliberately abrupt operating-state requests. Convex weights remain bounded and smooth. No new clock reset was demonstrated.

**Remaining source limitations are retained:** idle repeats a matched excerpt; context selection uses a local join criterion; some seam-local steps exceed natural raw-boundary examples, although they may improve untreated looping. For example Lectro idle-engine maximum local step is 0.1987 versus natural 0.1609 and untreated 0.2058. Short-window pulse energy also varies substantially in untouched recordings. Neither a smaller adjacent step nor an order match proves click-free, natural or recognisable sound. These comparisons are in [genuine-source evidence](../evidence/stock-source-02-source-fidelity.json); recognition and granular coloration require listening.

## Schafter balance

The reported fault is verified. In the old close view, exhaust is **9.0956 dB below engine** at 4.0–5.1 seconds. Source exhaust is actually 0.1137 dB above engine before propagation. Geometry predicts **9.1900 dB** additional exhaust attenuation: 2.8794 dB from distance and 6.3106 dB from the shared authored radiation assumption. Exhaust was present; its relative received level was dominated by that setup.

The compact authored Schafter comparison uses engine/exhaust pressure shares **0.4/0.6**, with directivity **0.1/0.35**. The baseline remains **0.5/0.5** and **0.1/0.65** for the controlled clock-only A/B. The common source factor **1.5956559506856056** and renderer master **0.7** remain unchanged. Shares sum to one and each calibrated stem stays below its decoded amplitude bound. Bati, Lectro and X80 do not inherit the Schafter mix.

This is an **authored side-balance hypothesis**, not interpretation of native values 400/800. It reduces unsupported directional suppression while retaining distinct viewpoints. Corrected held-state actual-renderer measurements are:

| Listener at 5 model metres | Baseline exhaust minus engine | Authored Schafter |
|---|---:|---:|
| Front | -13.82 dB | -4.99 dB |
| Side | -5.56 dB | +0.59 dB |
| Rear | +4.88 dB | +8.47 dB |

In the authored close study at 4.0–5.1 seconds, exhaust is **1.51 dB below engine**, and combined 20–500 Hz power share is **59.36%**. The separately rendered stems sum to combined output within `1.49e-8`. A targeted local search found no verified native Schafter in-game recording; that was not an exhaustive machine-wide search. Correct native mix and recognition therefore remain listening/reference decisions.

## Controlled distance presentation

The unchanged physical-default model uses `[0.0001,0.001,0.01]` dB/model-metre. A separate opt-in authored profile uses `[0.0001,0.01,0.10]` through the **existing** complementary path bands. It is explicitly perceptual tuning, not a measured atmosphere or SPL calibration. Core defaults, renderer, spreading, Doppler and filters are unchanged. No outdoor reverb or geometry was added.

One identical held Schafter source at operating point 0.7/load 0.9 is rendered at **2/10/25/50/100/200 model metres**, with fixed bearing, orientation and velocity. Both profiles share exactly the same source hash and gain. The single co-located diagnostic source deliberately separates distance response from the full car's engine/exhaust offsets. The validated empty analytic tile has no reflective surfaces: direct/reflected balance is explicitly direct-only. No city coverage or missing reflections are inferred.

Compared at the same distance, authored high/low energy ratio drops an extra **0.096 dB at 2 m**, **3.26 dB at 100 m** and **4.50 dB at 200 m** for genuine held Schafter material. RMS-relative adjacent-step detail at 200 m becomes 0.826 of the default. The independent known-transient probe also shows a 2.25 ms energy-centroid shift at 200 m. These demonstrate relative tonal/detail changes, not just a quieter high band; they do not certify the requested foggy impression or source recognition.

The two listening files are each **19.25 seconds**: distances start at 0/3.25/6.50/9.75/13.00/16.25 seconds. They retain full 1/r level differences and common gain. Diagnostic spectra alone compensate the known distance/master factor; listening files are never independently normalized. The far-window analysis aligns identical emitted material and excludes propagation truncation.

First-order 400 Hz/4 kHz crossover leakage makes the actual response gentler than nominal coefficients. There is no new steep low-pass or temporal-smearing engine. The physically causal delay remains distance/343 and stationary rate remains one. See [distance assumptions and measurements](research/STOCK_SOURCE_02_DISTANCE_PRESENTATION.md).

## Compact package and loudness

The page separates three questions:

1. **Clock fidelity:** rejected/corrected Schafter source, and rejected/corrected Bati source, before propagation with unchanged baseline shares and gain.
2. **Balance:** corrected Schafter engine-only, exhaust-only and combined close studies, with the authored shares/directivity identified.
3. **Presentation:** rejected, clock-only and final Schafter flybys on the exact same trajectory, plus the fixed-state default/authored distance pair.

Six original native Schafter references and matched-scale waveform, spectrum and sample-detail plots are included. Only seven new main WAVs and two distance sequences were generated; three rejected WAVs were copied exactly. Lectro/X80 received focused source verification, not another large listening matrix.

This is not a loudness contest. Schafter source whole LUFS changes **-12.7 to -12.3**; Bati **-11.9 to -12.0**. Rejected/clock-only/final Schafter flyby near-400 ms loudness is **-27.0/-27.6/-27.6 LUFS**. Strongest near-pass 50 ms RMS is **-25.65/-25.53/-25.30 dBFS**. Fifty-millisecond values are RMS, never invented LUFS. The corrected Schafter dry peak is 0.81092, close combined 0.22272 and final flyby 0.19470. No extra level calibration was applied to make the correction win; perceptual loudness is still unapproved.

## Focused validation and reproducibility

**33 focused JavaScript tests passed**, including new source fidelity, actual corrected-source propagation/Doppler, distance presentation, existing source integrity, pipeline and propagation tests. A corrected 100 Hz source through the actual renderer remains 100 Hz when stationary and receives only the independently predicted moving-source Doppler ratio. Original synthesis files, finite reflections, transmission, causal histories and PCM framing remain intact. No full CI, broad benchmark or 60-file regeneration was run.

The compact main/held-view runs contain **10,652 instrumented 512-frame blocks** at 48 kHz: **zero deadline misses**, maximum **5.404 ms** versus **10.667 ms**. No processing buffer or latency limit was enlarged. Loading and waveform-loop preparation are outside the block measurement; cold cache and in-game load were not controlled. All final cases preserve finite values, headroom, histories and zero limiter activity. Expected pre-start pose-history exclusions remain distinct from missing PCM faults. Distance diagnostics are not an additional performance campaign. See [audition evidence](../evidence/stock-source-02-audition.json) and [reproduced pitch regression](../evidence/stock-source-02-pitch-regression.json).

Use the existing validated assets in an unchanged adjacent STOCK-SOURCE-01 checkout, Node 24 and Python with the already available NumPy/SciPy/Matplotlib/imageio-ffmpeg dependencies. There is no archive extraction step. All destinations must remain under ignored `.local` storage and rendering destinations must be fresh:

```powershell
$old = (Resolve-Path ../RichAudio-StockSource01).Path
$manifest = Join-Path $old '.local/stock-source-01/assets-native/manifest.json'
node tools/Review-StockSource02Baseline.mjs $old .local/stock-source-02-repro/baseline
node tools/Verify-StockSource02.mjs $manifest .local/stock-source-02-repro/source-fidelity.json
node tools/Render-StockSource02.mjs $old .local/stock-source-02-repro/audition
node tools/Render-StockSource02Distance.mjs $manifest .local/stock-source-02-repro/distance
python tools/Analyze-StockSource02Distance.py .local/stock-source-02-repro/distance
python tools/Analyze-StockSource02.py .local/stock-source-02-repro/audition --old-root $old --evidence .local/stock-source-02-repro/audition-measurements.json
node --test tests/Test-StockFidelity.mjs tests/Test-StockFidelityPropagation.mjs tests/Test-StockGrain.mjs tests/Test-StockSource.mjs tests/Test-VehicleDistancePresentation.mjs tests/Test-VehiclePipeline.mjs tests/Test-VehiclePropagation.mjs
git diff --check
```

The main analyzer accepts `--dependencies` for an existing private Python dependency directory; use that environment/PYTHONPATH for the distance analyzer too. The private before/after 72-file inventory used for this run is preserved in `.local/stock-source-02/rejected-inventory.json`; absent inventories are labelled unavailable on a separate reproduction rather than fabricated. All public evidence contains numerical descriptors/hashes, never source recordings. No GTA launch, installation/archive write, deployment, endpoint, suppression, PR #73/#75 reconciliation or subjective listening occurred.

**Fixed:** demonstrated shortened-period pitch corruption, repeating neighbour/start modulation and discrete interval selection. **Implemented for comparison:** authored Schafter balance and independently controlled distance detail loss. **Still pending:** native granular/RPM/mix semantics, genuine loop/transient texture, native-reference recognition, the listener's distance impression and perceptual acceptance. The next decision is listening to this compact package, not automatic synthesis expansion.
