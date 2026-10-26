# P2-03: stock Bati decoding and offline source playback

Subsequent [P2-03.1 isolation](P2_03_1_DECELERATION_REFINEMENT.md) implicated engine/exhaust combination through local listening. A modest balance candidate helped slightly but did not eliminate the ghosting. The accepted reference below remains unchanged and reproducible; no phase/timing correction is established.

25 October 2026. Offline-only, stacked on open PR #13 / `d7c961a22ccbfc75d0b1cbf74079b307a49fbcc2`; main inspected at `e5fbd8f3502d3e28169a224caa07471e090e368f`. PRs #10–#13 remained open and unmerged. No telemetry/schema/RPM-validator/in-game integration change.

## Executive result

**YES: twelve genuine installed GTA audio streams were decoded and numerically validated. Private stock-based demonstrations and separate engine/exhaust stems were produced and heard locally by the user.** The first, 27-second estimated-grain demo failed listening: acceleration/deceleration sounded robotic/fax-like; idle was acceptable but slightly repetitive. A revised **19.322-second continuous-recording reference** was described as “near perfect”, with remaining deceleration phasing/ghosting. This is one informal listening observation, not controlled quality certification. No audio was sent to an AI/cloud service.

**Outcome B — successful decoding, incomplete native engine reconstruction.** The recordings are authentic. The rejected grain prototype used approximate scheduling, synthetic ratio/throttle, source-position mapping, resampling and windows. The revised reference plays moving recordings continuously at original speed, with authored fades/gains and repeated idle. It has no calibrated RPM/load response, stationary rev or sustained-high synthesis. Neither is Rockstar's complete granular synthesizer. Bati's blank-profile fallback and actual runtime mount/profile selection remain inferred from the existing trace, not newly observed. More precisely, the demonstration uses the **Bati-traced `v_twin_2` stock family** in the installed Enhanced archives.

GTA/RPH were never launched. No game configuration, archives, executables, native audio state, dependencies or security settings changed. Native source suppression, ownership, crash recovery, live RPM and full P2-01 acceptance remain unresolved. No propagation renderer or live Phase 3 integration was built.

## Extraction and fidelity

Reused [prior graph evidence](../evidence/vehicle-trace.json), [format observations](../evidence/bati-awc-summary.json), the existing inspector's trusted byte-load method and the already installed **CodeWalker dev46** parser. `CodeWalker.Core.dll` still matches SHA-256 **`3D2BB91B35CF0D1888C12772A9AF25441ADEA3CCC8510A149FCF0D47C8E71CA8`**. No new parser binary was downloaded, installed, modified or redistributed. Upstream source **485d56bec00262ed7fa472261cce7bbc6202b96e** explains the file-format paths; it is not asserted to reproduce the supplied binary.

The original narrow `ExtractBati.cs` bridge calls only the pinned parser's key loader, archive scan/extract and AWC raw/PCM/WAV functions. It never calls archive/asset/key Save methods. Key material is neither exported nor logged. Input root/tool paths are rejected as output destinations, reparse ancestors and existing output are rejected, output must be private `.local` storage, and compressed/expanded/container/stream sizes are bounded. Scope is exactly two pinned physical archives and two named AWC entries, not a recursive whole-game export.

| Original archive | Bytes | Before and after SHA-256 |
|---|---:|---|
| `x64/audio/sfx/STREAMED_VEHICLES_GRANULAR.rpf` | 207,796,224 | `F31CC031E06D1CFE5E863E8307857AB3C59B0736739E824277368EBEE5DF7EEF` |
| `x64/audio/sfx/STREAMED_VEHICLES_GRANULAR_NPC.rpf` | 42,283,008 | `9EE025DAA5839720AB24914BCB79BBD2DB17E6FD26DF963B82FC90E43E7EF3E7` |

The extracted containers are 3,270,560 and 656,638 bytes, respectively. Every decoded stream is **codec 0, mono, 48,000 Hz, signed 16-bit little-endian PCM**. Original PCM bytes equal `sampleCount * 2` exactly. The parser's raw bytes, PCM result and WAV data payload were compared byte-for-byte: **all twelve equal**, with no hidden normalization, padding or truncation. Repeat extraction produced identical WAV hashes. No source gain, headroom field, byte order or sample was changed in these archival private WAVs.

