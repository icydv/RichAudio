# SoundMap window and private world context

SoundMap is a separate, dependency-free browser application served by the local
SoundMap service. `tools/Open-SoundMap.ps1` opens an Edge/Chrome application window
that can be moved to a second monitor. `-ServiceDescriptor` accepts the private
service descriptor; the authentication token is never placed in its URL. The page
also has a **Separate window** control. Closing, hiding, minimizing or pausing the
viewer does not stop the independent recorder or acoustic worker.

Start the local service with `node tools/soundmap/server.mjs`, then run
`pwsh -File tools/Open-SoundMap.ps1 -ServiceDescriptor .local/soundmap/service.json`.
These commands start the debugger only. They do not launch GTA or open an audio
endpoint. An authorised producer must separately use the same private descriptor.

## What is actually drawn

The canvas uses an orthographic 3D projection with adjustable yaw, elevation,
translation and zoom. Isometric and top-down controls, listener follow, and a
15/20/30/60 FPS selector are provided. Display animation is independent of the
20 Hz telemetry poll and never raises collision or DSP work. The default dark
Canvas and passive Story Mode camera feed are described in
[ACOUSTICS-08.3.2](ACOUSTICS_08_3_2_LISTENER_SOUNDMAP.md).
Drag orbits; Shift+drag pans; the wheel zooms.
The reference grid is explicitly labelled as a camera aid, not measured ground.

Every acoustic polygon comes from `soundMapGeometry.surfaces[].vertices`, with
finite support and any explicit openings preserved. Every line comes from
`soundMapFrame.paths[].vertices`, including the solver's retarded source emission
position, first/second-order contact points and listener arrival position.
`vertices: null` stays unavailable: the viewer does not connect current endpoints
to manufacture a candidate. The listener position, forward and up vectors and
current source identities/positions come from the same worker frame.

Direct selected paths are teal; first and second reflections use orange and
violet; selected obstructed/transmission paths have a separate dashed red style.
Rejected candidates, pruned candidates and unknown/unavailable propagation remain
distinct. Paths without valid contact construction appear in the evidence list,
not as invented lines. The visibility assumption and rejection reason remain
visible. Sparse partial geometry never implies unobserved space is clear. No
physical wavefront simulation or decorative animated rays are claimed.

Positions are already in the acoustic engine's right-handed, Z-up model space.
The browser applies only a view projection. It never applies an independent GTA
coordinate conversion. The original origin, axes and declared scale are retained
in telemetry; GTA physical scale remains unverified. Tests compare the projection
of a nontrivial origin/rotated/scaled position against the engine's `modelPoint`.

## Freshness and performance bounds

The browser allows one frame request at a time and omits unchanged geometry using
its generation key. Geometry is compiled once per immutable generation and at
most four generations remain cached. A listener session or worker stream change
clears the cache, including a worker restart that resets sequence/audio-frame
counters while retaining the listener session. Earlier schema-1 recordings without
a stream ID retain session-scoped compatibility. Visual
path/source/surface counts and private context geometry have hard bounds.
Requests and rendering stop while the page is hidden; status polling continues
so an active recording remains visible on return. Pause view stops frame polling.
Even camera interaction repainting is capped by the configured 15–30 FPS rate.

The viewer reports client sequence gaps, transport drops, omitted paths and paint
time separately from worker timing. These are visual losses, not invented audio
losses. Initial attachment and reconnect include the greater of server frame age
and same-host production UTC age, plus the full request duration conservatively.
Repeated cached sequences never renew their age. This prevents an old lease from
becoming fresh merely because the window just opened. Geometry leases compare
against the original geometry clock and advance only for live evidence. Stale,
disconnected and expired evidence is labelled and dimmed; original frames are
not changed. Historical replay always keeps its historical label. When the replay
cursor falls between retained frames, the viewer reports the held sample's age
and evaluates its original geometry lease at that cursor time. It does not
interpolate missing listener motion, source motion or paths. Pausing the cursor
does not age historical evidence with the browser's wall clock.

## Recording and replay controls

Start/Stop Recording invokes the standalone service with explicit duration and
storage limits (UI defaults: 120 seconds, 64 MiB; maximum 600 seconds, 256 MiB).
Stop can show a pending flush state. The recording selector opens a private local
bundle. Pause/resume, timeline scrubbing and event buttons select corresponding
original solver frames. The displayed observation and geometry clocks retain
their original values. No failure event, expired lease or absent path is repaired.

