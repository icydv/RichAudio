# One-car audio switch

## Playable powertrain replacement

This opt-in developer mode uses the qualified `RA_RC_QUIET` pack from 3c94d0f. In that listening session the driver recognized the private audible control, heard stock ADDER return, then heard “zero engine or exhaust sound” with the quiet control while gear clunks, tyres and horn remained audible. They heard the ADDER again after the final return. The final stock horn check was unreported.

The external renderer supplies a **Bati development voice on ADDER telemetry**. On the SHVDNE callback, `PowertrainFrames` reads the bound driver's ADDER and camera through `ShvdneGameSource` and `CameraListenerTracker`. The Enhanced public-native rev ratio (`0xF9DDA40BC293A61E`) drives the source operating point. It is a normalized ratio; physical crankshaft RPM and throttle-pedal position are not measured. The existing renderer infers lift from falling ratio and uses that signal for its acceleration/deceleration blend. Vehicle and listener pose, velocity, running state and timestamps keep their observed meaning. Missing, invalid or stale telemetry withholds playback.

`PowertrainLink` connects the existing gameplay publisher to the owned external acoustics host. The package admits just the ADDER/player identity and resolves the donor at the audio-bank boundary. `Run-Gameplay.mjs` uses the real stock gameplay renderer and the retained Bati engine/exhaust idle, acceleration and deceleration layers. Rendered PCM carries the source observation sequence through the existing RA07 pipe to the PCM ring. The host checks the observation lifetime and gain revision before submitting to WASAPI.

| Listener | Codex command through `Invoke-Switch.ps1` |
| --- | --- |
| Ready | `ReadyPowertrain -KnownStock` prepares the voice with output gain closed. Fresh observations, advancing nonzero source render blocks and corresponding output submissions must arrive before the script requests `RA_RC_QUIET` on the tagged car. Once the setter returns, the host opens gain for the new revision. |
| Mute RichAudio | `MutePowertrain` closes only RichAudio gain. Listen for GTA's gear, tyre and horn sounds. Tracking and rendering continue. |
| Bring RichAudio back | `ResumePowertrain` admits audio from the new voice revision at the current operating point. Neither gain command requests a GTA profile. |
| Put it back | `RestorePowertrain` withdraws playback, waits for a buffer-reset acknowledgement or confirmed host exit, and requests `ADDER` once on the original vehicle. Story Mode stays open for listening. |

Use `Status` for the replacement phase and reason. `Report -Text` retains the driver's words. A native return, source-backed PCM, and WASAPI submission are software evidence. The driver judges responsiveness, gaps and what comes from RichAudio during the mute comparison. If the host disappears or output progress expires after takeover, advancing SHVDNE callbacks handle withdrawal and the same-car stock return. Losing the target abandons the binding. An uncertain setter is never resent automatically. Recovery requires the surviving script and its validated target.

Keep GTA running and foreground during preparation. If preparation fails before the quiet call, inspect the reason and wait for that attempt's owned host to exit before a fresh “ready” on the same stock car. Pausing or stalling callbacks during playback can expire the 250 ms input lease. `PowertrainEvidenceDirectory` identifies the attempt's transport and host records. Use underflows, discarded/stale frames, submission age and maximum callback gap to diagnose audible dropouts. Submitted-observation age measures software chronology.

Build the switch and host from the same worktree, then stage an external private package in a fresh directory. `Prepare-PowertrainHost.ps1` verifies the retained SHVDNE source pins, copies the six Bati layers, and writes a manifest that binds the Windows host, Node worker, renderer code and assets.

```powershell
$switchTools = './tools/native-control/audio-switch'
& "$switchTools/Build.ps1"
& ./tools/Build-AcousticsHost.ps1
$package = & "$switchTools/Prepare-PowertrainHost.ps1" -OutputRoot "$PWD/.local/audio-switch/powertrain-session"
& ./tools/Test-PowertrainPlayback.ps1 -Manifest $package.manifest -OutputRoot "$PWD/.local/audio-switch/powertrain-session-test"
```

The playback fixture runs the real worker, pipe, external host, Node renderer and PCM ring against a device-free sink, using authored car observations and a recorded setter delegate. The source's rev input is still unverified through SHVDNE on a live 1.0.1158.16 ADDER. A running car must yield a finite positive ratio no greater than one. If it cannot, record the specific refusal and leave stock audio available.

For one authorized session reuse the two verified private overlay files and the existing one-car installation/rollback transaction. Include `RichAudio.Powertrain.json` from the chosen package as an additional temporary file under the game's `scripts`, with its original absence checked and its installed hash in the rollback ledger. The host package stays in its prepared location. Launch GTA normally once and wait for the user's controls. After normal closure, check that the session-owned host and producer have exited, retain the switch log and per-attempt transport/host evidence, and verify removal of the extra pointer along with the script, runtime and overlay. The private comparison and ordinary stock donors remain available in a separate switch session.

