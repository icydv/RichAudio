# P2-01 runtime compatibility report

**25 October offline RPM follow-up:** [source comparison and gated decision](RPM_SOURCE_INVESTIGATION.md), [versioned capability inventory](../evidence/publication/rpm-source-review.json). No alternative public RPH RPM route was established; SHVDNE/LeFix use independent memory readers but lack a verified complete 1158.16 dependency chain here. An upstream SHVDNE issue names executable 1158.16 while labelling its patch 1158.13; that does not certify its RPM getter. Keep the proven RPH integration and current validation. No runtime or installation change was made during this review.

**Current recovery, 25 October 2026:** one controlled test of authentic DirectStorageFix **1.2** plus Alexander Blade's standalone **xinput1_4.dll 1.0.0.2** allowed **RPH 1.132.1428.17748 / Enhanced 1158.16** to pass the previous sharing failure, reach Story Mode and load the unchanged telemetry adapter. Genuine player/NPC observations were captured. The Script Hook V scripting DLL was not installed; its advertised 1158.13 support is not being extended to 1158.16. This is one tested loader/fix/runtime combination, not general update compatibility. All 27 revised additions were removed and original integrity independently verified. [Source/loader review, exact changes, measurements and limitations](RPH_IO_FAILURE_INVESTIGATION.md).

**Remaining gate:** the subsequent [bounded drivetrain investigation](P2_01_DRIVETRAIN_VALIDATION.md) exposed a constant finite player scalar through stationary revving and driving, not a trustworthy 0–1 RPM ratio. Gear changes are partially corroborated on one road car; reverse/neutral semantics, wider classes and distant fidelity remain unverified. The SDK/runtime version difference is recorded but not established as the cause. Native audio ownership and OpenRPF coexistence are still untested. No acoustic rendering or sound change occurred. Earlier installation/pending/unresolved-owner statements below are historical checkpoints superseded by the current evidence.

**Postmortem update:** a matching existing crash dump identifies HRESULT **0x80070020** and **RagePluginHookLauncher.log** as the blocked append target. The incompatible handle owner is unresolved; DirectStorage is not established as its cause. See [investigation and approval boundary](RPH_IO_FAILURE_INVESTIGATION.md). No subsequent game experiment occurred.

**Current, 25 October 2026:** the approved temporary filename test positively identified Enhanced 1.0.1158.16 and launched its real executable with `-nobattleye`. RPH then crashed with an unhandled IOException in an append operation before successful hook/plugin/Story Mode verification. All 26 additions were removed and original integrity verified. Standalone API binding and OpenRPF coexistence remain untested. The previous pending-selection/approval paragraphs below are historical records. See [actual Enhanced attempt](P2_01_ENHANCED_RUNTIME_ATTEMPT.md); no additional deployment is part of the architectural update.

**Phase 2.2 investigation:** current Steam depots exclude GTA5.exe and positively match GTA5_Enhanced.exe; normal Rockstar logs select 1158.16. The community-supported temporary alias rename is a strongly corroborated diagnostic, with an independent verified backup and no-overwrite procedure prepared. No official explicit selector or local causal confirmation has been established. Both original filenames remain intact; new rename/redeployment approval is pending. [Selection report and proposal](PHASE2_2_EXECUTABLE_SELECTION.md).

**Latest authorised attempt:** RPH 1.132 ran after approved deployment but its Settings UI reported unsupported 1.0.1013.34, matching the version of the existing GTA5.exe, rather than the expected GTA5_Enhanced.exe 1158.16. Target-selection cause is unproved. The attempt stopped before game startup; all 26 additions were rolled back, original-file checks match, and VC2010 remains installed. No RichAudio plugin load or telemetry occurred. See [the actual report](P2_01_FIRST_RUNTIME_ATTEMPT.md). The earlier statements below describe pre-deployment findings.

24 October 2026. **Selected target: RAGE Plugin Hook (RPH), a standalone managed plugin. Built against an authentic SDK; unverified in game.** No runtime or loader was installed and no RPH executable was launched.

**Phase 2.1 update:** the authentic user-supplied runtime archive is now acquired and checksum-verified. Actual RPH version: **1.132.1428.17748**. See [full readiness report](PHASE2_1_READINESS.md) for hashes/signatures, missing checked VC2010 x64 dependency, SDK comparison limits, NVMe caveat and the exact conditional deployment proposal. Acquisition is resolved; installation and live validation remain pending.

## Why the Phase 1 integration choice changed

The installed `GTA5_Enhanced.exe` still reports 1.0.1158.16. Alexander Blade's [official Script Hook V page](https://www.dev-c.com/gtav/scripthookv/) still lists Enhanced 1158.13. It remains unsuitable as an assumed-supported 1158.16 dependency.

