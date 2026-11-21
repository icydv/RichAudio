# One-car audio switch

Run `Build.ps1` from PowerShell on the RichAudio development machine. It builds the SHVDNE script in `.local/audio-switch` and runs the offline checks against that DLL. When a live session is authorized, load only `RichAudio.AudioSwitch.dll` as a script with the matching Enhanced SHVDNE runtime. Use the pinned Enhanced game and runtime used by the probe. Verify fresh successful SDK initialization before issuing a command.

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

## Completed unknown-name run

On 21 November 2026 at commit 43cdb7d, `ra_quiet_orchard` and `ADDER` each dispatched once and returned on the same running ADDER. The listener heard a brief cutout and fade-back both times. The engine already sounded normal before the stock return, and the listener heard no lasting difference afterward. The unknown-name experiment is closed.
