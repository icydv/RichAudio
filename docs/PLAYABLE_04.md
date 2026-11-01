# PLAYABLE-04: independent Script Hook V one-call probe

Follow-up: [PLAYABLE-05](PLAYABLE_05.md) ran this exact candidate once through
the real SHV interface. It returned zero while the engine-running query reported
false; idle/provider qualification remains inconclusive. The probe was removed
after game exit. The build record below remains unchanged.

31 October 2026. Continues PR #76 on `feature/playable-01` from
`646fffd4bb036a1f48bd35051d7d042a0f0166e5`.

**GO to propose one separately authorised live qualification of this compiled
diagnostic. BLOCKED for authentic provider integration and playable development.**
The actual ASI compiled and passed device-free tests using a fake framework.
It has not been deployed, loaded by the real framework or tested in GTA. No
native return, engine operating-state contract or audible gameplay is established.

## Preserved evidence and chosen route

[PLAYABLE-03](PLAYABLE_03.md), its
[provider comparison](PLAYABLE_03_PROVIDER_COMPARISON.md) and the
[upstream RPH draft](UPSTREAM_RPH_ENGINE_TELEMETRY_REPORT.md) remain applicable.
RPH's getter returned approximately 50 against its 0..1 contract; its resolver
could not find `F9DDA40BC293A61E`. The Enhanced NativeDB includes that identifier.
Neither symptom has a proven root cause. No RPH test was repeated here.

