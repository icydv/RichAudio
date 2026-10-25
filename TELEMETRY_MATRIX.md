# Current evidence and future capability boundary — 25 October 2026

The [controlled Enhanced launch](docs/P2_01_ENHANCED_RUNTIME_ATTEMPT.md) fixed observed executable selection but RPH crashed before RichAudio execution. The matrix below describes source/API availability and implementation evidence, **not live certification**. No player/NPC property, meaningful tracking distance or physical RPM calibration has been validated in game. Preserve per-field observed/estimated/unavailable status and explicit units/times in every future adapter.

Future road/aircraft/impulse providers need separately declared capabilities for throttle/load, engine calibration, rotor speed/loading/configuration, jet power, event emission time, and supersonic state. None is established merely by position/velocity or a generic vehicle model. Weather labels do not supply measured humidity/temperature. Unloaded sources have unavailable continuing engine state; bounded extrapolated movement is estimated, never observed. FiveM adapters must carry authority, update age, clock mapping and ownership separately from raw handles. No FiveM implementation is present.

# Telemetry matrix

## Phase 2 adapter mapping

No live values have been obtained yet. Current implemented getters use RPH Entity.Position/Velocity/Rotation/Orientation, Vehicle.Model.Hash/IsEngineOn/EngineRevolutionsRatio/CurrentGear and full PoolHandle.Value/Index/Counter. The camera proxy uses documented GET_FINAL_RENDERED_CAM_COORD/ROT through RPH. Player classification is validity-aware; an unavailable player-vehicle query does not silently classify every source as NPC.

Position/motion/engine/ratio/gear are **observed getter readings when returned**, not yet established reliable on this installed runtime. Listener orientation/velocity, vehicle acceleration and distance are **estimated** calculations. Engine load, physical crankshaft RPM and unexposed distant traffic state are **unavailable**; no offset/signature workaround is used. Every physical field carries status, nullable value, units, origin and reason. [Implementation details](docs/TELEMETRY_IMPLEMENTATION.md) and [distance investigation](docs/NPC_STREAMING.md) supersede the original adapter assumptions below.

## Preserved Phase 1 source assessment

No row is runtime-verified on the installed Enhanced 1158.16 build. **VERIFIED source** means the named API/property exists in the pinned native or SHVDNE source, not that an installed framework returned a correct value. All live calls are currently **BLOCKED** on the compatibility gate in [TOOL_COMPATIBILITY.md](TOOL_COMPATIBILITY.md).

Sources: pinned Cfx native definitions [S3–S5, S17] and SHVDNE source [S8]. Cfx-specific runtime additions are not assumed to be stock GTA natives. No stock vehicle RPM/current drivetrain gear/throttle-state getter was located in the native corpus inspected; the corresponding SHVDNE getters use memory offsets.

