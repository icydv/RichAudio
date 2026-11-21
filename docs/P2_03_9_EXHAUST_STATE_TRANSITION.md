# P2-03.9: continuous exhaust-state transition feasibility

Subsequent diagnostic: [P2-03.10](P2_03_10_SHARED_INTERVAL_HANDOFF.md) reproduces this rejection unchanged, then finds an earlier interpolation-provider eligibility failure under its explicitly stricter read-granularity interpretation. No source gap or audible failure is inferred, and this historical policy remains untouched. The later ownership operation is not certified by that result.

26 October 2026. **Gate One: PARTIAL. Milestone outcome: INCONCLUSIVE, stopped before renderer implementation or audio generation.** I established continuous source eligibility from marker-state 21 to 27, but my one candidate event-boundary context policy did not complete the fixed trajectory. I have no new transition audio or listening verdict. This is not evidence that the original recording lacks all intermediate states, nor a finding that every possible transition method fails.

The authorised hard stop was respected. I did not try another path, trajectory, endpoint, timing, handoff policy or smoothing method. There is no transition synthesiser, A/B recording, native mutation or Phase 3 work. All event counts below describe a **read-only candidate plan**, never rendered sound.

## Baseline and scope

Fetched main at `e5fbd8f3502d3e28169a224caa07471e090e368f`. PR #22 remained open and unmerged at `f40986f5787a50c9d989fadbf83eeea01be72905`; this branch starts there and preserves the stacked ancestry. Earlier PRs are not merged/rebased and the unsanitised archival checkout is untouched.

Existing private Bati-traced player `exhaust_decel` source SHA-256: `574DBB61C486F18848839300C9D72219957258CEEA6B1F93710EB72EF6270F2F`. The source/manifest/metadata and three historical preview fingerprints were verified before analysis. Lower endpoint remains state **21**, intervals **93–97**; upper endpoint remains state **27**, intervals **66–69**. See the preserved [state-21 result](P2_03_7_OUTER_WRAP_ABLATION.md) and [second-state result](P2_03_8_SECOND_STATE_VALIDATION.md). Marker coordinates are not physical RPM, throttle, load or vehicle speed.

The successful state-21 B still hashes to `3BD4C814A3EB88B5B6D6616581B9220623BA3B49515F85D7F9BBCDC3B99CC81F`; state-27 A/B still hash to `90440947872CC5EE180E755A48A1D43A74CD7C70497405CEB7D8E85A99607546` / `944D59F31B453CE82C464968649ECAD2C303BAA04BC519D762047FB1195E4911`.

## Complete continuous coverage, rather than integer checks

Retained constraints: source states **14–28**, **2%** requested-state tolerance, read rates **0.95–1.05**, 48 kHz mono source, the existing 24-tap sampler and source margins of **16 frames before / 96 × 1.05 + 16 after** each interval. Three-interval interior contexts retain the prior research minimum; original five/four-interval endpoint contexts are preserved. Contexts are not claimed to be Rockstar loop groups.

For interval length L and adjacent-mean marker value s, state compatibility gives the entire band **s/1.02 ≤ v ≤ s/0.98**. Set `Nmin = ceil(L/1.05)` and `Nmax = floor(L/0.95)`, retaining the stricter historical floating/integer-ratio bounds. Both possible rounded event lengths are legal exactly when **48000/Nmax ≤ v ≤ 48000/Nmin**: `floor(48000/v) >= Nmin` and `ceil(48000/v) <= Nmax`. Intersect these bands, source margins and the requested domain [21,27]. This is an analytical interval calculation, not a dense sampling claim.

A conservative **64 × machine epsilon × scale** allowance rounds each intrinsic band inward before domain clipping. Positive bounded operands and a few arithmetic operations give a much smaller accumulated rounding budget; the allowance never widens state/rate tolerance or fills a gap. The largest applied state-coordinate allowance is **3.976e−13**. Residual gaps would be rejected. Synthetic tests independently check resulting endpoints against the historical executable eligibility inequalities, including both floor/ceil event lengths.

