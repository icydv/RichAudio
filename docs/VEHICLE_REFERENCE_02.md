# VEHICLE-REFERENCE-02: focused V12 reference review

Base: PR #74, `eef0cbc2e96e09754d87b375975eb1053422121e`. This increment adds analysis only. Synthesis, profiles, propagation, gains and existing audition files are unchanged. No GTA, deployment, audio endpoint, subjective listening, full audition matrix or full CI run was used.

## Evidence and scope

Read the supplied reference notes and inspected the three zoom spectrograms. Directly decoded only the first 18 seconds of the available original `6966.mp4`; `6967`/`6968` originals were not found in Downloads, so their evidence is limited to the supplied notes/images. Recommendations embedded in those notes were treated as source material; their suggestion to reconcile other branches was outside this request and was not followed.

Reused seven existing, SHA-256-bound PR #74 WAVs without regeneration. Analysis uses arithmetic mono downmix, 44.1 kHz, fourth-order zero-phase band filters and Welch peaks. Tunnel difference additionally uses the exact 48 kHz stereo PCM because diffuse energy can cancel on mono downmix. Reference and generated windows have different trajectories, operating states, recording gain and microphone processing. Digital levels are not SPL, and the intervals do not identify reference RPM or isolate Doppler from engine-state changes.

Measured data: [vehicle-reference-02.json](../evidence/vehicle-reference-02.json). Reproducer: [Compare-VehicleReference02.py](../tools/Compare-VehicleReference02.py), accepting the existing audition directory, original video, private output directory and optional existing Python dependency directory. No media or generated audio is committed.

## What already works

- Multiple firing-related harmonic families and separate mechanical/exhaust/intake layers exist. The acceleration audition already raises engine orders; shifts retain oscillator phase.
- The direct flyby shows a coherent pitch knee through the actual causal renderer, rather than a separately applied flyby effect. Focused tests confirm Doppler, recession and frequency-dependent distance loss.
- Low-frequency body is already substantial: the existing dry pass has 32.5% of its measured 20 Hz–20 kHz power below 150 Hz. This does not support adding blanket bass or gain.
- The current direct pass gains 29.58 dB from the selected approach window to the near window, then loses 24.94 dB into the selected recession window. These within-file differences preserve large dynamics without compression.
- Street reflections and a decaying analytic tunnel field are real existing processing, although their perceptual strength remains unverified.

## Three most important gaps

1. **Low-order dominance versus the reference's articulated mid/upper scream.** The dry pass's established firing family is about 764 Hz, with a strong 127 Hz crank-order line. Around the near pass, generated 2–6 kHz energy is 9.48 dB below 500 Hz–2 kHz; the selected Pagani window is 6.38 dB below. The roughly 3.1 dB relative difference and the spectrogram suggest a voicing candidate, not a calibrated EQ target. Fixed broad resonances and low-order mechanical weights merit a controlled A/B. Different RPM/load and microphone response prevent choosing a defensible correction magnitude now.

2. **The demonstration's operating-state and recession contour is too simple.** The four-second pass holds authored RPM at 7,644, load at 0.82 and speed at 60 m/s. After initial synthesis settling, its pitch evolution is primarily motion. The footage contains longer evolving harmonic trajectories and a sharp knee; it does not establish their RPM/Doppler decomposition. Our steady departure's upper/mid ratio changes only from -9.66 to -9.44 dB, while the selected Pagani near/later windows change from -6.38 to -13.86 dB. That difference combines state, orientation, distance and possible editing; it does not prove faulty air absorption. A static-RPM short pass cannot demonstrate the complete rising-scream/shift/lift/long-recession target.

3. **Tunnel occupancy is weak relative to the early field.** In the same 0–4 s stereo window, late-minus-early RMS is -76.59 dBFS against early RMS -41.49 dBFS: **35.10 dB lower**. This improves on the supplied note's comparison of unlike windows (-31.6 dB). The 5–6 s wet tail remains numerically present at -122.29 dBFS while early PCM is zero; that is not an audibility claim. The reference tunnel suggests a much denser sustained field, but its 26 s edit cannot yield a reliable T60. Existing first/second-order geometry and direct-stem late excitation are limited approximations; increasing wet gain from this video would be speculative.

## Decision, checks and next step

**No sound correction implemented.** A harmonic rebalance, wet-level increase or invented RPM trajectory would exceed what these unmatched recordings establish. The useful output is a reproducible comparison and a narrower next experiment; no misleading “after” audio was created.

Five directly relevant existing tests passed: distance-band prediction, multi-order Doppler, receding pitch, phase continuity through limiter/gear changes, and finite/unclipped operating extremes. All seven reused WAV hashes matched their existing measurement records before and after analysis. No full suite or CI was requested or run.

After usage resets, the highest-value next change is **one reference-inspired accelerating/upshift/lift flyby control sequence**, through the unchanged synthesizer and propagation engine, with a longer recession. Label its controls as authored rather than recovered telemetry. Use it for a fixed-level A/B against the present static-RPM pass before selecting a V12 harmonic rebalance. Keep Pagani as the timbre reference and the motorcycles as motion/environment references. This separates missing performance gestures from source-voicing changes without adding an audio engine or artificial flyby processing.
