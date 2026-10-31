# Draft: invalid engine ratio and unresolved Enhanced native in RPH 1.132

**Draft only; not submitted.** Suggested destination: RPH's official support/API
channel. The authentic runtime readme directs issues to its official Discord;
the [API Development forum](https://www.lcpdfr.com/forums/forum/894-api-development/)
also contains current maintainer SDK guidance. No private SDK/runtime, game assets,
raw capture or local path should accompany a public report.

## Suggested title

Enhanced 1.0.1158.16 / RPH 1.132.1428.17748: EngineRevolutionsRatio returns ~50;
CallByHash cannot resolve published Enhanced rev-ratio identifier

## Environment and scope

- GTA V Enhanced executable file version `1.0.1158.16`, SHA-256
  `b48e80f5fc899eb89e5dcc9f3b68e9551cc8dcfac78b2a940b207e569e9987ea`.
- RPH `1.132.1428.17748`, SHA-256
  `73f05b3f7973d4731f4151ae061dd3c991065e8bf3ece51ea1d9ab728b9b42ac`,
  from the official Enhanced-compatible distribution. RPH itself detects
  Enhanced and file version 1158.16; it loads the managed plugin normally.
- Test code compiled for x64/.NET Framework against authentic SDK
  `1.124.1393.17586`, SHA-256
  `5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0`.
- Static comparison also used the newer official SDK `1.131.1424.17745`, SHA-256
  `1f8a8a88a511d8c6d4aacd196e72b5192970b730f4070606d8bfac63ed722d45`,
  from [LMS's developer package](https://www.lcpdfr.com/forums/topic/156960-lspdfr-api-documentation-and-rph-sdk/).
  Its XML still specifies ratio `0..1`; the relevant native APIs match.
- Offline Story Mode, player driving a valid living Bati, model `0xf9300cc5`.
  Calls run on the normal RPH game fiber without yielding within acquisition.
- Other existing ASI/loader components include ScriptHookV, TrainerV and
  DirectStorageFix. A clean-install/mod-isolation control has **not** been run.
  This report does not claim a demonstrated internal RPH root cause.
- No audio host, game-memory reader, setter, spawn or fabricated RPM is needed
  to reproduce either symptom. They may be independent issues.

## Observed results

Two explicitly authorised, read-only captures each retained one Bati record:

| Field | Initial | Diagnostic |
| --- | --- | --- |
| `Vehicle.IsEngineOn` | true | true |
| `Vehicle.EngineRevolutionsRatio` | 50.000003814697266 | 50.000003814697266 |
| `Vehicle.CurrentGear` | 1 | 1 |
| Raw `Vehicle.Speed` | 0 | 3.5746209621429443 |
| Direct native result | exception, no value | exception, no value |

The diagnostic retained `System.Exception`, HResult `-2146233088`, with:

```text
No natives with hash "F9DDA40BC293A61E" were found.
```

The failure originates in `Rage.Native.NativeFunction.CallByHash(UInt64, Type,
NativeArgument[])`, reached by the generic float overload. Each capture stopped
on that failure, without trying the other candidate natives. No off/idle/throttle/
shift/deceleration sequence was completed. GTA remained stable and exited without
forced termination; the temporary plugins were removed and recorded baseline
installation/settings hashes still match. Full sanitized observations are in
[PLAYABLE-02 evidence](../evidence/playable-02-live.json).

## Minimal public calls and reproduction

In an authorised offline Story Mode game-fiber context, obtain the current
player-driven valid Bati. Read the public getter once and record the returned
float unchanged. Independently attempt the published hash once, retaining the
exception and stopping after failure. There is no need for RichAudio source assets
or renderer code:

```csharp
using Rage;
using Rage.Native;

public static class EngineTelemetryCalls
{
    public static float Getter(Vehicle vehicle)
    {
        return vehicle.EngineRevolutionsRatio;
    }

    public static float AttemptedDirectCall(Vehicle vehicle)
    {
        return NativeFunction.CallByHash<float>(0xF9DDA40BC293A61EUL, vehicle);
    }

    // Documented syntax; compiled offline, NOT executed in the reported tests.
    public static float DocumentedDynamicCall(Vehicle vehicle)
    {
        return NativeFunction.Natives.xF9DDA40BC293A61E<float>(vehicle);
    }
}
```

The same three expression forms compile against both authentic SDK versions.
The SDK XML warns that even nonexistent dynamic method names can compile, so
this does not establish that the particular hash resolves.
The contract libraries are deliberately not plugins and have no entry points.
Static inspection also verifies the tested probe's full 64-bit hash, float return
type and single `IHandleable` argument conversion. This does not establish runtime
marshalling or equivalence of the two dispatch paths. The documented dynamic form
has not been tried in-game and is presented for maintainer clarification, not as
an alleged second failing path or a working fix.

## Identifier and contract provenance

The [pinned Enhanced NativeDB](https://github.com/alloc8or/gta5-nativedb-data/blob/424fb51b089049a9fbcebcc641500b1d44d255b4/natives_gen9.json#L112332)
lists `_GET_VEHICLE_CURRENT_REV_RATIO`, `float(Vehicle)`, the same full hash and
Enhanced introduction metadata `811`. This is not a CFX-only extension identifier.
The database's last explicit game-update target is
[3889.0/1158.13](https://github.com/alloc8or/gta5-nativedb-data/commit/897dee3972a573ac6b72726a8ae2ef4f13eda0ac);
it does not prove this installed executable's native registrations or range.

The newer official SDK XML recommends `NativeFunction.Natives` rather than direct
`CallByHash`, and documents `x` plus the original 64-bit hash and one generic
return type. The [published dynamic-call reference](https://docs.ragepluginhook.net/html/T_Rage_Native_DynamicNativeFunction.htm)
describes the same syntax. We did not find a `NativeCallFlags` type/parameter in
either SDK. The [current exact-build SDK reply](https://www.lcpdfr.com/forums/topic/157697-request-for-enhanced-rph-sdk-compatibility-gta-v-10115816/?comment=834046&do=findComment)
says Enhanced does not need a separate SDK, but does not address these symptoms.

## Questions for maintainers

1. Is the Bati's RPH ratio getter expected to remain normalized `0..1` on this
   exact Enhanced runtime? Is a current compatibility defect/fix known?
2. Is `F9DDA40BC293A61E` supported through RPH on Enhanced 1158.16? Does the
   recommended dynamic `xHASH<float>` path differ in native resolution from the
   direct public overload, or only in binding/caching?
3. If this identifier cannot be resolved, is a different **documented supported**
   interface or identifier required? Please identify its provenance and contract;
   we have not guessed/remapped hashes or used direct addresses.
4. Is there an authentic current runtime/SDK update or maintainer-provided minimal
   reproduction that should be used before another controlled read-only test?
5. Which mod-isolation control would you want first, given the current required
   DirectStorage arrangement? No installation changes have been made to pursue it.

Expected outcome: a supported finite operating-state reading with an established
meaning/range, or an explicit unsupported/unavailable result. The present data
does not prove native absence, an outdated offset, percent units, a shared cause
for both failures, or that a reference-SDK update fixes either one. Invalid values
remain rejected and GTA stock audio is preserved.
