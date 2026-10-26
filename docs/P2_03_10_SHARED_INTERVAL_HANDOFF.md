# P2-03.10: shared-interval context ownership and read eligibility

26 October 2026. **NEGATIVE for the single `shared-interval-v1` contract.** My read-accurate audit stops at **output frame 0**, before any ownership transfer or accepted source event. The nominal active interval is eligible, but a neighbouring interval supplying the existing sampler's interpolation loads exceeds the candidate's per-provider 2% state limit. The original 11.143875-second handoff is **NOT REACHED**, not resolved or declared impossible in general.

This milestone is diagnostic-only. I generated no stock-source or transition audio, built no transition renderer, changed no control trajectory, exempted no dependency and tried no replacement policy. The result does not invalidate my earlier listening verdicts, demonstrate missing source recordings or establish an audible defect. It identifies a limit of applying interval eligibility separately to every sampler provider.

## Repository and original failure reproduction

Fetched canonical main at `e5fbd8f3502d3e28169a224caa07471e090e368f`. PR #23 remained open/unmerged at `e116160f6433c2e9c9d1f4bd571205d43ca81362`; this branch starts there. No earlier PR is merged, rebased or rewritten. The unsanitised archival checkout is untouched.

I reran the unchanged [P2-03.9 audit](P2_03_9_EXHAUST_STATE_TRANSITION.md) into a new private directory before testing the new contract. It again returns Gate One PARTIAL at **frame 534906 / 11.143875 s**, with next event end **536924**. The event's state range **23.721482011715–23.784352956375** fits neither context 78–80 (**23.726532745098–24.057296938775**) nor 79–81 (**23.389881764706–23.777448010204**) for the whole event. Intervals 79 and 80 are shared, and interval 80 remains individually eligible. This historical rejection is unchanged.

Analytical source/context coverage still spans **21–27**, with the previous 2% tolerance, 0.95–1.05 rates, inward floating-point protections and source margins. All 32 original context candidates still pass the preliminary boundary/nonsilence screen; maximum mismatch remains **0.065124024** below **0.25**. Those preliminary checks did not establish read-level eligibility for every interpolation provider.

Source: existing privately decoded Bati-traced player `exhaust_decel`, SHA-256 `574DBB61C486F18848839300C9D72219957258CEEA6B1F93710EB72EF6270F2F`. Source manifest, metadata and the three accepted state-21/state-27 preview hashes match their previous records.

## One opt-in ownership contract

I saved the contract privately before running it. The historical whole-context policy remains available **unchanged**. The new research-only module/tool is explicit opt-in and changes no renderer defaults or production API.

**Context ownership** identifies the group from which future events are selected. **Active source identity** is the original interval supplying the current event. The **reader** holds its anchored source cursor, fractional position, read rate, event start/end and cumulative fractional clock. An ownership update may change only the owner identifier; it is not another source event.

Successful legacy event-boundary decisions are retained. If the old whole-context requirement cannot cover an event, keep the outgoing-context event intact and consider only the next context on the existing path. Select the **first integer output frame** within the same event where the active interval is shared and the requested state lies in the two contexts' instantaneous conservative overlap. There is no timing search by later success, alternative context/path, new event boundary, phase adjustment or smoothing. Such a transfer would affect future context-local choices; it is not a claim that all future sample sequences are automatically identical. Every future read would be checked before acceptance.

At a legal transfer, source fingerprint, interval identity, exact cursor and fractional cursor, actual read rate, output frame, event extent and both cumulative clock values must remain `Object.is` identical. Synthetic tests independently reject changes to any of those fields. At an existing completed event boundary, the legacy stored source endpoint is preserved without an additional sample; a clipped terminal event retains its partial cursor instead. No full real-source trajectory or transfer was reached here.

## Read inventory and the explicit interpretation tested

The dependency inventory follows the actual existing sampler: at source position p it loads **24 PCM values**, indices **floor(p)−11 through floor(p)+12**. The inventory includes the target operation on every frame and the existing previous-rate 96-frame continuation calculations at local wraps. Zero kernel coefficients, presentation fades and values later discarded by a direct-wrap research output do not erase performed loads. No new operation, interpolation kernel or source recording is introduced.

For this one candidate, **each original interval providing any load must itself pass the unchanged interval-state and rounded-period rules over its actual use range**. This per-provider application is an explicit conservative contract interpretation; earlier held experiments did not claim that proof. It is not established as Rockstar's native interpolation semantics or a physical rule for individual filter taps. The numerical limits are unchanged; their application to indirect dependencies is the hypothesis tested.

Per-event validation retains nominal interval eligibility over the entire event. Per-provider use spans are derived from exact floor-based tap predicates using bounded binary searches, not a sparse sample grid. The requested control is monotone within each original trajectory segment, so split-segment extrema analytically bound all frames of each use span. Both possible rounded-period rate cases, actual read rate and original source margins remain mandatory. Every tap must remain inside the validated original source; the modulo sampler cannot silently wrap around the file to hide an out-of-bounds read. Unmapped source context is rejected. The earliest failed frame and real sampler-load order determine the first blocker.

