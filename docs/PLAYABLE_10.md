# PLAYABLE-10: separate launcher and API provenance

**Outcome B: GO for an approval request for one diagnostic-only launch; BLOCKED for live handoff and audio.** The current API runtime cannot be independently authenticated offline. A new isolated plugin can capture the missing operands without approving them or attaching any source. It has not been deployed or executed in RPH/GTA. This increment starts from `49d220866a27697303a9c5b34dcc132ed2bd01be` on `feature/playable-01`.

## Diagnosis and evidence boundary

The old PLAYABLE-09 entry hashes and reads FileVersion from `typeof(Rage.Game).Assembly.Location`, then compares both against the reviewed **launcher** `RAGEPluginHook.exe`. That launcher/API equality was never established. The [actual attempt](PLAYABLE_09_LIVE_RESULT.md) rejected with `actual-rph-runtime-bytes-or-version-unreviewed` before attachment, Open, binding, clock calibration, BEGIN or the journal. Its API operands were not retained. The hash and/or FileVersion failed; which one failed remains unknown. Initial terminal completion/FIFO/queue fields were defaults, not measured failures. This does not invalidate the restricted PLAYABLE-08 Bati signal or establish a framework/native defect.

Read-only inspection established the following. Full paths, inventories and process details stay private; [artifact research](../evidence/playable-10-artifact-research.json) publishes sanitised metadata and receipt digests.

| Artifact | Established identity | Implication |
| --- | --- | --- |
| Installed launcher and retained reviewed copy | 12,237,182 bytes; SHA-256 `73f05b3f7973d4731f4151ae061dd3c991065e8bf3ece51ea1d9ab728b9b42ac`; FileVersion `1.132.1428.17748`; resource OriginalFilename `RagePluginHookLauncher.exe`; Authenticode `NotSigned` | Exact installation identity, not proof of actual loaded API identity. Managed metadata inspection of this opaque launcher is inconclusive. |
| Pinned authentic reference SDK | 219,648 bytes; SHA-256 `5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0`; FileVersion `1.124.1393.17586` | Compilation contract only. |
| Existing official comparison SDK | 248,832 bytes; SHA-256 `1f8a8a88a511d8c6d4aacd196e72b5192970b730f4070606d8bfac63ed722d45`; FileVersion `1.131.1424.17745` | Both SDKs have the same unsigned logical `RagePluginHook, Version=0.0.0.0` identity and define `Rage.Game`, but different bytes/MVIDs. Metadata names and versions cannot authenticate a runtime. Archive entries match the retained SDK files. |
| Known RPH plugin cache | 48 files, 45 readable DLL/temporary PE metadata views, none defining `Rage.Game` | The last PLAYABLE-09 cached artifact is our exact `c97acbcb…` plugin, not the API. Cache membership or timestamps do not confer trust. |

The retained support scan found no readable current API definition; opaque or unreadable files and uninspected locations are not ruled out. No unpacking, decryption, memory scanning, alternative framework installation or download was performed. A packed launcher supplying a distinct extracted/cached API is a **plausible hypothesis**, not an observed relationship. Further broad research is deferred until the actual assembly witness is available.

## Separate contracts and strict diagnostic profile

The new `SHV_PROVENANCE_10` build uses only its entry, bootstrap, standalone provenance core and generated build policy. The launcher expectation contains its reviewed path, bytes, SHA-256 and FileVersion. The API expectation is explicitly **UNREVIEWED**, with null expected path/hash/bytes/version/full-name/MVID. A lease cannot introduce a reviewed runtime identity. The old passive candidate and its rejected policy remain frozen historical evidence; this is not a corrected passive candidate.

The bootstrap accepts exactly 23 bounded fields, with no duplicates, unknown fields, activation opt-ins or linked paths. Its process-bound lease carries the actual PID, kernel process-creation FILETIME and exact caller digest, plus the preserved game/launcher/SHV/loader scope. Production policy pins game `1.0.1158.16`, existing framework files and preserved native producer digest. The preserved ASI is **not** in this candidate's payload. A session string is coordinator context consistency, not independent session authentication or human approval. Equivalent-privilege code remains outside the guarantee.

