# One-car audio switch

Run `Build.ps1` from PowerShell on the RichAudio development machine. It builds the SHVDNE script in `.local/audio-switch` and runs the offline checks against that DLL. When a live session is authorized, load only `RichAudio.AudioSwitch.dll` as a script with the matching Enhanced SHVDNE runtime. Use the pinned Enhanced game and runtime used by the probe. Verify fresh successful SDK initialization before issuing a command.

Drive a running stock ADDER with its original ADDER engine audio. The operator and listener must know the vehicle's audio history. The model check alone cannot establish that history. Listen to stock idle or revs for as long as you like, then say **ready**. Codex operates the following commands through `Invoke-Switch.ps1`.

| Command | Effect |
| --- | --- |
| `Status` | Read the current session, target, driving eligibility, foreground state and switch phase. |
| `Ready -KnownStock` | Bind the current target and request `ra_quiet_orchard` once. |
| `Restore` | On “put it back”, request `ADDER` on the same still-driven, running and tagged car. |
| `Report -Text <words>` | Record the listener's words in the current session log. |

The client returns the script's reply. A returned setter call records dispatch only. The listener judges the audible effect. If the client times out, inspect its printed session directory and command ID before taking another action. An uncertain apply permits a deliberate restore on the original marked car. An uncertain restore consumes that restore opportunity.

A refused command consumes no audio write. Address the displayed reason and give a new command in the same game session. Leaving the vehicle abandons its binding. An abandoned marked car cannot be adopted again as a known-stock baseline. The switch has no quit or launch command. Logs are under `%LOCALAPPDATA%\RichAudio\AudioSwitch\<session>\events.jsonl`.
