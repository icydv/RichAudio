# PLAYABLE-03: engine telemetry compatibility decision

Follow-up: [PLAYABLE-04](PLAYABLE_04.md) prepares and tests an independent SHV
ASI offline. Its compiled candidate is not a validated live telemetry provider;
the findings below remain the PLAYABLE-03 evidence record.

31 October 2026. Continue PR #76 from `60ffda416bf9bbcc4882d953e6d4548b1c4bd8ca`.
**BLOCKED for further playable integration.** No trustworthy operating-state
provider has been validated on the actual Enhanced executable. The smallest
primary path is an RPH maintainer-supported correction or dispatch clarification;
the smallest independent fallback to qualify is the already installed Script
Hook V native interface. Neither is an enabled provider.

This increment performs static research, authentic SDK comparison and compilation
of non-plugin contract libraries only. It does not repeat PLAYABLE-02's audio
tests, launch GTA, execute a native, build another measurement plugin, install
a runtime or change the game installation. Stock fallback remains selected.

## What is established, and what probably explains the failures?

The [PLAYABLE-02 measurements](../evidence/playable-02-live.json) remain the live
record: the RPH property returned `50.000003814697266`, and the direct native call
reported that hash `F9DDA40BC293A61E` was not found. These may be separate defects.

| Explanation | Evidence and assessment |
| --- | --- |
| RPH getter implementation/edition compatibility problem | Leading category for the out-of-contract property result. Historical documentation and the newer SDK XML specify `0..1`; both authentic SDKs declare `float`, and the compiled caller only widens it. The runtime getter body and cause remain unknown. Wrong field/layout selection is a hypothesis, not a proven offset defect. Neither percentage semantics nor a scaling repair is supported. |
| RPH lookup/catalogue/cross-mapping limitation | Leading practical hypothesis for the native error: the attempted framework call reported no matching identifier and returned no value. Which internal lookup stage failed is unknown. This does not prove a GTA handler is absent, or a specific cross-map bug. |
| Native absent on exact executable | Unproven. The separate Enhanced NativeDB corpus includes the same identifier, so treating it as a Legacy-only hash is unsupported. That database is not an inventory of this installed executable. |
| Supported dispatch differs from the attempted call | A documented preferred syntax exists, shown below. Compilation and documentation do not establish that it uses different resolution or will work. A syntax-only retry is not a qualified replacement provider. |
| Wrong SDK, missing flags, truncated hash or omitted vehicle argument | The newer official SDK exposes the same public invocation contract; neither reviewed SDK has `NativeCallFlags`. Static inspection of the tested probe preserves all 64 hash bits, `float` return type and one `IHandleable` argument conversion. This does not prove runtime marshalling, but no source-level truncation/omission was found. |
| Known current framework defect | No maintainer acknowledgement specific to these two symptoms on this build was found in the reviewed release notes and sources. The issue is reproducible locally; its upstream diagnosis is pending. A historical Legacy getter fix is not proof of today's cause. Other installed ASIs were not isolated in a clean-install control. |

## New evidence since PLAYABLE-02

