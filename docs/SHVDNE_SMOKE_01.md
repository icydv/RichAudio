# SHVDNE-SMOKE-01 — Stage 1 preparation and authorization package

**Codex prepared one passive, RPH-free exact-build smoke attempt. It is not installed, authorized or executed.** The work is confined to `C:\Users\Libby\Documents\RichAudio-SHVDNE01`, branch `feature/migration-shvdne-01`. No migration was repeated, no acoustic engine was rewritten, and no Stage 2–5 action is authorized by this preparation.

The authoritative [execution and rollback procedure](SHVDNE_SMOKE_01_PROCEDURE.md) is bound by the new execution manifest. It supplies entry checks, the complete file/action list, one bounded launch/reload, objective evidence and restoration. The private preparation root is `.local/migration-shvdne-01/smoke-01-preparation`; no future `execution-01` directory exists yet.

| Sealed item | SHA-256 |
| --- | --- |
| `execution-manifest.json` | `198bca6890eb588aec06c0433f5f664c5158d3117937998e1747026cb8cd0124` |
| Stage 1 `RichAudio.Shvdne.dll` | `226a1ca8695acd9a31485791faed0e421e569a793f214c984c75d11e25ae2acc` |
| Staged `integration.json` | `a9c10282eabd7ba6406e0a72f6bf3a0250d691adedfe9a8273c1644ddb57b685` |
| Retained SHVDNE v1.1.0.6 archive | `f10da8819fa6814fb0a04553567d2516934eac96b16af06ad8f315f0da00473a` |
| Authentic matching API3 | `1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48` |

The manifest binds 26 procedure/evidence/deployment files, including the eight installed-file candidates, exact dependency identities, configuration, rollback baselines and test receipts. It records `liveAuthorized:false` and `installed:false`. Individual paths, bytes and hashes are in `deployment-plan.json`, `file-identities.json` and `release-verification.json`; no hash placeholder is being used.

The installed game is Enhanced **1.0.1158.16**, SHA-256 `b48e80f5fc899eb89e5dcc9f3b68e9551cc8dcfac78b2a940b207e569e9987ea`. Existing `ScriptHookV.dll` is file version **3889.0.1158.13**, SHA-256 `126be57ca9dca00e471f9de611766009c900aad88f89ae6c2926ec62e5aaeb4f`. Existing `dinput8.dll` is file version **1.0.0.1**, SHA-256 `9fd9e02353b7d39fe07b9667f7ea2697229a7f2d0e7d389eb79eb212b1bb181d`. These are preserved user-installed inputs, not newly downloaded replacements.

The complete matching SHVDNE distribution is retained in `.local/shvdne-reference`. Codex compared every staged ASI/API/INI/MinHook file byte for byte with the retained release ZIP, whose digest matches the retained upstream asset metadata. API3 assembly version is **3.9.0.0**; its file version is **3.9.0**. The SHVDNE ASI's file version is **3.9.0.6**, despite the distribution tag being v1.1.0.6. These different version domains are recorded accurately. No runtime dependency source is missing from the prepared package.

SHVDNE is not currently installed in the game root. Its installation remains part of the separately approved eight-file deployment, not a completed prerequisite observation. Codex found all required files locally and downloaded/installed no alternative. If any required input is missing, altered or incompatible at entry, the procedure stops rather than substituting a dependency.

The machine is Windows x64, with .NET Framework release **533509**, version **4.8.09221**, and installed Visual C++ x64 runtime **v14.50.35719.00**. Static PE/header/import inspection passed for the game, SHV/loader and SHVDNE runtime/API files; required imported-file candidates are present. This does not demonstrate CLR/ASI initialization in GTA.

