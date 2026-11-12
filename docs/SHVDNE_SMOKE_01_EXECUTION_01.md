# SHVDNE-SMOKE-01 execution-01 — RPH-free basic runtime observed

**My authorized Stage 1 attempt demonstrated that RichAudio loads, initializes, receives callbacks and observes Enhanced 1.0.1158.16 through SHVDNE without RPH. The result is PASS for the observed basic-runtime scope.** Codex also observed one normal script reload and normal game exit, then verified restoration of all 24 protected originals. Performance, controlled camera-cut generation and the later integration/audio/native-ownership stages are not qualified by this pass.

I explicitly authorized execution-manifest SHA-256 `198bca6890eb588aec06c0433f5f664c5158d3117937998e1747026cb8cd0124`, adapter SHA-256 `226a1ca8695acd9a31485791faed0e421e569a793f214c984c75d11e25ae2acc` and the bound [Stage 1 procedure](SHVDNE_SMOKE_01_PROCEDURE.md). Codex consumed that authorization for one game-process lifetime and one normal Insert reload. No Stage 2–5 work or second launch was performed.

All evidence and backups are retained under:

```text
C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\migration-shvdne-01\smoke-01-preparation\execution-01
```

The frozen preparation report, procedure, manifest, deployment bytes, original migration artifacts and earlier Gate A conclusions remain unchanged. This successor records the live result rather than rewriting their prepared/unverified historical state.

| Event | Observed London/UTC time, 11 November 2026 |
| --- | --- |
| Authorized installation complete | 23:27:46.711707 |
| Game process start | 23:28:59.5437308, PID **24780** |
| SHVDNE initialization begins | 23:29:42 |
| First RichAudio script starts | 23:29:48 |
| First journal file created | 23:29:49.0811124 |
| Conservative observation cutoff | **23:34:48**; normal reload did not reset it |
| One actual normal reload | 23:33:58; new script started at 23:34:04 |
| Normal quit requested | 23:34:24.8450469 |
| First process-absence observation | Approximately **23:34:33.207**, before cutoff |
| Restoration verified | 23:37:09.241433 |

The first process check after the normal quit dialog returned no game process at about 23:34:33. This is an upper-bound observation, not an exact kernel exit timestamp. A later recheck receipt was written at 23:34:51 and its `withinObservationCutoff` Boolean compares that later check time; it is false for that reason. Codex preserved it and added `exit-timing.json` to distinguish the earlier process-exit upper bound from the later verification time. The game did not remain in use until the later check. No force termination was issued.

The installed stack matched the approved manifest: game SHA-256 `b48e80f5fc899eb89e5dcc9f3b68e9551cc8dcfac78b2a940b207e569e9987ea`, retained SHVDNE v1.1.0.6 / runtime file version 3.9.0.6, API3 3.9.0.0 and existing SHV file version 3889.0.1158.13. Codex used the existing normal Steam app entry and unchanged `-nobattleye` option. The launch helper reported that no targetable window was exposed during the handoff, but the one request started the game successfully; Codex verified the process and continued without retrying the launch.

Fresh `asiloader.log` shows exactly **DirectStorageFix.asi**, **ScriptHookVDotNet.asi** and **StraightToStoryMode.asi**. TrainerV and OpenRPF were parked with verified backups. SHVDNE loaded API2/API3 and found exactly **one** script in `RichAudio.Shvdne.dll`, `RichAudio.Integration.Shvdne.RichAudioScript`. There was no RPH launch/process in the observed checks, the RPH log stayed byte-identical before restoration, and managed-load evidence contains no RPH assembly. The compiled adapter's RPH-free dependency check remains bound by the preparation. This is a result for that recorded stack, not for every ASI combination.

The SHVDNE log records its ordinary framework NativeMemory initialization and built-in hook setup, taking **6,398 ms** initially and **6,312 ms** during normal reload. These are the pinned framework's own initialization operations. Codex added no compatibility hook, memory patch or version-check bypass, performed no external process-memory inspection, and changed no native resource.

| Stage 1 item | Classification and evidence |
| --- | --- |
| SHVDNE initializes on the target executable | **PASS, observed scope.** Native/runtime logs identify the matching distribution, load the APIs and start the script on the pinned `.16` executable. |
| RichAudio loads without RPH | **PASS.** Exactly one production entry, expected ASI set, no RPH participation evidence and unchanged RPH log. |
| Tick callbacks execute | **PASS.** Strictly increasing tick counters and nondecreasing capture counters within both independent sessions. |
| Active Story session identified | **PASS in observed Story/exit contexts.** `storyReady:true` with validated player observations; final unsafe/exit context clears the player handle and listener. Online/loading transition coverage is not claimed. |
| Player/vehicle identity and basic observations | **PASS in the observed sequence.** Ready player handle **2**, raw player Bati model **F9300CC5**, driver/on-foot transitions and finite/coherent vehicle observations. Full integer handles remain transient identities with the previously documented reuse limits. |
| Camera position/orientation available | **PASS.** 267 valid logged listener snapshots, finite vectors and normalized/orthogonal bases with monotonic source chronology. Controlled camera-cut generation and an initial unavailable-velocity row are not demonstrated. |
| No unexpected script/getter exceptions | **PASS for retained evidence.** Getter-failure counters remain zero, diagnostic states do not show callback failure and the retained loader/core logs contain no exception/error/failure entries. This is bounded observation, not a guarantee of every unlogged path. |
| Passive scope maintained | **PASS.** Every diagnostic has `hostState:"disabled"`, `hostPid:0`, `nativeAudioOwnership:false`. All optional mechanical fields remain null. No host, probe, retained audio assets or Node executable was installed. |
| Normal reload, exit and cleanup | **PASS for observed lifecycle.** Old session explicitly records `stopped / script-aborted`, the new session has fresh counters/chronology, old output ceases, normal quit is observed and no target process remains. Final game-exit journal drain remains best-effort. |
| Exact checked installation restoration | **PASS.** All eight installed files, new runtime log and scripts tree are absent; both parked ASIs and all 24 protected originals match their backup hashes. |

