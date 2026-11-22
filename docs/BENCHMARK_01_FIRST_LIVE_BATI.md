# BENCHMARK-01: My first live Bati controller attempt

28 October 2026. Follow-on to draft PR #37; no research PR was merged. Combined ACOUSTICS-05 + BENCHMARK-01 remains **60%**.

**Overall benchmark outcome: FAILED during stock setup, with useful partial integration evidence.** I created and verified one owned Bati, but the mod-kit readback guard stopped the controller before rider creation, driving or movement capture. I did not retry. The controller reported the bike absent after guarded cleanup; GTA exited normally and installation restoration passed.

## Exact tested configuration

| Item | Verified value |
|---|---|
| Tested source | `e243209918c48c69e1162eb086c8ba47bd38111b` |
| Parent | PR #37 on PR #36, retaining PR #35 ancestry |
| GTA V Enhanced | 1.0.1158.16, single-player Story Mode |
| RPH | 1.132.1428.17748 |
| Reviewed dependencies | Existing DirectStorageFix 1.2 and Alexander Blade XInput loader 1.0.0.2; no replacement/download |
| Assembly SHA-256 | `EA5841F50173A5323F799C7F73F3084A09F47B0BB82A8B08DBCBDB8309A2002B` |
| Sealed manifest SHA-256 | `60164477F37710F099E27EFB89A0B4C5A2703BE3AFC11225E0E1FDF03D471B7B` |
| Temporary additions | Exact 27 paths: 25 reviewed support files and the Bati assembly/configuration pair |
| Route | Original five measured START/MID1/MID2/MID3/FINISH anchors; no RUNOUT |
| New collision queries / attempts | Zero new queries; one launcher session and one consumed controller intent |

Preflight fetched the current sanitized repository, checked the PR head and ancestry, revalidated the five saved cumulative survey records and closure, and reproduced the same candidate hash. Original markers and all 30 earlier observations were retained. Sparse coverage stayed partial, with continuous/distant clearance unknown. The original installation, backups, signatures, inactive diagnostic state, absent deployment targets, empty private output and existing offline launch options passed. I made no security-setting or launch-option change.

A local deployment-helper defect stopped its first Begin invocation **before any game-file mutation**: PowerShell converted the ISO approval expiry into a DateTime, then a second locale-dependent parse failed. I preserved that helper and corrected only its approval read to `ConvertFrom-Json -DateKind String`. A valid expiry and two invalid expiry cases were checked before deployment. The assembly, manifest, route and runtime implementation did not change. This was not another game or controller attempt.

## Observed sequence

1. I bound the explicit approval to the exact assembly, route and one-shot nonce, then deployed the 27 reviewed paths with the established temporary executable-selection rename.
2. RPH's launcher displayed Enhanced 1158.16 and RPH 1.132.1428.17748. No plugins were selected for automatic loading. Its informational notice reported inherited elevated privileges; I did not request additional elevation or alter security controls.
3. Enhanced started. DirectStorageFix registration and RPH initialization were observed in private logs. Story Mode was reached and remained responsive.
4. I loaded `RichAudio.Bati.Rph.dll` once. It reported **READY FOR PREFLIGHT**, created its private session record and created no entity at that stage.
5. Status reported listener distance **0.00**, NOT ARMED, and no automatic start. The player was visibly on foot at the previously saved airport equipment position. The runtime's stationary/listener, approval and immediate monitored-scope guards passed when Arm was issued separately. Distant route clearance remained unknown.
6. I issued Start once. The durable intent was consumed. The controller's Bati identity/model/native-presence/persistence checks completed, then stock setup failed with the exact reason **`mod kit readback failed`**.
7. No rider, indexed upgrade receipt, turbo result, driving task, accepted stationary baseline, movement sample, checkpoint arrival or braking request followed. The empty private JSONL was not treated as successful telemetry capture.
8. Failure cleanup reported `VERIFIED_ABSENT`, with lifecycle entry `owned entity deletion observed absent`. The writer closed without reporting a write failure, and drawing detached.
9. I requested plugin unload and used the normal Quit confirmation. Game exit was independently established only after the relevant processes disappeared; sending Return alone was not treated as exit proof. No forced termination was used.
10. The established restoration helper preserved generated diagnostics outside GTA, restored filenames and removed only introduced files. Its independent verification and a subsequent read-only Verify passed.

## Independent outcomes