After a valid lease and installed-scope check, the core observes launcher, caller and the assembly actually supplying `Rage.Game` **before evaluating the provenance result**. It records actual path, bytes, SHA-256, FileVersion, assembly full name, module name/MVID, loaded/file metadata consistency, token/certificate-table availability, process witnesses and capture QPC interval. It records the expected operands, each comparison outcome and a terminal reason. Separate non-authoritative `historical09Comparison` fields expose whether the old API-versus-launcher digest and version comparisons pass, fail or remain unobserved. Those fields are never a new acceptance rule.

Ordinary mutation/path replacement is constrained by pinned file and ancestor handles, reparse refusal, and final file-identity/size/write-time checks spanning hash, version and reflection-only metadata inspection. Hardlink observations retain the bytes but fail closed on linkage. Signature/token presence is recorded as availability only: no Authenticode signature, certificate-chain or revocation verification is claimed. The fixture `Reviewed` policy carrier validates explicitly supplied operand comparisons; evidence-digest syntax itself does not authenticate provenance. The production entry always constructs `Unreviewed`.

One atomic private report is written under `.local/playable-10/runtime-provenance/<session>/runtime-provenance.json`, never overwriting an existing session. The caller receives report size/digest and completion status; a report cannot certify that its caller survived. An otherwise complete production capture terminates `api-runtime-policy-unreviewed`. Source/handoff/audio permission remains false even in an exact-match fixture. The image contains no source module, Open/BEGIN path, gameplay publisher, native invocation, audio lifecycle, recorder or menu implementation. Its only RPH calls are `Game.LogTrivial` and `GameFiber.Sleep`.

Bootstrap, installed-scope and output failures may prevent a completed report. They produce a bounded terminal log when possible; missing output, fatal termination or an unobserved caller outcome is **not** a successful measurement. No observation becomes accepted policy in the same process. A subsequent independently justified provenance review and a separately built/approved passive candidate are required.

## Compiled candidate and offline validation

The authentic pinned SDK and existing Framework64 C# compiler produced the actual x64 diagnostic DLL. No new software was installed. The compiled production artifact was inspected and independently rebuilt for method comparison; it was not executed. Fixture execution uses a separately compiled policy and a minimal test-only CLR RPH facade, not the actual runtime.

| Result | Genuine scope |
| --- | --- |
| 35 cases / 337 assertions | Compiled typed provenance fixtures: separate reviewed launcher/API, exact and forged same-version bytes, unexpected version/path, missing/dynamic/inaccessible location, change/reparse/hardlink controls, process/caller/session mismatch and failed output. |
| 25 profile controls | Actual compiled image isolation, attribute entry/exit targets, all 187 methods inspected, six serialised mutant DLLs rejected; independent authentic-SDK rebuild has zero method differences. |
| 16 entry fixtures / 260 assertions, within those profile controls | Complete source-identical entry/bootstrap/core with explicit fixture policy: rejection and report persistence, invalid lease/opt-ins, output failure, no re-entry overwrite, zero source/gameplay/audio activation. |
| 655 default product methods, zero differences | Default compilation compared with the retained PLAYABLE-09 reference; no production-policy execution. |
| PLAYABLE-09 managed regressions | Composition 13/43, unchanged legacy validator 68/250, adapter 14/63, journal 8/65. Canonical sources/runners remain unchanged; bounded private runner copies redirect only repo/output locations. |

The unchanged native matrix was not rerun: its existing 32-case receipt is retained, and this diagnostic does not link/deploy the ASI. These checks do not prove actual RPH loading, actual API identity, live report completion or audibility. Earlier incomplete checker runs remain private and are described in the final profile receipt; they are not counted as passes.

