# BENCHMARK-01: my start, finish and listener markers

27 October 2026. **Implemented, built against the pinned SDK and offline tested; NOT TESTED in GTA.** My requested setup is three explicit markers in the quiet airport section I choose. Combined ACOUSTICS-05 + BENCHMARK-01 progress remains **60%**. This is a marker-placement tool, not a motorcycle controller or a completed benchmark.

## The three commands

| Command | What I do | What is recorded |
|---|---|---|
| `RichAudioBenchStart` | Stop at my chosen start position | Actual player position and capture time |
| `RichAudioBenchFinish` | Stop at my chosen finish position | Actual player position and capture time |
| `RichAudioBenchListener` | Stand still on foot where I want to listen | Actual player position and capture time |

Start/finish may be marked while stationary on foot or in a vehicle. The listener must be on foot. Endpoints captured from a vehicle are the player/entity coordinates, not a measured road surface or wheel contact. No teleportation or automatic relocation is performed.

After both endpoints exist, the green start line and red finish line are drawn perpendicular to their horizontal chord. Each is eight **uncalibrated native units** wide. Before that, the single endpoint is a colored cross. The listener is a cyan cross and short vertical marker. At most five primitives are submitted, with a small presentation height offset; these are diagnostic lines and may float above the actual surface. No raycasts, terrain fitting or road-map reconstruction are used to make them look precise.

The endpoints define an intended chord, not a navigable/verified path. Lines do not certify width, clearance, streaming, safe spawn locations or AI driving. The snapshot always keeps `RouteCoverage: UNKNOWN`, `RouteClear: false` and `BenchmarkStartSupported: false`, even after all three markers are set. The existing synthetic-only benchmark route validator remains unchanged and cannot silently import these as a certified live route.

`RichAudioBenchShow` / `RichAudioBenchHide` present the saved markers; they do not acquire more observations. `RichAudioBenchStop` ends setup and drawing. There is no automatic start, reset, Bati creation, traffic suppression, idle-camera native, geometry acquisition or audio action.

## Bounded data and behavior

- Original `BenchmarkMarkers.cs` owns copied, framework-independent positions, timestamps, stationary/on-foot classifications and derived diagnostic lines. RPH entity objects never enter its snapshots.
- Three markers may be captured in any order. Explicit later commands replace a marker in memory and save a **new private revision**, preserving earlier accepted files. Invalid replacements leave previous markers intact. No file is overwritten.
- At most 32 accepted revisions, one queued capture at a time, 64 KiB per record and a 15-minute observer lifetime. No background acquisition is scheduled. World drawing uses a cached snapshot, and the text callback does not read game entities or call natives.
- Capture requires a valid exterior Story Mode player, stationary speed at most 0.25 native units/second, finite coordinates, monotonic capture times and matching player identity/counter during the read. Listener capture additionally requires on foot. These are research guards, not calibrated physical-error limits.
- Endpoint horizontal separation must be 5–5,000 native units. The coordinate bound reserves ten units inside the existing 200,000-unit numeric limit for presentation geometry. These bounded implementation limits do not establish road validity or real-world metres.
- The thin RPH adapter guards Enhanced **1.0.1158.16** and RPH **1.132.1428.17748**, copies the explicitly requested poses, writes to a fresh ignored `.local` directory outside GTA, and reuses the existing world-line/text technology. The authenticated local SDK is only a build dependency.
- Explicit accepted changes are persisted before display publication. Stop/unload/exception/timeout detach presentation; interrupted disk writes may leave an incomplete record and must not be represented as a verified save. Saved files contain private world positions and session context; they are never committed.

## Offline validation

**31 original C# assertions** cover capture order, copied input/output, derived line direction/width, different endpoint elevations, stationary/on-foot checks, finite coordinates and presentation margins, time ordering, unchanged markers after rejection, bounded revisions, terminal stop and the inability to promote markers into route clearance. **27 independent JS checks** read a C# synthetic fixture and check geometry/provenance, command registration and separation from traffic, acquisition-in-display, entity mutation and audio APIs. No Rockstar fixtures or SDK runtime execution are used.

The complete offline suite is registered to include these tests and passes, including the existing geometry/cache/traffic/telemetry regressions. The marker adapter compiles against the pinned authentic SDK. Numerical/compile success is not a live marker-placement or rendering result. Existing telemetry, RPM validation, source synthesis, traffic calibration and benchmark run gates are unchanged.

## Prepared candidate and proposed next test

The marker-only candidate has **27 temporary additions**: the same 25 runtime/loader/fix files, plus `RichAudio.Markers.Rph.dll` and its configuration. It replaces the Traffic observer pair in this new plan only. The restored current-installation baseline and all earlier packages/evidence remain intact. The private journal/rollback helper passed **read-only Verify**; Begin was not invoked, no new deployment journal exists and GTA/RPH remain closed.

Candidate manifest SHA-256: `CDF40A315F4080CB5D0AF1E4433A3B723F7A543B34CA83A04D30FB75BD84B52C`.
Observer SHA-256: `E4907A22478EF564F1B63A57E8FC0905AD40C9A3E865F3FA2FB1D888987D3998`.
Configuration SHA-256: `FBEC78462142C03F182FCC646A55E3EE6BE81B3E216EECB4CE3A440431B3E595`.

**One next proposed supervised test, requiring fresh approval:** after unchanged installation/package preflight, deploy only this marker candidate, use the validated temporary executable-selection rename and launch offline Story Mode once. I manually choose my quiet airport area before loading the observer. I mark start, finish and listener, inspect their colors/locations, optionally correct explicit placements within the revision cap, and verify hide/show plus private saved revisions. Stop, finalize/unload, quit normally and independently restore all temporary files, executable names/hashes/signatures and the existing 32-root / 179-archive-metadata / ten-sampled-hash baseline.

No motorcycle is spawned and no traffic, geometry or audio experiment is included in that placement test. A quiet airport location is my chosen candidate, not proof that every relevant vehicle is absent. Actual route interference and the camera behavior that shortened the previous calibration remain separate benchmark-readiness questions. The later Legion Square urban reference remains preserved.

My working test setup will use these three chosen points rather than another road-box alignment exercise. A later supported motorcycle controller must separately establish path suitability, source/rider ownership, effective interference handling, listener stability, actual streamed tracking and cleanup. It must not infer those capabilities from this marker tool.

## Publication and stopping boundary

Only original code, original synthetic tests and this design are public. Private marker coordinates, session IDs, runtime dependencies and raw captures remain ignored; no licence is selected. Applicable tests, publication screening, Git integrity, exact-head hosted CI and remote readback are reported with the focused stacked PR. No earlier PR is merged.

After completing this offline preparation, my tools ask for the next test approval in ordinary chat and end the turn. There is no question-box workflow, automatic launch, reminder, background wait or continued work while I am away. I will approve the next test when I return.
