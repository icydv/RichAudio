# ACOUSTICS-08.1 — real RPH publisher and measured host relay

The missing game-side connection is implemented: an opt-in RPH adapter uses supported world collision queries, the Windows host receives and qualifies the results, and committed messages reach PR #70's existing simulation worker and RA07 producer. Device-free fixtures execute the actual capture kernel, named pipes, host queue/writer/diagnostic reader, relay, Node worker and streaming renderer. The RPH adapter compiles against the authentic pinned SDK; it has not been run in GTA.

## Authentic acquisition boundary

`GeometryBridge.Rph.cs` augments the existing listener plugin. `RichAudioGeometryStart`, `RichAudioGeometryStop` and `RichAudioGeometryStatus` explicitly control sensing while the existing beacon listener is active. Loading the plugin or starting the listener does not itself start collision queries. A plugin instance permits at most two manually requested sensing sessions, each limited to 12 seconds, eight completed/attempted groups and 72 world-only queries. There is no autonomous scanner or unlimited retry.

The real `RphWorld` adapter reads the supported player/vehicle/interior/network getters and invokes `World.TraceLine` with `TraceFlags.IntersectWorld`, excluding the current player. Actual executable and RPH file versions are read and must match the reviewed exact builds. Session identity is the actual beacon session; geometry has a separate ephemeral session/clock identity. No entity setters, audio APIs or stock-audio interception are used.

The unchanged `TilePlan`, `ObservationRules` and `PatchReconstruction` supply the original fixed nine-ray wall/ground plans, validation and inset finite support. The original one-shot observer files are unchanged. Every query requires stationary on-foot Story Mode, an unchanged player/interior and displacement no greater than 0.05 native units from the sensing anchor. Speed remains bounded at 0.25 native units/second. A context change, invalid/missing hit or inconsistent support ends sensing and publishes unavailability.

At most one collision query occurs per 50 ms, with no catch-up bursts. A group must complete within one second. Observed query time above 5 ms, step time above 25 ms or aggregate active group work above 60 ms stops the session. These are post-observation stop guards: managed code cannot preempt a slow native getter/query, so they are not hard execution-time guarantees.

The game fiber performs getters, one query, lightweight record validation and a latest-value mailbox exchange. Qualification, serialization, connection and pipe writes run on the publisher's background thread. No sensing starts before the geometry pipe connects. Original sample/group times, ray identities, build/context, unknown material/static classification and tolerances remain in the records.

After each fresh qualified group, the publisher may retain the other kind only while it is still current in the same sensing session/interior, with at least 100 ms of its original lease remaining at selection. Only two groups are retained. A packet must introduce a strictly newer capture; it cannot repeatedly publish an old set as fresh. Wall and ground retain their individual original timestamps, and the worker uses the earliest expiry. Historical recordings are not used by this increment.

## Host transport and identity

The optional `--geometry-model` host argument selects the new route, requires the existing listener pipe, one owned incremental source, and a small private model file. The example is `config/geometry-live-model.example.json`; the supplied file must be inside the repository's private `.local` storage, bounded and unlinked. It is validated before opening an endpoint. Without this option the original host/beacon route remains in use.

The geometry named pipe uses a four-byte length prefix, bounded DataContract JSON, current-user ACL and network-SID denial matching the existing listener transport. Its maximum payload is 49,152 bytes, leaving room inside the producer's 65,536-byte control frame for the relay envelope. Connection/read/write deadlines, stream/connection counts and monotonic sequence/context checks are bounded.

The host obtains the OS pipe-client PID using [GetNamedPipeClientProcessId](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeclientprocessid). It requires that PID, the packet's source PID, and the accepted listener connection's PID to agree. Listener session/generation, game/RPH builds, geometry session and interior must also be coherent. The neutral listener schema/framing is unchanged. Foreign PID/session/generation, malformed/oversize frames, old captures and invalid clock pairs are rejected.

