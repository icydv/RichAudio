# PLAYABLE-07: bounded multi-state SHV telemetry qualification

1 November 2026. Continues draft PR #76 on `feature/playable-01` from
`54e41391a34c80f3b08fe4a7ab29ebdbd2615f0f`.

**Live result: 1,869 complete real SHV observations returned a changing raw
signal from 0.2 to 1.0. The independent native route is established beyond a
single idle point. Formal multi-state qualification is INCOMPLETE; product
integration and playable development remain BLOCKED.** One separately approved
deployment, launch and operator-armed capture were performed, followed by normal
exit and exact ownership-verified rollback. That approval is consumed.

## Actual authorised result and evidence boundary

The unchanged 378,880-byte ASI described below was explicitly approved, installed
once and launched once through the existing RPH route. Real loader and SHV logs
record its loading, registration, callback execution and later unregistration.
The executable still matches Enhanced `1.0.1158.16`; SHV reports its internal
compatibility enum as `VER_EN_1_0_1158_13`. This is a reported framework bucket,
not a replacement claim about the executable's file version.

The [sanitised live record](../evidence/playable-07-live.json) and
[independent rollback verification](../evidence/playable-07-rollback.json) retain
the actual result and integrity receipts. The original private capture, a stable
hash-matched copy, logs, human statement and independent review remain local.

| Measured fact | Actual result |
| --- | --- |
| Capture end | Operator chord early-stop after 105.2790288 seconds; no retry |
| Completed observations | 1,869 matching declaration/raw-return/final-context triplets |
| Raw result | `0x3E4CCCCD` / `0.20000000298023224` through `0x3F800000` / `1.0`; 1,351 distinct bit patterns |
| Context | Same valid player/ped/Bati/driver throughout; every before/after engine-running raw value was 1 |
| Independent speed | 0..48.4427528 m/s; never converted into an engine value |
| Target starts | Active +0.0000301..105.2366993 seconds; gaps 54.6002..57.9446 ms |
| Target window | Median 0.0011 ms, p95 0.0014 ms, maximum 0.4404 ms; caller/dispatch/copy window, not handler-only timing |
| Errors | No recorded null/SEH/nonfinite/range failure, invalid bracket, running zero, stale gap, writer failure or unpublished outcome |
| Requested markers | START OFF, then chord EARLY STOP OFF; zero ADVANCE events |
| Output | 4,797,335 bytes across the three capture files, within 12 MiB |

After capture, I reported: “idle, stationary revving, significant
acceleration, acceleration redlining doing a wheelie, deceleration and idle
again”. This is qualitative corroboration received later, not synchronised
actuation timestamps or a measured redline/RPM calibration. No engine-off or
verified gear-transition observation is established. No W-down state was sampled;
keyboard intent cannot be substituted for actual throttle or used to explain the
reported revving.

The frozen primary analyser reports **incomplete**, with zero data-quality
failures. Its only mandatory missing criteria are the requested-phase initial
idle, return idle, acceleration/deceleration and associated ratio-trend regions.
Those phase labels never advanced. The OFF text is not evidence of engine off;
all actual running queries were true. I subsequently clarified that I started and stopped recording without advancing the phase labels. This
explains the missing markers; no diagnostic keyboard-control defect is established.

Independent exploratory review, explicitly separate from the unchanged primary
gates, retains useful achieved-context evidence:

- At active +4.0563..7.6055 seconds, speed was zero and ratio exactly the 0.2
  baseline across a 3.54925-second plateau.
- At +90.7022..97.6877 seconds, a 6.9856-second near-stationary running region
  returned to median 0.20000000298, range 0.2..0.214125, with speed at most
  0.08634 m/s. A further baseline region lasted +102.7017..105.2367 seconds.
- An independently rising-speed window at +21.0136..23.9994 seconds had speed
  quarter-median change +12.3852 m/s and ratio change +0.260365. Falling-speed
  examples at +36.0557..38.9856 and +84.0542..86.9838 seconds had ratio decreases
  of 0.127529 and 0.214122 respectively.