**Enhanced provenance is stronger than the earlier Legacy-only lookup.** At the
same pinned NativeDB revision, [`natives_gen9.json`](https://github.com/alloc8or/gta5-nativedb-data/blob/424fb51b089049a9fbcebcc641500b1d44d255b4/natives_gen9.json#L112332)
contains `_GET_VEHICLE_CURRENT_REV_RATIO`, `float(Vehicle)`, hash
`0xF9DDA40BC293A61E`, with introduction metadata `811`. Throttle and drive gear
also retain their previous identifiers. Its latest explicit game-update commit
targets [3889.0/1158.13](https://github.com/alloc8or/gta5-nativedb-data/commit/897dee3972a573ac6b72726a8ae2ef4f13eda0ac).
This supports Enhanced provenance, not exact `1158.16` handler availability,
return semantics or failure behaviour. No new hash was guessed or substituted.

**A newer authentic SDK does not add an invocation switch.** The SDK obtained
from [LMS's official July 19 developer post](https://www.lcpdfr.com/forums/topic/156960-lspdfr-api-documentation-and-rph-sdk/)
is file version `1.131.1424.17745`. Its public native invocation contract matches
the pinned `1.124.1393.17586` SDK. The shipped XML, rather than an unavailable
webpage, confirms the original 64-bit `xHASH` spelling, automatic handle conversion,
preferred dynamic calls and the unchanged `0..1` getter contract.
Neither SDK contains a `NativeCallFlags` argument/type or a new engine-state
provider among the reviewed vehicle properties. No product SDK pin changed.

The official archive is SHA-256
`043b37440a1d8506a3426465a53851b8e43f8b098d6baf26a95c338662b1f719`;
its SDK DLL is
`1f8a8a88a511d8c6d4aacd196e72b5192970b730f4070606d8bfac63ed722d45`.
Only SDK/reference documentation was acquired into ignored research storage;
no runtime was installed or executed. The exact-build
[maintainer SDK reply](https://www.lcpdfr.com/forums/topic/157697-request-for-enhanced-rph-sdk-compatibility-gta-v-10115816/?comment=834046&do=findComment)
also says cross-compatibility handles Enhanced without a separate SDK. That is
general API compatibility guidance, not a guarantee for this getter/native.

**The documented call form is understood, not proven as a repair.** The current
SDK XML agrees with the [official dynamic-call documentation](https://docs.ragepluginhook.net/html/T_Rage_Native_DynamicNativeFunction.htm):

```csharp
float value = NativeFunction.Natives.xF9DDA40BC293A61E<float>(vehicle);
```

The direct `CallByHash<float>(ulong, vehicle)` form is public but discouraged by
that XML. Both spellings compile against both authentic SDKs. The non-plugin
libraries contain no `PluginAttribute`, `Main`, `OnUnload` or executable entry
point, and were never executed. The newer XML explicitly warns that nonexistent
dynamic method names can compile: this is no evidence that the hash resolves.
No accessible implementation or authoritative
statement proves that changing the spelling changes the resolver/hash domain.
`CallByName` with the community-assigned underscore name is likewise not an
established repair. `CallByAddress`, address scanning and manual remapping are
outside the supported solution considered here.

The [historical 0.50 release note](https://docs.ragepluginhook.net/html/567cc57d-324e-4309-8869-ba0751ce4356.htm)
records an invalid revolution-ratio fix after Legacy build 944. This establishes
historical regressions, not a known Enhanced `1158.16` fix or permission to use an
old runtime.

## Provider choice and implementation boundary

The full [provider comparison](PLAYABLE_03_PROVIDER_COMPARISON.md) records exact
release claims, dependencies, units, failure semantics and offset dependence.

| Route | Decision |
| --- | --- |
| Current RPH getter/direct native call | Locally failed; keep rejected. Ask RPH maintainers for a supported correction or confirmation of the preferred route. This preserves the existing capture architecture and requires no second framework. |
| Small ASI using existing official Script Hook V | Credible independent fallback to qualify through SHV's standard native API, with no extra managed framework or RichAudio memory reader. Existing initialization on the actual executable is demonstrated; this native and its values are not. No candidate was built or installed. |
| SHVDNE public `Vehicle.CurrentRPM` | Secondary fallback. Its documented quantity is normalized `0..1`, despite its name. It uses framework-resolved memory offsets and returns ambiguous zero when address/offset resolution fails. The stable release predates an acknowledged, unrelated Enhanced player-info fix. No Bati RPM qualification exists. |
| Original SHVDN / CFX / speed or input controls | Original SHVDN has no established Enhanced support in the reviewed author material. CFX RPM is a multiplayer-framework extension. Vehicle speed/player input/running state do not independently replace engine operating state. |

The `1158.13` SHV label must not be mistaken for an incompatibility verdict about
file version `1158.16`: the recorded local runtime initialized successfully, and
a [maintainer-handled SHVDNE report](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/issues/19)
explicitly uses that version pair. That unrelated player-info correction does
not validate RPM or diagnose RPH's getter.

If RPH supplies a supported working read, the eventual adapter should change only
the operating-state acquisition in the existing game-fiber capture. Keep its
observation bounds, vehicle identity/generation, engine-on handling and rejection
rules. Accept a documented/qualified measure under its accurate name; do not
manufacture crankshaft RPM or silently map throttle/speed into the existing ratio.
Source playback, histories, Doppler, renderer, assets and gain settings stay intact.
No such provider adapter is enabled by this increment.

An SHV fallback would run inside that framework's registered script context and
use its native handle model. RPH pool tokens must not be assumed interchangeable
with SHV native handles. Provider qualification and a verified identity/timestamp
handoff must precede any bridge to RichAudio. Calling SHV exports from an arbitrary
RPH/background thread is not the proposed solution.

## Validation, upstream action and any later live work

`tools/Inspect-RphNativeInvocation.ps1` reproduces the SDK/XML and compiled-call
checks in [portable evidence](../evidence/playable-03-native-invocation.json).
The [compatibility decision record](../evidence/playable-03-compatibility.json)
also records the source/readiness boundaries and unchanged installation readback.
It reads the pinned binaries as metadata and compiles only inert contract
libraries. The metadata reader and compiler run; SDK/probe/native code does not.
The two successful compilations and IL checks are API evidence, not telemetry
or perceptual validation. Existing PLAYABLE-02 evidence remains unchanged.

The probe preparation metadata now cites the Enhanced corpus alongside the
Legacy corpus and explicitly records the unresolved dispatch boundary. This is
a provenance correction only. The existing direct-call probe was not rebuilt,
reinstalled or rerun, and no playable source/audio path changed.

[The upstream report draft](UPSTREAM_RPH_ENGINE_TELEMETRY_REPORT.md) contains
the reproducible symptoms, minimal public calls, hashes, limitations and questions
for RPH maintainers. It has **not been submitted**. Ask whether the supported
dynamic entry is expected to resolve this Enhanced identifier and whether the
getter needs a current-build framework correction before making another RPH test.

There is **no ready live test candidate** in this increment. Changing syntax
alone does not justify another attempt. The genuinely different SHV route is
worth a narrow qualification proposal only after an authentic SDK/toolchain,
compiled artifact and its failure/ownership behaviour have been reviewed. The
official SDK link returned HTML rather than an SDK ZIP during acquisition, and
no native C++ compiler was found in the checked standard locations/PATH. A
maintained consumer's SDK header/call implementation was reviewed as ABI evidence;
it was not substituted as an authenticated SDK binary or used to build a plugin.

For that conditional new-provider test: separately authorise one existing player
Bati in offline Story Mode; make one normal SHV resolution/read attempt first;
stop on failure without retries or audio. If it returns a meaningful finite
signal, capture at most 120 seconds/2,400 samples across off, idle, stationary
throttle where supported, acceleration, observed shifts and deceleration. Retain
raw values, running state, monotonic acquisition bounds, identity, missing/failure
status and achieved-state evidence. Zero alone is inconclusive. Use independent
supervision and remove only the owned artifact after game exit. No automatic
deployment, launch or listening approval is implied by this conditional plan.

**GO/BLOCKED: BLOCKED for playable development.** GO only for maintainer review and
offline qualification of a supported provider. Do not prepare an audio installer,
repeat injected-PCM tests or start another silent host while this gate is closed.
This is an evidence/readiness decision, not proof that GTA or every supported
framework lacks the signal.
