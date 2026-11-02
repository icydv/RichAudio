# PLAYABLE-03: maintained operating-state interface comparison

31 October 2026. Offline research only. **No provider is currently approved for
RichAudio vehicle playback on Enhanced 1.0.1158.16.** This report starts from the
recorded [PLAYABLE-02 outcomes](../evidence/playable-02-live.json); it does not
repeat those captures or perform a new launch, deployment, native invocation,
PCM test or probe build.

## Recommendation

The smallest credible alternate investigation path is the **already installed
official Script Hook V native-call interface**, using the published base-game
current-revolution-ratio native through that framework's normal interface. This
would avoid adding SHVDNE or copying a memory reader into RichAudio. Its native
resolution and values on the actual executable are still unproved, so it is an
investigation recommendation, **not a product-provider selection or permission
to execute a test**. If PLAYABLE-03 establishes a supported RPH call route with
the authentic SDK, retaining RPH would be smaller still.

The credible framework-backed fallback is SHVDNE's public `Vehicle.CurrentRPM`
getter. Its explicit normalized contract is stronger than an undocumented raw
field. However, the maintained implementation still depends on framework memory
scanning; its latest release predates an acknowledged Enhanced player-info bug
fix, and no verified Bati RPM sequence exists. Introducing this additional runtime
is not justified merely to obtain another plausible number. Both routes remain
blocked for product integration until the interface and exact-build behaviour
are established. Do not add original SHVDN to Enhanced as a substitute.

## Release, dependency and compatibility evidence

