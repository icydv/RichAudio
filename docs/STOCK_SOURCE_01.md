# STOCK-SOURCE-01: four genuine vehicle sources

30 October 2026. Offline experiment on `feature/stock-source-01`, based on reference-03 commit `e0d77ba3bbb13f1dd8c98b82d9392d093be18811` and PR #74. PR #73 and PR #75 were inspected without merging or modifying them.

The private audition contains **all four vehicles**, 36 previews and 24 original decoded references. Open `.local/stock-source-01/audition-02/listen.html` in a browser. It provides one shared volume control, exclusive playback, optional position carry for environmental A/B, measurements and matched plots. Playback never starts automatically. Rockstar recordings, reconstructed WAVs, plots, HTML and detailed trajectories remain private and uncommitted.

The source foundation has changed from generated engine tones to separately verified game PCM. Two avoidable energy losses were corrected: an overly conservative common source allocation and a receiver-attenuated, cancellation-prone tunnel send. **This is an objectively checked audition, awaiting human listening; it is not a declaration of convincing sound or live GTA replacement.**

## Actual sources and decoding

| Vehicle | Verified granular container | Native mono sample rate | Authored maximum flyby speed |
|---|---|---:|---:|
| `bati` | `streamed_vehicles_granular/v_twin_2` | 48,000 Hz | 180 km/h |
| `lectro` | `dlc_mpheist/lectro` | 24,000 Hz | 162 km/h |
| `prototipo` | `dlc_exec1/prototipo` | 32,000 Hz | 216 km/h |
| `schafter3` | `dlc_apartment/schafter3` | 24,000 Hz | 187.2 km/h |

Each has its own six streams: engine/exhaust idle, acceleration and deceleration. The model declarations, matching dat151 Vehicle/Engine/Granular records, dat54 player granular graph, channel/container hashes, installed bank entries and source hashes are recorded in [provenance](../evidence/stock-source-01-provenance.json). `schafter3` was distinguished from the standard and armoured Schafter variants. Unknown graph fields do not establish an engine architecture or calibrated gain.

The fresh read-only trace parsed 54 REL and 43 vehicle metadata exports with zero parse errors. It inspected installed `dlclist`, DLC setup/content and update patch declarations, including the three selected DLC mount routes. All seven physical archives inspected for provenance retained their before/after hashes. Empty `audioNameHash` makes model-hash fallback an inference; the exact model-hash Vehicle records and their bank routes are verified. Native runtime mount selection and exhaustive collision resolution across every unrelated DLC were not observed.

Lectro has verified conventional engine/exhaust references and no populated ElectricEngine reference. Three additional AWC stream hashes remain unidentified. **A separate KERS sound/boost behaviour is unverified and omitted**, rather than invented or borrowed from another vehicle.

The supplied CodeWalker dev46 parser was used read only. All 24 selected streams are codec-0 mono Int16 PCM. Their raw data, decoded PCM and canonical WAV payloads match byte for byte. Conversion to Float32 is exactly reversible `Int16 / 32768`, with original sample rates and no normalization. Counts/rates, channel configuration, finite values, DC, crest, peak and wrap jumps were checked. All four decoding archives retained their hashes; no selected stream is missing. See [decode evidence](../evidence/stock-source-01-decode.json).

## Reconstruction and operating state

`StockVehicleSource` feeds the existing `VehicleAcousticPipeline`; it is a source player, not another spatial renderer. Genuine engine/exhaust waveforms stay separate through propagation. The source creates no oscillator, decorative roar, boom, exhaust pop or invented KERS layer.

Absolute native RPM, grain-clock, loop and gain semantics are still unknown. The explicit approximation is a normalized operating point plus load/lift. All eight exhaust acceleration/deceleration recordings support a chronological brightening/darkening progression: acceleration selects source time `u`, deceleration `1-u`. Engine layers use the paired bank progression where their own periodicity is ambiguous. Centroid and autocorrelation are never labelled crank RPM. [Source analysis](../evidence/stock-source-01-source-analysis.json) retains the supporting correlations and uncertainty.

Consecutive observed, ordered in-range `UnkUint1` offsets define candidate playback intervals, without claiming their native meaning. Their lengths span 17.08–152.79 ms; fixed 80 ms excerpts would discard high-state regions. Adaptive native-rate readheads use linear interpolation and complementary smoothstep overlaps of at most 20 ms, bounded by both intervals. Neighboring interval/start variation is deterministic. Idle uses soft whole-source wrapping. Mode/state smoothing is 40 ms and the running envelope is 25 ms. Outputs cannot overwrite each other or verified source memory.

