# PLAYABLE-01 validation candidate

Implemented from `36de226` on `feature/playable-01`. This is a self-starting
**experimental additive candidate**, with human/gameplay acceptance pending.
It is not a completed native replacement or a production-readiness claim.

The product RPH entry waits for playable offline Story Mode, loads the pinned
private installation, captures camera and eligible vehicles and automatically
starts its owned host. The real secured pipe, recorded source loader, causal
worker, RA07 decoder and native PCM ring are connected. Product operation has
no listening-session duration cap; historical supervised routes retain theirs.
No terminal, browser, listening operator or host command is part of gameplay.
The final WASAPI sink requires the separately approved first live launch.

## Integration and ownership

- Selectively incorporated PR #73 at `84e6df0`: continuous path-rate and
  direction presentation, camera basis interpolation and owned-host cleanup.
  Retained existing pressure gains and explicit higher-order finite wall paths.
- Reviewed PR #75 at `4b520f2`: retained its bounded observation/transport
  principles rather than substituting its one-car generated source protocol
  for the verified recorded player/NPC source families. Neither PR was merged.
- Existing recorded-source/grain code and original PCM are unchanged. Player
  six-state and Bati NPC four-state source contracts remain independent.
- Local-driver vehicle gets player context; other vehicles require exact NPC
  mappings. Handles, opaque public entity address identity, model, context and
  generation govern ownership. Addresses are never dereferenced or patched.
- Four tracked candidates, two active vehicles/four independent emitters.
  Native peak, distance, running state and existing-voice stability determine
  priority. Separate original PCM histories belong to each slot generation.
- Source state uses the observed engine revolution ratio. Lift is inferred
  from a falling ratio; throttle, gear, crankshaft RPM and Rockstar's native
  scheduling semantics are not established. Emitter offsets are authored.
- Fixed 100 ms common observation delay avoids relabelling time when a camera
  is stationary but a source moves. Forecast remains bounded to 50 ms.
- Pause preserves recorded phase without advancing it. Unknown, stale,
  destroyed, streamed-out or reused identities retire. Scene changes preserve
  renderer-owned source arrays. Invalid listener evidence silences output.
- Kernel jobs own host/Node/helper descendants. Graceful normal shutdown fades
  output before disposal; stop status follows actual process cleanup. Fault
  retries back off, with three faults in ten minutes exhausting recovery.
  The real-chain fixture exercises one forced host failure/recovery; the
  exhaustion threshold and RPH app-domain unload still need live validation.

## Sound, geometry and native audio

The approved engine/exhaust pressure factors `.25`/`2.5` remain intact: 10x
exhaust with the required common `.25` trim. A separate fixed fleet headroom
allowance changes the product master from `.7` to `.175`. This is static
attenuation, not compression, limiting, per-vehicle normalisation or a new
sound calibration. It must be assessed during listening. Conservative summed
path bounds can omit weaker returns rather than clip; omission is reported.

Distance presentation and causal Doppler remain in the existing solver.
Fresh qualified observed geometry can add finite first/second-order returns
without clearing source histories; existing higher-order support is retained.
The candidate contains **no qualified installed collision world**. It defaults
to conditional direct sound, with unobserved space explicitly assumed clear.
Its qualified geometry lease input is not an automatic city geometry provider;
live acquisition, qualified material mapping and city coverage remain unfinished.
No tunnel preset or speculative late reverb is supplied.

Selective engine/exhaust suppression has not been established. The available
[vehicle audio-name override](https://raw.githubusercontent.com/citizenfx/natives/master/AUDIO/ForceUseAudioGameObject.md)
does not establish an engine-only mute with proven restoration, and
[SET_VEHICLE_SILENT](https://raw.githubusercontent.com/citizenfx/natives/master/VEHICLE/SetVehicleSilent.md)
does not provide the required verified engine-only contract. No such native is
called. GTA engines remain independently audible; horns, tyres, collisions and
unsupported vehicles are untouched. Safe defaults choose stock fallback.

F10 persists enabled state, volume, quality, acceleration, integration mode,
SoundMap visibility and diagnostics. SoundMap is optional and job-owned;
gameplay PCM recording is explicitly unavailable in this candidate.
No unresolved Lectro/X80 source stepping is claimed fixed by integration.

## Preparation, installation and validation

Build with `Build-BeaconBridge.ps1 -Playable`, `Build-AcousticsHost.ps1` and
`Build-AcousticGpu.ps1`. `Prepare-Playable01.mjs --inputs <private JSON>` takes
`output`, `gameExecutable`, `playerManifest`, `npcManifest`, `atlas`, `profiles`,
`catalog`, `node`, `nodeLicense` and `rphPackage`. It verifies and reuses the
already decoded private cache; it does not rescan DLC or decode archives.
Output must be a new repository `.local` folder. No build/setup writes happen
on each launch. Launch verifies immutable payloads and the game executable.

The prepared local folder contains compiled plugin/host/GPU helper, Node with
its upstream license, recorded assets and metadata, Setup/Uninstall commands
and a bound manifest. **Do not publish the private folder or ZIP.** Public Git
contains source, tests and sanitised evidence only. RPH is not bundled.

Setup validates actual GTA `1.0.1158.16` and authentic RPH
`1.132.1428.17748`, then installs a versioned LocalAppData cache, plugin/menu
pointers and a backed-up `startup.rphs` entry. If RPH is absent, setup requests
the user's separately obtained authentic package and verifies its inventory.
It refuses conflicting loader dependencies. It never launches GTA. Uninstall
restores originals only if installed files still match the ownership receipt.
The actual RPH package readme documents `startup.rphs`; its command execution
and current RPH/game runtime compatibility remain live-unverified.

Focused evidence: `evidence/playable-01.json`. The real-chain fixture injects
game observations and substitutes only the final device sink. It exercises
automatic Story-ready startup, real dual-context source playback, retirement,
pause/resume, volume persistence, disable/re-enable, forced host failure and
cleanup. It does not claim actual GTA getters, endpoint or human listening.
The finite geometry test uses labelled independent analytical collision samples.

Before installation, launch or endpoint access, obtain explicit approval for
the concrete private candidate. First test: one RPH launch, load Story Mode,
verify automatic playback without console commands, inspect F10, approach a
Bati, rotate camera, drive a supported vehicle, pause/resume, disable/re-enable,
exit and check owned processes are gone. Stop for loader/version warnings or
unstable output; retain stock fallback. No acceptance is inferred from builds.

Remaining normal-gameplay blockers: supervised RPH/startup/getter/device proof,
native double-playback elimination, actual city geometry integration, wider NPC
coverage and sustained performance/listening approval. The candidate verifies
only Bati NPC and nine exact player model mappings, not all GTA traffic.