| Route | Current maintained/public evidence | Dependencies and exact-build limit |
| --- | --- | --- |
| Official Script Hook V | [Author's release page](https://www.dev-c.com/gtav/scripthookv/) lists 15 July 2026, `v3889.0 / 1158.13`, supported Enhanced patch `1.0.1158.13`. The [author's Enhanced announcement](https://www.dev-c.com/) states the native-plugin interface supports Enhanced. | Native ASI plugin plus official ScriptHookV runtime and ASI loader. Already present locally. The public release statement does not name `1158.16`. Local initialization on that executable is evidence of startup only, not a valid revolution-ratio provider. |
| SHVDNE | [Latest release v1.1.0.6](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/releases/tag/v1.1.0.6), 15 July 2026, fixes Enhanced `1158.13`. Its release source is [d756d47](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/tree/d756d479337a677cce9853b0cce63471c1fc7b7c). The maintained main revision reviewed is [d8e474f](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/commit/d8e474fb2779f12a0c04282645d561a1d675ec77), 31 October. | [Requirements](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/d8e474fb2779f12a0c04282645d561a1d675ec77/README.md): official SHV, .NET Framework 4.8 or later, VC++ 2019 x64 runtime; matching SHVDNE ASI and v2/v3 API DLLs. It adds a managed scripting runtime. Release notes do not explicitly certify `1158.16`. |
| Original SHVDN | Stable [v3.6.0](https://github.com/scripthookvdotnet/scripthookvdotnet/releases/tag/v3.6.0), 29 December 2022; maintained [v3.7.0-nightly.198](https://github.com/scripthookvdotnet/scripthookvdotnet-nightly/releases/tag/v3.7.0-nightly.198), 31 October 2026, built from [3a0b478](https://github.com/scripthookvdotnet/scripthookvdotnet/commit/3a0b4786ea8cff050fbccf7993a2cfedc8d4a64f). | [Current requirements](https://github.com/scripthookvdotnet/scripthookvdotnet/blob/3a0b4786ea8cff050fbccf7993a2cfedc8d4a64f/README.md): SHV, .NET Framework 4.8 and supported VC++ v14 runtime; matching ASI/API files. Stable v3.6.0 has a documented compatibility problem on newer Legacy builds. Neither the reviewed release nor main advertises Enhanced support. SHVDNE explicitly exists to supply that edition support. Active nightly maintenance is not Enhanced compatibility evidence. |
| RPH, current and later public SDK material | [Official Enhanced distribution](https://www.lcpdfr.com/downloads/gta5mods/g17media/52970-lspd-first-response-enhanced-preview/) explicitly adds Enhanced `1158.16` support on 17 September. Local runtime fingerprint remains `1.132.1428.17748`. [LMS's newer SDK post](https://www.lcpdfr.com/forums/topic/156960-lspdfr-api-documentation-and-rph-sdk/) supplies `lspdfr_049_9695_dev.zip`, targeting Legacy 3889/Enhanced 1158 and describing RPH `1.131.1424`. | The July SDK is newer than the pinned `1.124` reference, but is not a newer installed runtime. Its listed changes do not announce a revolution-ratio or native-resolution fix. [Staff's reply to an exact 1158.16 SDK question](https://www.lcpdfr.com/forums/topic/157697-request-for-enhanced-rph-sdk-compatibility-gta-v-10115816/?comment=834046&do=findComment) says there is no Enhanced-specific SDK. A reference-library refresh alone is not evidence that either live failure is fixed. |

No independently maintained standalone Enhanced engine-telemetry SDK with a
verified `1158.16` contract was identified in the reviewed author sources.
Multiplayer runtimes, UI wrappers and mods that embed their own memory readers
do not establish a supported single-player interface for this project. This is
a result of the scoped review, not a claim that no other interface can exist.

## What each candidate actually measures

The official SHV generic dispatch ABI is also visible in the
[Alexander Blade SDK header retained by maintained SHVDN](https://github.com/scripthookvdotnet/scripthookvdotnet/blob/3a0b4786ea8cff050fbccf7993a2cfedc8d4a64f/source/loader/sdk/inc/main.h#L78):
`nativeInit(UINT64)`, `nativePush64(UINT64)` and `nativeCall()` returning a pointer
to result storage. The header identifies itself as part of the developer's SHV
SDK. [SHVDNE's actual call adapter](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/d8e474fb2779f12a0c04282645d561a1d675ec77/source/core/NativeFunc.cs#L318)
uses those framework exports in that order. Thus a tiny native ASI can use a
documented framework boundary rather than a custom memory/native-address reader.
These generic declarations do not provide a wrapper or failure contract for the
revolution-ratio native. The [Enhanced corpus](https://github.com/alloc8or/gta5-nativedb-data/blob/424fb51b089049a9fbcebcc641500b1d44d255b4/natives_gen9.json#L112332)
also lists the same identifier, with introduction metadata `811`; the earlier
`3095` label came from the separate Legacy corpus. Neither is exact-build
validation. A result-storage pointer is not itself evidence
that an unknown native executed correctly; null, nonfinite, out-of-range and
unestablished/default-zero results must not be promoted into valid telemetry.

| Interface | Quantity, units and range | Implementation and failure semantics | Target-build evidence |
| --- | --- | --- | --- |
| SHV calling `_GET_VEHICLE_CURRENT_REV_RATIO` | Published name/signature: `float(Vehicle)`. Fractional game-script use supports normalized revolution ratio as an inference. Physical crankshaft RPM is not established. | Published base-game hash `0xF9DDA40BC293A61E`; SHV would own normal native dispatch. No RichAudio memory offset is needed. The reviewed NativeDB entry provides no full range/off/idle/failure contract; SHV resolution failure behaviour for this particular native is not yet established. | RPH could not resolve this hash. That says nothing conclusive about SHV's independent resolver. No SHV invocation or value sequence exists. [Immutable provenance and script evidence](PLAYABLE_02_PROVIDER_RESEARCH.md#sourced-base-game-candidates-for-measurement-only). |
| SHVDNE `GTA.Vehicle.CurrentRPM` | Its [public getter](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/d8e474fb2779f12a0c04282645d561a1d675ec77/source/scripting_v3/GTA/Entities/Vehicles/Vehicle.cs#L1499) documents a float in `0..1`. Despite the API name, that is normalized ratio, not revolutions/minute. | Reads an unscaled float through the framework's resolved vehicle address and `CurrentRpmOffset`. Missing entity address or zero unresolved offset returns `0`, indistinguishable from a genuine zero using that getter alone. No finite/range check is applied by the getter. | No measured RPM evidence from this installation. Current source has an Enhanced-specific memory-scanning branch; compatibility is not implied by finding a field. |
| Original SHVDN `GTA.Vehicle.CurrentRPM` | [Current public getter](https://github.com/scripthookvdotnet/scripthookvdotnet/blob/3a0b4786ea8cff050fbccf7993a2cfedc8d4a64f/source/scripting_v3/GTA/Entities/Vehicles/Vehicle.cs#L1223) also documents `0..1`, not physical RPM. | Current source obtains an entity address through `TryGetMemoryAddress`, checks for an unresolved framework offset and otherwise reads the float. Missing address/offset returns `0`; no separate validity flag or range check. | No authentic Enhanced implementation/support claim was established. Do not infer it from API similarity or a recent nightly date. |
| RPH `Vehicle.EngineRevolutionsRatio` | Documented float normalized ratio `0..1`; historical off/idle examples are not a new-build calibration. | Pinned SDK is a reference declaration; installed compressed implementation was not exposed by the existing inspection. Its offset/native implementation remains unknown. Invalid values remain rejected. | Exact installed combination returned `50.000003814697266`. Root cause is unknown. The newer official SDK was inspected in PLAYABLE-03: the relevant invocation contract is identical and adds no `NativeCallFlags` option or qualified provider. |

For SHVDNE, [current framework source](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/d8e474fb2779f12a0c04282645d561a1d675ec77/source/core/NativeMemory.cs#L3971)
selects a distinct Enhanced pattern and resolves the displacement from that match;
the source extracts it at match index `5` for Enhanced and `10` for Legacy.
Thus its supported API depends on the framework's pattern match, vehicle-address
resolution and field interpretation. This records provenance; it is not an
instruction to copy patterns, offsets, structure layouts or a raw memory reader
into RichAudio.

## New evidence affecting the SHVDNE fallback

[Issue 19](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/issues/19)
reports stable v1.1.0.6 on Enhanced described as `1158.13` with executable file
version `1158.16`. The maintainer acknowledged and fixed its player-info offset
error in [b531468](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/commit/b5314686ab534d9cec8914625a0f5ab2dde528ea),
and [said it would enter the next release](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/issues/19#issuecomment-6024655611).
The current source includes that fix; the July stable archive does not.
This is concrete exact-file-version activity and maintenance evidence, but the
fixed field belongs to player info, not engine revolutions. It proves neither a
correct `CurrentRPM` signal nor that RPH's `50` has the same cause. No unreleased
build has been compiled, installed or substituted here.

Fresh read-only inspection of the existing local ScriptHookV log shows July 2026
runtime `3889.0/1158.13` successfully initialized and launched `TrainerV.asi` in
the recorded PLAYABLE-02 session. The framework internally labelled the game
`VER_EN_1_0_1158_13`, while the independent executable/RPH evidence identifies
file version `1.0.1158.16`. These two labels must remain distinct. The installed
ScriptHookV DLL is 1,987,072 bytes, file version `3889.0.1158.13`, SHA-256
`126be57ca9dca00e471f9de611766009c900aad88f89ae6c2926ec62e5aaeb4f`.
That is stronger than a hypothetical startup claim and weaker than provider
validation: no engine-state native was invoked through it.

The local startup and maintainer issue's matching version pair make the minimal
SHV route credible for further investigation. The numerical label difference
alone is **not evidence of incompatibility**. It is reasonable to infer that the
runtime recognizes the installed executable within its `1158.13` family, while
keeping exact executable identity and per-native correctness as separate facts.
No source reviewed establishes that the existing resolver handles the proposed
native or how an unresolved call fails. A narrow, separately authorised
read-only resolution/behaviour experiment could therefore be justified once a
concrete candidate and supervision are reviewed; another full audio experiment
would be premature.

The integration gate remains **BLOCKED**. Continue stock fallback. A future
separately authorised measurement would first need a concrete reviewed interface,
reliable missing/invalid handling and exact-build observations through off, idle,
throttle, acceleration, gear transitions and overrun. This offline comparison
does not authorize or prepare a new live attempt, claim RPM reliability, or
justify an updated playable installer.

The official SHV SDK download link returned HTML instead of a ZIP during this
increment. No native C++ compiler was found on PATH or in the checked standard
locations. Consequently no ASI was compiled or prepared for execution. The
maintained-consumer source above establishes the normal ABI, not an authenticated
replacement SDK package. See the [main decision](PLAYABLE_03.md) for the primary
RPH maintainer path and conditional SHV qualification proposal.
