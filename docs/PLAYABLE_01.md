# PLAYABLE-01 validation candidate

Follow-up: [PLAYABLE-02 provider investigation](PLAYABLE_02.md) identifies a
sourced base-game revolution-ratio candidate and adds measured PCM stages.
Authorised measurement found that installed RPH cannot resolve that candidate;
live acceptance remains blocked on a trustworthy operating-state provider.

Implemented from `36de226` on `feature/playable-01`. **Live acceptance is
blocked.** The 2026-10-31 Story Mode test proved automatic plugin/host startup,
F10 controls, persistence and endpoint operation, but produced no vehicle audio.
The actual RPH getter returned `50` for the Bati's engine-revolution ratio;
its documented contract is 0..1. Invalid evidence is rejected. The installed
configuration has been returned to GTA stock fallback.

This is an experimental additive integration candidate, not a completed
replacement or a usable-vehicle-playback claim. Sanitised actual live results
are in [playable-01-live.json](../evidence/playable-01-live.json).

The product RPH entry waits for playable offline Story Mode, loads the pinned
private installation, captures camera and eligible vehicles and automatically
starts its owned host. The real secured pipe, recorded source loader, causal
worker, RA07 decoder and native PCM ring are connected. Product operation has
no listening-session duration cap; historical supervised routes retain theirs.
No terminal, browser, listening operator or host command is part of gameplay.
The final WASAPI sink was opened during the approved first live launch.

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
  is stationary but a source moves. An explicit QPC observation anchor preserves
  source/listener timing despite producer-credit jitter. Forecast remains
  bounded to 50 ms; the legacy listener policy is unchanged.
- Pause preserves recorded phase without advancing it. Unknown, stale,
  destroyed, streamed-out or reused identities retire. Scene changes preserve
  renderer-owned source arrays. Invalid listener evidence silences output.
- Kernel jobs own host/Node/helper descendants. Graceful normal shutdown fades
  output before disposal; stop status follows actual process cleanup. Fault
  retries back off, with three faults in ten minutes exhausting recovery.
  The real-chain fixture exercises one forced host failure/recovery; the
  exhaustion threshold and RPH app-domain unload still need live validation.

The product build now contains exactly one RPH `Main`/`OnUnload` convention
pair; a compiled-metadata check guards against accidentally shipping the
legacy bridge entry as well. Startup contains one supported `LoadPlugin`
command. Reviewed upgrades preserve the existing ASI loader, user settings,
unrelated startup commands and original uninstall backups.

The shared native ring reserves eight blocks (85.33 ms) for gameplay. This
adds 42.67 ms to the rejected four-block reserve, independently of the 100 ms
observation delay and device buffering. Deterministic exact-PCM tests reproduce
the old reserve starving and exercise 480/960-frame device callbacks crossing
512-frame producer boundaries. Both device and fixture stop on any underrun.
Healthy host operation survives observation gaps; stale evidence still silences
and retires sources after the existing freshness bounds. A >6-second gap test
checks actual output energy stops, the host stays alive and genuine feed resumes.
The test first reproduced a process crash from disposing an asynchronous pipe
event before pending I/O completed. Reads/writes/acknowledgements now use a
completion-owned gate with the same deadlines. Real stalled/partial pipes are
regression cases; deadlines and malformed-frame rejection remain enforced.

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

The opening key is now a saved preference: F6, F7, F9, F10 or F11, with F10
as the default. Select **Open menu key**, then **Apply changes**. Unsupported
bindings fall back to F10; console, Escape and screenshot keys are not offered.
The overlay uses a 220 ms eased slide/fade and a stationary background dimmer.
It remains native in-game drawing with GTA's own cursor. Controls are suppressed
each frame during opening, interaction and closing, including release of the
closing gesture. Hit regions follow the presentation transform; actions are
accepted when fully open. Changing a binding while either key is held cannot
retoggle the menu. A deliberate stock fallback has a clear non-error heading;
stale status and actual failures retain their diagnostic messages.
Fresh key edges can reverse an animation without an extra debounce delay;
held keys still do not repeat. Hidden input polling follows the game frame.
While focused, the menu resets the documented
[idle camera timer](https://raw.githubusercontent.com/citizenfx/natives/master/CAM/InvalidateIdleCam.md)
and [vehicle idle timer](https://raw.githubusercontent.com/citizenfx/natives/master/CAM/InvalidateVehicleIdleCam.md)
once per second. It does not install a camera override or pause game time.

The menu-only Story Mode check verified native pointer selection, saving F6,
closing/reopening with F6 and restoring F10, with stock fallback throughout
and no RichAudio host/endpoint. Final rapid-key and idle-timer corrections
follow that check and are validated by focused tests/SDK compilation; their
final in-game feel remains for human review.
Focused menu and package evidence is recorded in
[playable-01-menu.json](../evidence/playable-01-menu.json). The final private
package is installed with F10 and GTA stock fallback selected. All 132 payload
digests and the ZIP manifest were checked. The host, worker and recorded assets
are identical to the 66-check component test; final changes affect the menu
plugin and one-time setup only. No game or owned audio process remains running.

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
The actual RPH package readme documents `startup.rphs`; its automatic command
execution and Enhanced build detection were verified in the live test. This
does not establish that all RPH vehicle getters work on this game build.

Original evidence is preserved in `evidence/playable-01.json`. The updated
66-check result and focused regressions are in
[playable-01-reliability.json](../evidence/playable-01-reliability.json).
The real-chain fixture injects
game observations and substitutes only the final device sink. It exercises
automatic Story-ready startup, real dual-context source playback, retirement,
pause/resume, volume persistence, disable/re-enable, forced host failure and
cleanup. It does not claim actual GTA getters, endpoint or human listening.
The finite geometry test uses labelled independent analytical collision samples.

The user authorised the first candidate installation/launch/endpoint test.
RichAudio auto-loaded and the host started without host/listener commands.
F10 was opened/closed/reopened; volume and SoundMap preferences were saved and
acknowledged. A real Bati was spawned only to set up the vehicle test. An
independent RPH expression confirmed its exact model and the invalid ratio.
The sustained final host consumed 18,566,976 frames (386.8 seconds), with zero
underruns, errors, clipped/limited samples or output energy. These are SILENT
endpoint results, not proof of loaded-source performance or perceptual quality.
Two earlier restarts occurred during observation gaps; their precise terminal
causes were not retained by that build. The revised host retains failure detail
and separately tests long gaps without relaxing PCM deadlines.

Stock fallback was selected through F10 before normal game exit. No owned host,
Node or GPU process remained. Exit with actively sounding sources, moving-source
listening, real reflections and loaded CPU/GPU budgets remain unvalidated.

The documented [RPH ratio getter](https://docs.ragepluginhook.net/html/P_Rage_Vehicle_EngineRevolutionsRatio.htm)
is an older reference and does not establish current percent semantics for
`50`; dividing by 100 is not a fix.
An outdated getter offset is a possible explanation, not a proven diagnosis.
FiveM's `GET_VEHICLE_CURRENT_RPM` is a CFX extension, not an available vanilla
GTA native. A supported current-build operating-state provider is required.
No raw memory reader, native suppression or fabricated RPM was introduced.

Remaining normal-gameplay blockers: valid live operating-point telemetry,
native double-playback elimination, actual city geometry integration, wider NPC
coverage and loaded performance/listening approval. Source assets are verified
only for Bati NPC and nine exact player model mappings, not all GTA traffic.
Do not call the product playable until a real eligible vehicle emits correctly
without operator intervention and the remaining acceptance tests succeed.
