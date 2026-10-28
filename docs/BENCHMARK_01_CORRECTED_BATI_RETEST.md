# BENCHMARK-01: My corrected Bati live retest

28 October 2026. One supervised Enhanced Story Mode launch and one controller attempt, stacked on draft PR #39 at `e9ab51cb7d88781c7221eea817dd2ae550f20c34`. No earlier PR was merged. Combined ACOUSTICS-05 + BENCHMARK-01 remains **60%**.

**Outcome: FAILED during the installer invocation, before indexed upgrades, rider creation or driving.** My new diagnostics retained a genuine pre-request kit result of **65535 / `0x0000FFFF`** and an installer-block **`NotSupportedException`**. I did not change the implementation, retry the request or create another bike. My owned-bike absence check and writer closure passed; the session then exited normally.

## Tested configuration and preflight

| Item | Observed or verified value |
|---|---|
| Tested source | `e9ab51cb7d88781c7221eea817dd2ae550f20c34` |
| GTA V Enhanced | 1.0.1158.16, single-player Story Mode |
| RPH | 1.132.1428.17748 |
| Existing reviewed dependencies | DirectStorageFix 1.2; Alexander Blade XInput loader 1.0.0.2 |
| Plugin assembly SHA-256 | `4F6BE368B4FB33E9E9E7FBBB235AEB133CEA994C8606D2D041E1C489C2E2C96A` |
| Sealed deployment manifest SHA-256 | `DA3AB2358908EE198D8BA8DE08C17738F3ECA9382EF9C3E295CB5ADD8733031F` |
| Temporary additions | 27 paths: 25 unchanged reviewed support files plus fresh assembly/configuration |
| Route | Original START, MID1, MID2, MID3, FINISH; no RUNOUT |
| Bounds retained | 120-second driving run; 20-second post-FINISH limit; 150-native-unit post-FINISH cap; one-second stationary confirmation |
| Acquisition / mutations outside approved scope | No new collision queries, traffic suppression, handling changes, source audio or security-setting changes |

I fetched the sanitized repository and independently read back PR #39's exact head, open/unmerged state and successful hosted CI. The current source compiled against the pinned SDK. My focused mod-kit, Bati and five-stop suites passed before deployment. A first shell test command named a nonexistent five-stop script; no test ran under that name, and I then executed the actual registered five-stop suite successfully.

The original 30 survey observations and saved listener were revalidated without remeasurement. Fresh route serialization reproduced the original route fingerprint. I created a new private candidate, output directory, nonce, assembly-bound approval and deployment journal; none of the consumed prior intent or runtime output was reused. The 96 protected earlier runtime/preparation files matched before the attempt.

Pre-deployment verification matched the exact original 32 root-file hashes, 179 archive metadata records, ten sampled archive hashes, executable signatures, obsolete-executable backup and empty temporary destinations. The ProcMon cleanup gate passed. The established temporary executable-selection rename and existing `-forcesettings -log` RPH launch procedure were used. RPH displayed the expected build and version, with no automatic plugin loading. Its inherited-elevation notice was acknowledged without changing privileges.

## Observed sequence

1. Enhanced reached Story Mode. I returned to my saved airport listener position on foot. The visible airport area was inspected; no claim of complete distant route clearance was made.
2. I loaded the corrected plugin once. It reported **READY FOR PREFLIGHT**, wrote its private session record and did not spawn a bike on load.
3. Status reported listener distance **0.00**. Arm independently passed the listener, stationary, approval and immediate monitored-interference guards. Start remained separate.
4. I issued Start exactly once. The durable intent was consumed; one Bati was created and passed the implemented original identity, native presence, model and persistence checks.
5. The pre-request getter returned the raw integer below. The explicit installer path then raised the recorded exception. The controller stopped automatically and preserved the diagnostic instead of retrying or bypassing it.
6. The controller recorded `owned entity deletion observed absent`, final stage `Cleaned`, and cleanup `VERIFIED_ABSENT`. The writer closed, did not report failure and contained zero movement readings; drawing detached.
7. I requested plugin unload, closed the console and accepted the normal Quit prompt. The input tool lost its foreground process binding as the game exited; subsequent independent process/window checks established exit. No forced termination was used.

## Actual mod-kit evidence

