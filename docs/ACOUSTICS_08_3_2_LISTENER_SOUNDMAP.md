# ACOUSTICS-08.3.2 — listener startup and passive SoundMap

Candidate 05 reached Story Mode, bridge READY and the gold F10 settings overlay. Preferences loaded, Apply persisted Balanced/Auto and Back closed the menu. Its first listener frame failed freshness before emission began. Its owned recording contains only 0.46 seconds of silent PCM; it does not demonstrate audibility, movement, GPU processing or reflections. That closed attempt and its independently verified restoration remain preserved.

## What the retained timing establishes

The receiver measured the original first observation at **258.520 ms**, outside the unchanged **[-2, 250] ms** window. Its first header wait was 237.6238 ms, payload read 0.0375 ms and decoding 14.6053 ms. The QPC frequency agreed. No listener callback ran, so no first-frame host-to-producer control queue delay exists. Header wait is not synonymous with packet age and must not be added to unrelated elapsed counters.

Candidate 05 did not retain sender mailbox, pre-encode, encoding, pre-write, write or acknowledgement timings. Those missing measurements prevent attribution of the excess 8.52 ms to a particular sender stage or scheduler. The proven protocol defect was a startup time-of-check/time-of-use gap: a sender-side fresh observation could age past the receiver limit during transfer, scheduling and cold decoding, and that first stale observation terminated the only connection. A real named-pipe/publisher fixture reproduces that gap by delaying receiver decoding; it is evidence for the bounded correction, not proof of the exact historical scheduling cause.

The strict receiver now discards up to **four** otherwise valid stale startup observations during the first **1,000 ms after connection**. Explicit acknowledgement 2 means discarded, never accepted. It awaits the next original observation on that same connection. The original timestamp is never changed, and only a fresh observation reaches the renderer. The first accepted observation permanently closes this exception. Malformed, future, duplicate/reordered, wrong identity/clock/generation and actual transport faults remain terminal. First-wire and first-accepted timings are separate. Diagnostics now include sender mailbox age, receiver payload-completion age and startup discard counts. Sender terminal timings are retained separately from host control-queue timings.

## Proven disposal fault and terminal evidence

The control writer wrapped `Process.StandardInput.BaseStream` in a second owning `StreamWriter`. Disposing it closed the underlying file. The later `child.StandardInput.Close()` flushed that closed file and threw the exact .NET Framework `ObjectDisposedException: Cannot access a closed file.` before native result publication. The native reproduction retains the matching `FileStream.Flush → StreamWriter.Dispose → Close` stack.

The UTF-8 wrapper now leaves the stream open. Shutdown mutes owned output, stops and joins listener work, joins the control writer before the sole owning writer closes input, and retains resources if a thread has not stopped. Geometry relay disposal waits for both listener and diagnostic callbacks; an unjoined callback explicitly defers disposal rather than accessing a disposed target. Individual cleanup failures are recorded without replacing the first failure. Terminal publication runs after controlled failures and has a fallback result path when summary assembly fails; a filesystem failure remains a reported limitation. Six actual host/producer/pipe fixtures exercise future rejection, unexpected EOF, deliberate stop, secondary shutdown failure, diagnostic-file failure and a blocked listener callback without starting WASAPI.

Recording receives explicit host-terminal-failure and unconfirmed-tail gap evidence. Captured prefixes remain intact; failed sessions cannot become seamless successful recordings. This corrects future evidence handling and does not rewrite Candidate 05's historical manifest.

## Passive Story Mode camera feed

The exact-build-guarded RPH plugin runs an independent read-only camera fiber. It recognises a playable offline Story session, reuses the original camera getters and native Z-up basis, and samples at a configured **1–20 Hz**. A shared 25 ms getter cache reduces repeated camera getter work during an acoustic session. Observation QPC/UTC times describe the original getter interval. Paused, loading, disconnected or old observations are unavailable; the passive lease is **500 ms** and never renewed by polling cached state. It performs no collision queries, audio calls or source emission.

A single latest-value background mailbox transports camera poses to the existing capability-protected loopback service. Its distinct `passive-listener` identity and native/unverified scale never reset solver sessions, geometry caches or recording clocks. New passive identities can replace only an expired passive lease. Fresh acoustic solver evidence is authoritative; after it expires, the viewer returns to native passive tracking and suppresses incompatible paths/context. No path interpolation or second acoustic engine is added.

The optional strict `soundMap` sidecar object contains `enabled`, `autoStartService`, `openWindow`, `sampleHz`, `port` and an explicit fixed-local `nodeExecutable`. Existing five-field menu sidecars remain valid with passive mode disabled. Example:

```json
"soundMap": {
  "enabled": true, "autoStartService": true, "openWindow": true,
  "sampleHz": 20, "port": 17833, "nodeExecutable": "C:\\Program Files\\nodejs\\node.exe"
}
```

Service/window startup waits for Story readiness. One owned service launch is permitted; transport may refresh its descriptor at most once per second after disconnection, without respawning services. Requests reject redirects and use bounded background timeouts. A dedicated per-owner Chromium profile prevents handoff to another window. Shutdown targets only the owned process/window; capability plus owner identity is required for service stop. A reused external service is left running. `RichAudioSoundMapStatus` reports safe classifications; private passive lifecycle evidence is written on disposal. Process-exit interruption can still prevent normal cleanup, so independent restoration checks also require the selected service/window to be absent.

## Readable evidence at independent display rates

Canvas and panels default to **#0A0E14**, dark shaded faces and bright **2.2 CSS pixel** outlines. Selected paths use stronger **3.2 pixel** strokes; listener/source markers, direct/first/second-order paths, rejected/unknown candidates and historical evidence are distinct. Device pixel scaling preserves CSS-pixel line widths.

Display selection is **15 / 20 / 30 / 60 FPS**, scheduled by animation frames. The HUD measures actual rendered FPS separately from incoming telemetry rate and original age. Network polling remains bounded independently at 20 Hz. Collision sampling, acoustic work and DSP do not increase when selecting 60. Original solver vertices are held between observations; visual frames do not invent acoustic results. Real browser screenshots and measured rates are retained privately and reported with their viewport/DPR/environment limitations. Browser rendering tests do not establish GTA performance.

Only genuine accepted finite wall/ground observations and actual solver paths are acoustic evidence. Without them the viewer shows a labelled reference grid. Imported private geometry remains historical visual-only context and requires exact calibration compatibility. This increment adds no city extraction or new local world-mesh investigation.

## Reproduction and next candidate

Run `pwsh -NoProfile -File tools/Test-Offline.ps1`. Focused entry points are `tools/Test-PassiveSoundMap.ps1`, `tools/Test-BeaconTransport.ps1`, `tools/Build-AcousticsHost.ps1 -Tests` and `node --test tests/Test-SoundMapViewer.mjs`. The local authentic pinned-SDK plugin build additionally passes the actual cached-assembly/deployed-sidecar layout fixture; CI uses the same shared components without redistributing that SDK.

The next review-only candidate preserves the reversible **27-file** installation, ten-minute loading allowance, gold F10 settings, Balanced/Auto, one original **600 Hz / 0.44 / guarded +12 dB / host 0.20** beacon, two existing bounded sensing sessions, stop near host +45 seconds and strict 60-second host maximum. Passive following must be observed before starting that host. It requires fresh exact-candidate authorization; no new GTA deployment, launch, endpoint, playback or capture belongs to this offline increment.

The combined milestone remains **60%**, not project completion. Attaching an original RichAudio engine sound to a real GTA vehicle remains the next major priority after this integration.