The control is imported unchanged from P2-03.9: state 21 at 0–1 s, smooth rise at 1–7 s, state 27 at 7–8 s, smooth fall at 8–14 s, state 21 at 14–15 s, using the original cubic easing. The target remains **720,000 frames at 48 kHz**. Marker states are not physical RPM, load or throttle.

## First actual-read blocker

The first proposed event uses original interval **93**, source range **[151154,153403)**, length **2249**. Its rounded output extent is **[0,2286)**, actual read rate **2249/2286 = 0.9838145231846019**, cumulative clock **0 → 2285.714285714286**. Its nominal state error at state 21 is **1.637735714%**, within the 2% limit.

However, the first sampler call at source cursor **151154**, fraction **0**, loads **[151143,151166]** inclusive. Indices before 151154 belong to interval **92**, which is outside the nominal endpoint context but was already part of the historical interpolation footprint.

| Required dependency | Actual use in proposed event | State error at 21 | Result |
|---|---|---:|---|
| Interval 92, source [148928,151154) | Output frames **[0,12)** | **2.517982857%** | Reject under per-provider contract |
| Nominal interval 93 | [0,2286) | 1.637735714% | Eligible |
| Interval 94, future filter support | [2274,2286) | 0.811038571% | Eligible |

Interval 92's marker state is **21.5287764**. Its valid requested-state band starts at **21.106643529412**, above the held request 21. Both rounded-period rates (**0.974179431 / 0.973753281**) and the actual operation rate satisfy their bounds; the failure is specifically state tolerance. The minimum observed state headroom is **−0.005179828571**, an excess of about **0.518 percentage points** over the 2% limit.

The first invalid load is **tap 0**, source index **151143**, at **frame/time 0**. It is safely inside the 374,180-frame source file; this is not a global source-bound violation. An independent legacy eligibility call includes interval 93 and excludes 92 at state 21. An independent probe through the unchanged sampler, using **wholly original impulse data**, gives that first tap a nonzero coefficient **−0.00015235103862449166**. No Rockstar PCM is used in that probe. Provider 92 persists through frame 11 and disappears at frame 12; it cannot be dismissed merely as the initial zero-fade presentation sample. All performed calculations count under the preregistered contract.

The real-source contract stops here. I did not move the source start, truncate the kernel, waive neighbour eligibility, change the hold or rerun another policy. Compact input-state and dependency diagnostics are private. There is no before/after ownership-transfer witness for GTA material because no transfer was attempted.

## Critical handoff and whole-trajectory verdicts

**Required outcome B applies to the trajectory audit:** an actual required sampler dependency fails the chosen read-validity contract before ownership transfer. The specific 78–80 → 79–81 handoff at 11.143875 s is **NOT REACHED / NOT TESTED under the new contract**. The old proof that nominal interval 80 is individually eligible remains valid; it is insufficient to certify every indirect read there. I have not locally bypassed the first failure to test that later event.

| Whole-trajectory field | Verified result |
|---|---|
| Requested length | 720,000 frames / 15 s |
| Committed eligible prefix | **0 frames** |
| Accepted events | **0** |
| First proposed, rejected event | 2,286 frames |
| Ownership transfers / active-preserving transfers | **0 / 0** |
| Intra-event transfers / accepted local wraps | **0 / 0** |
| Committed source intervals | 0; one nominal interval proposed |
| Providers inventoried in first operation | 3: indices 92, 93, 94 |
| Earliest failure / stop | frame 0 / 0 s |
| Observed actual read rate | 0.983814523, first proposed operation only |
| Complete timed plan | **Not established** |
| Audio generated / rendered frames | **None / 0** |

Analytical coverage remains established. Metadata-only identity/cursor/rate/clock preservation is **offline-tested on original synthetic fixtures**. A valid real-source ownership handoff and complete timed plan remain unproved. PCM rendering, waveform continuity, perceptual naturalness and real-time suitability are **NOT TESTED** and do not follow from those synthetic identity tests.

## Implementation, tests and measured cost

Added `tools/audio/shared-interval-handoff.mjs`, `tools/Inspect-SharedIntervalHandoff.mjs` and `tests/Test-SharedIntervalHandoff.mjs`. The new tool requires the reproduced historical rejection and matching source/manifest/metadata identities, writes only one private JSON report and has no encoder or playback API. The planner requires explicit `shared-interval-v1` opt-in. The old feasibility file, responsive/held renderers and production telemetry/RPM code are unchanged.

**21 new original synthetic tests** cover eligible shared intervals versus ineligible whole banks, rejection of an interpolation neighbour, exhaustive tap-provider range checking for a synthetic event, exact identity/fraction/rate/clock preservation, intra-event and logical-boundary transfers, clipped terminal cursor behaviour, missing shared identity/proof, ineligible active data, indirect future/continuation providers, source/modulo/rate/state failures, source/continuation provenance, cursor/frame/clock/nonfinite tampering, deterministic first-legal timing, skipped/duplicated frame rejection, explicit opt-in, historical-policy/control immutability, deterministic diagnostics/fingerprint binding and private output isolation. They do not claim a successful GTA-source transfer or a complete real-source trajectory.

