# Repository, evidence and release governance

## Current status — 25 October 2026

- **GitHub upload completed:** the audited sanitised history was uploaded to [icydv/RichAudio](https://github.com/icydv/RichAudio). The approved published baseline was `31840d3e91e745c04129463c61b362f22d35573d`; seven historical milestones remain represented. The unsanitised checkout and complete backup are archival only and must never be merged or pushed into this history.
- **Visibility needs owner review:** the GitHub repository API reported **public** visibility during the latest check on 25 October 2026, although it was originally created private. This document does not record an authorised visibility change. Public licensing remains undecided; do not infer permission to distribute third-party binaries, Rockstar assets or proprietary diagnostics.
- **Immediate technical blocker:** the [one-run ProcMon investigation](docs/RPH_IO_FAILURE_INVESTIGATION.md) and [PR #3](https://github.com/icydv/RichAudio/pull/3) identified a GTA Enhanced `dstoragecore.dll` read handle to `RagePluginHookLauncher.log` incompatible with RPH's attempted append (`0x80070020`). RichAudio still has **no in-game telemetry**. The proposed DirectStorageFix/ASI-loader combination remains a reviewed *candidate*, not a tested solution.
- **Residual diagnostic cleanup:** `PROCMON25` remained registered after a supported unload failed; a user-controlled restart and subsequent verification are required before another GTA runtime experiment. Do not forcibly remove diagnostic drivers or override blocked registry actions.
- **Future benchmark:** [Acoustic Benchmark design issue #8](https://github.com/icydv/RichAudio/issues/8) captures controlled flybys, aircraft acoustic-component tests, fixed audio listener, valid A/B procedures and honest performance metrics. It is design-only and does not change the P2-01/P2-02/Phase 3 gates.

The pre-upload narrative below is retained as **historical evidence** and is superseded by this current-status section. PR #2 and PR #3 remain independent, unmerged investigation branches unless their status changes.



Status: 25 October 2026. This governance update preserves the original local repository and development gates. The product vision is defined by the README, architecture and acoustic design; no renderer or FiveM implementation is added here.

## Historical: repository destination and upload hold (superseded)

The GitHub connector and authenticated local CLI both identified **icydv**. The CLI confirmed RichAudio did not exist, then created **[icydv/RichAudio](https://github.com/icydv/RichAudio)** as **private**, with the requested description. `origin` points to that repository. It has **no commits, files, remote branch or releases** while the first push is held. Local branch is `main`. Repository creation used the authenticated CLI because the available connector did not provide repository creation; issue tracking uses the connector.

The initial audit examined all **five pre-existing commits**, **135 unique reachable blobs**, and **1,170,194 blob bytes**. It found **220 personal-directory references in historical blob versions across 32 paths**. Examples include README/setup instructions, deployment manifests/receipts, inspector configuration and validation records. No matched credential pattern, restricted binary extension, PE/ZIP magic or NUL-containing blob was found. The environment summary contains hardware/software models, not a machine serial/hostname; raw diagnostics still require careful manual review. This bounded pattern screening is not proof of absence of secrets or redistribution restrictions.

The history contains private absolute user-directory paths prohibited by the new repository requirement. **Nothing has been pushed.** An ignore rule or new cleanup commit cannot remove prior reachable blobs. All original commit IDs, branches and tags are retained; no reinitialization, rewrite, deletion or force-push occurred. Current new raw runtime journals remain ignored/local, with a portable outcome committed instead.

`node tools/Audit-Repository.mjs --output .local/repository-history-audit.json` performs read-only screening of all reachable history; `--current` screens index blobs only and cannot clear a history hold. Reports list object IDs, relative paths, line numbers and categories without printing matched values. Any finding returns exit code 2. The index/current scan is not a scan of unstaged files. Review all proposed untracked files before staging. Audit again after each relevant change and immediately before the first push.

### Proposed remediation — decision required, no automatic rewrite

1. Preserve the original repository and an offline verified Git bundle containing every ref/commit before any approved remediation. Review the location-only audit report locally; do not upload raw captures, tokens or binaries to an issue.
2. Inventory each private-path field and classify portable research versus machine configuration. Future manifests should be generated locally with reviewed root aliases; changing a frozen manifest also changes its integrity pin and requires a new reviewed plan. Do not silently edit historical receipts.
3. Choose explicitly between retaining the path-containing history in a private remote as an approved exception to the no-private-path rule, or authorizing a reviewed sanitized publication history while preserving the original local history/bundle. The second option changes published commit IDs and conflicts with the present request to preserve all IDs remotely; it cannot be performed under the current instructions. A normal additive sanitization commit alone is insufficient.
4. After the decision, review the resulting reachable history, rights, secrets, remote owner and visibility; push only the approved refs without force. Verify remote commit/tree identity and document any intentionally local-only material. Until then keep the GitHub repository empty.

No credentials are requested or stored in project files. Proprietary RPH/SDK, GTA archives/assets/executables, third-party tool binaries and sound packs remain local. Git LFS is reserved for large project-owned assets and never supplies redistribution permission. Historical aggregate format descriptions and hashes are not an authorization to publish extracted recordings/geometry.

## Branching and issue scope

Keep `main` as the reproducible accepted checkpoint; a failed runtime experiment may be documented there without claiming gameplay readiness. Use focused branches such as `compat/<topic>` or `feature/<topic>` for substantial changes, with a PR describing behavior, evidence and rollback. Do not rewrite milestone commits. Small documentation corrections may be committed directly. Preserve existing branches/tags when eventually pushing.

The immediate issue is [P2-01 startup diagnosis and live telemetry gate](https://github.com/icydv/RichAudio/issues/1). Keep ownership, telemetry, compatibility, source sound, acoustic simulation, perceptual rendering, geometry, performance, FiveM research and regressions as roadmap topics until a concrete experiment justifies an issue. A large speculative backlog or artificial release dates would obscure the current blocker; no milestones are needed yet.

Every meaningful milestone records source changes, compatibility/game hashes, actual tests, failures, evidence and a descriptive commit. Source material and private diagnostics are not attached to PRs. Never label an offline test as an in-game success.

## Automation

`tools/Test-Offline.ps1` reuses Phase 1 fixture/document/write-boundary tests, Node metadata parser tests and framework-independent telemetry core/analyzer/tests. Results and benchmarks go to ignored local storage, leaving historical evidence and fixtures unchanged. It requires Windows .NET Framework/compiler, Git and Node, **no GTA installation, RPH SDK, CodeWalker or extracted assets**. Game-dependent readiness scripts and SDK adapter builds are separate and do not run on hosted CI.

The prepared `.github/workflows/offline.yml` uses one bounded Windows job, read-only contents permission, pinned checkout, no credential persistence, concurrency cancellation and no schedule. It performs syntax/whitespace checks plus the offline suite. No new service is purchased or spending setting changed. No hosted run has occurred while upload is blocked. The audit remains a separate strict first-push gate; passing offline CI does not clear privacy/history findings. There is no C++ build job because no implemented C++ target exists. Add formatting/static analysis or portable acoustic targets when there is real code to validate.

The checkout pin was resolved from the publisher's v6 Git ref on the setup date. Review action updates rather than using an unpinned moving tag. Platform reference: [checkout documentation](https://github.com/actions/checkout), [GitHub Actions limits](https://docs.github.com/en/actions/reference/limits). Job timeouts are a local cost-control choice, not a guarantee of zero charges.

## Licensing and distribution decision

Keep the project private pending source ownership, integration/SDK terms and intended distribution review. **No public open-source license is chosen.** Candidate strategies to compare are proprietary distribution, permissive core with separately reviewed integrations, or a copyleft core where compatible with the intended distribution model. Consider future commercial distribution, contributions, patent terms and FiveM/platform conditions before approval. Recommend deciding the core's license separately from third-party SDK/runtime packaging, after the ownership experiment; neither automatically licenses GTA assets or all adapters.

Maintain a dependency/provenance inventory and notices before distribution; authentic download provenance does not itself grant redistribution rights. No proprietary runtime binary or SDK is uploaded or packaged for others. Eventual releases may link users to official prerequisites and provide original plugin/config plus exact reversible instructions. Public GitHub/GTA5-Mods/website/FiveM distribution remains a later reviewed gate. [GitHub's licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository) is a reference for the later explicit license decision.

Use semantic versions only for clearly defined releases: patch compatible fixes, minor compatible functionality, major breaking changes, with truthful alpha/beta labels. No release version, tag or GitHub Release is created here. Existing hashes remain engineering checkpoints.

## Evidence vocabulary

| Label | Required evidence |
|---|---|
| Aspiration / hypothesis | Desired experience or plausible design, not demonstrated |
| Implemented | Original source exists |
| Built | Named component compiled with recorded tool/dependency versions |
| Offline-tested | Explicit tests passed outside GTA; mocks remain identified |
| In-game verified | Actual named scenario/build passed with live evidence |
| Production/release ready | Installation, rollback, licensing, compatibility, performance/stability and user behavior criteria met |

The immediate milestone is still **P2-01 live integration and telemetry validation**. Enhanced selection is a measured partial success; RPH startup and real source coverage remain blockers. No Phase 3 or FiveM implementation is authorized by this update.
