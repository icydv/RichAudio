# Sanitised publication history — 25 October 2026

**Prepared for an authorised first upload; no push performed.** This publication copy was rewritten only after explicit permission to sanitise a disposable clone. The original development checkout remains at `bce9a278d8f1f0ff92935ef61886cb6bb2a7fc57`, with its original history and local evidence intact. Never merge that unsanitised ancestry back into this copy.

## Backup and rewrite

A separate full backup contains **9,359 files / 486,062,612 bytes**, including ignored research/runtime material and the complete `.git` directory. Every copied file matched a SHA-256/size manifest. An independently verified all-ref Git bundle contains the complete seven-commit history, one branch (`main`), and no tags. Bundle SHA-256: `719CB10452AA269ADB1C66B63FEABFD3AED8478362AF29FCC157809F34FABE26`. The backup is private local material, never part of the upload.

The disposable checkout was cloned from that bundle without shared object hardlinks. Official **git-filter-repo v2.47.0**, source commit `6f79afc8c90c592a3052e6cc53c2ca8907515bca`, was downloaded to separate local tooling storage; its files matched upstream Git blob hashes. Script SHA-256: `67447413E273FC76809289111748870B6F6072F08B17EFE94863A92D810B7D94`. Its MIT notice remains beside the local tool. [Publisher instructions](https://github.com/newren/git-filter-repo/blob/main/INSTALL.md), [GitHub history-removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

The rewrite used all fetched refs, sensitive-data-removal mode, explicit path exclusions and a blob redaction callback, while disabling empty/degenerate commit pruning. No original repository was used as a rewrite target. No force-push occurred.

## Classification and changes

The initial 224 findings are **line matches in unique historical blob versions**, not 224 distinct paths or secrets:

| Location class | Findings |
|---|---:|
| Generated reports | 184 |
| Documentation | 29 |
| Source/tools | 8 |
| Configuration templates | 2 |
| Test source | 1 |
| Recorded telemetry fixture, filenames, ref names or commit messages | 0 |

They span 32 repository paths. Personal absolute home prefixes became `__USER_HOME__`; the machine's installation prefix became `__GAME_ROOT__`. These are deliberately unresolved reference placeholders. The additional personal author/committer name and email were replaced in every historical commit with `RichAudio Development <noreply@richaudio.invalid>`. Original identities remain only in the private backup; commit dates and messages were retained.

Eleven unnecessary raw session files were removed from all historical versions: prelaunch archive inventories/hash snapshots, deployment/rollback receipts, launch/preflight/prerequisite journals, root baseline, generated-file list, raw events and the host-specific regression report. Their exact paths are in [the preservation manifest](../evidence/publication/history-integrity.json). The first attempt's portable result, executable metadata, binary-version facts and rollback-integrity facts remain, as do the detailed technical reports. Links to removed receipts now identify offline-backup-only records. Research, source, fixtures and meaningful validation outcomes remain represented.

An exact comparison of all seven old/new commit trees verified **547 retained file versions**, including **159 source/test/tool versions**, against the declared redaction/exclusion policy. Parent topology, commit messages, dates and file modes were preserved. [Full commit mapping](../evidence/publication/history-integrity.json) connects every original milestone to its rewritten counterpart. No acoustic engine or telemetry acquisition logic was removed.

Additional review found no prohibited asset/binary or credential-pattern match. Non-unique hardware/software models, versions, resource descriptions and hashes remain where needed to interpret research/performance. Raw logs, dumps, proprietary assets and SDK/runtime binaries are not included. Pattern screening cannot prove all redistribution rights; the project remains private and public licensing is unresolved.

## Current portable-source follow-up

The follow-up commit leaves core acquisition/tracking/serialization code and recorded fixture content unchanged. It separates the existing `CaptureConfig` class into an SDK-independent source file, replaces its personal hardcoded guard paths with the current user's profile and an optional `RICHAUDIO_GAME_ROOT`, and adds nine real-class boundary tests. Public config templates have an empty output path and **fail validation until a real absolute development capture directory is supplied**. They do not expand historical placeholders automatically.

Historical inspector/default paths and frozen deployment manifests are reference records. Their content hashes changed during sanitisation; the original pinned deployment helpers are **not usable as publication-copy installers**. Do not update their pins merely to make them run. Generate and review a fresh machine-local manifest before any future deployment, or use a separately authorised original verified package from private development storage. No game installation is performed here.

`tools/Test-Offline.ps1` now also runs eight authored append/sharing tests, without game resources or proprietary SDKs. Offline results: **17 parser tests, 126 Phase 1 checks, 48 telemetry assertions, 9 configuration assertions, 8 append expectations passed**. The real RPH adapter also compiled against the authentic local SDK, which was referenced outside this checkout and not copied into Git. Adapter SHA-256: `7953B39A8E726980DC30D908844C32D8E7DE2DF6D8F809097A9844B48390B127`. This differs from the old DLL because of the portable configuration refactor; neither version has in-game telemetry validation. SDK-dependent builds and host-dependent readiness scripts remain distinct from the portable offline suite.

## Final upload boundary

The expanded audit checks reachable historical blobs, every commit's metadata and filenames, and every ref name, with identity, personal-path, credential/URL, restricted-binary and machine-identifier screening. An independent storage audit also checks unreachable objects and the old private identity values without putting them in this repository. Git object integrity, all-ref graph integrity, local links and original-checkout preservation are verified before requesting upload approval.

The destination remains **private [icydv/RichAudio](https://github.com/icydv/RichAudio)** and empty. `origin` in this copy points there. The exact final local commit/tree and proposed non-force `main` push are recorded in the local approval manifest after committing. **Explicit approval is still required before the first upload.** Only this sanitised ancestry may be sent; no bundle, original ref, proprietary dependency, capture or dump may accompany it. No hosted CI run or release has occurred.
