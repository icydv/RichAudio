# ACOUSTICS-08.3 — SoundMap and private session recording

SoundMap is an independent Windows debugging window for the existing acoustic
engine. It displays the engine's selected direct and first/second-order paths,
their actual contact points and retarded source positions, plus rejected,
unknown and budget-pruned candidates. It does not run a second visual ray tracer.
The session recorder preserves acoustic state and the actual RichAudio-owned
post-gain samples submitted by the Windows host. Both are implemented and tested
offline. This increment has not been deployed or listened to in GTA.

## Run and control

```powershell
# Device-free viewer and offline replay service; does not start the audio host.
node tools/soundmap/server.mjs --root . --port 17833
./tools/Open-SoundMap.ps1 -ServiceDescriptor .local/soundmap/service.json
```

The service runs separately from GTA, the acoustic worker and the audio callback.
Open its loopback page or independent browser application window on either
monitor. Isometric orbit, pan, zoom, top-down mode, listener following and pause
view are available. Closing or hiding the view does not stop audio. The default
visual refresh is 20 FPS, adjustable within 15–30 FPS. No external scripts, fonts,
textures or network service is required.

The host's opt-in `--soundmap-config <private descriptor>` argument connects both
the producer and owned-output tap. Merely running the service starts no source,
publisher or endpoint. Start/Stop Recording is available in SoundMap and as the
fourth footer action in the existing F10 gold settings overlay. The overlay uses
one bounded background command worker; all HTTP and file work stays off the game
fiber and raw drawing callback. This remains a separate overlay, not a modified
GTA pause menu. Recorder controls are unavailable when the service is stale or
disconnected; Stop is bound to the observed recording identity.

The descriptor contains a fresh local capability. API requests require it and
strict loopback Host/Origin validation. It is not included in public logs or
recordings. Do not share the descriptor. Real host use still requires the fresh
supervised authorization described below.

## Geometry and coordinate evidence

Listener/source positions, basis, velocity and contact vertices use the existing
`research-rh-z-up-metres-v1` engine space and the same native origin, axes and
declared scale as `ObservedSimulationInput`. Physical scale and material spectra
remain declared assumptions. Solver paths begin at their original retarded
emission position; the moving source marker shows its current sampled pose.

Live geometry is only the finite support actually accepted from the existing
RPH publisher. That publisher can retain two observed wall/ground groups; their
original observation timestamps and one-second leases remain unchanged. Expiry,
invalid pose, disconnect and unknown space stay explicit. A displayed reference
grid is not measured ground. Absence of current geometry does not establish an
unobstructed path. Conditional clear-space assumptions are labelled.

Geometry is sent and cached by immutable generation. A fresh worker stream ID
also isolates restarts even if the original listener session ID is unchanged.
The viewer never renews a lease by receiving a cached frame. Historical replay
retains original timestamps and a prominent historical label.

The [world-context investigation](ACOUSTICS_08_3_SOUNDMAP_VIEWER.md) found the local
CodeWalker parser and prior YBN decoding evidence, but no validated common-world
placement/simplification pipeline. SoundMap supports bounded, privately imported
simplified meshes with exact calibration matching and nearby-tile culling. These
stay historical and visual-only; they never become acoustic surfaces. Automatic
city extraction, streamed GTA building models and complete-world coverage are
not implemented. No live collision-query budget was increased.

## Recording and replay contract

Bundles stay under `.local/soundmap/session-*`. Each contains:

| File | Preserved evidence |
|---|---|
| `manifest.json` | Version, scope, limits, termination, integrity hashes and PCM gap summary |
| `timeline.jsonl` | Original listener/source poses, solver paths, immutable geometry, observation leases, material assumptions, settings and CPU/GPU timings |
| `events.jsonl` | Recording and source controls, stream/session/generation changes, path changes, deadlines, missing history, transport and storage failures |
| `owned-output.f32le` | Original 48 kHz stereo Float32 owned output, after host gain/mute |
| `audio-index.jsonl` | Exact byte ranges, submitted/consumed source frame lineage, per-submission QPC and silence/underflow evidence |

