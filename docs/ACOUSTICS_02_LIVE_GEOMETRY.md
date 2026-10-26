# ACOUSTICS-02: my first bounded GTA geometry observation — preparation

26 October 2026. **PREPARED; LIVE APPROVAL PENDING.** I've built and offline-tested a separate one-shot geometry observer. No deployment, GTA/RPH launch or live geometry query has occurred. This is not a PASS for the live milestone. Stage 4 and the live validation/restoration stages remain NOT TESTED.

## Ancestry and preservation

PR #26 remains open and unmerged at `0c7924810f2d61e2ceffb5862e8917ee711abc0e`. My branch `research/acoustics-02-live-geometry-observation` starts there, preserving the independent main-based acoustics stream. No synthesis PR is merged or copied. The synthesis checkout remains clean at `24e1be70eb75c8f7b43e95fe495d3c71dba5dc42`.

I've reverified the previous 4,601-file/129-link preservation receipt and captured the current **4,857 protected private files and 139 link targets** before development. Original source material, previews and links are preserved without following link targets. The ACOUSTICS-01 reflection/geometry mathematics, source decoding/rendering, telemetry, RPM and native sound ownership are unchanged.

## Runtime and installation preflight

The existing host package and original installation currently match the saved successful-runtime records:

| Item | Fresh result |
|---|---|
| Enhanced executable | 1.0.1158.16; SHA `69DA07FF67D05E9DED11289E597E8B8DC5855B0A429C085F37D148DC267CB2C5`; valid signature |
| Original obsolete executable | 1.0.1013.34; SHA `FD330FAE0C92A52E0B277FBA8A6856C81BD931FC4FCD1D81FBA02772A2A814CF`; valid signature and independent backup |
| Authentic RPH package | 1.132.1428.17748; executable SHA `73F05B3F7973D4731F4151AE061DD3C991065E8BF3ECE51EA1D9AB728B9B42AC` |
| SDK | 1.124.1393.17586; SHA `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0` |
| Existing loader / DirectStorageFix | Previously proven official XInput loader 1.0.0.2 / DirectStorageFix 1.2; all recorded hashes match |
| Original files | Exact 32 root-file hashes, directory set, 179 archive metadata records and ten sampled archive hashes match |
| Runtime sources | Original approved 26-file package and prior 27-file successful set reverified |
| Destination conflicts | None; no observer, prior telemetry plugin, RPH settings/log or rename alias present |
| Diagnostic cleanup | PROCMON25 absent; no GTA/RPH/ProcMon/CodeWalker/OpenIV process |

The successful historical RPH motion integration establishes a credible exact-build host, not correctness of the new trace. Geometry behaviour is the hypothesis to test. Full telemetry certification, native audio ownership, real reflection geometry and Phase 3 remain separate gates. Sources and game hashes must be checked again immediately before an approved deployment; drift blocks the attempt.

## Verified API and one-shot implementation

I inspected authentic SDK metadata, including `World.TraceLine(Vector3, Vector3, TraceFlags, Entity[])`, `Entity.ForwardVector`, `HitResult.Hit/HitPosition/HitNormal/HitEntity`, and `GameFiber.StartNew`. The SDK defines **`TraceFlags.IntersectWorld = 1`**; this is not a guessed Cfx flag substitution. The adapter compiles against that pinned SDK. Compilation does not demonstrate target-runtime behaviour.

[Framework-neutral contract](../src/acoustics/observation/GeometryObservation.cs), [separate RPH adapter](../src/acoustics/observation/GeometryObserver.Rph.cs), [build command](../tools/Build-GeometryObserver.ps1).

The new `RichAudio.Geometry.Rph.dll` embeds its neutral contract and has no dependency on the telemetry core, source synthesiser, renderer or audio endpoint. Exact executable name/version and RPH version are checked before readiness. Its explicit private configuration requires Story Mode only and an unused evidence path outside the game. It does not autoload telemetry or issue a trace on plugin initialisation.

`RichAudioGeometryObserve` consumes an atomic latch, then schedules one game fiber. Before any trace, it creates a private reservation with `CreateNew`. The same configuration cannot be reloaded to repeat the query. A reservation/write/mode/setup failure consumes the attempt; no retry is issued. The result is one closed JSON record. The observer disables after success, miss or exception; its main fiber only sleeps until unload or a ten-minute lifetime expiry. That lifetime wait is not a scanner. A failed attempt must not be reset by deleting its reservation.