Run `Build.ps1` from PowerShell on the RichAudio development machine. It builds the SHVDNE script in `.local/audio-switch` and runs the offline checks against that DLL. Use the matching Enhanced SHVDNE runtime and verify fresh successful SDK initialization before issuing a command. Stock comparisons use just the script and runtime. The private comparison also uses the two-file OpenRPF overlay described below.

Drive a running stock ADDER with its original ADDER engine audio. The operator and listener must know the vehicle's audio history. The model check alone cannot establish that history. Listen to stock idle or revs for as long as you like, then say **ready**. Codex operates the following commands through `Invoke-Switch.ps1`.

| Command | Effect |
| --- | --- |
| `Status` | Read the current session, target, driving eligibility, foreground state and switch phase. |
| `Ready -KnownStock` | Bind the current target and request `VOLTIC` once. |
| `Ready -KnownStock -Donor RCBANDITO` | On “ready” in the quiet-profile session, request the stock RC Bandito profile once. |
| `Restore` | On “put it back”, request `ADDER` on the same still-driven, running and tagged car. |
| `Report -Text <words>` | Record the listener's words verbatim. Use the optional -Cue Engine, -Cue Exhaust or -Cue Horn for separate observations. |

The client returns the script's reply. A returned setter call records dispatch only. The listener judges the audible effect. If the client times out, inspect its printed session directory and command ID before taking another action. An uncertain apply permits a deliberate restore on the original marked car. An uncertain restore consumes that restore opportunity.

A refused command consumes no audio write. Address the displayed reason and give a new command in the same game session. Leaving the vehicle abandons its binding. An abandoned marked car cannot be adopted again as a known-stock baseline. The switch has no quit or launch command. Logs are under `%LOCALAPPDATA%\RichAudio\AudioSwitch\<session>\events.jsonl`.

## Stock donor and listening question

The retained Enhanced catalogue leaves the Voltic audio override blank. Its resolved identifier `voltic` hashes to the stock Dat151Vehicle root 0x9F4B77BE in update/update.rpf/x64/audio/config/game.dat151.rel. That root points to Dat151ElectricEngine 0x7F471776. Its Transmission reference 0x716FC17B resolves in sounds.dat54.rel through a parameter transform and multitrack to sample layers and modular synth 0x82925DF1.

In the completed one-car run at e75c468, each command returned once on the same running ADDER. After VOLTIC the listener said “it sounds like the coil voltic, it doesnt sound like an adder anymore”. After ADDER the listener said “yeah it sounds like an adder again, finished”. This establishes audible stock switching and return on that car.

## Quiet combustion candidate

Use stock ADDER → RCBANDITO → ADDER. The Enhanced catalogue resolves `rcbandito` to Dat151Vehicle 0xEEF345EC in `mpvinewood/dlc.rpf/x64/audio/dlcvinewood_game.dat151.rel`. Use this winning DLC root. The base REL also contains that vehicle hash with different powertrain references.

| Cue | Installed reference evidence and listening question |
| --- | --- |
| Engine | VehicleEngine 0x1C4FDA16 has empty EngineLow, EngineHigh and RevsOff references. The vehicle has no granular or electric-engine record. EngineIdleLoop 0xA127B227 resolves in the Arena War sound REL to the RCBANDITO bank, stream 0x0492DDBF. All 2,296 decoded PCM samples are zero. Listen for the sustained ADDER engine at idle and under ordinary throttle. |
| Exhaust | ExhaustIdleLoop, ExhaustLow and ExhaustHigh are zero. ExhaustPops points to `null_sound`. AirIntake 0xD5C913D1 resolves to RESIDENT/VEHICLES stream 0x1EF78904, all 1,339 decoded PCM samples zero. Listen separately for the exhaust note or rasp as load changes. |
| Horn | The vehicle's horn list 0x883A70CF contains one entry, `null_sound`. Try the physical horn once during the donor phase and report what you hear. |

These measurements describe the named source streams. Road, tyre, collision or ambient sounds may remain. Other references, including a non-empty wrapper at vehicle field Unk63, and runtime fallback leave residual sound possible. Listen for any whine that follows throttle. Check that driving still feels normal. After “put it back”, compare idle and throttle with baseline. If a cue is hard to separate or all the listener hears is a fade, retain those words.

The completed stock RC test at 558f98b displaced the familiar ADDER engine and exhaust on the same running car. The listener described the replacement as “quite loud, on par with the loudness of an engine” and reported “there is no horn”. After stock return they reported “I can hear adder noises again”. Horn recovery was untested in that run. The original cue-specific replies are retained in the session log.

## Private audible and quiet comparison

Start from a running, known-stock ADDER. The listener identifies the ADDER baseline under throttle before “ready”. Use one vehicle and one game session throughout. The listener drives and operates the physical horn. Codex uses the existing switch client.

