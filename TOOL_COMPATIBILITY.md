# Tool compatibility

**Phase 2 update:** the authentic RPH SDK 1.124.1393.17586 has been downloaded into ignored local development storage and used successfully to compile a managed telemetry-only plugin. The official Enhanced release advertises runtime support for 1158.16. Exact supporting runtime acquisition/preflight, installation authorization and in-game tests remain pending. See [RUNTIME_COMPATIBILITY.md](docs/RUNTIME_COMPATIBILITY.md) for hashes, source, licensing, SDK/runtime distinction and coexistence limitations. The dated Phase 1 C++ build-tools gap does not block this C# prototype; no new toolchain was installed.

Snapshot: 24 October 2026. Exact binary fingerprints are in `evidence/binary-versions.json`. A file's presence, a successful metadata parse and in-game compatibility are three separate claims.

## Local environment

| Component | Observed version/state | Classification |
|---|---|---|
| OS | Windows 11 Pro, 10.0.26200, 64-bit | VERIFIED, CIM |
| CPU | AMD Ryzen 7 5800X, 8 cores / 16 logical processors | VERIFIED, CIM |
| GPU | NVIDIA GeForce RTX 2080 SUPER | VERIFIED, CIM; no GPU acoustic benchmark |
| Physical memory | 34,264,506,368 bytes reported | VERIFIED, CIM |
| GTA Enhanced | `GTA5_Enhanced.exe` 1.0.1158.16, x64 | VERIFIED, file version / PE inspection |
| Co-located GTA5.exe | 1.0.1013.34 | VERIFIED; not treated as the current Enhanced build |
| Steam | app 3240220, local manifest build ID 25261616 | VERIFIED, appmanifest; not a running-game observation |
| PowerShell | 7.6.5; Windows PowerShell 5.1 also executed | VERIFIED |
| .NET Framework | registry Version 4.8.09221, Release 533509 | VERIFIED; Framework csc file 4.8.9221.0 |
| Git | 2.55.0.windows.3 | VERIFIED |
| Node | 24.19.0 | VERIFIED |
| MSVC / Windows SDK / CMake / modern dotnet SDK | Not located through PATH and checked standard installation paths | BLOCKED for building planned C++ adapter/renderer; not an exhaustive whole-disk assertion |
| Framework C# compiler | `Framework64/v4.0.30319/csc.exe` exists; Add-Type compiled the trace hash utility | VERIFIED; does not substitute for C++ build tools |

No existing repository was present at the new development directory. No project was created under the game installation. CPU/GPU details characterize this machine only; they are not measured acoustic capacity.

## Supplied CodeWalker

**VERIFIED:** folder is named `CodeWalker30_dev46`; binary versions report 1.0.0.0 / product 1.0.0 rather than a distinct dev build number. Use folder designation **and SHA-256** to identify it. `README.md` documents `CodeWalker.exe explorer` and `menu`, not a supported batch export CLI.

The first `CodeWalker RPF Explorer.exe` launch through Computer Use timed out and produced no visible CodeWalker window at the follow-up. Starting installed `CodeWalker.exe explorer` subsequently succeeded. GUI opened the real installation, listed audio configs and displayed the dat151 XML. No GUI save or edit-mode action was used. A base-file warning pane appeared in UI Automation; its presence is not evidence that files were edited.

The initial .NET Framework `Assembly.LoadFrom` call failed with `0x80131515`. Loading bytes from the existing installed assemblies succeeded. The inspection scripts use that approach without unblocking, rewriting or replacing the supplied files. SharpDX dependencies come from the supplied folder. This is not a standalone public CodeWalker SDK and must be kept version-pinned.

**VERIFIED:** offline RPF/REL/AWC parsing, two occlusion samples, one YBN. **UNTESTED:** REL compilation and save round trips, generic Enhanced graphics conversion, full map reconstruction and all file formats. The pinned current upstream source has newer descriptive field names and a Gen9-aware key-loading overload, while the supplied binary exposes an older two-string overload. Do not imply it was rebuilt from the inspected current source.

Upstream reference: [CodeWalker](https://github.com/dexyfex/CodeWalker), pinned source commit in [SOURCES.md](SOURCES.md). Consult its license before embedding or shipping its code. This repository does not redistribute it or keys extracted during read-only operation.

## OpenIV and OpenRPF

**VERIFIED:** OpenIV is installed at `__USER_HOME__\AppData\Local\New Technology Studio\Apps\OpenIV\OpenIV.exe`, file version 4.1.0.1502, product 4.1.0.0. It was inspected for version/presence, not launched or used to open Enhanced archives. Enhanced compatibility of this installation is **UNTESTED**.

**VERIFIED:** supplied `OpenRPF.asi` is 1,173,504 bytes, file/product version 0.1.0. Its fingerprint is recorded; it was never loaded into GTA. No loader is present in the supplied OpenRPF directory, which contains only this ASI. No `OpenRPF.asi`, `ScriptHookV.dll`, `dinput8.dll` or `dsound.dll` was found in the inspected game-root listing. The root's zero-byte `OpenIV.asi` cannot function as an executable plugin.

**VERIFIED author documentation [S6]:** OpenRPF is an Enhanced mods-folder archive loader; the author page lists 0.3 and describes later cache/compatibility fixes. Its old feature text and changelog disagree about bundling an ASI loader, so do not infer a loader from the page or this one-file download. **UNTESTED:** supplied 0.1.0 compatibility with 1158.16. Do not deploy it as a workaround for a mismatched scripting hook. No archive mounting or cache bypass was attempted in Phase 1.

## Scripting compatibility gate

**VERIFIED upstream [S7]:** Alexander Blade's official Script Hook V page currently lists v3889.0 / 1158.13, released 15 July 2026, supported Enhanced patch 1.0.1158.13. The installed executable is 1158.16. Compatibility with it is **not established**. No renamed executable, downgraded binary, injected compatibility patch or invasive hook is an acceptable silent workaround.

**VERIFIED upstream [S8]:** ScriptHookVDotNetEnhanced is an Enhanced/Legacy fork requiring Script Hook V and .NET Framework. The latest release inspected is v1.1.0.6, whose note fixes a pattern for Enhanced 1158.13. Its source exposes RPM, gear and throttle as memory-backed properties. These are useful research evidence, not permission to assume the patterns work on 1158.16. Upstream SHVDN and SHVDNE are distinct; do not install the Legacy-only project because its property names are familiar.

No SHVDN/SHVDNE binaries were installed here. A supported C++ Script Hook V adapter minimizes dependencies for native-only telemetry, but cannot magically supply a stock native RPM getter. SHVDNE is a candidate for optional RPM/gear telemetry only after its entire dependency chain and missing-value behavior pass P2-01. No alternative framework was installed or certified.

## Renderer candidates

**VERIFIED upstream [S9–S16]:** Steam Audio 4.8.1 provides a Windows C API with scene geometry, acoustic simulation and rendering effects; source is Apache-2.0. It is not an audio playback device or GTA plugin. Use the current license and component notices when distributing binaries; no SDK was downloaded or linked during this phase.

XAudio2 2.9 is a Windows playback/mixing option documented by Microsoft. It can accept rendered PCM; it does not add geometry or source separation. Proposed C++ builds need the Windows SDK. FMOD/Wwise are viable middleware integrations in Steam Audio's ecosystem, but GTA does not thereby expose a compatible plugin bus; middleware licensing and new runtime complexity do not remove that integration gap.

All renderer startup, latency, endpoint recovery and performance tests remain **UNTESTED**. Recheck upstream versions and exact supported game patches immediately before Phase 2.