The [official SHV page](https://www.dev-c.com/gtav/scripthookv/) and [SHVDNE v1.1.0.6 release](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/releases/tag/v1.1.0.6) identify Enhanced **1.0.1158.13**. Exact `.16` compatibility is still unproven. The retained historical SHV initialization log supports the existing installed SHV path, without establishing this new SHVDNE stack. The [pinned SHVDNE requirements](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/v1.1.0.6/README.md) call for matching release files, the shipped INI, .NET 4.8 or later and the Visual C++ x64 runtime. Codex did not bypass any version check or add a compatibility patch.

The normal Steam app is **3240220**. Its selected launch-options entry is already exactly `-nobattleye`, with no RPH redirect. No Steam/launcher setting is changed by the proposal. The selected entry is rechecked at execution; the whole mutable Steam configuration file must not be overwritten for rollback.

Codex recovered and independently rehashed the original final build, all **253 files** in `final-private-package-02`, its receipt, final preservation verification and matching release inputs. The original adapter SHA-256 `fc3af327a6900a88c91a8b31716532850a890afee62a59c2ecf521a2594e96b7`, original host, separate profile probe and private assets remain preserved. That private candidate was not modified or published.

One reproducible smoke-readiness issue justified a narrowly scoped rebuild: when the host is disabled, the original script's journal contains counters/raw vehicles but omits the captured listener pose. A passive Stage 1 could therefore not independently review its camera values. The verbatim original diagnostic-object expression fails the new camera-packet check. Codex preserved the old source copies and made only these related changes:

| File | Change |
| --- | --- |
| `src/acoustics/bridge/Shvdne/RichAudioScript.cs` | Retain the already captured plain listener for diagnostics, clear it when unavailable/context is lost, and include it plus the validated player handle in the bounded journal packet. No extra GTA acquisition, audio rendering or filesystem work was added to Tick. |
| `src/acoustics/bridge/Shvdne/ShvdneGameSource.cs` | Expose the player-ped handle already validated by `StoryReady`; clear it before every readiness evaluation. No new native, offset or mechanical getter was introduced. |
| `tests/host/TestShvdneGameSource.cs` | Add a case establishing initial absence, validated identity and clearing when Story readiness is lost. |

The rebuilt adapter targets Windows x64 / .NET Framework 4.8 and compiles against the same authentic pinned API3 with warnings treated as errors. The canonical build tool also emitted an unchanged-source audio-host build; that executable is not in the Stage 1 deployment and will not be launched. The earlier qualified build is retained intact. There is no rebuild intended to force `.16` compatibility.

| Focused offline verification | Result |
| --- | --- |
| Actual observation boundary/provider with authored API responses | **32 cases / 127 assertions passed**, including the new validated-player diagnostic case and existing listener parity, optional-getter refusal, identity and execution-context checks. |
| Actual journal expression / pure listener serialization | **6 checks passed**. The old expression fails for the missing camera snapshot; the updated expression preserves pose, orientation, clocks/provenance, player identity, passive flags and null-unavailable state. This fixture executes no script/native. |
| Existing configuration/package/actual assembly metadata | **41 checks passed**, including the original candidate's 248 immutable payload bindings. |
| Actual minimal Stage 1 package-link path | **6 checks passed**: enabled passive config, one adapter/no host, empty-payload bootstrap, settings containment, preference preservation and refusal to activate a host with the code-only descriptor. |

These suites have different units and are not combined into a synthetic total. Their logs are retained with the new build receipt. A first diagnostic-fixture compilation used the wrong pure helper name; the corrected fixture uses the actual `Protocol` class. The failed directory and corrected evidence are separate. No product change was made to accommodate that test-command error. No broad engine/performance rerun was represented as live qualification.

The deployed tree is a tested minimal projection, not a recursive copy of the normal private package. Its eight files are the five unchanged matching runtime dependencies and `scripts/RichAudio.Shvdne.dll`, `scripts/RichAudio/integration.json`, `scripts/RichAudio/package.json`; it also creates an empty payload directory. The audio host, Node, JS payload, private source banks, world data and profile probe stay outside GTA. The staged configuration enables only passive observations and disables the menu, both optional mechanical providers, host, SoundMap and world warmup. Generated settings/logs stay inside the newly owned RichAudio subtree.

The future procedure temporarily parks only the pinned `TrainerV.asi` and `OpenRPF.asi` using exact per-file backups, while retaining the pinned DirectStorageFix/StraightToStoryMode ASIs. Original RPH executables/configuration and `Plugins/RichAudio.dll` stay unchanged and are not launched. The manifest assumes the eight destinations and `scripts` tree remain absent; a changed destination requires a revised review. The proposed runtime is RPH-free, but its actual live absence must still be established from fresh launcher/loader/script evidence.

Stage 1 has one launch, up to ten minutes of ordinary startup, two minutes for initialization from playable Story Mode, five minutes from the first diagnostic tick, and an absolute seventeen-minute ceiling from game-process start. One normal Insert reload is included without resetting the deadline. Initialization, active-session/player identity, camera/vehicle observations, no unexpected exceptions, passive scope, normal reload/exit and exact restoration each need their own evidence. Failures, invalid admitted observations, missing evidence or cleanup uncertainty stop the attempt. No crash/forced-termination test or automatic relaunch is included.

All installation and rollback steps are specified in the bound procedure: verify source/destination assumptions, back up protected originals/logs/settings, park two files, create/hash eight files individually, preserve new evidence on exit, remove only unchanged manifest-owned files, restore exact originals and remove created directories only when empty. There is no recursive deletion of a shared scripts tree, replacement of unrelated saves/launcher metadata or overwrite of a concurrent change. No installed change has occurred, so no current rollback action is needed.

Remaining exact-build risks are SHVDNE/SHV `.13`-to-`.16` version/pattern behavior, native/CLR initialization, the built-in memory-backed nearby-vehicle pool despite disabled optional mechanical telemetry, callback/enumeration cost, and ordinary script-abort/domain-reload behavior. The final journal drain is best-effort, so normal lifecycle logs and cessation of the old session must corroborate cleanup. Mechanical signal validity, real IPC/audio rendering, SoundMap/performance, UI parity and native profile ownership remain later, separately authorized stages. A plausible observation or successful smoke does not prove physical RPM, complete internal audio identity, suppression, sound-mod preservation or crash-safe recovery.

The bound procedure supplies separate entry criteria, proposed bounds, evidence, cleanup and stopping conditions for Stages 2–5. None can start automatically after Stage 1. In particular, the PROFILE-02 acoustic admission failure is not bypassed by changing integration framework.

The **exact proposed fresh authorization** is retained at `.local/migration-shvdne-01/smoke-01-preparation/FRESH_AUTHORIZATION.txt`. It names execution-manifest SHA-256 `198bca6890eb588aec06c0433f5f664c5158d3117937998e1747026cb8cd0124` and adapter SHA-256 `226a1ca8695acd9a31485791faed0e421e569a793f214c984c75d11e25ae2acc`, the eight files, two parked ASIs, normal Steam route/reload, complete bounds and restoration. That text is a request template, not authorization granted by this preparation.

Final verification is recorded in `verification-final.json`: original migration sources/artifacts are preserved except the three deliberately changed source/test files, whose original bytes are archived; original private packages, RPH worktree status, protected `Build-Menu02.ps1`, installed game/plugin files and settings remain unchanged. All task writes are confined to this SHVDNE worktree. No game/ASI/probe/audio-host execution, endpoint activation, process-memory inspection, native profile assignment, installation, commit, push, merge, publication or release occurred. Codex stopped for my explicit authorization.