| Stage | Operator action and listening check |
| --- | --- |
| Audible control | Use `Ready -KnownStock -Donor RA_RC_AUDIBLE`. Ask what persists at idle and under throttle, and what happens on a horn press. Record the listener's words with `Report`. Attach `-Finding RecognisedPrivateMotor` only to an explicit report of the recognisable RC motor. For a fade, stock sound or unclear motor, use `PrivateMotorUnresolved`, return to stock and end the comparison. Private selection remains unresolved. |
| Intermediate stock | Use `Restore` on the same car. Ask whether the familiar ADDER is audible again. Submit the verbatim report with `-Finding StockReturned` or `-Finding StockReturnUnresolved`. The latter ends progression. |
| Quiet comparison | Once the listener has heard stock again and is ready, use `Ready -KnownStock -Donor RA_RC_QUIET`. Ask separately about engine at idle and under throttle, exhaust as load changes, and the horn on one press. Save the answers with `Report -Cue Engine`, `Exhaust` or `Horn` and the original text. |
| Final stock | Use `Restore`. Ask which powertrain sounds returned and have the listener try the horn again. Record final stock powertrain and horn observations separately. Close normally on “finished” and independently verify rollback. |

Each private apply and stock return is a single request. Keep GTA open on focus loss. A changed vehicle, uncertain dispatch or unresolved listening check ends progression. Record the motor and horn findings independently, including a surviving whine, a missing horn, or an indistinct transition.

### Private motor material

The installed Vinewood RC engine record has silent idle and intake samples, empty low/high engine and exhaust references, and no granular or electric-engine record. Its extra wrapper reaches a base TwinLoop with a rain category. Separately, the Arena War sound set 0x7B9D9FE0 contains a four-layer parameter-driven motor branch and a wheel/skid branch with player-bank loops and synthesis. The inspected RELs expose no explicit link from the winning vehicle root to this set. Which contributor produced the loud RC sound in the live stock test remains open.

Both private vehicle records start from ADDER 0xB779A091 and keep its physical horn list 0xF7725613. They select conventional engine audio with no granular link, using the flag pattern 0x90004A68 found on a stock non-granular car. The private engine records start from the **base** RC engine 0x1C4FDA16. Its high-exhaust sound 0xF50A1575 references a nonzero mono PCM loop in `STREAMED_VEHICLES/RC_MOTOR`. Both profiles explicitly bind the same loop to engine idle, engine low and high load, high exhaust and revs-off. The shared transmission synth and distant-start reference are disabled in both. This is a deliberately authored RC motor, with one source used across those states.

The audible bank preserves all 104,163 samples at 44.1 kHz. The quiet bank has identical timing and all-zero samples, with the corresponding peak metadata updated. Each version has its own vehicle, engine, sound and bank references. The ADDER horn, silent companion branches and other vehicle settings match between them. Independently triggered sound sets, tyre noise, world sound and runtime fallback are outside the motor edit.

### Building and reopening the private pack

From the worktree root, choose fresh output directories under `.local/audio-switch`. The following commands read the installed game and write their outputs to the worktree.

```powershell
$game = 'D:\Games\steamapps\common\Grand Theft Auto V Enhanced'
$cw = 'C:\Users\Libby\Desktop\CodeWalker30_dev46'
$switchTools = './tools/native-control/audio-switch'
$output = Join-Path $PWD '.local/audio-switch'
$resources = Join-Path $output 'private-rc-resources'
$shadow = Join-Path $output 'private-rc-shadow'
& "$switchTools/Build.ps1"
& "$switchTools/Build-PrivateRcResources.ps1" -GameRoot $game -CodeWalkerCore "$cw/CodeWalker.Core.dll" -RetainedRelDirectory "$PWD/.local/native-suppression-01/candidate-05/resources-02/original-rel-evidence" -OutputDirectory $resources
& ./tools/native-control/native-suppression01/Build-IdleShadow.ps1 -GameRoot $game -Pack ra_rc_9f6c2b57 -Output $shadow
& "$switchTools/Build-PrivateRcPackage.ps1" -ResourceRoot $resources -ShadowReceipt "$shadow/shadow-receipt.json" -Output "$output/private-rc-dlc"
```

For an approved live run, check the installed OpenRPF loader and the previous one-car restoration receipt, capture fresh backups, and require the clean mods baseline. Use the generated `overlay-plan.json` with `Install-Qualification01` and `Restore-Qualification01` (kind `audio-switch-pack`, pack `ra_rc_9f6c2b57`). Keep its ledger beside the one-car runtime ledger. Stage the overlay before the switch. After normal closure or a partial setup failure, unwind the transactions before declaring restoration. Independently verify the original stock update archive, original game-root inventory and backed-up metadata, and the absence of the temporary overlay and runtime. Keep the listening log and receipts.

## Completed unknown-name run

On 21 November 2026 at commit 43cdb7d, `ra_quiet_orchard` and `ADDER` each dispatched once and returned on the same running ADDER. The listener heard a brief cutout and fade-back both times. The engine already sounded normal before the stock return, and the listener heard no lasting difference afterward. The unknown-name experiment is closed.