- Across all fixed three-second speed-selected bins, 13 had rising speed
  (five ratio rises, four opposite trends, four small changes); nine had falling
  speed (six ratio falls, two opposite trends, one small change). These mixed
  responses are disclosed rather than selecting only favourable examples.
  Gear/load explanations remain unknown; monotonic speed-to-ratio coupling is
  not established or required as an RPM conversion.

This is positive evidence for continuing with the existing native candidate:
it changes, reproduces a stationary baseline and returns toward that baseline
during real manual operation. It is not a completed controlled phase comparison.
The predeclared gates have not been relaxed or repaired by retrospective labels.
No product adapter, audio host, sound suppression, listening test or recording
subsystem was built or run after this result.

The next relevant step is a separately approved phase-marked qualification of
this same candidate, with short operator instructions and a deliberate check
that the first phase advances before continuing the manual sequence.
No new hash/framework investigation is justified by these successful native
returns. Any additional deployment, launch or capture requires new specific
approval. No automatic repeat is authorised.

Normal exit used Alt+F4, the observed quit dialog and its Return confirmation.
No forced termination was used. The exact owned ASI was removed after process
exit. All 11 protected runtime files, four shortcut/settings fingerprints, 37
prior artifact/evidence files and three frozen source inputs match; stock
fallback remains selected. Both probe paths are absent. No game, RPH, product
host, package-bound worker or matching launch wrapper remains.

## Evidence preserved

[PLAYABLE-06](PLAYABLE_06.md) and its [live record](../evidence/playable-06-live.json)
established one credible idle point: `0x3E4CCCCD`, float `0.200000003`, after
20 running-true, same-identity, near-stationary samples over 2.084 seconds.
Its original ASI and captures remain preserved. The earlier PLAYABLE-05 zero
remains inconclusive; it is not retrospectively classified as engine-off.
The RPH failures still have no proven root cause. No RPH investigation was
repeated. The [upstream report draft](UPSTREAM_RPH_ENGINE_TELEMETRY_REPORT.md)
is retained for separately authorised submission through the official channel.

The new diagnostic continues through the installed SHV interface using the same
published `0xF9DDA40BC293A61E` identifier, the same eight SHV imports and the same
25 native identifiers. No framework, SDK binary or runtime is installed. Gear,
actual throttle and control-axis getters are unavailable with that reviewed
identifier set. There are no guessed mappings, memory readers, scans or
NFSgauge/SHVDotNet integration.

## Acquisition and failure contract

The standalone ASI obtains its own local player/ped/vehicle/driver handles in
the registered SHV script context. A complete accepted observation requires
before/after checks for offline, unpaused, nonloading gameplay, living player and Bati,
same driver/identity and finite nonnegative independent speed. Foreground
ownership is required. Engine-running may be false or true and may change;
the previous running-true startup gate is deliberately replaced so engine-off
observations are possible. An operator label never overrides context.

The native's four result bytes are copied inside the invocation wrapper before
any subsequent native or yield. A small `target-return` row is queued before
post-context calls, followed by the complete `observation` row. Thus a later
context stall need not erase a known returned value. These partial returns
cannot qualify the provider without their complete context. A queued
`declared-precontext` records intent before dispatch and is not invocation
proof; it is not synchronously flushed on the script thread.

Bounds are fixed: **120 seconds active**, **2,400 target attempts**, no more
than **20 Hz**, with at least 50 ms from the prior target return to the next
start and no catch-up bursts. A gap or context window above 250 ms ends capture.
Before active capture there is a 300-second waiting deadline from the first
script callback, including loading, operator wait and durable arm acknowledgement.
Active timing starts at recorded `activeStartQpc` after that acknowledgement.
Fixtures may shorten only waiting; proposal preparation rejects that override
in process, user and machine environments.
The dispatch deadline prevents a new target at or after 120 seconds when its
final gate runs. In-flight work and cooperative terminal publication can finish
later; their actual timestamps are retained. This is not a real-time scheduling
or preemption guarantee.

