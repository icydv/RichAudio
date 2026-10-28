# RichAudio BENCHMARK-01 — Bati Mod-Kit Contract Investigation

28 October 2026. Offline follow-on to unmerged PR #38, verified head `29b99b0ac419be7876964dabaa8d06c52886eb3c`. Combined ACOUSTICS-05 + BENCHMARK-01 remains **60%**. No GTA/RPH launch, game-file deployment, entity creation or reuse of the consumed live approval occurred.

## What my failed attempt established

The tested assembly from `e243209918c48c69e1162eb086c8ba47bd38111b` created and verified one owned Bati, then stopped at `mod kit readback failed`. That message means my predicate `GET_VEHICLE_MOD_KIT(...) == 0` returned false. The actual integer was not retained. No rider, driving, category upgrade count, indexed readback or turbo observation followed. Cleanup and installation restoration passed; those private records remain unchanged.

The leading explanation is that I conflated a **selection argument** with a **getter's identity/index namespace**. That is an unsupported assertion in my code, but it is not a confirmed reconstruction of the live getter's missing value. Installer semantics, timing or a genuinely unavailable kit could still explain that attempt.

## Interface evidence

Ordinary GTA native sources were reviewed at citizenfx/natives commit `c00e0ed83d06dcba2457424ba254fbaa7a05bf7e`. These are documentation for ordinary GTA natives, not a FiveM integration or exact-build compatibility certificate.