| Input | Interface / representation | Player and NPC limits | Status and validation |
|---|---|---|---|
| Source position | GET_ENTITY_COORDS | Streamed, existing entities only | VERIFIED source; test coordinates vs HUD/map markers |
| Orientation | GET_ENTITY_MATRIX or quaternion/rotation natives | Same; avoid heading-only exhaust model | VERIFIED source; check front/right/up and coordinate handedness |
| Linear velocity | GET_ENTITY_VELOCITY, m/s interpretation to calibrate | Sleeping/distant entities may update sparsely | VERIFIED source; compare finite difference and known motion |
| Acceleration | Filtered velocity difference with monotonic dt | Reject teleports, pause and handle changes | INFERRED; not SHVDNE's differently named throttle/acceleration property |
| Camera position/orientation | GET_FINAL_RENDERED_CAM_COORD / ROT; gameplay camera as fallback | Camera can differ from player head or vehicle seat | VERIFIED source; select one listener policy per test |
| Native listener pose | No definitive native audio listener getter established | Camera, cutscene and interior processing may diverge | UNTESTED; do not call chosen camera pose a native-listener measurement |
| Listener velocity | Finite difference of selected camera pose, smoothed | Camera cuts invalidate derivative | INFERRED; reset on cut/teleport |
| Engine running state | GET_IS_VEHICLE_ENGINE_RUNNING | Existing vehicles only | VERIFIED source; distinguish stopped, starting and freewheeling cases |
| Normalized RPM | SHVDNE Vehicle.CurrentRPM; documented 0–1 | Property uses CurrentRpmOffset and returns 0 if unavailable; NPC validity unknown | VERIFIED source; runtime BLOCKED. Invalid/missing must be null + reason, never a convincing idle value |
| Physical RPM / rev limit | Normalized value plus per-model calibrated transfer | Game values need not linearly map to crank speed; audio clocks are not necessarily a tachometer | INFERRED estimate; model-specific idle/redline measurements required |
| Current gear | SHVDNE Vehicle.CurrentGear memory byte | Offset-based; reverse/neutral handling must be measured | VERIFIED source, runtime BLOCKED |
| Player throttle/brake commands | GET_CONTROL_NORMAL; disabled-control variant when relevant | User command, not actual manifold throttle or torque; group/device selection matters | VERIFIED source; log control IDs and context |
| Vehicle throttle state | SHVDNE ThrottlePower / Throttle memory properties | Potentially available for NPC; semantic/scaling and update-rate validation needed | VERIFIED source; not an NPC control-input native |
| Engine load / torque | No established calibrated actual-load readout | Grade, drag, braking, gears, wheel slip and scripted driving confound acceleration | UNTESTED estimator: throttle, rpm derivative, speed/grade and handling priors; confidence and missing fields explicit |
| Model identifier | GET_ENTITY_MODEL | Hash stable, handle lifetime is not | VERIFIED source; cache profile by model hash |
| Vehicle class/type | GET_VEHICLE_CLASS, model/type checks | Class is not cylinder count/displacement | VERIFIED source; enrich from authored profiles |
| Cylinder count, displacement, firing order | Owned per-model source profile | Asset names/visual resemblance are insufficient evidence | UNAVAILABLE as verified runtime mechanical specifications |
| Exhaust origin | GET_ENTITY_BONE_INDEX_BY_NAME and GET_WORLD_POSITION_OF_ENTITY_BONE for exhaust-related bones | Bone names/count vary; a missing index needs a fallback; not inspected on Bati skeleton | VERIFIED source API, model binding UNTESTED |
| Exhaust direction | Bone rotation if adapter supports it, else authored local axis transformed by entity matrix | A bone point alone supplies no radiation axis | INFERRED; validate left/right, multi-exhaust, reverse facing |
| NPC list | SHVDNE World.GetAllVehicles / verified framework entity enumeration | Only loaded pool, not every city vehicle; avoid full enumeration every render frame | VERIFIED source path; density/range/cost UNTESTED |
| Player vs NPC ownership | Current player vehicle + driver/entity validity | Seat changes and vehicle reuse need new generation ID | VERIFIED source primitives; handover behavior UNTESTED |
| Entity lifetime | DOES_ENTITY_EXIST + model and generation counter | Handle reuse must not resurrect a source; no worker calls into game | INFERRED adapter contract |
| Interior/room state | GET_INTERIOR_FROM_ENTITY / camera interior queries and local portal data | Not complete acoustic boundary or window thickness information | VERIFIED source API; portal mapping UNTESTED |
| Ray obstruction/material | Async START_SHAPE_TEST_LOS_PROBE + GET_SHAPE_TEST_RESULT_INCLUDING_MATERIAL | Poll across ticks; loaded collision only. Cfx docs report limited range for some mission-entity intersections, not a universal Enhanced distance guarantee | VERIFIED source; accuracy/range/material mapping UNTESTED |
| Weather | Native weather/rain/wind state candidates | No calibrated humidity/temperature atmosphere established | Source candidates; physical atmosphere parameters INFERRED defaults with provenance |
| Native audible/virtualized status | No verified getter for arbitrary automatic vehicle engine voices | Pool entity existence is different from an allocated native audio voice | UNAVAILABLE in established integration |
| Far unstreamed traffic | No demonstrated object identity/position/RPM access | A renderer cannot recover real NPC telemetry after despawn | BLOCKED for exact source simulation; aggregate ambience would be a separately labelled approximation |

## Sampling and trust contract — UNTESTED design

Game/script thread collects 20 Hz snapshots initially, timestamps with monotonic time, and attaches model, entity generation, listener epoch and field validity. Read methods only; never write RPM/gear to make data easier to obtain. Discover NPCs at 2 Hz, initially cap tracked entities at 32 and record overflow rather than changing population/streaming rules.

Optional RPM and gear adapters fail independently. Framework getters that return zero on missing offsets require a separate readiness/capability check; zero is valid engine-off data and cannot itself prove readiness. If that check is unavailable, report the field unsupported. Log raw normalized RPM separately from any calibrated RPM estimate.

Workers receive POD copies; handles are opaque identifiers, never pointers to game memory. Interpolate positions for rendering using timestamps. Extrapolate no longer than 100 ms, then fade owned RichAudio sources; do not invent indefinite traffic. Reset velocity/load filters after pause, camera cuts, teleport, model change, source recreation or invalid sample. Measure actual update cadence for NPCs at increasing ranges before promising long-distance traffic.

Expected costs and acceptance thresholds are proposals in [ARCHITECTURE.md](ARCHITECTURE.md). P2-01 in [EXPERIMENT_PLAN.md](EXPERIMENT_PLAN.md) is the exact first validation. No public claim of accurate 14,000-RPM behavior is justified until physical RPM calibration and source data exist.