The trace is explicitly sampled at the configured visual rate. It is not an
exhaustive every-solve log. Candidate totals, omitted paths, unsampled block
counts, deadline/missing-history aggregates and dropped frames/events expose
these limits. Frame payloads are capped at 256 KiB, immutable geometry at 512 KiB,
and displayed paths at 128 by default (maximum 256). Audio-selected paths have
priority over diagnostic candidates.

The host tap copies samples into 64 preallocated slots of at most 2,048 stereo
frames. It does no allocation, disk work, HTTP or waiting on the callback. The
background writer batches bounded uploads. A full queue drops capture data and
records the loss without delaying sound. Capture completion is published only
after the owned buffer submission succeeds. Stop waits in the background for an
already in-flight copy; incomplete tails and service outages remain gaps.

Default storage limits are 120 seconds and 64 MiB per recording, with supported
upper limits of 600 seconds/256 MiB, 128 recordings and 1 GiB total private bundle
storage. Limits terminate recording without deleting earlier evidence. Disk
write/flush failures, truncated files, stream changes and uncertain tails prevent
a complete/playable claim. Unexpected termination leaves evidence incomplete.
There is no microphone input, desktop capture, GTA mix recording or automatic
upload. Existing optional host loopback remains a separate explicit option and
is not selected by this candidate.

Offline replay opens a local bundle, verifies the evidence files, and reconstructs
visual state from the original engine sample frame numbers anchored to the owned
PCM's producer-frame lineage. HTTP arrival delay cannot shift those states. Raw
receipt time, publisher observation time and host QPC evidence remain separate.
Event alignment using host UTC/QPC is labelled approximate; it is not speaker
presentation time. Missing states are not interpolated or repaired. Stream changes
seal the previous recording instead of splicing timelines.

Pause/resume/scrub and event markers are available without GTA. Owned audio is
loaded only on an explicit user action. A WAV view is offered only when indexed
PCM is contiguous and complete; otherwise the original indexed PCM and failure
evidence remain available. No playback endpoint was used in this validation.
To share a session, copy that session directory into an archive after Stop and
review its coordinates/private gameplay data. Do not include `service.json`,
other sessions or proprietary context meshes; nothing is uploaded automatically.

## Validation and measured costs

The required `tools/Test-Offline.ps1` suite includes telemetry, viewer, recorder,
native output tap, real producer integration and in-game recorder control tests.
The actual native queue → HTTP → bundle fixture checks every recorded Float32
sample. The actual producer's PCM is unchanged with SoundMap enabled. A fixture
delays telemetry receipt by 900 ms and still replays its original frame at 100 ms.
Regression cases cover expiry, restarts, immutable geometry, slow consumers,
queue overflow, held callbacks, disk failure, incomplete tails and API isolation.

The [telemetry measurements](../evidence/acoustics-08-3-telemetry.json) show
approximately 0.094–0.107 ms added per solve in a short warmed original enclosure
fixture (40 Hz solves, 20 Hz visuals). The native 512-frame capture-copy fixture
observed approximately 0.43 microseconds per block, and the separate evidence
writer approximately 14 microseconds per block. These are component observations,
not live GTA timing guarantees.

`node tools/Measure-SoundMapPerformance.mjs .local/soundmap-performance-new`
performs paired actual worker/producer runs with CPU, GPU and Auto using Balanced
quality and an original demanding scene. The portable result is
[`acoustics-08-3-performance.json`](../evidence/acoustics-08-3-performance.json).
Each mode preserves identical PCM with recording/telemetry enabled; all three
backends also match each other. GPU claims require applied hardware results.
Auto can legitimately keep CPU output while performing calibration dispatches.
The report includes actual worker/DSP distributions, total Node/helper CPU and
over-period observations; short cold runs and coarse CPU counters do not justify
a universal overhead percentage or reliable live-deadline claim.

