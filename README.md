# RichAudio

Physically informed acoustic research for **GTA V Enhanced, PC, single-player**.

## Phase 2.1 deployment review

The user-supplied official Enhanced bundle now matches its publisher checksum. Its RPH **1.132.1428.17748** runtime is inventoried in the separate development workspace. [Readiness report](docs/PHASE2_1_READINESS.md) and [exact proposed manifest](evidence/phase2.1/deployment-manifest.json) cover 26 currently absent game-file destinations, rollback, bounded logging and numerical A–E criteria. A missing checked VC++ 2010 x64 prerequisite has a signed Microsoft installer staged **but not run**. No GTA files or launcher/security settings were changed. Actual standalone startup, API binding, DirectStorage compatibility and all in-game telemetry/performance results remain unverified. Explicit installation approval is required; this is a conditional first-load proposal, not gameplay validation.

## Phase 2 current status

**Built but unverified in game:** P2-01 now has a runtime-independent C# telemetry library, a standalone RAGE Plugin Hook adapter, bounded asynchronous JSONL logging, offline analysis and tested mocks. The [official Enhanced release](https://www.lcpdfr.com/downloads/gta5mods/g17media/52970-lspd-first-response-enhanced-preview/) advertises RPH support for 1158.16, so RPH is the selected candidate instead of assuming unsupported Script Hook V compatibility. Compilation used the authentic author-hosted SDK and the existing .NET Framework compiler; no C++ toolchain installation was needed.

See [implementation](docs/TELEMETRY_IMPLEMENTATION.md), [runtime compatibility](docs/RUNTIME_COMPATIBILITY.md), [deployment boundary](docs/DEPLOYMENT.md), [NPC investigation](docs/NPC_STREAMING.md) and [executed validation](docs/PHASE2_VALIDATION.md). No runtime, loader or plugin has been installed into GTA. Live telemetry, meaningful tracking distances, game stability and frame-time impact remain unverified. Explicit deployment authorization and exact runtime preflight are still required. No acoustic renderer, sound replacement or native audio modification is implemented.

```powershell
.\tools\Test-Telemetry.ps1
.\tools\Build-Telemetry.ps1           # requires reviewed SDK in .local/rph/sdk
.\tools\Test-Telemetry.ps1 -BuildAdapter
.\tools\Package-Telemetry.ps1         # writes only build/, never installs
```

The following Phase 1 sections remain a dated record of commit `e00878d`; current telemetry implementation supersedes their unimplemented-source description.

Phase 1 investigation date: **24 October 2026**. This repository is a technical foundation, not an installed mod or working audio overhaul. No game was launched, no runtime hook was installed, and no original game archive was written.

## Result

**VERIFIED:** the supplied game, CodeWalker and OpenRPF files are accessible. CodeWalker dev46 opened the installed audio archive and displayed `game.dat151.rel` in its GUI. Its supplied core assembly parsed base, update and selected DLC audio metadata. A Bati reference chain reaches distinct player/NPC AWC containers; those containers were loaded and their stream tables inspected. A collision resource and interior occlusion metadata also parsed.

**INFERRED:** a hybrid system with a small game telemetry adapter, locally extracted acoustic geometry, owned source audio and an independent Steam Audio/XAudio2 renderer is the strongest candidate. Source generation and native audio coexistence are as important as propagation.

**BLOCKED:** the installed Enhanced executable is **1.0.1158.16**, while the official Script Hook V page lists **1.0.1158.13** support. No compatible scripting installation was found in the game root. C++ build tools and a Windows SDK were not found in PATH or the standard locations checked. A full overhaul is **not yet demonstrated feasible**: selective engine isolation, reliable NPC telemetry and population coverage remain gates.

## Development location and inputs

All RichAudio work is in `__USER_HOME__\Documents\RichAudio`, outside the game and supplied tool folders.

Read-only inputs:

- `__GAME_ROOT__`
- `__USER_HOME__\Desktop\CodeWalker30_dev46`
- `__USER_HOME__\Downloads\6d0158-OpenRPF`

The existing game root contains an empty `OpenIV.asi`; that is not a working plugin. OpenIV 4.1 is installed elsewhere. OpenRPF 0.1.0 is present in Downloads, not installed by this investigation. Having a backup does not change the read-only boundary.

