# RPH append failure: postmortem investigation

## Recovery preflight — BLOCKED before deployment, 25 October 2026

The canonical private repository was fetched before this investigation. Both local HEAD and `origin/main` were `31840d3e91e745c04129463c61b362f22d35573d`. Work proceeds on `compat/rph-launcher-logging-recovery`, descended only from the sanitised history. The archival checkout was not used for Git development or modified.

The user's new authorization permits exactly one reversible runtime experiment **only after a supported mechanism disabling the specific launcher-log operation is verified**. That evidence gate has not passed. No deployment, executable rename, RPH/game launch, configuration edit, new dependency or security change was performed. The normal-start proposal in the earlier section remains a candidate, not a verified suppression mechanism. This is an evidence blocker, not a request to repeat the authorization already given.

### What was verified

- Authentic staged RPH **1.132.1428.17748**, 12,237,182 bytes, SHA-256 `73F05B3F7973D4731F4151AE061DD3C991065E8BF3ECE51EA1D9AB728B9B42AC`, matches the reviewed package. It is Authenticode-unsigned; provenance is the previously verified official package, not a claimed publisher signature. There is no deployed RPH executable currently in the game root.
- Both Rockstar executable signatures are valid. GTA5.exe remains **1.0.1013.34**, SHA-256 `FD330FAE0C92A52E0B277FBA8A6856C81BD931FC4FCD1D81FBA02772A2A814CF`; GTA5_Enhanced.exe remains **1.0.1158.16**, SHA-256 `69DA07FF67D05E9DED11289E597E8B8DC5855B0A429C085F37D148DC267CB2C5`. The independent pre-rename backup matches the older executable hash. The temporary rename destination is absent.
- All **26** previously approved source additions exist and match their original manifest hashes; all **26** destinations are absent. This includes the original reviewed telemetry DLL/config, not a silent substitution of the newer publication build.
- No GTA, RPH, FiveM, OpenIV or CodeWalker process was observed. Exact comparisons against the saved manifests found **zero differences** for 32 root-file size/hash records and 179 archive metadata records; all ten sampled archive SHA-256s also match. These are comparisons of the actual records, not acceptance based on counts. No original file requires restoration because none was changed.

### Logging-control evidence and limits

| Material checked | Establishes | Does not establish |
|---|---|---|
| Authentic bundle RPH_Readme | Ordinary executable startup is the documented launch procedure | No disable-log configuration, argument or initialization-order contract |
| Preserved Settings UI from this exact runtime/hash | “Restart with logging” explicitly enables startup logging in a restarted process | No explicit off control was observed; ordinary startup has not been proved to suppress every launcher-log append |
| Preserved INI/startup script and Advanced/Game settings text | Existing settings contain render/version text, plugin timeout, developer mode and console key; inspected advanced switches concern rendering/loading behavior | None is a verified control for RagePluginHookLauncher.log |
| Enhanced support staff instructions | `-log` enables collection of RagePluginHookLauncher.log | The inverse behavior in all 1.132 startup paths is not a documented disable contract |
| Legacy Game.LogVerbose API documentation | Runtime/plugin logging is filtered by verbosity in the old documented API | Applicability to this launcher's early logger or this runtime version |
| Narrow app-specific profile configuration inventory | No matching RPH app-data config or application registry key was located in the inspected locations | An exhaustive assertion that no other configuration store exists |

Relevant primary references: [Enhanced support staff on enabling launcher logging](https://www.lcpdfr.com/forums/topic/155261-unknown-game-has-crashed-when-trying-to-load-into-lspdfr/), [another Enhanced support case](https://www.lcpdfr.com/forums/topic/156124-rage-plugin-hook-doesnt-open/), and [the version-labelled Game.LogVerbose documentation](https://docs.ragepluginhook.net/html/M_Rage_Game_LogVerbose.htm). The latter labels v0.56 ALPHA and is not substituted for a v1.132 launcher specification. The vendor landing page, Documentation.aspx and documentation root returned 404 during this review; the specific legacy API page remained retrievable.

The recorded logged run already wrote its first dependency-check entry at **01:53:11.919 UTC**, before the first observed INI-path/read stage at **01:53:13.501 UTC**. Thus that log was active before the Settings/INI stage in the observed logged process. It is unsafe to invent a later INI/runtime-verbosity key and assume it prevents early startup writes. The sequence does not prove the logger's mode-selection implementation or behavior of a fresh ordinary process.

No new RPH process was executed in a staging folder: an off-game working directory alone is not a verified guarantee that RPH cannot discover/launch the installed game. The eight existing isolated .NET append tests reproduce sharing semantics, not RPH's log-mode switch. No protected binary was patched, unpacked or debug-hooked to manufacture an unsupported setting.

### Checkpoint results for this request

| Checkpoint | Status | Evidence |
|---|---|---|
| Supported suppression mechanism | **BLOCKED** | No version-specific verified control for the failing operation |
| A. Enhanced selection | **NOT TESTED** | Executable version/hash inspected; no new launcher run |
| B. Original 0x80070020 recurrence/avoidance | **NOT TESTED** | Prior dump conclusion unchanged; no new append attempt |
| C. Story Mode startup | **NOT TESTED** | No game process launched |
| D. RichAudio load | **NOT TESTED** | No runtime initialization |
| E. Live telemetry | **NOT TESTED** | Zero new player/NPC observations; unavailable data is not fabricated |
| Normal shutdown | **NOT TESTED** | No processes were started or needed closing |
| Installation integrity | **PASS** | Original names/hashes and exact root/archive comparisons match; 26 additions remain absent |

The [portable preflight record](../evidence/publication/rph-logging-recovery-preflight.json) records the verified inputs and decision. Raw configuration/event/dump details and local paths remain only in the protected local investigation area. No deployment journal is created or reused as though an experiment happened; the durable decision record states zero starts and zero installation mutations. The archived rollback procedure remains preserved but was not executed, altered or repinned.

### Smallest next justified step

Obtain a publisher-maintained answer/configuration reference for **RPH 1.132.1428.17748**: does a fresh normal process without the opt-in logging action disable **all RagePluginHookLauncher.log append calls before INI handling**, or is there a supported off/redirect control, and when is it read? Provide only the runtime version, target build, redacted failing basename/HRESULT and initialization timing. Do not send the private dump or contact the publisher automatically. This is narrower than installing a loader fix or repeating a game launch.

If that contract is established, the already conditionally authorized one-attempt plan can be prepared with fresh safety checks and the exact reviewed 26-file set. Otherwise, a separately scoped diagnostic plan must address the missing guarantee; do not reinterpret the current condition as approval to launch on an assumption. Phase 2 and full A–E testing remain blocked, and Phase 3 is not started.

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
