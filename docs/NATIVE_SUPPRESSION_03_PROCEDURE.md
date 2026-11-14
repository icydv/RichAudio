# Native idle experiment: guarded decorator registration

This is a new, unexecuted proposal. The candidate-02 approval was consumed by its one launch. It does not authorize this change or another launch.

## Purpose and added operation

Candidate-02 admitted the on-foot setup, then stopped because the integer ownership decorator remained unavailable. The retained SHVDNE API documents that new decorator names require an unlocked registration interface. The next candidate repairs that specific preparation path and preserves the existing lifetime tokens and audio experiment.

The added intervention is a brief access to the global decorator-registration lock through `GTA.DecoratorInterface.IsLocked`. If the exact private name is already registered as an integer, registration needs no lock mutation. A conflicting type is refused. Otherwise the probe admits the framework binding, reads the original lock value, temporarily unlocks if necessary, registers the one name `RA_NS01_8b7e24c1` as integer type 3, and restores the original lock value in `finally`. Restoration and integer registration must both verify before `REQUEST_MODEL`. No wait, yield, filesystem access or synchronous log flush is permitted while unlocked.

The availability guard uses the already loaded, exact retained core/API assemblies. The background identity check validates their file identities and expected locations and derives writable, non-executable ranges from the exact game image's PE headers plus its loaded module metadata. At the manual spawn command, a small reflection guard reads the framework's managed private pointer field `SHVDN.NativeMemory.s_isDecoratorLocked`, checks its expected `System.Byte*` type, and rejects null or an address outside those image ranges. It does not scan game memory, guess an offset, dereference the pointer itself or write through it. Actual lock-byte reads and writes use the public SHVDNE property.

That is nevertheless additional framework-backed game state access and a brief global registration unlock. A new approval must explicitly include it. It is not part of the consumed candidate-02 scope and is not a native audio hook. The address guard establishes availability and range, not independent semantic correctness of the framework resolver on Enhanced 1.0.1158.16.

## Startup admission and failure handling

Before F5, Codex must verify the current launch's successful `NativeMemory took ...` initialization entry, followed by this probe's startup, with no intervening initialization failure, script reload or domain replacement. SHVDNE normally initializes native memory before scripts start, but its loader can continue after an initialization failure. Reflection field access can trigger an unrun type initializer; there is no public non-executing initialization-status query. The probe must not call `RunClassConstructor` to work around failed startup. Missing or ambiguous startup evidence ends the attempt before F5.

Any missing binding, conflicting type, failed unlock, failed registration or unverified lock restoration ends progression before model request. Do not retry the registration or change the lock again after an ambiguous failure. If lock restoration fails, preserve that result and exit normally. A clean disk rollback does not prove the lock was restored in the running game.

The new decorator registration is a session-wide name. Restoring the lock does not unregister it; there is no claimed name-unregister operation. This controlled experiment does not establish compatibility with other scripts concurrently changing the registry or lock. No test vehicle can be adopted, and the model, full handle, script ownership and distinct token checks remain unchanged.

## Audio sequence and bounds

The rest of `NATIVE_SUPPRESSION_01_PROCEDURE.md` remains applicable, with the new candidate's scope supplying current source/build identities, temporary OBS profile/collection and evidence paths. The new scope would replace the original blanket memory-access exclusion with only the specifically enumerated SHVDNE lock access above. All other memory/debugger/hook access remains excluded.

The proposal still allows one offline Story Mode launch, one spawn request and at most one disposable Bati pair. The 600-second active bound begins with F5, including registration. There is no automatic retry or second launch. Native audio only; only A receives stock → preserve → B1 → C → B2 → preserve → BATI. B remains unassigned. All commands retain Ctrl+Shift; F6/F7 arm/apply, F9 requests the permitted safe release, and F10 performs separate retirement.

Silent C requires positive attributable B1, the unchanged frozen calibration and my explicit phase confirmation. Before interpreting fixed-band loss, preserve the wider spectrum, steady operating conditions, listening observations and control evidence. Normal audible return must be recorded on the same surviving A before deletion. If activation or capture admission fails, stop progression and perform only the permitted release and cleanup. No audio resources are changed or rebuilt for this correction.

The decisive new observation is whether the exact SDK binding is available and restores its original lock state while registering this one integer name, allowing the pair and the existing B1 activation test to proceed. Neither offline compilation nor fixture success establishes that outcome.
