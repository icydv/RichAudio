# PLAYABLE-02 operating-state provider research

31 October 2026. **No replacement engine-revolution provider is validated on
Enhanced 1.0.1158.16.** The PLAYABLE-01 Bati reading of `50` remains invalid.
The investigation below establishes public interface provenance, not correct
target-build behaviour. A published base-game current-revolution-ratio native is
the strongest direct candidate for a small authorised measurement. No GTA
launch, deployment, native call or live capture
was performed for this research.

## RPH contract and diagnosis boundary

The published [Vehicle.EngineRevolutionsRatio documentation](https://docs.ragepluginhook.net/html/P_Rage_Vehicle_EngineRevolutionsRatio.htm)
specifies a `float` ratio in `0..1`, with historical off/idle/maximum examples of
`0`, `0.2` and `1`. That documentation identifies RPH v0.56; it does not establish
changed percentage semantics for the installed v1.132.1428.17748. A direct page
fetch returned HTTP 404 during this review; the search index still supplied the
documented contract. The pinned SDK and installed implementation are separate
local evidence: see the main PLAYABLE-02 report for their inspection results.

Neither a documentation age nor an out-of-range reading proves an offset defect.
No conversion of `50` to `0.5`, clamping, speed-derived revolution ratio or
constant idle substitute is justified.

Subsequent separately authorised target-build measurements are reported in
[PLAYABLE-02](PLAYABLE_02.md). The direct rev-ratio candidate below threw
`No natives with hash "F9DDA40BC293A61E" were found.` through installed RPH.
No candidate value was obtained, and comparison natives were skipped on failure.
This is a framework-resolution failure, not proof of absence from the game.

## Alternatives and what their evidence establishes

| Interface | Established provenance and contract | Current decision |
| --- | --- | --- |
| FiveM `GET_VEHICLE_CURRENT_RPM` | The [CFX declaration](https://github.com/citizenfx/fivem/blob/9f0e34e1cbdfc34fd05079416791f01938279097/ext/native-decls/GetVehicleCurrentRpm.md) is in namespace `CFX`. The [implementation](https://github.com/citizenfx/fivem/blob/9f0e34e1cbdfc34fd05079416791f01938279097/code/components/extra-natives-five/src/VehicleExtraNatives.cpp) registers an additional handler backed by a vehicle-memory read. | Not a base-game Story Mode native. Do not invoke its CFX hash through RPH. |
| SHVDNE `GTA.Vehicle.CurrentRPM` | The [authentic public API source](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/b5314686ab534d9cec8914625a0f5ab2dde528ea/source/scripting_v3/GTA/Entities/Vehicles/Vehicle.cs) documents `0..1`; it delegates to SHVDNE's resolved memory field and returns zero when its pointer/offset is unavailable. | A genuine SDK interface, but no exact-build RPM proof. Do not copy its internal memory reader into RichAudio. |
| Base-game `GET_IS_VEHICLE_ENGINE_RUNNING` | The [VEHICLE declaration](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/VEHICLE/GetIsVehicleEngineRunning.md) returns `BOOL`. | Engine running state only; not revolution ratio, throttle or load. |
| Base-game `GET_CONTROL_NORMAL` | The [PAD declaration](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/PAD/GetControlNormal.md) returns a normalized control value in `-1..1`. | Player input only. Useful comparison evidence; cannot measure an NPC engine or establish RPM. |
| Base-game `GET_VEHICLE_ACCELERATION` | The [declaration](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/VEHICLE/GetVehicleAcceleration.md) describes a static maximum drive-force/capability value. | Not actual acceleration or engine operating state. |

The [official Script Hook V page](https://www.dev-c.com/gtav/scripthookv/) currently
lists release 15 July 2026 and Enhanced support `1.0.1158.13`.
[SHVDNE v1.1.0.6](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/releases/tag/v1.1.0.6)
likewise describes a compatibility fix for `1158.13`. These claims alone do not
prove `1158.16` compatibility or valid RPM. The [SHVDNE requirements](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/b5314686ab534d9cec8914625a0f5ab2dde528ea/README.md)
also require Script Hook V and matched ASI/API files. Adding another runtime is
not an established solution to the present getter defect.

## Sourced base-game candidates for measurement only

The [NativeDB data at commit 424fb51](https://github.com/alloc8or/gta5-nativedb-data/blob/424fb51b089049a9fbcebcc641500b1d44d255b4/natives.json)
contains these entries under `VEHICLE`:

| Published name | Published hash | Signature | Introduction metadata |
| --- | --- | --- | --- |
| `_GET_VEHICLE_CURRENT_REV_RATIO` | `0xF9DDA40BC293A61E` | `float (Vehicle vehicle)` | `build: 3095` |
| `_GET_VEHICLE_THROTTLE` | `0x92D96892FC06AF22` | `float (Vehicle vehicle)` | `build: 3095` |
| `_GET_VEHICLE_CURRENT_DRIVE_GEAR` | `0x56185A25D45A0DCD` | `int (Vehicle vehicle)` | `build: 3095` |

All three entries have empty comments and no published range, units or failure
semantics. `3095` is legacy introduction metadata, not an Enhanced support
claim. Their base-game classification is supported by this community NativeDB;
the exact installed native handler, semantics and return values have not been
verified. None appeared by name or hash in the reviewed current Cfx native corpus
or SHVDNE native enum. These are provenance-backed test candidates, not guessed
hashes. A changing throttle candidate must not be labelled measured RPM.

The direct revolution-ratio candidate has additional base-game provenance: the
published [race-controller native table](https://github.com/calamity-inc/GTA-V-Decompiled-Scripts/blob/593b204719dbeb519418390523f1ba8e4942d8d6/native_tables/fm_race_controler.txt#L1479)
contains `F9DDA40BC293A61E`. The corresponding
[game-script decompilation](https://github.com/calamity-inc/GTA-V-Decompiled-Scripts/blob/593b204719dbeb519418390523f1ba8e4942d8d6/decompiled_scripts/fm_race_controler.c#L677918)
reads the current revolution ratio alongside current drive gear. Later code uses
the native in threshold comparisons, including `0.85` and an upper comparison
bound of `1`. This is evidence for a normalized revolution-ratio interpretation,
**inferred from script usage**, rather than a published complete range/failure
contract. The table/decompilation is not a measurement of Enhanced 1158.16.
[A second community database](https://github.com/vhub-team/native-db/blob/f1635dda3a5ac6cda982c97f105c07a341d2c022/functions/0xF9DDA40BC293A61E.md)
also records the name, float result and 3095 hash but adds no behavioural contract.

## Small next experiment, subject to separate authorisation

Prepare an isolated measurement plugin that reads one existing supported Bati on
a game fiber. Prioritize the direct base-game revolution-ratio native, retaining
throttle and drive gear as independent comparison observations. Retain each raw
value, success/exception status, RPH ratio,
engine-running state, current gear, player input and motion as separate fields.
Record acquisition start/end monotonic timestamps, vehicle token/generation and
model. Write through a bounded queue outside the game thread; record acquisition
lateness and dropped records. Do not rescale or feed observations into audio.

With an independently enforced capture duration and explicit phase markers,
compare engine off, stationary idle, stationary throttle where supported,
acceleration, visible gear changes and deceleration. I drive and mark the phases; the observer does not spawn, drive or modify vehicles. A missing
phase or invalid reading makes that part inconclusive. An unavailable native or
unexpected exception stops that candidate's acquisition. Compilation cannot
prove native invocation safe or semantically correct on the target build.

Promote a provider only after its exact-build observations and contract support
the claimed measure. If the evidence supports throttle/activity only, retain that
name and design any source-control mapping explicitly as an estimate; do not
populate a measured revolution-ratio field. Until then, invalid operating state
continues to select stock fallback and the live listening acceptance remains
blocked.