The [official LSPDFR Enhanced release](https://www.lcpdfr.com/downloads/gta5mods/g17media/52970-lspd-first-response-enhanced-preview/) states that the September 17, 2026 bundle updates RPH for Enhanced 1158.16. This is an explicit author support claim, not a local compatibility test. The LSPDFR gameplay version is 0.4.9 build 9695; **that is not an RPH binary version**. Phase 2.1 fingerprinted its actual RPH 1.132.1428.17748 binary; it has not been installed or executed.

[RPH's own description](https://ragepluginhook.net/About.aspx?lang=en-US) describes an independent CLI/.NET plugin interface. A plugin can target the RPH SDK without referencing LSPDFR assemblies. Our successfully compiled assembly references RPH and the .NET Framework only. It contains its own Plugin attribute/entry/exit methods and commands, and does not implement LSPDFR callouts or police gameplay. API compilation supports this separation; running that arrangement on the installed build is still UNTESTED.

Some RPH website root/download URLs returned HTTP 404 from both web and shell requests. Specific documentation pages were retrievable; several others failed. Those failures are recorded as access limitations rather than filled with guessed API signatures. The acquired SDK's actual metadata was used to verify the members compiled against.

## Authentic SDK and permitted use

Downloaded `RPH_SDK_3717.zip` from the attachment posted by **LMS** in the [official RPH SDK developer thread](https://www.lcpdfr.com/forums/topic/154295-rph-sdk/). A maintainer reply there says to use the current SDK DLL for Enhanced. The ZIP contains `RagePluginHookSDK.dll`, whose assembly name is `RagePluginHook`, version 0.0.0.0; file/product version **1.124.1393.17586**. Its real declared getters include Vehicle.EngineRevolutionsRatio, CurrentGear, IsEngineOn; Entity.Position, Velocity, Rotation, Orientation; PoolHandle.Value/Index/Counter; World.GetAllVehicles; GameFiber.Sleep; PluginAttribute and ConsoleCommandAttribute.

Archive SHA-256: `791145D78E99619189951FB8ABFF4CDA6353850AD2AC5F011B66F325CE2E9BA6`.
SDK DLL SHA-256: `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0`.

The [RPH download notice](https://ragepluginhook.net/Downloads.aspx/html?lang=en-US) forbids redistribution with plugins. The official SDK attachment authorizes the intended development use; it is not treated as an open-source redistribution license. We keep the SDK/ZIP in ignored `.local/rph`, reference it locally, and exclude it from Git and the RichAudio package. No third-party mirror, NuGet repack, homemade SDK stub, assembly rewrite, offset patch or signature edit is used. The actual runtime and its bundled dependency notices are now retained from the authentic user-supplied package in ignored local staging; our package does not redistribute them.

## Documented telemetry surface

The [World.GetAllVehicles documentation](https://docs.ragepluginhook.net/html/M_Rage_World_GetAllVehicles.htm) describes the currently exposed vehicle set and entity validity across fiber yields. It does not promise every visual distant traffic representation is a simulated entity. Reads here happen on one game fiber without yielding between enumeration and a single observation; each entity is still checked and exceptions are contained.

The [engine ratio documentation](https://docs.ragepluginhook.net/html/P_Rage_Vehicle_EngineRevolutionsRatio.htm) describes a ratio rather than calibrated crankshaft RPM. Its historic idle/off examples are hypotheses to compare in test A/B, not proof of current Enhanced behavior. RPH handles the implementation behind its public getters; RichAudio does not add memory hooks or offsets. A supported framework can still return stale/zero data on some NPCs; syntactic availability is not semantic reliability.

The [GameFiber API](https://docs.ragepluginhook.net/html/Methods_T_Rage_GameFiber.htm) provides cooperative Sleep/Yield. The prototype uses Stopwatch deadlines, not a frame counter. Execution still depends on RPH/game-fiber scheduling: low frame rate or a stalled game can miss deadlines. It records lateness/skipped intervals instead of invoking game APIs from an unsafe timer thread. The [exit-point contract](https://docs.ragepluginhook.net/html/P_Rage_Attributes_PluginAttribute_ExitPoint.htm) distinguishes graceful and forceful unload; only the graceful exit callback polls for a bounded writer drain.

## OpenRPF and ASI coexistence

Current game-root inspection found only the existing zero-byte `OpenIV.asi`; no RPH, ScriptHookV.dll, OpenRPF.asi, dinput8.dll, dsound.dll or xinput1_4.dll was present there. The supplied OpenRPF 0.1.0 remains in Downloads. This is **availability, not an installed OpenRPF runtime**.

RPH does not provide the same function as OpenRPF: the former loads managed runtime plugins, the latter redirects archive loading. Their conceptual independence is not a compatibility guarantee. No official compatibility assurance for this exact old OpenRPF binary plus the supporting Enhanced RPH runtime was established. Coexistence is UNTESTED. RichAudio telemetry needs neither OpenRPF nor an ASI loader, so the first authorized test should avoid adding either to the baseline. Do not silently install or replace proxy DLLs to make both work.

The official LSPDFR release page also describes an Enhanced/DirectStorage configuration caveat involving proxy components. It is a deployment issue to resolve with the exact author-supported bundle, not authorization to install an extra fix here. No DirectStorage/anti-cheat/security workaround was attempted. If the supported Story Mode setup is unavailable or requires an unapproved extra component, deployment stays blocked.

## Alternatives

- **Script Hook V / SHVDNE:** Phase 1 source knowledge is retained, but the exact 1158.16 support gap remains. No extra raw memory reads were added to bridge it.
- **FiveM/RAGE Multiplayer:** a different multiplayer runtime/world is not equivalent to the requested single-player baseline; Cfx-specific RPM getters cannot be imported as stock native declarations.
- **Custom injection, offsets or signature fixes:** excluded by the project constraints. No need to develop one while a maintained framework advertises this build.

RPH is therefore the strongest current candidate. The C# implementation also avoids the previously missing C++/Windows SDK toolchain: the installed .NET Framework compiler successfully builds it with warnings treated as errors. This is a narrow evidence-driven adapter change; it does not change the acoustic architecture or authorize Phase 3.

## Deployment gate

Phase 2.1 resolves runtime acquisition, fingerprinting and dependency/license inventory using the user-supplied authentic archive. Pending: explicit installation approval, VC2010 x64 prerequisite review, supported single-player launch, any actual DirectStorage conflict, standalone load/member binding and tests A–E. Earlier shell/web download failures remain historical evidence; no controls were bypassed. The artifact is a **built, offline-tested candidate**, not a validated runtime plugin. See [PHASE2_1_READINESS.md](PHASE2_1_READINESS.md) and [DEPLOYMENT.md](DEPLOYMENT.md).
