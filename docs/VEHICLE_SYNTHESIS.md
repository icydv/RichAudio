# Original vehicle emission synthesis

The vehicle module emits eight separate original mono PCM components at 48 kHz:
mechanical body, exhaust, intake, drivetrain, tyres, airflow, forced induction and
eligible transient events. These arrays are inputs to the existing RichAudio
propagation renderer; the synthesizer does not implement a second spatial engine.

`profiles.mjs` provides an even-fire, naturally aspirated V12 design and a lower
revving, supercharged V8 design. They have different crank orders, firing-event
weights, speed response, shift duration, source locations and radiation estimates.
Neither is a reconstruction of a named manufacturer's engine. Source amplitudes,
exhaust spectral envelopes, cylinder weights, directivity, offsets and response
times are **original design estimates**. They have no measured SPL calibration.
Radiation axes are horizontal in the vehicle frame, matching the existing
forward/up propagation contract. At least one mechanical order must have positive
weight; an intentionally silent mechanical component uses its zero output gain.

## Combustion and continuity

For `N` cylinders, crank speed `RPM`, and `S` strokes per cycle, the mean firing
frequency is `N * RPM / (30 * S)`. Thus a four-stroke V12 at an estimated 6,000 RPM
fires at 600 Hz, whereas a four-stroke V8 fires at 400 Hz. This is a consequence of
the configured architecture; it is unrelated to peaks in the supplied recordings.

Each profile specifies cylinder identity, crank angle and relative pulse weight.
The Fourier coefficients of those firing events are compiled once. A bounded
additive model retains up to 48 significant cycle orders. Load and speed change
their spectral envelope, while independent filtered deterministic noise supplies
combustion and mechanical texture. Mechanical orders remain tied to crank phase.
The intake has its own order balance, drivetrain whine follows a separate gear
oscillator, and tyre/airflow noise depends on road speed rather than engine speed.
The V12's forced-induction array is exactly silent because that design has none.

Mechanical vibration is not assumed to radiate efficiently at arbitrarily low
frequency. Each mechanical partial receives the bounded pressure factor
`f² / sqrt(f⁴ + fc⁴)`. Its low-frequency power follows `f⁴`, a dipole-like
vibrating-body radiation approximation. The configurable `mechanicalRadiationHz`
turnover is 50 Hz for the V12 and 35 Hz for the V8; these values are authored
estimates, not measured housing dimensions or transfer functions. They attenuate
subsonic crank vibration without boosting or renormalizing the remaining source.
At V12 idle, the 17.5 Hz crank partial is reduced by approximately 18.3 dB while
the 105 Hz firing-order mechanical partial is reduced by approximately 0.22 dB.
The test suite verifies the actual PCM's firing-family energy exceeds its
subsonic mechanical-order energy by at least a factor of ten. This is an objective
spectral check, not a human listening result.

Crank phase is continuous across render calls, shifts and throttle changes.
First-order state response smooths estimated RPM, load, throttle, road speed and
engine start/stop. A smooth shift torque interruption changes the existing source;
it does not restart oscillators or PCM history. Limiter depth, gear engagement and
road-surface transitions are also smoothed. This is a source-control model, not a
complete engine/driveline torque simulation.

Overrun pops are **never generated automatically** on every shift or lift. A
profile must permit them, and an explicit rising-edge `exhaustPop` request also
requires an operating engine above 3,000 estimated RPM, low throttle, declared
overrun and sufficient prior load in the bounded fuel-energy proxy. That proxy is
an estimate, not observed exhaust fuel mass. The transient has a smooth attack and
decay; an ineligible request is counted and ignored.

## Band limits, output bounds and implementation cost

Partial gain is unchanged through 9.6 kHz, cosine-tapered to zero at 11.52 kHz, and
zero above it. There is no discontinuous harmonic insertion, hard wave shaping or
sample clipping. Four cascaded stable one-pole filters shape stochastic textures.
The source has no output normalizer or safety limiter. Profile component gains
sum to at most 0.85, and each construction uses bounded terms. This leaves a
declared source margin; propagation sums and output safety require their own tests.

The guard reserves bandwidth for changing frequency and subsequent Doppler. The
tests demonstrate strongly suppressed aliases for the specified stationary
stress cases; they do not establish mathematical band limitation under arbitrary
time-varying modulation or universal alias-free motion through the renderer.

Construction performs profile validation, deep copying and coefficient assembly.
`render()` allocates output arrays for offline/producer convenience.
`createVehicleBuffers()` plus `renderInto()` reuses all eight PCM arrays and the
mixed array. The sample loop has bounded scalar CPU work, at most 48 combustion
partials and 12 mechanical orders, fixed filter state and no blocking or GPU work.
Control validation and a small diagnostic object remain per block. The intended
placement is the producer worker, not the WASAPI callback. No source synthesis
operation is advertised as DirectCompute, SIMD or DXR acceleration.

A local source-only observation before the mechanical-radiation refinement,
over 500 warmed 512-frame blocks, recorded median
0.866 ms, p95 1.365 ms, p99 1.505 ms and maximum 1.517 ms, with no elapsed durations
over the 10.667 ms block interval. This was a synchronous CPU observation during
development, with possible contention from other offline work. It is not a GTA,
WASAPI, hard-real-time or combined-propagation deadline guarantee. The full demo
benchmark is the appropriate evidence for the combined pipeline.

## Deterministic evidence and limits

Run `node --test tests/Test-VehicleSynthesis.mjs`. Tests inspect actual PCM for
predicted firing harmonics, original profile differences, a custom uneven firing
pattern, two-stroke/odd-cylinder phase continuity, independent texture and layer
energy, block-partition identity, smooth shifts/limiter entry, event eligibility,
engine-stop behaviour, finite bounded output and malformed inputs.

The alias checks include a 16-cylinder two-stroke high-speed stress profile and
noncommensurate frequencies whose omitted partials would fold into distinct false
audible frequencies in a naive unbounded pulse synthesizer. Upper-band and folded
line energy are required below `1e-8` relative to the stated reference energy.

This increment has no measured crankshaft RPM, actual throttle sensor, calibrated
exhaust geometry, nonlinear gas flow, waveguide manifold model, combustion pressure
solver or licensed sample playback. All profiles are mathematical original
signals. Human listening, realism and perceptual acceptance remain unverified.

The general additive/noise approach and phase continuity rationale follow Julius
O. Smith's primary textbook treatment of [additive synthesis](https://www.dsprelated.com/freebooks/SASP/Additive_Synthesis_Early_Sinusoidal.html)
and [spectral modeling synthesis](https://dsprelated.com/freebooks/sasp/Spectral_Modeling_Synthesis.html).
Filter stability and cascade reasoning are covered in his
[Introduction to Digital Filters](https://www.dsprelated.com/freebooks/filters/).
These references support the DSP techniques, not calibration of the original
vehicle profiles or a claim of perceptual authenticity.

For radiation motivation, Jacobsen and Juhl's primary teaching monograph
[Radiation of Sound, equation 5.42](https://www.researchgate.net/publication/229025696_Radiation_of_sound)
derives the low-frequency fourth-power dependence of radiated power for an
oscillating rigid sphere. [MIT's acoustics notes, section 13.3](https://ocw.mit.edu/courses/6-013-electromagnetics-and-applications-spring-2009/d3be4ea78b036a6362230fb41780cf54_MIT6_013S09_notes.pdf)
also describe weak low-frequency dipole radiation. A real engine/body is more
complex; these sources justify the attenuation trend, not the chosen turnover.