Actual-source smoke measurements covered 3,181,022 output frames with zero interval overreads, two heads maximum and full endpoint selection for all 16 moving-layer atlases. Sample/mode overlap energy loss is approximately 0.72–1.13 dB in the final operating sequences. Boundary checks and fixture tests establish bounded interpolation and smooth weights; **native crank alignment, inaudible seams and absence of granular coloration remain unproven**.

The banks are measurably different. Across whole acceleration recordings, Bati engine has about 39% power above 2 kHz; Prototipo engine/exhaust concentrate about 58–59% in 500–2000 Hz; Lectro has the largest raw exhaust RMS (0.469); Schafter3 exhaust has about 86% below 500 Hz. Those are source measurements over 20 Hz to native Nyquist/capped 20 kHz, with differing native bandwidths. They are not SPL or proof of recognition. No extra bass was manufactured for the relatively midrange-focused Prototipo bank.

## Audition and physical processing

Each vehicle has nine previews: reconstructed dry, close operating study, flyby, street, wall-open, wall, tunnel early-only, tunnel previous-send and tunnel source-send. Six decoded source references accompany them.

The 9-second stationary sequence exposes idle/low load, progression to high state, lift and shutdown at 6.5 seconds, leaving decay time. The 10.3-second flyby integrates continuous velocity, approaches from roughly 180–239 m, includes an authored 200 ms state drop at 2.8–3.0 seconds, reaches the vehicle-specific maximum at 5.3 seconds, lifts after 6 seconds and recedes for five seconds. It does not claim a recovered drivetrain or measured gear/RPM law. Pitch from motion comes independently from retarded propagation; sample playback rate is not automated to fake Doppler.

All operating-study environmental cases have identical source/control/motion hashes and common gains. The street/tunnel use the existing authored finite planes with actual first/second-order paths. The wall pair has the same floor, listener `[4,6,1.4]`, vehicle pose and controls; only the existing finite barrier is added. Its centre is `[0,1.5,2]`, half-extents `[10,2]` and assumed transmission energy `[0.09,0.009,0.0009]`. The wall reduces whole RMS by 16.0–16.3 dB, 2–6 kHz energy by 20–23 dB and 6–20 kHz by 25–26 dB. No diffraction is implemented. **These are disclosed analytic fixtures, not extracted Los Santos geometry or city coverage.**

Inverse-distance spreading, existing emitter directivity, material energy-to-pressure conversion, atmospheric bands and the causal PCM histories remain in the same renderer. All final paths pass distance/343 and retarded-frame checks. Flybys retain both direct source histories through the final recession. Near-to-final-second RMS falls 27.0–33.8 dB; high/low energy ratio falls 4.9–13.0 dB. State changes, radiation and Doppler contribute alongside atmospheric loss, so this is not an isolated air-absorption measurement.

### Tunnel energy correction

The previous late send used received direct stereo, after distance attenuation, and averaged its channels. That attenuated room excitation with listener distance and could cancel opposed source content. The new optional method feeds the **same** eight-line FDN with orthogonal normalized engine/exhaust source-pressure vectors, after the common calibration and master once. It adds one exhaust predelay, preserving the existing feedback, damping, onset and wet 0.22 settings. It is used only in the fully authored stationary tunnel; outdoor cases get no FDN.

At identical source and output gains, isolated late RMS rises 11.47/12.37/13.42/16.92 dB for Bati/Lectro/Prototipo/Schafter3. Late versus early whole-event RMS is now -14.96/-14.77/-14.70/-10.28 dB, versus approximately -26 to -28 dB previously. Tail measurements after shutdown are included. The response is stable and no longer unnecessarily receiver-attenuated; this does not certify perceptual enclosure realism. Diffuse-field level, exact positional coupling and axial tunnel modes remain approximations without a measured impulse response. The legacy method remains byte-identical on its deterministic regression.

## Source calibration and level review

The complete chain is decoded PCM → real-state overlap → fixed engine/exhaust shares 0.5/0.5 → **common source factor 1.5956559507** → existing directivity, material, 1 m reference spreading and air filtering → master **0.7** → equal-power stereo. Native host gain is absent from the WAV path. No EQ, independent normalization, compression or limiter was used.

An actual-pipeline 1 kHz transfer probe at 1/4/16 m agreed with the independent spreading/master/pan prediction within 0.012 dB. No hidden large direct-path loss was found. The old live host factor 0.2 was not copied into these previews; PR #73's beacon-specific 10 m policy was not assigned to vehicles.