The initial session is `d58d7eb9984942b39f2e7593dc95676e`. It contains **248 diagnostic rows** followed by the explicit normal-abort stop row. Its final counters are **28,425 ticks / 4,604 capture attempts**. There are **247 valid listener snapshots**, ready-player observations, 101 distinct raw vehicle-handle values and both player-driver/on-foot states. Those handle values are not a proof of 101 unique physical vehicle lifetimes. Raw engine operating points are unavailable throughout, and dependent vehicle wire publication is not qualified.

The post-reload session is `365470509add477cbeab72f948a8a63e`. It contains **24 diagnostic rows**, final counters **2,792 ticks / 381 capture attempts** and **20 valid listener snapshots**. It remains on foot. Its final row correctly has Story readiness false, player handle zero, listener null and no raw vehicle observations during exit. It does not contain a final `stopped` row; the approved procedure already distinguished best-effort final journal drain from guaranteed cleanup. The prior normal reload supplies the explicit callback/stop observation, while normal game exit and process absence establish the final process cleanup.

Codex checked all archived JSONL syntax, scope flags, finite vectors, camera basis normalization/orthogonality, source clock order, player readiness and optional telemetry absence. The old session's camera position spans approximately **46.476 × 24.021 × 1.805 native units**, with a maximum forward-vector separation of **171.787 degrees**, consistent with my movement/panning sequence. These are unscaled GTA coordinates, not a physical distance or microphone calibration.

The logged camera generation is **2 throughout each session**. Codex's earlier progress wording about “view-generation changes” was too strong. Camera movement and rotation are established; a controlled spatial-cut generation transition is not. The one-second journal also did not retain an initial `VelocityKind:"unavailable"` snapshot. A view change and normal pause/resume were reported/performed, but the camera-cut, initial-velocity and numerical pause-transition subcases remain unqualified. The full analysis and exact coverage flags are in `journal-analysis.json` and `final-review.json`.

**Performance remains an observed concern.** Maximum complete observation-batch costs were **16.2611 ms** and **17.7357 ms**, exceeding the sampler's existing **10 ms** vehicle-publication budget in both sessions. The source withholds vehicle publication after an over-budget batch, and the host was disabled. The journal does not expose over-budget event frequency, so Codex cannot derive a deadline success rate from the cumulative maxima. Tick counts are not FPS measurements. This smoke does not qualify frame time, fleet cost, endpoint latency or audio deadlines; that concern must be addressed in later preparation before claiming performance admission.

I reported: **“Stable; pause/resume and controls normal.”** During the first handoff there was an input/focus mismatch: an automated Escape action did not establish the expected pause view, and the console was visible. Codex handed the remainder to me. My initial selected response included an Insert press, but I then clarified that my keyboard has no Insert key. The core log showed no reload at that point. Codex sent **one** standard Insert key after a fresh view and verified the actual normal reload from the new core initialization and session. No second reload was attempted. Responses are retained as received; the correction is explicit rather than rewriting the earlier receipt.

Codex archived both journals, the first and post-reload SHVDNE logs, SHV/ASI-loader/DirectStorage/RPH logs, generated settings/state, installed-file bytes, action journal and every backup. The restore operation first checked ownership/hashes, then removed only enumerated or recognized archived generated files and restored originals. Created directories were removed individually when empty; the shared scripts directory was not recursively deleted. Selected Steam launch options are unchanged, and no unrelated save or launcher metadata was restored over later activity.

The authorization is consumed. Codex made no production audio/ownership change, activated no output host or optional mechanical provider, reassigned no profile and entered no later qualification stage. The original RPH worktree, private candidate, previous Gate A evidence and protected `Build-Menu02.ps1` remain preserved. Final integrity results are in `verification-final.json`; nothing was committed, pushed, merged, published or released.

This is the first observed basic SHVDNE-only runtime result for RichAudio on the exact `.16` executable. Stage 2 host/IPC integration still needs a new prepared package and fresh approval. Mechanical validity, audio/acoustic integration, private registration, selective suppression, custom-mod preservation, complete native replacement and independent failure recovery remain separate unqualified requirements. The PROFILE-02 evidence-method rejection is unchanged by this successful basic runtime smoke.
