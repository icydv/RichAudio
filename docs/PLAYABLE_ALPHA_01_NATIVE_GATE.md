# PLAYABLE ALPHA-01 — selective native audio gate

I require the first playable alpha to replace the selected vehicle's continuous engine and exhaust while GTA retains its other sounds. The earlier additive proposal is superseded. Gate A remains blocked, with production ownership disabled. The two deadline-clean retained-bank discard runs still establish the one-voice PCM baseline. The five-voice qualification remains separate and failed.

## Native interface evidence

| Interface | Established scope |
| --- | --- |
| `0x4F0C413926060B38` | The pinned Gen9 corpus declares `void FORCE_USE_AUDIO_GAME_OBJECT(Vehicle vehicle, const char* audioName)`. The SHVDN wrapper calls it for a whole named audio object. There is no return payload for the prior override, resolved object or recovery token. |
| `0x02165D55000219AC`, `0xACB5DCCA1EC76840`, `0xD53F3A29BCE2580E` | The corpus declares default horn hash, default horn hash ignoring mods and horn sound index respectively. My retained Tailgater observation is three equal default-horn reads, `022894E9`, on one vehicle in one invocation. It matches one projected child of the Tailgater horn list. Blista remains unsampled. These observations provide a possible marker discriminator only. |
| `0xCA4CEA6AE0000A7E` | `PRELOAD_VEHICLE_AUDIO_BANK(Hash vehicleModel)` addresses a model bank. The declaration supplies no new REL registration, live effective-profile discovery or instance restoration contract. |
| `0xF1F8157B8C3F171C`, `0xD2DCCD8E16E20997` | The startup rev setter and reset address a startup event. The exhaust-pops toggle addresses another event. Continuous engine and exhaust, including idle and load transitions, still require their own control. |
| `0x9D44FCCE98450843` | Gen9 names it `SET_VEHICLE_IN_CAR_MOD_SHOP` and lists `_SET_VEHICLE_SILENT` as an old name. The corpus reports door and continuous-horn effects. It fails the auxiliary-preservation requirement. |

The retained exact-stack boundary is Enhanced `1.0.1158.16` and RPH `1.132.1428.17748`. The inspected reference SDK is older, version `1.124.1393.17586`, and the matched declarations were stubs. The retained SHV inspection establishes generic invocation, not selective controls. The reviewed RPH container inspection did not resolve loaded implementations. The existing private Marker A pack exercises `AUDIO_GAMEDATA` authoring and disposable rollback. Its complete compatible update shadow and live Enhanced registration are unresolved.

