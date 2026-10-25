# Evidence and sources

25 October RPM follow-up: [cross-framework investigation and permanent source links](docs/RPM_SOURCE_INVESTIGATION.md), [versioned reviewed-commit/capability inventory](evidence/publication/rpm-source-review.json), and [unsubmitted vendor reproduction](docs/RPH_RPM_VENDOR_REPRO.md). This refresh distinguishes memory-backed SHVDNE/IKT getters, HUD estimation, Cfx-only natives and exact-build support gaps; it includes no new live test or redistributed source/binary.

Checked 24 October 2026. Local observations are primary evidence for this installation. Upstream reverse-engineering code is primary evidence for what that project implements, not an official Rockstar guarantee. Web support/version claims are time-sensitive and must be refreshed before deployment.

## Local evidence index

| ID | File / observation | What it supports |
|---|---|---|
| E1 | `evidence/archive-integrity.json`, `evidence/final-archive-check.json` | Ten unique physical archives, byte lengths, SHA-256 and matching before/after and final observations |
| E2 | `evidence/rel-summary.json` | Forty-five distinct parsed RELs, type, record count and extracted byte length |
| E3 | `evidence/vehicle-trace.json`, `evidence/bati-override-search.json` | Bati model/hash references, sound/container paths, sampled override search |
| E4 | `evidence/bati-awc-summary.json` | Actual loaded Bati AWC format/stream counts and names; no samples |
| E5 | `evidence/geometry-summary.json` | Two occlusion samples and one collision resource; derived counts only |
| E6 | `evidence/GUI_OBSERVATIONS.md` | Recorded CodeWalker navigation/viewer actions seen through Computer Use |
| E7 | `evidence/binary-versions.json`, `evidence/environment.json`, `evidence/telemetry-api-inventory.json` | Binary versions/fingerprints, selected machine/tool facts and native-declaration presence |
| E8 | `evidence/validation.json` | Final repository/synthetic-fixture/consistency checks actually executed |

Raw XML, all archive filename inventories and parser summaries remain in ignored `.local/inspection`, `.local/extra`, `.local/trace-resources`, `.local/geometry` and `.local/dlc`. They are local derivatives of proprietary files and are not distributable repository fixtures. Logs in the Codex conversation contain actual command results and GUI captures; the prose GUI observation file is a navigation record, not an independent screenshot artifact or a runtime audio test.

## Pinned source checkouts (local `.local/`, not committed)

- CodeWalker: `485d56bec00262ed7fa472261cce7bbc6202b96e`.
- Cfx native definitions: `3432156872baedaf18421bebb238f511468e6b0a`.
- Original ScriptHookVDotNet: `a44cd7648b162a1f511ca6ffc9cfc43f7840ae94` (comparison source, not chosen for Enhanced deployment).
- ScriptHookVDotNetEnhanced: `b5314686ab534d9cec8914625a0f5ab2dde528ea`.

The upstream CodeWalker source commit is **not** asserted to be the source of the supplied dev46 binary. Local binary hashes identify what actually parsed the game. Repeating a source checkout requires network access; rerunning local inspection does not.

## Primary source catalog