**154** original marker intervals were examined. **32**, indices **66–97**, intersect the requested domain. Both the union of individual eligibility bands and the union of consecutive three-interval context bands cover **[21,27] without a gap**. The source branch is monotonic in state and forward source indices; increasing requested state requires changing local context towards earlier source indices. Pointwise coverage does not certify that those context changes can happen on a particular clock.

Thirty interior contexts plus two historical endpoint contexts were checked. All **32** pass the initial boundary mismatch/non-silence screen. Enumerating finite rounded-rate filter buckets covers **1,468 wrap/internal rate pairs**, **2,936 sampler evaluations**; maximum initial boundary mismatch is **0.065124024**, below the unchanged raw **0.25** limit. Integer source endpoint phases and the existing quantised sampler make this finite bucket check possible. It is not full rendered-waveform safety, proof of native phase coherence or an audibility threshold.

## One candidate handoff path

Before the timing test, I fixed a conservative policy: a region handoff can occur only at an existing event boundary; the previously read interval must be shared by both contexts; its source endpoint and cumulative event clock are carried unchanged. At most one handoff occurs per event. Every member of the active context must remain eligible throughout the upcoming event.

That **whole-context-for-whole-event condition is a conservative extrapolation of the held-context contract**, not an established physical requirement or native Rockstar rule. An unread member can cause a context to be rejected even while the active interval remains individually valid. It must not be confused with a proven missing-source limitation.

Candidate graph edges require at least two shared interval identities, positive state-band overlap and no more than one backward first-index step for the rising path. The one shortest path uses ascending source-index tie-breaking. It has **28 contexts**: original 93–97, then triples 92–94, 91–93, continuing through 67–69, then original 66–69. The falling path reverses that same path; no alternative graph path is tried after failure. Carrying a shared endpoint introduces no source-position relocation at the context handoff. Subsequent local wraps remain bounded context resets, not arbitrary jumps.

Selected analytical bands along that path, rounded here for readability:

| Context indices | Supported requested-state band |
|---|---|
| 93–97, lower endpoint | 21.000000–21.166734 |
| 92–94 | 21.106644–21.602365 |
| 91–93 | 21.212054–21.779515 |
| 90–92 | 21.324612–21.968139 |
| 89–91 | 21.490211–22.077852 |
| 88–90 | 21.621422–22.195004 |
| 87–89 | 21.711200–22.367363 |
| 86–88 | 21.828620–22.503929 |
| 85–87 | 21.981618–22.597371 |
| 84–86 | 22.114230–22.719584 |
| 83–85 | 22.299328–22.878827 |
| 82–84 | 22.566649–23.016852 |
| 81–83 | 22.844999–23.209505 |
| 80–82 | 23.113874–23.487736 |
| 79–81 | 23.389882–23.777448 |
| 78–80 | 23.726533–24.057297 |
| 77–79 | 23.991446–24.344571 |
| 76–78 | 24.177462–24.694963 |
| 75–77 | 24.454574–24.970689 |
| 74–76 | 24.766391–25.164297 |
| 73–75 | 25.024583–25.452720 |
| 72–74 | 25.255128–25.777264 |
| 71–73 | 25.437387–26.045995 |
| 70–72 | 25.690060–26.285950 |
| 69–71 | 26.004604–26.475648 |
| 68–70 | 26.310638–26.738634 |
| 67–69 | 26.619610–27.000000 |
| 66–69, upper endpoint | 26.880997–27.000000 |

## Fixed trajectory and exact failure

The single predeclared control lasts **15 seconds**: hold 21 at 0–1 s, smooth rise to 27 at 1–7 s, hold 27 at 7–8 s, smooth fall to 21 at 8–14 s, final hold at 14–15 s. Moving segments use `u=z*z*(3-2*z)`. Maximum slope is **1.5 marker-state units/s**, or **0.107143 normalised units/s**, below the earlier 0.25 normalised slope bound. This curve was fixed before the timing audit and was not changed after the failure.

