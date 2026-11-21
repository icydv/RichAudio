# BENCHMARK-01: blanket requests with bounded streamed-pool observations

27 October 2026. **Live calibration result: PARTIAL; installation restoration PASS.** My existing RPH/loader/fix stack started successfully on the Steam-updated executable. The single approved calibration completed baseline and suppression, then stopped on its camera guard at 123.834 seconds during restoration. The controller finalized its private evidence and issued no requests after the suppression window. This is not a traffic-free route certification or motorcycle benchmark. Combined ACOUSTICS-05 + BENCHMARK-01 progress remains **60%**.

The preparation sections below retain the conditions established before approval. The separate execution section at the end records the actual attempt; earlier no-launch/approval-pending statements refer to the preparation checkpoint.

## Compatibility review and decision

The [publisher's Enhanced release page](https://www.lcpdfr.com/downloads/gta5mods/g17media/52970-lspd-first-response-enhanced-preview/) still lists Enhanced **1158.16**. Its latest listed compatibility update is dated **17 September 2026** and explicitly adds that version. I found no newer listed release or specific publisher statement requiring another RPH update for today's executable fingerprints. This is version-level support, not a hash-specific guarantee.

My retained RPH candidate is **1.132.1428.17748**, SHA-256 `73F05B3F7973D4731F4151AE061DD3C991065E8BF3ECE51EA1D9AB728B9B42AC`. All 25 retained runtime/loader/fix files match the prior sealed package. The loader remains Alexander Blade's **1.0.0.2**, and DirectStorageFix remains the previously reviewed **1.2**. No ScriptHookV scripting runtime is added. I have not downloaded or installed replacement dependencies.

The local Steam update and two changed executable hashes are recorded in [the earlier execution report](BENCHMARK_01_TRAFFIC_CALIBRATION.md#resumption-gate-original-executable-contents-changed). Both changed files have valid signatures, and the main executable still reports 1158.16. No previous Enhanced executable copy was found in the recorded project backup locations; the preserved executable backup is the obsolete 1013.34 `GTA5.exe`. I cannot compare old/new Enhanced code sections, establish RPH's exact hook dependencies, or certify compatibility merely from the version and signatures. Prior static DirectStorageFix research also did not establish its runtime pattern through an on-disk match. I have not patched patterns or attempted to compensate for that limitation.

**My decision:** retain the known working dependency versions as a candidate for one conditional compatibility/calibration attempt, rather than update blindly or declare them broken. Actual RPH, loader and fix startup on the newly fingerprinted executable remains **NOT TESTED**. That must be checked first during any separately approved launch; an unsupported-version or startup error ends that attempt without retry or fallback.

## What changes, and what stays unchanged

The three density natives take only a multiplier; the earlier yellow box limited observations, not the scope of the requests. Their hashes, float zero values and frame-scoped request lifecycle are unchanged. No dispatch switch, generator toggle, entity deletion, teleport, freezing or new vehicle/ped spawning is added.

| Item | Revised mode |
|---|---|
| Observation domain | Currently enumerated streamed vehicle pool; no road rectangle |
| Detailed cohort | Up to 32 valid readings nearest the fixed measured listener anchor |
| Deterministic ties | Distance, numeric handle, model, then SDK pool counter |
| Raw pool limit | 4,096 enumerated entries per observation; larger input aborts |
| Accounting | Enumerated = eligible readings + read errors; eligible = selected + omitted |
| Identity | Handle + model + SDK pool counter, within this session; rechecked while reading |
| Coverage | Always PARTIAL, including synthetic examples of this mode |
| Baseline / requests / restoration | 45 / 45 / 45 seconds; 150-second hard active cap |
| Sampling | Same nominal 5 Hz; at most 800 samples and 20,000 request receipts |
| Stationarity | Same on-foot/exterior/session, position, camera, pause and scheduling guards |
| Drawing | Text status only; no road outline or collision queries in pool mode |
| Stop | Manual stop, unload, exception, timeout and evidence limits remain terminal; no retry |

Pool evidence is **version 2**, with explicit `measured-player-pose-streamed-pool-v2` provenance. Old corridor evidence remains version 1, with its original spatial tests and default configuration. The independent validator rejects version/domain mixing and contradictory count, identity, frame, clock or coverage claims. Omissions are reported, not silently treated as an empty world. Per-phase enumeration counts remain available even when detailed readings are capped.

Nearest selection uses sequentially acquired positions relative to the fixed anchor. It is not an atomic world snapshot. The independent validator checks selected-cohort ordering and accounting, but cannot reconstruct the ranks of omitted readings whose positions are deliberately not persisted. Synthetic tests independently verify nearest selection from complete original fixture inputs. Changes in selected membership may arise from distance ranking, motion, streaming or identity reuse; they are **not certified road entries or new spawns**. SDK pool counters are not creation timestamps or a universal guarantee against identity reuse.

The pool result can be PARTIAL or INCONCLUSIVE, never a live isolation PASS. A usable synthetic baseline requires at least three distinct observed moving ambient-category identities. No observed traffic return is promoted to proof that every population subsystem restored. Runtime class/population getters and the three requests remain subject to actual Enhanced validation.

The HUD shows actual phase/time, `Traffic Isolation: UNVERIFIED | blanket requests ACTIVE` during requests and OFF outside that phase, enumerated/valid/selected/omitted/error counts, PARTIAL coverage and `Route Interference: UNKNOWN`. No route or Bati is under test, so I cannot claim interference NONE OBSERVED for an unobserved route. Display callbacks issue no observations or traffic requests. The small manual-stop reason labeling defect identified in the previous report is corrected in this new candidate; historical raw metrics are preserved unchanged. That correction is built but not live verified.

## Exact proposed supervised sequence

1. Recheck the newly reviewed file fingerprints, full installation and package preflight. Unexpected drift blocks deployment. No original file content is overwritten.
2. Deploy the sealed 27-file candidate and use the previously validated temporary old-executable filename change. Retain plugin autoload OFF and the existing approved offline Story Mode launch setup. No new launch arguments or security changes.
3. Launch RPH once. Verify executable/build, loader/fix initialization, RPH startup and observer READY. Stop on an unsupported build, exception or serious instability. No second launch or speculative alternate setting.
4. Stand stationary on a safe pavement near Legion Square. A junction may remain in the observed streamed scene; there is no road-box alignment or junction-exclusion task. My development tools inspect the screen for a suitable safe viewpoint. I do not ask a visual confirmation to certify streaming completeness.
5. Load `RichAudio.Traffic.Rph.dll`, then `RichAudioTrafficPrepare` once. This records a listener anchor and no population requests. In this explicit mode, `Area` is inactive and `Confirm` is unnecessary. `RichAudioTrafficBegin` starts the single sequence after READY/preparation checks. Remain stationary with a fixed camera.
6. Observe 45 seconds baseline, request the three blanket zero-density controls for 45 seconds, then cease requests for 45 seconds of observation. Existing vehicles are retained and counted. `RichAudioTrafficStop` ends the attempt at any point. No reset, extra area or repeated acquisition.
7. Verify CLOSED and saved private files, unload, quit normally, then independently restore and compare the installation. Observe the actual exit mechanism if possible; do not infer a normal quit from process absence alone.

Success at startup is not effective traffic suppression. Reduced streamed counts are not an empty road or causal proof. The whole distant benchmark route, existing-vehicle exclusion, emergency/scenario behavior, Bati AI and long-distance tracking remain separate unresolved gates. No geometry or audio experiment is included.

## Private preparation and restoration boundary

I've preserved the historical baseline, original sealed package, closed metrics and restoration receipt. A **separate proposed current-installation baseline** accounts explicitly for the two reviewed Steam-updated executables. The other **30 root files**, **179 archive metadata records** and **ten sampled archive hashes** match the historical evidence. The new root set contains 32 files. Executable signatures, old-executable backup, original names, absent temporary destinations and diagnostic cleanup pass read-only checks.

The new plan contains **27 additions**: the unchanged 25 dependency files and a new observer/config pair. Configuration explicitly selects schema 2 and `ObservationScope: streamed-pool`; historical configuration still selects corridor behavior. Raw configuration, binaries and detailed baselines remain under ignored private storage. A first private preparation was superseded by a fresh second candidate after a HUD wording correction; neither was deployed, and neither directory was overwritten.

- Final candidate manifest SHA-256: `C5A7814018237A42A2E37B9DF387D5A1A3F46A8CB05BF28738B67B9511FDB7C8`.
- Observer SHA-256: `DD3A166E8DC962316F7B52F2654DF97D6256A54EEC28B8D65B08C3BDDB7ACCD7`.
- Configuration SHA-256: `BB56606473D69A445DE4F1386E0C7323F3F9180574AAA1BA2CDA54A9B61BC2FB`.

The narrowly updated private journal/rollback helper passed its **Verify** action only. Begin was not invoked and no new deployment journal exists. It must recheck the exact current baseline and candidate before any approved mutation. Restoration returns to this reviewed **Steam-updated state**, not the obsolete pre-update hashes. It reverses the temporary filename change, preserves/removes only introduced files and recognized generated logs, checks all original hashes/signatures, archive metadata and sampled hashes, and requires all 27 additions absent. Unknown collisions or changed temporary content block automatic restoration. No persistent traffic setting is written; cessation of frame requests and observed population behavior remain distinct.

This preparation does not silently extend the previous consumed single-launch authorization. A **new explicit approval for this revised 135-second test** is required after publication and CI verification. It is not approval to spawn a motorcycle or conduct the combined milestone's live phases.

## Validation and evidence boundary

- Existing traffic regression: 50 focused assertions plus 13,511 repeated synthetic argument checks; 43 independent JS checks. Historical version-1 corridor behavior remains covered.
- New pool regression: **99 C# assertions**, including per-element selection/order checks, and **34 independent JS checks** for version/domain separation, count accounting, omission, partial coverage, generation identity, bounds, deterministic serialization and full fixed phase/receipt timing. Original synthetic fixtures only.
- Full current offline suite passes: 204 Node tests; 73 observation, 53 acquisition, 164 tile and independent replay checks; 120 Phase 1, 65 telemetry, nine configuration and eight append-sharing checks. The adapter builds against the authentic pinned SDK. This does not test native effects or updated-executable compatibility.
- Protected source/audio **4,857 files and 139 link targets**, plus **1,045 earlier acoustics artifacts**, remain unchanged. Prior sealed candidate files remain intact. No renderer, source audio, live RPM or production telemetry is changed.
- Public deliverables contain original code/tests, this report and scalar preparation evidence. No binaries, raw Steam logs, private paths, geometry, recordings or proprietary metadata are included. No licence is selected. Publication screening, Git integrity, remote readback and exact-head hosted CI are reported with the PR after verification.

**Next single action after preparation:** subject to fresh unchanged preflight and separate approval, conduct this one bounded compatibility/traffic calibration, then independently interpret request receipts, streamed-pool observations and restoration. No city-wide traffic-free or motorcycle-benchmark claim is made in advance.

## Approved live execution: PARTIAL

### Startup and bounded acquisition

I approved the revised one-launch experiment after its local tests, hosted CI and remote readback passed. Fresh read-only preflight matched the sealed 27-file package and separately reviewed Steam-updated installation. It verified signatures, backup, original names, destination absence, archive metadata, sampled hashes, protected research and the unchanged previously approved Story Mode launch option. I deployed only the prepared additions and temporary old-executable filename change.

RPH **1.132.1428.17748** recognized Enhanced **1.0.1158.16** as supported. The official loader and DirectStorageFix initialized, Story Mode loaded and the new observer actually reached READY. No RPH, loader or fix update was needed for these observed operations on executable SHA-256 `B48E80F5FC899EB89E5DCC9F3B68E9551CC8DCFAC78B2A940B207E569E9987EA`. This does not certify every RPH feature or a future executable. No recurrence of the previous sharing violation was observed; preserved logs contain no matching prior sharing-failure entries. No ProcMon session was started.

Story Mode resumed on a safe pavement beside Legion Square with ordinary traffic visible. No movement, teleport or road-box alignment was required. Plugin autoload remained OFF. My tools entered the reviewed LoadPlugin, Prepare and Begin commands, then closed F4. No further game input was sent by the tools during acquisition. The input/observer chronology is retained privately.

| Phase | Samples | Streamed count min–max | Mean streamed count | First → last count | Detailed cohort |
|---|---:|---:|---:|---:|---:|
| Baseline, 0–45 s | 213 | 59–67 | 62.7840 | 60 → 66 | 32 per sample |
| Requests, 45–90 s | 213 | 44–65 | 50.1831 | 65 → 45 | 32 per sample |
| Restoration, 90–123.834 s | 161 | 45–61 | 54.8758 | 45 → 60 | 32 per sample |

These are streamed enumeration counts, including retained stationary vehicles, not newly spawned counts or road occupancy. The detailed cohort omitted 6,557 / 3,873 / 3,683 **reading occurrences** respectively; these are repeated per-sample omissions, not distinct vehicles. All phases retain PARTIAL coverage. Every accepted observation had zero read errors. The 587 samples had a mean interval of **211.271 ms** (approximately **4.73 Hz**, despite the nominal 5 Hz request), maximum **213.014 ms**, and zero gaps exceeding the predefined 400 ms screen.

### Request receipts and remaining traffic

The ledger contains **9,585 successful request returns across 3,195 frames**, exactly three per frame. Every receipt has all three success bits; partial and missed request-frame counters are zero. The first receipt is at **45,001.2475 ms**, the last at **89,987.1891 ms**, and the maximum inter-receipt gap is **15.4161 ms**. The independent validator reports `controlsClean: true` and **zero requests after suppression**. A successful void-call return is not an independent observation of the native's internal effect.

Within the nearest cohort, baseline included 51 distinct identities, including 21 first-observed moving ambient-category identities. Suppression retained 33 identities previously observed during baseline and also recorded nine first-observed identities, four moving ambient-category. Stationary identities and one emergency-category identity were present during suppression. These category/identity getters were exercised, but category accuracy was not independently certified. New cohort membership can reflect selection, streaming or motion rather than creation.

During the partial restoration window, 23 identities were first observed in the detailed cohort, including 21 moving ambient-category identities. Enumerated counts rose from 45 to 60. Counts decreasing during requests and increasing after cessation are consistent with an effect, but this single sequential trial does not establish causation, complete suppression, exact spawn events or normal population behavior everywhere. Existing vehicles were never removed. The route remains uncertified and no Bati was spawned.

### Automatic stop and scientific limitation

At **123,834.0023 ms**, the unchanged camera guard raised `InvalidOperationException: camera changed`. The core evidence records FAILED as the terminal acquisition state; the independent scientific interpretation is **PARTIAL**, with meaningful baseline and clean request receipts but incomplete windows. Approximately **11.166 seconds** of the planned restoration observation were not executed. The guard was not bypassed and no retry, extension, re-Prepare or second launch occurred.

The last accepted observation had zero listener displacement and a maximum component camera deviation of approximately 0.756 degrees from the first recorded camera. A later screen inspection showed a substantially changed view. The rejecting camera vector is not persisted, so its exact angle and initiating cause cannot be recovered from the accepted samples. My tools had sent no game input since closing F4 at the start. An idle/cinematic camera change is a **hypothesis**, not a confirmed cause or evidence that I manually moved the camera.

The pinned [ordinary GTA `INVALIDATE_IDLE_CAM` reference](https://github.com/citizenfx/natives/blob/64c6064c488d6d6cf992840eccce49e447066472/CAM/InvalidateIdleCam.md), hash `0xF4F2C0D4EE209E20`, describes resetting the idle timer. That is a read-only research lead for a later explicitly scoped setup policy, not a FiveM-only setting, root-cause proof or authorization to add another native now. It was **not called or implemented** in this attempt. The existing camera tolerance remains unchanged.

### Normal shutdown and independent restoration: PASS

The observer wrote CLOSED and finalized a **4,993,824-byte** private dataset plus its closed metrics. The request loop detached and HUD disappeared. I then requested unload, closed F4, invoked normal Alt+F4 and accepted the displayed Quit confirmation. Game/launcher processes exited without force termination. Shutdown was observed this time rather than inferred solely from process absence.

At **11:08:02 UTC on 27 October 2026**, independent restoration matched the exact pre-test **Steam-updated** baseline: all **32 root files**, original executable names/hashes/signatures, **179 archive metadata records** and **ten sampled archive hashes**. All **27 temporary paths** were absent. The main executable retained SHA-256 `B48E80F5FC899EB89E5DCC9F3B68E9551CC8DCFAC78B2A940B207E569E9987EA`; the obsolete original retained `FD330FAE0C92A52E0B277FBA8A6856C81BD931FC4FCD1D81FBA02772A2A814CF`. No downgrade or original-content patch occurred. Diagnostics were preserved outside GTA. Protected source/audio files and link targets, prior acoustics artifacts and the historical baseline/package remained unchanged.

### Measured costs and limits

| Instrument | Calls/submissions | Total CPU ms | Mean CPU ms | Maximum CPU ms |
|---|---:|---:|---:|---:|
| Controller tick, all phases | 8,792 | 19.9685 | 0.00227 | 0.7929 |
| Successful guards | 8,792 | 480.9409 | 0.05470 | 0.6301 |
| Vehicle observations | 587 | 345.4151 | 0.58844 | 11.1824 |
| Text HUD | 13,104 | 33.0671 | 0.00252 | 1.0164 |
| World-outline drawing | 0 | 0 | N/A | 0 |

The controller mean includes baseline/restoration no-request ticks; it is not a per-native-call benchmark. The terminating guard's thrown path is not included in successful-guard timings. Managed memory at closure was **13,465,104 bytes**, process-wide CLR usage rather than plugin-isolated allocation or a peak. These measurements do not certify GPU/FPS costs, real-time suitability or long-run stability.

### Outcome, progress and next action

**PARTIAL:** startup on the updated executable and the bounded three-request lifecycle were exercised successfully. Genuine observations and receipt accounting passed independent interpretation. The restoration observation was shortened by a camera safety stop, population restoration remains observationally unverified, and complete traffic isolation was not established. No combined motorcycle/walking live-stage credit is awarded: progress remains **60%**.

I've selected a quiet airport section as the proposed next controlled setting: "I'm going to use a part of the airport" with very little driving traffic. That is a site preference, not a clearance measurement. Legion Square remains the later urban reference. **My single next action is an offline airport-calibration readiness plan**, including an explicit review of idle-camera handling without weakening the guard. It should keep local interference checks simple and distinguish site choice from proven emptiness. No airport travel, new deployment, extra native, Bati spawn or additional test is authorized or performed here.

The applicable offline regressions, publication audit, Git integrity, exact-head hosted CI and remote readback are reported with the updated PR. Preparation CI alone is not used as verification of the final execution report. Raw vehicle identities/positions, session IDs and logs remain private; only sanitized scalar findings are published.
