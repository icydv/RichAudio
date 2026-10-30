# VEHICLE-LIVE-01: original vehicle through the live acoustic engine

This integration attaches the original PR #74 V12 or supercharged V8 to one player vehicle. The RPH bridge observes that vehicle, the original state adapter estimates synthesis controls, and eight separate components enter the same causal acoustic worker, StreamingRenderer, RA07 transport, native ring and owned recording path used by the beacon. Stock GTA audio remains audible: this is **additive experimental playback**.

The independent branch starts at verified PR #73 source `247e7ff2af8f1670ba454ae303ba56cb4f16fb19`. Only the vehicle modules and their supporting offline tests/tools are imported from PR #74 `eef0cbc2e96e09754d87b375975eb1053422121e`. No historical branch merge, Candidate 10 edit, existing approval reuse or modification of the other worker's checkout is part of this change.

## Actual source path

```text
Current player car, documented RPH getters
  -> copied single-slot VehiclePublisher -> current-user named pipe
  -> strict schema, actual peer PID and accepted listener session checks
  -> measured host/Node forwarding handshake and 250 ms freshness gate
  -> original VehicleStateAdapter + bounded speed/gear estimate
  -> continuous original VehicleSynthesizer V12 / V8
  -> eight independent PCM buffers and component poses
  -> actual simulation worker -> causal finite-path solver
  -> existing StreamingRenderer, eight independently tagged histories
  -> fixed attenuation and atomic 0.5 pre-host output guard
  -> original RA07 stream -> native PcmRing at 0.20 gain
  -> existing owned-output recording and SoundMap
```

The component identities are `vehicle:1:mechanical`, `exhaust`, `intake`, `drivetrain`, `tyres`, `aero`, `induction` and `transients`. Original component layouts and radiation axes remain separate during propagation. The naturally aspirated V12 has no invented supercharger layer. Unsupported throttle/fuel evidence does not create exhaust pops. Gear and ordinary operating changes retain oscillator phase and source identity. Removal invalidates source ownership, clears the independent PCM/filter/path histories and refuses late nonzero input to retired slots.

The worker requires explicit `original-generated` registration of exactly these eight slots. A declared one-native-unit/one-metre demonstration scale and a bounded 256 m region follow the listener; that scale is an assumption, not measured GTA calibration. Conditional direct propagation assumes unobserved space is clear. Independently qualified geometry may add finite reflections later and withdraw when stale or outside its observed region, preserving source lifetime. The original beacon authorization remains supported.

## Operating evidence

The adapter records normalized revolutions separately and reports their observed range/change count. It deliberately does not drive synthesis from an unvalidated getter. Initial estimated RPM uses observed speed and available gear with authored wheel radius, final drive and gear ratios, bounded by the original engine profile's idle/redline limits. Estimated load is a bounded acceleration/RPM-rise timbral proxy, not actual engine torque or measured throttle. Stationary revving cannot be reconstructed from this fallback. The first real trace must establish getter usefulness before a later calibrated mapping is considered.

See [telemetry contracts, documented getters and stock-audio investigation](VEHICLE_LIVE_01_TELEMETRY.md). A source replacement milestone remains separate because a documented, scoped, reversible stock-engine mute has not been established.

## Controls and one supervised listening attempt

The existing combined RPH plugin exposes:

```text
RichAudioVehicleDemoStart v12
RichAudioVehicleDemoStart v8
RichAudioVehicleDemoStatus
RichAudioVehicleDemoStop
```

Choose the profile matching the native host's `--vehicle-profile` before the attempt; one successful Start is allowed per plugin instance. Start requires the player in a valid car's driver seat. The source stays attached when the player steps out for a walk-around, and detaches if the vehicle disappears or the player changes cars. These commands do not create an audio endpoint. The existing supervised host remains muted until accepted source/listener readiness, recording preparation and its explicit `start` command.

After a new exact-build review and fresh authorization, the proposed listening sequence is: enter an engine-running high-performance car; start the matching V12 demo; verify readiness and record; idle, accelerate, change gear and lift off; check the source while driving and rotating the camera; stop safely and walk around the attached vehicle. Compare direct/reflected output briefly only if valid observed geometry is available. Stop recording/emission at the existing 45-second target, issue vehicle/geometry Stop, retain the hard 60-second host limit and 65-second cleanup backstop, then exit and independently restore/verify the original installation. V8 is available as an explicitly selected profile; the prepared first candidate selects V12.

## Digital level and timing

Vehicle mode forbids the beacon's +12 dB trim. The renderer's fixed gain is 0.35, half its ordinary 0.7 default, reserving additional headroom for the component sum and possible reflections. The native master remains 0.20. Complete blocks must be finite, un-limited and at or below 0.5 before publication; the native host independently enforces that ceiling. There is no normalization, arbitrary gain boost or extra endpoint/mixer. Measured peaks/RMS and CPU/worker/render deadline evidence are in the [integration proof report](VEHICLE_LIVE_01_DEVICE_FREE_PROOF.md). This is relative digital calibration, not physical SPL or an audibility claim; the actual listening level still needs the supervised test.

Vehicle prediction uses bounded observation timestamps and the PCM timeline. Wall time governs freshness. Source correction is tested against physical Doppler bounds, and telemetry gaps are exposed rather than hidden with extra buffering. The separately developed listener trim/spatial/latency correction must be published, tested and reconciled before this branch can claim that final presentation architecture.

## Reproduce without a game or audio endpoint

From this worktree, in PowerShell 7:

```powershell
./tools/Test-VehicleEvidence.ps1
node --test tests/Test-VehicleLiveSource.mjs tests/Test-VehicleRelay.mjs tests/Test-VehicleOutputGuard.mjs tests/Test-VehicleCandidate.mjs
./tools/Test-VehicleLive.ps1
./tools/Test-Offline.ps1
```

The native proof emits authored RPH-format idle/acceleration/shift/pass/deceleration/stop evidence through the actual publisher and transport, runs both profiles, and captures the real post-host PCM with WASAPI unstarted. It checks component energy, stable identities, source motion, physical propagation/Doppler, removal, headroom, native gain lineage, SoundMap and exact recorder bytes. It logs CPU work, actual backend selection and deadline misses. Raw recordings and paths remain private; CI retains only bounded sanitized summaries. This proves device-free integration, not gameplay measurements or physical audibility.

The actual RPH plugin is additionally compiled against the existing SHA-256-pinned authentic SDK. SDK compilation and private layout tests are reported separately from the framework-independent CI suite.

## Independent review candidate

`tools/Prepare-VehicleLiveCandidate.ps1` accepts the preserved baseline manifest and existing reviewed filesystem-only attempt-helper directory. It copies a fresh private application/runtime package and binds its sources, host, plugin, settings, native dependencies and deployment inputs. It reuses the existing 27-file reversible deployment/independent restoration workflow with a distinct vehicle scope; earlier candidates and their helpers are unchanged.

The candidate and attempt are `REVIEW_ONLY`, `liveAuthorised=false`, `maximumAttempts=1`. Preparation creates no approval or deployment journal. The listening CLI validates hashes/profile without spawning; both execution and deployment refuse a vehicle candidate while `liveReady=false`. This explicit gate covers reconciliation of the pending upstream correction and a new exact-build review. Fresh human authorization is still required afterward. No deployment, GTA/RPH launch or audio endpoint is authorized by this development task.
