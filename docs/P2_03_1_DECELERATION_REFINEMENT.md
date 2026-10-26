# P2-03.1: deceleration isolation and balance experiment

Subsequent [P2-03.2 cycle/state research](P2_03_2_CYCLE_SYNCHRONISATION.md) found independent marker/periodicity evidence and clear listening improvement in a bounded interior state-matched excerpt. This does not overwrite the historical reference or promote the gain-only candidate below.

26 October 2026. Offline-only, stacked on open PR #14 at `bc69ef3ce56f2e363ecd870e8503d301d28dd7d4`; canonical main inspected at `e5fbd8f3502d3e28169a224caa07471e090e368f`. No PR was merged. Production telemetry/schema, RPM validation and game integration are unchanged.

## Decision

**PARTIAL — engine/exhaust combination implicated by listening; a modest balance experiment helped slightly but did not resolve the artefact.** The accepted 19.322479-second reference is preserved, fingerprinted and reproduced exactly. No corrected reference replaces it. No game/RPH launch, archive access, installation write, runtime hook, new dependency or acoustic propagation work occurred.

The user heard each isolated rendered stem over exactly the same global time interval and reported **no ghosting** in either. The unchanged combined clip brought the ghosting back **throughout deceleration**. This implicates their combination under the current estimated timing/gains. It does not establish a universal phase defect, a fixed correct delay, native engine/exhaust phase alignment or the native mixing law.

The only candidate reduced engine deceleration amplitude to **0.75 of baseline (−2.499 dB)**. The user reported **slight improvement**, then heard the full candidate: idle/acceleration remained fine, but deceleration still sounded reverberant, as if the tracks were going out of phase. This is not a confirmed correction or acceptance of a new default. No additional gain sweep, delay, phase inversion, time stretch, EQ, reverb or granular reconstruction was attempted.

## Preserved evidence and exact global timing

The existing six source-manifest inputs matched their SHA-256 values before rendering. All twelve decoded player/NPC WAVs were independently checked against the previous public metadata fingerprints afterward. All three accepted-reference WAVs and all three rejected-grain-demo WAVs remain unchanged. Sources and every experimental output reside in ignored `.local/audio-reconstruction`; new destinations are required and existing files are rejected.

Accepted mix SHA-256: `5F31B5CB6378A878F9B54E6531CE85F9A117B97A5915705B7A27EA35D794D77A`. It remains **48 kHz mono PCM16, 927,479 frames**. Baseline repeat rendering after the optional parameter change reproduces engine, exhaust and mix byte-for-byte. This milestone reads the already decoded private WAVs, not the installed archives; no new archive-integrity claim is made.

All ranges below are **zero-based frames, end-exclusive**, at 48,000 frames/second. No component is shifted to its first nonzero sample.

| Event/range | Global frames | Meaning |
|---|---:|---|
| Acceleration starts | 90,240 | 120 ms idle/acceleration overlap |
| Deceleration starts | 412,731 | Acceleration/deceleration overlap starts |
| Acceleration finishes | 418,491 | Interior deceleration begins |
| Exhaust deceleration ends | 786,911 | 374,180 original source frames; estimated final 25 ms fade |
| Idle return starts | 831,479 | Engine deceleration/idle overlap starts |
| Engine deceleration ends | 837,239 | 424,508 original source frames |
| Full reference ends | 927,479 | 19.322479 seconds |
| Shared A/B/C listening clip | **[398,331, 850,679)** | 452,348 frames, **9.423917 s**; 300 ms before deceleration and 400 ms into idle return |
| Interior diagnostic region | **[418,491, 785,711)** | Excludes stage overlaps and exhaust's terminal fade; 367,220 frames / 7.650417 s |

Engine/exhaust/mix clips are slices of the stored PCM16 stems/mix, preserving the actual accepted quantisation and gains. The separately quantised components sum to the stored mix within **one PCM16 LSB (1/32768)**. This rounding residual is not evidence of an additional voice or phase processing. Full-reference and raw-source copies are byte-preserving.

## Listening sequence and private files

Reproduction creates these files in a new private output directory:

| File | Content and level convention | Listening finding |
|---|---|---|
| `A_engine_decel.wav` | Engine stem, common clip range, accepted gain | No ghosting reported |
| `B_exhaust_decel.wav` | Exhaust stem, same range/gain convention | No ghosting reported |
| `C_mix_decel.wav` | Accepted combined mix over the same range | Ghosting returned through deceleration |
| `D_raw_engine_decel.wav` / `D_raw_exhaust_decel.wav` | Unmodified source WAV bytes; own original extents, **not independently aligned** | Prepared, not separately auditioned in this session |
| `D_listen_engine_decel.wav` / `D_listen_exhaust_decel.wav` | Raw recordings at corresponding scalar component attenuation; no fade/normalisation/EQ | Prepared for lower-level source comparison, not separately auditioned |
| `E_full_reference.wav` | Exact copy of accepted mix | Previously accepted with deceleration limitation; preserved |