An independent final comparison also matched the saved **32 original non-archive root files** by name, size and SHA-256, and the root directory set. The two input archive hashes matched the historical pins and their pre-extraction values. This verifies the scoped inputs/root baseline, not an unperformed full-installation byte audit.

Two initial bridge issues were resolved before successful extraction: file-based loading hit the existing download-zone/.NET restriction, so the existing inspector's byte-load technique was reused without unblocking files or changing policy; an uncompressed RPF entry stores zero in compressed `FileSize`, so the correct `GetFileSize` plus expanded-size bounds replaced the incorrect zero-size rejection. Private failed-run journals were retained; the opened archive's before/after hashes still matched. These were offline wrapper issues, not game/runtime failures or evidence of damaged audio.

## Actual decoded source measurements

All twelve are nonzero and finite, with **zero clipped samples**. Common peak is **0.794281 full scale (~−2 dBFS)**. Durations are derived from exact frame counts; encoded stream bytes equal PCM frames ×2, independent of the 44-byte WAV header. Detailed private manifests retain identifiers, format/grain/loop data and individual hashes; public [sanitised findings](../evidence/publication/stock-audio-reconstruction.json) contain only references, counts, hashes and aggregate measurements.

| Family / source | Frames | Encoded bytes | Seconds | RMS | DC offset | Adjacent steps >0.5 |
|---|---:|---:|---:|---:|---:|---:|
| Player engine_idle | 40,350 | 80,700 | 0.840625 | 0.210142 | 0.005798 | 3 |
| Player engine_accel | 328,251 | 656,502 | 6.838563 | 0.209583 | −0.001274 | 13 |
| Player engine_decel | 424,508 | 849,016 | 8.843917 | 0.205533 | −0.000662 | 80 |
| Player exhaust_idle | 40,350 | 80,700 | 0.840625 | 0.380947 | 0.027799 | 0 |
| Player exhaust_accel | 328,251 | 656,502 | 6.838563 | 0.307550 | −0.011371 | 0 |
| Player exhaust_decel | 374,180 | 748,360 | 7.795417 | 0.377691 | −0.003709 | 0 |
| Player unresolved_1B393DEA | 40,320 | 80,640 | 0.840000 | 0.108270 | 0.000179 | 0 |
| Player unresolved_1D64B840 | 53,760 | 107,520 | 1.120000 | 0.173522 | 0.000240 | 0 |
| NPC engine_idle | 40,350 | 80,700 | 0.840625 | 0.210142 | 0.005798 | 3 |
| NPC engine_accel | 123,810 | 247,620 | 2.579375 | 0.216934 | −0.002309 | 7 |
| NPC exhaust_idle | 40,350 | 80,700 | 0.840625 | 0.380947 | 0.027799 | 0 |
| NPC exhaust_accel | 122,455 | 244,910 | 2.551146 | 0.304252 | −0.011537 | 0 |

Step counts are descriptive flags, not proof of corruption or audible clicks; some large steps already exist in the untouched source. DC is measured, not silently removed. The two unnamed player streams decode successfully but are excluded from the demonstration because their roles are unknown. NPC streams are validated but not substituted for missing player components. No ignition, turbo, transmission or backfire recording was fabricated.

## What the grain/graph evidence establishes

| Classification | Finding |
|---|---|
| **Observed** | Player idle streams have 9 grain records; accel has 155 each, exhaust decel 155, engine decel 174. Accel has 5 loop groups, decel 6, idle none. Player/NPC accel lengths/grain counts differ. Existing REL paths distinguish engine/exhaust and accel/decel/idle with NPC parent/inheritance references. |
| **Observed** | Format fields include `LoopPoint=-1` and zero loop begin/end in the sampled player formats. These do not establish whole-file seamless loops. Grain fields still have `Unk*` names. Headroom/peak and granular-clock/submix fields exist; their native units/evaluation are not adopted by the prototype. |
| **Derived** | Candidate integer markers are ordered and within sample extents. Mean `UnkFloat1 * next-marker-spacing` is approximately 47.7–48.3 thousand across the named layers, close to sample rate. This supports investigating period/frequency semantics but does not prove physical RPM, a native scheduling law or a particular engine order. |
| **Estimated** | The integer markers are treated as candidate sample anchors, not certified phase boundaries. Synthetic ratio selects a record position: increasing through accel material and reversed through decel material. A bounded local time-resampling factor, Hann grain overlap and idle wrap crossfade make a controllable demonstration. |
| **Unknown** | Exact native grain clocks/loop group selection, RNG, phase matching, source-to-RPM calibration, throttle/load curves, engine/exhaust alignment, submix gains/units, limiter/shift/start/stop behaviour, runtime LOD selection and physical radiator/directivity mapping. |

