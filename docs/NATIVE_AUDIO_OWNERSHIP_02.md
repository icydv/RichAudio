# NATIVE-AUDIO-OWNERSHIP-02

**PARTIALLY FEASIBLE, SPECIFIC DEPENDENCY MISSING.** Gate A remains blocked. I require selective, recoverable engine/exhaust replacement before the first playable alpha. The available evidence supports private record construction and an authored restore contract. A supported Enhanced selective control and recovery authority are still missing.

## Registration boundary

| Boundary | Evidence |
| --- | --- |
| CodeWalker | Codex built the retained Marker A pack again. The 2,048-byte OPEN archive matched SHA-256 `2494285084f2adac504ad86d489f05e609712dd3684be297b39176b5264d29e8`. The codec verified the named DLC device, private DAT151 member, `AUDIO_GAMEDATA` and the startup enable group. This is packaging and parser readback. |
| Enhanced archive loader | The supplied OpenRPF binary identifies as 0.1.0 and matches the retained inventory SHA-256 `57d6cc782d8608c32b5b43b74882a3ad162796e0215c58b8fcb2f7c7d9e9d3a8`. The retained receipt records no mods overlay and a base `update.rpf` with NG tag `0x0FEFFFFF`. The writer requires a complete compatible OPEN shadow before a DLC-list edit. The new boundary check rejects the observed NG header before the archive scan. The test used only its 16 retained header bytes and a disposable OPEN control. No compatible full shadow was supplied or generated. |
| GTA V Legacy | The loader author's compatibility note distinguishes the Legacy OpenIV path and warns that Gen8 files can fail on Gen9. A Legacy profile or loader result carries no Enhanced qualification. |
| FiveM | The resource manifest names separate metadata and wave-pack mounters for `AUDIO_GAMEDATA`, `AUDIO_SOUNDDATA`, `AUDIO_SYNTHDATA` and `AUDIO_WAVEPACK`. Those are FiveM resource-loading interfaces, separate from Story Mode RPH. |
| RPH and Enhanced runtime | The retained target is Enhanced 1.0.1158.16 with RPH 1.132.1428.17748. The declared `FORCE_USE_AUDIO_GAME_OBJECT` accepts a vehicle and name and returns void. The reviewed RPH bridge supports invoking it. Registration, unique name resolution, dependency precedence, and safe runtime unload of a private graph remain unverified. The reviewed marker uses a boot-time manifest and assumes no hot unload. Its file rollback follows verified process closure. |

OpenRPF's author describes shadowing archives in the mods directory and supports OPEN and encrypted archives in the published description. The description includes fixes from versions after 0.1.0. It does not establish that this supplied binary and build can load the proposed audio graph, or that a copied NG archive can be edited with the current OPEN-only writer. [OpenRPF author documentation](https://www.gta5-mods.com/tools/openrpf-openiv-asi-for-gta-v-enhanced/), [Cfx data-file contracts](https://docs.fivem.net/docs/game-references/data-files/), [Pinned Gen9 declarations](https://github.com/alloc8or/gta5-nativedb-data/blob/424fb51b089049a9fbcebcc641500b1d44d255b4/natives_gen9.json).

## Private graph and the selective boundary

The planner uses the corrected retained Bati projection and emits a named private vehicle root, its two private configuration records, and ten private sound nodes. Its 12 relocations carry the original field, original hash, private target and source-record provenance. A collision with any known retained record or reference hash and any untyped relocation are rejected. This check is local to the retained projection. Global runtime namespace and precedence require separate evidence.

The player and NPC engine aliases, shared NPC exhaust, idle category shared with upgraded pops, and 25-field preserved wrapper stay on their original references. Wave references remain external, four parallel synth and preset references remain stock, and 17 nonzero unknown fields stay visible. The 256-node historical graph is bounded and open. The plan retains unresolved dependencies and opaque fields and cannot establish complete isolation. It contains identities and relocations, without proprietary record bodies.

The pinned codec separately emitted 3 private DAT151 and 10 private DAT54 records from authored bodies. After readback the test reversed only the declared relocation fields and compared the full serialized record bodies. All 13 matched. The 20 original fixture bodies stayed byte-identical. The fixture verifies that preservation extends beyond fields named by the planner.

