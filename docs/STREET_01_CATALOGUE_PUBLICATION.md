# STREET-01: catalogue publication and complete startup rehearsal

My proposal05 attempt is closed and consumed. It reached the normal preparation driver and one metadata initializer, then failed before current nearby geometry validation or consumer acceptance. Codex has now reproduced and corrected the publication mechanism and passed the complete offline startup pathway. Genuine installed-cache qualification still requires a fresh approval.

## The failure mechanism

The failing operation was `File.Open(pending, CreateNew, Write, None)` inside `Write-CatalogAtomicJson`, before any JSON write, flush or atomic rename/replacement. The approved private destination was an archive-cache JSON named by its 64-character fingerprint. Its parent was 158 characters and final path 228 characters; appending the final basename to the pending suffix produced a 270-character temporary path.

Codex retained the failed writer from `26de9ed` and reproduced the same operation and `DirectoryNotFoundException` (`0x80070003`, code 3) with original disposable files. The parent was precreated and existed before and after the call; no process renamed, removed or cleaned it. All paths were absolute children of the declared private root. The same actual writer and layout succeeded in PowerShell 7, and a shorter layout succeeded in Windows PowerShell 5.1. These controls identify expanded temporary-name handling in the legacy catalogue worker as the mechanism, rather than an uninitialised directory or incorrect working directory.

The original run did not instrument parent existence at the exact failing instruction. Its retained parent creation time and source ordering are consistent with the reproduction; the report does not invent a historical race observation. The failed reproduction, exact path relationships, exception/stack and process closure remain private. Public reports use relative paths.

## Production correction

The writer now creates a compact same-directory `.pending-<GUID>` name, reducing the reproduced temporary path to 200 characters. It retains create-new ownership, complete write/flush, no-follow checks and atomic move/replacement. It does not retry or delete the previous valid file. Interrupted owned pending files remain evidence and are never claimed by a later invocation.

The adjacent invalid-cache quarantine had the same reproduced basename-expansion defect and now uses a compact `.invalid-<GUID>.json` sibling, preserving exact rejected bytes. The resolver's duplicate publication function reproduced the same failure in Windows PowerShell 5.1 and now calls the common production writer. A confined cancellation path is checked before serialization, after preparation and before atomic commit. Catalogue and resolver data writes observe it while terminal status remains publishable.

The first complete rehearsal also exposed a real prerequisite failure: a reflected initializer exception could be logged as non-terminating while the helper returned success and the catalogue reported completion. Codex set a local stop-on-error policy inside that helper. The controlled failure now stops the catalogue before any resolver, geometry or consumer work. The initialization route and source/resource bounds are unchanged.

Only these four production files changed: `CatalogLifecycle.psm1`, `CodeWalkerInitialization01.psm1`, `Build-InstalledAcousticCatalog.ps1` and `Resolve-InstalledGameCache.ps1`. The actual normal preparation driver, qualification wrappers, geometry driver, persistent reader, consumer and acoustic algorithms remain unchanged.

## Actual filesystem and complete-path evidence

Real-file checks pass in PowerShell 7 and Windows PowerShell 5.1 for fresh/existing/nested output, pending ownership, exact reopened contents/file identity, atomic replacement, concurrent delete-sharing readers, persistent sharing rejection, early/preparation/pre-commit cancellation, interrupted publication and quarantine. Invalid, external, relative, reparse and non-directory paths reject without corrupting previous valid state. The existing lifecycle assertions retain their byte/count requirements; only the quarantine filename expectation changed.

The new clean-process rehearsal executes:

`actual aggregate wrapper → actual measurement/inner wrapper → actual normal preparation driver → actual catalogue/resolver publishers → actual geometry driver → actual persistent reader → StockGameplay queue/apply adoption`

Only protected initialization and archive/metadata decoding are substituted, using an original marker-gated public-API fixture DLL and inert authored installation/archive bytes. The actual publishers, measurement, drivers, reader and consumer are copied unchanged and pinned. The cache contains an original wall with two triangle surfaces, exact source receipts and a complete current before/after archive hash proof. Success requires actual queue/apply adoption, retained final source/epoch proof and complete closure—not a JSON file's existence.

| Authored fixture measurement | Project working directory | Different working directory |
| --- | --- | --- |
| Complete catalogue first observed from outer dispatch | 5.405s | 5.320s |
| Actual consumer acceptance from measurement body entry | 9.827s | 9.806s |
| Consumer receipt first observed from outer dispatch | 11.348s | 11.318s |
| Inclusive aggregate Job peak | 580,673,536 bytes | 581,849,088 bytes |
| Catalogue stage Job peak | 214,466,560 bytes | 214,515,712 bytes |
| Reader worker maximum heap / external memory | 9,778,800 / 3,986,105 bytes | 9,596,416 / 3,986,105 bytes |
| Final local readiness / broader completion | Both true | Both true |
| Nonempty adoption / revocation | Two surfaces / none | Two surfaces / none |

The outer observations use 20 ms polling and different origins from the actual consumer event; they must not be subtracted across clocks or treated as exact commit times. Harness Node RSS, worker heap and worker external memory are retained separately. These are fixture measurements, not GTA installation performance.

Missing or stale startup epochs admit no nonempty scene; wrong game identity or catalogue digest fails explicitly. A controlled initializer exception produces an accurate catalogue terminal failure with zero acceptance. Every final Job and reader joins, and scoped OS probes find zero remaining fixture processes. Successful paths invoke the initializer twice sequentially—catalogue then resolver—with maximum concurrency one by actual stage ordering. This is not a claim of one total initializer invocation.

The first rehearsal's real initializer-propagation failure remains retained. A later fixture assertion mishandled line-wrapped CLIXML; Codex normalized its error records while preserving the exact expected reason and stage/zero-acceptance assertions. Final source-bound results remain separate from both failures. No assertion, timeout or acceptance condition was weakened to hide them, and no historical performance matrix was rerun.

## Fresh genuine qualification

Proposal06 is prepared separately from consumed proposals04/05. It retains the named installation, existing cache, retained offline pose, actual normal path, zero geometry decoding/PCM, 3 GiB preparation and 4 GiB aggregate limits, 1,800-second work budget and bounded cleanup. Its source pins incorporate these four production corrections; wrapper and proposal identities remain separate. Its operator procedure explicitly describes one concurrent metadata initializer with up to two sequential catalogue/resolver invocations, matching the unchanged normal stage ordering.

Its private template is `.local/street01-normal-readiness01/proposal06/qualification-template.json`, identity `street01-normal-proposal06-7a2cb41b364d440caa977627c4ee106a`, SHA256 `124d6363f23f18c9cf01cf606d36e3b03413bd1cdb24af9648845673e13cbbcd`. It remains disabled and requires a new explicit approval; the original consumed approvals are not reused.

Codex has not executed proposal06 against genuine resources. My historical cache and all previous evidence remain untouched. Passive candidate04 remains byte-for-byte unchanged and unexecuted. No installed-resource read/hash, game launch, deployment, endpoint, recording, native muting, quarantine change or merge occurred during this repair. Independent source, reproduction, complete-chain and successor reviews are retained privately with the exact proposal identity and digest.
