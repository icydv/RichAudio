# Automatic native-audio test tools

These tools prepare candidate-08. They do not authorize a live run. The normal live interaction is approve, watch/listen and answer Codex's phase question. The local runner handles the mechanics.

`IdleExperiment.cs` is the candidate-08 copy of the checked candidate-06 controller. `AutomaticRun.cs` operates it. `IdleNativeApi.cs` contains the finite reviewed game operations. `LocalBridge.cs` owns bounded file IO on a worker; `IdleProbe.Shvdne.cs` drains commands and performs game work on the SHVDNE callback. Only the optional emergency F9 remains in the key handler, and it queues the same stop path.

`Operator08.py watch` attaches to an already launched, newly approved game process; it never launches GTA. It starts the private OBS collection, controls its finite Lua recorder, verifies actual state, coordinates immutable capture bundles and asks Codex for review through published observation events. The operator uses only local files and OBS's supported scripting API. There is no network server.

Codex saves the ordinary listening answer in a private UTF-8 file, retaining the original observation from the question. After media/context review it invokes:

```powershell
python.exe -I -S -B Operator08.py review --plan <retained-plan> --observation <original-observation> --decision <finite-decision> --text-file <answer-file> --context-reviewed
```

These are operator instructions, not tasks for the listening reviewer. The complete live approval covers the fixed non-silent sequence; the review command is a technical gate, not another consent ritual. A late answer is retained without being attached to a later phase. The client validates the still-active approved transaction, sealed plan and exact evidence receipt before forwarding.

Offline validation uses `Test-AutomaticRun08.ps1`, `Test-Sdk08.ps1`, `Test-External08.ps1`, `Test-Capture08.py`, `Test-ObsBindings08.py` and `Test-Installation08.ps1`. Every invocation takes a new private output directory. Installation fixtures require committed clean source, substitute only fixed filesystem roots and use inert disposable files; they never target the real game or OBS settings. Their automated approval-shaped inputs are labelled fixtures, not human consent.

After source commits, `Build-NativeAutomatic08.ps1` emits a disabled final probe using the unchanged candidate-06 DLC. `Inspect-Automatic08.ps1` checks actual compiled IL and SDK conversions without executing the candidate. `Prepare-Scope08.ps1` then binds the final commit, DLL, unchanged DLC, source/tests, prepared installer/rollback, originals, capture settings and local operator into one new scope. No source commit follows final scope assembly.

The full procedure and evidence boundaries are in `docs/NATIVE_SUPPRESSION_08_PROCEDURE.md` and `docs/NATIVE_SUPPRESSION_08.md`. Historical candidates, recordings and failed receipts remain unchanged. No suppression, live camera/listener/horn qualification or crash recovery is inferred from authored fixtures.

Candidate-08 removes the UI focus-policy attestation. `FocusConfiguration08.psm1` resolves Known Documents and the exact Enhanced profile, validates the existing XML, implements a no-op or explicitly scoped single-byte change and rejects concurrent drift. `Inspect-Configuration08.ps1` records the read-only provenance. The installer retains `configured-focus.json`; the startup operator checks actual supported progression and decoded readiness instead of opening a menu.

`Test-Configuration08.ps1` covers configuration selection/encoding/minimal changes. `Test-Focus08.ps1` uses actual disposable WinForms windows with the real bridge/runner/operator and authored game/recorder inputs. When a finite `focus-ui-assistance-needed` event appears, Codex uses the existing computer-use tool to select the unique returned window matching the request's window id and executable, activates it once, and leaves the operator to verify actual foreground ownership. A twelve-second request expiry is not extended. The owned-window test uses the same supported tool; it needs no user button rehearsal. Creation ticks in the request are strings to preserve the full process-generation value in JavaScript tools.

During a real approved run Codex watches the operator's startup output/focus requests while it runs. It must not leave an unattended activation request pending until it expires. After a listening answer is ready for forwarding, Codex activates the exact game window through supported app control if needed, then invokes `review`; the runner's Resume stage admits two seconds of matched state before any setter reservation. Do not use repeated SetForegroundWindow calls or simulated experiment keys.

The normal-exit exception remains visible: one exact-process WM_CLOSE can open a quit confirmation without completing closure. Codex observes the actual dialog; only if reliable supported UI confirmation still fails may I supply that final exit action. Configuration writes and rollback never run while GTA/PlayGTAV is alive.
