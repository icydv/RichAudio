# Phase 2.2: RPH Enhanced executable-selection investigation

24 October 2026, continuing `e3fc0e0`. **Read-only investigation completed; rename, redeployment and a new smoke test await explicit approval.** Both game executables retain their original names and hashes. All work/backup files are in the separate RichAudio workspace. The telemetry implementation is unchanged.

## Findings and origin assessment

| Property | GTA5.exe | GTA5_Enhanced.exe |
|---|---|---|
| Version | 1.0.1013.34 | 1.0.1158.16 |
| Size | 55,203,448 bytes | 55,819,384 bytes |
| SHA-256 | FD330FAE0C92A52E0B277FBA8A6856C81BD931FC4FCD1D81FBA02772A2A814CF | 69DA07FF67D05E9DED11289E597E8B8DC5855B0A429C085F37D148DC267CB2C5 |
| Windows Authenticode | Valid, Rockstar Games | Valid, Rockstar Games |
| OriginalFilename | GTA5_Enhanced.exe | GTA5_Enhanced.exe |
| File description | Grand Theft Auto V Enhanced | Grand Theft Auto V Enhanced |
| Created, UTC | 2026-06-18 18:26:44.7295415 | 2026-09-16 18:13:33.7937905 |
| Last written, UTC | 2026-04-08 21:57:34.3405456 | 2026-09-16 18:12:17.7275041 |

For London these are June 18 19:26:44 BST / September 16 19:13:33 BST creation, and April 8 22:57:34 BST / September 16 19:12:17 BST modification. Filesystem dates are observations, not proof of who copied/renamed a file or its original installation method. Signatures establish that these bytes pass the current Windows Authenticode check; they do not establish the correct current filename or how the file arrived here.

Both share Rockstar signer thumbprint `AD00A9C3007FD1450A559D0634547B075AD3E688`, with timestamp-signing certificates naming 2025 and 2026 responders respectively. Each has only its normal data stream; no Zone.Identifier download-origin stream is present. The hard-link query returned only each file's own name. Neither is a junction/symbolic link. See [executable inspection](../evidence/phase2.2/executable-inspection.json).

The current Steam appmanifest identifies **Enhanced app 3240220, installed build 25261616**, last updated 16 September 2026. A dependency-free reader inspected **all six installed depot manifests**, with 297 file entries in total, including the shared launcher depot. None lists GTA5.exe. The current executable depot instead lists GTA5_Enhanced.exe, GTA5_Enhanced_BE.exe and PlayGTAV.exe; all three actual file SHA-1s match their manifest content hashes. Steam's app-info cache has a valid binary payload SHA-1 and names **PlayGTAV.exe** as its Windows launch entry. No Steam verification/download/update was performed. These are local cached installation records, not independently revalidated CDN signatures. See [Steam origin evidence](../evidence/phase2.2/steam-origin.json).

Rockstar's existing `launcher.log`, lines 193–199, records its 21 October launch path as GTA5_Enhanced.exe, checks version 1.0.1158.16 and reports Enhanced up to date. The Enhanced install-registry path and installscript also point to this installation. Only narrowly allowlisted version/path log lines were exported; no account IDs, authentication fields or raw command lines were committed.

**Classification:** GTA5_Enhanced.exe is the current Steam-managed Enhanced executable. GTA5.exe contains an older, signed Enhanced executable under an alternate filename and is **extra to the current installed depot file set**. It is consistent with an obsolete compatibility copy. OpenIV is locally configured to use this Enhanced folder, and the community discussion describes that exact OpenIV compatibility pattern. However, no local copy/rename provenance record establishes that OpenIV created this file, or who created it. The user explicitly says they did not create it. **Its creator and exact original purpose remain unknown.** Do not attribute it to the user or call it a current Steam-required compatibility file.

## Selection hypothesis and source quality