Pipe reception, qualification and relay work use background threads. The existing host control writer and diagnostic reader carry relay traffic; no pipe wait or geometry work is added to WASAPI or its PCM ring. Geometry disconnect/failure clears geometry while the accepted listener continues. The original listener transport's own terminal shutdown policy remains unchanged.

## Clock evidence and the delivery proof

The capture clock takes bracketed readings: raw QPC before and after reading plugin-relative `Stopwatch.Elapsed` milliseconds. The midpoint and measured half-window plus counter resolution form each clock pair and its nonzero uncertainty. Two ordered pairs, separated by at least 100 ms, must establish overlapping offset intervals. Neither zero offset nor zero uncertainty is assumed. Excess uncertainty, frequency mismatch or inconsistent origins fail closed.

The forwarding limit is **not** established by choosing a configuration maximum or by reusing an earlier benchmark maximum. Every listener/geometry transaction uses this protocol:

1. The host stamps its current QPC and listener age, then queues a stage containing the existing listener/configuration/geometry contracts.
2. Node bounds and stages the payload without exposing geometry to the worker. It records its monotonic stage time and acknowledges receipt on the existing diagnostic stream.
3. The host measures that transaction's complete round trip. By causality, host-stamp-to-Node-stage delivery is no greater than this observed round trip. If it exceeds 10 ms or no acknowledgement arrives, the stage is dropped.
4. A commit supplies that measured bound. Node includes all elapsed time since staging, including the later commit's transit. An old/duplicate/cancelled commit or stale listener is rejected. No uncommitted geometry reaches `ObservedSimulationInput`.

Thus a slow commit cannot rejuvenate a capture, and a fast earlier delivery cannot authorize a later slow packet. Current packet delivery evidence is required by `ObservationClock` for publisher-origin messages. Disconnect notices cancel in-flight stages and carry only geometry unavailability, never replacement configuration.

The producer also brackets its receipt-clock/worker-dispatch sampling. The worker measures shared-process monotonic dispatch/processing age and carries the bracket uncertainty. Geometry admission uses the conservative lower observation-time bound; expiry uses the upper bound and the original `FinishedMs + 1000`. A legitimately tighter subsequent delivery interval may reduce its upper bound without falsely implying a reversed physical clock. Missing or excessive timing evidence clears geometry.

Audio frame time still drives source history and retarded emission time. It is not equated to the RPH stopwatch. The existing camera presentation delay remains separate from acoustic distance and from hardware output latency.

## Existing engine and source ownership

The relay forwards the existing `geometry-config`, `geometry` and listener inputs; owned-source configuration is explicit. Configuration epochs replace whole geometry feeds. A new sensing session or fresh interior context with the same native coordinate basis does not invent a listener generation or reset source PCM. A changed coordinate basis/build still requires a new listener generation; actual pose discontinuities retain the existing guards.

The model file declares an assumed scale, reference and owned-source offset. The host anchors the model origin to the first accepted native camera position and locates the original-generated beacon at that native offset. The source stays fixed across geometry streams. Axes, scale and origin are shared by observed surfaces, camera positions/directions/velocities and that source. Bounds remain finite (12 native units around the anchor); scale is explicitly unverified. Material spectra are named authored assumptions, not measured GTA coefficients.

`ObservedGeometryFeed`, `ObservedSimulationInput`, `CausalSimulation`, `StreamingRenderer`, the simulation worker and the 48 kHz stereo RA07 format remain the acoustic path. No alternate renderer was introduced. Direct identity, PCM rings, geometry-epoch reflection transitions, Doppler and gain/pan smoothing remain in use. Failure/expiry releases paths whose visibility is no longer available; it does not silently select a synthetic scene or reset the renderer.

## Reproduction and numerical results

```powershell
./tools/Test-GeometryLive.ps1
node --test tests/Test-GeometryRelay.mjs
```

The first command compiles/runs the real C# components with deterministic analytic collision fixtures, authentic local clock reads and actual transport framing. It writes fresh private output, then checks actual stereo PCM. `listen.html`, `observed.wav` and `matched-direct.wav` provide the comparison; no endpoint is opened and playback is manual. The final SDK-dependent adapter build is separate:

