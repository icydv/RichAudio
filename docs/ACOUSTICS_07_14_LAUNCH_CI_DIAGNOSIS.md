# RichAudio ACOUSTICS-07.14 — Launch and CI Diagnostic Results

This offline investigation separates an evidenced RPH startup exception from an unrecoverable hosted expiry assertion. No game, RPH or real audio host was launched; no endpoint, installation, approval or sealed runtime was changed.

## Historical launch evidence

The retained session records one sky.launch_app call for the reviewed game-directory RAGEPluginHook.exe, beginning 2026-10-28T23:55:00.416Z and returning at 23:55:14.186Z (reported duration 13.8 seconds): “launched app did not expose a targetable window”. Only the executable path was supplied. Arguments, working directory, elevation/session context and an explicit timeout were not supplied; underlying defaults and actual process context are unproven. Duration is not a timeout setting. The chained window query did not run after the exception. A separate query at 23:55:18.949Z found no game/RPH window; the process/log check returned no text with errors suppressed. Those observations alone establish neither creation nor a crash.

Additional read-only evidence establishes execution and abnormal termination in this window. Application event 1026 (.NET Runtime), at 23:55:03.6469167Z, identifies ragepluginhook.exe, Framework v4.0.30319 and an unhandled System.IO.DirectoryNotFoundException. Its stack includes Directory.GetFiles and Windows.Application.OnStartup. A matching-time local crash dump was written at 23:55:04.243662Z. Bounded, non-executing inspection found the message: “Could not find a part of the path 'C:\Windows\Microsoft.NET\assembly\GAC_64\SlimDX'.” The dump, metadata/hash and raw event remain private; no dump is uploaded.

This demonstrates a startup failure mechanism consistent with a missing SlimDX GAC directory. It does not explain why that directory was unavailable, whether launch context influenced it, or prove a repair. Exact process exit time/code, command-line defaults, working directory and elevation remain unavailable. No matching launcher/WER report was recovered in the bounded 23:53–23:57Z window; absence of a record does not establish that no other evidence exists.

The earlier 07.9 record describes “Visible Explorer RPH activation” at 22:05:07.9886362Z; retained RPH logs beginning 22:06:18.258Z show runtime initialization. That route differs from the later launch_app call. Earlier exact arguments, process working directory and elevation are not recorded. A prior success does not show that repeating either route would now work.

Restoration and the closed approval remain as recorded by 07.13. Its historical report is unchanged; this follow-up adds evidence rather than rewriting that result.

## Future route, subject to separate review and approval

First review the missing SlimDX dependency/environment evidence offline and propose any necessary change separately. Do not install a dependency merely from the dump string. For a future separately authorised deployment, a human can open the reviewed game directory in Explorer and activate the exact reviewed installed RAGEPluginHook.exe. Do not substitute a shortcut with unknown arguments or elevate speculatively. Record the actual method and context.

A visible RPH/game window, corresponding live process and new relevant logs would establish startup progress; stable Story Mode and the bridge's READY/sending OFF state must be established before invoking the prepared host adapter. Game launch and bridge preparation remain outside its timed listening session. Manual launch is supported by the earlier record, but is neither a historical cause nor a guarantee. This task executes none of that route and creates no approval.

## Hosted expiry failure and diagnostic correction

Original run [40791049051](https://github.com/icydv/RichAudio/actions/runs/40791049051) remains failed and was not rerun. Its three none cases passed; domain-1 threw the composite assertion before printing diagnostic values. GitHub reports zero artifacts. The known local 07.13 and attempt evidence directories contain hosted console logs and an earlier local expiry run (23:58Z), not the failed remote JSON pair (~00:01:20Z). No independently preserved exact remote pair was recovered. Consequently the original failed predicate and timing cause remain unknown. Local passing records cannot replace it.

The test layer now prints one bounded, whitelisted EXPIRY_DIAGNOSTIC JSON record before asserting or retaining its file. It names each predicate, preserves sender/receiver counts, terminal stage/code/outcome, signed first/offending ages, unsent-expiry counters/timing, missing record states and child start/exit/kill-request outcomes. Kill requested is distinct from verified exit. Raw exception messages, paths, pipe/endpoint identities and coordinates are excluded. Console output survives file-retention failure. Hosted CI additionally retains only the diagnostic JSON files for seven days using a pinned upload action, including on job failure.

All original acceptance conditions remain: one connection, one attempt, accepted observations, zero rejections, both deliberate stops; baseline/controlled-delay conditions also remain unchanged. No production timestamps, freshness limits, deadlines, retries, warmup or AppDomain behavior changed. The original production components compile with existing test-only delay hooks; no runtime code was edited.

## Declared bounded investigation

Before transport execution, the matrix was one standalone nine-case run, one required local suite and one final hosted candidate suite, each containing none-1/2/3, domain-1/2/3, before, after and late. Only existing 350/900 ms hooks are used. Three synthetic diagnostic failures are exercised focused and as registered suite regressions; they do not run transport.

The initial diagnostic-only regression caught duplicate console emission introduced while relocating the print before retention. That failed outcome is retained privately. After removing the duplicate, all three cases passed their checks: unsuccessful exit preserved, failed predicates and signed ages retained, missing receiver/both JSON explicit, private fields excluded. No transport attempt had run before that correction.

The standalone nine cases all passed once. The required full local suite also passed once, including its nine cases and diagnostic regressions. The final hosted outcome is recorded in publication evidence; no later pass establishes the original failure's cause. Unexpected outcomes are retained without retrying until green. Before final publication verification, the pinned upload action was found to exclude hidden .local files by default. A follow-up changes only include-hidden-files for the same narrowly selected JSON path. The initial hosted run is retained and one additional final-head run is declared for that concrete retention correction, not to obtain a passing transport result. No transport-harness defect or production defect has been demonstrated by the standalone run.

## Preserved scope and remaining blocker

Runtime remains b5143db8c99decef49a8c9fdf1473f0c3db4840f; operator source remains c3f6c81952ceeb63d5db2b1e23378693efabfd02; candidate SHA-256 remains D8E07531B2C80F9F322940A6770B462E7FEDC28DCAF870DFEDA7A13E38981C41. The consumed 07.13 approval remains closed; no host token does not make it reusable.

Before reviewing another supervised attempt, resolve or explicitly assess the concrete SlimDX startup dependency/environment finding through a separate offline review. The original CI cause remains unknown; new diagnostics improve the next failure's evidence and do not repair a demonstrated runtime issue. Any later live attempt requires fresh explicit approval and the unchanged candidate/installation review gates.

ACOUSTICS-07.9 remains incomplete with failed Stop timing; 07.13 remains failed at launch with no listening result; ACOUSTICS-05 + BENCHMARK-01 remains 60%. No merge or inherited-history rewrite is performed. Publication auditing distinguishes clean staged content from four reviewed inherited identity findings already present in the exact requested base.

## Next copy-ready prompt

RichAudio ACOUSTICS-07.15 — Offline RPH Dependency and Launch-Context Review. Start from the published 07.14 draft. Review the retained 07.13 .NET DirectoryNotFoundException and private dump finding for GAC_64/SlimDX against authentic local runtime prerequisites and prior successful Explorer launch evidence. Determine what can be established about the missing dependency and launch context without executing RPH. Present the smallest separately reviewable remedy, provenance, exact affected files and rollback, or state what remains unknown. Do not install, deploy, launch GTA/RPH or any real audio host, access endpoints, play/capture audio, change sealed runtime/operator policy or create approval/tokens. Preserve the closed 07.13 approval, 07.9 failed Stop status and combined milestone at 60%. Do not assume another live attempt is approved.