The current offline mode guards are reused: paused or network-session state, unavailable permission checks, invalid player pose, a player in a vehicle or speed above 0.25 native units/s reject setup. No player/camera/entity state is changed.

### Predetermined query

- On foot and stationary, facing a visually simple exterior wall about 2–5 native units away, with no door, water, moving object or decorative ambiguity.
- Origin is the observed player position plus **1.0 native Z unit**. This is an explicit offset, not a claim to measure physical eye height.
- Endpoint is **8 native units** along the horizontal projection of the observed player forward vector, at the same Z. Invalid/near-vertical forward vectors fail closed.
- One `World.TraceLine` call, world-only flags, with the observed player entity explicitly ignored.
- No hardcoded world coordinates, alternate rays, native shape-test framework, loops, spawning, teleporting, camera movement, collision mutation or audio operations.

The trace inputs are captured once at the console trigger. A world-only hit and wall-like normal are not sufficient to name a building or prove static permanence; supervised visual/setup confirmation remains required. A miss, ground-like normal, unexpected entity or ambiguous target is documented without another query.

## Result contract and validation

The private record carries schema/session/build, UTC and plugin-monotonic timing, exact origin/endpoint, maximum distance, named/numeric filter, ignored player handle, attempted call count, completion/error, nullable position/normal/entity fields and explicit field status. Fields not acquired are null/unavailable rather than default zero observations. RPH exposes no public material getter in the inspected `HitResult`; material and extent remain unavailable.

Validation separates protocol consistency from a usable hit. A valid miss has no surface; incomplete/errors fail closed. Finite coordinates and nonzero segment length are required. On-segment projection and perpendicular residual are tested using a fixed tolerance of `16 × 2^-23 × max(1, |query coordinate components|)`, in native units. This is a conservative single-precision arithmetic screen, not an empirically calibrated collision error or proof of metre scale.

Normal length must be nonzero and within **0.01 of unity**. That is a declared plausibility screen, not a vendor accuracy guarantee. The measured normal/ray dot and sign are retained; no outward/inward convention is assumed or flipped. `abs(unitNormal.Z)≤0.2` and `abs(dot(unitNormal,unitRay))≥0.5` are labelled setup classifiers for a vertical, nongrazing wall target, not proof that the correct architecture was identified. Thresholds are fixed before observation and are not widened after a failure.

A returned handle is session-scoped and unclassified. A null handle does not imply permanent static world geometry. Missing or invalid entity information stays explicit. Freshness requires the same session/build and a bounded shared monotonic time context; offline file inspection cannot declare an old record fresh for a live cache.

### Integration without inventing geometry

For a geometrically valid hit, `ObservationRules.Retain` creates a **point-normal-only** research observation with original source provenance/time and `gta-native-units-unverified` coordinates. Width, height and acoustic reflectance remain null; static classification is unverified and material unknown.

It is deliberately not converted into an ACOUSTICS-01 rectangular surface or a complete acoustic tile. A single trace cannot establish finite extents, openings, roughness, scale, all axes/handedness, global placement or a verified reflection path. Keeping this unresolved observation separate preserves the existing tile's confidence contract. No actual GTA reflection, echo or sound can be claimed from this task.

## Proposed deployment and restoration — approval required

The private sealed plan contains **27 final additions**. The prior 23 common RPH files, official alternative loader and DirectStorageFix are retained; the two temporary telemetry paths are replaced in the plan by `Plugins/RichAudio.Geometry.Rph.dll` and its private configuration. No existing game/user file is overwritten, and no telemetry plugin runs. This is an explicitly revised observer-only manifest, not a claim that all prior 27 files are unchanged.

Prepared observer SHA: `EE30BB51FA99E65F2865F9903B42E250500A2EB45FD4DD1AC446353477A304EC`.
Private plan SHA: `CBF39037BFED9C0C0D362B12A1838042473AA6CD201C8D8FC687888CF9FFFA9C`.

