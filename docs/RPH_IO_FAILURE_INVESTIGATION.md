# RPH append failure: postmortem investigation

## Current result: DirectStorageFix recovery and first live capture

**25 October 2026: one authorised launch completed.** RPH 1.132.1428.17748 selected Enhanced 1.0.1158.16, DirectStorageFix 1.2 initialised its registration hook, RPH advanced beyond the previous sharing exception, Story Mode loaded, and the unchanged RichAudio adapter produced genuine player-vehicle and NPC observations. All temporary installation changes were restored and independently verified. This is a limited integration smoke test, not A–E certification or release readiness. [Portable measurements and exact relative deployment manifest](../evidence/publication/directstoragefix-result.json).

The sections below this new report retain the original postmortem. Their unresolved-owner and proposed-logging-test statements describe earlier evidence. [PR #2](https://github.com/icydv/RichAudio/pull/2) established that no verified logging-disable mechanism existed; [PR #3](https://github.com/icydv/RichAudio/pull/3) subsequently identified the immediate DirectStorage/RPH conflict with ProcMon. Neither PR was merged for this investigation; the branch started at canonical sanitised main `31840d3e91e745c04129463c61b362f22d35573d`.

### Prior diagnosis and diagnostic cleanup

The preceding trace showed the game opening the launcher log with Generic Read / Share Read through a `dstoragecore.dll` stack, followed approximately 3.6 seconds later by RPH's write-open sharing violation. That establishes the immediate incompatible access for that attempt, not a permanent leak or universal launch behaviour. No repeat kernel capture was needed here.

Windows had restarted: the observed boot time was **11:43:00.500Z**. Supported `fltmc filters` inspection found **PROCMON25 absent**, with no ProcMon process. Both preflight and post-restoration checks passed. Retained ProcMon application settings were left untouched; the prior cleanup approval rejection was not bypassed. No driver, service, security setting or registry entry was forcibly removed.

### Corrective candidate review

[Author source at `1728ae079ea10b292ba9bb35c91eb36ba0781895`](https://github.com/alloc8or/DirectStorageFix/tree/1728ae079ea10b292ba9bb35c91eb36ba0781895) was reviewed against the [published 1.2 package](https://www.gta5-mods.com/scripts/directstoragefix). The ZIP SHA-256 matched the publisher's linked scan identifier. The ASI is unsigned. Its compile timestamp, nine seconds after that commit, and distinctive logging/import evidence support correspondence, but there is no signed source attestation, reproducible build or verified 1.2 source tag. Public source availability does not establish redistribution rights. No explicit project redistribution licence was found in the inspected source/package; only the author's intended private installation was exercised. No third-party code or binaries are vendored or redistributed.

The existing native MinHook detour intercepts `fiDeviceDirectStorage::RegisterFile`, forwarding only names whose extensions exactly match `.rpf` or `.cache`. It changes runtime registration, not archive bytes. It uses the author's existing runtime-image pattern, checks the Enhanced executable name and rejects game builds below 1013; it does not explicitly allowlist 1158.16. Missing pattern and MinHook failures log and return; a loaded ASI alone is insufficient because `DllMain` still returns success. Logging begins during process attachment, before hook setup. It can remove an old fix log, so both possible output locations were checked absent before deployment.

This is a native hook with loading/stability risk: first-match pattern selection, runtime-image dependence, early initialisation and registration filtering remain update-sensitive. An offline scan found no pattern match in either on-disk executable; this was recorded as inconclusive because disk bytes do not establish the eventual runtime image. No pattern, offset, executable content or fix source was changed. The single test then supplied positive runtime evidence: `Init started` **15:29:41.208Z**, `Game build: 1158.16` **15:29:41.210Z**, `Init finished` **15:29:41.240Z**, followed by allowed archive/cache registrations. This verifies the relevant hook ran early enough in this launch, without guaranteeing future builds. PE inspection found only Windows system imports; MinHook, logging and CRT dependencies are statically linked in the examined binary.

### ASI loader and exact deployment difference

The fix author's required `xinput1_4.dll` and LCPDFR Enhanced support guidance point to the loader in [Alexander Blade's official distribution](https://www.dev-c.com/gtav/scripthookv/). Its scripting runtime still advertises Enhanced **1158.13**. That scripting runtime was **not installed**. The separately examined XInput proxy has no ScriptHookV import or delay import; Enhanced imports XInput directly and the loader independently enumerates ASIs. Publisher acquisition used the official download link and normal page Referer, without a mirror or access-control bypass.

The approved RPH bundle's 34,816-byte XInput DLL (version 6.2.9200.16384) was replaced only as a known temporary addition by the official 133,632-byte ASI loader, version **1.0.0.2**, build 22 March 2025. Neither is claimed Microsoft-signed. The revised final manifest contains **27 paths**, not the unchanged 26: replace that one introduced loader, add `DirectStorageFix.asi`, retain the original telemetry DLL, and explicitly redirect only its JSON configuration's output directory to ignored development storage. Capture initially remained disabled. All other original configuration values were preserved. No ScriptHookV.dll, dinput8.dll, NativeTrainer.asi, args.txt, OpenRPF or LSPDFR gameplay plugin was added. Script Hook's archive prohibits redistribution; the loader is retained privately only.

The private overlay journal records holding and restoring the old introduced loader/config before the original 26-file rollback. Sources and final hashes were verified before mutation, every destination was absent, no original file was overwritten, and `_GTA5.exe` was absent before the no-overwrite rename. The original helper's scope/hash guards were reused; its explicit private-plan and ignored-attempt-directory parameters match the previously reviewed PR #3 refactor.

### One launch and checkpoint evidence

The launcher was started once with the established `-forcesettings -log` configuration. Optional logging was deliberately retained, making this a test of the storage correction rather than a guessed logging switch. Settings reported 1158.16; startup plugins were disabled and the script was empty. The normal Steam launch confirmation used the existing launcher-generated parameters; the game process was independently verified to include the previously approved `-nobattleye` option. No Online session was entered. A front-end Online tab being visible is not an Online gameplay test: only Story Mode was selected.

| Checkpoint | Result | Evidence |
|---|---|---|
| Correct Enhanced executable | PASS | Signed, pinned executable; RPH settings, fix version log, game-process metadata and session header agree on 1158.16 |
| DirectStorageFix loaded and initialised | PASS | ASI loader success plus `Init finished` and actual registration-hook messages |
| Previous sharing failure avoided | PASS for this attempt | Launcher wrote past `Waiting for game window` to `Hooking game instance` at 15:29:43.691Z; runtime log and functional console followed; no matching application failure event |
| RPH startup | PASS | Interoperability completed; functional F4 console in Story Mode |
| Story Mode | PASS | Playable single-player character and vehicle observed |
| RichAudio initialisation | PASS | Manual `LoadPlugin RichAudio.Telemetry.Rph.dll` at 15:32:16.845Z, responding status command and session writer |
| Genuine vehicle telemetry | PASS, limited | Player vehicle and non-player observations in the closed JSONL session; detailed validity limitations below |
| Stable controlled shutdown | PASS for observed session | Stop, status, unload and footer; normal quit prompt completed by the user; processes exited without forced termination |
| Full restoration | PASS | Exact original baseline comparisons, not counts alone; details below |

Absence of the old exception plus advancement demonstrates recovery behaviour. Without a new file-I/O trace, it does not independently prove the exact handle lifecycle during this launch. The loader successfully loaded DirectStorageFix; it also reported failure to load the pre-existing zero-byte `OpenIV.asi`, which was preserved. RPH warned about existing RTSS/D3D12 coexistence and logged swap-chain reinitialisation. No graphics or overlay setting was changed; there was no observed crash. These warnings remain conditions to control in future performance work. An initial console input lost a separating space and produced an unknown-command message; the complete verified command then loaded the plugin once. This was not a second runtime launch.

### Genuine capture: measured results and limits

The original approved adapter DLL remained `DBC5F600C37AD7579F49EBA92A352BEE1AAF452F6EF820CEF87B86B8547D5BE0`; no renderer or acquisition change was introduced. The user-controlled player entered and drove a pickup during this same rural smoke test. The existing session header still says "built but unverified" because that immutable binary predates this evidence; the new result does not silently alter that historic header.

| Measurement | Actual result |
|---|---:|
| Sample records / first-to-last span | 2,113 / 105.6064731 s |
| Observed cadence | 19.9987741 Hz |
| Interval p95 / scheduling delay p95 / maximum delay | 56.6863 / 13.3070 / 41.2784 ms |
| Acquisition p95 / maximum | 0.1825 / 9.7618 ms |
| Processing p95 / maximum | 0.0154 / 1.2530 ms |
| Queue drops / missed deadlines / sequence gaps | 0 / 0 / 0 |
| Invalid JSON / nonmonotonic samples | 0 / 0 |
| Vehicle observations / session tracking IDs | 7,505 / 20 |
| Player / driver-present non-player / unoccupied observations | 786 / 3,019 / 3,700 |
| Returned available-vehicle count | 2–6 |
| Census-truncated samples / budget omissions / source-limit omissions | 10 / 1 / 0 |
| Rejected field values, all out-of-range RPM ratios | 5,621 |

Observed listener camera position/rotation and vehicle model, pose, velocity, engine state, gear, handle and role fields were captured. They are SDK readings with limited visible corroboration, not calibrated physical instrumentation. Listener orientation/velocity, vehicle acceleration and Euclidean distance are estimates. The camera is a listener proxy, not a verified native audio listener. Ped position/velocity are not separately recorded by this adapter. Engine load and actual crankshaft RPM remain unavailable.

**Every player (786) and driver-present NPC (3,019) RPM reading was rejected as outside [0,1].** The remaining 1,884 in-range readings were exclusively on unoccupied entities and do not establish valid operating-engine RPM. Raw rejected values were intentionally discarded by the existing adapter, so this capture cannot determine their magnitude or why the getter returned them. Do not broaden the accepted range or assume a distant-LOD explanation. Player gear was always 1 in captured observations; API availability is established, but gear-change correctness is not. Public SDK/build binding and property semantics must be reviewed before drivetrain certification.

Lifecycle evidence includes 20 first observations, 15 invalid-entity events, one `despawn_or_stream_out`, 20 tracking terminations and unavailable-telemetry events. All 20 observed pool indexes had only one counter each; no handle generation recycling was demonstrated. There were no duplicate tracking IDs within any sample. A termination may reflect shutdown or observation loss, not confirmed physical destruction.

The largest sampled driver-present non-player distance was **3,494.327 m**, model hash **3013282534**. This is a getter-derived position/distance, not a verified road-traffic streaming radius. Source category, visual identity, physical units and distant fidelity were not validated. Its RPM was unavailable. NPC-selected distance-band observation counts were **663, 226, 479, 877, 561 and 213** for [0,25), [25,50), [50,100), [100,200), [200,400) and [400,infinity) metres respectively, with zero usable RPM in every NPC band. Enumeration was capped/aged and selected by prefix rather than distance. No urban comparison, maximum-access boundary, LOD/synthetic-traffic attribution or acoustic audibility limit can be concluded.

Four lightweight process samples over **92.6217 s** measured **317.546875 CPU seconds**, about **3.428 logical cores / 21.428% of 16 logical processors**, and **3,962.8–4,060.1 MiB** working set for the entire game. They are not RichAudio CPU overhead. Acquisition plus processing timestamps likewise exclude native framework costs outside those intervals and other asynchronous work. No baseline A/B, frame-time trace or audio measurement was made; frame-time impact remains NOT TESTED. No new matching Application 1000/1001/1026 failure event was found in the bounded launch window. Manual unload logged `ThreadAbortException` as RPH aborted the plugin fiber; the writer still closed with a valid footer. This is an unload diagnostic to distinguish from an unhandled launcher/game crash, not proof of perfect shutdown internals.

### Restoration and next milestone

The 27 final deployment paths are absent; original exe names and valid signatures returned. Original hashes:

- `GTA5.exe`: `FD330FAE0C92A52E0B277FBA8A6856C81BD931FC4FCD1D81FBA02772A2A814CF`.
- `GTA5_Enhanced.exe`: `69DA07FF67D05E9DED11289E597E8B8DC5855B0A429C085F37D148DC267CB2C5`.

All **32 original root files** matched path, size and SHA-256; **179 archive records** matched exact relative path, size and write timestamp; **10 sampled archive hashes** matched. Original root directory sets also matched. Seven new log/config/script files and a new `ExecuteCode/Code1.cs` containing only a UTF-8 BOM were preserved privately and removed from the game. Existing empty OpenIV.asi remained unchanged. No game/RPH/ProcMon process or PROCMON25 filter remained. The approved shared VC2010 prerequisite and existing launcher preferences were retained. The original archival checkout and independent backup each still matched all **9,359** saved file fingerprints, and the Git bundle hash matched. Raw logs, original capture, package binaries, source snapshots and deployment journals remain private outside Git.

This removes the observed launcher blocker for one tested combination. It does not validate RPH across updates or complete P2-01. Keep RPH as the current adapter candidate; a replacement integration is not justified by this successful recovery alone. The next smallest step is an **offline public-API/SDK review of the rejected RPM getter and a separately authorised bounded idle/drive validation**, retaining invalid-value handling and collecting only the diagnostic detail needed to explain rejection. Full A–E certification should follow drivetrain verification and add controlled road/aircraft categorisation, urban/rural distance tests, generation reuse, frame-time baseline and repeated stability evidence. No further launch, permanent installation or Phase 3 work is authorised by this report.

---

## Historical initial postmortem

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