The first allocation, G=0.8154645116, unnecessarily reserved four identical perfectly aligned worst-case outputs. Its local flyby levels were reviewed and rejected as an adequate handoff. Fresh scouting of **32 actual source/scene cases** at G=0.25 selected the largest common allocation permitted by:

```text
G = min(2,
        0.9 / maximum unscaled dry peak,
        0.8 / (2 * maximum unscaled processed peak),
        0.8 / maximum unscaled declared four-distinct mix peak,
        0.98 / maximum unscaled individual-emitter peak)
```

The dry ceiling is binding. Each stem's actual fixed factor is now `0.5G = 0.7978279753`, still below its decoded amplitude. This removes avoidable source allocation loss while retaining bank-relative levels, ordinary master and physical spreading. All 32 cases were rendered afresh; all 24 cases shared with the first matrix increase **5.83068 dB**, with maximum residual from the predicted linear scaling below `5.8e-8`. [Before/after gain measurements](../evidence/stock-source-01-gain-comparison.json) and the private first audition preserve the rejected allocation.

| Vehicle | Close maximum 400 ms LUFS | Flyby near 400 ms LUFS | Near-to-final-second RMS drop |
|---|---:|---:|---:|
| Bati | -19.6 | -26.8 | 29.2 dB |
| Lectro | -17.9 | -27.1 | 27.0 dB |
| X80 Proto | -20.3 | -27.2 | 31.5 dB |
| Schafter V12 | -21.9 | -27.0 | 33.8 dB |

The report/page also give whole LUFS, 3-second and 50 ms levels, crest, true/sample peaks, absolute/relative band power, matched source/output windows and spectral evolution for every preview. Close sub-150 Hz relative shares change -2.95 to +1.89 dB; high-detail bands are retained. Retarded inter-emitter interference and stereo-energy conventions are accounted for when investigating source/output differences. The dry reconstruction duplicates `(engine+exhaust)/sqrt(2)` across stereo as an energy-equivalent reference; it is not an untouched bank file. Untouched mono references are separately available.

Final measured maxima: individual emitter **0.663526**, dry reconstruction **0.900000** (Float32 rounding within the 0.90001 check), processed single vehicle **0.391349**, two coherent copies **0.782698**, and **0.795225** across 50 declared four-distinct mixtures. The latter sum complete stereo files at five predeclared offset sets, across eight same-case and two mixed-case ensembles. Mixed environments are digital stresses, not one physical scene. Largest processed true peak is -8.1 dBFS.

**This is not unrestricted four-vehicle headroom.** Deliberately aligning distinct banks' extrema gives 1.24–1.34 in an out-of-policy stress; that limitation is retained. Unknown geometry, arbitrary concurrency and live gain require a separate mix-capacity policy. No universal target LUFS, one-metre SPL or chest-impact sensation was inferred from uncalibrated samples.

The final measurable criteria cover signal/history/headroom validity, common allocation without hidden gains, local loudness availability, retained source-overlap energy, body-band review and physically coherent recession. All 60 numerical gates pass (15 per vehicle). The declared review thresholds are -3 dB for selected-source overlap energy and -6 dB for relative close/dry 20–500 Hz body share, not perceptual loudness targets. Actual worst values are -1.13 dB and -0.92 dB respectively. Numeric criteria passing means no identified avoidable loss was left unaddressed under this calibration. It does not mean the listener will judge the result loud or convincing enough. See the private quality report and [sanitized quality evidence](../evidence/stock-source-01-quality.json) for per-vehicle gates and limits.

Against the rejected synthetic reference-03 flyby, the new X80 has near-400 ms loudness -27.2 versus -43.2 LUFS and strongest sliding-50 ms RMS -25.90 versus -42.61 dBFS. Its verified bank supplies actual mechanical/exhaust recordings and substantially stronger measured mid/high content. **That is not a controlled A/B:** source, motion, duration, emitters and gains differ, so the increase cannot be attributed to calibration alone. See [comparison evidence](../evidence/stock-source-01-synthetic-comparison.json). Perceptual superiority has not been established by listening.

## Focused validation and performance