The dry plan retains the cumulative fractional clock: event end is `round(clock + 48000/requestedState)`. Whole-event control ranges include segment extrema, not just a start-point reading. Context handoffs carry the previous original interval endpoint and do not reset clock phase. Successful graph connectivity was deliberately tested separately from timed feasibility.

**First failure:** frame **534,906**, time **11.143875 s**, on the falling segment. The next proposed event ends at frame **536,924** and spans **2,018 frames / 42.041667 ms**.

| Property | Finding |
|---|---|
| Event requested-state range | **23.721482011715–23.784352956375** |
| Current context 78–80 band | **23.726532745098–24.057296938775** |
| Next context 79–81 band | **23.389881764706–23.777448010204** |
| Context overlap | **23.726532745098–23.777448010204**, width **0.050915265105** |
| Event state excursion | **0.062870944660**, larger than that overlap |
| Previous interval | **79**, source endpoint **123259** |
| Shared interval identities | **79 and 80**; cursor compatibility passes |
| Whole-event eligibility | Neither whole context contains the full event range |

The event starts above the next context's upper band and ends below the current context's lower band. Under the chosen boundary-only policy, neither ownership assignment covers the event. No forced reassignment, skipped state, shortened event or source relocation was applied.

**Important limiting detail:** the prospective active interval **80** itself is individually eligible over approximately **23.113874–24.057297**, covering the whole event. The current bank is limited by unread interval 78; the next bank by unread interval 81. Thus the observation falsifies this conservative whole-context/event-boundary policy for the fixed curve, **not every per-active-interval or within-event context contract**. Those alternative semantics remain unproved and were not implemented or tried. Native phase continuity remains unknown.

The prefix contains **273 planned events**, **39 planned context handoffs**, **88 hypothetical local wrap events** and **534,906 planned frames**. Maximum source-state error is **1.998373249%**, planned read rates **0.978016360–1.018970190**. All 39 context handoffs preserve the carried source endpoint. These are diagnostic plan statistics, not playback, waveform validation or a successful audible upward transition.

## Stopped stages and next decision

Gate One is **PARTIAL**: scalar coverage and static overlap connectivity pass; a defensible complete timed path under the single policy is not established. Per the hard gate, no renderer was implemented. No transition WAVs were generated, no A/B difference windows exist, and PCM validity, clipping, rendered continuity, recurrence, overall naturalness and wrap preference are **NOT TESTED**. The would-be full output was 720,000 frames; actual rendered frames are **zero**. There is no pending listening step under this stopped authorisation.

**Exactly one next proposed direction:** a separately authorised **diagnostic-only contract test at the identified overlap**: establish whether context ownership may change within the shared active interval while preserving that interval's source cursor, read rate and event clock, and retaining every original state/rate limit. This should distinguish active-interval validity from unused-context eligibility. It is not permission to add a crossfade, render audio, relax tolerance, alter the trajectory or select another endpoint. No such alternative is implemented here.

## Tools, original tests and performance

Added only `tools/audio/transition-feasibility.mjs`, `tools/Inspect-ExhaustTransition.mjs` and `tests/Test-TransitionFeasibility.mjs`. The module performs interval algebra, finite boundary checks, overlap-graph analysis and one bounded dry event plan. It contains no PCM encoder, audio renderer or playback API. The CLI reads already-extracted private material and writes exactly one `feasibility.json` into a new ignored directory. It pins the original source and historical preview hashes and refuses changed manifests/metadata/references, public paths, linked destinations and existing outputs.

**17 original synthetic tests** cover analytical continuous coverage, a between-integer gap despite valid integer checks, independent legacy inequality checks, missing markers and broken periods, invalid state/order/index bounds, interpolation margins, boundary-only/disjoint overlaps, graph connectivity versus timed failure, fixed rising/falling/hold control and extrema, deterministic read-only plans, legal source/rate/clock properties, missing intermediate coverage, invalid endpoint identity, silence/excessive mismatch/nonfinite rejection and private linked/output guards. Original fixture PCM is generated in memory and contains no Rockstar material. No tests are claimed for an unimplemented renderer, A/B output or listening.

