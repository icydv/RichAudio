# VEHICLE-LIVE-01 telemetry and operating boundary

This is the experimental, additive, single-vehicle adapter. It does not replace GTA engine audio. The compiled bridge is pinned to GTA V Enhanced `1.0.1158.16` and RPH `1.132.1428.17748`. Compilation against the existing authenticated SDK establishes API availability; meaningful getters, acoustic audibility and runtime compatibility still require the separately authorized live test.

## In-game operation

The vehicle commands belong to the existing combined `RichAudio.Beacon.Rph.dll`; there is no second launcher or configuration application.

1. In an authorized Story Mode attempt, enter the driver seat of one valid car.
2. Run `RichAudioVehicleDemoStart v12` or `RichAudioVehicleDemoStart v8`. The selected profile must match the host's `--vehicle-profile v12|v8` argument. Attachment failure reports a reason and does not consume a successful session.
3. The bridge starts the existing camera-listener transport. The vehicle publisher waits for the first accepted listener frame. The host remains muted until the existing supervised host `start` control is issued, after readiness and recording preparation.
4. `RichAudioVehicleDemoStatus` reports sample counts, normalized-ratio range/change counts, unavailable getter counts, gear changes and transport state. A changing ratio is useful evidence, but does not establish a calibrated crankshaft-RPM reading.
5. `RichAudioVehicleDemoStop` detaches the generated sources and ends the listener session. There is one successful Start per plugin instance. A fresh plugin/test attempt is required to select a different profile.

The adapter stays attached when the player exits that car so a walk-around can be tested. Entering a different vehicle, entity disappearance, a missing player, pause/invalid listener, invalid required pose or getter failure ends the session. The bridge does not enumerate the city, spawn cars, alter engine state, mutate game audio, or invoke an audio endpoint. A live launch and endpoint remain outside preparation authority.

## Evidence and provenance

The existing vehicle research uses the same supported getters. The new adapter reads only the attached car: model hash and pool-handle-derived local identity; position, forward/up basis, velocity and speed; `IsEngineOn`; normalized `EngineRevolutionsRatio`; and `CurrentGear`. Ratio and gear are nullable if unavailable or outside bounds. Required pose/engine evidence fails closed. Acquisition is bounded to the listener's 20 Hz cadence and rejects reads taking more than 50 ms. Velocities above the current causal model's 100-unit/s limit are not silently clamped.