- 52 relevant JavaScript tests passed: 23 stock source/grain/late-field/environment checks and 29 original synthesis/pipeline/propagation checks. Optional original V12/V8 synthesis remains intact. No full suite, full CI or benchmark matrix was requested or run locally.
- Nine codec-boundary checks passed under both Windows PowerShell 5.1 and PowerShell 7. Exact authentic decode/hash evidence is separate from generated fixture tests.
- All 32 final cases: zero nonfinite/clipped samples, zero limiter activity, renderer missing PCM history, history affected frames and cursor resets; one expected initial simulation reset per case. The simulation's **2,264 pre-history path exclusions** are retained separately: before source startup there is no earlier source geometry. They are not erased or relabelled as missing PCM. Both direct paths survive every flyby's final second.
- All 50 final mix peaks were independently recomputed from written WAVs and match exactly. Source-only tests reject aliases, fractional frame bounds and invalid state before mutation.
- Existing CPU backend, 48 kHz, 512-frame blocks and **10.6667 ms** deadline are unchanged. Instrumented complete-block maximum: scouting **7.6899 ms**, final **5.8321 ms**; **zero misses across 27,496 scouting and 27,496 final blocks**. Source and DSP timing distributions are preserved per case. Cache state was not controlled. Loading, decoding, plotting and file I/O are outside this block measurement. No GPU dispatch, live host, GTA-load or device-latency performance is claimed.
- The first historical matrix did not retain scouting timings; the fresh final run does. Fresh scouting entries retain actual timing/miss data, while per-scout diagnostic counters/hashes were asserted during rendering but not serialized. Final counters/hashes are retained. [Render evidence](../evidence/stock-source-01-render.json) preserves these distinctions.
- All 60 audio controls/64 media links resolve locally and page JavaScript parses. The X80 matched waveform/spectrum plot was inspected. No endpoint playback or human/subjective listening occurred.

## Reproduction

Use Node 24, PowerShell 7, Windows PowerShell 5.1 for the supplied .NET Framework CodeWalker dev46, and an existing Python environment with NumPy, SciPy, Matplotlib and imageio-ffmpeg. No CodeWalker binaries, game keys or third-party source are bundled. Set local paths yourself; never commit decoded output. All output arguments below must remain beneath the checkout's ignored `.local` directory, and decoder/render destinations must be fresh.

```powershell
# PowerShell 7, repository root. Explicit installed inputs, read only.
$game = Read-Host 'Installed GTA V Enhanced directory'
$cw = Read-Host 'Supplied CodeWalker dev46 directory'
pwsh -NoProfile -File tools/Trace-StockVehicles.ps1 -Refresh -GameRoot $game -CodeWalkerRoot $cw
```

In Windows PowerShell 5.1, set the same two input variables and run the trusted repository decoder as explicit commands (no execution-policy/security configuration change):

```powershell
$decoder = Join-Path (Get-Location) 'tools/Decode-StockVehicleAudio.ps1'
& ([ScriptBlock]::Create([IO.File]::ReadAllText($decoder))) -GameRoot $game -CodeWalkerRoot $cw -BankManifest 'tools/stock-source-01-banks.json' -OutputRoot (Join-Path (Get-Location) '.local/stock-source-01/assets-native')
```

Then in PowerShell 7:

```powershell
python tools/Analyze-StockSourceAssets.py .local/stock-source-01/assets-native/manifest.json
node tools/Render-StockSource01.mjs .local/stock-source-01/assets-native/manifest.json .local/stock-source-01/audition-new
python tools/Analyze-StockAudition.py .local/stock-source-01/audition-new --evidence .local/stock-source-01/reproduced-quality.json
node --test tests/Test-StockSource.mjs tests/Test-StockGrain.mjs tests/Test-StockLateSend.mjs tests/Test-VehicleEnvironment.mjs tests/Test-VehicleSynthesis.mjs tests/Test-VehiclePipeline.mjs tests/Test-VehiclePropagation.mjs
pwsh -NoProfile -File tools/Test-StockPcmDecode.ps1
git diff --check
```

Both Python tools accept `--dependencies` for an existing private dependency directory. The source analysis must run before rendering because it supplies the verified interval atlas. Fresh calibration is recomputed from the entire supported scene set; do not hardcode this run's gain for a different scene/source set. The inspector's unknown metadata semantics remain unknown after reproduction.

The next decision is comparative listening to these four private matrices, especially engine/exhaust identity, granular seams, pass weight and tunnel enclosure. If a source-control deficiency remains, recovering the native granular operating-state/loop semantics is more valuable than adding synthetic layers. Live replacement, KERS, unrestricted mixing and GTA environmental coverage remain separate work. No game installation writes, launch, deployment, interception or audio endpoint occurred.