The retained codec exposes signed `Int32` granular fields such as `EngineIdleVolume=0`, `ExhaustIdleVolume=0`, `EngineVolume=600` and `ExhaustVolume=800`. The idle modular sound's header exposes `Int16 Volume=-800`. The field types and stored values are verified metadata. The live units, inherited defaults, mix placement and effective silence remain unverified. The same evidence leaves zero hashes and a silent wave or synth unable to qualify selective suppression across all continuous and auxiliary routes. No gain, reference or synth content was changed to silence a sound. [Prior Bati dependency evidence](PLAYABLE_ALPHA_01_NATIVE_GATE.md), [Pinned CodeWalker REL source](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/FileTypes/RelFile.cs).

## Restoration and failure separation

The two-Bati fixture runs the actual offline policy in a disposable controller process. A separate process owns the authored profile table and lease clock. It checks session, handle, generation, model, exact authored prior override and outstanding command before it assigns or restores. It rejects stale commands and refuses to restore over a changed override or a retired or recycled vehicle. Killing the controller left that authority alive and able to restore the original fixture override at expiry. The untouched Bati remained on the original profile. The normal host-failure path also issued and acknowledged exact restoration. These are authored states and deterministic fixture expiry.

| Failure | Required runtime capability |
| --- | --- |
| Controlled Stop, host or PCM loss, stale observation | Restore the exact prior effective override on the same surviving lifetime. A scheduler that survives the host can trigger restoration only if it has that state and an actual compare-and-restore operation. |
| Controller thread loss, plugin unload or AppDomain failure | Engine-owned expiry, or an in-game authority that still has access to the audio state and native execution after the failed domain is gone. The existing marker guard shares RPH's AppDomain and scheduler. |
| Vehicle invalidation, recycling or external override | Lifetime-bound selection and conditional restoration. A changed target or profile cannot be overwritten by the old lease. |

## Decision and next discriminator

The current private-profile route reaches serialization and a specific mounting prerequisite. It does not reach verified private Enhanced registration, a selective mute or exact original-state recovery. The next credible alternative is an **engine-owned per-vehicle engine/exhaust gain or voice route with an expiring override**. It would keep the effective profile installed, leave stock records untouched, and avoid restoring a guessed profile. It still needs an exact-build supported interface, component and lifetime binding, independent expiry, and explicit availability for modded profiles. The reviewed entity mix-group calls target an entity and group without a demonstrated engine/exhaust-only bus or baseline. Script sound IDs address script playback. The reviewed RPH surface establishes no supported interception boundary for automatic engine voices.

The maintainer question is whether Enhanced 1.0.1158.16 exposes a **read-only effective audio-object identity with override provenance**, and an **engine-owned lifetime-bound engine/exhaust override that expires or restores after RPH AppDomain loss**. Ask for the exact supported symbols and scheduler or ownership guarantees. For the OpenRPF branch, the separate requirement is a complete, verifiable Gen9 shadow or a supported registration path that preserves the stock update archive. No maintainer contact was sent.

If an observer is identified, the first discriminating experiment is read-only. On the exact build, observe two existing same-model lifetimes with independently known different effective states, including an existing override. Verify stable distinct identities against the independent baseline and reject a stale or recycled lifetime. This excludes assignment, new mounts, spawning and playback. The current horn probe cannot make that distinction, so there is no executable observer proposal today. A future standalone registration experiment needs its own reviewed mount, and a Gate B suppression experiment additionally needs proven component control and independent recovery.

## Offline reproduction

```powershell
node tools/Compare-BatiAccelerationRedirect01.mjs .local/street01-installed-completion01/resolved02/resolved-catalog.json --continuous --shadow ra_shadow_3aa512994f85ebf7
pwsh -NoProfile -File tests/Test-PrivateAudioShadow02.ps1 -CodeWalkerCore <pinned-codec-path> -OutputDirectory .local/street01/native-shadow-fixture
node tests/ownership/Test-PrivateShadow02.mjs .local/street01/native-shadow-fixture
```

The Node fixture and inherited redirect and ownership suites passed 41 tests on each of Node 22.23.4 and 24.19.0. The metadata suite passed 16 checks and the standalone marker fixture passed. The output and earlier diagnostic attempts remain private under `.local/street01/native-ownership02`. The one-voice PCM pipeline and the retained deadline-clean runs remain in place. Fleet qualification remains separate.
