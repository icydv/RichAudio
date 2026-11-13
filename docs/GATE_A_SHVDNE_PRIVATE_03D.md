# GATE-A-SHVDNE-PRIVATE-03D — supervisor admission correction

I requested an offline correction after my consumed PRIVATE03C provenance-01 attempt. Codex kept GTA and OBS closed, used authored disposable processes for supervision tests and copied roots for installation tests, and left the audio experiment unchanged. This preparation is **BLOCKED by native Windows dependency drift**. It grants no live authorization.

## Established failure and uncertainty

The retained game identity was PID31672, CIM creation UTC ticks639301247918745920, and `D:\Games\steamapps\common\Grand Theft Auto V Enhanced\GTA5_Enhanced.exe`. The expected hash was the pinned Enhanced1.0.1158.16 binary. The historical supervisor compared its handle, managed process creation time, module path and executable hash in one composite guard. Its exception recorded none of the observed comparison values. The exact failed field in that live attempt therefore remains **undetermined**. There is no retained native creation FILETIME or observed executable file identity with which to reconstruct the missing comparison. I do not infer a launcher substitution, process replacement or resource failure from that error.

Codex reproduced a genuine provider defect using an owned disposable Python process. Native `GetProcessTimes` and managed `Process.StartTime` agreed on UTC ticks639301294101066739; CIM reported639301294101066730. The9-tick difference (0.9microseconds) would fail the historical exact comparison. The receipt `identity-provider-reproduction.json` retains both values. This establishes a representation mismatch in the old discovery path, **not retrospective proof that this was the failed live field**.

The secondary watcher exception is established: it queried the already-exited supervisor through CIM, passed the empty output directly to `json.loads`, and raised JSONDecodeError before recording the supervisor process receipt or exit code. The supervisor's catch exited, so its pre-admission Form did not survive to provide the bounded stop path.

## Exit chronology

The retained stderr modification time is2026-11-12T23:59:52.214427Z. Game absence was observed at2026-11-13T00:01:02.918028Z,70.703601seconds later. This is an observation interval, not an exact measured process-exit instant. The60-second normal-exit requirement was not demonstrated. No admitted five-second direct acknowledgment receipt exists. Codex's later polling and chat/UI handoff were not an independent stopping mechanism. Exact timing of every human/chat step is absent from the retained machine receipts, so the entire interval cannot be assigned to one actor or operation.

The replacement removes the exception-driven loss of supervision and the dependency on a later Codex poll to create a stop instruction. It cannot guarantee that I see a notice, acknowledge it or finish normal exit on time. Missing/late acknowledgment and missing normal exit remain failures; neither deadline is extended and no forced termination is implemented.

## Versioned correction

All corrective source is new under `tools/native-control/private-profile03d`. Historical source, binaries, manifests, consumed authorization and raw evidence remain untouched.

- `ExactIdentity.cs` uses query/synchronize permissions only, native creation FILETIME, managed-tick compatibility with the unchanged probe, canonical executable path, volume/file identity and SHA-256. The same provider supplies discovery and attachment identities. A held process handle and executable read handle protect the measurements. It requests no process-memory permission.
- `SupervisorMonitor03D.cs` records expected and observed identity components and names failed fields, including configuration inconsistencies. Session/configuration/manifest binding and the original protocol/one-use lease remain mandatory. A rejected identity grants no ready binding or activation. There is one attachment only. Its protected cleanup begins before notice/readiness publication, so a publication exception revokes permission and releases the guard. One command reader serves normal and failure roles; competing readers cannot consume each other's commands.
- `FailureNotice.cs` provides a persistent STOP-only role after rejection. Unexpected monitor exit causes the watcher to start this role, never a second attachment. It has no probe protocol handles, activation or restoration authority. Unknown discovery identity permits only conservative global absence observation, never admission. Five-second acknowledgment and sixty-second normal-exit bounds start from the retained failure origin, with the original fixed hard ceiling. It records failures without terminating the target.
- `SupervisorPolicy03D.cs` preserves the old monotonic policy and adds timed acknowledgment: a late acknowledgment cannot erase a missed deadline. A conservative fixed hard ceiling can only shorten the process-origin lifetime. The historical policy file is unchanged.
- `Watch-AuthorizedGame.py` writes the child PID immediately, checks bounded ready/rejection receipts and process exit, preserves the original stderr/stdout/exit code, rejects empty or malformed responses, and sends stop or opens the stop-only notice. It never retries attachment or launches/terminates GTA.
- `Manage-Installation.py` reuses the sealed transactional copy/recovery algorithm in a new package root. Its sole remaining-process recovery exception requires the exact admitted supervisor's native FILETIME, canonical path, file identity, hash and session. Game/OBS/other notice processes remain disallowed during recovery. Prefix proof, exclusive creation, archival, unknown-file refusal and single-use installation remain intact.
- `Package.py` retains exact branch/HEAD/parent/commit-scope, clean-tree, complete binding and fresh-manifest checks. Arbitrary later commits and old manifest approvals are refused. `Build.py` and `Verify-Preservation.py` create fresh outputs only.