A fixed 128-record SPSC ring transfers POD records to the sole writer thread.
The combined `journal.ndjson`, `timeline.ndjson` and `capture.json` budget is
**12 MiB (12,582,912 bytes)**, timeline rows at most **2,047 bytes**, raw-return
rows at most **511 bytes**. At most three rows per target, bounded phase events
and one terminal not-attempted partial observation are produced, capped at
7,209 timeline records. Queue exhaustion,
writer failure, context loss, invalid timing and detectable native faults stop
future targets. A failed enqueue preserves its known record in immutable
terminal metadata where possible; disk failure can prevent persistence.

Null, detectable SEH, nonfinite and outside-0..1 results terminate with raw
failure details. The 0..1 band is a conservative review heuristic, not an
established SHV quantity contract. Finite zero remains unmodified; zeros with
both engine queries true are flagged and prevent promotion unless explained.
No value is clamped, rescaled, inferred from speed or replaced by another value.

Terminal metadata is published before at most five seconds of short diagnostic
HUD text. No new context or target calls occur after terminal state, and no HUD
calls follow a detectable invocation exception. The no-native/no-I/O watchdog
requests cancellation; it cannot preempt a hung native or blocked filesystem
operation, contain every fatal framework path or guarantee GTA survives. The
module remains process-pinned: rollback follows game exit, with no hot unload.

## Reviewed operator procedure (approval now consumed)

The instructions below preserve the preflight proposal. The actual attempt did
not record the requested phase progression, as documented above; the table is
not a claim that its timings or labels were achieved.

Use one Bati, local player in the driver seat, offline Story Mode, on a clear
route suitable for ordinary manual driving. Keep stock fallback selected. No
RichAudio host is started. Do not change game audio, physics, settings or assets.

1. Before starting, settle stationary and release Ctrl, Shift and Backslash.
   When the diagnostic says ready, press/release **Ctrl+Shift+Backslash** once.
   It starts capture with the requested engine-off phase; no automatic start.
2. During capture, press/release **plain Backslash** once to advance each requested
   phase. Either `VK_OEM_5` or `VK_OEM_102` is accepted. Holding/repeating the key
   does not advance repeatedly. The same chord stops capture early at any point.
3. Follow the table within the shared 120-second budget. Durations are targets,
   not an enforced timetable. Advance past unavailable or unsafe phases and
   report them unobserved. The probe never drives, spawns or controls the Bati.
4. After return-idle, plain Backslash ends capture. A limit or terminal failure
   ends it automatically with no retry or restart. Do not take another capture
   or launch under the same approval.
5. Exit GTA normally. Preserve captures and relevant logs privately; verify the
   owned ASI hash before removing it and recheck protected files/settings.

Keep GTA focused and unpaused during active capture. Advance phases in the HUD;
return to chat to report achieved/unobserved actions after capture has ended.
Alt-tab, pause or a large frame/acquisition gap can terminate the attempt. Do not
try to bypass a stopped gate or repeat arming.

| Requested phase | Suggested time | Independently recorded evidence and limit |
| --- | --- | --- |
| Engine off | up to 10 s | Both engine queries false on the same Bati. If ordinary controls cannot achieve this without changing the installation or leaving the required context, advance and mark unobserved. |
| Idle | 12 s | Engine true and independent speed at most 0.10 m/s, with a stable ratio region. |
| Stationary rev | 12 s | Operator manually requests revving safely; raw W/S notifications are keyboard intent only. A key or ratio change alone cannot prove actual throttle or engine actuation. |
| Acceleration | 20 s | Rising independent speed and engine-running context; ratio response is analysed separately. |
| Gear transitions | 15 s | Operator may report a noticed shift. Actual gear is unavailable, so a ratio drop is not automatically labelled a verified shift. |
| Deceleration | 20 s | Falling independent speed; no speed-derived engine value. |
| Return to idle | 15 s | A second stable stationary running region compared with initial idle. |

Raw W/S event counts, sampled down/known states and latest callback timestamps
are bounded SDK keyboard observations. They include repeats, can coalesce events,
do not establish initial held-key state, and do not observe controller input or
vehicle throttle. Callback timestamps bound callback handling, not physical
hardware actuation. Requested and observed facts remain separate.

