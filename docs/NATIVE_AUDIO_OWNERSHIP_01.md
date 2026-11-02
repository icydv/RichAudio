# NATIVE-AUDIO-OWNERSHIP-01 — selective replacement remains blocked

I want RichAudio to replace one Bati's engine and exhaust while GTA continues to provide everything else it owns. This increment implements an **offline policy prototype**, not native suppression. No independently verified selective engine/exhaust mechanism with recoverable original state and failure-safe lifetime has been established. The production capability registry is immutable, disabled and `BLOCKED`; there is no gameplay import, native bridge, deployment package or enable switch.

## Existing research and exact evidence boundary

`docs/P2_02_AUDIO_OWNERSHIP.md` is absent from this branch. Codex recovered and read its historical version at [d7c961a](https://github.com/icydv/RichAudio/blob/d7c961a22ccbfc75d0b1cbf74079b307a49fbcc2/docs/P2_02_AUDIO_OWNERSHIP.md), alongside `ARCHITECTURE.md`, the current Bati pipeline and the existing native-audio limits in `PLAYABLE_01.md`. The original 15 ownership tests and hypothetical backend have been brought forward under `tests/Test-AudioOwnershipLegacy.mjs` and `tests/ownership/legacy/OwnershipSimulation.mjs`; only the test import path changes. The original report and closed PLAYABLE-15 approvals are untouched.

The earlier finding remains: metadata access and source reconstruction do not establish per-instance native engine suppression, an automatic engine sound handle, current-profile readback or independent recovery after the controller fails. The genuine PLAYABLE-15 audio was additive. My praise for the Bati sound does not establish native replacement.

Codex rechecked these primary source pins on 2 November 2026:

- Cfx's community-maintained stock-native declarations: commit `c00e0ed83d06dcba2457424ba254fbaa7a05bf7e`. They describe interfaces; they are neither Rockstar guarantees nor tests of Enhanced 1.0.1158.16/RPH 1.132.1428.17748.
- CodeWalker REL source: commit `485d56bec00262ed7fa472261cce7bbc6202b96e`, unchanged from the earlier research pin. No parser code, game records or assets are redistributed.
- My retained authentic RPH SDK: file version `1.124.1393.17586`, SHA-256 `5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0`. The new `Inspect-NativeAudioSurface01.ps1` reads ECMA-335 metadata with `PEReader`; it does not load/execute the SDK or game. Its 15 matching `Rage.Vehicle` declarations include siren controls, engine physical-state/health controls and the operating ratio. Every inspected method has no implementation RVA. There is no engine/exhaust-specific mute or gain declaration among these matches. Generic native invocation does not prove a hash's semantics on this build.

The ordinary reflection-only type loader rejected this reference SDK because its stub constructors have no implementation. That failed inspection is not evidence that an API is absent. The subsequent raw metadata inspection succeeded without executing an assembly. The tool deliberately requires PowerShell 7 and the exact SDK digest; it does not search my installation.

## Mechanism assessment

| Route | Source-backed fact | Missing evidence / decision |
| --- | --- | --- |
| [Profile assignment](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/AUDIO/ForceUseAudioGameObject.md) | `FORCE_USE_AUDIO_GAME_OBJECT`, hash `0x4F0C413926060B38`, accepts a vehicle and profile name | A vehicle parameter supports a per-instance *request*, not verified same-model isolation, engine/exhaust-only effect, prior-profile readback, restoration or crash recovery. An empty, invalid or zero-valued profile is not a validated mute. |
| Copied, isolated metadata profile | [REL source](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/FileTypes/RelFile.cs#L10260) exposes separate engine/exhaust references, pre/post-submix levels and synth/submix references | These are serialized profile fields, not independently verified gain units or runtime controls. A unique profile and transitive private graph would need validated registration, loading and all affected component references. Shared original records must remain untouched. No copied proprietary profile was made. |
| Whole-vehicle silence | [Declaration commentary](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/VEHICLE/SetVehicleSilent.md) reports door/horn effects | Fails the required selective component contract; excluded. |
| Damage, physical engine state and synth forcing | [Damage factor](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/AUDIO/SetVehicleAudioEngineDamageFactor.md) has no documented mute semantics; [synth forcing](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/AUDIO/ForceVehicleEngineSynth.md) is documented with tyre-burst use | Neither is an established selective gain. Physical engine changes are prohibited. No control is called. |
| Exhaust pops | [Specific toggle](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/AUDIO/EnableVehicleExhaustPops.md) controls a named event category | Does not suppress continuous engine/exhaust. No prior-state getter or expiring lease established. Backfire remains GTA-owned. |
| Entity mix groups | [Add](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/AUDIO/AddEntityToAudioMixGroup.md) and [remove](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/AUDIO/RemoveEntityFromAudioMixGroup.md) declarations accept an entity/group and fade parameters | No demonstrated engine/exhaust-only bus, original group getter, arbitrary dry PCM insertion or independently expiring recovery. A fade parameter does not establish safe ownership. |
| Script sound IDs | [Allocator documentation](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/AUDIO/GetSoundId.md) describes IDs for scripted playback | Does not enumerate automatic engine voices. No guessed ID, variable, mixer callback or interception is supplied. |
| Script cleanup timer | [Declaration](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/AUDIO/SetAudioScriptCleanupTime.md) describes cleanup after a script finishes | Does not document restoration of a forced vehicle profile after plugin/controller/process failure. Cannot stand in for independent recovery. |
| Custom original provider | RichAudio already renders its own source PCM through its existing engine | Producing original/owned PCM is feasible, but does not remove the corresponding automatic native sound. No supported provider registration or automatic vehicle-voice routing interface was identified in the reviewed surface. |

The [Cfx data-file documentation](https://docs.fivem.net/docs/game-references/data-files/) lists game/sound/curve/synth metadata and wave-pack mounters. This is evidence of FiveM's resource-loading surface, not an equivalent loader API in my Enhanced single-player RPH stack. No new loader/framework is assumed, installed or downloaded. Likewise Cfx voice submixes do not establish automatic vehicle engine routing.

**Inference:** a separately registered, uniquely named metadata graph assigned to one vehicle remains the most credible selective-suppression research route. It could preserve auxiliary references while changing qualified engine/exhaust nodes, but its feasibility on this exact stack is still unverified. Even a successful audible mute would leave the independent-recovery gate open.

## Explicit component ownership

| Component | Proposed ownership after a future verified takeover | Current behaviour |
| --- | --- | --- |
| Continuous engine/exhaust represented by RichAudio | RichAudio; suppress only proven corresponding native components | Native untouched; no takeover |
| Horn, tyres/skid/road contact, collision/damage, doors, alarms | GTA | Native untouched |
| Radio, pedestrians, traffic and world ambience | GTA | Native untouched |
| Separate transmission, induction, turbo, backfire and limiter events | GTA until their graph/content boundaries are independently established | No separate RichAudio event/control or suppression |
| Mechanical content already baked into retained engine/exhaust material | Cannot be separated merely by naming a stem | Attribution/overlap unresolved; blocks claiming perfect component separation |

RichAudio's engine/exhaust material may contain coupled character that cannot be assigned to separate native categories from metadata names alone. No newly synthesized transmission/turbo/backfire component is added. A future profile must prove exactly which coupled paths it removes; otherwise the scope stays blocked.

## Offline controller and recovery contract

`src/acoustics/ownership/policy.mjs` implements the requested `NativeOnly → Prepared → RichAudioOwned → Restoring → NativeOnly` policy, with `Failed` for unresolved recovery. Pending handoff remains `Prepared`, with replacement permission false until an independent fixture measurement acknowledges exclusive selection. Returning from an API call is insufficient.

The prototype is Bati-only. Identity binds session, full handle, source generation and model; model equality alone never permits a command. The exact baseline profile is captured as immutable data with that identity. Preparation requires a healthy replacement, fresh ordered observations and every capability premise. Prepared expiry and a pending handoff are distinct. Repeated requests, delayed acknowledgements, backwards clocks and recycled identities are rejected. Commands and nested component/baseline data are immutable.

Scope loss does not become an engine-off event. Replacement failure, overlap, observation/lease expiry, switch and orderly unload request exact-baseline restoration. The policy withdraws replacement permission but records native state as **unknown** until measured restoration succeeds. Failed proof or timeout enters `Failed`. A disappeared/recycled entity permits no restoration write to the handle's new occupant. There is no unmute-all fallback.

Only explicit `authored-fixture` mode can evaluate hypothetical capability certificates. The default mode cannot prepare or take over even with every fixture flag true. These certificates are synthetic assumptions, not an authenticator or a way to certify native support. No production adapter imports this module.

A crashed policy cannot execute its own timeout or cleanup. The old hypothetical backend tests independently expiring selection; this does not create such a facility in GTA. The new policy correctly leaves recovery unverified when there is no surviving independent backend. Neither a `finally` handler nor an external host unable to reach a failed game adapter proves fail-open recovery.

## Deterministic validation

The focused runner passes **32 tests**: 15 preserved P2-02 tests and 17 new policy tests. A separate review caught and corrected a fixture-policy gap: a fresh timestamp from an ineligible source could previously prepare again. Latest eligibility now survives restoration and only a new eligible observation can qualify preparation; healthy-output status alone cannot revive it. Run:

```powershell
node --test tests/Test-AudioOwnershipLegacy.mjs tests/Test-NativeAudioOwnership01.mjs
pwsh -NoProfile -File tools/Inspect-NativeAudioSurface01.ps1 -SdkPath <my-retained-exact-sdk>
```

The new 4,800-frame authored comparison includes a selected source, same-model sibling and separate synthetic auxiliary signals. A hypothetical common, phase-identical selector yields **0 overlap frames, 0 missing-owner frames and 0 maximum sample error**. This verifies fixture composition only; it is not an external native-mix measurement. Negative controls retain **8 overlapping frames** for delayed mute, **8 missing frames** for delayed replacement and **32/32 missing frames** for persistent mute plus dead replacement. No arbitrary crossfade is used.

The SDK receipt SHA-256 is `d52a5b34313870756da7ebfdf59c02733bac7ec8d610c667efee08e2e10c479d`. It records declarations only and explicitly sets native suppression/recovery verification false. The downloaded explanatory REL *source text*, kept privately and never executed, has SHA-256 `bdc35ef85acce28314208f7f7333c66c980aba165b28597aa5e211312a0b9cc0`.

All tests use original authored signals and no GTA/RPH process, installed map/audio archive, endpoint, recording or deployment. The existing Bati banks, PCM engine, gains, calibration and native game installation remain untouched.

## Next gate and rollback design

There is **no executable live engine-takeover candidate to approve yet**. The next work is an offline, explicitly scoped review of a supported exact-stack unique-profile loader/registration contract and a complete dependency graph with known component units. It must establish original active-profile readback or another independently verified exact baseline, two-identical-vehicle isolation, and a surviving recovery authority before any suppression procedure is proposed. No inquiry has been sent to a maintainer.

If those controls become credible, a separate proposal must bind executable/build hashes, one selected session/vehicle/generation, unique isolated records, original state, independent watchdog/expiry semantics, timeouts and exact removal/restoration manifests. It must measure native-only, prepared, transfer, ownership, restoration, interrupted transfer, renderer/plugin failure and two identical vehicles, preserving each auxiliary category. A mixed endpoint capture that cannot isolate engine/exhaust must report that attribution limit. A successful function return cannot satisfy acoustic acceptance.

Rollback of this increment is ordinary source-code removal: no native state or installed file has changed. Future live rollback would require exact instance-bound state restoration plus independently observed native return; a game exit alone would not prove seamless recovery. I have authorised no deployment, launch, endpoint, recording, native suppression, installed archive modification or merge for this track.