The unchanged probe remains v0.3.1.1, SHA-256 `fbed6a147abf8575825996198eb4cb60cddcaa02929c9d00fa43e5dba0bda4b0`. The original private profile, marker, DAT151/DAT54/AWC, DLC, full shadow and detectors are preserved. No production acoustic/synthesis code changed.

## Offline verification

The final candidate is the `build-review` binary identified in the local build and review receipts. Its source is independently hashed there. Qualification includes35 focused identity/response assertions,110 inherited policy/protocol assertions with real disposable processes,22 watcher/stop-only process assertions and43 provenance/readiness/recovery assertions. The installation suites passed96 transaction,4 multi-block prefix,5 overlapping OBS recovery and5 directory cases. Complete copied-root installation/restoration includes the actual3122239488-byte unchanged shadow,9 game files and3 OBS settings files, exact original inventory, backup preservation and idempotent restoration.

The regression set covers exact and wrong identities, discovery/attachment replacement, Steam/RPH distinction, canonical path/file identity/hash drift, reused sessions, one-use activation, missing/malformed responses, early rejection with original stderr and exit code, monitor loss, absent/late acknowledgment, overdue normal exit, stale manifests, dirty/future HEADs, corrupted/missing resources/dependencies, loader conflicts, interrupted work and proof-bound restoration. Fixtures prove software behaviour, not fullscreen visibility, GTA shutdown latency or native private-resource registration.

Earlier failed test runs remain retained: one test initially expected the wrong normal return code; one real recovery test exposed a string/Path mismatch, which Codex corrected and revalidated. No historical evidence was overwritten.

## Current readiness blocker

The independent preservation comparison found22 changed files under `C:\Windows\System32`. The sealed loader contract still pins their earlier byte identities. For example:

| KERNEL32.dll | Sealed | Current observation |
| --- | --- | --- |
| Bytes |861992|862016|
| SHA-256 |`e132eba4166256e2f414b91fe7d5386590bc5ea8626aee5af9c9738383cf2ae1`|`970e5e15eed7d53c8b88e06ddc71884c31804f1cb5286abf01fbce39b7f0e29f`|

The current file reports version10.0.26100.9974. The replacement cause/time is not established by this task. Codex did not modify these system files. The detailed expected/current hashes are in `preservation-comparison-02.json`. All other checked historical byte identities matched, including project/game/resources/old supervision/evidence and original RPH worktree/menu protection. A strict full preflight must reject the current native dependency closure; the read-only game-file inventory is a separate result.

Codex has not silently repinned the contract, reverted Windows DLLs, installed dependencies or relaxed manifest checks. The final review manifest binds the corrective candidate, committed source, tests, discrepancy and unchanged experimental artifacts. It is explicitly **not an execution manifest**. No fresh live authorization wording is issued for this blocked state. A later preparation must first review and qualify the actual native dependency set, then create a new execution seal on its final clean committed HEAD and request my fresh approval.

## Preserved future experiment

The functional scope remains two disposable Batis, marker-negative A/B baselines, one manually armed/confirmed assignment of `ra_gapriv01_bati` to A, untouched B, the original31-symbol horn marker, normal retirement and exact restoration. The original PRIVATE03C evidence/capture/phase rules remain required. Runtime registration and an audible authored contribution remain untested. Complete native audio ownership, suppression, recovery and production compatibility remain unproved.

No installation or launch is permitted from this receipt. Native audio ownership remains my highest engineering priority; dependency drift is not grounds to weaken its experiment.
