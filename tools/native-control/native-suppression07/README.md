# Automatic native-audio test tools

These tools prepare candidate-07. They do not authorize a live run. The normal live interaction is approve, watch/listen and answer Codex's phase question. The local runner handles the mechanics.

`IdleExperiment.cs` is the candidate-07 copy of the checked candidate-06 controller. `AutomaticRun.cs` operates it. `IdleNativeApi.cs` contains the finite reviewed game operations. `LocalBridge.cs` owns bounded file IO on a worker; `IdleProbe.Shvdne.cs` drains commands and performs game work on the SHVDNE callback. Only the optional emergency F9 remains in the key handler, and it queues the same stop path.

`Operator07.py watch` attaches to an already launched, newly approved game process; it never launches GTA. It starts the private OBS collection, controls its finite Lua recorder, verifies actual state, coordinates immutable capture bundles and asks Codex for review through published observation events. The operator uses only local files and OBS's supported scripting API. There is no network server.

Codex saves the ordinary listening answer in a private UTF-8 file, retaining the original observation from the question. After media/context review it invokes:

```powershell
python.exe -I -S -B Operator07.py review --plan <retained-plan> --observation <original-observation> --decision <finite-decision> --text-file <answer-file> --context-reviewed
```

These are operator instructions, not tasks for the listening reviewer. The complete live approval covers the fixed non-silent sequence; the review command is a technical gate, not another consent ritual. A late answer is retained without being attached to a later phase. The client validates the still-active approved transaction, sealed plan and exact evidence receipt before forwarding.

Offline validation uses `Test-AutomaticRun07.ps1`, `Test-Sdk07.ps1`, `Test-External07.ps1`, `Test-Capture07.py`, `Test-ObsBindings07.py` and `Test-Installation07.ps1`. Every invocation takes a new private output directory. Installation fixtures require committed clean source, substitute only fixed filesystem roots and use inert disposable files; they never target the real game or OBS settings. Their automated approval-shaped inputs are labelled fixtures, not human consent.

After source commits, `Build-NativeAutomatic07.ps1` emits a disabled final probe using the unchanged candidate-06 DLC. `Inspect-Automatic07.ps1` checks actual compiled IL and SDK conversions without executing the candidate. `Prepare-Scope07.ps1` then binds the final commit, DLL, unchanged DLC, source/tests, prepared installer/rollback, originals, capture settings and local operator into one new scope. No source commit follows final scope assembly.

The full procedure and evidence boundaries are in `docs/NATIVE_SUPPRESSION_07_PROCEDURE.md` and `docs/NATIVE_SUPPRESSION_07.md`. Historical candidates, recordings and failed receipts remain unchanged. No suppression, live camera/listener/horn qualification or crash recovery is inferred from authored fixtures.