The candidate has its own full engine/exhaust/mix files and separately isolated clip pack. It never overwrites A–E. Candidate clip and full candidate were heard locally by the user. Playback used the existing original local helper; successful device playback is recorded separately from listening judgments. No audio/cloud service was used. Raw D files retain the originals' higher level; do not confuse them with attenuated D_listen comparisons.

## Focused numerical diagnosis

Original diagnostic code uses 200 ms windows at the actual 48 kHz rate, with a 4,096-point Hann FFT at each window start. Thirty-eight windows sample the interior region; the final fragment shorter than the FFT is omitted. Band values compare complex summed energy with the independent component-power sum in the **same window**. Negative dB indicates destructive interference in that measurement, not a faulty codec or a known native mixing error. This is not a long-term coherence estimate or loudness-normalised comparison.

| Interior diagnostic | Baseline | Candidate |
|---|---:|---:|
| Zero-lag correlation range | −0.209874 to +0.055089 | −0.209874 to +0.055087 |
| 20–250 Hz combined/independent energy range | **−4.606 to +1.754 dB** | **−3.396 to +1.572 dB** |
| 250–1,000 Hz energy range | −2.010 to +1.478 dB | −1.985 to +1.505 dB |
| 1–4 kHz energy range | −0.384 to +0.323 dB | −0.499 to +0.403 dB |
| Mix RMS | 0.070463 | 0.064677 |
| Mix clipped / nonfinite samples | 0 / 0 | 0 / 0 |

The candidate reduces the worst sampled low-band cancellation but does not improve every band. Correlation is essentially unchanged under scalar gain, as expected. The interior mix RMS falls by approximately 0.74 dB: a balance tradeoff, not proof that phase is corrected. No post-normalisation conceals that difference.

Bounded correlation diagnostics examined ±2 ms, at four-frame lag spacing and eight-frame accumulation stride. Example strongest absolute-correlation lags move from **−56** frames at global frame 418,491 to **+32** at 552,891, **+24** at 620,091 and **−96** at 754,491, with low/moderate correlations. These are search-bound/periodic-signal-dependent indicators, **not timing prescriptions**. No lag was applied. Changing spectral interference and listening support an interaction hypothesis but do not identify a constant delay that could safely correct the whole recording.

### Hypothesis assessment

| Hypothesis | Evidence and remaining limit |
|---|---|
| Original recorded content | Neither isolated rendered stem reproduced the ghosting for this listener. Raw copies are preserved; direct raw listening remains available. No claim that the recordings are defective. |
| Engine/exhaust interaction | **Implicated by paired listening**: clean separately, ghosted in combination. Interior frequency-dependent cancellation is measured. A specific physical phase/native scheduling cause remains unproven. |
| Stage crossfade | The effect was reported throughout deceleration, and interior interaction exists outside crossfades. Crossfades are not established as its sole cause; none was redesigned. |
| Duration mismatch | Exhaust ends **50,328 frames / 1.0485 s** earlier. This changes the tail balance, but cannot alone account for an effect heard before that ending. Existing fade/silent tail is retained; no invented continuation. |
| Idle return/repetition | Slight idle repetition was previously reported; current ghosting extends beyond the return-to-idle overlap. Idle loop remains estimated and unchanged. |
| Metadata/synchronisation | Existing graph identifies separate engine/exhaust deceleration channels, not a verified shared waveform phase contract. Player engine/exhaust have **174/155 grains** and six loop groups each; `LoopPoint=-1` does not establish native loops or a component offset. |

The old private grain fields remain `Unk*`. Under the **unverified candidate sample-marker interpretation**, interpolated `UnkFloat1` at 3 seconds differs (~24.002 engine vs ~21.872 exhaust), and the trajectories differ elsewhere. Different sweeps/native scheduling are a plausible follow-up, not established physical RPM, source clock semantics or permission to warp either source. First marker positions likewise do not prove a correct fixed delay. No new extraction or game-memory investigation occurred.

## Narrow engineering change and quality comparison

`renderReference` accepts optional **`decelEngineScale`**, default **1**, bounded **0.5–1**. Only the engine deceleration segment receives this scalar; current stage fades apply it naturally. Default output remains identical. Exhaust is byte-identical for the candidate, and all PCM outside the deceleration contribution's support remains unchanged. The rejected 80 ms grain renderer is unchanged.