Exact artifact: **66,560 bytes**, SHA-256 **`cb2555ba00169af86d2728ba545c808a825df0ab04ba08026f1268e02d3caf3a`**. Private build receipt digest: `0b8f884941ef4b9efa84ad2d19a19aeaf863702f3994142a100bd9705c363ea3`; final profile receipt digest: `66381837ed41890aef9a645c25961b4820f277e1e48efc2951528e3d195ab8a7`. See [build](../evidence/playable-10-build.json), [provenance controls](../evidence/playable-10-provenance-controls.json), [profile](../evidence/playable-10-profile.json), [managed regressions](../evidence/playable-10-managed-regressions.json), [preparation guards](../evidence/playable-10-preparation-guards.json), [independent review](../evidence/playable-10-independent-review.json) and [candidate receipt](../evidence/playable-10-candidate.json).

The preparation tool now accepts both absolute and repository-relative receipt paths. Its first absolute-input attempt rejected before writes because a path was incorrectly prefixed; the narrow normalisation fix does not affect the compiled image. Guard results and independent review are recorded separately from compiled-code tests.

## Files and preservation

Every change is an addition. The 723 previously tracked files and 579 pinned PLAYABLE-09 private files remain byte-identical. The renderer, original source assets, 10× exhaust-pressure reference, 0.25 trim, propagation, Doppler, histories, CPU/GPU infrastructure, gold menu, trusted passive composition and original native ASI were not modified. Modification-aware loudness and synchronised PCM/loopback recording remain intact and disabled. Human in-game listening and synchronised audio analysis remain future requirements.

- Implementation: `RphProvenanceEntry.Rph.cs`, `RphProvenanceBootstrap.Rph.cs`, `RphRuntimeProvenance.cs`.
- Build/preparation/validation: `Build-RphRuntimeProvenance.ps1`, `Prepare-RphRuntimeProvenance.ps1`, `Test-RphRuntimeProvenance.ps1`, `Test-RphProvenanceProfile.ps1`.
- Typed fixtures: the six files in `tests/rph-provenance/`.
- Reports: this document, `PLAYABLE_10_LIVE_PROPOSAL.md` and the new `evidence/playable-10-*.json` receipts. Proprietary binaries, private policy/paths, leases and captures are not committed.

The device-free build/validation commands use PowerShell 7 and existing private prerequisites. They create new output directories and never replace old receipts:

```powershell
pwsh -NoProfile -File tools/Build-RphRuntimeProvenance.ps1
pwsh -NoProfile -File tools/Test-RphRuntimeProvenance.ps1
pwsh -NoProfile -File tools/Test-RphProvenanceProfile.ps1 -BuildReceipt <absolute-new-build-receipt>
```

Preparation intentionally admits only the exact reviewed build/profile receipts named above, not an arbitrary rebuild or first-seen digest. Local compiler module identifiers can vary; the rebuild comparison retains all method bodies and initializer content while normalising only the compiler-generated private-implementation module GUID. Local prerequisite/baseline files are required; missing provenance fails closed.

## Remaining blocker and next decision

The independent review finds no offline blocker to this strictly diagnostic proposal, with the documented OS/fatal-failure and same-privilege limitations. The [one-launch proposal](PLAYABLE_10_LIVE_PROPOSAL.md) uses one temporary plugin replacement and process-bound lease, **no ASI**, vehicle action, handoff or audio. It requires fresh exact-artifact approval under user PLAYABLE-10 §8. The installed game remains restored in stock fallback, with all 11 protected files and four settings matching and no owned processes.

Even a complete diagnostic will identify the actual bytes, not authenticate their distribution by itself. Review that witness against defensible framework provenance after shutdown. If provenance still cannot be established, retain BLOCKED rather than substitute filename, version, cache location or the first observed hash. Live SHV-to-RichAudio handoff, listening, loudness and recording remain **BLOCKED**. No upstream report was submitted.
