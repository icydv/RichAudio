# VEHICLE-PHYSICS-01: original vehicle emission through RichAudio

This independent increment supplies original V12 and supercharged V8 sources,
telemetry-to-control adaptation, component ownership, and an offline audition pack
through the existing causal acoustic engine. It is an implementation and offline
validation milestone. Human realism/acceptance, live vehicle attachment, measured
SPL and GTA-load timing are unverified.

Base: `d6390f1c125264d4fa6f0c1e9b53eddeb1f15046` (reviewed PR #73).
Branch: `feature/vehicle-physics-reference-engine`. The draft targets the frozen
`baseline/vehicle-physics-01-d6390f1` ref so later PR #73 changes do not silently
change this review's baseline. Reconciliation is a later explicit integration.

The only existing shared file changed is `tools/Test-Offline.ps1`, adding the
new deterministic test group. Listener, SoundMap, GPU implementation, host,
transport, settings and source-history implementation are preserved. Candidate
09, game installations and archives are untouched. No game or audio endpoint was
opened. RA07 validation is an actual native `BlockProtocol`/`PcmRing` fixture,
not a live host or stock-audio replacement claim.

## Run and audition privately

From this checkout, with Node available:

```powershell
node tools/Render-VehiclePhysics.mjs
node tools/Benchmark-VehiclePhysics.mjs
pwsh -NoProfile -File tools/Test-Offline.ps1
```

Open `.local/vehicle-physics/demo/listen.html` in a browser and start a player
manually. Nothing autoplays. All comparison levels change together. The output
contains 12 stereo comparisons plus 12 stereo dry/source references, all 48 kHz
IEEE float WAV. Float preserves small late tails without sample normalization or
quantization to silence. The same master attenuation, 0.7, applies to every
propagated file. Dry files are unpropagated source sums and deliberately retain
their different level. Digital amplitude is not calibrated sound pressure.

The cases include nearby idle; progressive engine-state acceleration, upshift and
lift on a stationary source study; a constant 60 m/s (216 km/h) pass; a continuing
8–116 m departure; the same pass in a finite street; an analytic open-ended tunnel
with early-only and early-plus-late alternatives; finite-barrier transmission and
edge clearance; a distinct V8; and a diagnostic 600 Hz source at 0.22 amplitude.
The constant-speed pass starts with the causally required travel-time silence;
it has no artificial pitch bend or instantaneous start/stop inside the clip.
The tunnel source brakes continuously and stops emitting at four seconds to expose
the decay. The file ending is the observation boundary, not an audibility cutoff.

Pass A/B and tunnel A/B compare hashes of all eight component PCM arrays before
propagation. A mismatch aborts export. The beacon has a deliberately stated fixed
amplitude; it is not loudness matched or claimed to reproduce the sealed audition
gain chain. There is no per-file normalization.

Objective plots and loudness require `numpy`, `scipy`, `matplotlib`, and
`imageio-ffmpeg` in a local Python environment:

```powershell
python tools/Analyze-VehicleAudio.py .local/vehicle-physics/demo
# Optional locally owned reference path:
python tools/Analyze-VehicleAudio.py .local/vehicle-physics/demo --reference <local-video>
```

The analyzer decodes files without playback, writes waveform/RMS/spectrogram PNGs,
band power, centroid, peaks, crest factor, and FFmpeg EBU R128 loudness/true peak.
Its spectral and RMS display scales are fixed across files. Short clips limit
loudness-range interpretation. Never compare a screen recording's dBFS to the
model as an SPL calibration. Dependencies, recordings, plots, WAVs, private logs
and raw benchmark outputs remain ignored under `.local`; none are in this PR.

## Modules and ownership

| Module | Implemented responsibility |
|---|---|
| `vehicle/profiles.mjs` | Validated original architecture, firing events, component gains/offsets/radiation, induction and response estimates |
| `vehicle/synthesizer.mjs` | Eight separate deterministic PCM layers; continuous crank phase; smooth state, shift, limiter and eligible pop controls |
| `vehicle/state-adapter.mjs` | Exact existing telemetry schema; explicit RPM mapping and labelled load/throttle estimate; two reusable vehicle slots |
| `vehicle/pipeline.mjs` | Existing `CausalSimulation`, `StreamingRenderer`, histories, acceleration and quality controls; reusable RA07/WAV encoding |
| `vehicle/environment.mjs` | Finite authored scenes/materials and supported analytic-enclosure late response |
| Render/analyze/benchmark tools | Private reproducible media, measurements, lineage and serial CPU/GPU comparisons |

Detailed source design, controls, bounds and alias-test scope are in
[VEHICLE_SYNTHESIS.md](VEHICLE_SYNTHESIS.md).

`VehicleStateAdapter.update()` consumes existing PascalCase `CaptureRecord` data
and lower-case field status/value objects. A valid `RpmRatio` maps through explicit
idle/redline and ratio endpoints to **estimated crank RPM**. Road speed never
substitutes for RPM. Load/throttle are bounded derivative proxies when observed
inputs are absent, not measured torque/pedal position. Overrun/pops remain off
unless suitable independently supplied controls explicitly justify them.
Unavailable RPM silences engine-dependent components while independently known
rolling motion remains available. No guessed idle fills a missing observation.

Slots `vehicle:1` and `vehicle:2` each own eight component IDs. Movement and shifts
preserve generation. Model/pool/tracking replacement, explicit termination,
expiry or session changes retire ownership; slot reuse advances generation while
the sibling's histories remain intact. A handle reuse without any distinguishing
observation cannot be identified and is documented as unknown. Component offsets
rotate with the vehicle; angular velocity is unavailable, so emitter velocity uses
rigid translation. This approximation is unsuitable for extreme rapid rotation.

The wrapper separates asynchronous control preparation from synchronous PCM
rendering. GPU preparation, file operations, synthesis setup and FDN construction
belong off the WASAPI callback. `renderInto`/`processInto` reuse caller-owned
buffers. Control preparation and diagnostic capture still allocate on the worker;
this increment does not claim a new allocation-free live producer.

## Propagation and environmental evidence

All components use the real retarded-time finite-path solver, band-dependent
attenuation/material filtering, per-component angular radiation and source PCM
histories. Exhaust, intake and mechanical directions differ by profile. Distance
uses the existing bounded one-metre reference law: no singular boost near zero.
The existing three illustrative atmospheric-loss bands are retained; temperature,
humidity and exact broadband atmospheric calibration are not implemented.

The new scenes contain explicit finite road/wall/ceiling supports. First and
second orders are solved simultaneously; no surface or path is manufactured to
fill a budget. Geometry expiry/withdrawal and restoration are tested. Existing
conditional observed-geometry/direct-only behavior remains covered by the full
suite; analytic demo geometry is never presented as live GTA observation.

Performance/Balanced/Quality/Max retain 12/16/32/64 **per-component ceilings** and
Auto/CPU/GPU remains independent. A tunnel may produce 13 valid paths per component,
so Quality and Max can correctly render the same result. Counts include geometric
controls for silent components; they are not counts of audible sources. Two
vehicles/16 components is the current fixed ownership bound. Silent-component
culling and energy-ranked whole-city source scheduling are not implemented.

The barrier demonstration uses existing material transmission with declared
low/mid/high energy coefficients. Moving past the finite edge restores direct
visibility. This is **not diffraction**. Unknown/missing geometry continues to
follow the existing strict conditional/fail-closed rules.

The late response requires validated complete analytic enclosure evidence:
dimensions, boundary areas, absorption, and open ends. An eight-line orthogonal
feedback delay network has contractive frequency-dependent feedback. Delay gain
follows `10^(-3 delay/T60)`; T60 comes from the declared Sabine approximation.
Injection uses a bounded energy normalization and a fixed wet mix. Source exit
fades injection while the field decays. Null/unsupported evidence produces no
late field. A long tunnel is not a diffuse ideal room, so predicted decay remains
an explicitly limited approximation, not a measured impulse response.

Late excitation uses a separate **propagated direct stem** to avoid reinjecting
the already-rendered early reflections. It inherits direct-path attenuation and
obstruction; it does not solve full emitted room-energy injection or spatially
varying diffuse sound power. Its level is uncalibrated. A finite induced-energy
gain bound and stress tests are reported; no limiter conceals instability.

## Reference comparison and remaining scope

The supplied analysis was read before checking the available long mono recording.
Reference A was decoded directly without normalization; interval RMS agrees with
the supplied approximately −15.8/−15.5 dBFS pass windows and −29.1 dBFS distant
window. Its moving harmonic families inform the qualitative layered-source target.
Those peaks are not universal engine orders or measured RPM. The duplicate long
filename adds no independent evidence. Original B/C recordings and the ZIP were
not found at execution time; their detailed observations remain supplied-analysis
evidence. No subjective listening occurred. Edited/looped sections are excluded
from physical calibration; no recording became a source asset.

Implemented physics tests independently predict firing orders, direct/reflected
delay, multiple-tone Doppler and distance/filter gain; inspect real PCM; and check
profile differences, noise/layers, phase/gear continuity, alias-stress cases,
source ownership, native framing, late decay, finite samples and history reuse.
Tests do not turn authored timbre into a claim of perceptual authenticity.

Still unavailable: verified-edge diffraction, selective higher geometric orders,
measured material/atmosphere/SPL/source-power calibration, nonlinear exhaust gas
or manifold waveguide simulation, HRTF/binaural rendering, kilometre audibility,
angular-motion emitter velocity, perceptual whole-city prioritization, actual GTA
vehicle attachment, stock-audio interception/suppression/replacement and GTA-load
or WASAPI deadline proof. None is represented by a decorative substitute.

## Narrow next integration

1. Reconcile this branch with the separately reviewed live-listening changes.
2. Supply valid telemetry plus an explicit model-to-profile/RPM mapping. Keep
   estimate provenance and missing-field behavior visible to the recorder.
3. Allocate two synthesis owners and their component history IDs off the callback.
   Reset only the replaced vehicle's synthesizer when its generation changes.
4. Feed component poses to the existing simulation worker and owned PCM into its
   histories. Component IDs/vehicle IDs and returned path controls supply SoundMap
   and recorder hooks without changing the listener wire protocol.
5. Select only geometry/environment evidence actually available; no analytic
   tunnel preset may silently stand in for sparse GTA measurements.
6. Use the existing credit-paced RA07 host path after a separately reviewed live
   integration and fresh authorization. Do not replace or deploy sealed candidates.
7. Conduct user listening at matched playback settings before any perceptual claim.

Generic PCM inputs can later carry appropriately owned/licensed audio through the
same propagation interfaces. No sample acquisition rights, stock hooks, runtime
deployment or audio replacement capability are implied by that interface.

Primary technical context: [Ansys harmonics/noise engine control](https://ansyshelp.ansys.com/public/Views/Secured/corp/v242/en/Sound_Car_UG/Sound/UG_Car/car_generation_vn_en.html),
[NASA moving-source Doppler](https://www.grc.nasa.gov/WWW/K-12/airplane/doppler.html),
[Smith variable delay](https://www.dsprelated.com/freebooks/pasp/Time_Varying_Delay_Effects.html),
[Smith FDNs](https://ccrma.stanford.edu/~jos/pasp/FDN_Reverberation.html), and
[MIT room acoustics](https://ocw.mit.edu/courses/21m-380-music-and-technology-recording-techniques-and-audio-production-fall-2016/d315c75efb01cb76ca897958570bab87_MIT21M_380F16_ses18_note.pdf).
These support the methods, not calibration of these original profiles/scenes.
