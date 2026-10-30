# Bound plugin startup preparation

The new RPH entry hook queues installed-world preparation automatically when the plugin loads with its prepared sidecar. All hashing, catalogue scans and geometry work run on an external worker, outside the game/audio fiber. This is a compiled preparation candidate, **not a deployed or launcher-ready sound replacement**.

`InstalledWorldWarmup.Rph.cs` calls `WorldWarmupSupervisor` from the existing plugin entry point and stops it on unload/finally. Configuration resolves from the running game's `Plugins/RichAudio.WorldWarmup.json`; it does not follow the cached DLL location used by RPH. No native audio control, endpoint, vehicle source or host starts from this hook.

`tools/Prepare-WorldWarmupSidecar.ps1` prepares that JSON in the private build folder, without writing to the game. It pins the actual game executable, trusted CodeWalker core, installed PowerShell7 host and every preparation source dependency. The current candidate enables qualified geometry imports with a16-resource budget,900-second total budget,300-second stage budget and3GiB worker-memory budget. Each invocation remains bounded and incomplete work remains visible; this does not finish every resource in one invocation.

The worker is assigned to a kill-on-close Windows job before its unique start permit is published. Cooperative unload cancellation gets a bounded cleanup grace period, then the job terminates its owned descendants. On a fresh plugin load only an exact plugin-owned GUID cancellation marker is archived/acknowledged automatically. An independent/manual cancellation remains pending. Existing catalogue and geometry receipts are revalidated before reuse. `RichAudioWorldWarmupStatus` reports preparation state; detailed coverage remains in the private `preparation.json`.

## Validation

- The combined bridge compiles with warnings as errors against the authentic pinned private RPH SDK. Compilation does not establish runtime ABI compatibility or actual load-time behavior.
- Disposable process fixtures pass exact-source binding rejection, private-output rejection, cached-DLL configuration layout, normal completion, own-marker resume, manual cancellation preservation, orphan-child cleanup, cooperative cancellation and monotonic deadline cleanup. No game or audio process is used by these fixtures.
- The generated actual sidecar validates all17 exact preparation source bindings. It is local/uncommitted. No startup worker was launched from RPH.
- The separate actual installed preparation workflow passes in102.532seconds and verifies unchanged receipt reuse in3.897seconds without workers. See `INSTALLED_AUDIO_WORLD_PREPARATION.md`.
- One exact real geometry batch and its qualified reader pass separately; the global plan still has4,337 pending exterior resources and6,326 deferred resources. See `INSTALLED_WORLD_IMPORT_01.md`.

## Remaining integration

Startup indexing does not create missing surface/material/interior coverage or extend the existing solver's distance/history limits. Custom loader activation is not observed. Complete installed geometry, all native vehicle source families, remaining source pitch imperfections, multi-vehicle live production, selective native engine/exhaust suppression with restoration and live output calibration remain open. Native GTA sound remains unchanged. No game installation, launch, endpoint access or automatic replacement occurred.