## Read the investigation

| Document | Purpose |
|---|---|
| [GTA_AUDIO_RESEARCH.md](GTA_AUDIO_RESEARCH.md) | Actual resources, Bati chain, native limits |
| [TOOL_COMPATIBILITY.md](TOOL_COMPATIBILITY.md) | Exact local versions, dependency gates |
| [TELEMETRY_MATRIX.md](TELEMETRY_MATRIX.md) | Direct, memory-backed, derived and unavailable inputs |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Candidate integration, renderer and performance budgets |
| [ACOUSTIC_DESIGN.md](ACOUSTIC_DESIGN.md) | Physical source and propagation model |
| [EXPERIMENT_PLAN.md](EXPERIMENT_PLAN.md) | Exact Phase 2 entry experiment and four scene designs |
| [ROADMAP.md](ROADMAP.md) | Stages and measurable acceptance criteria |
| [RISKS.md](RISKS.md) | Failure modes, stop conditions and fallbacks |
| [SOURCES.md](SOURCES.md) | Evidence identifiers, pinned upstream source and URLs |
| [evidence/](evidence/) | Hashes, derived counts and small reference summaries |

Classification used everywhere: **VERIFIED** = directly observed local data/action, or explicitly identified upstream source fact; **INFERRED** = reasoned interpretation; **UNTESTED** = proposed behavior/experiment; **BLOCKED** = missing dependency prevents the test. Source/API verification is never equivalent to an in-game test.

## Reproduce offline inspection

Windows PowerShell 5.1 is used for the supplied .NET Framework CodeWalker assembly. PowerShell 7 can read the resulting XML and JSON. The system's script policy blocked `-File` initially; the investigation used `-ExecutionPolicy Bypass` **only for the child process**, with no persistent policy change. Review the scripts before using the same process option.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\Inspect-GameAudio.ps1 -LoadKeys
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\Trace-VehicleAudio.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File .\tests\Test-Phase1.ps1
```

Run from this repository. Input and output paths can be supplied as parameters. The inspector rejects output beneath any of the three protected input roots, scans with the supplied CodeWalker core, exports REL/vehicle metadata under ignored `.local/`, and hashes each physical archive before and after reading. It does not call archive save/create/delete methods. `Trace-VehicleAudio.ps1` resolves a selected model using those local XML exports; default `bati`. It is a focused base/update tracer, not a complete GTA DLC mount resolver.

The supplied core exposes a two-string `GTA5Keys.LoadFromPath` overload. Key initialization against the supplied game directory succeeded; the exact executable selection inside this older binary was not independently instrumented. A legacy-named `GTA5.exe` is present alongside `GTA5_Enhanced.exe`. Its presence does not make it the current game executable or prove all Enhanced resource formats are supported. Keys are held in memory and never exported.

The GUI was started with the installed `CodeWalker.exe explorer` command after the separate RPF Explorer launcher timed out. Navigation opened `x64\audio\audio_rel.rpf\config` and the REL viewer. No editing or save action was used. UI evidence is described in [evidence/GUI_OBSERVATIONS.md](evidence/GUI_OBSERVATIONS.md).

## Repository boundaries

`src/telemetry` now contains the core, RPH adapter and analyzer; `src/acoustics` and `src/playback` remain unimplemented component contracts. `tools/` contains read-only investigation utilities and development-only build/test/package scripts. `.local/` contains dependencies, proprietary exports and captures and is ignored. `evidence/` contains derived facts, hashes, reference identifiers and test measurements, never audio samples or mesh coordinates. The sole committed JSONL fixture is explicitly authored mock data.

No Rockstar audio, geometry, executables, keys or third-party binaries belong in Git. The repository has no redistributable asset license yet. Steam Audio, CodeWalker and other dependencies retain their own licenses; none is vendored here.

## Phase 1 completion boundary

The requested investigation deliverables and accessible resource trace are complete. Runtime feasibility has been assessed from source and documented as untested/blocked; runtime validation, a clean handoff, full world geometry extraction and acoustic benchmarks are **incomplete**. The next step is experiment **P2-01**, a telemetry-only Story Mode logger on an explicitly supported build. Do not implement the full renderer until its gates pass.