The final full offline runner passed: **17 new feasibility, 19 second-state, 10 outer-wrap, 10 internal-join, 14 model-analysis, 10 recurrence, 18 responsive, 12 cycle, 8 deceleration, 19 stock-audio, 8 extraction/publication guards, 15 ownership, 65 core assertions, 35 drivetrain, 17 parser, 3 diagnostic-analysis, 131 Phase 1, 9 configuration and 8 append expectations**. The roadmap link accounts for the Phase 1 increase from 130; the separate documentation rerun also passed 131. Hosted CI is reported independently. Existing helpers/core/test executables compile; no game adapter is deployed.

Source-loading/audit preparation took **43.3562 ms**; feasibility analysis **9.2334 ms**. Process CPU counters were **31 ms user / 16 ms system**, with coarse attribution; RSS **57,126,912 bytes**, not peak or isolated allocation. The analysis examines 154 intervals, 32 relevant intervals, 32 contexts, 1,468 finite rate pairs and 2,936 interpolation evaluations. Zero context boundary screens failed; one timed handoff condition stopped the plan. Work is bounded by marker/context/rate/event caps. Renderer preparation/render times, output interpolation counts and real-time performance are **NOT TESTED**.

## Preservation, publication and reproduction

The earlier **2,272 files / 43 link targets** and three accepted preview hashes matched. A fresh baseline protects **3,009 existing private files / 63 link targets**, including the twelve original WAVs, accepted/rejected previews and past diagnostics. Verification checks path ancestors and link targets without following fixture links. Existing production sources, telemetry/RPM checks and all earlier renderer defaults remain unchanged. No installed archive was read or re-extracted, so no new archive-hash claim is made. GTA/RPH and relevant game-file tools remained closed.

The public [diagnostic record](../evidence/publication/exhaust-transition-feasibility.json) allowlists derived coverage/region summaries, the precise failure, aggregate plan/performance statistics and hashes. Full event plans, original metadata blobs, stock PCM, private paths and raw logs remain private. No licence or third-party source/binary is added. Publication pattern checks, manual origin review and Git integrity checks are separate from scientific acceptance; previously reviewed service-committer history flags are not an automated all-clear.

Final pre-commit screening covers **eight explicitly allowlisted files**, with **zero index findings**, **one valid JSON document** and **23 valid local documentation links**. Whole-history screening retains exactly the same **four independently reviewed GitHub service-committer flags**, with no new findings. Git integrity passes with harmless unreachable development objects. These checks supplement manual origin/rights review, rather than proving an unrestricted public redistribution licence.

```powershell
node tools/Inspect-ExhaustTransition.mjs .local/audio-reconstruction/decoded-final/source-manifest.json .local/audio-reconstruction/wrap-ablation-final .local/audio-reconstruction/second-state-wrap-final .local/audio-reconstruction/NEW-transition-audit
node --test tests/Test-TransitionFeasibility.mjs
```

The first command requires the existing hash-matching private material, creates only a JSON report and returns a nonzero gate result for PARTIAL. It must not trigger an automatic retry. Public CI uses original synthetic fixtures and no proprietary audio/dependency.

## Weighted progress accounting after the hard stop

Actual original-plan updates were **0 → 10 → 30%**. The hard stop removes implementation (20%), rendered-audio validation (15%) and listening (10%) from applicable work. These **45 original-plan points are not awarded**. Repository/baseline (10%), complete feasibility investigation (20%), applicable tests/preservation (15%) and publication/readback (10%) total **55 applicable points**. After tests, 45/55 applicable points is approximately **82% of the diagnostic scope**; final 100% means all 55 applicable points are verified, not that the full audio experiment ran. The completion report records the final publication/CI status and the stopped stages explicitly.
