# Native suppression: corrected occupancy run

## Native audio result

The corrected on-foot check passed, but the probe stopped before creating either Bati because its integer ownership decorator was still unregistered after `DECOR_REGISTER`. No private profile was assigned. Preserve, B1, C, B2, audible handback, B isolation and experimental vehicle behaviour were therefore not tested.

I approved one run of candidate-02 under scope `efb9c44cfa40ebcec30703ca67cac72c51a847d9123ce58596690e189d91ecc1` and confirmed that I was present. The analysis verified the clean source commit `f5fa725d77d791253a47ace021e31b25c73a9e58` and corrected DLL `34c2c1227ad3c99de6c54d830e4ab7b4129ad53ba0b47ec997efebb49028d843` against candidate-02's own build receipt and scope, then installed those exact files. The original candidate-01 DLL was not substituted.

There was one Story Mode launch. Fresh loader output confirmed the corrected probe started. OBS was initially hidden; I brought its existing window forward from the tray. An attempted application activation showed an additional-instance warning and was cancelled. The original recorder process performed the continuous recording. No second game launch, profile retry, reset, resource replacement or forced termination occurred.

## What the journal establishes

| UTC on 14 November 2026 | Event |
| --- | --- |
| 01:12:55.6034114 | Game launch requested |
| 01:13:12.3759023 | GTA process started |
| 01:14:04 | Fresh SHVDNE log reports the probe started |
| 01:15:57.573 | OBS recording-start notification |
| 01:16:23.3691849 | One spawn request accepted |
| 01:16:23.4222356 | `STOP: spawn preparation failed` |
| 01:16:23.4232587 | `ownership decorator registration unavailable; no spawn permitted` |
| 01:17:37.479 | OBS finalized the recording |

Reaching this specific exception establishes that `StoryReady`, the dead-player, corrected current-vehicle and interior checks, both offset/space checks, and the attempted registration path completed without an earlier refusal. The final integer-type registration query was false. The exception occurs before `REQUEST_MODEL`, so this run created zero experimental vehicles and made zero audio-profile assignments.

It does not establish why registration failed. The lock state, conflicting decorator types, table capacity and internal native resolution were not recorded. The earlier occupancy correction has positive runtime evidence in this setup; native audio resource resolution still has none.

## Source-backed registration defect

The retained SHVDNE v1.1.0.6 `GTA.DecoratorInterface` documentation says the global interface should be locked when scripts start, and new names require unlocking through `IsLocked` before `Register`. `Register` only calls the native; it does not unlock automatically. The probe used the raw registration native without that step. A locked registry is therefore the leading source-backed explanation, not a measured runtime fact.

The exact reference is revision `d756d479337a677cce9853b0cce63471c1fc7b7c`, retained in the SHVDNE01 worktree under `.local/shvdne-reference/source/source/scripting_v3/GTA/DecoratorInterface.cs`, with matching release XML documentation. Core metadata inspection confirmed `ScriptHookVDotNet, Version=3.9.0.6, Culture=neutral, PublicKeyToken=8564999cffc18483` and the private static `System.Byte*` field `SHVDN.NativeMemory.s_isDecoratorLocked` in the actual retained ASI. Inspection used reflection-only loading and did not execute its initializer.

The public lock property dereferences that pointer without checking for null. The source contains an Enhanced-specific resolver, but successful resolution on this exact game build has not been observed. A guarded correction must establish the loaded framework identity and binding availability before using the public property, preserve the original lock state, and refuse before model request on any registration or restoration failure. A nonzero address or an image-range check alone does not prove that the resolved byte has the intended meaning.

No ownership token should be removed to bypass this failure. A future registration change must retain full handle, model, script ownership and token readback checks. A brief registration unlock is global state; restoring its lock does not unregister the new session-wide decorator name or establish compatibility with other scripts changing the lock concurrently.

## Capture and cleanup

Private evidence is retained under `C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-02`.

- Recording: `capture/2026-11-14 01-15-57.mkv`, 34,579,681 bytes, SHA-256 `897fefa4fe8a76c2ffc1701df776b0184dc63973c0bb1739c8c897eae9e3afbf`.
- The finalized recording is 99.400 seconds, H.264 1920×1080/30 fps with AAC 48 kHz stereo. Full decoding and the unchanged timestamp checks passed. The maximum video interval was 100 ms, at the validation policy's permitted limit.
- Consecutive frames show `DORMANT` at 25.833 seconds and `STOP: command or callback fault` at 25.867 seconds. The character appears on foot in the exterior parking area; no pair is visible. These images do not expose decorator state.
- `capture-finalization.json`, `capture-finalized-timeline.json`, `capture-visual-review.json`, the journal and retained loader/OBS logs preserve the evidence. There was no marker calibration or quantitative suppression measurement.

I confirmed that GTA exited normally. The operator finalized and closed OBS, retained the new evidence and restored the enumerated installation. Independent verification passed at 01:21:27 UTC: 112 identities, the exact 49 root DLL/ASI inventory, all original archives, four restored settings/log files and Trainer bytes/timestamps/attributes matched. All eleven temporary installation destinations, created directories and the probe journal directory are absent. No GTA, PlayGTAV, RPH or OBS process remained. The ordinary new OBS log remains at its source and matches the retained copy.

The cleanup receipt is `cleanup-verification.json`, SHA-256 `922d2d5b06beeb79affb4216a75725d19ce01f7217ae15c16c2dd7b56e6519b8`. The approved candidate-02 worktree remains clean at its original corrective commit; candidate-01 and bound execution-01 evidence were preserved. New development occurs separately.

Disk restoration passed. There was no surviving experimental vehicle requiring audio restoration or retirement because none was created. Zero profile assignments means there is no basis for interpreting this as failed resource substitution or failed silent PCM. The resource route remains untested; this setup failure does not justify a native audio hook or broader suppression coverage.

## Offline correction after restoration

The change introduced `IdleDecoratorRegistration.cs` in the separate NativeSuppression03 worktree and connected it to the existing adapter/journal. The worker checks the loaded core/API identities and captures field and disk PE metadata without reading the pointer. The manual preparation path checks the pointer and uses the public SDK property for a scoped unlock/register/restore operation. It records the original lock state and restoration outcome, and keeps model requests blocked on failure. Existing integer registration needs no lock access; conflicting types are refused. All existing vehicle lifetime checks remain unchanged.

The actual adapter/controller fixtures passed 47 cases and 193 assertions, including initially locked and unlocked registries, conflicting names, unavailable binding, failed/throwing registration, partial unlock failure, failed restoration, null/out-of-range pointers and invalid PE data ranges. An independent reviewer recompiled and reran the suite with the same result. The corrected production probe compiled against the exact retained public API/core with x64 and warnings treated as errors. Unsafe compilation is confined in purpose to unboxing the managed pointer value; the guard performs no raw target-byte access.

This correction has not run in GTA. Its next proposed operation and startup-admission requirement are described in `NATIVE_SUPPRESSION_03_PROCEDURE.md`. The missing runtime facts remain whether the retained Enhanced resolver provides the intended lock binding, whether the scoped registration succeeds and restores the prior lock value, and then whether the existing B1 resource activates. No audio archive or engine/exhaust graph was rebuilt or expanded.