[Pinned Enhanced declarations](https://github.com/alloc8or/gta5-nativedb-data/blob/424fb51b089049a9fbcebcc641500b1d44d255b4/natives_gen9.json), [Cfx assignment declaration](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/AUDIO/ForceUseAudioGameObject.md), [SHVDN implementation](https://github.com/scripthookvdotnet/scripthookvdotnet/blob/main/source/scripting_v3/GTA/Entities/Vehicles/Vehicle.cs#L2595), [earlier SDK and recovery evidence](NATIVE_AUDIO_OWNERSHIP_01.md), [Marker A and live horn evidence](STREET_01_COMBINED_OBSERVATION.md).

## Retained Bati dependency evidence

| Projected branch | Result |
| --- | --- |
| `EngineGranular.EngineAccel` | `0346a636`, `Dat54GranularSound`. The retained player graph binds six wave streams used by the engine/exhaust idle, acceleration and deceleration bank. The NPC granular record reaches the same player record through both `ParentSound` and `ChildSoundsHashes[0]`. |
| `EngineGranular.ExhaustAccel` | `411a8c83`, `Dat54EnvironmentSound`. `ExhaustAccelNPC` selects the same record. |
| `EngineGranular.IdleSub` | `32a73def`, `Dat54ModularSynthSound`, with a typed synth reference and zero preset reference. Its category `6bad2627` is shared with the upgraded exhaust-pop and limiter-pop branches. A category-level mute would cross the required boundary. |
| Conventional engine | Distinct simple-sound references for engine/exhaust idle, low and high loops, plus `RevsOff`. Together with granular acceleration and idle these yield ten candidate fields. |
| Granular synth dependencies | `EngineSubmix`/`EngineSubmixPreset` and `ExhaustSubmix`/`ExhaustSubmixPreset` are four additional nonzero typed references. Their live contribution, gain semantics and safe boundaries remain unresolved. |
| Preserved and unclassified fields | The wrapper `e38fcf16` is a direct alias for 25 preserved fields, including doors, upgraded intake, both dump valves, upgraded transmission and other events. Seventeen nonzero `Unk` fields remain in preserved branches. Two pairs link the same environment records between conventional and granular parents. Metadata identities do not establish when these branches sound. |

Codex corrected a projection defect. CodeWalker's `RelSound.AudioContainers` names wave-container paths. The earlier REL dictionary search produced 87 incorrectly classified nonzero wave references, including two false speech-record targets. The resolver now emits them as external references. An ambiguous record or missing root prevents a complete REL closure claim. The new offline audit corrects the old projection in memory and retains witness paths from continuous candidates to preserved branches, exact binding checks, unresolved boundaries and the catalogue digest.

The original retained graph still has 256 nodes and 3,097 candidate edges. Its historical receipt records 488 queued omissions, 468 unresolved references under the old classifier and 666 projection gaps. Those are historical graph accounting. The corrected replay changes classification and reports reachable evidence without rewriting the catalogue, re-extracting REL data or inferring closure. Zero fields remain uninterpreted. The 13-record private topology comparison preserves the stock graph for the same-model neighbour. Actual muting, runtime scheduling and auxiliary preservation still require their own proof.

[CodeWalker `RelSound.AudioContainers`](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/FileTypes/RelFile.cs#L2107)

## Isolation, restoration and decision

The standalone marker adapter passed authored two-Bati tests. It binds full lifetimes, refuses a recycled target, preserves the neighbour in the fixture and can restore its own deliberately established marker A. The scheduled guard can survive the test controller's return while the same module and RPH AppDomain keep running. An AppDomain unload or loss of that scheduler can also remove the guard. The independent selector and lease in the ownership regression are explicitly authored. Neither can restore an existing vehicle's arbitrary effective override in GTA.

The most credible remaining route is private registration plus instance selection. It requires exact-stack registration and resolution, source-backed component isolation, a read or equivalent snapshot of the complete effective state (including overrides), and compare-and-restore or engine-owned expiry for the same lifetime. The recovery authority must survive renderer, host and ownership-controller loss. If a separate in-game authority is proposed, its continued access after controller failure and its handling of entity recycling must be demonstrated independently. A complete archive shadow would only clear Marker A's mounting prerequisite. Its disposable horn experiment would only discriminate registration and assignment.

Before Gate B, the technical blockers are the effective-state and recovery interface and a closed, proven selective control for the ten route fields and their parallel synth dependencies. A dedicated live qualification would then compare native-only, selectively controlled and restored output on one identified Bati, with the same-model neighbour and auxiliary categories held as controls. That qualification must precede integrated replacement. There is no Gate B execution candidate while these prerequisites remain open.

## Offline reproduction

```powershell
node tools/Compare-BatiAccelerationRedirect01.mjs .local/street01-installed-completion01/resolved02/resolved-catalog.json --continuous
pwsh -NoProfile -File tests/Test-BatiMetadataGraph01.ps1
node --test tests/Test-BatiAccelerationRedirect01.mjs tests/Test-NativeAudioOwnership01.mjs tests/Test-AudioOwnershipLegacy.mjs
pwsh -NoProfile -File tools/Test-PrivateProfileProbe01.ps1
```

The private retained audit is under `.local/street01/selective-alpha01-offline`. The paired source/PCM control also passed against a frozen `c3daa967a4439ee13a40c69350fda990eebb8ef5` on Node 22.23.4 and 24.19.0. The authored REL codec round trip, marker fixture and 37 device-free ring and pipe checks passed. PLAYABLE-15 was an owner-heard additive run with a failed recording and independently verified installation restoration. Its file rollback and underflow observations are separate from exact native-profile recovery.