```powershell
./tools/Build-GeometryLive.ps1 -SdkPath <authentic-private-pinned-SDK-path>
```

The 46 capture/clock/transport/host assertions cover finite qualified support, query budget, on-foot/stationary/interior/session gates, non-renewal of old observations, actual peer rejection, oversize frames, inconsistent clock pairs, listener-context rejection and fresh private fixture destinations. Four focused Node tests cover staging/commit admission, slow/stale/reordered/unproven delivery, cancellation and uncertainty intervals. The end-to-end scenario includes wall/ground introduction and replacement, moving/rotating camera, deliberately delayed transport, invalid collision support, a new valid stream in a new interior, original expiry while the listener continues, and disconnect.

The checker reproduces **every actual streamed Float32 sample exactly** using the existing renderer with the recorded controls and original beacon synthesis. It then removes reflected orders while keeping those same source samples, histories, poses, direct controls and startup envelope. The resulting nonzero difference demonstrates an acoustic contribution, rather than a diagnostic-only change. Both first- and second-order reflected paths occur.

| Local focused run | Result |
|---|---:|
| Credited blocks / stereo frames | 345 / 176,640 |
| Matched reflection-difference RMS | 0.00293516 |
| PCM peak / maximum adjacent step | 0.02589608 / 0.00054068 |
| Clipped/nonfinite samples; limiter activation | 0 / 0 / 0 |
| Unavailable weighted history reads; cursor resets; path overflow | 0 / 0 / 0 |
| Source-history initializations / geometry streams | 1 / 2 |
| Measured maximum accepted forwarding RTT | 1.1717 ms |
| Deliberately delayed maximum RTT, rejected | 32.5791 ms |
| Worker p95 / maximum | 0.2846 / 9.1973 ms |
| DSP p95 / maximum | 0.1034 / 2.1378 ms |
| Renderer-owned storage / producer RSS | 2,881,152 / 72,708,096 bytes |

Valid steady-state windows are checked for unexpected silence; unavailable windows complete bounded release. The previous PR #70 controlled-feed PCM fingerprint remains unchanged. The required offline suite and final focused integration passed locally; hosted CI status is reported against the final PR contents.

Timings are observed costs of this device-free fixture, not scheduling guarantees. The fixture's 5.4-second wall interval produces about 3.68 seconds of PCM because its credit driver is timer paced. Independent wall-clock runs can have different timestamps and PCM; exact reproduction is from each captured control tape. The retained PR #70 deterministic feed still provides byte-identical repeated runs. The earlier 11.5 ms cold worker observation remains valid historical evidence; the lower maximum here does not prove it resolved.

## What remains before a supervised game test

Actual RPH queries, camera/player getters, transport timing under GTA load, plugin lifetime/unload behavior and subjective sound remain unverified in game. CPU/uncertainty or the 10 ms delivery limit may reject real captures; failure must be retained and reported, not bypassed. Partial support does not certify full world visibility, material calibration, dynamic surfaces, diffraction or city/tunnel coverage. No GTA stock vehicle audio is captured or modified.

A future live attempt needs one fresh reviewed candidate binding the newly built combined plugin, host/producer code and private model, with an exact temporary deployment/restoration scope and independent restoration check. The old sealed candidates/closed approvals are not reusable authorization. The combined plugin must replace the intended bridge in that new scope, rather than loading old and new command providers together. A single specifically authorized stationary on-foot Story Mode sensing/listening attempt can then check original timestamps, accepted relay bounds, READY/sending state, actual acoustic changes, stop and cleanup. No launch, deployment or audio-device access is authorized by this report.

Historical evidence and sealed packages are preserved. The combined milestone remains **60%**; original CI cause remains unknown, 07.9 remains incomplete with failed Stop timing, and 07.13 remains failed at launch with no listening result.
