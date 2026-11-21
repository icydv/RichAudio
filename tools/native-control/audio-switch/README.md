# One-car audio switch

Run `Build.ps1` from PowerShell on the RichAudio development machine. It builds the SHVDNE script in `.local/audio-switch` and runs the offline checks against that DLL. When a live session is authorized, load only `RichAudio.AudioSwitch.dll` as a script with the matching Enhanced SHVDNE runtime. Use the pinned Enhanced game and runtime used by the probe. Verify fresh successful SDK initialization before issuing a command.

Drive a running stock ADDER with its original ADDER engine audio. The operator and listener must know the vehicle's audio history. The model check alone cannot establish that history. Listen to stock idle or revs for as long as you like, then say **ready**. Codex operates the following commands through `Invoke-Switch.ps1`.

| Command | Effect |
| --- | --- |
| `Status` | Read the current session, target, driving eligibility, foreground state and switch phase. |
| `Ready -KnownStock` | Bind the current target and request `VOLTIC` once. |
| `Restore` | On “put it back”, request `ADDER` on the same still-driven, running and tagged car. |
| `Report -Text <words>` | Record the listener's words in the current session log. |

The client returns the script's reply. A returned setter call records dispatch only. The listener judges the audible effect. If the client times out, inspect its printed session directory and command ID before taking another action. An uncertain apply permits a deliberate restore on the original marked car. An uncertain restore consumes that restore opportunity.

A refused command consumes no audio write. Address the displayed reason and give a new command in the same game session. Leaving the vehicle abandons its binding. An abandoned marked car cannot be adopted again as a known-stock baseline. The switch has no quit or launch command. Logs are under `%LOCALAPPDATA%\RichAudio\AudioSwitch\<session>\events.jsonl`.

## Stock donor and listening question

The retained Enhanced catalogue leaves the Voltic audio override blank. Its resolved identifier `voltic` hashes to the stock Dat151Vehicle root 0x9F4B77BE in update/update.rpf/x64/audio/config/game.dat151.rel. That root points to Dat151ElectricEngine 0x7F471776. Its Transmission reference 0x716FC17B resolves in sounds.dat54.rel through a parameter transform and multitrack to sample layers and modular synth 0x82925DF1.

After the cutout, listen for an electric motor whine that persists under acceleration, then listen for the familiar ADDER engine under similar throttle after stock return. Record the listener's words even if the only effect is a fade on each dispatch. A lasting donor cue followed by the return of the stock cue would demonstrate audible stock-profile switching on this car. Complete suppression remains a separate question.

## Completed unknown-name run

On 21 November 2026 at commit 43cdb7d, `ra_quiet_orchard` and `ADDER` each dispatched once and returned on the same running ADDER. The listener heard a brief cutout and fade-back both times. The engine already sounded normal before the stock return, and the listener heard no lasting difference afterward. The unknown-name experiment is closed.