The initial **20 new / 37 combined tests** passed; final provenance guards bring the totals to **21 new / 38 combined** with the prior 17 feasibility tests. The final full offline runner passed **21 shared-interval, 17 previous feasibility, 19 second-state, 10 outer-wrap, 10 internal-join, 14 model-analysis, 10 recurrence, 18 responsive, 12 cycle, 8 deceleration, 19 stock-audio, 8 extraction/publication guards, 15 ownership, 65 core assertions, 35 drivetrain, 17 parser, 3 diagnostic-analysis, 132 Phase 1, 9 configuration and 8 append expectations**. The separate documentation check also passed 132. Hosted CI is reported separately. No test uses Rockstar recordings in public CI. New ownership-test PCM is original and generated in memory; existing regression tests may write wholly original synthetic fixture WAVs into ignored test directories. Those are not stock-source or transition previews. The actual diagnostic output directory contains JSON only.

Measured source/baseline preparation: **36.1164 ms**. New planning/dependency analysis until first failure: **0.6588 ms**. It performs **4 eligibility evaluations**, **1 read-range check**, **0 ownership-candidate checks**; three providers are inventoried. Recorded RSS is **56,827,904 bytes**, not peak or isolated allocation. Process CPU counters read **0 ms user / 0 ms system** over this sub-millisecond section, below useful counter resolution rather than zero CPU cost. Measurements are from the single real-source attempt; final identity/finite-state guards are checked on original synthetic fixtures, with no real-source policy retry. No complete-trajectory, rendering or audio-thread performance is established.

## Integrity, publication and next decision

The previous **3,009-file / 63-link** receipt and three accepted preview hashes matched. A fresh preflight protects **3,544 existing private files / 83 link targets**, including all prior audio, metadata, receipts and P2-03.9 diagnostics. Post-regression checks match every protected file and link without following fixture links. The original failure reproduction and new negative report use fresh ignored directories; historical outputs are not overwritten. GTA/RPH and relevant file tools remain closed. There is no game write, archive access, extraction, new dependency, native hook, real-time integration or Phase 3 work.

The public [scalar evidence](../evidence/publication/shared-interval-handoff.json) contains fingerprints, contract/coverage summaries, the original and earliest new failure, small dependency descriptors and measured counters. No stock PCM, raw metadata blob, full event trace, private path, proprietary binary or new licence is published. Publication screening and Git integrity remain separate from contract acceptance; previously reviewed service-committer identity flags must remain explicit exceptions.

Final pre-commit screening covers **eight explicitly allowlisted files**, with **zero index findings**, **one valid JSON document** and **24 valid local documentation links**. Whole-history screening retains only the same **four independently reviewed GitHub service-committer flags**, with no new finding. Git integrity passes with harmless unreachable development objects. Post-test preservation checks again match all 3,544 files, 83 link targets and three historical previews. These checks supplement manual origin/rights review and are not proof of an unrestricted redistribution licence.

**Exactly one next proposed action:** a separately authorised **diagnostic audit of interpolation-support eligibility semantics**. Establish whether the interval-state/period contract applies independently to neighbouring FIR support, or how a bounded support dependency can be justified as part of an eligible scheduled interval while retaining every original numeric limit and source bound. No exemption should be introduced merely to obtain a passing result. This interpretation must be evidenced before another ownership attempt. I have not implemented that alternative, retried the trajectory or generated audio.

```powershell
node tools/Inspect-ExhaustTransition.mjs .local/audio-reconstruction/decoded-final/source-manifest.json .local/audio-reconstruction/wrap-ablation-final .local/audio-reconstruction/second-state-wrap-final .local/audio-reconstruction/NEW-baseline
node tools/Inspect-SharedIntervalHandoff.mjs .local/audio-reconstruction/decoded-final/source-manifest.json .local/audio-reconstruction/NEW-baseline/feasibility.json .local/audio-reconstruction/NEW-shared-handoff
node --test tests/Test-SharedIntervalHandoff.mjs
```

The first command deliberately returns a nonzero baseline gate result; inspect that report rather than treating it as a reason to retry or change policy. Both commands write JSON only and require existing validated private material. The second likewise reports the negative contract result without producing audio.

## Progress accounting

Actual checkpoints communicated: **0 → 10 → 30 → 50 → 70 → 85%**. Weights are baseline 10%, contract analysis 20%, read-only implementation 20%, trajectory/invariant evaluation 20%, tests/preservation 15%, documentation/audit/PR/readback 15%. Evaluation stopped at the first genuine failure as required; the 70% checkpoint did **not** claim a completed 15-second plan. The remaining publication stage completes this diagnostic milestone only after GitHub readback. A negative investigation may finish at 100%; no audio-transition, listening or engine-completion credit follows.
