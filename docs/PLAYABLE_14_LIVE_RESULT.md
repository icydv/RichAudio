# PLAYABLE-14: binding succeeded; full passive qualification remains BLOCKED

**Overall decision: BLOCKED. Initial fresh-context binding: PASS in-game. Restoration: PASS.** The first authorised passive session produced 54 genuine idle gameplay frames before a terminal listener-continuity rejection. The owner then explicitly requested one fresh manual attempt; that attempt was cancelled at Steam confirmation after an observer attributed the first session's retained log to the new launch. No third attempt, audible playback, endpoint access or recording occurred.

The approved [proposal](PLAYABLE_14_LIVE_PROPOSAL.md) at `bf59244e482897ee744c6a64b70243f20743d755`, binaries and manifests are unchanged. The two deployments used only:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Passive managed plugin | 361,472 | `ba19342ce5ceac63d179943e22d324819a42a8c8294d7f15e436f3833e01be0f` |
| Unchanged native producer | 129,024 | `05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40` |

## First authorised session

One deployment and one existing-route invocation followed the explicit exact-artifact approval. Steam Action 12 recorded argument-confirmation continuation at 18:51:26 UTC and interstitial continuation at 18:51:28, followed by CreatingProcess/Completed. One Continue click was dispatched; the second interstitial was not separately seen, so its UI continuation mechanism remains unclaimed. The exact Enhanced process began at 18:51:43.5830544 UTC, 32.895 seconds after the launch marker, and matched the fresh 21-field process lease. The plugin reached READY at 18:52:32.459.

The owner mounted the engine-running Bati and confirmed readiness. The coordinator entered `RichAudioHandoffStart` once and dispatched console closure. The actual readiness journal retains 125 console-open waits and four source/bracket diagnostics. This evidence measures the real delay; the input dispatch alone does not prove immediate console closure.

The correction worked in the actual game. Source sequence 3087 remained frozen while measured maps were current. Its source-domain age at Peek reached **17,512.6342 ms** and it was safely classified `source-context-outside-map-window`, without terminal binding. A later source sequence advanced to 3088; sequence **3089** was then admitted within fresh independent RPH pre/post brackets on readiness attempt **127**, **7,133.8351 ms** after arming. The retained pre-binding record reports source age at Peek **5.0654 ms**, mapped age **8.2489 ms**, peer skew **5.1769 ms** and a current measured map. Original timestamps, ownership and correspondence checks were preserved. There was one recorded binding and BEGIN.

ACTIVE was logged at 18:55:47.768. At 18:55:51.109 the plugin stopped with **`listener-discontinuous`**; the final caller line recorded permanent retirement at 18:55:51.128. No second Start was issued in that process.

Independent byte/frame analysis found:

- **55 genuine native target returns, 55 final observations and one terminal row:** 111 exact 256-byte rows, 28,416 bytes. Sample 55 remains native evidence without a published gameplay frame. The first target start to last target end spans 3,301.5544 ms; the minimum next-target-start minus previous-target-end gap is 54.9336 ms, within the 20 Hz/2,400-attempt/120-second limits.
- **54 gameplay frames** with exact source-sequence, raw float32, scalar, measured-clock, independent vehicle/pose and listener lineage. No recorded frame failed the review. Maximum endpoint skew was 29.0106 ms; maximum mapped interval width was 0.574 ms.
- Every native and gameplay operating value was **0.20000000298023224**, float32 bits `3e4ccccd`. Recorded source speed was zero, with one vehicle position and one listener position. These are genuine idle observations; they do not demonstrate rev/drive response or camera-motion acceptance.
- The source-cleared control event followed the last frame and exposed no current vehicle. It is not a newly sampled empty gameplay frame. Deliberate dismount retirement was not completed in this capture.
- Producer callback completion, FIFO drain with zero remaining queued records, 111 admitted/written source rows, 3,707 written events, zero dropped rows, zero pending return and zero pending consumed-audit rows were observed. The separate caller log confirms writer completion within its bound and no live writer worker; the summary alone does not establish that join.

`listener-discontinuous` identifies the existing branch that rejects an estimated camera velocity above 100 native-unverified units/s. The rejected camera position/time operands were not retained. The owner reported accidentally tabbing out after this failure; that is relevant operator context, **not proof of its cause**. Later visible driving cannot be counted as captured engine-state variation after permanent retirement.

