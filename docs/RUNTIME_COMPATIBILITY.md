# P2-01 runtime compatibility report

24 October 2026. **Selected target: RAGE Plugin Hook (RPH), a standalone managed plugin. Built against an authentic SDK; unverified in game.** No runtime or loader was installed and no RPH executable was launched.

## Why the Phase 1 integration choice changed

The installed `GTA5_Enhanced.exe` still reports 1.0.1158.16. Alexander Blade's [official Script Hook V page](https://www.dev-c.com/gtav/scripthookv/) still lists Enhanced 1158.13. It remains unsuitable as an assumed-supported 1158.16 dependency.

The [official LSPDFR Enhanced release](https://www.lcpdfr.com/downloads/gta5mods/g17media/52970-lspd-first-response-enhanced-preview/) states that the September 17, 2026 bundle updates RPH for Enhanced 1158.16. This is an explicit author support claim, not a local compatibility test. The LSPDFR gameplay version is 0.4.9 build 9695; **that is not an RPH binary version**. The exact supporting runtime binary has not been downloaded/fingerprinted/installed in this investigation and must be inspected before deployment.

[RPH's own description](https://ragepluginhook.net/About.aspx?lang=en-US) describes an independent CLI/.NET plugin interface. A plugin can target the RPH SDK without referencing LSPDFR assemblies. Our successfully compiled assembly references RPH and the .NET Framework only. It contains its own Plugin attribute/entry/exit methods and commands, and does not implement LSPDFR callouts or police gameplay. API compilation supports this separation; running that arrangement on the installed build is still UNTESTED.

Some RPH website root/download URLs returned HTTP 404 from both web and shell requests. Specific documentation pages were retrievable; several others failed. Those failures are recorded as access limitations rather than filled with guessed API signatures. The acquired SDK's actual metadata was used to verify the members compiled against.

## Authentic SDK and permitted use

Downloaded `RPH_SDK_3717.zip` from the attachment posted by **LMS** in the [official RPH SDK developer thread](https://www.lcpdfr.com/forums/topic/154295-rph-sdk/). A maintainer reply there says to use the current SDK DLL for Enhanced. The ZIP contains `RagePluginHookSDK.dll`, whose assembly name is `RagePluginHook`, version 0.0.0.0; file/product version **1.124.1393.17586**. Its real declared getters include Vehicle.EngineRevolutionsRatio, CurrentGear, IsEngineOn; Entity.Position, Velocity, Rotation, Orientation; PoolHandle.Value/Index/Counter; World.GetAllVehicles; GameFiber.Sleep; PluginAttribute and ConsoleCommandAttribute.

Archive SHA-256: `791145D78E99619189951FB8ABFF4CDA6353850AD2AC5F011B66F325CE2E9BA6`.
SDK DLL SHA-256: `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0`.

The [RPH download notice](https://ragepluginhook.net/Downloads.aspx/html?lang=en-US) forbids redistribution with plugins. The official SDK attachment authorizes the intended development use; it is not treated as an open-source redistribution license. We keep the SDK/ZIP in ignored `.local/rph`, reference it locally, and exclude it from Git and the RichAudio package. No third-party mirror, NuGet repack, homemade SDK stub, assembly rewrite, offset patch or signature edit is used. The actual runtime and its bundled dependency notices must be obtained from its author separately; our package does not redistribute them.

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

Pending: explicit installation authorization; acquisition and fingerprinting of the exact supporting RPH runtime and its dependency/license inventory; a clean standalone load without LSPDFR gameplay; supported single-player setup; then tests A–E. The official runtime download endpoint returned HTTP **403** in the shell and a redirect loop through the web tool; no access controls were bypassed and no mirror substituted. The artifact is a **built, offline-tested candidate**, not a validated runtime plugin. See [DEPLOYMENT.md](DEPLOYMENT.md).
