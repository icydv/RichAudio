# Acoustic design

**ACOUSTICS-01 offline checkpoint:** [finite-surface geometry and first-reflection calculations](docs/ACOUSTICS_01_LOCAL_GEOMETRY.md) are now tested on three wholly original synthetic scenes. Unknown geometry/materials remain explicit, and no audio is produced. This is a bounded parallel research exception to the unimplemented proposals below, not GTA geometry validation or a native audio-integration release.

## Immersion-first design contract

The long-term objective is convincing physical presence, scale and character across the whole world: road vehicles, rotorcraft, jets, sirens, gunfire, explosions, backfires, weather, ambience and interiors. These are aspirations, not completed acoustic features. The current telemetry-only checkpoint produces no sound. Source Sound System, Acoustic World Simulation and Perceptual Rendering/Mixing have distinct responsibilities as defined in [ARCHITECTURE.md](ARCHITECTURE.md).

Physical models constrain propagation and source behavior; listening tests establish whether the result translates convincingly to ordinary headphones and speakers. Preserve quiet idling/background traffic and distant rhythmic aircraft alongside stronger high-load sources. Source-specific spectral balance, transients, harmonics, modulation and directivity should create size and power. Never manufacture impact through blanket bass boost, loudness inflation or excessive compression. Perceptual processing must be bounded, context-sensitive, optional where appropriate and evaluated against calibrated/reference behavior.

Stock sound preservation and compatible custom providers are first-class requirements. Processing should surround isolated source material where ownership is proven, keeping original archives untouched. Final-mix processing cannot provide independent engine/aircraft/event propagation. Stock/custom availability, license and duplication-free playback are separate gates; none has passed. The recorded/procedural techniques below are candidates, not a mandatory replacement pack.

## Additional source families — future investigation

| Family | Physical/source cues | Required evidence and perceptual check |
|---|---|---|
| V8 | Firing layout, exhaust/intake/mechanical components, load-dependent spectrum and transients | Authored or measured calibration; convincing idle rumble and acceleration scale with quiet/loud contrast, not a generic low shelf |
| High-revving inline-four | Distinct firing harmonics, intake/exhaust energy and overrun/gear transitions | Engine-specific RPM calibration and load confidence; high-load scream decays through band loss, geometry and masking rather than an RPM radius |
| Heavy/tandem rotorcraft | Blade-passage modulation, rotor interaction/loading, blade slap and turbine contributions | Rotor geometry/operating state or explicitly authored approximation; Chinook-like listening reference, nearby dominant pulses and plausible faint distant rhythm |
| Fighter/civil aircraft | Broadband jet noise, tones, power/angle dependence and motion | Validated state and directivity; delay/Doppler once per modeled path; supersonic shocks only with supported authoritative state |
| Impulsive events | Time, source position/extent, exhaust/weapon direction and transient/body | Genuine observed backfire/weapon/explosion events first; distinct early paths and geometry-dependent decay; no fabricated gameplay event |
| Sirens/ambience/weather | Source identity, environment and spatial extent | Separate ownership/event/state research; preserve native categories until isolation is demonstrated |

Consumer playback cannot reproduce a real jet's pressure or helicopter vibration. Digital limiting and gain management reduce software peaks but cannot guarantee hearing-safe physical SPL at arbitrary device volume. Keep sensible defaults, measured headroom and user control; do not equate loudness with realism. Future acceptance combines objective path/energy/performance checks and structured listening in [EXPERIMENT_PLAN.md](EXPERIMENT_PLAN.md).

**UNTESTED engineering design.** Equations here describe the proposed model, not measured Rockstar behavior. GTA metadata observations are separated in [GTA_AUDIO_RESEARCH.md](GTA_AUDIO_RESEARCH.md). Use physical structure where inputs support it and label perceptual approximations explicitly.

## Source generation

Model source emission before propagation. A useful four-stroke firing-event rate is `f_fire = RPM * cylinders / 120`, assuming evenly spaced firing events. At 3,000 RPM an evenly firing four-cylinder example has 100 firing events/s; at 14,000, about 466.7/s. Firing order, uneven firing, exhaust grouping and resonances alter its spectrum. This relationship does not mean the strongest audible pitch must equal the firing rate or that normalized game RPM is calibrated physical RPM.

Combine separate intake, combustion/exhaust and mechanical contributions. Model engine speed, throttle command/state, estimated load, turbo state if known, gear transients, engine braking and limiter behavior. A high-RPM unloaded engine need not radiate the same level or spectrum as one accelerating under heavy load. Use measured or authored level/spectrum maps with uncertainty bounds; no `audibleRadius = RPM * multiplier` rule. A source can become audible farther away as its emitted band energy rises relative to losses and masking, without changing a hard distance switch.

Owned recorded sources may use RPM/load grids, phase-aware granular playback and controlled crossfades; procedural sources can generate firing impulses, resonators and broadband components. Do not replay one acceleration recording at arbitrary pitch and call it physically accurate. Cover idle, throttle ramps, overrun, gear shifts and start/stop separately. Estimate crank phase continuously when possible, but unknown normalized RPM and asynchronous sample clocks do not provide native crank phase synchronization.

Profiles specify cylinders, displacement, redline/idle calibration, firing timing, exhaust routing, muffler/filter transfer, intake location, mechanical source location and directivity bands. These are authored properties with provenance; class and filename guesses do not supply them. The traced Bati uses a `v_twin_2` asset family, so it is unsuitable as evidence for the requested inline-four mechanical model.

NPCs should retain physically consistent emission when inputs are trustworthy. Lower detail can reduce synthesis layers, phase resolution and simulation frequency. It must not claim accurate load for an NPC whose throttle/RPM is unknown. For despawned traffic, either stop the source or use separately identified aggregate ambience; do not extrapolate a specific car forever.

