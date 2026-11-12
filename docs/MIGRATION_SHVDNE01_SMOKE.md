# MIGRATION-SHVDNE-01 — first exact-build admission

I am adopting SHVDNE as RichAudio's intended primary managed integration. This is the separate, bounded live procedure prepared by Codex. **It has not been authorized or executed.** My migration task permits source changes, compilation and offline fixtures only. No earlier Gate A approval applies.

## Prerequisites and sealed inputs

Before requesting a new authorization, prepare one fresh manifest covering the exact staged integration DLL, configuration, package receipt, host, source assets if needed, GTA executable, Script Hook V, ASI loader and all SHVDNE files. Record SHA-256, file versions, paths, distribution provenance and an exact installation/rollback list. Read the game executable on disk; do not attach to a process or read game memory.

- GTA Enhanced target: `1.0.1158.16`. Recheck the executable digest against the retained package. A different executable requires a new package and admission.
- SHVDNE distribution: `v1.1.0.6`, API3 assembly `3.9.0.0`, pinned API SHA-256 `1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48`. Keep its ASI, API2, API3 and INI from the same distribution. The shipped INI must be retained and reviewed; do not assume missing keys are added automatically.
- Script Hook V and compatible ASI loader are user-installed prerequisites. The [official Script Hook V page](https://www.dev-c.com/gtav/scripthookv/) and [SHVDNE release](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/releases/tag/v1.1.0.6) name `1.0.1158.13`; neither establishes `.16` compatibility. Existing successful SHV observations on the retained `.16` executable do not qualify SHVDNE.
- Windows x64, .NET Framework 4.8 and the upstream-required Visual C++ x64 redistributable. No administrator service, scheduled task, installer or persistent agent is part of RichAudio.
- Offline Story Mode only. Start through the normal supported game route without RPH. Explicitly inventory active ASIs and managed scripts; park only separately approved conflicting RichAudio/RPH components using exact backups. Merely omitting an RPH assembly reference does not prove RPH is absent from a live session.
- A private working copy of the disabled package. Do not use or modify the retained RPH package or its settings. The profile probe DLL must be absent.

Only then can a concrete approval request bind the proposed temporary destination files, backups, changed configuration, maximum duration and restoration. The current staged package has `enabled:false`, host disabled, memory telemetry disabled and no native audio ownership implementation in its production path.

## One bounded smoke run

Maximum proposed duration is **five minutes after RichAudio's first diagnostic tick**, with a separate two-minute startup allowance. Stop early on initialization exception, game instability, source identity inconsistency, an unexpected process or persistent controls, a broken journal, or cleanup failure. No automatic second launch follows a failed run.

1. **Initialization without RPH.** Use a separately sealed configuration with only `enabled:true`; retain host, memory telemetry, SoundMap and world preparation disabled. SHVDNE must discover exactly one production RichAudio script. Observe initialization, pinned dependency identity and absence of loader exceptions. Verify no RPH assembly/module/plugin participated through normal loader/log evidence, without memory inspection.
2. **Tick and Story context.** Observe increasing tick/capture counters, normal menu/pause transitions and a living player. Online/loading/player-switch scope must withhold observations. Native exceptions fail this stage, rather than triggering retry through another framework.
3. **Camera.** Observe final rendered camera position and orientation, stable forward/up basis, monotonic sample clocks, measured difference velocity, initial unavailable velocity and a new generation after a camera cut. Compare actual camera movement and orientation, not only numerical plausibility. Reject stale/future or malformed vectors.
4. **Vehicles.** Observe player-driver and nearby NPC observations, independent handles/models, leaving/re-entering the vehicle and retirement. With mechanical telemetry disabled, RPM/gear and dependent wire vehicles must be explicitly unavailable. A public property name or a plausible zero is not a successful measurement. NPC enumeration itself uses a memory-backed SHVDNE pool and needs qualification.
5. **Input and presentation.** Check the saved shortcut, keyboard navigation, controller chord, mouse selection, save/reopen, transition and closing-input release. Confirm pause closes the menu. Open and close the SHVDNE console while the menu is hidden and visible; overlay-focus coexistence is an explicit unknown. Check 1080p and the actual play resolution. Native text metrics differ from RPH's Arial drawing; correct clipping/spacing before claiming visual parity.
6. **Passive native invocation.** The successful camera/entity observations qualify only those read calls. No profile setter, spawn, deletion, silence or audio replacement is permitted in this smoke. `FORCE_USE_AUDIO_GAME_OBJECT` remains a separately authorized probe operation.
7. **Unload and reload.** Request ordinary SHVDNE script unload/reload once within the sealed run. Verify a fresh session, no reused source chronology, no old publishing worker, no retained input capture and a new configuration validation. A hard process crash or deliberate domain corruption is outside this first smoke.
8. **Normal exit and restoration.** Exit normally without saving any experimental state. Verify all session-owned process identities exited, restore exact backed-up files/configuration, remove only manifest-owned temporary files and compare hashes. Keep logs, failures and the restoration receipt. Do not use restart alone as evidence of vehicle/native restoration.

The script writes bounded-rate diagnostics under `scripts/RichAudio/logs/`. Counters, raw optional observation validity, host state and explicit `nativeAudioOwnership:false` are available. Final journal drain is best-effort during graceful unload; the kernel containment mechanism does not depend on that last disk write.

## Host transport admission after the initialization smoke

The five-minute run above does not launch an audio endpoint. A fresh bounded admission is needed to enable host operation against a hash-bound package configured for the existing discard/environment-observation mode. Prepare this exact package and its settings first. Confirm automatic host launch, session/PID handshake, v1 listener delivery, expiry, disconnect, at most three restart attempts and cleanup. The existing authored offline peer tests do not replace this check against the actual RichAudio host in GTA.

Valid operating ratio must then be independently qualified before enabling vehicle synthesis. An explicit Enhanced public-native provider is available; its prior SHV history is useful context, but dispatch through SHVDNE still requires testing. The alternative SHVDNE memory-wrapper path requires missing-offset/zero ambiguity to be resolved. Neither provider is selected automatically after a failure. Observe engine-off, idle and controlled changing operating state; do not interpret the ratio as physical RPM without calibration. Only after this and the existing source-bank/geometry gates pass should a separately approved additive listening/performance test be considered.

The next Gate A experiment is separate again: use [the isolated probe procedure](MIGRATION_SHVDNE_01_PROFILE_PROBE.md), fresh disposable A/B vehicles, fixed non-silent ADDER assignment, manual arm/confirm and new hash-bound authorization. Successful dispatch is not named-profile identity, selective suppression or independent recovery. The earlier PROFILE-02 acoustic comparator admission failure remains in force; it is not bypassed by migration.

## Acceptance record

Record each step as passed, failed, unavailable or not attempted with its specific evidence. A successful smoke admits that observed stack and those calls only. Remaining release blockers include mechanical telemetry validity, real host/rendering integration, SoundMap/world preparation in the new callback lifecycle, UI visual/focus parity, NPC cost at practical fleet sizes, source continuity under actual scheduling and complete Gate A ownership/recovery. RPH stays available as the rollback adapter until those results support retiring it.
