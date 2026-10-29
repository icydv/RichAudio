# VEHICLE-PHYSICS-01 offline results

Implementation: `36c4473c2676a3be74e76030ef1f42052310453b`.
Offline registration: `6c39057fb882ddaff0ed6b52386d618749bb2c20`.
Exact baseline: `d6390f1c125264d4fa6f0c1e9b53eddeb1f15046`.
See the draft PR's final head/checks for publication identity and hosted CI status.

The complete registered PowerShell 7 suite passed locally: **574 Node tests**
and all registered native/telemetry checks, including **63 new vehicle tests**.
The baseline's existing suite also passed before registration. Its separately
reported hosted `Test-UnsentExpiry.ps1` failure is not attributed to this branch;
local passes do not diagnose that failure.

All 12 propagated renders and 12 dry references are non-silent, finite and
unclipped. No propagated render activated the limiter, reset a path cursor or
read missing PCM history. Each simulation has only its initial session reset.
Same-pass and same-tunnel component hashes match exactly before propagation.
No audio endpoint or game was opened. Human perceptual acceptance is unverified.

## Generated signal measurements

These are unnormalised digital full-scale values, with common propagated master
attenuation 0.7. Reference recordings have unknown microphone/processing/gain;
their digital levels are not physical SPL targets.

| Case | Stereo RMS | Peak | Integrated LUFS |
|---|---:|---:|---:|
| V12 nearby idle | 0.002547 | 0.007279 | -51.0 |
| V12 acceleration source study | 0.006187 | 0.026321 | -42.0 |
| V12 upshift | 0.006996 | 0.024190 | -40.9 |
| V12 throttle lift | 0.005150 | 0.023326 | -43.7 |
| 216 km/h pass, direct | 0.001695 | 0.024668 | -50.0 |
| Departure to 116 m | 0.000932 | 0.013881 | -57.9 |
| Identical pass, finite reflections | 0.002998 | 0.032460 | -46.8 |
| Tunnel, early only | 0.005644 | 0.037233 | -39.6 |
| Tunnel, early plus late | 0.005648 | 0.037240 | -39.6 |
| Finite barrier and clearance | 0.001937 | 0.015794 | -50.9 |
| Supercharged V8 acceleration | 0.006999 | 0.023139 | -41.5 |
| 600 Hz diagnostic, fixed 0.22 source | 0.017661 | 0.025802 | -32.6 |

Near idle has prominent approximately 105/211/316 Hz bands and centroid 110.9 Hz.
V12 acceleration centroid is 456.2 Hz, versus V8 174.4 Hz and beacon 600.0 Hz.
These are clip descriptors, not subjective scores. Mechanical radiation reduces
the V12's 17.5 Hz idle crank component by 18.30 dB and its 105 Hz component only
0.22 dB, without boosting or renormalizing output.

The reflected-minus-direct pass has RMS **0.0021884**. Genuine first and second
orders coexist. The tunnel reaches 104 geometric component paths; silent
registered components are included, so this is not an audible-source count.
Late-minus-early RMS is **0.00014812** during 0–4 s, **0.000057362** over 4–5 s,
**7.681e-7** over 5–6 s and **1.637e-8** over 6–7 s. Float WAV retains 96,000
nonzero stereo samples in each of the last two windows. This proves measurable
decay, not human audibility of extremely quiet tails. Wet level remains conservative
and uncalibrated; direct-stem excitation is an explicitly limited approximation.

The independent flat-absorption impulse test predicts T60 0.928846 s and measures
0.927001 s using Schroeder -5 to -35 dB regression. Tunnel nominal low/mid/high
T60s are 1.960/1.339/0.840 s; filtered low/high tails measure about 1.886/0.975 s.
Spectral damping is approximate. FDN memory is 110,888 bytes. Sustained unit DC,
tones and seeded noise remain finite; largest tested peak is 0.60738 at wet 0.6,
without a limiter. The finite energy-gain bound is reported by diagnostics.

The long reference was decoded at its original 44.1 kHz mono rate; both available
long filenames have identical SHA-256. Selected interval RMS agrees with supplied
analysis: -15.793 dBFS at 4.8–5.25 s, -15.472 dBFS at 6.25–8 s and -29.095 dBFS
at 16–19 s. Received bands were not encoded as universal engine orders. Edited
material is not used for calibration. B/C originals and the ZIP were unavailable;
their supplied analysis was read but no new direct measurement/listening is claimed.

## CPU/GPU and deadlines

Ryzen 7 5800X, RTX 2080 SUPER, Node v24.19.0. Cases run sequentially, 282 blocks
each, 512 frames at 48 kHz: **10.667 ms per block**. Synthesis, finite-path/material
math, histories/mix and FDN run on CPU. Only existing conservative visibility
masks use hardware DirectCompute. No DXR, RTX-core or GPU synthesis claim.

| Quality | Requested backend | Total p95 ms | Total max ms | Misses | DSP p95 ms |
|---|---|---:|---:|---:|---:|
| Performance | CPU | 5.231 | 14.454 | 1 | 1.711 |
| Performance | GPU | 6.757 | 9.215 | 0 | 1.942 |
| Performance | Auto | 6.140 | 7.798 | 0 | 2.420 |
| Balanced | CPU | 6.502 | 8.361 | 0 | 2.732 |
| Balanced | GPU | 7.801 | 10.722 | 1 | 2.790 |
| Balanced | Auto | 7.421 | 8.785 | 0 | 3.190 |
| Quality | CPU | 6.026 | 7.421 | 0 | 2.546 |
| Quality | GPU | 7.223 | 10.679 | 1 | 2.529 |
| Quality | Auto | 6.856 | 8.275 | 0 | 2.811 |
| Max | CPU | 6.264 | 8.398 | 0 | 2.573 |
| Max | GPU | 7.660 | 11.674 | 2 | 2.842 |
| Max | Auto | 6.542 | 8.456 | 0 | 2.768 |

Five combined-work misses occurred across 3,384 measured blocks. Separately timed
PCM rendering had zero misses. Four explicit GPU runs applied 282 real GPU results
each. All CPU/GPU/Auto PCM comparisons are sample-identical within each quality.
Auto stayed on CPU for the small workload. GPU preparation reported no deadline
drops, although the combined work exceeded the period in listed blocks. No buffer
was enlarged. This is offline elapsed work, not WASAPI or GTA-load timing proof.

Eight main component histories reserve about 23.09 MB, the optional direct stem
23.04 MB, and FDN 0.111 MB. Performance admits 96 valid paths; other settings
admit 104. Larger ceilings do not manufacture geometry or higher orders. Two
active vehicles, complex scenes and live source scheduling require more profiling.

Initial development timings/failures remain private. Final media was regenerated
after radiation/FDN changes. Its separate render run retained four combined-work
misses; PCM/history checks stayed clean. All methods, reproduction commands and
unavailable effects are in [VEHICLE_PHYSICS_01.md](VEHICLE_PHYSICS_01.md).
Raw audio, plots and reports remain private under `.local/vehicle-physics/`.