`examples/decel-gain-candidate.json` changes only that balance control to **0.75**. The existing global master, other gains, all scheduling, source indices, duration, sample rate and transitions remain unchanged. It is explicitly a diagnostic candidate, not recommended native calibration or an automatically preferred replacement.

| Full mix | Accepted baseline | Candidate |
|---|---:|---:|
| Frames / duration | 927,479 / 19.322479 s | Same |
| Peak | 0.277985 (~−11.12 dBFS) | 0.239990 (~−12.40 dBFS) |
| RMS | 0.062411 (~−24.09 dBFS) | 0.059800 (~−24.47 dBFS) |
| Clipped / nonfinite / silent 20 ms windows | 0 / 0 / 0 | 0 / 0 / 0 |
| Max adjacent step | 0.136902 | 0.119598 |
| Listening | Natural overall; combined deceleration ghosting | Slightly improved; deceleration still reverberant/out-of-phase; idle/acceleration fine |

Candidate mix SHA-256: `0F587C86DCD78A697A739C0F9DF34E14F8DB031AB51D0D0F5315B91D6450C857`. Initial candidate render took 93.269 ms; baseline repeat took 90.833 ms. These are local file-render measurements, not real-time budgets. Reproduced candidate outputs and the unchanged exhaust hash are recorded in the [sanitised evidence](../evidence/publication/deceleration-refinement.json).

## Reproduction, tests and publication

From the checkout, using the private P2-03 extraction and accepted reference already present:

```powershell
node tools/Inspect-Deceleration.mjs .local/audio-reconstruction/decoded-final/source-manifest.json examples/stock-reference-sequence.json .local/audio-reconstruction/reference-01 .local/audio-reconstruction/NEW-isolation
node tools/Render-StockAudio.mjs .local/audio-reconstruction/decoded-final/source-manifest.json examples/decel-gain-candidate.json .local/audio-reconstruction/NEW-candidate
node tools/Inspect-Deceleration.mjs .local/audio-reconstruction/decoded-final/source-manifest.json examples/decel-gain-candidate.json .local/audio-reconstruction/NEW-candidate .local/audio-reconstruction/NEW-candidate-isolation
# Explicit local playback, never invoked by CI:
.\build\audio\PlayPrivatePreview.exe .local\audio-reconstruction\NEW-isolation\A_engine_decel.wav
```

`Inspect-Deceleration.mjs` verifies source fingerprints and full baseline reproduction before writing, bounds input/allocation sizes, preserves common sample indices, copies raw recordings verbatim, meters all clips and rejects existing/unprotected/linked/escaping paths. `tools/audio/decel-analysis.mjs` is original bounded diagnostic mathematics with no output, mutation, alignment or audio-device API. No new package is required. Invalid/too-short diagnostic regions fail explicitly.

Eight new original-fixture tests cover slicing/alignment/immutability, exact timeline/tail ranges, FFT correctness, constructive/cancelling pair controls, optional gain scope/default compatibility, deterministic private pack output, missing/changed fingerprints and path/reparse/no-overwrite protection. They join the existing offline entry point; no stock recordings, proprietary parser or listening device is needed in CI.

The final local suite passed: **8 deceleration tests, 19 stock-audio tests, 8 extraction/publication guards, 15 ownership tests, 65 core assertions, 35 drivetrain assertions, 17 metadata-parser tests, 3 diagnostic-analyser tests, 122 Phase 1 checks, 9 configuration assertions and 8 append expectations**. Helpers and the existing framework-independent core/analyser/tests rebuilt; no game adapter was deployed. Numerical checks do not certify sound quality. Hosted CI is reported separately from these local results.

Public content contains original code/tests, scalar/reference metadata and findings only. Stock sources, clips, raw copies, private manifests and device logs stay ignored locally. No project licence is selected. Public source availability does not grant rights to redistribute stock recordings or third-party binaries.

## Next decision

The combined-playback problem is **isolated to the interaction at this listening checkpoint**, but its exact scheduling/phase mechanism and a satisfactory correction remain unresolved. Retain the accepted reference; retain the candidate as a slight-improvement experiment. The next smallest step is to establish whether corresponding engine/exhaust cycle/state markers denote a shared excitation trajectory, using bounded offline metadata/waveform checks before any time mapping. That missing synchronisation contract is a prerequisite for credible RPM/load-responsive blending, not a reason to guess a delay, stretch a whole track or return to the rejected grain method. Do not automatically start that follow-up. Live RPM, native ownership, real-time GTA rendering and Phase 3 remain separate blocked gates.
