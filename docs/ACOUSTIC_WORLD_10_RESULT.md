# WORLD-10: prepared audio and my minimal Core API boundary

I have a measured source-preparation improvement and a smaller public-API integration boundary. **I do not yet have genuine Enhanced collision geometry or a qualified standard Core distribution.** Codex implemented and reviewed this increment offline on a separate branch stacked after PR #89 at `8a995c8c8f5e7ab1461af64e756f30eafb7667a3`. Earlier PRs, consumed approvals, private captures and historical endpoint measurements remain intact.

## Processing and continuity

Codex moved PCM validation, waveform loop selection, interval/features and source-time timeline preparation before gameplay readiness. Actual sources still begin on genuine eligibility, with fresh frame-zero phase/RNG/history. Separate authored JIT work renders only throwaway analytic data and discards that PCM. The host waits for readiness before either output sink under the existing five-second startup allowance, with a final producer/ownership/failure check. No PCM queue, credit reserve, block size, fixed output latency, bank, engine/exhaust balance, gain or acoustic coefficient was increased or changed.

Preparation retains at most eight banks and a conservative 64 MiB charged-data budget, with one synchronous startup preparation at a time. Explicit preparation-cap exhaustion reports an unprepared bank and preserves its existing immediate cold constructor; it does not reject an otherwise accepted multi-bank package or evict a prepared source. Only the dedicated budget-error type is caught. Actual validation errors remain fatal; a bank skipped because capacity is full may defer validation until cold activation. That path can still miss the deadline and is outside prepared-path timing claims. This is not background CPU isolation, a total-RSS limit or hard interruption of synchronous work. Prepared activation still checks exact PCM/metadata and copies source-owned hot arrays; arbitrary large private-bank deadline safety remains unqualified.

The [processing report](ACOUSTIC_WORLD_10_PERFORMANCE.md) and [independent evidence review](ACOUSTIC_WORLD_10_EVIDENCE_REVIEW.md) retain repeated fresh-process measurements, partial-core CPU contention, source/input bindings, exact PCM/lifecycle comparisons and every observed miss. My strict deadline remains **10.6667 ms**. Functional tests and passing PCM comparisons are not a real-time deadline guarantee. No private Bati bank, live GTA load, endpoint continuity, physical latency or audibility was tested here.

## Core API and lightweight distribution

I supplied dexyfex's permission for a free open-source API integration and redistribution of unmodified Core with necessary dependencies. Codex preserved my WORLD08/09 research and implemented a separate RichAudio-owned memory adapter. It reuses my existing resource validation/DTO normalization and public `YmapFile`, `YtypFile`, `YbnFile` loaders. A separately executed [independent API review](ACOUSTIC_WORLD_10_API_REVIEW.md) passed **57 original resource controls** against retained research Core and reproduced the same adapter hash. No new Core was built. That establishes neither standard-binary compatibility nor genuine Enhanced geometry.

The intended component is exactly `CodeWalker.Core.dll`, `SharpDX.Mathematics.dll`, `SharpDX.dll` and my adapter, plus applicable notices. The [API/dependency research](WORLD_10_CODEWALKER_API.md) identifies exact measured research references/frameworks, SharpDX MIT terms, CodeWalker attribution and the unresolved binary-wide FBX/third-party obligations. No complete app, unused graphics/audio utility, upstream source, proprietary bootstrap, key or extracted geometry is included by the new packaging route.

My [distribution gate](WORLD_10_DISTRIBUTION.md) blocks before DLL access without an externally pinned independent standard-artifact review. It rejects research markers, unqualified embedded resources, extra dependencies, incomplete named notices and unresolved third-party obligations. Its positive tests use original dummy bytes and simulated reviews only. The new CI route publishes authored test/timing evidence, not the old research Core/source package. Historical research tools remain available separately with their prior limitations.

No authenticated unmodified Enhanced-capable Core-only artifact with qualified proprietary-data status was established. The pinned public API also lacks the exact bounded archive-stream and explicit opaque-memory initialization entrypoints used by my research adaptation. An optional AES argument to the normal loader does not remove its embedded-bootstrap dependency. My permission does not implicitly authorize that material or modified binaries. No new developer contact or repeated permission workflow occurred.

## Genuine-building boundary

My [next prerequisite record](ACOUSTIC_WORLD_10_READ_ONLY_PROPOSAL.md) is deliberately **blocked, unsealed and non-executable**. It records the missing legitimate internal initialization provisioner, exact source/software identities, selected YMAP/YTYP/YBN closure and private native containment. No guessed path, placeholder hash or reused approval is offered as ready for execution.

Once those prerequisites and fresh exact approval exist, the existing provider/cache/SoundMap/solver must prove one real finite collision closure, correct world placement/scale, persistent reuse, actual reflected paths and geometry-dependent PCM. My present admission remains compressed YMAP/YTYP RSC7 v2, YBN v43, at most 128 scene triangles and 128-metre tile extents, with unknown/unsupported content explicit. One valid closure would not establish full base-game, DLC, custom-map or interior coverage. No competing cache, parser, renderer or invented building catalogue was added.

## Local validation and preserved reporting corrections

The complete selected local wrapper passed with the upstream-source/research-native exclusions described above. That full run preceded the final reporting/failure-harness corrections; subsequent targeted checks cover those changes, and hosted CI checks the complete final runner separately. Its [functional evidence](../evidence/acoustic-world-10-functional.json) binds the original result/log and fresh corrected derivatives.

| Local scope | Result |
| --- | --- |
| Inherited Node suites | 838 passed, zero failures/skips; native/PowerShell assertions are additional and separately reported |
| Added WORLD042–10 portable suites | 190 passed, 24 named research-native skips, zero failures |
| Original PE metadata controls | 22 passed |
| Explicit retained-research public API probe | 57 passed; standard binary remains unqualified |
| Post-suite source/processing controls | 19 passed, zero skips, including bounded worker-start/stop failure retention |
| TAP/SPEC/redaction controls | 23 passed |

Counts describe their own scopes and must not be added as a unique test total. The wrapper's first result incorrectly counted zero inherited tests because it parsed only TAP, and its skipped-case name regex missed CRLF endings. A forward-slash path redaction error also affected its local derived artifacts. Independent review then rejected the first corrected derivative because three deeply escaped user paths survived. Codex retained both failed derivatives and the original raw logs/result privately unchanged, fixed known-prefix redaction for arbitrary separator runs, and produced a fresh second corrected derivative. The raw inherited log contains all 838 passing SPEC tests; no missing test was converted into a pass. The final CI runner includes the 23 actual-helper regression controls and publishes only authored test/timing evidence, not private assets or research DLL/source packages. A reporting-control preparation command also failed at PowerShell parse before controls began; that failure is retained separately from the final passing controls.

Independent implementation review is [retained separately](ACOUSTIC_WORLD_10_IMPLEMENTATION_REVIEW.md). Hosted results and terminal artifact checks are recorded in the stacked draft PR. Excluded research-native, unavailable hardware and private-bank cases remain explicit. Native engine/exhaust suppression and natural post-dismount continuation remain separate unresolved work.

Codex performed no installed game-resource or private capture/key access, GTA/desktop-CodeWalker executable inspection, GTA/RPH launch, real endpoint use or recording, game modification, deployment, native suppression or merge. The work stops at my genuine-input boundary.
