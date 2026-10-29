# ACOUSTICS-08.3 bounded geometry audition level

The revised supervised candidate uses an explicit **+12 dB** audition stage after acoustic rendering and before the existing **0.20** host master gain. The original source remains one 600 Hz harmonic beacon at level **0.44**. This raises the previously untrimmed output by 3.9811 times without changing propagation or equalizing obstructed sound. The stage defaults to zero and preserves default PCM bit for bit.

PR #60 (`b5143db8c99decef49a8c9fdf1473f0c3db4840f`) matched the historical audible audition using +24 dB in a restricted synthetic scene. That value is unsuitable for unconditional reuse with observed geometry. In the current actual producer's geometry replay, it rejected a direct-only block at its unchanged **0.5 pre-host ceiling**. The untrimmed reflected fixture peaks at 0.070896; multiplying it by +24 dB would reach about 1.124 pre-host, more than twice that ceiling. The failed local experiment is retained privately.

The revised fixed +12 dB was selected with roughly 5 dB of margin below the same ceiling in the strongest tested reflection case. It is an explicit level adjustment, not SPL calibration or automatic gain control. Host gain limits, renderer limits, settings attenuation, source level, quality/acceleration behavior, SoundMap and recorder are unchanged.

## Guards

- Startup opt-in is `--beacon-output-trim-db 12`; arbitrary trim values, including the old +24 dB, are rejected. The host additionally requires the reviewed geometry-enabled, required-listener, one-source 600 Hz/.44/.20 profile, muted manual startup, and no WAV, loopback, exercise or device-probe mode.
- Each whole stereo block is checked before multiplication/publication. Nonfinite samples, a boosted absolute Float32 sample over 0.5, or prior renderer limiting terminate production. No clipping, automatic attenuation or retry is substituted.
- The host independently rejects audition packets above 0.5 before enqueueing. At host gain .20 the output ceiling is approximately **0.10 full scale / -20 dBFS**, with the normal bounded queued-output shutdown behavior. This digital limit is not a physical headset loudness calibration.
- Trim metadata/peaks/rejections are recorded in producer diagnostics, sampled SoundMap frames and producer-stop evidence. Owned PCM remains tapped after actual host gain/mute.

## Offline PCM validation

Actual observed-geometry worker and credit-paced RA07 producer, Balanced/Auto, 560 blocks / 286,720 stereo frames for each condition. Post-host metrics below use the existing .20 Float32 gain multiplication; no endpoint was opened. Each boosted sample matches exactly `Float32(original * 10^(12/20))`. Path contacts, delays, directions and materials match the paired unboosted trace, including second-order reflection, geometry expiry/recovery and source lifecycle changes.

| Condition | Pre-host peak | Post-host peak | Post-host RMS | Output peak headroom |
|---|---:|---:|---:|---:|
| Direct | 0.134299 | 0.026860 | 0.011152 | 31.42 dB |
| Reflected | 0.282242 | 0.056448 | 0.015265 | 24.97 dB |
| Obstructed | 0.095300 | 0.019060 | 0.002902 | 34.40 dB |

All three passed with zero clipped/nonfinite samples, renderer limiting or rejected blocks. The obstructed case retains authored transmission attenuation. A separate stronger near-source geometry case correctly terminates instead of publishing excessive PCM. Atomic block rejection, nonfinite rejection, default fidelity, startup, stale/pause and Stop tails are covered by focused regressions.

The historical audible +24 dB stationary audition had peak **0.055147**, RMS **0.028226**; its turning audition peak was **0.073519**, RMS **0.028216**. The revised reflection peak is within about 0.20 dB of that stationary peak, but the new replay includes silence, expiry and different paths; whole-recording RMS is not a matched loudness comparison. Direct and obstructed output remain lower as expected. Physical audibility and SoundPlayer/WASAPI mixer equivalence require the supervised listening verdict. No claim of equal loudness across scenes is made.

## Revised candidate

The fresh private package is `.local/combined-083-review-03`; previous packages remain preserved. It binds this follow-up source and current host with the explicit +12 dB argument. Existing plugin, GPU helper, menu behavior, Balanced/Auto startup, two bounded sensing sessions, ten-minute separate loading allowance, host +45 second Stop target and 60-second maximum audio phase remain in scope. Approval and deployment journal are absent. No deployment, launch, endpoint, playback or live recording was performed.

Reproduce affected checks with `node --test tests/Test-BeaconOutputTrim.mjs tests/Test-GeometryAudition.mjs tests/Test-BeaconFrequency.mjs tests/Test-SoundMapProducer.mjs tests/Test-RealtimeGeometry.mjs` and `pwsh -NoProfile -File tools/Build-AcousticsHost.ps1 -Tests`. The same tests are registered in the existing offline runner; no launcher or new test infrastructure is added.