The [March 2026 Enhanced support discussion](https://www.lcpdfr.com/forums/topic/155663-rage-plugin-hook-is-stuck-on-launching-game/) contains a March 19 explanation by Ouxlaw: an extra GTA5.exe can cause RPH to favour Legacy selection; temporary renaming preserves OpenIV use later. Community Team member Gan Ceann acknowledges the finding. This is community support on the official support site, not a published RPH author API/configuration guarantee.

The local RPH 1.132 Settings screenshot from the previous attempt reports unsupported 1013.34, exactly the extra file's version. Current Steam/normal Rockstar launch records point to the different 1158.16 file. Together these make executable-name precedence the **strongest supported explanation**. They do not prove RPH's exact file-open order: the previous attempt emitted no game-root launcher/runtime log and stopped before a game process existed. The source thread's third-party logs are not substituted for local launch evidence. Causality remains pending a controlled selection experiment.

The publisher's [Enhanced release](https://www.lcpdfr.com/downloads/gta5mods/g17media/52970-lspd-first-response-enhanced-preview/) advertises 1158.16 support. The staged executable is the reviewed 1.132.1428.17748 binary, SHA-256 `73F05B3F7973D4731F4151AE061DD3C991065E8BF3ECE51EA1D9AB728B9B42AC`. A wrong/old runtime download is not supported by the local fingerprints.

## Explicit selection/configuration investigation

**No supported explicit Enhanced executable selector was established.** This means none was verified in the checked material; it does not prove that none exists.

- The authentic bundle's RPH_Readme describes folder-based installation/startup and the plugin console. It supplies no executable override syntax, INI template or Enhanced-selection switch. The archive contains no separate SDK/configuration reference establishing one.
- Current game-root probes find no RagePluginHook.ini, startup.rphs, commandline.txt, RagePluginHook.log or RagePluginHookLauncher.log. No configuration was saved in the previous failed first-run attempt. The preserved UI text covers General settings; unseen Advanced/Game settings controls are not claimed inspected.
- The publisher's Downloads and Documentation pages returned 404 when checked. Retrievable SDK/version documentation concerns older APIs and does not establish a current executable selector. Focused official-domain searches did not establish `GameExecutablePath`, `ForceEnhanced` or an `-enhanced` selection contract. No guessed key/flag is proposed.
- The support discussion suggests starting ordinary single-player before RPH as a diagnostic; its original poster reported that this did not resolve their case. That is not proof an explicit selector exists, nor sufficient evidence to prefer it over the documented filename-conflict experiment on this host.
- RPH's already-observed **Restart with logging** button explicitly describes startup logging. It can be used after approval to collect new launcher evidence without inventing command-line syntax or adding a new commandline file. No new RPH process was started during this investigation.

The proposed mechanism is therefore **temporarily hide the extra filename**, leaving the current Enhanced file unchanged. It is community-described and corroborated, **not yet locally verified**. Positive selection proof is mandatory before gameplay/telemetry proceeds.

## Reversibility and dependency assessment

An independent backup now exists at `__USER_HOME__\Documents\RichAudio\.local\phase2.2\pre-rename\GTA5.exe`. It is 55,203,448 bytes and its SHA-256 exactly matches the original. The backup was created with CreateNew and verified; it is ignored by Git. `_GTA5.exe` is currently absent. The proposed rename and its reversal stay in the same game directory and use the two-argument [System.IO.File.Move](https://learn.microsoft.com/en-us/dotnet/api/system.io.file.move) operation, which refuses an existing destination. A prior absence check alone is not treated as overwrite protection. A rename changes the filename, not executable contents/signatures; restoration must still be hash-verified.

For the required smoke-test components, the current Steam depots do not require GTA5.exe, ordinary Rockstar launch records select Enhanced, and RichAudio accepts only GTA5_Enhanced.exe 1158.16. The telemetry source does not reference the old filename. OpenRPF/other ASI loaders are not installed or required; the pre-existing empty OpenIV.asi is preserved. This provides a bounded basis for the experiment, **not a universal guarantee that no third-party component depends on the extra name**.

OpenIV may rely on that compatibility name. CodeWalker key/path probing may also rely on conventional executable naming; neither dependency is exercised or bypassed during the live experiment. Keep both tools closed while it is hidden and restore the original name before using them. No file is permanently removed and no game verification/update is run. Any required component failure is a stop condition, not permission to replace a binary or add another compatibility component.

## Exact proposed operation — approval required

[controlled-test-plan.json](../evidence/phase2.2/controlled-test-plan.json) lists the exact rename, backup, executable pins and **the same 26 runtime/plugin/config additions** with source/destination/hash/size. All 26 destinations remain absent. VC2010 x64 is already installed and is not proposed for reinstallation. No new audio/renderer dependency or commandline file is included.

1. Obtain new explicit approval for the temporary rename, redeployment and one controlled Enhanced startup test. The earlier runtime approval does not authorise the newly proposed rename, and this task explicitly requests a fresh boundary.
2. Immediately re-run the Steam/executable inspection, source/signature/hash checks and all 26 absence checks. Stop for game/root/staging drift, a reparse point, `_GTA5.exe` already existing, or any GTA/RPH/OpenIV/CodeWalker process. Confirm supported Story Mode launch with the existing -nobattleye setting; no security settings change.
3. Create a fresh phase2.2 journal and snapshot. Recheck the independent backup; perform only `GTA5.exe -> _GTA5.exe` using the no-overwrite move. Verify the renamed file's expected SHA-256, absence of GTA5.exe, and unchanged Enhanced hash. If verification fails, stop and restore safely.
4. Add only the listed 26 files with CreateNew and per-file receipt/hash verification. Do not re-run the old attempt's blocked Install helper or overwrite its receipts. Keep capture disabled and no startup gameplay plugins. New runtime settings/logs produced by the configured RPH session are journalled separately, including RagePluginHook.ini/startup.rphs if created; do not overwrite a pre-existing unreviewed configuration.
5. Start the authentic RPH normally. Before launching GTA, require positive UI/log evidence of **Enhanced 1.0.1158.16 supported**. Enable startup logging through the publisher UI if needed. Stop on any different target/version or unsupported condition. No forced version check, offset/signature modification or binary replacement.
6. Conduct **one game startup attempt** into Story Mode. Require the actual process path to be GTA5_Enhanced.exe, its expected file hash/version, and an RPH runtime log identifying Enhanced. Then load RichAudio alone and require a session header with the correct game/framework version, nonempty telemetry, command registration and graceful footer. If adequate target/log evidence is unavailable, report the experiment inconclusive and stop; do not silently count a Settings version label alone as successful in-game integration.
7. Only after that smoke test succeeds and the deployment remains authorised/compatible, run A–E under the existing telemetry-only procedure. Record field quality, cadence, drops, instability and distance-band coverage. The eight-source prefix remains a censored sample, not a measured global streaming radius. Do not modify source limits or add measurement dependencies silently.
8. After the experiment, successful or stopped: exit GTA/RPH; preserve diagnostic files and captures; move only unchanged introduced manifest files back to development quarantine, preserving edited/generated files for ownership review. Restore `_GTA5.exe -> GTA5.exe` with the same no-overwrite operation. Verify the original old SHA-256 and current Enhanced SHA-256, original root-file state and archive baseline. The proposal restores the old name and removes the temporary deployment even after a successful test.

If a new GTA5.exe appears while the experiment is running, **do not overwrite it**. Stop with both files preserved and the independent backup intact; compare hashes and request review. If the renamed file is unavailable, recover from the verified backup only after confirming the original destination is absent, and restore original creation/write metadata from the snapshot. Never delete the extra file as cleanup. No procedure can guarantee collision-free restoration after an external program creates a new destination; the guarantee is that this procedure refuses to overwrite it.

## Investigation validation and completion

The Steam metadata reader is new development code using Node built-ins only. **Seventeen parser tests passed**, exercising exact large manifest IDs, encrypted-name rejection, corrupt/truncated containers, duplicate keys/sections, app-info payload SHA-1 validation and unknown-format rejection. Real cache parsing verifies its app-info binary SHA-1 and all three listed executable content hashes. **Ten Windows rename-safety checks passed** using authored development text files to test no-overwrite moves, a newly occupied restoration path, and a byte/timestamp-preserving round trip. No game executable was renamed. **108 Phase 1/export/syntax/link checks passed.** These tests validate the inspection/restore procedure, not RPH's runtime selection. Post-investigation checks also match all 32 original root-file hashes, all 179 archive metadata entries and the ten previously investigated archive hashes; see [integrity evidence](../evidence/phase2.2/post-investigation-integrity.json).

Evidence: [Steam records](../evidence/phase2.2/steam-origin.json), [executable/signature/backup/launcher inspection](../evidence/phase2.2/executable-inspection.json), [proposed experiment](../evidence/phase2.2/controlled-test-plan.json), [parser tests](../evidence/phase2.2/metadata-parser-tests.txt). No proprietary executable, depot manifest, app-info cache, backup or raw account-bearing launcher log is committed.

Reproduce the read-only investigation from this repository with `node tools/Inspect-SteamInstall.mjs`, then `tools/Inspect-ExecutableSelection.ps1`. Neither command renames a game file, deploys RPH or starts any runtime. Old telemetry code, compiled plugin and Phase 1/2 evidence are preserved.

**Current status:** the selection hypothesis is strongly corroborated; the extra file is outside the current Steam depot set, but its creator/purpose cannot be conclusively attributed. No official explicit selector was verified. A bounded, reversible community-supported experiment is prepared for approval. No new smoke-test findings exist, and no live NPC distance or telemetry reliability has been established. P2-01 remains built/offline-tested and unverified in game; Phase 3 stays blocked.