The short idle files are therefore not declared complete native loops. Acceleration/deceleration recordings are not simply played wholesale as one engine loop or treated as calibrated RPM sweeps. Their original material and the estimated renderer behaviour remain separate facts. This work does not reinterpret the invalid live RPH RPM getter.

## Implemented offline playback slice

- `src/offline-audio/stock-source.mjs`: bounded PCM16 RIFF parsing/encoding, mono/stereo conversion checks, numerical metering, windowed-sinc resampling and six-layer offline rendering. A 24-tap, 128-phase filter contracts cutoff when reading faster; cached tables are bounded. Unsupported formats are rejected rather than guessed.
- `tools/audio/ExtractBati.cs`, `Build-OfflineAudio.ps1`, `Extract-BatiAudio.ps1`: original bridge/build/private extraction wrapper; existing CodeWalker is a local dependency only.
- `Prepare-BatiSources.mjs`: validates twelve WAVs against private extraction metadata/fingerprints and prepares exactly six player component/state sources. Detailed original metadata stays private.
- `Render-StockAudio.mjs`: consumes a hashed source manifest and the original synthetic timeline, produces aligned engine/exhaust/mix PCM files plus numerical diagnostics. New output is restricted to this checkout's ignored `.local/audio-reconstruction`; inputs are not overwritten. It rejects silent/clipped demonstrations, unsafe paths, changed fingerprints and duplicate source schedules.
- `tools/audio/PlayPrivatePreview.cs`: an explicitly invoked local-only WAV player, bounded to a private file and <=30 seconds. It is not called by CI or the renderer. No audio is uploaded.
- `examples/offline-engine-timeline.json`: wholly original synthetic ratio/throttle controls: idle 0–4 s, stationary revs 4–7, acceleration 7–14, higher state 14–18, deceleration 18–23, idle return 23–27. No live vehicle state or calibrated crankshaft RPM.

Estimated synthesis uses 80 ms Hann windows at 40 ms hops with checked unity overlap coverage. Idle wraps through an estimated 25 ms crossfade. Moving layers use 0.9–1.1 time resampling: this changes pitch **and time**, not independent pitch shifting or a faithful native granular scheduler. Anchors are bounded away from record edges to avoid wrapping high-speed material into low-speed material. Engine and exhaust have independent gains and PCM buffers; the main mix is mono, with no duplicated stereo channel or 3D/spatial claim.

Authored gain is attenuation only (master 0.2, engine 1, exhaust 0.75, additional idle/throttle shaping). No EQ, bass boost, compression, loudness normalization or native headroom conversion is applied. A 25 ms file fade avoids abrupt starts/stops. Numerical headroom cannot guarantee physical listening SPL at arbitrary hardware volume. The master is bounded to 0.25 and invalid/nonfinite/excessive samples fail rather than being hidden by a limiter.

## Demonstration and measured limitations

Three aligned outputs: **48 kHz / PCM16 / mono / 1,296,000 frames / 27 seconds each**. Repeated renders, including the final end-to-end tool run, have identical output hashes on the recorded Node/Windows configuration. This is local determinism, not an untested cross-platform bit-identity guarantee.

| Output | Peak | RMS | DC | Max adjacent step | Clipped / nonfinite / silent 20 ms windows |
|---|---:|---:|---:|---:|---|
| Engine | 0.147675 | 0.030141 | 0.000127 | 0.109283 | 0 / 0 / 0 |
| Exhaust | 0.108032 | 0.030733 | −0.000430 | 0.014771 | 0 / 0 / 0 |
| Mix | 0.223694 (~−13.0 dBFS) | 0.044134 (~−27.1 dBFS) | −0.000303 | 0.117065 | 0 / 0 / 0 |