## Direct propagation

For a source calibrated at reference range `r0`, pressure-like direct gain is approximately `r0 / max(r,r0)` in an unobstructed far field. Equivalently, free-field level change is `-20 log10(r/r0)` dB. This is a starting point, not a complete acoustic model; clamp the near field and handle multiple physical radiators. Energy/intensity quantities use squared pressure gain. Do not apply an intensity inverse-square law directly to waveform amplitude and accidentally double attenuation.

Per band, combine source radiation, distance spreading, atmospheric loss and geometric direct visibility. If air attenuation is expressed in dB/m, amplitude gain is `10^(-alpha_band * path_length / 20)`. Choose temperature/humidity assumptions explicitly and later calibrate; game weather does not automatically supply physical atmospheric parameters. Distance uses meters only after telemetry/geometry units are validated.

Direction matters: exhaust, engine bay and intake have different radiation patterns, affected by vehicle orientation and the listener's angle. Begin with smooth bounded per-band lobes and validate against owned reference recordings. Doppler is applied once for the owned source/path model, using source/listener velocities projected along the propagation direction and an explicit sound-speed assumption (initially 343 m/s). Clamp pathological relative velocities and reset after teleports. Pitch shifting is distinct from RPM changes. Delayed paths have their own path-length and time derivative; using one source-listener vector for every reflection is an approximation.

Propagation delay `path_length / c` matters at street-scale distances. Buffer source history where required; do not delay only the wet path without considering direct/native alignment. A 343 m path corresponds to 1 s under the chosen sound speed, which is arithmetic, not measured game latency. Game speed/time scaling and cutscene discontinuities need a declared policy.

## Obstruction, transmission and diffraction

Separate partial blockage from total occlusion. Use multiple rays or source extent to estimate visible area; one binary center ray can switch too abruptly at lamp posts and corners. Occluded sound may transmit through walls, reach openings, diffract, or arrive through reflections. Avoid adding all alternatives at full level or counting transmitted energy as reflected energy too.

Assign frequency-dependent transmission loss by material, thickness and opening state. Thin glass and massive concrete must behave differently. Physics materials are category hints, not measured acoustic spectra. Begin with broad bands and measured/declared priors; leave unknown material confidence visible in debug telemetry. Do not implement every obstruction as a universal low-pass filter with the same cutoff.

Geometric rays do not automatically simulate low-frequency wave diffraction. Steam Audio pathing is an indirect-path tool, not proof of a full-wave solution. Candidate later work includes portal/edge routing with band-dependent attenuation and wedge approximations, tested in owned synthetic scenes. If no valid path is found, do not simply boost reverb according to distance to invent sound around buildings.

## Reflections and reverberation

Early reflections depend on actual paths, reflector geometry, material and direction. Arrival times derive from path lengths, with per-bounce energy losses. Late reverberation is a diffuse approximation to dense reflected energy, driven by enclosure, openings, absorption and scattering. Exterior street canyons may have sparse strong echoes and an uneven decay; open countryside must not receive an indoor-style reverb merely because a car is distant.

Use geometry-based early paths plus a bounded hybrid late tail where justified. Steam Audio supplies reflection/path rendering tools [S12–S15], but integration must still select geometry, materials, baking and update rates. Fade/interpolate simulation state and IR updates to prevent clicks; keep decaying tails alive when a source stops, under a bounded tail budget.

Sabine-style `T60 ~= 0.161 V/A` is only a rough diffuse-room sanity check in SI units, with equivalent absorption area `A`. It is inappropriate as a universal outdoor or tunnel model; high absorption and non-diffuse fields need other models or reference measurements. Estimate RT/EDT from impulse-response decay using appropriate integration, noise-floor handling and band filtering. A finite noisy tail does not necessarily support a reliable T60 fit.

An interior listener needs room/portal connectivity, wall/window transmission and local room response. Opening a window can change both direct transmission and early paths; classify each contribution so it is not double-counted. Tunnel entry/exit must change paths and enclosure continuously, with tails decaying naturally after exit instead of hard-resetting all reverb on a volume boundary.

## Spatial perception, masking and calibration

Use one spatialization chain per owned component. Steam Audio HRTF for headphones is a candidate; speaker output needs a compatible decoding/panning mode. Avoid applying another automatic spatializer to already binaural output. Listener head/camera motion, front/back and elevation cues need explicit tests. This proposal does not claim the native game listener exactly matches the chosen camera.

Rank/cull on predicted band audibility above an estimated noise floor. Wind, tires, city ambience and listener cabin noise affect masking. Distance is useful for a cheap bound, never the sole determinant of reverb, occlusion or priority. A quiet nearby source can be masked while a more distant accelerating motorcycle remains audible through a valid reflecting path.

Maintain headroom and a transparent safety limiter for the owned mix; log limiter action so it does not hide gain errors. Digital dBFS is not physical SPL. A calibrated SPL reference requires controlled recordings/playback and a known reference chain. For evaluation, keep output device and game settings fixed, log gains, compare level-matched examples where testing timbre/space, and retain absolute-level comparisons where testing propagation. Do not loudness-normalize away the effect being measured.

## Offline validation before world integration

Use newly authored synthetic impulses/noise and simple owned geometry: free field, one plane, corner, two-room portal, tunnel segment. Check analytic direct attenuation, first-reflection delay, energy bounds, coordinate transforms, spectral transmission and listener rotation. Then repeat a controlled telemetry replay to compare solver configurations with identical source motion. These tests are planned, not performed in Phase 1. Psychoacoustic listening should complement measurable timing/energy/path consistency, not replace it.