The reviewed shortcut fingerprints cover RPH, TrainerV, GTA saved controls and
RichAudio settings. Plain Backslash reuses the previously reviewed diagnostic
key; global bindings and every keyboard layout cannot be guaranteed. Preparation
and the future preflight must recheck those exact files.

## Analysis and promotion criteria

`tools/Analyze-ShvTelemetry.mjs` reads bounded private captures without starting
the game or a device. It checks raw bits/float agreement, context identity,
timing order, sample gaps, limits and complete outcomes. It preserves an explicit
incomplete verdict when a known raw return has no completed post-context.
It reports measurements separately from interpretation and never sets
`providerQualified` or `measuredRPM` true.

Predeclared review heuristics, rather than native physics claims:

- Initial and return idle each contain at least two seconds and ten valid
  stationary running samples. Initial median is within 0.05 of the previous
  0.2 observation; each region's maximum deviation from its median is at most
  0.03, and return median differs from initial by at most 0.03.
- Acceleration and deceleration each span at least two seconds, with respective
  speed changes of at least +2 and -2 m/s between first/last quarter medians.
  Their ratio quarter-median changes are assessed independently against +0.05
  and -0.05, and total running ratio variation must reach 0.10.
- A constant signal under observed activity fails. Unexpected running zeros,
  unreadable/impossible values, context loss and invalid timing prevent promotion.
  Adjacent running changes above 0.35 require explanation and are not assumed
  to be shifts. Missing optional states remain explicitly unobserved.

These are conservative gates for reviewing this experiment. Real engine ratio
can change with load, clutch and shifts; an unmet trend gate calls for analysis
of the captured context rather than inventing a conversion or silently relaxing
criteria. Human review must account for my actual actions and any
unobserved phases before recommending a restricted **normalised Bati engine
operating-state** provider on this exact game/SHV stack. Physical crankshaft RPM,
redline values, every vehicle/build, native handler authenticity and audio
playability do not follow from this test. One idle point is insufficient.

## Offline receipts, installation and rollback

The [compiled artifact receipt](../evidence/playable-07-build.json) records a
378,880-byte `build/playable-07-shv-probe/RichAudio.OperatingState.Shv.asi`, SHA-256
`21302b4c5c5fb99f63b7b25dce2fa973117bfb0246f16745d0782f062fe1a69e`.
The existing Microsoft MSVC 14.44.35207 and Windows SDK 10.0.26100.0 compiled it
with `/W4 /WX`. Static inspection passed AMD64 PE32+, executable DLL entry,
CFG/ASLR/NX, exact eight SHV imports, only the two reviewed User32 foreground
readers, no exports, delay imports or CLR metadata. Source, included headers,
linked libraries and signed Microsoft tool identities are pinned. The previous
37 artifact/receipt/evidence files and protected installation/settings matched
before and after compilation. No compiler or runtime installation was needed.

The [binary fixtures](../evidence/playable-07-fixtures.json) passed **51,703
assertions across 48 cases** on this exact production ASI. They exercise the
real script/keyboard/native ABI against an isolated fake SHV DLL, including raw
storage poisoning, sequenced rise/fall/constant values, engine transitions,
phase requests versus independent motion, stale context, identity/driver loss,
zero/nonfinite/range/null/SEH outcomes, foreground/pause loss and terminal stops.
The raw-return row was independently observed on disk while a later fake context
getter was still blocked. This is fixture evidence, not a live framework result.

One unshortened 120-second fake-framework case made **1,928** target calls. Its
first target started at +0.0041 ms and last at +119,967.5036 ms; actual entry
intervals were 60.1081..64.9215 ms. It stopped on the active deadline, publishing
terminal state at +120,014.5355 ms. The 14.5355 ms cooperative completion delay
is retained explicitly; no exact 120,000 ms end or hard preemption is claimed.
Largest combined private output was **4,955,017 bytes**; largest row **1,631
bytes**, within the fixed budgets. The 2,400 ceiling is checked statically and
against actual counts, not claimed to have been reached.