RPH's [EngineRevolutionsRatio documentation](https://docs.ragepluginhook.net/html/P_Rage_Vehicle_EngineRevolutionsRatio.htm) describes a normalized 0–1 ratio, with documented off/idle/maximum behavior. It does not establish measured physical RPM on the current Enhanced build. RPH's [CurrentGear documentation](https://docs.ragepluginhook.net/html/P_Rage_Vehicle_CurrentGear.htm) describes a framework gear index. Its published documentation targets an older RPH version, so the code preserves observed values separately from the demonstration model. [IsEngineOn](https://docs.ragepluginhook.net/html/P_Rage_Vehicle_IsEngineOn.htm) identifies engine state and is read only here.

The initial live synthesis deliberately uses the original PR #74 adapter with an explicitly estimated speed/gear RPM model. Wheel radius, final-drive and gear ratios are configurable authored estimates, bounded by the selected original engine profile's idle and redline limits. Acceleration/RPM rise supplies a bounded timbral load proxy; it is not measured throttle or torque. Stationary revving cannot be reconstructed from speed alone. Missing/constant/incorrect gear readings limit this model and must be reported from the first supervised trace. A working normalized-ratio getter may support a later reviewed calibration; this version records it but does not claim that calibration.

## Supported stock-audio investigation

The reviewed indexed public [Vehicle properties](https://docs.ragepluginhook.net/html/Properties_T_Rage_Vehicle.htm) and [Vehicle methods](https://docs.ragepluginhook.net/html/Methods_T_Rage_Vehicle.htm) did not establish a documented reversible engine-audio-only mute with a readable original state for this selected car; full-page retrieval of several indexes currently returns 404. `IsEngineOn` changes whether the engine operates; it is not an audio-suppression control. Metadata-only inspection of public `Vehicle` and `Entity` methods in the pinned SDK (`5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0`) found engine-health, engine-starting, engine-on, revolutions-ratio and alarm-state members, with no method named for an audio or mute operation. No runtime getter was executed during that inspection. No suitable public RPH method has therefore been validated for this candidate. This is a bounded documentation/API-surface finding, not proof that no future integration is possible. No undocumented game native, memory patch, archive edit, game-wide mute or guessed audio object is used.

The candidate is **additive experimental playback**: GTA's original engine remains audible alongside the original RichAudio components. Stock-engine replacement is a distinct later milestone.

## Wire and ownership boundary

The listener wire remains unchanged. `RichAudio.VehicleLive01.v1` is a separate current-user-only, local named pipe carrying at most one active vehicle, one connection, 4 KiB framed JSON messages and 2,401 sequence values within the existing 120-second producer cap. The host checks the actual named-pipe client PID against the accepted listener's client PID. Both streams use raw local `Stopwatch` ticks with the same frequency; no unrelated clock origin is substituted.

The exact packet fields are:

| Fields | Meaning |
| --- | --- |
| `version`, `session`, `listenerGeneration` | Schema 1 and current accepted listener binding |
| `generation`, `sequence`, `observationTicks`, `clockFrequency`, `gameTimeMs` | Vehicle lifetime and strictly advancing observation evidence |
| `sourcePid`, `vehicleId`, `model`, `profile` | Peer-bound identity and explicit original V12/V8 profile |
| `action`, `valid`, `reason` | `update` or final `remove`, with bounded validity reason |
| `position`, `velocity`, `forward`, `up`, `speed` | Observed native pose/movement; no fabricated physical calibration |
| `engineRunning`, `rpmRatio`, `gear` | Engine state and nullable normalized/gear getters |
| `rights`, `coordinates`, `units` | `original-generated`, `gta-native-unscaled`, `native-unverified` |

The host independently rejects a switched session, profile, model, vehicle identity, peer, nonmonotonic sequence/time, stale/future observation, generation rollback or publication after removal. A packet must match a fresh, valid, unpaused listener. Pose arrays are copied before entering the publisher's single-slot latest-value mailbox. Serialization, waits and IO occur on background threads.

Native receipt age includes the actual host control-queue time. Each vehicle packet is then staged in the producer and acknowledged. The host measures that packet's round trip and commits only a bound at most 10 ms. The producer includes stage residence plus the measured bound in its 250 ms freshness decision. A configured allowance alone is never accepted as timing evidence. Dropped stages and maximum observed/accepted round trips are retained in native metrics; no additional fixed audio buffer is introduced. Missing acknowledgement, rejected commit or an unexpected transport end stops the existing owned output. A normal vehicle transport Stop is accepted only after committed removal.

The vehicle context explicitly owns the eight stable component slots, starts them unavailable, and declares the one-metre demonstration scale. Their real poses and radiation directions come from synthesis state. The worker may follow the listener within a bounded 256 m direct-propagation region. Observed geometry remains independently qualified and expires or withdraws when its local region is left. The beacon context retains its original ownership restriction.

## Local validation

`tools/Test-VehicleEvidence.ps1` exercises the actual strict codec, production host/listener binding predicate and real named-pipe transport without GTA or an audio endpoint. Its 40 assertions cover malformed/extra/missing/type-confused fields, strict UTF-8, absent getter values, bounded pose, original ownership, immutable copies, replay, freshness, peer/vehicle/profile identity, wrong/stale/paused/synthetic listener, final removal and orderly Stop. The combined bridge compiled against the existing SHA-256-pinned private RPH SDK; the native host also compiled. The actual combined plugin passed 34 deployment-layout checks, including its cached-assembly path and real SoundMap service. End-to-end synthesis/PCM measurements and exact candidate status are recorded separately by the complete integration proof.