Browser inspection used the actual solver's original enclosure: six finite
surfaces and 37 candidate paths, including first/second-order contacts. Orbit,
top-down, recording controls, replay and event scrubbing were checked in a browser
and independent Windows window. Tiny-scene steady paint observations were
0.1–0.6 ms (first paint 20.5 ms). The local screenshot and fixture recordings
contain synthetic data only. No audibility, endpoint reliability or actual GTA
menu/controller/geometry behavior is established by these tests.

## One proposed supervised GTA test

The follow-up [bounded audition profile](ACOUSTICS_08_3_AUDITION_LEVEL.md) supersedes the initial untrimmed candidate below: fresh package `combined-083-review-04`, ten-minute loading allowance and explicitly guarded +12 dB trim. All other test limits remain unchanged. Exact bindings are presented separately for fresh approval.

The fresh private candidate is `.local/combined-083-review-01`. Its manifest binds
the staged application, current host/GPU helper, original-generated beacon,
combined RPH plugin, private model/preferences and `RichAudio.Menu.json`. It uses
the existing authentic runtime inventory, replaces its old plugin in the fresh
copy, and adds the menu sidecar: 27 introduced paths plus the existing temporary
`GTA5.exe` → `_GTA5.exe` preservation step. Original executables/backups and sealed
historical evidence remain unchanged. Source/runtime hashes and a candidate hash
are reviewed before approval. No old approval is accepted.

Existing filesystem-only installation/restoration helpers were adapted into that
private scope and tested against disposable directories, including interrupted
file creation/copy, journal collisions, modified-file preservation and independent
restoration checks. They contain no game launcher. The pending approval file and
real deployment journal do not exist. This preparation itself performs no game
write, launch or endpoint access.

One authorization would cover one Story Mode attempt with these phases:

1. Install only the exact reviewed scope and launch RPH once. Allow at most five
   minutes for loading; stop the attempt if Story Mode/READY is not established.
   No acoustic host or output endpoint starts during loading.
2. After stable on-foot Story Mode, open the separate F10 gold overlay and the
   SoundMap window. Start the reviewed host on the default output device with
   Balanced quality, Auto acceleration, one original 600 Hz harmonic beacon,
   source level 0.44 and host gain 0.20; no extra output trim or loopback.
3. Begin recording explicitly. Start the beacon once within 15 seconds of host
   startup. Exercise Performance/Balanced, CPU/Auto and a brief forced-GPU
   selection; verify measured applied work rather than treating the selector as
   GPU proof. Check menu Back, persistence and audio responsiveness.
4. Use at most the existing two bounded sensing sessions, each no longer than
   12 seconds/72 queries with unchanged stationary/on-foot guards. Check real
   listener following, accepted finite patches, actual valid reflections when
   available, expiry and matching owned PCM. Movement can invalidate geometry;
   that is evidence, not a reason to enlarge query budgets.
5. Request recording Stop and confirm finalization; stop sensing and the beacon
   at host+45 seconds. The reviewed host duration is 60 seconds. Preserve any
   failure without retrying, then close/unload and restore the installation.
   Run the independent verifier before declaring the attempt restored.

Max is excluded from the baseline. Stock sound remains untouched; there is no
stock replacement/suppression, new unsafe hook or GTA Online interaction. The
exact candidate and scope need one fresh explicit authorization before any live
action. A failed launch/listening/cleanup remains a failed or partial result.

## Immediate next vehicle milestone

Track one real vehicle and attach one original RichAudio engine source. Reuse
the existing telemetry adapter's handle/generation, position, velocity, basis and
lifecycle fields, and feed the existing `owned-sources` route so distance,
direction, Doppler and reflections process actual vehicle motion. Despawn and
handle reuse must end the previous source generation. Treat
`Vehicle.EngineRevolutionsRatio` as a measured normalized ratio only when its
validity evidence is available; it is not measured crankshaft RPM or engine load.
Unverified fields remain unavailable. This is the shortest next step to hearing
one moving GTA vehicle through RichAudio, before city geometry, higher-order
reverberation or Max optimization. Native duplication/suppression remains a
separate verified milestone.

Historical evidence is unchanged. The standing combined milestone remains 60%;
it is not an estimate of whole-project completion.