| ID | Link | Use and limit |
|---|---|---|
| S1 | [CodeWalker RpfFile](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/RpfFile.cs), [REL parser](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/FileTypes/RelFile.cs), [AWC parser](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/FileTypes/AwcFile.cs) | Read/archive/metadata structure; newer labels may differ from supplied DLL |
| S2 | [CodeWalker Bounds](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/Resources/Bounds.cs), [README](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/README.md) | Collision representations and documented explorer mode |
| S3 | [FORCE_USE_AUDIO_GAME_OBJECT](https://github.com/citizenfx/natives/blob/3432156872baedaf18421bebb238f511468e6b0a/AUDIO/ForceUseAudioGameObject.md) | Profile assignment declaration, not tested gain/restore semantics |
| S4 | [_SET_VEHICLE_SILENT](https://github.com/citizenfx/natives/blob/3432156872baedaf18421bebb238f511468e6b0a/VEHICLE/SetVehicleSilent.md) | Community door/horn observation; not proven engine mute |
| S5 | [SET_AUDIO_VEHICLE_PRIORITY](https://github.com/citizenfx/natives/blob/3432156872baedaf18421bebb238f511468e6b0a/AUDIO/SetAudioVehiclePriority.md) | LOD hint and historical community voice-limit observation |
| S6 | [OpenRPF author release page](https://www.gta5-mods.com/tools/openrpf-openiv-asi-for-gta-v-enhanced/) | Author's mods-folder features/changelog; supplied binary is older than 0.3 |
| S7 | [Alexander Blade Script Hook V](https://www.dev-c.com/gtav/scripthookv/) | Official runtime/SDK and exact supported patches listed at research time |
| S8 | [SHVDNE Vehicle source](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/b5314686ab534d9cec8914625a0f5ab2dde528ea/source/scripting_v3/GTA/Entities/Vehicles/Vehicle.cs), [README](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced), [releases](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/releases) | Enhanced fork, memory-backed RPM/gear/throttle and release support scope |
| S9 | [Steam Audio source/version](https://github.com/ValveSoftware/steam-audio), [license](https://github.com/ValveSoftware/steam-audio/blob/master/LICENSE.md) | 4.8.1 and Apache-2.0; review dependency notices separately |
| S10 | [Steam Audio geometry](https://valvesoftware.github.io/steam-audio/doc/capi/geometry.html) | Coordinate conventions |
| S11 | [Scene API](https://valvesoftware.github.io/steam-audio/doc/capi/scene.html) | Static and rigidly instanced geometry/materials |
| S12 | [Simulation API](https://valvesoftware.github.io/steam-audio/doc/capi/simulation.html) | Direct/indirect simulation controls and parameters |
| S13 | [Direct effect](https://valvesoftware.github.io/steam-audio/doc/capi/direct-effect.html), [reflection effect](https://valvesoftware.github.io/steam-audio/doc/capi/reflections-effect.html) | Rendering stages and buffer/tail responsibilities |
| S14 | [Path effect](https://valvesoftware.github.io/steam-audio/doc/capi/path-effect.html), [baking](https://valvesoftware.github.io/steam-audio/doc/capi/baking.html) | Path field rendering and precomputation APIs; not general full-wave diffraction proof |
| S15 | [Steam Audio integration](https://valvesoftware.github.io/steam-audio/doc/capi/integration.html) | Engine/audio integration and cross-thread result transfer |
| S16 | [XAudio2 introduction](https://learn.microsoft.com/en-us/windows/win32/xaudio2/xaudio2-introduction), [callbacks](https://learn.microsoft.com/en-us/windows/win32/xaudio2/xaudio2-callbacks), [GetPerformanceData](https://learn.microsoft.com/en-us/windows/win32/api/xaudio2/nf-xaudio2-ixaudio2-getperformancedata) | Playback API, callback constraints and statistics; no native GTA routing implied |
| S17 | [Cfx native corpus](https://github.com/citizenfx/natives/tree/3432156872baedaf18421bebb238f511468e6b0a), [shape test](https://github.com/citizenfx/natives/blob/3432156872baedaf18421bebb238f511468e6b0a/SHAPETEST/StartShapeTestLosProbe.md), [material result](https://github.com/citizenfx/natives/blob/3432156872baedaf18421bebb238f511468e6b0a/SHAPETEST/GetShapeTestResultIncludingMaterial.md) | Source declarations for telemetry/raycast candidates; Cfx-only additions excluded from stock-native claims |

No third-party tutorials or aggregator compatibility claims are used as proof of Enhanced support. General acoustic equations are design calculations; they are not reverse-engineered GTA behavior. All threshold/performance numbers in the plans are proposed budgets unless explicitly identified as local parsed values.

## Phase 2 additions — 24 October 2026

- [Official Enhanced release](https://www.lcpdfr.com/downloads/gta5mods/g17media/52970-lspd-first-response-enhanced-preview/): September 17 RPH compatibility announcement for 1158.16. The gameplay build number is not the runtime binary version; the runtime download attempt returned 403/redirect-loop and was not bypassed.
- [Official RPH SDK thread](https://www.lcpdfr.com/forums/topic/154295-rph-sdk/): LMS's actual attachment was downloaded and inspected locally; maintainers describe SDK use with Enhanced. DLL fingerprint/version and source provenance are in `evidence/phase2/runtime-research.json`. This SDK is never redistributed.
- [RPH About](https://ragepluginhook.net/About.aspx?lang=en-US), [redistribution notice](https://ragepluginhook.net/Downloads.aspx/html?lang=en-US): official indexed content supplied standalone .NET plugin/redistribution context; direct root/download requests also returned 404 during research. Those access failures are recorded, not replaced with unofficial mirror claims.
- [Vehicle engine ratio](https://docs.ragepluginhook.net/html/P_Rage_Vehicle_EngineRevolutionsRatio.htm), [World.GetAllVehicles](https://docs.ragepluginhook.net/html/M_Rage_World_GetAllVehicles.htm), [fiber methods](https://docs.ragepluginhook.net/html/Methods_T_Rage_GameFiber.htm), [exit-point contract](https://docs.ragepluginhook.net/html/P_Rage_Attributes_PluginAttribute_ExitPoint.htm), [console-command name](https://docs.ragepluginhook.net/html/P_Rage_Attributes_ConsoleCommandAttribute_Name.htm): public API behavior/limitations. Historic docs are not gameplay evidence; actual SDK metadata was also checked. In particular, ConsoleCommandAttribute's string constructor is a description, so command names are assigned explicitly through its Name property.

Phase 2 evidence is separate under `evidence/phase2/`: actual compiler/output fingerprints, metadata/static API audit, source fingerprints, authored-mock tests/benchmarks and analyzer output, preserved Phase 1 test rerun, input hash verification and package manifest. The Phase 1 `evidence/validation.json` remains its original dated result; reruns use a separate ReportPath. `tests/fixtures/mock-session.jsonl` is explicitly synthetic. None of these artifacts establishes in-game operation.