| Operation | Outcome | Evidence / limit |
|---|---|---|
| Runtime loading | PASS | Enhanced, RPH, plugin initialization and READY observed |
| Listener and arming | PASS | Displayed 0.00 distance; actual runtime guards passed |
| Bati creation | PASS | Copied creation identity, required Bati model, native existence and persistence checks passed |
| Rider creation | NOT REACHED | No rider identity; controller stopped first |
| Stock upgrades | FAIL | Mod-kit verification failed before individual upgrade counts/readback |
| Turbo | NOT REACHED | Availability and physical effect not measured |
| Driving task | NOT REACHED | No driving request made |
| Checkpoint progression | NOT REACHED | No measured driving arrivals, including no accepted starting baseline |
| Speed recording | FAIL | Zero copied readings; speed, acceleration and distances are unavailable, not zero-valued measurements |
| FINISH detection | NOT REACHED | No FINISH observation |
| Natural braking | NOT REACHED | No maneuver-24 request |
| Stationary confirmation | NOT REACHED | No measured hold |
| Manual emergency Abort | NOT TESTED | Not needed after automatic guard termination; command existence is not live invocation proof |
| Owned cleanup | VERIFIED | Implemented saved-GUID native-presence and wrapper checks passed; see limits below |
| Writer finalization | PASS | Closed true, failed false, zero copied records |
| Normal shutdown | PASS | Quit requested; process disappearance subsequently verified; no force kill |
| Installation restoration | PASS | Original 32 root files, 179 archive metadata records, ten sampled hashes, executable signatures and all 27 temporary paths absent |

I have no measured highest speed, acceleration, stopping time, stopping distance, overshoot or final vehicle position from this attempt. I have not inferred physical zero speed from an empty recording. Reliable RPM remains unavailable; this attempt produced no new RPM observation. No custom sound, native muting, extra geometry, traffic suppression, alternate driving policy or second motorcycle trial occurred.

## Exact failure and uncertainty

In the tested source, `StockTuning.Apply` calls `InstallKit`, then requires `KitVerified`. The adapter's verification predicate is:

```csharp
NativeFunction.CallByName<int>("GET_VEHICLE_MOD_KIT", Bike(id)) == 0
```

That predicate returned false; the guard recorded `mod kit readback failed`. The actual integer was **not retained**, so I cannot say whether it was -1, another kit index or another value. An API method returning without an exception is not proof that the intended kit was selected. No individual performance modification was subsequently attempted by this controller.

The immediate stop condition is confirmed. The underlying cause is **UNDETERMINED**: possible selection semantics, an overstrict zero-index assumption, timing or an integration/readback issue have not been distinguished. I have not labeled this an RPH vendor bug or a Bati support failure. I did not relax the guard, replace the task policy, rebuild the plugin or run another trial to obtain a better result.

## Cleanup and evidence boundaries

The runtime final record and unchanged tested source establish the successful cleanup path: only the exact created bike was targeted, native existence was queried using the copied original full GUID after deletion, and wrapper invalidity was also required. The rider was never created. This is the **implemented independent presence check**, not a second observer or a permanent guarantee against future finite-counter reuse. Raw per-query native Boolean values were not separately logged; that evidence limit is retained.

All four runtime files were copied privately and hash-verified before shutdown. The final record reports FAILED, zero copied readings, consumed intent, writer closed, no writer failure and drawing detached. Raw captures, entity identifiers, positions, approval nonce/receipt, source survey records and machine logs remain ignored and private. Generated launcher, hook, loader and fix logs, configuration, the empty command-line file and the known template were preserved outside the game during restoration. No original game archive was modified.

## Offline validation and publication

The runtime implementation is unchanged from the tested commit. A new original synthetic regression makes the fake world's kit readback independently fail and verifies: one bike only, no rider, exact reason, zero movement/braking, no claimed indexed upgrades, only owned-bike cleanup and rejection of a second Start. It reproduces the control-flow outcome, not the unknown native cause.

- Targeted Bati suite: **155 C# assertions and 715 independent JavaScript checks passed**.
- Five-stop suite: **88 C# assertions and 44 independent checks passed**.
- No unrelated audio research suite was rerun for this documentation follow-up. Hosted CI uses the existing offline workflow and must be independently read back for the published head.
- Current survey records, original markers, private evidence and historical source/defaults are checked by their existing fingerprints. No raw game data or binary is staged. Existing reviewed historical identity exceptions remain separate from new publication findings.

## Next smallest useful action

**Review the mod-kit selection/readback contract offline and specify explicit requested/actual kit diagnostics before proposing another separately authorized live test.** The current evidence does not justify changing the expected value blindly. No further survey, route change, driving-policy experiment, acoustic work or additional launch is authorized by this completed attempt.

The first owned Bati creation and guarded failure cleanup are useful integration results. A working rider, acceleration run and FINISH-triggered stop remain unproven, so I am keeping the combined milestone at **60%**.