| Interface / source | Established fact | Limit |
|---|---|---|
| [SET_VEHICLE_MOD_KIT](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/VEHICLE/SetVehicleModKit.md) | Void setter; selection zero is prescribed before ordinary indexed modifications | Does not promise the getter returns that same number |
| [GET_VEHICLE_MOD_KIT](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/VEHICLE/GetVehicleModKit.md) | Returns an integer | Page does not define a validity range or setter/getter identity equivalence |
| [GET_NUM_MOD_KITS](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/VEHICLE/GetNumModKits.md) | Integer query taking one vehicle | A per-vehicle count cannot validate a proposed global collection index |
| [GET_NUM_VEHICLE_MODS](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/VEHICLE/GetNumVehicleMods.md) | Reports available choices for a modification category | Capability evidence, not proof that any modification was applied |
| [SET_VEHICLE_MOD](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/VEHICLE/SetVehicleMod.md) / [GET_VEHICLE_MOD](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/VEHICLE/GetVehicleMod.md) | Indexed setter; getter reports current index, with -1 representing stock | Matching readback establishes selected state, not physical performance or setter causality when already matched |
| [Historical RPH InstallModKit documentation](https://docs.ragepluginhook.net/html/M_Rage_VehicleModder_InstallModKit.htm) | Parameterless void method intended to install a default kit | Documentation targets RPH 0.56; does not expose its internal native call/argument |
| [alexguirre's authored research example](https://gist.github.com/alexguirre/b9ca4f50ac79409034eeb3e34e04832b) | Historical example treats 0xFFFF as no kit, otherwise checks a global collection index and distinguishes index from kit ID | Not Enhanced 1158.16 proof; validating its table requires memory access that I have not imported |

The gist's displayed raw link identifies revision `26d9fe91fba1f2088dad6165e1930f358fc37923`; its displayed source was inspected, not executed or copied. Its memory signatures, layouts, offsets and internal enum values are absent from this implementation.

### Actual pinned SDK

The reference SDK is version **1.124.1393.17586**, SHA-256 `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0`. Static PE metadata confirms `Rage.VehicleModder.InstallModKit`: public instance, zero parameters, void return, **RVA zero/no implementation body**. The SDK therefore cannot establish whether the actual RPH 1.132 wrapper internally calls SET_VEHICLE_MOD_KIT or what argument it supplies. I did not decompile the runtime or execute SDK code. The version difference alone proves no ABI defect.

The SDK exposes a native-call overload with an explicit return type; my corrected adapter compiles using `typeof(void)` for the setter and `int` for the getters. Compilation is not live validation.

## Corrected contract

I removed the Boolean `KitVerified` equality check. The adapter now requests the documented native selection **zero explicitly**, through RPH's existing native interface. That removes uncertainty about my requested argument without guessing the old wrapper's internals. No retry, delay, alternate selector or memory reader is added.

The new sequence is:

1. Verify the exact owned Bati and copy its model identity into diagnostics; no entity handle/session/nonce is included in the new diagnostic.
2. Capture the raw pre-request kit integer and status. Missing/throwing observations stop setup. A returned pre-request sentinel can be retained while requesting a default kit; it is not treated as an already valid kit.
3. Record the installer invocation attempt with selection zero and whether the void call returned normally. A normal return alone is not success. Exceptions and ownership loss fail closed.
4. Capture the post-request integer. Both zero and ordinary nonzero values remain `RAW_INDEX_SEMANTICS_UNKNOWN`; **neither is an automatic pass**. `DocumentedKitIdentityValidity` remains `UNKNOWN` even after functional tuning confirmation.
5. Conservatively stop on historical no-kit value 65535, negative values or values outside the historical unsigned-16-bit index representation. This screening bound is explicitly a research policy, not a proven Enhanced validity range. It could reject a future legitimate representation; I have not silently reinterpreted or masked integers.
6. Capture GET_NUM_MOD_KITS and require a positive returned count. I never compare the raw getter value against this per-vehicle count or assume the two share a namespace. Missing/throwing/nonpositive counts fail closed.
7. Retain category order **engine 11, transmission 13, brakes 12, suspension 15**. Query counts with the existing 0–128 bounds, retain count-zero categories as unsupported, and request only the highest valid `count - 1` for available categories. Recheck ownership around operations and require each actual subsequent readback to equal its requested index.
8. Require at least one verified indexed category and successful verification of every attempted available category. **All categories unsupported is not successful setup.** A later mismatch/exception keeps the whole setup FAILED even when an earlier category verified.
9. Retain the existing separate turbo-18 toggle policy and readback, including its explicit uncertainty about availability/effect. Turbo alone cannot rescue unverified indexed setup.

Only these functional observations can yield `VERIFIED_BY_INDEXED_READBACK`. This means that the available indexed modification states were observed as requested, **not** that a raw kit index was documented as valid, the global kit identity was independently resolved, or physical performance improved. The research goal is verifiable ordinary stock tuning, not recreating an undocumented global table.

A sentinel or unknown result is never changed to zero to make setup proceed. Any genuine setup failure continues through the original one-shot failure/ownership-cleanup path before rider creation.

## New private diagnostics

`RunRecord.ModKit` is an additive optional research record with its own version 1. Historical recordings are not rewritten; an absent diagnostic deserializes as unavailable.

| Field | Meaning |
|---|---|
| RequestedSelection / RequestIssued | Planned selector zero and whether the installer invocation was attempted; not a native success acknowledgement |
| Installer / InstallerReturnType | Explicit ordinary native and System.Void |
| InstallerReturnedNormally | Nullable Boolean: unknown before the call, true only after normal return, false on installer failure |
| InstallerExceptionType | Safe type name only; no raw exception message or personal path |
| Before / After | Nullable raw integer, exact unsigned hex display, declared System.Int32 return type, status and safe exception type |
| AvailableKitCount | Separate raw integer query with the same status representation |
| VehicleModel / Ownership | Model hash and status of the last required ownership check; no creation GUID, reuse counter or approval token |
| Indication / DocumentedKitIdentityValidity | Conservative indication, with actual kit identity validity explicitly UNKNOWN |
| VerifiedIndexedCategories | Number of successful actual indexed readbacks, not total category count |
| Verification / Reason | Unverified, failed or functional-readback-confirmed, with a specific bounded reason |

Each indexed upgrade also retains whether its request returned normally. A setter exception is `INCOMPLETE_EXCEPTION`, not verified and not a claim that no side effect occurred. Requested/observed indices remain nullable. Snapshot copies are deep, and the cached display includes kit outcome/reason. Unavailable values are not defaulted to zero. Errors after a raw integer was obtained retain that integer but mark the observation unusable when ownership is uncertain.

## Tests and unchanged scope

All new inputs are original synthetic fixtures. Values such as 207 are invented **test values**, not recovered Bati readings. A synthetic getter value 207 with model count 1 deliberately demonstrates that the namespaces are not compared. Its raw semantic classification remains UNKNOWN; successful indexed readbacks provide the independent functional confirmation.

- **130 new C# assertions across 22 cases**, plus **191 independent JavaScript diagnostic/boundary checks**.
- Cases cover zero/nonzero with functional confirmation; historical sentinel; negative/out-of-representation values; missing before/after; getter/installer/count exceptions; missing/zero/negative kit count; unsupported/invalid category counts; indexed mismatch; incomplete setters; later failure after an earlier successful upgrade; ownership loss; exact owned cleanup; no rider/drive after prerequisite failure; no second Start; deterministic private persistence; snapshot isolation; safe exceptions; and historical absent fields.
- Existing targeted regressions: **155 Bati C# assertions / 715 independent checks**, and **88 five-stop assertions / 44 independent checks**.
- Pinned-SDK adapter compilation passes. Source-audio/geometry research is not rerun locally for this isolated tuning change; hosted CI uses the existing registered offline suite and is reported only after readback.
- The controller's driving/event clock, requested speed/style, checkpoints, listener, FINISH detection, braking, stationary hold, traffic policy and cleanup algorithm remain byte-identical after excluding only the allowed tuning diagnostic message/snapshot/display additions. The experiment host, markers, five-stop reader, movement analysis, telemetry, geometry and acoustic code are unchanged.

No old approval, nonce or evidence directory was reused, and no new live candidate was sealed. The old measured failure remains intact. Preservation and publication checks cover the protected historical evidence, original source-audio work and staged public files; proprietary SDKs, recordings, binary resources and raw private diagnostics are excluded.

## Conclusion and boundary

**Offline contract correction: supported. Exact previous runtime cause and live recovery: unproven.** The old zero-equality assertion is gone, so that exact predicate cannot reject a nonzero value again. The underlying failure could still recur as a retained sentinel, unavailable count, native exception or failed indexed readback, and it will now carry useful raw evidence.

The correction is technically defensible for future bounded validation once a fresh candidate has passed its own review. This task **does not propose or authorize that test**. GTA remains unlaunched, the earlier one-shot intent remains consumed, and benchmark progress stays at **60%**.