The validation harness initially imposed an arbitrary minimum of 2,000 targets
for the full-duration case, which did not follow from a maximum-20-Hz contract.
It was corrected to check sustained first/last coverage and actual 50..250 ms
spacing. All preserved outputs were revalidated without another native execution;
original execution and final validation source digests are recorded. The ASI,
fake DLL and host did not change.

The [analysis validation](../evidence/playable-07-analysis.json) passed **30/30
checks**. Actual binary trajectories that are dynamic and correctly ordered
meet the review heuristics; constant/opposite signals and marker-only activity
do not. Negative controls reject missing/contradictory records, failed writer
state, invalid context and clocks, wrong native, unarmed identity and misleading
phase chronology. Even the passing fake trajectory remains unqualified.

The [final preparation record](../evidence/playable-07-offline.json) pins the
exact installation, rollback and multi-state proposal hashes. All 11 protected
files, four reviewed shortcut/settings fingerprints and saved stock fallback
match. All 37 prior artifact/evidence files were rehashed after fixtures. No
owned game, RPH, product host or fixture process remains. Three early path guards
also passed, rejecting game-folder output, output outside the repository and
existing output without writing game files or fabricating successful receipts.

`tools/Prepare-ShvProbe.ps1` requires matching build, full binary
fixture and negative-control analysis receipts, unchanged source hashes and
static PE inspection. It creates proposal JSON only, in a new private directory.

Reproduction uses PowerShell 7, the existing compiler/SDK and Node. Choose new
output names: these tools refuse to overwrite preserved results. Run the builder
with `-OutputRoot <new-build-directory> -PublicEvidencePath
<new-evidence/playable-07-build-suffix.json>`, then the binary fixture runner with
`-BuildReceipt <new-build-directory/build-receipt.json>` and no case filter for
the full matrix. The runner prints its new private `fixture-result.json` path.
Run `node tests/Test-ShvTelemetryAnalysis.mjs --fixture-root <that-directory>
--output <new-.local/playable-07-analysis.json>` and pass both receipts to
`tools/Prepare-ShvProbe.ps1 -BuildReceipt <build-receipt> -FixtureReceipt
<fixture-result> -AnalysisReceipt <analysis-result> -OutputRoot
<new-.local/playable-07-candidate-directory>`. These are offline preparation
commands; none deploys the ASI or launches GTA. Private-capture analysis later
uses `node tools/Analyze-ShvTelemetry.mjs --timeline <timeline.ndjson>
--summary <capture.json> --output <new-.local/playable-07-analysis.json>`.

Prepared local files (relative to the working checkout) are
`.local/playable-07/candidate/installation-manifest.json`,
`rollback-manifest.json`, `multi-state-proposal.json` and
`preparation-receipt.json`. They are proposals with `executed:false` and carry
absolute local ownership paths privately. Public evidence exposes their hashes.

The sole proposed game write is the exact verified
`RichAudio.OperatingState.Shv.asi`, staged with create-new semantics as
`RichAudio.OperatingState.Shv.asi.playable07.pending`, flushed, hash/length
verified and atomically renamed without overwrite. An installation receipt must
establish ownership before launch. Both destinations must initially be absent.
The protected 11-file runtime baseline, four reviewed shortcut/settings files,
stock fallback and no-game/no-host process state must pass again before deployment.

After normal exit, remove only a manifest-listed path with matching ownership
receipt and exact artifact hash. Refuse mismatches or unknown ownership. No
recursive deletion or capture removal is permitted. Recheck all protected
fingerprints, settings and stopped processes. Original recordings, continuous
engine/exhaust histories, 10x exhaust balance, 0.25 common trim, spatial/Doppler/
reflection processing, CPU/GPU paths, gold menu and playable package are untouched.

The later listening milestone remains synchronised RichAudio stereo PCM,
Windows WASAPI loopback mix and vehicle/audio timestamps for automated anomaly
and latency analysis, after a trustworthy provider is integrated and produces
real vehicle sound. This increment implements and runs none of that subsystem.