Final mix SHA-256: **`190B66FEC2246AA76B182CB5A3C0D3884DE284A538C422BAA68065E879C9E6EE`**. Engine/exhaust hashes and measurements are in the public aggregate, not their PCM content.

Actual 27-second render runs took **888.493, 879.925 and 891.964 ms** wall time. CPU and process RSS are recorded separately; these are offline measurements, not game/audio-callback budgets or a claim of real-time readiness. Decode preparation, analysis, file IO and device playback are outside that render timer. The local tool/fixture builds succeeded using the existing x64 .NET Framework compiler, with warnings as errors; Node needs no third-party runtime package.

A private spectrogram and optional NumPy/Pillow FFT analysis were generated locally. Spectral centroid changed from about **464 Hz** in idle to **1,706 Hz** in the sustained higher state, then **462 Hz** on return. Output energy above 18 kHz was roughly 0.006–0.086% per labelled segment. These are descriptive spectra, **not** measurements of crankshaft RPM or proof of zero aliasing. A synthetic downsampling test separately checks at least 20 dB rejection of a known alias. The mix's 20–200 Hz energy is source-dependent; no artificial LF boost was added. Engine/exhaust whole-file correlation was ~0.051, which does not establish native phase coherence or exclude narrowband cancellation.

Local playback of the 27-second mix completed twice. The user **rejected acceleration/deceleration** as robotic/fax-like and identified slight idle repetition. Numerical validity, spectral movement and deterministic output therefore **did not establish acceptable sound quality**. The failed experiment remains reproducible under `examples/offline-engine-timeline.json`, explicitly marked failed; it is not the recommended demonstration. The precise audible mechanism is not isolated, so grain/phase scheduling is a suspect, not a proven root cause.

### Revised continuous-recording listening baseline

`examples/stock-reference-sequence.json` selects `renderReference`: two seconds of idle, one uninterrupted acceleration recording, one uninterrupted deceleration recording, then two seconds of idle. Moving layers are read at their original sample rate with **no grain replay, pitch shift or time change**. Authored 120 ms stage crossfades, 25 ms file fades, repeated idle and engine/exhaust start alignment remain estimates. This intentionally shorter, limited demonstration omits stationary revving and sustained-high synthesis rather than fabricating them.

Outputs are **48 kHz PCM16 mono, 927,479 frames, 19.322479 seconds** per stem/mix. Mix SHA-256 is `5F31B5CB6378A878F9B54E6531CE85F9A117B97A5915705B7A27EA35D794D77A`; peak 0.277985 (~−11.12 dBFS), RMS 0.062411 (~−24.09 dBFS), DC 0.0001074, maximum adjacent step 0.136902, **zero clipped/nonfinite samples and zero silent 20 ms mix windows**. Initial render took **88.707 ms**; separate measurements and repeat hashes are recorded in the public aggregate. These are offline figures only.

The exhaust deceleration source is about 1.05 seconds shorter than engine deceleration. It fades out at its actual end; **46 silent exhaust-stem windows are intentional**, not a decode failure. No guessed tail is looped, stretched or supplied from another vehicle. The engine continues, then the next idle stage begins. Engine/exhaust native phase and event alignment are still unknown.

The user heard this revised local preview and described it as near perfect, while noticing **deceleration phasing/ghosting**. That observation supports usable source playback but leaves transition/phase quality unresolved. It is not proof that the components are incorrectly decoded, that a particular phase offset is responsible, or that a complete engine renderer is achieved. No arbitrary phase shift, bass enhancement or speculative correction was applied. The recordings and output remain private.

## Reproduce privately from your installed copy

Existing local prerequisites: Windows x64 .NET Framework compiler, Node, the fingerprinted user-installed CodeWalker dev46 parser and the two exact installed archive versions above. No GTA/RPH process is needed. No third-party binary is included in the repository. Commands below use user-supplied local roots, never credentials or an automatic game-root search/deployment.

