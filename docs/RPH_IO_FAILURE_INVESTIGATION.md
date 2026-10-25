# RPH append failure: postmortem investigation

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
