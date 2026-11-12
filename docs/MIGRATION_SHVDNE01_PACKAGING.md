# MIGRATION-SHVDNE-01 — RPH-free package architecture

Codex prepared an isolated build and package tool for my SHVDNE migration. It writes only fresh directories beneath this worktree's `.local/migration-shvdne-01`. It does not install files, launch GTA, execute an ASI or invoke an installer.

```text
candidate/
  package-receipt.json
  README.txt
  scripts/
    RichAudio.Shvdne.dll
    RichAudio/
      integration.json             # disabled by default
      package.json                 # bound private manifest or code-only marker
      payload/
        playable.json              # only with verified retained normal package
        runtime/RichAudio.Acoustics.Host.exe
        runtime/node.exe           # optional retained private input + its license
        src/acoustics/...
        tools/Run-Gameplay.mjs
        tools/soundmap/...
        sources/...                # optional verified PRIVATE retained input
      state/                       # created by worker after separately approved use
      logs/                        # per-session diagnostics
```

`ShvdnePackageLinks` resolves the copied payload's location at runtime and creates generated state pointers on an ordinary worker. Preferences stay in the existing payload `.local/acoustic-settings.json` format. Moving the folder refreshes only generated paths; it does not reset or copy someone else's saved preferences. A host-enabled configuration must match the payload manifest digest. The existing host then validates all bound assets, the exact executable and pinned SHVDNE API, and automatically owns its child-process lifetime. Normal game startup does not require a manually launched host.

`Build-Shvdne.ps1` builds the managed integration against the authentic API3 reference and rebuilds the existing audio host. `-IncludeProbe` additionally compiles the isolated test DLL outside the normal package. `Package-Shvdne.ps1` accepts the build receipt and optionally a retained **normal** `playable.json`; sealed demonstration manifests are rejected. Original retained inputs are hash-checked, then copied privately. The old RPH plugin and prerequisite record are omitted. Current RichAudio modules and the rebuilt host replace their old package counterparts. The resulting manifest omits `rphVersion` and adds the SHVDNE framework/version/API binding; telemetry remains wire version 1.

```powershell
.\tools\Build-Shvdne.ps1 -ApiPath <authentic-v1.1.0.6-API3-path> -IncludeProbe
.\tools\Package-Shvdne.ps1 -BuildReceipt <new-build-receipt> -RetainedManifest <normal-private-playable.json>
```

A package containing retained GTA-derived source assets is private and must not be published. A code-only package is useful for the initial passive smoke but cannot run the full audio host until a verified source package and runtime are supplied. These are prepared candidates, not claims of a releasable audio replacement.

The private manifest deliberately retains the exact absolute GTA executable path and hash from source preparation. Payload relocation within that installation is supported; cross-machine or different-game-directory distribution still requires a new local source-preparation/manifest binding. The migration does not silently rewrite an old executable approval to a different installation.

## Dependency ownership and redistribution

| Dependency | Candidate policy | Evidence / remaining requirement |
| --- | --- | --- |
| Script Hook V | User installed; not bundled | [Official distribution](https://www.dev-c.com/gtav/scripthookv/) identifies its runtime and ASI loader. This migration did not establish redistribution permission for those binaries. |
| ASI loader | User installed, exact identity separately bound | No new loader is installed or executed by the build/package tools. Avoid simultaneous conflicting loaders; exact proposed changes require a separate installation review. |
| SHVDNE v1.1.0.6 | User installed as one matching distribution; not bundled | [zlib license](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/v1.1.0.6/LICENSE.txt) permits redistribution under its conditions; [third-party notices](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/v1.1.0.6/THIRD-PARTY-NOTICES.md), copyright and bundled component notices must accompany any future bundled distribution. Keeping it separate avoids incomplete mixed-version deployment. |
| .NET Framework 4.8 / Visual C++ x64 runtime | User/system prerequisites | Upstream requirements; no automatic download or privileged installation. |
| Node | Reused only in the optional private package with `NODE-LICENSE.txt` | The retained license travels with the exact binary. A public release needs a separately selected supported distribution and complete notices. |
| RichAudio host / JS engine | Built/copied from existing source | No RPH references in the new integration/host assembly dependency graph. No synthesis or PCM algorithm was rewritten. |
| GTA-derived banks/catalogue/geometry | Private retained inputs only | No redistribution right is assumed. Preserve the existing local extraction/preparation and verification path. |
| CodeWalker preparation dependencies | Separate optional preparation configuration | Not bundled. Existing pinned preparation workflow and license/asset boundaries remain applicable. |
| Native RichAudio/third-party extension DLLs | Not silently copied from old packages | Additional native backend closures need explicit identity/license handling before bundling. The C++ recovery-adapter extension point is architectural only. |
| RPH | Retained original rollback implementation outside SHVDNE package | Neither normal SHVDNE startup, host binding nor generated pointers require it. |

The release layout uses a folder copy and manifest-based rollback, with no mandatory executable installer. An OIV could carry some files but cannot establish framework/runtime compatibility or validate all external dependencies. Existing `tools/playable/Setup.ps1` remains the RPH installer and is not reused for SHVDNE.

For a separately approved trial, back up every overwritten destination and record hashes, copy only the sealed manifest's files, and retain the original RPH assets unchanged. Rollback removes only those newly created files and restores exact originals; never remove the common `scripts` directory recursively. User settings and private source material remain separate from adapter replacement. Future Legacy and FiveM adapters can feed the same plain observations/wire contract without importing SHVDNE into the engine.