| Field | Actual result |
|---|---|
| Ownership at last required check | `OWNED_BATI_VERIFIED` |
| Getter before request | `RETURNED`, `System.Int32`, **65535**, **`0x0000FFFF`** |
| Requested selector | **0** |
| RequestIssued | **true**: the adapter invocation was attempted; this is not proof that the game native executed |
| Installer | `SET_VEHICLE_MOD_KIT`, explicit declared `System.Void` return type |
| InstallerReturnedNormally | **false** |
| InstallerExceptionType | **`NotSupportedException`** |
| Getter after request | Raw **null**, status **UNKNOWN**; operation not reached |
| Available-kit count | Raw **null**, status **UNKNOWN**; operation not reached |
| Documented kit identity validity | **UNKNOWN** |
| Verified indexed categories | **0** |
| Final setup verification | **FAILED**, reason `installer or ownership failure` |
| Controller reason | `stock tuning failed: installer or ownership failure` |

The adapter invocation in the tested source is:

```csharp
NativeFunction.CallByName("SET_VEHICLE_MOD_KIT", typeof(void), Bike(id), selection);
```

**Confirmed:** the corrected path did not return normally from its installer/ownership block; the recorded exception type is NotSupportedException. Successful compilation and the public overload's existence did not prove that this explicit return-type usage worked in the installed runtime.

**Leading next hypothesis, not established cause:** the explicit `typeof(void)` native-call convention is unsupported by the runtime. The safe diagnostic records the type only, not an exception message or stack; it does not uniquely attribute the throw to the dispatcher, native, or an ownership call in that guarded block. I therefore cannot claim which internal layer rejected the operation, nor whether the native executed before the exception. The next offline review should isolate the supported RPH invocation convention for a void native before any further candidate is proposed.

The genuine **pre-request** 65535 matches the historical no-kit representation discussed in the contract review. It is not a post-installation result, does not prove permanent Bati incompatibility, and cannot reconstruct the unrecorded getter from my first attempt. No new conclusion about Enhanced sentinel semantics or the old wrapper's implementation follows from it.

## Independent outcomes

| Stage | Result |
|---|---|
| Enhanced, RPH and plugin loading | PASS; initialized READY |
| Saved listener and Arm | PASS; 0.00 displayed, guards passed |
| Owned Bati creation | PASS; required identity/model/presence/persistence checks passed |
| Default kit selection | FAIL to return normally; raw pre-request 65535, installer NotSupportedException |
| Indexed upgrades 11/13/12/15 | NOT REACHED; no category counts, selections or readbacks |
| Turbo 18 | NOT REACHED; no toggle, availability or physical-effect evidence |
| Rider creation | NOT REACHED |
| Driving and checkpoints | NOT REACHED; no driving task or accepted starting baseline |
| Highest speed / acceleration / distance | UNAVAILABLE; zero readings are not zero-valued measurements |
| FINISH, natural braking, stationary hold | NOT REACHED |
| Manual Abort | NOT TESTED; automatic failure termination was sufficient |
| Owned-bike cleanup | VERIFIED_ABSENT under the existing copied-GUID native presence plus invalid-wrapper contract |
| Writer closure | PASS; closed true, failed false, zero readings |
| Normal shutdown | PASS; relevant processes absent after Quit; no forced kill |

The cleanup result is the implemented independent saved-identity presence check, not a second observer or an unlimited guarantee against future identity reuse. No raw private entity identifiers are published. No live RPM or full-throttle/mechanical-top-speed claim is made.

## Restoration and preservation

Independent restoration **PASSED** against the exact original manifests: **32 root files, 179 archive metadata records, ten sampled archive hashes**, valid original executable signatures and all **27 temporary paths absent**. The temporary executable filename was restored, all relevant runtime processes were absent, and the 96 protected earlier runtime/preparation files remained hash-identical. The unchanged source survey and listener fingerprints were also checked. Raw session files, coordinates, route records, approval receipts, entity identities and game logs remain private outside GTA and Git. The exact introduced files and generated diagnostics were preserved outside the game by the established restoration procedure; original archives were not modified.

## Validation and next decision

Preflight reran **130 mod-kit assertions / 191 independent checks**, **155 Bati assertions / 715 checks**, and **88 five-stop assertions / 44 checks**, plus the pinned-SDK build. This report changes no runtime source, renderer default, traffic policy, geometry cache, route or telemetry schema. It does not rerun or claim new source-synthesis validation. Hosted CI and publication checks are recorded after completion for the report's exact commit.

My next smallest action is **one offline review of RPH's supported void-native invocation convention and the precise adapter failure boundary**. I have not implemented a fix, proposed a fresh live test, or treated this failed attempt as successful stock tuning. A later test would require another fresh candidate and separate approval; this one-shot intent is consumed.