```powershell
# From the RichAudio checkout; set these to your own existing local folders.
$gameRoot = 'D:\path\to\Grand Theft Auto V Enhanced'
$codeWalkerRoot = 'D:\path\to\CodeWalker30_dev46'
.\tools\Extract-BatiAudio.ps1 -GameRoot $gameRoot -CodeWalkerRoot $codeWalkerRoot
# Use the new private extraction folder printed by that command:
node tools/Render-StockAudio.mjs .local/audio-reconstruction/decoded-ID/source-manifest.json examples/stock-reference-sequence.json .local/audio-reconstruction/demo-ID
# Explicit local playback only when desired; never run by CI:
.\build\audio\PlayPrivatePreview.exe .local\audio-reconstruction\demo-ID\demo_mix.wav
```

Existing destinations, parser/version mismatches and archive hash changes stop extraction. The tool does not silently accommodate a new build/parser. Failed runs stay in their own private directories for diagnosis. No full archive is copied. Re-extraction/rendering uses a new directory; stock-based previews/stems/manifests and spectrograms must remain private. The source manifest contains hashes, component/state, format/length and explicitly estimated markers; it carries no live RPH object or core telemetry-schema change.

## Tests, publication and next gate

Nineteen new original synthetic tests cover PCM conversion/endian order, rate conversion/alias rejection, mono/stereo handling, loop-wrap smoothing, transition coverage, determinism, malformed/unsupported WAVs, nonfinite/amplitude/empty inputs, missing streams, invalid ratio/throttle/time, render failure, source separation/alignment, duplicate scheduling, marker bounds and private CLI fingerprint/path/no-overwrite guards. Reference-specific tests verify unchanged moving samples outside fades, original-speed scheduling, component endings without repetition, duration/rate/gain bounds and aligned deterministic outputs. Eight extra extraction/publication guard checks run only against original fake inputs and never load a parser or open an audio endpoint. All generated fixture WAVs are authored sine/ramp data and remain ignored.

The complete local offline suite **passed again after the reference revision**: **19 stock-audio tests, 8 extraction/publication guards, 15 ownership tests, 65 core assertions, 35 drivetrain assertions, 17 metadata-parser tests, 3 diagnostic-analyser tests, 122 Phase 1 checks, 9 configuration assertions and 8 append expectations**. Both original helper executables compiled with warnings treated as errors. The same offline entry point is used by CI; no proprietary asset or playback device is required there. CI results remain separate from these local results.

Staging is allowlisted; `.local/` excludes nested outputs regardless of extension, and publication screening checks content/private paths/restricted assets as well as filenames. No Rockstar audio/AWC/REL/key data, CodeWalker binary/source, private paths or recordings are committed. The project licence remains unselected; public source availability or a local tool licence does not grant redistribution of Rockstar material. Users must review applicable local-use/tool/content terms; no blanket redistribution permission is asserted.

The staged-content audit had zero findings; JSON validation and 45 local documentation links passed. All reachable history screening retained only four existing GitHub service-committer identity review flags, manually checked; no new credential, private-path or restricted-asset finding was introduced. Git integrity passed, with one already known unreachable tree reported. Screening is a bounded review, not a proof of all possible redistribution rights or absence of every secret.

The single most useful follow-up is an **offline deceleration isolation A/B listening experiment**: compare engine alone, exhaust alone and their combination at matched conservative levels, first away from transition fades, then across transitions. This can separate an intrinsic source feature from layering or handoff artefacts before attempting any phase/grain correction. Further unknown marker/frequency work remains research, not a native synthesis claim. The next experiment requires **no running GTA** and is not automatically executed here.

Future Source Sound System integration can consume versioned family/component identity, source format/rights/provenance, declared loop/transition confidence, buffered PCM and explicit engine-state availability. Engine/exhaust stay separate for future radiator positions. That integration still needs bounded streaming, sample-clock scheduling, source generations/termination and compatible ownership. **Live RPM, engine-only suppression, per-vehicle audio ownership, automatic handoff, crash-safe restoration, real-time GTA audio and full propagation remain blocked/unverified.** Offline decoding success clears none of the P2-02 ownership or live Phase 3 gates.
