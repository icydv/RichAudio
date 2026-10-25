# RPH append failure: postmortem investigation

## One instrumented attempt — 25 October 2026

This section supersedes the earlier proposed experiment below. Canonical `origin/main` was fetched and verified at `31840d3e91e745c04129463c61b362f22d35573d`; work is on `compat/rph-file-sharing-trace`. [PR #2](https://github.com/icydv/RichAudio/pull/2), commit `dbf72a0d11e87279f3f2bf4776509d9323997fa9`, was reviewed and remains open/unmerged. It correctly stopped when a supported logging-suppression contract could not be established. The new authorization permits direct observation of the existing failure; it does not establish a suppression switch or authorize another attempt after failure.

### Conditions, capture and launch

- Both Rockstar signatures, executable/backup fingerprints, original 32 root records, 179 RPF metadata records and ten sampled archive hashes matched before deployment. All 26 approved source hashes matched and all destinations were absent. GTA/RPH, CodeWalker, OpenIV and other relevant conflicting tools were closed.
- The unchanged private reviewed plan remains SHA-256 `9A12B751A312549150B1484151F41898F5BCF8E5A7BEC29653EA629DBD976906`. The publication helper now accepts its explicit private location and a fresh journal directory **inside this checkout's ignored .local storage**. It retains the original plan pin, no-overwrite copy/rename, reparse rejection, process guards and rollback. It does not repin or execute sanitised placeholder manifests. Two negative checks rejected an altered/public plan and an outside-workspace journal before mutation.
- The original approved telemetry DLL (`DBC5F600C37AD7579F49EBA92A352BEE1AAF452F6EF820CEF87B86B8547D5BE0`) was deployed unchanged. Its config initially matched the manifest. Only its capture output directory was then redirected to the current ignored attempt directory, preserving the archival checkout. Exact original config bytes and both hashes were journalled and restored before rollback. Capture remained disabled until a successful explicit plugin load; that load never happened. Sampling settings remained 20 Hz/eight sources/queue 64/census 128/two-ms budget.
- [Microsoft Process Monitor](https://learn.microsoft.com/en-us/sysinternals/downloads/procmon) **4.12**, published 15 October 2026, was obtained only from Microsoft's distribution. All three supplied executable signatures were valid Microsoft signatures. Used x64 executable SHA-256: `28495E642B2A465474A4EDC58380EAF8B7EE580F3FBCB4141061DEADAFE9B885`; distribution ZIP SHA-256: `477754BF299C9E5B311C5666F7A4A48DFDB21265EAA8F0CCA70EF9D9552E3A10`. It was used portably under its supplied EULA. The existing shell was already elevated; no UAC denial, privilege change, security exclusion or unrelated dependency installation occurred. Its supported loader created the temporary PROCMON25 filter. An eight-second authored-file self-test verified opens, access/share details, writes, closes and PID/TID export without launching RPH/GTA.
- Capture started before RPH using `/AcceptEula /Quiet /Minimized /NoFilter /BackingFile PRIVATE_TRACE /Runtime 300`. No process-only filter or destructive drop was used; profiling/IPC classes were excluded. A private watchdog imposed an eight-GiB cap and 305-second backstop using the supported `/Terminate` mechanism. Capture ended after approximately 300 seconds, below the cap, retaining a **2,708,403,074-byte** native PML. It was not left tracing during analysis. The agent did not open/read the live launcher log.
- Exactly **one RPH process**, PID **16800**, was started with **`-forcesettings -log`**, recovered from the prior failing dump's command line. No guessed flags were introduced. Its high-integrity context matches the prior dump's recorded integrity level. Settings positively displayed **Enhanced 1.0.1158.16 Retail**, with RPH **1.132.1428.17748**. No plugins loaded automatically; the startup script was empty. RichAudio metadata discovery is not initialisation.
- The publisher/Steam launch confirmation supplied `-skipPatcherCheck -launchTitleInFolder GAME_ROOT`, matching the established procedure. The actual process was **GTA5_Enhanced.exe**, PID **9460**, created **10:54:53.0129062 UTC**; the validated `-nobattleye` argument was independently observed and no BattlEye service process was observed. No Online/FiveM action was taken. Only legal/loading screens were seen, not Story Mode.

### Repeated exception and independent checkpoints

Windows .NET Runtime event 1026 at **2026-10-25T10:54:59.306699Z**, record 34631, records the RPH process terminating through `File.InternalAppendAllText`, `StreamWriter.CreateFile` and `FileStream.Init`. The new matching dump is **47,011,624 bytes**, SHA-256 **`F886D45E012E490A9241683B829DC7E018825D5077FC4726F6C25ACEB3D7EFFF`**. Its exception thread is **13048**, native managed-exception record `0xE0434352`, first parameter `0xFFFFFFFF80070020`; its error string again names `GAME_ROOT/RagePluginHookLauncher.log`. The exception occurred about nine seconds before capture ended. Dump/event alone still cannot identify the incompatible opener.

| Checkpoint | Result | Observed evidence |
|---|---|---|
| Diagnostic capture | **PASS** | Bounded PML, all-process underlying events, PID/TID and access/share details; offline analysis below |
| Enhanced executable selection | **PASS** | Settings build plus actual correct process path/version/hash |
| RPH startup completion | **FAIL** | Same unhandled launcher-log IOException/HRESULT before hook completion |
| Story Mode reached | **BLOCKED** | Only legal/loading screens; stopped on RPH failure |
| RichAudio metadata discovery | **PASS** | Settings enumerated its plugin metadata |
| RichAudio plugin loading/initialisation | **NOT TESTED** | No confirmed hook or explicit plugin load; no initialisation evidence |
| Genuine live telemetry | **BLOCKED** | Zero player/NPC samples; no meaningful RPM/gear/distance/lifecycle/cadence result |
| Stable integrated gameplay/performance | **NOT TESTED** | No gameplay test or controlled untraced baseline; trace overhead is not plugin cost |
| Controlled shutdown | **PASS** | Accepted the game's normal Quit confirmation; process exited, no forced game termination |
| Installation restoration | **PASS** | Exact independent comparisons below |

The failure recurred across the prior and this instrumented attempt under the logged launcher mode. That does not prove every launch fails deterministically or measure the probability/timing dependence of an internal race. No retry or configuration substitution occurred.

### Direct trace attribution

The preserved PML SHA-256 is **`56FAEDAD66A938EFDA553A6D2B6DFF453E17484B628CFBF5F2DD28D9CF08DF3B`**. Its viewer reports 6,172,078 underlying events. The completed CSV export contains 4,269,722 displayed events (profiling/IPC excluded), ending at **10:55:08.5259723 UTC**. Exact full-path filtering yields **23,811 events** for this game's launcher log. A basename-only search also found 34 events concerning private historical copies; those were excluded. In particular, the PowerShell read concerned the old backup log and is not a live-game-log read or an overlapping handle. CSV `Sequence` values are `n/a`; the row references below are **one-based CSV data-row ordinals**, not fabricated native sequence numbers.

| UTC time | CSV row | Process / thread | Operation and result |
|---|---:|---|---|
| 10:54:53.2200992 | 3,533,363 | RPH 16800 / 13048 | Last successful CreateFile: Generic Write + Read Attributes, OpenIf, ShareMode Read |
| 10:54:53.2203831 | 3,533,378 | RPH 16800 / 13048 | CloseFile succeeds; corresponding IRP_MJ_CLOSE follows at .2204542 |
| 10:54:55.6952805 | 3,660,387 | GTA5_Enhanced 9460 / 24948 | CreateFile succeeds: **Generic Read**, Open, No Buffering, Non-Directory File, **ShareMode Read** |
| 10:54:55.6953568–.6953790 | 3,660,391–3,660,394 | GTA5_Enhanced 9460 / 24948 | File-system control and file/volume information queries on the opened log |
| 10:54:59.3043600 | 3,866,827 | RPH 16800 / 13048 | CreateFile: **Generic Write + Read Attributes**, OpenIf, Sequential Access, Synchronous IO Non-Alert, ShareMode Read → **SHARING VIOLATION** |
| 10:54:59.3058375 | 3,866,893 | RPH 16800 / 13048 | Same write-open fails again; these are two operations inside the one launch, not two launch attempts |
| 10:54:59.3066990 | Event 34631 | RPH 16800 | Unhandled .NET append exception; dump thread/HRESULT agree |

All **2,348** successful RPH opens have observed CloseFile operations. The single successful GTA open has no GTA CloseFile/IRP_MJ_CLOSE in the captured interval. One deferred **System** IRP_MJ_CLOSE appears at .6953318, before the game's subsequent file-control/information operations; it cannot be relabelled as the game closing its new handle. No close on the path follows those game queries before the failed writes or the end of capture. Numeric HANDLE/file-object identifiers are not exposed by this export, and the final close after normal game exit is outside the recording. This establishes the relevant overlapping lifetime; it does not establish an indefinitely leaked handle.

A second, **offline-only** export using a GUI-authored exact-path filter and the supported `/LoadConfig /OpenLog /SaveApplyFilter /SaveAs1` mechanism retained stacks for the same 23,811 events. The successful GTA CreateFile stack traverses **GTA5_Enhanced.exe → dstoragecore.dll → KernelBase.dll → ntdll/kernel/filter-manager**, while the failed RPH stacks traverse .NET's **mscorlib.ni.dll**. Module identities are captured evidence; private symbols/function names were not resolved. No binary was patched or attached to a debugger. Raw addresses, process command lines and full module paths remain private. Initial large GUI views became unresponsive and were closed as diagnostic-only processes; supported offline export completed. No game process was force-terminated and no additional capture occurred.

[Windows CreateFile sharing rules](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew) require compatibility with every existing handle until close, regardless of which process owns it. The game's **Read-only sharing excludes RPH's requested write access**. RPH's own Read sharing permits the game's read access; that does not grant the reciprocal write permission. This is access/share/lifetime evidence, rather than attribution based only on an earlier open.

| Conclusion | Confidence and limitation |
|---|---|
| Failing caller is RPH PID 16800 / TID 13048, opening the log for append's write access | **CONFIRMED** by trace, event and dump correlation |
| Conflicting reader is GTA5_Enhanced PID 9460 / TID 24948, on a dstoragecore.dll call path | **CONFIRMED for this attempt** by exact path, incompatible share/access, observed lifetime and stack |
| Internal simultaneous RPH writers caused this particular failure | **Not supported**; successful RPH writers closed before the game's incompatible open |
| Antivirus, OpenRPF, RichAudio or the agent's log reader caused this collision | **Not supported by this trace**; no such incompatible open was observed. OpenRPF and RichAudio acquisition did not run |
| GTA bulk-registers every game-folder file through DirectStorage | **PROBABLE mechanism**, consistent with this stack and the fix author's explanation; a complete enumeration-policy audit was not performed |
| Handle is permanently leaked, or all starts fail deterministically | **UNDETERMINED**; capture ends before game exit, one new launch only |
| Launcher logging starts before observed INI handling | **CONFIRMED sequence**: first logged dependency check 10:50:13.015, first observed INI stage 10:52:08.613. This is not a verified off/redirect contract |

The prior uninstrumented exception remains attributable only to the immediate sharing error. The new trace must not retroactively identify an unrecorded historical handle owner with certainty.

### Narrow corrective direction; no additional change applied

The RPH publisher's [Enhanced release page](https://www.lcpdfr.com/downloads/gta5mods/g17media/52970-lspd-first-response-enhanced-preview/) and [staff announcement](https://www.lcpdfr.com/forums/topic/154528-lspdfr-for-gta-enhanced-edition-now-in-public-preview/) explicitly refer NVMe/DirectStorage users to **alloc8or's DirectStorageFix** and call out its ASI-loader requirement. The [author's description](https://www.gta5-mods.com/scripts/directstoragefix), current **1.2**, says it restricts DirectStorage registration to `.rpf`/`.cache`, preserving mod log/config writes. That matches the newly observed failure class. The publisher also requires the SHV-supplied `xinput1_4.dll` in place of its bundled proxy for that configuration.

However, the [examined author source](https://github.com/alloc8or/DirectStorageFix/blob/master/src/dllmain.cpp), blob `9686345c132ff4b60ee43471f11efd4f84a25792`, uses runtime pattern scanning and a **MinHook detour** of game file registration. Its broad game-build check is not an exact 1158.16 validation. This is a third-party native compatibility change and a different loader/deployment set, outside the current no-new-hooks/one-attempt authorization. Visible source is not an automatic redistribution license. It was **not downloaded as a binary, deployed or run**. No new signature or offset was written by RichAudio.

The next smallest action is a publisher/author-supported compatibility and licensing review of that **specific** correction, or a maintained RPH logger redirect/error-handling correction that avoids native game changes. Expected outcome of the documented registration fix is no open of the launcher log by the game's DirectStorage path, followed by successful RPH append/startup; neither is yet verified here. Risks include update-sensitive hooking, proxy-loader conflicts, initialization order and residual unrelated RPH failures. A future separately approved test must stage a new exact manifest, back up any replaced *introduced* proxy, refuse conflicts with original files, record hashes and revert every addition/rename on failure. It must require a fresh trace proving the incompatible open is absent and separate hook/Story Mode/plugin/sample evidence. **No immediate repeat is justified without these gates and new authorization.** Do not recommend AV exclusions, global permissions changes or guessed logger switches.

The [alternative integration comparison](RUNTIME_COMPATIBILITY.md) remains active: official SHV still lacks verified 1158.16 support, and SHVDNE inherits that gate. A source-visible, smaller ASI adapter remains a future contingency behind the existing telemetry boundary, not a compatible runtime installed by this task. Phase 2 and full A–E remain blocked.

### Restoration and regression evidence

After normal game exit and capture termination, the redirected config was restored byte-for-byte and all 26 unchanged additions were moved to ignored development quarantine. The old executable filename was restored without overwrite. Four absent-at-baseline generated files (`commandline.txt`, `RagePluginHook.ini`, `RagePluginHookLauncher.log`, `startup.rphs`) were hashed and preserved outside GTA, then removed from the game root. No unrelated file was removed.

The independent **11:04:24.2998025 UTC** comparison found zero differences in the exact **32 root size/hash records**, **179 archive path/size/write-time records**, **ten sampled archive SHA-256 records**, and root directory set. Both original filenames and valid signatures remain; `_GTA5.exe` and all 26 deployed destinations are absent. Restored fingerprints:

| File | SHA-256 |
|---|---|
| GTA5.exe, 1.0.1013.34 | `FD330FAE0C92A52E0B277FBA8A6856C81BD931FC4FCD1D81FBA02772A2A814CF` |
| GTA5_Enhanced.exe, 1.0.1158.16 | `69DA07FF67D05E9DED11289E597E8B8DC5855B0A429C085F37D148DC267CB2C5` |

The original archival checkout and independent complete backup each still match **all 9,359 saved file records** byte-for-byte. The original archival HEAD remains `bce9a278d8f1f0ff92935ef61886cb6bb2a7fc57`; its independent all-ref bundle fingerprint remains `719CB10452AA269ADB1C66B63FEABFD3AED8478362AF29FCC157809F34FABE26`. No unsanitised ancestry entered the development branch. The previously installed shared VC2010 prerequisite was retained; it was not installed again or uninstalled.

**Diagnostic cleanup is BLOCKED, separately from successful game restoration.** Capture, watchdog and all ProcMon/exporter processes exited. PROCMON25 remains registered with **zero attached instances**. The supported Windows `fltmc unload PROCMON25` request returned **0x801f0010** (detach refused); no forced driver/service removal, permission bypass or automatic reboot was attempted. A normal user-controlled restart and subsequent `fltmc` verification is the remaining cleanup step; absence after restart has not been tested. The created HKCU ProcMon application/EULA settings also remain: automatic approval review rejected their proposed removal with only “blocked by policy,” and the operation was not executed or retried by another mechanism. Portable tools and raw evidence remain in protected private development storage. Do not describe the overall system as completely restored while these diagnostic residuals remain.

`tools/Test-Offline.ps1` passed **48 telemetry assertions, 17 parser tests, 126 Phase 1 checks, nine configuration assertions and eight isolated append expectations** in this branch before the documentation update. The 32-source mock acquisition/tracking workload measured 36.10 microseconds/frame mean, p95 50.2, p99 122.5; 32-source mock acquisition/tracking/serialization mean 1,453.82 microseconds/frame, p95 2,181.9, p99 2,695.8. Forty paced mock frames over 2.121 seconds reported zero missed deadlines and zero queue drops. These are offline .NET measurements while trace export/viewer activity existed, not GTA performance or evidence of live 20 Hz delivery. Later final validation counts are recorded in the portable outcome file.

Raw traces, events, dumps, paths and process details remain private outside Git. Only necessary redacted technical findings and hashes belong in the [portable outcome](../evidence/publication/rph-instrumented-outcome.json). No sound, vehicle, graphics, archive or executable-content change was made. No A–E certification or Phase 3 work occurred. [Integration contingency review](RUNTIME_COMPATIBILITY.md) identifies exact-build support gates instead of installing a speculative replacement.

## Earlier postmortem (historical; no new run in that investigation)

25 October 2026. No game launch, executable rename, deployment, security change or audio change occurred during this investigation.

## Immediate failure established; handle owner unresolved

Windows Application event 1026 at **2026-10-25T01:54:57.5997543Z**, record 34610, identifies the failing process as **RAGEPluginHook.exe**. Its XML execution PID matches the preserved crash dump's process. The event reports `System.IO.IOException` through `File.InternalAppendAllText`, `StreamWriter.CreateFile` and `FileStream.Init`; the obfuscated RPH caller runs on a background thread. The full event contains no failing pathname or HRESULT.

A matching **46,917,480-byte** Windows crash dump was recovered from existing local CrashDumps storage, copied and SHA-256-verified without launching any process under test. Dump SHA-256: `FFF0C8AD90D86A167F6F9FE7D93DDD32748AE1310EF117431EBCC32A4E0D3522`. It contains:

- Native managed-exception record `0xE0434352`, first exception parameter `0xFFFFFFFF80070020` (sign-extended HRESULT **0x80070020**, Win32 **32 / ERROR_SHARING_VIOLATION**).
- A matching managed error string naming **`GAME_ROOT/RagePluginHookLauncher.log`** and stating that another open handle prevents access.
- No handle-data stream from which to identify the conflicting handle owner. No whole-system file-I/O trace was recorded during the failure.

The combination establishes the immediate cause: an append/open of the **launcher log**, not an unknown asset or an identified telemetry file, failed due to file sharing. It **does not establish which process/thread opened the incompatible handle**. A normal sharing-error message can also arise from a conflicting handle in the same process. The original event alone could not support this conclusion; the matching dump adds the missing evidence. The raw dump/heap strings remain private, outside Git, because they may contain proprietary memory and personal data.

## Timeline and competing explanations

The launcher log records plugin metadata discovery at 01:53:13, settings save, hook validation, normal Enhanced process launch, process detection at 01:54:52.359 and `Waiting for game window` at 01:54:52.536. The exception follows about five seconds later. RichAudio was not enabled on startup; the startup script is empty. Metadata discovery is not execution. There is no successful hook initialization, Story Mode or RichAudio sample evidence. This is a **launcher-side startup failure after discovery**, not an observed RichAudio game-callback failure; exact native injection progress cannot be reconstructed from this log alone.

| Candidate | Local evidence / conclusion |
|---|---|
| Incompatible file share on launcher log | **Established immediate failure** from dump HRESULT/path plus event stack |
| Another RPH thread/writer | Plausible; high-frequency launcher logging and ordinary .NET append opens can contend. No owner trace proves this |
| Enhanced/DirectStorage file opening | Plausible; game storage was previously identified as NVMe, and publisher warns about Enhanced/DirectStorage compatibility. No recorded handle links DirectStorage to this file |
| Antivirus, viewer, launcher or mod component | No trace identifies one as owner; do not add exclusions, terminate unrelated tools or blame a product |
| Broad directory ACL denial | Current inherited ACLs include applicable allow rights and no observed deny ACE; RPH already created/updated its log, INI and script. HRESULT is sharing violation, not access denied. Specific historical access policy is not fully reconstructed |
| Missing file/parent or directory-as-file | Preserved launcher file exists and is not read-only; recorded HRESULT does not match the isolated missing-parent/access-denied cases |

The preserved launcher log is 89,143 bytes and has SHA-256 `88CC557B7FAA81EC7B2EAFF3A26E5B565FD3E372AEA9B981C6DF1D5401BBA924`. No runtime log was preserved. No matching WER ReportArchive/ReportQueue entry supplied additional data. Existing crash dump storage did. Current ACLs and absence of a lock after process exit cannot identify a historical owner. OpenRPF was not installed; no LSPDFR gameplay plugin or RichAudio acquisition ran. The reviewed runtime bundle's existing loader files are documented in the original manifest; no additional mod component is introduced.

The publisher's [Enhanced announcement](https://www.lcpdfr.com/forums/topic/154528-lspdfr-for-gta-enhanced-edition-now-in-public-preview/) warns about NVMe/DirectStorage and links a fix with its own loader requirements. That establishes a known compatibility category, **not this handle owner or approval to install that fix**. No DirectStorage fix, alternative ASI loader, skip-check marker, guessed flag or unsupported Script Hook version is installed or proposed as a proven remedy here.

## Isolated reproduction

Eight expectations passed using newly authored files outside GTA and the original repository, compiled with the installed .NET Framework compiler. Source is [AppendProbe.cs](../tests/diagnostics/AppendProbe.cs); the offline runner reproduces them in ignored local storage.

| Scenario | Actual result |
|---|---|
| Append to existing file; create missing file; reader permits read/write sharing | All succeed |
| Reader denies writers; existing writer denies other writers | Both throw IOException **0x80070020** |
| Target is directory; target file is read-only | Both throw UnauthorizedAccessException **0x80070005** |
| Parent directory absent | DirectoryNotFoundException **0x80070003** |

These tests demonstrate the relevant mechanism without DirectStorage or another process; they do not reproduce RPH's internal race or determine its owner. [Microsoft FileShare documentation](https://learn.microsoft.com/en-us/dotnet/api/system.io.fileshare?view=net-7.0) and [.NET Framework StreamWriter source](https://github.com/microsoft/referencesource/blob/main/mscorlib/system/io/streamwriter.cs) explain the sharing distinction. No ACL or execution-policy setting was changed to run the tests.

## Smallest candidate change and next approval boundary

**No verified vendor-code fix is established.** The smallest candidate runtime change is to start the same reviewed RPH normally, **without enabling the optional “Restart with logging” diagnostic mode used in the failed attempt**. This tests whether avoiding the optional launcher-log append path permits initialization. The pre-logging UI already selected 1158.16; the failed launch used the logging restart. That is a hypothesis, not proof default logging prevents the collision. Do not invent a disable-log INI key or edit a binary to suppress errors.

Keep the previously verified original telemetry DLL/config/package for this experiment rather than changing its binary and launcher behavior simultaneously. The proposed logging-only change does not alter telemetry acquisition, 20 Hz cadence or background JSONL writing. The publication-copy configuration refactor is separately built/offline-tested and does not replace the old approved package automatically.

A separately approved controlled experiment would:

1. Reverify game version, original/backup hashes, all 26 absent destinations, process conflicts, Story Mode/BattlEye configuration and exact package. The original filename test remains the required reversible selection step. Do not deploy from sanitised placeholder manifests.
2. Run the publisher's normal launcher without re-enabling optional diagnostic logging. No new dependencies, DirectStorage workaround or security exceptions. Record the actual launch mode rather than assuming an undocumented flag works.
3. Require positive Enhanced 1158.16 identification, hook initialization, Story Mode and explicit RichAudio load; then at least a minute of genuine player telemetry with monotonic timestamps, declared missing fields and observed cadence. Only then proceed under the existing A–E acceptance plan.
4. Stop on any exception, unexpected version, conflict or instability. Preserve new logs/dump outside game, restore the old filename/hash, remove only unchanged introduced files, and verify original archives/root state. Never retry automatically.

For upstream-cause diagnosis, a **separately approved** bounded [Microsoft Process Monitor](https://learn.microsoft.com/en-us/sysinternals/downloads/procmon) capture could begin before launch, filtered to the exact launcher-log path across **all processes**, retaining CreateFile/WriteFile/CloseFile, access/share modes, timestamps and stacks. Filtering solely to RPH would miss an external opener. Correlate the failed open with the earlier successful incompatible handle and its close. The tool/driver, signatures, license/elevation, privacy and storage limit must be reviewed before use; it has not been installed or run. A failure trace may implicate the same RPH process, Enhanced, or another component. Do not choose a dependency workaround until that evidence or maintained publisher guidance supports it.

Success is successful hook/plugin/player capture without a new sharing failure or instability, followed by measured A–E results. A launch without a log is not proof of eliminated contention, long-range NPC telemetry or production readiness. A bounded next smoke test is justified as an experiment; it is **not authorised by this investigation request**. Phase 3 remains blocked.