Visual replay opens without playing audio. A separate **Load owned PCM** button
is enabled only for contiguous owned PCM with a recorded clock anchor. It loads
the preserved float WAV into native audio controls without autoplay; playback
requires an explicit press of the audio Play control. When audio plays, the
timeline follows the original engine audio-frame clock anchored to the first
recorded producer frame. If only a UTC/QPC anchor is available, the UI explicitly
labels that alignment approximate. Wall-clock event alignment remains approximate
in either case; neither is a measurement of speaker presentation time.
Original submitted/consumed frame lineage remains
in the recording bundle. Gap-containing recordings retain their original indexed
PCM and disable the reconstructed WAV path. Offline implementation checks do not
press audio Play or access a real endpoint.

## Read-only local world feasibility

The existing local CodeWalker dev46 installation contains `CodeWalker.Core.dll`
and its README describes YBN Bounds and YMAP/YTYP placement relationships. The
repository's `tools/Inspect-GameAudio.ps1` already performs explicit read-only
YBN parsing and records composite child transforms. Historical
`evidence/geometry-summary.json` records a successfully parsed composite YBN with
six collision children. These establish parser availability and a prior parse;
they do **not** establish a complete or correctly placed Enhanced world model.

The current inspector exports counts, not a validated low-detail world mesh. A
usable static extractor would still have to resolve composite child transforms,
effective placement/resource overrides, local build/interior compatibility,
finite simplification errors and streaming identity. CodeWalker was not launched,
no assembly was executed, no new archives were scanned or extracted, and no game
files were written for this investigation. The existing `.ratile` cache is a
small bounded store of historical inferred patches, not a full-building or
full-city model; its coverage and installation compatibility remain uncertain.

Accordingly SoundMap supports the feasible presentation boundary now: a bounded
private simplified-mesh JSON import with explicit provenance and exact acoustic
calibration, while leaving new genuine world extraction unimplemented. The file
is read in the browser only, with no upload, automatic discovery, collision query
or acoustic-engine admission. Up to 64 small tiles can be supplied; only the
nearest eight within 80 model metres are rendered. This is bounded tile culling,
not a claim of city-scale disk streaming or verified GTA mesh extraction.

The import schema is:

```json
{
  "schemaVersion": 1,
  "kind": "richaudio-visual-context",
  "coordinateSpace": "research-rh-z-up-metres-v1",
  "calibration": {
    "originNative": [0, 0, 0],
    "axes": [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    "metresPerNativeUnit": 1,
    "basis": "declared-demonstration-scale",
    "reference": "must-match-the-current-engine-contract",
    "physicalCalibration": "unverified"
  },
  "knowledge": "historical",
  "acousticUse": false,
  "provenance": {"kind": "private-simplified-collision", "reference": "local-reviewed-export-id"},
  "tiles": [{
    "id": "local-context-tile",
    "bounds": {"min": [0, 0, -1], "max": [4, 4, 1]},
    "vertices": [[0, 0, 0], [4, 0, 0], [4, 4, 0], [0, 4, 0]],
    "faces": [[0, 1, 2, 3]]
  }]
}
```

Those numbers illustrate the schema; they are not GTA measurements. All imported
vertices must already use the exact engine model calibration. Mismatched or
unavailable calibration hides the context. The schema enforces a 4 MiB file cap,
64 tiles, 8,192 aggregate vertices/faces, 512 vertices/faces per tile, finite
bounded coordinates, valid polygon indices and historical visual-only status.
The viewer shades context separately with dashed outlines and labels it
**historical visual-only context — never acoustic surfaces**. Matching calibration
is not installation compatibility proof: the data stays historical even when
visible. Keep real context exports and recordings under private `.local/` or
outside the repository; never redistribute game geometry or raw proprietary data.

## Validation boundary

`node --test tests/Test-SoundMapViewer.mjs` exercises solver vertex preservation,
strict budgets, immutable generation reuse, session isolation, cached-frame
attachment age, expiry, historical scrub behavior, mapped model coordinates,
visual-context provenance/calibration/culling and replay clock controls.
These checks are original synthetic data only. Seventeen focused viewer tests pass.
An actual CausalSimulation enclosure feed was verified in Chrome and an
independent Windows SoundMap window: six synthetic finite surfaces, 37 solver
candidates, direct/first/second-order paths, top-down/isometric changes, historical
visual playback and event scrubbing. UI Start/Stop produced a complete 13,413 ms
telemetry-only bundle with an explicit user-stop event and zero captured PCM.
The private screenshot is `.local/soundmap-viewer-replay.png`; it contains only
the original synthetic enclosure. Steady paint readings observed in the UI were
0.1–0.6 ms for this tiny scene (first paint 20.5 ms); these are individual canvas
paint readings, not a process-CPU benchmark or a live-performance guarantee.
The fixture service and test windows were closed after verification. No audio
load/play control or real endpoint was exercised. Native GTA synchronization, second-monitor behavior
during GTA, audible replay and in-game performance still require the separately
scoped supervised test.