The independent route uses the **existing Script Hook V installation** and its
normal public script registration/native invocation exports. The
[author's current page](https://www.dev-c.com/gtav/scripthookv/) documents native
functions in ASI plugins and lists release `v3889.0 / 1158.13`. The previous
recorded initialization on the actual `1.0.1158.16` executable is startup
evidence only. This probe must still establish whether this native resolves and
what it returns. No SHVDN/SHVDNE runtime or replacement loader was installed.

The primary eventual path remains a maintainer-supported RPH correction, if
available. The SHV ASI is the smallest independent diagnostic fallback without
a second managed framework. SHVDNE's public normalized-RPM getter remains a
secondary research fallback with its documented framework-offset and runtime
requirements; it is not installed or qualified by this change.

## Verified build prerequisites

Scoped inventory found no usable x64 C++ compiler/linker or Windows SDK in PATH,
standard Visual Studio/LLVM/MinGW/MSYS2 locations, inspected package caches or
registry SDK roots. Git's `link.exe` is a file-link utility; Go's linker cannot
build this C++ DLL. Existing managed compilers were not substituted for native
ABI compilation. This is a scoped inventory, not a claim to enumerate every
protected directory on the machine.

I separately authorised the minimal Microsoft Build Tools installation.
The [official bootstrap](https://aka.ms/vs/17/release/vs_BuildTools.exe), version
`17.14.37827.9`, had a valid Microsoft signature and SHA-256
`972d771c33c2887b13900c2052e5d2e88208531f6d5ee3c4405d7648e853009b`.
Only these explicitly requested component IDs plus their required dependencies
were selected, following the
[Microsoft component catalogue](https://learn.microsoft.com/en-us/visualstudio/install/workload-component-id-vs-build-tools?view=visualstudio):

- `Microsoft.VisualStudio.Component.VC.Tools.x86.x64`
- `Microsoft.VisualStudio.Component.Windows11SDK.26100`

The first installation root was rejected as too long. The same approved
components installed successfully at `C:\VSBuildTools` with exit code 0 and
no restart requested. No full IDE, runtime replacement or game change was
requested. Compiler `19.44.35229.0`, linker `14.44.35229.0`, toolset
`14.44.35207` and Windows SDK `10.0.26100.0` were used. Compiler, linker and
librarian signatures are valid Microsoft signatures.

The official SDK download's prior HTML response was not bypassed with a binary
mirror. [Verified compatible declaration provenance](PLAYABLE_04_HEADER_PROVENANCE.md)
pins an author-credited SDK header and maintained consumers. The product has a
small independently authored declaration facade; it does not redistribute the
full third-party header. `lib.exe` generated an import library locally from the
six exact decorated exports statically verified in the installed SHV DLL.
No external import-library or runtime binary was acquired for this build.

## Implementation and ownership

[Probe.cpp](../src/telemetry/ShvProbe/Probe.cpp),
[ScriptHookVApi.h](../src/telemetry/ShvProbe/ScriptHookVApi.h) and
[NativeIds.h](../src/telemetry/ShvProbe/NativeIds.h) are isolated from RichAudio.
All 16 native identifiers/signatures are checked against the pinned Enhanced
catalogue in [native-contract evidence](../evidence/playable-04-native-contracts.json).
`joaat("bati")` independently confirms model `0xF9300CC5` offline.

`DllMain` only registers/unregisters the module with SHV. File work and thread
creation occur after the registered script callback begins. The static CRT is
linked with `/MT`; its thread notifications are retained. This follows the
[Microsoft loader-lock guidance](https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-best-practices).

The script callback obtains its own player, ped and current-vehicle native
handles. It checks offline/not-loading/not-switching context, a playing local
player, living ped and vehicle, Bati model, exact driver-seat relationship and
engine-running context. No RPH pool handle crosses this boundary. Before the
target call it rechecks the identity after a separate writer has flushed the
armed journal record. A changed eligible vehicle still stops without a target
call. All native calls execute in the registered script callback; the writer
and cancellation watchdog never invoke SHV natives.

The target is exactly `float(Vehicle)` native `0xF9DDA40BC293A61E`, at most once
per process. There are no alternate hashes, manual mappings, direct handler
calls, scans, offsets or game-object memory reads. The first four bytes of
framework-owned return storage are copied immediately, before another native
or yield. No pointer is retained, freed or published. No native call follows
the target, even on failure. Script reentry cannot rearm the probe.

Capture retains raw 32-bit float bits, a round-trip finite value (nine significant
digits), pointer presence, detectable SEH code, acquisition/target QPC bounds,
frequency, own handles/model/driver and raw engine-running context. Nonfinite
JSON values become `null` while their original bits remain intact. Failed
native identifiers are hexadecimal strings, avoiding JSON integer precision
loss. `measuredRPM` and `providerValid` are always false. A pointer, finite
float, zero or successful callback never establishes meaningful engine state.
The `0..1` plausibility classification is a conservative qualification heuristic,
not a newly proven NativeDB range contract. No value is scaled, clamped or inferred.

No source playback, renderer, Doppler, menu, gain calibration, device API or
recording changes are included. The probe does not spawn/control a vehicle,
set engine state or change the game world.

## Compiled artifact and offline validation

Candidate: `build/playable-04-shv-probe/RichAudio.OperatingState.Shv.asi`

- Length: **288,256 bytes**.
- SHA-256: **`8f516dc5bdfd62f125c8f9624d3396c9c3f9debceb618c39f76784323fd7a083`**.
- Native AMD64 PE32+ DLL, backed executable CRT/DllMain entry point, no CLR
  metadata, no named or ordinal-only exports and no delayed imports.
- Exactly six documented decorated SHV imports; the only other imported DLL
  is `KERNEL32.dll`. No RPH, SHVDNE, fixture or audio dependency. Static CRT
  linking avoids a new Visual C++ redistributable runtime requirement.
- `/std:c++17 /W4 /WX /O2 /MT /EHsc /guard:cf /Brepro`; linker CFG, ASLR, NX,
  high-entropy VA and reproducible-build flags. These flags are not a claim of
  byte-for-byte reproducibility across different compiler/SDK versions or paths.

[Build evidence](../evidence/playable-04-build.json) records the exact tool,
source, framework, included-header manifest and consumed-library hashes. The
170 consumed headers are identified privately; full local paths and build logs
remain ignored. [The builder](../tools/Build-ShvTelemetryProbe.ps1) and
[static inspector](../tools/Inspect-ShvProbe.ps1) do not load the installed SHV
DLL and refuse output in the game directory or through a reparse point.

[Fixture evidence](../evidence/playable-04-fixtures.json) records **229 passing assertions across 14 cases** against the **actual
same ASI binary**, not a rewritten model, against a clearly identified fake SHV
DLL in a separate child process per case. The host verifies the candidate and
fake DLL paths/hashes before callbacks, uses an isolated DLL search, and never
loads the installed real SHV DLL. Cases cover finite/zero/NaN/infinity/50 values,
null results, eligibility rejection, changed identity after arming, detectable
precondition/target SEH, delayed target return and repeat callback suppression.
The fake overwrites result storage on subsequent calls/yields; raw-bit retention
and durable pre-call journal ordering are checked. The parent can terminate only
its owned fixture child after the test deadline. These checks prove caller
behaviour in a controlled process, not GTA handlers, actual SHV fibers or sound.

Reproduce from PowerShell 7 in the repository:

```powershell
pwsh -NoProfile -File tools/Build-ShvTelemetryProbe.ps1
pwsh -NoProfile -File tools/Test-ShvTelemetryProbe.ps1
# Use the fixture-result.json path printed by that run:
pwsh -NoProfile -File tools/Prepare-ShvProbe.ps1 -FixtureReceipt <fixture-result.json>
```

The preparation command creates new JSON manifests only; it refuses existing
output. A rebuild produces a new receipt and requires matching source/fixture
hashes before preparation. No command above deploys or launches anything.

## Exact installation and rollback boundary

The ignored local candidate folder contains `installation-manifest.json`,
`rollback-manifest.json`, `one-call-proposal.json` and `preparation-receipt.json`.
The [portable decision receipt](../evidence/playable-04-offline.json) records
their hashes. These are **unexecuted proposals**. A future operator must obtain
specific deployment/launch approval and recheck their prerequisites first.

Only one payload is proposed: the pinned ASI from the build path above to
`<game-root>\RichAudio.OperatingState.Shv.asi`. Both that destination and the
exact staging path `<game-root>\RichAudio.OperatingState.Shv.asi.playable04.pending`
must be absent. With all game/RPH/host processes stopped, copy only this file
through `FileMode.CreateNew` to that pending path, flush/close and verify its
length/hash, then move on the same volume without overwrite. Verify the final
hash and record ownership before launch. Do not copy any SDK, fake SHV DLL,
fixture host, generated `.lib`, loader, runtime or product package into GTA.

Rollback requires game process exit: the ASI pins itself for process lifetime,
so hot-unload is unsupported. Remove only those two exact paths if a creation
or installation receipt establishes probe ownership and the file hash matches.
Refuse changed/unowned files. Do not use recursive deletion, touch existing ASIs,
restore guessed backups or remove captures. Recheck the 11 protected installation
hashes and saved settings. The approved system Build Tools remain installed.

## Minimal live qualification proposal, not authorisation

1. Separately approve the exact ASI hash, one deployment and one launch through
   the existing route. Keep the existing RichAudio stock-fallback settings.
   Start in offline Story Mode; do not enter Online. Prepare the local player
   driving a Bati with its engine idling. No acceleration sequence is requested.
2. The callback starts a **300,000 ms** monotonic session deadline, including
   loading/eligibility wait. Polls occur at most four times a second, plus one
   final identity revalidation. A test-only process environment setting may
   shorten the deadline to 100..300,000 ms; it cannot extend it. If Story Mode
   cannot be ready in time, accept a zero-target timeout; do not relaunch/rearm
   automatically. The deadline is not a guarantee of GTA's startup duration.
3. The writer creates a new process-identity folder under
   `%LOCALAPPDATA%\RichAudio\ShvProbe\<PID>-<process-creation-FILETIME>` and only
   `journal.ndjson`/`capture.json`, with **16,383 bytes combined maximum**.
   Existing folders/files are refused. No per-poll records grow the journal.
   Inspect the raw result/context and terminal outcome after the attempt.
4. A null, SEH, nonfinite, suspicious range, changed context, timeout or missing
   final result ends the session. Zero/default-only is inconclusive. A plausible
   nonzero idle result is only a reason to review whether a separately approved
   multi-state experiment is worthwhile. It is not qualified RPM or a GO for
   RichAudio playback. Do not automatically repeat a call on any outcome.
5. Exit GTA normally and perform the receipt-bound rollback. Preserve private
   capture files; publish only sanitised findings. No multi-state capture,
   listening test, audio host or further live retry is authorised by this plan.

The watchdog independently cancels future work; local deadline checks also stop
new dispatch. After cancellation, the writer allows 500 ms for a returning
producer before recording an unobserved outcome. **It cannot preempt a blocked
native, recover a framework fatal error, force a filesystem operation to finish
or guarantee game survival.** SEH only records detectable faults; startup/worker
failure can leave no capture. No watchdog kills GTA. The armed journal proves
preparation and flush, not that the target was invoked or returned. A missing
completion is unobserved, not a manufactured zero. The process pin retains worker
code until process exit. Reparse checks/held directory handles are defensive,
not a guarantee against every hostile concurrent filesystem mutation.

## Maintainer action and decision

Recommend submitting the retained
[RPH compatibility report draft](UPSTREAM_RPH_ENGINE_TELEMETRY_REPORT.md) through
the official RPH/LCPDFR maintainer channel identified there. It has **not** been
submitted. Keep the two RPH symptoms, Enhanced-catalogue provenance and unknown
root causes separate; this offline SHV probe does not diagnose either failure.

**GO:** the first separately authorised, bounded SHV one-call qualification is
now concrete and reviewable. **BLOCKED:** authentic operating-state integration,
multi-state qualification and further playable/audio development until genuine
game evidence supports the provider. Human listening remains a later gate.
