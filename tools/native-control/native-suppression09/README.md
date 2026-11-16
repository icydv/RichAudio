# Coverage before admission

Candidate-09 changes recording scheduling around the retained candidate-08 audio experiment. It adds no audio resource, profile, native hook or vehicle operation. The build compiles `IdleExperiment.cs`, `AutomaticRun.cs` and `IdleNativeApi.cs` directly from candidate-08. The new bridge/probe wrappers only bind the candidate-09 name, version and execution location.

`Readiness09.py` distinguishes recording active, decoded media available, required coverage complete and durable full-validator admission. It uses read-only source handles with read/write/delete sharing, then decodes exclusive snapshots. It keeps source file identity and append-only prefix hashes, checks snapshot identity before/after decode and verifies the live source again before admission. Every attempted snapshot and reason is retained.

The startup window remains seconds 1 through 11, including review at 10.9. Admission must finish before recording second 50; no new snapshot resets that clock. Polling is at most every 0.5 seconds, with 101 polls, 64 snapshots and 128 MiB cumulative snapshot bytes per gate. The retained 512 MiB source bound still applies. The finite recorder independently stops at recording second 60 if startup admission is absent. The original 780-second ceiling remains.

The same coverage gate schedules the original completed observation windows. It waits at most ten seconds after their request, never past the original active deadline, with no next profile armed. This does not change their anchors, ten-second durations, review frames, human acceptance or finalization. Coverage waiting is outside game callbacks. The parent checks the durable gate result, including a refusal after a successful full extraction, before publishing usable phase evidence.

The full decoder, quality checks, timeline validator and finalizer are reused unchanged from candidate-08 and its frozen dependencies. An early incomplete prefix is never made positive. Later append-only bytes from the same recording may qualify through a new immutable snapshot. Invalid timestamp evidence, overwritten sources, foreign/stale/stopped recording context and deadlines fail closed. There is no recording restart or native retry.

Offline checks:

- `Test-Readiness09.ps1`: retained candidate-08 bytes, independent track-availability fixtures, source/snapshot faults, deadline cases and actual bridge/parent eligibility with an authored game API.
- `Test-External09.ps1`: disposable processes, actual Lua VM, reviewed conversation path, normal cleanup and no keyboard phase duties.
- `Test-ObsWriter09.ps1`: actual installed OBS writer with generated local media, a private profile/collection, monitoring off, normal exit and exact OBS restoration. It does not capture GTA or qualify GTA audio.
- `Test-Installation09.ps1`: path-only disposable installation/rollback fixtures; no real installation. This requires committed source.
- `Test-ObsBindings09.py` and `DisposableRecorder09.py` boundary modes: installed wrapper names and actual Lua VM checks of the 60/780-second ceilings with authored clock offsets.

`Prepare-Scope09.ps1` seals a new proposal only after a clean final source commit, disabled build, compiled inspection and required receipts. Candidate-08 approval cannot authorize it. No source preparation script launches GTA or installs the candidate.