Normal exit-key input did not close this game instance. The owner then reported normal GTA exit, and process absence was verified before ownership/hash/length rollback. No forced termination or hot unload occurred. The coordinator did not observe the final quit dialog or a numeric game exit code. Independent restoration verified all 11 protected files, four settings, saved stock fallback/F10, both false production flags, all 27 absent owned paths and the exact owned game/launcher/observer lifetimes ended.

## Separately requested manual attempt

After the terminal result, the owner explicitly said `try it again i accidentally tabbed out`, then confirmed `GTA closed — continue restoration and the fresh passive attempt`. This was recorded as authorisation for **one fresh manual attempt with the same exact artifacts and limits**. The first attempt was fully restored before the second preflight/deployment. This was not an automatic retry or reuse of a retired provider.

The second existing-route invocation began at **19:01:53.5060563 UTC**. Its observer incorrectly admitted the first session's retained same-profile ACTIVE/RETIRED log text at launch +**0.1841328 s**, even though the new game PID was zero, session was null and no new Enhanced process had been observed. It therefore emitted a false current-terminal/active state. This is an observer attribution defect, not a new in-game `listener-discontinuous` result.

The coordinator held Steam Action 13 at its actual custom-arguments confirmation, dispatched **zero Continue clicks** and cancelled it. The bounded launch coordinator ended at 19:03:53.6200879 with `Exact new game process not observed; no lease or retry.` The remaining owned RPH launcher was closed through its normal **Cancel game launch and exit** control. No new Enhanced process, lease, source Open, native BEGIN or operator Start was observed. Missing native capture is **not a measured zero target-attempt counter**.

The agent's copied supervisor and root review missed the same-profile stale-log case. All faulty scripts, observer states, stop request and launch traces remain retained. The observer's false fields are not used as current gameplay evidence. Ownership-verified rollback and final verification passed again; all protected files/settings and process/path absence are independently reviewed.

## Evidence and next step

The observer attribution defect is corrected offline in [the pure scope selector](../tools/Select-CurrentHandoffLog.ps1). Log state now requires the actual current process path/PID/kernel-backed creation time, matching fresh session and installed lease bytes/hash, an immutable prelaunch byte/hash baseline, and a dated entry at or after exact process creation. Unchanged/appended old bytes, stale rotated content, ambiguous entries and invalid/missing scope cannot become current ACTIVE/terminal evidence. The original monotonic 120/300/120-second anchors survive log rotation and repeated text.

[Focused scope fixtures](../tools/Test-HandoffLogScope.ps1) passed **12 cases/36 assertions**, including the actual retained log that caused attempt 02's false attribution, process/session/lease mismatches, append/truncate/rotation, pre-creation entries, incomplete lines and unchanged deadlines. They run without querying or launching the game, native producer, UI or endpoint. Reproduction is `pwsh -NoProfile -File tools/Test-HandoffLogScope.ps1`; the actual-log case requires the retained private attempt-02 inputs.

A new private coordinator copy in `.local/playable-14/scoped-03/` wires the selector to actual process/installed-lease observations and gates private source/summary reads on validated scope. Startup admission uses direct process observation, rather than trusting a receipt's shape alone. Its source and pinned files were independently reviewed and parsed; **no mode was executed**. The original faulty scripts and rejected intermediate preparation are retained. [Supervision evidence](../evidence/playable-14-supervision.json) binds the tests, reviews and prepared-only receipt. [The further passive proposal](PLAYABLE_14_RETEST_PROPOSAL.md) is ready but not authorised. No game binary, renderer or audio asset was rebuilt for this observer fix.

[First-session evidence](../evidence/playable-14-live-01.json), [manual-attempt evidence](../evidence/playable-14-live-02.json) and [restoration evidence](../evidence/playable-14-live-rollback.json) bind the retained private reviews and capture hashes. Actual private addresses, runtime paths, source recordings and raw journal contents are not published.

The initial clock/context defect is now demonstrably overcome in GTA. The remaining passive qualification requires changing engine-state values, controlled camera/vehicle movement and deliberate dismount retirement without a terminal continuity fault. Corrected supervision is prepared and reviewed offline; its execution remains unverified. Any further deployment/launch needs fresh explicit approval; no third attempt is authorised by the two consumed approvals.

The prepared PLAYABLE-13 audible DLL, host, genuine engine/exhaust assets, renderer, RA07/PCM transport, gains and optional synchronised recorder/analyser remain unchanged. Full passive acceptance has not occurred, so the conditional audible-candidate preparation and separate live-audio approval request have not been advanced. The minimal managed admission carry-forward remains the only planned audible-wrapper change; unrelated audio infrastructure needs no rebuild. No subjective listening or new recording analysis is claimed.