The established temporary obsolete-executable rename, `CreateNew` copies, exact-hash checks and durable deployment/restoration journal procedure are retained with the revised list. The original public deployment helper/history is unchanged. The new private plan helper has explicit Verify/Begin/Restore actions; Begin refuses to mutate without a separate approval flag. Verify has passed without game writes. Sources, backup, original inventory, clear destinations and no runtime are rechecked immediately before mutation. Partial deployment remains journalled; restoration recovers the original executable name first and stops for review if an introduced file unexpectedly changed.

One RPH launch would use the previous `-forcesettings -log` procedure and the established offline Story Mode configuration, including the previously verified offline launch option. No guessed arguments, security changes or new dependency are proposed. Autoload remains disabled/checked during supervised settings, and the observer is manually loaded after the target is ready. I must stop if the correct Enhanced executable/build is not selected.

After the single result, unload the observer, quit normally with assistance if necessary, preserve raw evidence outside the installation, quarantine the exact temporary files and recognised generated logs/configuration, reverse the filename change and verify the saved 32/179/10 comparisons, signatures, directory set, absence of all temporary paths and processes. The known BOM-only generated code template is handled only under its existing exact fingerprint. Unexpected generated files or modified binaries are preserved and block a restoration PASS pending review; no recursive delete or force overwrite is used. Normal quit alone is not restoration evidence.

If the game hangs or fails, preserve available diagnostics and stop; no second launch or trace is authorised. Prefer normal shutdown and request assistance before disruptive recovery. No live test starts merely because preparation is complete.

## Offline tests and performance boundaries

[Synthetic C# tests](../tests/Test-GeometryObservation.cs) currently pass **73 assertions**: valid hit, valid miss, incomplete/error, nullable unavailable fields, finite positions/normals, query length/projection, zero/nonunit normals, no assumed normal sign, setup classification, session/build/coordinate mismatch, stale/cache limits, ambiguous entity, no fabricated material/extent, copied provenance, atomic competing claims, post-result shutdown, durable reservation/reload refusal and owned-fixture cleanup, plus JSON roundtrip. They use original synthetic vectors only; no SDK/game code runs.

The [offline test script](../tests/Test-GeometryObservation.ps1) builds only the framework-neutral core. Hosted CI needs no proprietary SDK. Authentic-SDK adapter compilation is a separate local build. The existing 40 acoustic-geometry tests remain unchanged. Other relevant repository regressions and preservation checks are run before presenting readiness; actual results are recorded in the completion checkpoint rather than inferred from compilation.

[Read-only result inspector](../tools/Inspect-GeometryObservation.ps1) independently deserialises and revalidates a private record. Its output omits session identifiers, coordinates and private paths. It was exercised with an original synthetic record, not GTA data.

At runtime `TraceDurationMs` measures the synchronous RPH call's combined dispatch/completion time; those components cannot be separated by this public wrapper. Conversion and validation times are measured separately, and `GC.GetTotalMemory(false)` is an approximate managed-heap snapshot, not per-observation allocation or total game memory. No live timing exists yet, no benchmark loop is proposed and no real-time/audio-thread claim follows from one measurement.

## Current checkpoint and live procedure

Completed progress stages are repository 10%, host/restoration preflight 20%, observer implementation/tests 20% once final checks are sealed: **50% readiness**, with live stages NOT TESTED. No live success or restoration claim is made. The next interaction is the explicit go-ahead required by my ACOUSTICS-02 brief.

After that approval, the agreed sequence is:

1. Keep GTA closed while the sealed temporary files are verified/deployed; launch RPH once and confirm Enhanced 1158.16/offline Story Mode.
2. Walk normally to a simple nearby exterior wall. Stop on foot, face it from about 2–5 units away, and confirm the target/setup. No teleporting or spawning.
3. Load `RichAudio.Geometry.Rph.dll` in the F4 console; verify READY without a trace.
4. Enter `RichAudioGeometryObserve` once. Verify the one result/reservation, field validity and consistency with the intended surface. Do not retry on miss/error.
5. Unload, quit normally, restore and independently verify the installation.

GitHub publication of final findings and hosted CI follow the live result and restoration, or an honestly documented blocked/pending outcome. Raw records, private session IDs, raw coordinates, screenshots and local runtime logs stay out of Git. No licence is chosen.

**Next milestone only if this observation succeeds:** separately authorised bounded multi-observation surface reconstruction, with enough evidence to infer a finite patch. That expansion is not part of ACOUSTICS-02 and has not begun.
